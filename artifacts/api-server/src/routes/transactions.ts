import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, transactionsTable } from "@workspace/db";
import { wrap } from "../lib/async-handler";

const router: IRouter = Router();

router.get("/transactions", wrap(async (req, res) => {
  const cid: number = (req as any).user?.company_id ?? 1;
  const transactions = await db.select().from(transactionsTable)
    .where(eq(transactionsTable.company_id, cid))
    .orderBy(desc(transactionsTable.created_at)).limit(200);
  res.json(transactions.map(t => ({
    ...t,
    amount: Number(t.amount),
    created_at: t.created_at.toISOString(),
  })));
}));

export default router;
