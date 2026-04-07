import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, safesTable, safeTransfersTable, transactionsTable } from "@workspace/db";

import { wrap, httpError } from "../lib/async-handler";
import { assertPeriodOpen } from "../lib/period-lock";

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

router.post("/safe-transfers", wrap(async (req, res) => {
  const userRole = req.user?.role ?? "cashier";
  if (userRole !== "admin" && userRole !== "manager") {
    res.status(403).json({ error: "ليس لديك صلاحية لتحويل الخزائن — يُسمح للمدير فقط" }); return;
  }

  const { from_safe_id, to_safe_id, amount, notes, date } = req.body;

  await assertPeriodOpen(date ?? new Date().toISOString().split("T")[0], req);

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

  const result = await db.transaction(async (tx) => {
    const [fromSafe] = await tx.select().from(safesTable).where(eq(safesTable.id, parseInt(from_safe_id)));
    const [toSafe] = await tx.select().from(safesTable).where(eq(safesTable.id, parseInt(to_safe_id)));
    if (!fromSafe) throw httpError(400, "خزينة المصدر غير موجودة");
    if (!toSafe) throw httpError(400, "خزينة الوجهة غير موجودة");
    if (Number(fromSafe.balance) < amt) throw httpError(400, `رصيد خزينة "${fromSafe.name}" غير كافٍ (${Number(fromSafe.balance).toFixed(2)} ج.م)`);

    await tx.update(safesTable).set({ balance: String(Number(fromSafe.balance) - amt) }).where(eq(safesTable.id, fromSafe.id));
    await tx.update(safesTable).set({ balance: String(Number(toSafe.balance) + amt) }).where(eq(safesTable.id, toSafe.id));

    // ── سجل في جدول safe_transfers للتاريخ ─────────────────────────────────
    await tx.insert(safeTransfersTable).values({
      from_safe_id: fromSafe.id,
      from_safe_name: fromSafe.name,
      to_safe_id: toSafe.id,
      to_safe_name: toSafe.name,
      amount: String(amt),
      notes: notes ?? null,
    });

    // ── سجلان في transactions للدفتر المالي المركزي ─────────────────────────
    await tx.insert(transactionsTable).values({
      type: "transfer_out",
      reference_type: "safe_transfer",
      safe_id: fromSafe.id,
      safe_name: fromSafe.name,
      amount: String(amt),
      direction: "out",
      description: `تحويل ${transferRef} → ${toSafe.name}${notes ? ` (${notes})` : ""}`,
      date: txDate,
    });

    await tx.insert(transactionsTable).values({
      type: "transfer_in",
      reference_type: "safe_transfer",
      safe_id: toSafe.id,
      safe_name: toSafe.name,
      amount: String(amt),
      direction: "in",
      description: `تحويل ${transferRef} ← ${fromSafe.name}${notes ? ` (${notes})` : ""}`,
      date: txDate,
    });

    return { transfer_ref: transferRef, from: fromSafe.name, to: toSafe.name, amount: amt };
  });

  res.status(201).json(result);
}));

export default router;
