import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, receiptVouchersTable, customersTable, safesTable, transactionsTable } from "@workspace/db";

import { wrap, httpError } from "../lib/async-handler";

const router: IRouter = Router();

function fmt(v: typeof receiptVouchersTable.$inferSelect) {
  return { ...v, amount: Number(v.amount), created_at: v.created_at.toISOString() };
}

router.get("/receipt-vouchers", wrap(async (_req, res) => {
  const items = await db.select().from(receiptVouchersTable).orderBy(desc(receiptVouchersTable.created_at));
  res.json(items.map(fmt));
}));

router.post("/receipt-vouchers", wrap(async (req, res) => {
  const { customer_id, customer_name, safe_id, amount, notes, date } = req.body;
  if (!customer_name || !safe_id || !amount) {
    res.status(400).json({ error: "البيانات غير مكتملة" }); return;
  }
  const amt = Number(amount);
  if (isNaN(amt) || amt <= 0) { res.status(400).json({ error: "المبلغ غير صحيح" }); return; }

  const voucher = await db.transaction(async (tx) => {
    // 1. جلب الخزينة وزيادة رصيدها
    const [safe] = await tx.select().from(safesTable).where(eq(safesTable.id, parseInt(safe_id)));
    if (!safe) throw httpError(400, "الخزينة غير موجودة");
    await tx.update(safesTable).set({ balance: String(Number(safe.balance) + amt) }).where(eq(safesTable.id, safe.id));

    // 2. خصم من رصيد العميل — بدون سقف عند الصفر
    if (customer_id) {
      const [cust] = await tx.select().from(customersTable).where(eq(customersTable.id, parseInt(customer_id)));
      if (cust) {
        const newBalance = Math.max(0, Number(cust.balance) - amt);
        await tx.update(customersTable).set({ balance: String(newBalance) }).where(eq(customersTable.id, cust.id));
      }
    }

    // 3. إنشاء سند القبض
    const voucher_no = `RCV-${Date.now()}`;
    const [v] = await tx.insert(receiptVouchersTable).values({
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

    return v;
  });
  res.status(201).json(fmt(voucher));
}));

router.delete("/receipt-vouchers/:id", wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }
  await db.transaction(async (tx) => {
    const [v] = await tx.select().from(receiptVouchersTable).where(eq(receiptVouchersTable.id, id));
    if (!v) throw httpError(404, "سند القبض غير موجود");
    // عكس تأثير السند
    const [safe] = await tx.select().from(safesTable).where(eq(safesTable.id, v.safe_id));
    if (safe) await tx.update(safesTable).set({ balance: String(Number(safe.balance) - Number(v.amount)) }).where(eq(safesTable.id, safe.id));
    if (v.customer_id) {
      const [cust] = await tx.select().from(customersTable).where(eq(customersTable.id, v.customer_id));
      if (cust) await tx.update(customersTable).set({ balance: String(Number(cust.balance) + Number(v.amount)) }).where(eq(customersTable.id, cust.id));
    }
    await tx.delete(receiptVouchersTable).where(eq(receiptVouchersTable.id, id));
  });
  res.json({ success: true });
}));

export default router;
