import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, receiptVouchersTable, customersTable, safesTable, transactionsTable, accountsTable, customerLedgerTable } from "@workspace/db";

import { wrap, httpError } from "../lib/async-handler";
import { assertPeriodOpen } from "../lib/period-lock";
import { getOrCreateSafeAccount, getOrCreateMiscRevenueAccount, createAutoJournalEntry, type AccountRef } from "../lib/auto-account";
import { hasPermission } from "../lib/permissions";

const router: IRouter = Router();

function fmt(v: typeof receiptVouchersTable.$inferSelect) {
  return { ...v, amount: Number(v.amount), created_at: v.created_at.toISOString() };
}

router.get("/receipt-vouchers", wrap(async (_req, res) => {
  const items = await db.select().from(receiptVouchersTable).orderBy(desc(receiptVouchersTable.created_at));
  res.json(items.map(fmt));
}));

router.post("/receipt-vouchers", wrap(async (req, res) => {
  if (!hasPermission(req.user, "can_add_receipt_voucher")) {
    res.status(403).json({ error: "غير مصرح بإضافة سندات قبض" }); return;
  }

  const { customer_id, customer_name, safe_id, amount, notes, date } = req.body;
  if (!customer_name || !safe_id || !amount) {
    return res.status(400).json({ error: "البيانات غير مكتملة" });
  }
  const amt = Number(amount);
  if (isNaN(amt) || amt <= 0) { return res.status(400).json({ error: "المبلغ غير صحيح" }); }

  const requestId = req.headers["x-request-id"]
    ? String(req.headers["x-request-id"])
    : null;

  if (requestId) {
    const [existing] = await db.select().from(receiptVouchersTable)
      .where(eq(receiptVouchersTable.request_id, requestId)).limit(1);
    if (existing) return res.json(fmt(existing));
  }

  await assertPeriodOpen(date ?? null, req);

  const voucher = await db.transaction(async (tx) => {
    // 1. جلب الخزينة وزيادة رصيدها
    const [safe] = await tx.select().from(safesTable).where(eq(safesTable.id, parseInt(safe_id)));
    if (!safe) throw httpError(400, "الخزينة غير موجودة");
    await tx.update(safesTable).set({ balance: String(Number(safe.balance) + amt) }).where(eq(safesTable.id, safe.id));

    // 2. خصم من رصيد العميل
    if (customer_id) {
      const [cust] = await tx.select().from(customersTable).where(eq(customersTable.id, parseInt(customer_id)));
      if (cust) {
        const newBalance = Number(cust.balance) - amt;
        await tx.update(customersTable).set({ balance: String(newBalance) }).where(eq(customersTable.id, cust.id));
      }
    }

    // 3. إنشاء سند القبض (posting_status = 'draft' بالافتراضي)
    const voucher_no = `RCV-${Date.now()}`;
    const [v] = await tx.insert(receiptVouchersTable).values({
      request_id: requestId,
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
      type: "receipt_voucher",
      reference_type: "receipt_voucher",
      reference_id: v.id,
      safe_id: safe.id,
      safe_name: safe.name,
      customer_id: customer_id ? parseInt(customer_id) : null,
      customer_name,
      amount: String(amt),
      direction: "in",
      description: `سند قبض ${voucher_no} — ${customer_name}`,
      date: date ?? new Date().toISOString().split("T")[0],
    });

    // 5. دفتر أستاذ العميل — تسجيل القبض (يُقلّل الدين)
    if (customer_id) {
      await tx.insert(customerLedgerTable).values({
        customer_id: parseInt(customer_id),
        type: "receipt_voucher",
        amount: String(-amt),
        reference_type: "receipt_voucher",
        reference_id: v.id,
        reference_no: voucher_no,
        description: `سند قبض ${voucher_no} — ${customer_name}`,
        date: date ?? new Date().toISOString().split("T")[0],
      });
    }

    return v;
  });

  // القيد المحاسبي يُنشأ عند الترحيل (POST /receipt-vouchers/:id/post)
  return res.status(201).json(fmt(voucher));
}));

/* ── مساعد: جلب حساب العميل من السند ──────────────────────────────────── */
async function getVoucherCustomerAcct(customerId: number | null): Promise<AccountRef | null> {
  if (!customerId) return null;
  const [cust] = await db.select({ account_id: customersTable.account_id, name: customersTable.name })
    .from(customersTable).where(eq(customersTable.id, customerId));
  if (!cust?.account_id) return null;
  const [acctRow] = await db.select({ id: accountsTable.id, code: accountsTable.code, name: accountsTable.name })
    .from(accountsTable).where(eq(accountsTable.id, cust.account_id));
  return acctRow ?? null;
}

