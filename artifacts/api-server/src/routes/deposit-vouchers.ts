import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, depositVouchersTable, safesTable, transactionsTable } from "@workspace/db";

const router: IRouter = Router();

function fmt(v: typeof depositVouchersTable.$inferSelect) {
  return { ...v, amount: Number(v.amount), created_at: v.created_at.toISOString() };
}

router.get("/deposit-vouchers", async (_req, res): Promise<void> => {
  const items = await db.select().from(depositVouchersTable).orderBy(desc(depositVouchersTable.created_at));
  res.json(items.map(fmt));
});

router.post("/deposit-vouchers", async (req, res): Promise<void> => {
  const { safe_id, amount, source, notes, date } = req.body;
  if (!safe_id || !amount) { res.status(400).json({ error: "البيانات غير مكتملة" }); return; }
  const amt = Number(amount);
  if (isNaN(amt) || amt <= 0) { res.status(400).json({ error: "المبلغ غير صحيح" }); return; }

  try {
    const voucher = await db.transaction(async (tx) => {
      const [safe] = await tx.select().from(safesTable).where(eq(safesTable.id, parseInt(safe_id)));
      if (!safe) throw new Error("الخزينة غير موجودة");
      await tx.update(safesTable).set({ balance: String(Number(safe.balance) + amt) }).where(eq(safesTable.id, safe.id));

      const voucher_no = `DEP-${Date.now()}`;
      const [v] = await tx.insert(depositVouchersTable).values({
        voucher_no,
        date: date ?? new Date().toISOString().split("T")[0],
        safe_id: safe.id,
        safe_name: safe.name,
        amount: String(amt),
        source: source ?? null,
        notes: notes ?? null,
      }).returning();

      await tx.insert(transactionsTable).values({
        type: "deposit_voucher",
        reference_type: "deposit_voucher",
        reference_id: v.id,
        safe_id: safe.id,
        safe_name: safe.name,
        amount: String(amt),
        direction: "in",
        description: `سند توريد ${voucher_no}${source ? ` — ${source}` : ""}`,
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
  await db.transaction(async (tx) => {
    const [v] = await tx.select().from(depositVouchersTable).where(eq(depositVouchersTable.id, id));
    if (!v) throw new Error("غير موجود");
    const [safe] = await tx.select().from(safesTable).where(eq(safesTable.id, v.safe_id));
    if (safe) await tx.update(safesTable).set({ balance: String(Number(safe.balance) - Number(v.amount)) }).where(eq(safesTable.id, safe.id));
    await tx.delete(depositVouchersTable).where(eq(depositVouchersTable.id, id));
  });
  res.json({ success: true });
});

export default router;
