import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, paymentVouchersTable, safesTable, customersTable, transactionsTable } from "@workspace/db";

import { wrap, httpError } from "../lib/async-handler";

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
        const newCustBal = Number(cust.balance) + amt;
        await tx.update(customersTable).set({ balance: String(newCustBal) }).where(eq(customersTable.id, cust.id));
      }
    }

    // 3. إنشاء سند التوريد
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
  res.status(201).json(fmt(voucher));
}));

router.delete("/payment-vouchers/:id", wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  await db.transaction(async (tx) => {
    const [v] = await tx.select().from(paymentVouchersTable).where(eq(paymentVouchersTable.id, id));
    if (!v) throw httpError(400, "غير موجود");

    // عكس رصيد الخزينة (نرجع المبلغ للخزينة)
    const [safe] = await tx.select().from(safesTable).where(eq(safesTable.id, v.safe_id));
    if (safe) await tx.update(safesTable).set({ balance: String(Number(safe.balance) + Number(v.amount)) }).where(eq(safesTable.id, safe.id));

    // عكس رصيد العميل (نرجع الدين)
    if (v.customer_id) {
      const [cust] = await tx.select().from(customersTable).where(eq(customersTable.id, v.customer_id));
      if (cust) await tx.update(customersTable).set({ balance: String(Number(cust.balance) - Number(v.amount)) }).where(eq(customersTable.id, cust.id));
    }

    await tx.delete(paymentVouchersTable).where(eq(paymentVouchersTable.id, id));
  });
  res.json({ success: true });
}));

export default router;
