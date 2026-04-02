/**
 * suppliers.ts — Compatibility shim
 * الموردون انتقلوا إلى جدول العملاء (customers مع is_supplier = true)
 * جميع نقاط نهاية /api/suppliers تستخدم customersTable الآن
 */
import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, customersTable, transactionsTable, purchasesTable, purchaseReturnsTable } from "@workspace/db";
import { wrap } from "../lib/async-handler";
import { authenticate } from "../middleware/auth";

const router: IRouter = Router();

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase()
    .replace(/أ|إ|آ/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

function formatSupplier(c: typeof customersTable.$inferSelect, ledgerBalance?: number) {
  return {
    id: c.id,
    name: c.name,
    supplier_code: c.customer_code ?? null,
    phone: c.phone ?? null,
    balance: Math.round((ledgerBalance ?? Number(c.balance)) * 100) / 100,
    account_id: c.account_id ?? null,
    created_at: c.created_at.toISOString(),
    is_supplier: true,
  };
}

router.get("/suppliers", authenticate, wrap(async (_req, res) => {
  const rows = await db.execute(sql.raw(`
    SELECT
      c.id, c.name, c.customer_code AS supplier_code, c.phone, c.balance AS stored_balance,
      c.account_id, c.created_at,
      COALESCE(SUM(CAST(jel.credit AS FLOAT8)), 0)
    - COALESCE(SUM(CAST(jel.debit  AS FLOAT8)), 0) AS ledger_balance
    FROM customers c
    LEFT JOIN journal_entry_lines jel ON jel.account_id = c.account_id
    LEFT JOIN journal_entries je ON je.id = jel.entry_id AND je.status = 'posted'
    WHERE c.is_supplier = true
    GROUP BY c.id, c.name, c.customer_code, c.phone, c.balance, c.account_id, c.created_at
    ORDER BY c.customer_code
  `));
  const suppliers = (rows.rows as any[]).map(r => ({
    id: Number(r.id),
    name: String(r.name),
    supplier_code: r.supplier_code ?? null,
    phone: r.phone ?? null,
    balance: Math.round(Number(r.ledger_balance ?? r.stored_balance) * 100) / 100,
    account_id: r.account_id ? Number(r.account_id) : null,
    created_at: r.created_at,
    is_supplier: true,
  }));
  res.json(suppliers);
}));

router.get("/suppliers/:id", authenticate, wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }
  const [c] = await db.select().from(customersTable).where(eq(customersTable.id, id));
  if (!c || !c.is_supplier) { res.status(404).json({ error: "المورد غير موجود" }); return; }
  res.json(formatSupplier(c));
}));

router.post("/suppliers", authenticate, wrap(async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  if (!name) { res.status(400).json({ error: "اسم المورد مطلوب" }); return; }

  const normalized = normalizeName(name);
  const existing = await db.select({ id: customersTable.id })
    .from(customersTable).where(eq(customersTable.normalized_name, normalized));
  if (existing.length > 0) {
    await db.update(customersTable).set({ is_supplier: true }).where(eq(customersTable.id, existing[0].id));
    const [updated] = await db.select().from(customersTable).where(eq(customersTable.id, existing[0].id));
    res.status(201).json(formatSupplier(updated));
    return;
  }

  const codeRes = await db.execute(sql.raw(`SELECT MAX(customer_code) AS max_code FROM customers`));
  const lastCode = String((codeRes.rows[0] as any)?.max_code ?? "C0000");
  const num = parseInt(lastCode.replace(/\D/g, "") ?? "0") + 1;
  const newCode = `C${String(num).padStart(4, "0")}`;

  const [c] = await db.insert(customersTable).values({
    name,
    customer_code: newCode,
    normalized_name: normalized,
    phone: body.phone ? String(body.phone) : null,
    balance: "0",
    is_supplier: true,
  }).returning();
  res.status(201).json(formatSupplier(c));
}));

router.put("/suppliers/:id", authenticate, wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }
  const body = req.body as Record<string, unknown>;
  const [before] = await db.select().from(customersTable).where(eq(customersTable.id, id));
  if (!before || !before.is_supplier) { res.status(404).json({ error: "المورد غير موجود" }); return; }
  const name = body.name ? String(body.name).trim() : before.name;
  const [updated] = await db.update(customersTable).set({
    name,
    normalized_name: normalizeName(name),
    phone: body.phone !== undefined ? String(body.phone) : before.phone,
  }).where(eq(customersTable.id, id)).returning();
  res.json(formatSupplier(updated));
}));

router.delete("/suppliers/:id", authenticate, wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }
  const [c] = await db.select().from(customersTable).where(eq(customersTable.id, id));
  if (!c || !c.is_supplier) { res.status(404).json({ error: "المورد غير موجود" }); return; }
  const hasPurchases = await db.select({ id: purchasesTable.id }).from(purchasesTable)
    .where(eq(purchasesTable.customer_id, id)).limit(1);
  if (hasPurchases.length > 0) {
    res.status(409).json({ error: "لا يمكن حذف مورد له فواتير شراء" }); return;
  }
  await db.update(customersTable).set({ is_supplier: false }).where(eq(customersTable.id, id));
  res.json({ success: true });
}));

router.post("/suppliers/:id/payment", authenticate, wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }
  const { amount, safe_id, date, notes } = req.body;
  if (!amount || !safe_id) { res.status(400).json({ error: "المبلغ والخزينة مطلوبان" }); return; }
  const [c] = await db.select().from(customersTable).where(eq(customersTable.id, id));
  if (!c || !c.is_supplier) { res.status(404).json({ error: "المورد غير موجود" }); return; }
  const amt = Number(amount);
  await db.insert(transactionsTable).values({
    type: "supplier_payment",
    reference_type: "supplier_payment",
    reference_id: id,
    customer_id: id,
    customer_name: c.name,
    amount: String(amt),
    direction: "out",
    safe_id: Number(safe_id),
    description: notes ?? `سداد للمورد ${c.name}`,
    date: date ?? new Date().toISOString().split("T")[0],
  });
  await db.update(customersTable)
    .set({ balance: String(Number(c.balance) - amt) })
    .where(eq(customersTable.id, id));
  res.status(201).json({ success: true, supplier_id: id, amount: amt });
}));

router.get("/suppliers/:id/statement", authenticate, wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }
  const [c] = await db.select().from(customersTable).where(eq(customersTable.id, id));
  if (!c) { res.status(404).json({ error: "المورد غير موجود" }); return; }
  const purchases = await db.select().from(purchasesTable)
    .where(eq(purchasesTable.customer_id, id)).orderBy(desc(purchasesTable.created_at));
  const purchaseRets = await db.select().from(purchaseReturnsTable)
    .where(eq(purchaseReturnsTable.customer_id, id)).orderBy(desc(purchaseReturnsTable.created_at));
  const payments = await db.select().from(transactionsTable)
    .where(eq(transactionsTable.reference_type, "supplier_payment"))
    .orderBy(desc(transactionsTable.created_at));
  const statement = [
    ...purchases.map(p => ({ type: "purchase", date: p.date, invoice_no: p.invoice_no, amount: Number(p.total_amount) })),
    ...purchaseRets.map(r => ({ type: "purchase_return", date: r.date, invoice_no: r.return_no, amount: Number(r.total_amount) })),
    ...payments.filter(p => p.reference_id === id).map(p => ({ type: "payment", date: p.date, invoice_no: null, amount: Number(p.amount) })),
  ].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  res.json({ supplier: formatSupplier(c), statement });
}));

export default router;
