import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, depositVouchersTable, safesTable, customersTable, transactionsTable, accountsTable } from "@workspace/db";

import { wrap, httpError } from "../lib/async-handler";
import { getOrCreateSafeAccount, createAutoJournalEntry, type AccountRef } from "../lib/auto-account";

const router: IRouter = Router();

function fmt(v: typeof depositVouchersTable.$inferSelect) {
  return { ...v, amount: Number(v.amount), created_at: v.created_at.toISOString() };
}

router.get("/deposit-vouchers", wrap(async (_req, res) => {
  const items = await db.select().from(depositVouchersTable).orderBy(desc(depositVouchersTable.created_at));
  res.json(items.map(fmt));
}));

router.post("/deposit-vouchers", wrap(async (req, res) => {
  const { safe_id, amount, customer_id, customer_name, source, notes, date } = req.body;
  if (!safe_id || !amount) { res.status(400).json({ error: "البيانات غير مكتملة" }); return; }
  const amt = Number(amount);
  if (isNaN(amt) || amt <= 0) { res.status(400).json({ error: "المبلغ غير صحيح" }); return; }

  const voucher = await db.transaction(async (tx) => {
    // 1. الخزينة ترتفع
    const [safe] = await tx.select().from(safesTable).where(eq(safesTable.id, parseInt(safe_id)));
    if (!safe) throw httpError(400, "الخزينة غير موجودة");
    await tx.update(safesTable).set({ balance: String(Number(safe.balance) + amt) }).where(eq(safesTable.id, safe.id));

    // 2. إذا كان العميل محدداً: رصيده ينزل (تحصيل)
    let custId: number | null = null;
    let custName: string | null = null;
    if (customer_id) {
      const [cust] = await tx.select().from(customersTable).where(eq(customersTable.id, parseInt(customer_id)));
      if (cust) {
        custId = cust.id;
        custName = cust.name;
        const newBalance = Math.max(0, Number(cust.balance) - amt);
        await tx.update(customersTable).set({ balance: String(newBalance) }).where(eq(customersTable.id, cust.id));
      }
    }

    // 3. إنشاء سند التوريد (posting_status = 'draft' بالافتراضي)
    const voucher_no = `DEP-${Date.now()}`;
    const [v] = await tx.insert(depositVouchersTable).values({
      voucher_no,
      date: date ?? new Date().toISOString().split("T")[0],
      customer_id: custId,
      customer_name: custName ?? (customer_name || null),
      safe_id: safe.id,
      safe_name: safe.name,
      amount: String(amt),
      source: source ?? null,
      notes: notes ?? null,
    }).returning();

    // 4. الحركة المالية
    const descr = custName
      ? `سند توريد ${voucher_no} — ${custName}`
      : `سند توريد ${voucher_no}${source ? ` — ${source}` : ""}`;

    await tx.insert(transactionsTable).values({
      type: "receipt",
      reference_type: "deposit_voucher",
      reference_id: v.id,
      safe_id: safe.id,
      safe_name: safe.name,
      customer_id: custId,
      customer_name: custName,
      amount: String(amt),
      direction: "in",
      description: descr,
      date: date ?? new Date().toISOString().split("T")[0],
    });

    return v;
  });

  // القيد المحاسبي يُنشأ عند الترحيل (POST /deposit-vouchers/:id/post)
  res.status(201).json(fmt(voucher));
}));

/* ── مساعد: جلب حساب العميل ────────────────────────────────────────────── */
async function getVoucherCustomerAcct(customerId: number | null): Promise<AccountRef | null> {
  if (!customerId) return null;
  const [cust] = await db.select({ account_id: customersTable.account_id, name: customersTable.name })
    .from(customersTable).where(eq(customersTable.id, customerId));
  if (!cust?.account_id) return null;
  const [acctRow] = await db.select({ id: accountsTable.id, code: accountsTable.code, name: accountsTable.name })
    .from(accountsTable).where(eq(accountsTable.id, cust.account_id));
  return acctRow ?? null;
}

