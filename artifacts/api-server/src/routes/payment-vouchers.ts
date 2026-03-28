import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, paymentVouchersTable, safesTable, transactionsTable } from "@workspace/db";

const router: IRouter = Router();

function fmt(v: typeof paymentVouchersTable.$inferSelect) {
  return { ...v, amount: Number(v.amount), created_at: v.created_at.toISOString() };
}

router.get("/payment-vouchers", async (_req, res): Promise<void> => {
  const items = await db.select().from(paymentVouchersTable).orderBy(desc(paymentVouchersTable.created_at));
  res.json(items.map(fmt));
});

router.post("/payment-vouchers", async (req, res): Promise<void> => {
  const { customer_id, customer_name, safe_id, amount, notes, date } = req.body;
  if (!customer_name || !safe_id || !amount) {
    res.status(400).json({ error: "البيانات غير مكتملة" }); return;
  }
  const amt = Number(amount);
  if (isNaN(amt) || amt <= 0) { res.status(400).json({ error: "المبلغ غير صحيح" }); return; }

  try {
    const voucher = await db.transaction(async (tx) => {
      // 1. الخزينة تنزل
      const [safe] = await tx.select().from(safesTable).where(eq(safesTable.id, parseInt(safe_id)));
      if (!safe) throw new Error("الخزينة غير موجودة");
      const newBal = Number(safe.balance) - amt;
      if (newBal < 0) throw new Error("رصيد الخزينة غير كافٍ");
      await tx.update(safesTable).set({ balance: String(newBal) }).where(eq(safesTable.id, safe.id));

      // 2. إنشاء سند الصرف
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

      // 3. الحركة المالية المركزية
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
        description: `سند صرف ${voucher_no} — ${customer_name}`,
        date: date ?? new Date().toISOString().split("T")[0],
        related_id: v.id,
      });

      return v;
    });
    res.status(201).json(fmt(voucher));
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : "خطأ في حفظ سند الصرف" });
  }
});

router.delete("/payment-vouchers/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  try {
    await db.transaction(async (tx) => {
      const [v] = await tx.select().from(paymentVouchersTable).where(eq(paymentVouchersTable.id, id));
      if (!v) throw new Error("غير موجود");
      // عكس رصيد الخزينة
      const [safe] = await tx.select().from(safesTable).where(eq(safesTable.id, v.safe_id));
      if (safe) await tx.update(safesTable).set({ balance: String(Number(safe.balance) + Number(v.amount)) }).where(eq(safesTable.id, safe.id));
      await tx.delete(paymentVouchersTable).where(eq(paymentVouchersTable.id, id));
    });
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : "خطأ في الحذف" });
  }
});

export default router;
