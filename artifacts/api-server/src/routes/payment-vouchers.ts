import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, paymentVouchersTable, safesTable, customersTable, transactionsTable, accountsTable } from "@workspace/db";

import { wrap, httpError } from "../lib/async-handler";
import { assertPeriodOpen } from "../lib/period-lock";
import { getOrCreateSafeAccount, createAutoJournalEntry, type AccountRef } from "../lib/auto-account";

const router: IRouter = Router();

function fmt(v: typeof paymentVouchersTable.$inferSelect) {
  return { ...v, amount: Number(v.amount), created_at: v.created_at.toISOString() };
}

router.get("/payment-vouchers", wrap(async (_req, res) => {
  const items = await db.select().from(paymentVouchersTable).orderBy(desc(paymentVouchersTable.created_at));
  res.json(items.map(fmt));
}));

router.post("/payment-vouchers", wrap(async (req, res) => {
  const { customer_id, customer_name, safe_id, amount, notes, date } = req.body;
  if (!customer_name || !safe_id || !amount) {
    res.status(400).json({ error: "البيانات غير مكتملة" }); return;
  }
  const amt = Number(amount);
  if (isNaN(amt) || amt <= 0) { res.status(400).json({ error: "المبلغ غير صحيح" }); return; }

  await assertPeriodOpen(date ?? null, req);

  const voucher = await db.transaction(async (tx) => {
    // 1. الخزينة تنزل (نحن ندفع للعميل)
    const [safe] = await tx.select().from(safesTable).where(eq(safesTable.id, parseInt(safe_id)));
    if (!safe) throw httpError(400, "الخزينة غير موجودة");
    const newSafeBal = Number(safe.balance) - amt;
    if (newSafeBal < 0) throw httpError(400, "رصيد الخزينة غير كافٍ");
    await tx.update(safesTable).set({ balance: String(newSafeBal) }).where(eq(safesTable.id, safe.id));

    // 2. رصيد العميل يرتفع (نسدد له ما علينا)
    if (customer_id) {
      const [cust] = await tx.select().from(customersTable).where(eq(customersTable.id, parseInt(customer_id)));
      if (cust) {
        await tx.update(customersTable).set({ balance: String(Number(cust.balance) + amt) }).where(eq(customersTable.id, cust.id));
      }
    }

    // 3. إنشاء سند التوريد (posting_status = 'draft' بالافتراضي)
    const voucher_no = `PAY-${Date.now()}`;
    const [v] = await tx.insert(paymentVouchersTable).values({
      voucher_no,
      date: date ?? new Date().toISOString().split("T")[0],
      customer_id: customer_id ? parseInt(customer_id) : null,
      customer_name,
      safe_id: safe.id,
      safe_name: safe.name,
      amount: String(amt),
      notes: notes ?? null,
    }).returning();

    // 4. الحركة المالية المركزية
    await tx.insert(transactionsTable).values({
      type: "payment_voucher",
      reference_type: "payment_voucher",
      reference_id: v.id,
      safe_id: safe.id,
      safe_name: safe.name,
      customer_id: customer_id ? parseInt(customer_id) : null,
      customer_name,
      amount: String(amt),
      direction: "out",
      description: `سند توريد ${voucher_no} — ${customer_name} (تسديد ما علينا)`,
      date: date ?? new Date().toISOString().split("T")[0],
    });

    return v;
  });

  // القيد المحاسبي يُنشأ عند الترحيل (POST /payment-vouchers/:id/post)
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
router.post("/payment-vouchers/:id/post", wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) throw httpError(400, "معرّف غير صحيح");

  const [v] = await db.select().from(paymentVouchersTable).where(eq(paymentVouchersTable.id, id));
  if (!v) throw httpError(404, "سند التوريد غير موجود");
  if (v.posting_status === "posted")    throw httpError(400, "السند مرحَّل بالفعل");
  if (v.posting_status === "cancelled") throw httpError(400, "لا يمكن ترحيل سند ملغى");

  await assertPeriodOpen(v.date, req);

  const custAcct = await getVoucherCustomerAcct(v.customer_id);
  if (custAcct) {
    const safeAcct = await getOrCreateSafeAccount(v.safe_id, v.safe_name);
    // سند توريد: مدين عميل (ذمم مدينة نقلصت) × دائن خزينة (خرج النقد)
    await createAutoJournalEntry({
      date: v.date,
      description: `سند توريد ${v.voucher_no} — ${v.customer_name}`,
      reference: v.voucher_no,
      debit: custAcct,
      credit: safeAcct,
      amount: Number(v.amount),
    });
  }

  const [updated] = await db.update(paymentVouchersTable)
    .set({ posting_status: "posted" })
    .where(eq(paymentVouchersTable.id, id))
    .returning();

  res.json(fmt(updated));
}));