/* ── ترحيل سند القبض (draft → posted) ──────────────────────────────────── */
router.post("/receipt-vouchers/:id/post", wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) throw httpError(400, "معرّف غير صحيح");

  const [v] = await db.select().from(receiptVouchersTable).where(eq(receiptVouchersTable.id, id));
  if (!v) throw httpError(404, "سند القبض غير موجود");
  if (v.posting_status === "posted")    throw httpError(400, "السند مرحَّل بالفعل");
  if (v.posting_status === "cancelled") throw httpError(400, "لا يمكن ترحيل سند ملغى");

  await assertPeriodOpen(v.date, req);

  const custAcct = await getVoucherCustomerAcct(v.customer_id);
  const safeAcct = await getOrCreateSafeAccount(v.safe_id, v.safe_name);
  if (custAcct) {
    // سند قبض: مدين خزينة × دائن عميل (العميل سدّد ذمّته)
    await createAutoJournalEntry({
      date: v.date,
      description: `سند قبض ${v.voucher_no} — ${v.customer_name}`,
      reference: v.voucher_no,
      debit: safeAcct,
      credit: custAcct,
      amount: Number(v.amount),
    });
  } else {
    // سند قبض بدون عميل محدد → إيراد متنوع (DR SAFE / CR REV-MISC)
    const miscAcct = await getOrCreateMiscRevenueAccount();
    await createAutoJournalEntry({
      date: v.date,
      description: `سند قبض ${v.voucher_no} — إيراد متنوع`,
      reference: v.voucher_no,
      debit: safeAcct,
      credit: miscAcct,
      amount: Number(v.amount),
    });
  }

  const [updated] = await db.update(receiptVouchersTable)
    .set({ posting_status: "posted" })
    .where(eq(receiptVouchersTable.id, id))
    .returning();

  res.json(fmt(updated));
}));

/* ── إلغاء سند القبض → قيد عكسي ───────────────────────────────────────── */
router.post("/receipt-vouchers/:id/cancel", wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) throw httpError(400, "معرّف غير صحيح");

  const [v] = await db.select().from(receiptVouchersTable).where(eq(receiptVouchersTable.id, id));
  if (!v) throw httpError(404, "سند القبض غير موجود");
  if (v.posting_status === "cancelled") throw httpError(400, "السند ملغى بالفعل");

  await assertPeriodOpen(v.date, req);

  if (v.posting_status === "posted") {
    const custAcct = await getVoucherCustomerAcct(v.customer_id);
    if (custAcct) {
      const safeAcct = await getOrCreateSafeAccount(v.safe_id, v.safe_name);
      // عكس: مدين عميل × دائن خزينة
      await createAutoJournalEntry({
        date: new Date().toISOString().split("T")[0],
        description: `إلغاء سند قبض ${v.voucher_no} — ${v.customer_name}`,
        reference: `REV-${v.voucher_no}`,
        debit: custAcct,
        credit: safeAcct,
        amount: Number(v.amount),
      });
    }
  }

  const [updated] = await db.update(receiptVouchersTable)
    .set({ posting_status: "cancelled" })
    .where(eq(receiptVouchersTable.id, id))
    .returning();

  res.json(fmt(updated));
}));

/* ── حذف (draft فقط — posted مقفل) ─────────────────────────────────────── */
router.delete("/receipt-vouchers/:id", wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  const [preCheck] = await db.select({ date: receiptVouchersTable.date, posting_status: receiptVouchersTable.posting_status })
    .from(receiptVouchersTable).where(eq(receiptVouchersTable.id, id));
  if (!preCheck) throw httpError(404, "سند القبض غير موجود");
  if (preCheck.posting_status === "posted") throw httpError(400, "لا يمكن حذف سند مرحَّل — استخدم الإلغاء");
  await assertPeriodOpen(preCheck.date, req);

  await db.transaction(async (tx) => {
    const [v] = await tx.select().from(receiptVouchersTable).where(eq(receiptVouchersTable.id, id));
    if (!v) throw httpError(404, "سند القبض غير موجود");
    if (v.posting_status === "posted") throw httpError(400, "لا يمكن حذف سند مرحَّل — استخدم الإلغاء");

    // عكس تأثير السند على الأرصدة
    const [safe] = await tx.select().from(safesTable).where(eq(safesTable.id, v.safe_id));
    if (safe) await tx.update(safesTable).set({ balance: String(Number(safe.balance) - Number(v.amount)) }).where(eq(safesTable.id, safe.id));
    if (v.customer_id) {
      const [cust] = await tx.select().from(customersTable).where(eq(customersTable.id, v.customer_id));
      if (cust) await tx.update(customersTable).set({ balance: String(Number(cust.balance) + Number(v.amount)) }).where(eq(customersTable.id, cust.id));

      // عكس دفتر الأستاذ: حذف قيد القبض المرتبط بهذا السند
      await tx.delete(customerLedgerTable)
        .where(and(
          eq(customerLedgerTable.reference_type, "receipt_voucher"),
          eq(customerLedgerTable.reference_id, id),
        ));
    }
    await tx.delete(receiptVouchersTable).where(eq(receiptVouchersTable.id, id));
  });
  res.json({ success: true });
}));

export default router;
