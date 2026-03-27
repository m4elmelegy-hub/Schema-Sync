import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, transactionsTable } from "@workspace/db";
import { GetTransactionsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/transactions", async (_req, res): Promise<void> => {
  const transactions = await db.select().from(transactionsTable).orderBy(desc(transactionsTable.created_at)).limit(100);
  res.json(GetTransactionsResponse.parse(transactions.map(t => ({
    ...t,
    amount: Number(t.amount),
    created_at: t.created_at.toISOString(),
  }))));
});

export default router;
