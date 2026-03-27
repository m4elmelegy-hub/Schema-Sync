import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, expensesTable, transactionsTable } from "@workspace/db";
import {
  GetExpensesResponse,
  CreateExpenseBody,
  DeleteExpenseParams,
  DeleteExpenseResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatExpense(e: typeof expensesTable.$inferSelect) {
  return {
    ...e,
    amount: Number(e.amount),
    created_at: e.created_at.toISOString(),
  };
}

router.get("/expenses", async (_req, res): Promise<void> => {
  const expenses = await db.select().from(expensesTable).orderBy(expensesTable.created_at);
  res.json(GetExpensesResponse.parse(expenses.map(formatExpense)));
});

router.post("/expenses", async (req, res): Promise<void> => {
  const parsed = CreateExpenseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [expense] = await db.insert(expensesTable).values({
    category: parsed.data.category,
    amount: String(parsed.data.amount),
    description: parsed.data.description ?? null,
  }).returning();

  await db.insert(transactionsTable).values({
    type: "expense",
    amount: String(parsed.data.amount),
    description: parsed.data.description ?? parsed.data.category,
    related_id: expense.id,
  });

  res.status(201).json(formatExpense(expense));
});

router.delete("/expenses/:id", async (req, res): Promise<void> => {
  const params = DeleteExpenseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(expensesTable).where(eq(expensesTable.id, params.data.id));
  res.json(DeleteExpenseResponse.parse({ success: true, message: "Expense deleted" }));
});

export default router;