/* ── ترحيل سند التوريد (draft → posted) ────────────────────────────────── */
router.post("/deposit-vouchers/:id/post", wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) throw httpError(400, "معرّف غير صحيح");

  const [v] = await db.select().from(depositVouchersTable).where(eq(depositVouchersTable.id, id));
  if (!v) throw httpError(404, "سند التوريد غير موجود");
  if (v.posting_status === "posted")    throw httpError(400, "السند مرحَّل بالفعل");
  if (v.posting_status === "cancelled") throw httpError(400, "لا يمكن ترحيل سند ملغى");

  const custAcct = await getVoucherCustomerAcct(v.customer_id);
  if (custAcct) {
    const safeAcct = await getOrCreateSafeAccount(v.safe_id, v.safe_name);
    // سند توريد: مدين خزينة × دائن عميل (العميل سدّد)
    await createAutoJournalEntry({
      date: v.date,
      description: `سند توريد ${v.voucher_no} — ${v.customer_name ?? ""}`,
      reference: v.voucher_no,
      debit: safeAcct,
      credit: custAcct,
      amount: Number(v.amount),
    });
  }

  const [updated] = await db.update(depositVouchersTable)
    .set({ posting_status: "posted" })
    .where(eq(depositVouchersTable.id, id))
    .returning();

  res.json(fmt(updated));
}));

/* ── إلغاء سند التوريد → قيد عكسي ─────────────────────────────────────── */
router.post("/deposit-vouchers/:id/cancel", wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) throw httpError(400, "معرّف غير صحيح");

  const [v] = await db.select().from(depositVouchersTable).where(eq(depositVouchersTable.id, id));
  if (!v) throw httpError(404, "سند التوريد غير موجود");
  if (v.posting_status === "cancelled") throw httpError(400, "السند ملغى بالفعل");

  if (v.posting_status === "posted") {
    const custAcct = await getVoucherCustomerAcct(v.customer_id);
    if (custAcct) {
      const safeAcct = await getOrCreateSafeAccount(v.safe_id, v.safe_name);
      // عكس: مدين عميل × دائن خزينة
      await createAutoJournalEntry({
        date: new Date().toISOString().split("T")[0],
        description: `إلغاء سند توريد ${v.voucher_no} — ${v.customer_name ?? ""}`,
        reference: `REV-${v.voucher_no}`,
        debit: custAcct,
        credit: safeAcct,
        amount: Number(v.amount),
      });
    }
  }

  const [updated] = await db.update(depositVouchersTable)
    .set({ posting_status: "cancelled" })
    .where(eq(depositVouchersTable.id, id))
    .returning();

  res.json(fmt(updated));
}));

/* ── حذف (draft فقط — posted مقفل) ─────────────────────────────────────── */
router.delete("/deposit-vouchers/:id", wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  await db.transaction(async (tx) => {
    const [v] = await tx.select().from(depositVouchersTable).where(eq(depositVouchersTable.id, id));
    if (!v) throw httpError(404, "غير موجود");
    if (v.posting_status === "posted") throw httpError(400, "لا يمكن حذف سند مرحَّل — استخدم الإلغاء");

    // عكس رصيد الخزينة
    const [safe] = await tx.select().from(safesTable).where(eq(safesTable.id, v.safe_id));
    if (safe) await tx.update(safesTable).set({ balance: String(Number(safe.balance) - Number(v.amount)) }).where(eq(safesTable.id, safe.id));

    // عكس رصيد العميل
    if (v.customer_id) {
      const [cust] = await tx.select().from(customersTable).where(eq(customersTable.id, v.customer_id));
      if (cust) await tx.update(customersTable).set({ balance: String(Number(cust.balance) + Number(v.amount)) }).where(eq(customersTable.id, cust.id));
    }

    await tx.delete(depositVouchersTable).where(eq(depositVouchersTable.id, id));
  });
  res.json({ success: true });
}));

export default router;
