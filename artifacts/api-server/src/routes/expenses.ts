import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, expensesTable, transactionsTable, safesTable } from "@workspace/db";
import {
  GetExpensesResponse,
  CreateExpenseBody,
  DeleteExpenseParams,
  DeleteExpenseResponse,
} from "@workspace/api-zod";
import { wrap, httpError } from "../lib/async-handler";

const router: IRouter = Router();

function formatExpense(e: typeof expensesTable.$inferSelect) {
  return { ...e, amount: Number(e.amount), created_at: e.created_at.toISOString() };
}

router.get("/expenses", wrap(async (_req, res) => {
  const expenses = await db.select().from(expensesTable).orderBy(expensesTable.created_at);
  res.json(GetExpensesResponse.parse(expenses.map(formatExpense)));
}));

router.post("/expenses", wrap(async (req, res) => {
  const parsed = CreateExpenseBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const safe_id: number | undefined = req.body.safe_id ? parseInt(req.body.safe_id) : undefined;
  const amt = parsed.data.amount;

  const expense = await db.transaction(async (tx) => {
    let safe: typeof safesTable.$inferSelect | null = null;
    if (safe_id) {
      const [s] = await tx.select().from(safesTable).where(eq(safesTable.id, safe_id));
      if (!s) throw httpError(400, "الخزينة غير موجودة");
      if (Number(s.balance) < amt) throw httpError(400, `رصيد الخزينة غير كافٍ (${Number(s.balance).toFixed(2)} ج.م)`);
      await tx.update(safesTable).set({ balance: String(Number(s.balance) - amt) }).where(eq(safesTable.id, s.id));
      safe = s;
    }
    const [exp] = await tx.insert(expensesTable).values({
      category: parsed.data.category,
      amount: String(amt),
      description: parsed.data.description ?? null,
      safe_id: safe?.id ?? null,
      safe_name: safe?.name ?? null,
    }).returning();
    await tx.insert(transactionsTable).values({
      type: "expense", reference_type: "expense", reference_id: exp.id,
      safe_id: safe?.id ?? null, safe_name: safe?.name ?? null,
      amount: String(amt), direction: safe ? "out" : "none",
      description: parsed.data.description ?? parsed.data.category,
      date: new Date().toISOString().split("T")[0],
    });
    return exp;
  });
  res.status(201).json(formatExpense(expense));
}));

router.delete("/expenses/:id", wrap(async (req, res) => {
  const params = DeleteExpenseParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.transaction(async (tx) => {
    const [exp] = await tx.select().from(expensesTable).where(eq(expensesTable.id, params.data.id));
    if (exp?.safe_id) {
      const [safe] = await tx.select().from(safesTable).where(eq(safesTable.id, exp.safe_id));
      if (safe) await tx.update(safesTable).set({ balance: String(Number(safe.balance) + Number(exp.amount)) }).where(eq(safesTable.id, safe.id));
    }
    await tx.delete(expensesTable).where(eq(expensesTable.id, params.data.id));
  });
  res.json(DeleteExpenseResponse.parse({ success: true, message: "Expense deleted" }));
}));

export default router;
