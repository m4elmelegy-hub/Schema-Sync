import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, suppliersTable, transactionsTable, safesTable, purchasesTable, purchaseReturnsTable } from "@workspace/db";
import {
  GetSuppliersResponse,
  CreateSupplierBody,
  UpdateSupplierParams,
  UpdateSupplierBody,
  UpdateSupplierResponse,
  DeleteSupplierParams,
  DeleteSupplierResponse,
  CreateSupplierPaymentParams,
  CreateSupplierPaymentBody,
  CreateSupplierPaymentResponse,
} from "@workspace/api-zod";
import { wrap, httpError } from "../lib/async-handler";

const router: IRouter = Router();

function formatSupplier(s: typeof suppliersTable.$inferSelect) {
  return {
    ...s,
    balance: Number(s.balance),
    created_at: s.created_at.toISOString(),
  };
}

router.get("/suppliers", wrap(async (_req, res) => {
  const suppliers = await db.select().from(suppliersTable).orderBy(suppliersTable.name);
  res.json(GetSuppliersResponse.parse(suppliers.map(formatSupplier)));
}));

router.post("/suppliers", wrap(async (req, res) => {
  const parsed = CreateSupplierBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [supplier] = await db.insert(suppliersTable).values({
    name: parsed.data.name,
    phone: parsed.data.phone ?? null,
    balance: String(parsed.data.balance ?? 0),
  }).returning();
  res.status(201).json(formatSupplier(supplier));
}));

router.put("/suppliers/:id", wrap(async (req, res) => {
  const params = UpdateSupplierParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateSupplierBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [supplier] = await db.update(suppliersTable).set({
    name: parsed.data.name,
    phone: parsed.data.phone ?? null,
    balance: parsed.data.balance !== undefined ? String(parsed.data.balance) : undefined,
  }).where(eq(suppliersTable.id, params.data.id)).returning();
  if (!supplier) {
    res.status(404).json({ error: "Supplier not found" });
    return;
  }
  res.json(UpdateSupplierResponse.parse(formatSupplier(supplier)));
}));

router.delete("/suppliers/:id", wrap(async (req, res) => {
  const params = DeleteSupplierParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(suppliersTable).where(eq(suppliersTable.id, params.data.id));
  res.json(DeleteSupplierResponse.parse({ success: true, message: "Supplier deleted" }));
}));

// ─── سداد مستحقات المورد ────────────────────────────────────────────────────
router.post("/suppliers/:id/payment", wrap(async (req, res) => {
  const params = CreateSupplierPaymentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateSupplierPaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { amount, safe_id, description } = parsed.data;

  const updated = await db.transaction(async (tx) => {
    const [supplier] = await tx.select().from(suppliersTable).where(eq(suppliersTable.id, params.data.id));
    if (!supplier) throw httpError(404, "المورد غير موجود");

    const [safe] = await tx.select().from(safesTable).where(eq(safesTable.id, safe_id));
    if (!safe) throw httpError(400, "الخزينة غير موجودة");
    if (Number(safe.balance) < amount) {
      throw httpError(400, `رصيد الخزينة "${safe.name}" غير كافٍ (${Number(safe.balance).toFixed(2)} ج.م)`);
    }

    await tx.update(safesTable)
      .set({ balance: String(Number(safe.balance) - amount) })
      .where(eq(safesTable.id, safe.id));

    const newSupplierBalance = Math.max(0, Number(supplier.balance) - amount);
    const [updatedSupplier] = await tx.update(suppliersTable)
      .set({ balance: String(newSupplierBalance) })
      .where(eq(suppliersTable.id, params.data.id))
      .returning();

    const txDate = new Date().toISOString().split("T")[0];
    await tx.insert(transactionsTable).values({
      type: "supplier_payment",
      reference_type: "supplier_payment",
      reference_id: params.data.id,
      safe_id: safe.id,
      safe_name: safe.name,
      amount: String(amount),
      direction: "out",
      description: description ?? `سداد مورد — ${supplier.name}`,
      date: txDate,
    });

    return updatedSupplier;
  });

  res.json(CreateSupplierPaymentResponse.parse(formatSupplier(updated)));
}));

// ─── كشف حساب المورد ──────────────────────────────────────────────────────────
router.get("/suppliers/:id/statement", wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, id));
  if (!supplier) { res.status(404).json({ error: "المورد غير موجود" }); return; }

  const purchases = await db.select().from(purchasesTable)
    .where(eq(purchasesTable.supplier_id, id))
    .orderBy(desc(purchasesTable.created_at));

  const purchaseReturns = await db.select().from(purchaseReturnsTable)
    .where(eq(purchaseReturnsTable.customer_id, id))
    .orderBy(desc(purchaseReturnsTable.created_at));

  const payments = await db.select().from(transactionsTable)
    .where(eq(transactionsTable.reference_type, "supplier_payment"))
    .orderBy(desc(transactionsTable.created_at));
  const supplierPayments = payments.filter(p => p.reference_id === id);

  const openingEntries = await db.select().from(transactionsTable)
    .where(eq(transactionsTable.reference_type, "supplier_opening"))
    .orderBy(desc(transactionsTable.created_at));
  const supplierOpening = openingEntries.filter(e => e.reference_id === id);

  type StatRow = {
    date: string;
    type: string;
    description: string;
    debit: number;
    credit: number;
    reference_no?: string | null;
  };

  const rows: StatRow[] = [];

  for (const p of supplierOpening) {
    rows.push({ date: p.date ?? p.created_at.toISOString().split("T")[0], type: "opening_balance", description: "رصيد أول المدة", debit: 0, credit: Number(p.amount) });
  }
  for (const p of purchases) {
    rows.push({ date: p.date ?? p.created_at.toISOString().split("T")[0], type: "purchase", description: `فاتورة شراء ${p.invoice_no ?? ""}`, debit: 0, credit: Number(p.total_amount), reference_no: p.invoice_no });
  }
  for (const r of purchaseReturns) {
    rows.push({ date: r.date ?? r.created_at.toISOString().split("T")[0], type: "purchase_return", description: `مرتجع مشتريات ${r.return_no}`, debit: Number(r.total_amount), credit: 0, reference_no: r.return_no });
  }
  for (const p of supplierPayments) {
    rows.push({ date: p.date ?? p.created_at.toISOString().split("T")[0], type: "payment", description: p.description ?? `سداد للمورد`, debit: Number(p.amount), credit: 0 });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));

  let runningBalance = 0;
  const statement = rows.map(row => {
    runningBalance += row.credit - row.debit;
    return { ...row, balance: Math.round(runningBalance * 100) / 100 };
  });

  res.json({ supplier: formatSupplier(supplier), statement, closing_balance: Math.round(runningBalance * 100) / 100 });
}));

export default router;
