import { Router, type IRouter } from "express";
import { eq, desc, max } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db, suppliersTable, transactionsTable, safesTable, purchasesTable, purchaseReturnsTable } from "@workspace/db";
import { writeAuditLog } from "../lib/audit-log";
import { getSupplierLedgerBalance } from "../lib/ledger-balance";
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
import { getOrCreateSupplierAccount } from "../lib/auto-account";

const router: IRouter = Router();

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase()
    .replace(/أ|إ|آ/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

function formatSupplier(s: typeof suppliersTable.$inferSelect, ledgerBalance?: number) {
  return {
    ...s,
    balance: ledgerBalance !== undefined ? ledgerBalance : Number(s.balance),
    created_at: s.created_at.toISOString(),
  };
}

async function getNextSupplierCode(): Promise<number> {
  const result = await db.select({ maxCode: max(suppliersTable.supplier_code) }).from(suppliersTable);
  const currentMax = result[0]?.maxCode ?? 0;
  return Math.max(currentMax ?? 0, 2000) + 1;
}

router.get("/suppliers", wrap(async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT
      s.id, s.name, s.supplier_code, s.phone, s.balance AS stored_balance,
      s.linked_customer_id, s.account_id, s.normalized_name,
      s.created_at,
      COALESCE(SUM(CAST(jel.credit AS FLOAT8)), 0)
    - COALESCE(SUM(CAST(jel.debit  AS FLOAT8)), 0) AS ledger_balance
    FROM suppliers s
    LEFT JOIN journal_entry_lines jel ON jel.account_id = s.account_id
    LEFT JOIN journal_entries je ON je.id = jel.entry_id AND je.status = 'posted'
    GROUP BY s.id, s.name, s.supplier_code, s.phone, s.balance,
             s.linked_customer_id, s.account_id, s.normalized_name, s.created_at
    ORDER BY s.supplier_code
  `);
  const suppliers = (rows.rows as any[]).map(r => ({
    id: r.id,
    name: r.name,
    supplier_code: r.supplier_code,
    phone: r.phone,
    balance: Math.round(Number(r.ledger_balance) * 100) / 100,
    linked_customer_id: r.linked_customer_id,
    account_id: r.account_id,
    normalized_name: r.normalized_name,
    created_at: new Date(r.created_at).toISOString(),
  }));
  res.json(GetSuppliersResponse.parse(suppliers));
}));

router.post("/suppliers", wrap(async (req, res) => {
  const parsed = CreateSupplierBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const normalized = normalizeName(parsed.data.name);

  // Duplicate name check
  const existing = await db.select({ id: suppliersTable.id, name: suppliersTable.name })
    .from(suppliersTable)
    .where(eq(suppliersTable.normalized_name, normalized));
  if (existing.length > 0) {
    res.status(400).json({ error: `يوجد مورد بنفس الاسم بالفعل: "${existing[0].name}"` });
    return;
  }

  const newCode = await getNextSupplierCode();

  const [supplier] = await db.insert(suppliersTable).values({
    name: parsed.data.name.trim(),
    supplier_code: newCode,
    normalized_name: normalized,
    phone: parsed.data.phone ?? null,
    balance: String(parsed.data.balance ?? 0),
    linked_customer_id: parsed.data.linked_customer_id ?? null,
  }).returning();

  const acct = await getOrCreateSupplierAccount(newCode, parsed.data.name.trim());
  const [updated] = await db.update(suppliersTable)
    .set({ account_id: acct.id })
    .where(eq(suppliersTable.id, supplier.id))
    .returning();

  void writeAuditLog({
    action: "create",
    record_type: "supplier",
    record_id: updated.id,
    new_value: formatSupplier(updated),
    user: req.user ? { id: req.user.id, username: req.user.username } : null,
  });

  res.status(201).json(formatSupplier(updated));
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

  const normalized = normalizeName(parsed.data.name);

  // Duplicate check excluding self
  const existing = await db.select({ id: suppliersTable.id, name: suppliersTable.name })
    .from(suppliersTable)
    .where(eq(suppliersTable.normalized_name, normalized));
  const conflict = existing.find(e => e.id !== params.data.id);
  if (conflict) {
    res.status(400).json({ error: `يوجد مورد بنفس الاسم بالفعل: "${conflict.name}"` });
    return;
  }

  const [before] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, params.data.id));

  const [supplier] = await db.update(suppliersTable).set({
    name: parsed.data.name.trim(),
    normalized_name: normalized,
    phone: parsed.data.phone ?? null,
    balance: parsed.data.balance !== undefined ? String(parsed.data.balance) : undefined,
    linked_customer_id: parsed.data.linked_customer_id !== undefined ? (parsed.data.linked_customer_id ?? null) : undefined,
  }).where(eq(suppliersTable.id, params.data.id)).returning();
  if (!supplier) {
    res.status(404).json({ error: "Supplier not found" });
    return;
  }

  void writeAuditLog({
    action: "update",
    record_type: "supplier",
    record_id: supplier.id,
    old_value: before ? formatSupplier(before) : null,
    new_value: formatSupplier(supplier),
    user: req.user ? { id: req.user.id, username: req.user.username } : null,
  });

  res.json(UpdateSupplierResponse.parse(formatSupplier(supplier)));
}));

router.delete("/suppliers/:id", wrap(async (req, res) => {
  const params = DeleteSupplierParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [before] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, params.data.id));
  await db.delete(suppliersTable).where(eq(suppliersTable.id, params.data.id));

  void writeAuditLog({
    action: "delete",
    record_type: "supplier",
    record_id: params.data.id,
    old_value: before ? formatSupplier(before) : null,
    new_value: null,
    user: req.user ? { id: req.user.id, username: req.user.username } : null,
  });

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

  const ledgerBal = await getSupplierLedgerBalance(updated.account_id);
  res.json(CreateSupplierPaymentResponse.parse(formatSupplier(updated, ledgerBal)));
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
