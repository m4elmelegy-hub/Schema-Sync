import { Router, type IRouter } from "express";
import { eq, desc, and, gte, lte, or, ilike } from "drizzle-orm";
import { db, transactionsTable } from "@workspace/db";
import { wrap } from "../lib/async-handler";

const router: IRouter = Router();

function fmt(t: typeof transactionsTable.$inferSelect) {
  return { ...t, amount: Number(t.amount), created_at: t.created_at.toISOString() };
}

router.get("/financial-transactions", wrap(async (req, res) => {
  const cid: number = (req as any).user?.company_id ?? 1;
  const { safe_id, direction, type, from, to, search } = req.query as Record<string, string>;
  const conditions = [eq(transactionsTable.company_id, cid)];

  if (safe_id) conditions.push(eq(transactionsTable.safe_id, parseInt(safe_id)));
  if (direction) conditions.push(eq(transactionsTable.direction, direction));
  if (type) conditions.push(eq(transactionsTable.type, type));
  if (from) conditions.push(gte(transactionsTable.date, from));
  if (to) conditions.push(lte(transactionsTable.date, to));
  if (search) {
    conditions.push(
      or(
        ilike(transactionsTable.description, `%${search}%`),
        ilike(transactionsTable.customer_name, `%${search}%`),
      )!,
    );
  }

  const items = await db.select().from(transactionsTable)
    .where(and(...conditions))
    .orderBy(desc(transactionsTable.created_at));

  res.json(items.map(fmt));
}));

export default router;
