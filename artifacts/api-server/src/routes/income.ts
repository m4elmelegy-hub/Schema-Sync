import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, incomeTable, transactionsTable } from "@workspace/db";
import {
  GetIncomeResponse,
  CreateIncomeBody,
  DeleteIncomeParams,
  DeleteIncomeResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatIncome(i: typeof incomeTable.$inferSelect) {
  return {
    ...i,
    amount: Number(i.amount),
    created_at: i.created_at.toISOString(),
  };
}

router.get("/income", async (_req, res): Promise<void> => {
  const income = await db.select().from(incomeTable).orderBy(incomeTable.created_at);
  res.json(GetIncomeResponse.parse(income.map(formatIncome)));
});

router.post("/income", async (req, res): Promise<void> => {
  const parsed = CreateIncomeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [income] = await db.insert(incomeTable).values({
    source: parsed.data.source,
    amount: String(parsed.data.amount),
    description: parsed.data.description ?? null,
  }).returning();

  await db.insert(transactionsTable).values({
    type: "income",
    amount: String(parsed.data.amount),
    description: parsed.data.description ?? parsed.data.source,
    related_id: income.id,
  });

  res.status(201).json(formatIncome(income));
});

router.delete("/income/:id", async (req, res): Promise<void> => {
  const params = DeleteIncomeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(incomeTable).where(eq(incomeTable.id, params.data.id));
  res.json(DeleteIncomeResponse.parse({ success: true, message: "Income deleted" }));
});

export default router;
