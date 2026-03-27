import { Router, type IRouter } from "express";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { db, transactionsTable } from "@workspace/db";

const router: IRouter = Router();

function fmt(t: typeof transactionsTable.$inferSelect) {
  return { ...t, amount: Number(t.amount), created_at: t.created_at.toISOString() };
}

// GET /financial-transactions?safe_id=1&direction=in&from=2024-01-01&to=2024-12-31
router.get("/financial-transactions", async (req, res): Promise<void> => {
  const { safe_id, direction, from, to } = req.query as Record<string, string>;
  const conditions = [];
  if (safe_id) conditions.push(eq(transactionsTable.safe_id, parseInt(safe_id)));
  if (direction) conditions.push(eq(transactionsTable.direction, direction));
  if (from) conditions.push(gte(transactionsTable.date, from));
  if (to) conditions.push(lte(transactionsTable.date, to));

  const items = conditions.length > 0
    ? await db.select().from(transactionsTable).where(and(...conditions)).orderBy(desc(transactionsTable.created_at))
    : await db.select().from(transactionsTable).orderBy(desc(transactionsTable.created_at));

  res.json(items.map(fmt));
});

export default router;