/* ── إلغاء سند التوريد → قيد عكسي ─────────────────────────────────────── */
router.post("/payment-vouchers/:id/cancel", wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) throw httpError(400, "معرّف غير صحيح");

  const [v] = await db.select().from(paymentVouchersTable).where(eq(paymentVouchersTable.id, id));
  if (!v) throw httpError(404, "سند التوريد غير موجود");
  if (v.posting_status === "cancelled") throw httpError(400, "السند ملغى بالفعل");

  await assertPeriodOpen(v.date, req);

  if (v.posting_status === "posted") {
    const custAcct = await getVoucherCustomerAcct(v.customer_id);
    if (custAcct) {
      const safeAcct = await getOrCreateSafeAccount(v.safe_id, v.safe_name);
      // عكس: مدين خزينة × دائن عميل
      await createAutoJournalEntry({
        date: new Date().toISOString().split("T")[0],
        description: `إلغاء سند توريد ${v.voucher_no} — ${v.customer_name}`,
        reference: `REV-${v.voucher_no}`,
        debit: safeAcct,
        credit: custAcct,
        amount: Number(v.amount),
      });
    }
  }

  const [updated] = await db.update(paymentVouchersTable)
    .set({ posting_status: "cancelled" })
    .where(eq(paymentVouchersTable.id, id))
    .returning();

  res.json(fmt(updated));
}));

/* ── حذف (draft فقط — posted مقفل) ─────────────────────────────────────── */
router.delete("/payment-vouchers/:id", wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  const [preCheck] = await db.select({ date: paymentVouchersTable.date, posting_status: paymentVouchersTable.posting_status })
    .from(paymentVouchersTable).where(eq(paymentVouchersTable.id, id));
  if (!preCheck) throw httpError(404, "غير موجود");
  if (preCheck.posting_status === "posted") throw httpError(400, "لا يمكن حذف سند مرحَّل — استخدم الإلغاء");
  await assertPeriodOpen(preCheck.date, req);

  await db.transaction(async (tx) => {
    const [v] = await tx.select().from(paymentVouchersTable).where(eq(paymentVouchersTable.id, id));
    if (!v) throw httpError(404, "غير موجود");
    if (v.posting_status === "posted") throw httpError(400, "لا يمكن حذف سند مرحَّل — استخدم الإلغاء");

    // عكس رصيد الخزينة (نرجع المبلغ للخزينة)
    const [safe] = await tx.select().from(safesTable).where(eq(safesTable.id, v.safe_id));
    if (safe) await tx.update(safesTable).set({ balance: String(Number(safe.balance) + Number(v.amount)) }).where(eq(safesTable.id, safe.id));

    // عكس رصيد العميل
    if (v.customer_id) {
      const [cust] = await tx.select().from(customersTable).where(eq(customersTable.id, v.customer_id));
      if (cust) await tx.update(customersTable).set({ balance: String(Number(cust.balance) - Number(v.amount)) }).where(eq(customersTable.id, cust.id));
    }

    await tx.delete(paymentVouchersTable).where(eq(paymentVouchersTable.id, id));
  });
  res.json({ success: true });
}));

export default router;
