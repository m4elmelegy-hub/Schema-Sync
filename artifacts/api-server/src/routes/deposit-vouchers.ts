import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, depositVouchersTable, safesTable, customersTable, transactionsTable } from "@workspace/db";

import { wrap } from "../lib/async-handler";

const router: IRouter = Router();

function fmt(v: typeof depositVouchersTable.$inferSelect) {
  return { ...v, amount: Number(v.amount), created_at: v.created_at.toISOString() };
}

router.get("/deposit-vouchers", wrap(async (_req, res) => {
  const items = await db.select().from(depositVouchersTable).orderBy(desc(depositVouchersTable.created_at));
  res.json(items.map(fmt));
}));

router.post("/deposit-vouchers", async (req, res): Promise<void> => {
  const { safe_id, amount, customer_id, customer_name, source, notes, date } = req.body;
  if (!safe_id || !amount) { res.status(400).json({ error: "البيانات غير مكتملة" }); return; }
  const amt = Number(amount);
  if (isNaN(amt) || amt <= 0) { res.status(400).json({ error: "المبلغ غير صحيح" }); return; }

  try {
    const voucher = await db.transaction(async (tx) => {
      // 1. الخزينة ترتفع
      const [safe] = await tx.select().from(safesTable).where(eq(safesTable.id, parseInt(safe_id)));
      if (!safe) throw new Error("الخزينة غير موجودة");
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

      // 3. إنشاء سند التوريد
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
      const desc_ = custName
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
        description: desc_,
        date: date ?? new Date().toISOString().split("T")[0],
        related_id: v.id,
      });

      return v;
    });
    res.status(201).json(fmt(voucher));
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : "خطأ في حفظ سند التوريد" });
  }
});

router.delete("/deposit-vouchers/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  try {
    await db.transaction(async (tx) => {
      const [v] = await tx.select().from(depositVouchersTable).where(eq(depositVouchersTable.id, id));
      if (!v) throw new Error("غير موجود");
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
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : "خطأ في الحذف" });
  }
});

export default router;
