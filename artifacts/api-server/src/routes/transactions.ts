import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, transactionsTable } from "@workspace/db";
import { wrap } from "../lib/async-handler";

const router: IRouter = Router();

router.get("/transactions", wrap(async (_req, res) => {
  const transactions = await db.select().from(transactionsTable)
    .orderBy(desc(transactionsTable.created_at)).limit(200);
  res.json(transactions.map(t => ({
    ...t,
    amount: Number(t.amount),
    created_at: t.created_at.toISOString(),
  })));
}));

export default router;
