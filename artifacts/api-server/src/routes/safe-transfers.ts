import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, safesTable, transactionsTable } from "@workspace/db";

import { wrap } from "../lib/async-handler";

const router: IRouter = Router();

router.get("/safe-transfers", wrap(async (_req, res) => {
  const items = await db.select().from(transactionsTable)
    .where(eq(transactionsTable.reference_type, "safe_transfer"))
    .orderBy(desc(transactionsTable.created_at));
  res.json(items.map(t => ({
    ...t,
    amount: Number(t.amount),
    created_at: t.created_at.toISOString(),
  })));
}));

router.post("/safe-transfers", async (req, res): Promise<void> => {
  const { from_safe_id, to_safe_id, amount, notes, date } = req.body;
  if (!from_safe_id || !to_safe_id || !amount) {
    res.status(400).json({ error: "البيانات غير مكتملة" }); return;
  }
  if (parseInt(from_safe_id) === parseInt(to_safe_id)) {
    res.status(400).json({ error: "لا يمكن التحويل من وإلى نفس الخزينة" }); return;
  }
  const amt = Number(amount);
  if (isNaN(amt) || amt <= 0) { res.status(400).json({ error: "المبلغ غير صحيح" }); return; }

  const transferRef = `TRF-${Date.now()}`;
  const txDate = date ?? new Date().toISOString().split("T")[0];

  try {
    const result = await db.transaction(async (tx) => {
      const [fromSafe] = await tx.select().from(safesTable).where(eq(safesTable.id, parseInt(from_safe_id)));
      const [toSafe] = await tx.select().from(safesTable).where(eq(safesTable.id, parseInt(to_safe_id)));
      if (!fromSafe) throw new Error("خزينة المصدر غير موجودة");
      if (!toSafe) throw new Error("خزينة الوجهة غير موجودة");
      if (Number(fromSafe.balance) < amt) throw new Error(`رصيد خزينة "${fromSafe.name}" غير كافٍ (${Number(fromSafe.balance).toFixed(2)} ج.م)`);

      await tx.update(safesTable).set({ balance: String(Number(fromSafe.balance) - amt) }).where(eq(safesTable.id, fromSafe.id));
      await tx.update(safesTable).set({ balance: String(Number(toSafe.balance) + amt) }).where(eq(safesTable.id, toSafe.id));

      // حركة الخصم (out) من الخزينة المصدر
      await tx.insert(transactionsTable).values({
        type: "transfer_out",
        reference_type: "safe_transfer",
        safe_id: fromSafe.id,
        safe_name: fromSafe.name,
        amount: String(amt),
        direction: "out",
        description: `تحويل ${transferRef} → ${toSafe.name}${notes ? ` (${notes})` : ""}`,
        date: txDate,
        related_id: fromSafe.id,
      });

      // حركة الإضافة (in) إلى الخزينة الوجهة
      await tx.insert(transactionsTable).values({
        type: "transfer_in",
        reference_type: "safe_transfer",
        safe_id: toSafe.id,
        safe_name: toSafe.name,
        amount: String(amt),
        direction: "in",
        description: `تحويل ${transferRef} ← ${fromSafe.name}${notes ? ` (${notes})` : ""}`,
        date: txDate,
        related_id: toSafe.id,
      });

      return { transfer_ref: transferRef, from: fromSafe.name, to: toSafe.name, amount: amt };
    });
    res.status(201).json(result);
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : "خطأ في التحويل" });
  }
});

export default router;
