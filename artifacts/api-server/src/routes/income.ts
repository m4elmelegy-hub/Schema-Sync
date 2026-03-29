import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, incomeTable, transactionsTable, safesTable } from "@workspace/db";
import {
  GetIncomeResponse,
  CreateIncomeBody,
  DeleteIncomeParams,
  DeleteIncomeResponse,
} from "@workspace/api-zod";
import { wrap } from "../lib/async-handler";

const router: IRouter = Router();

function formatIncome(i: typeof incomeTable.$inferSelect) {
  return { ...i, amount: Number(i.amount), created_at: i.created_at.toISOString() };
}

router.get("/income", wrap(async (_req, res) => {
  const income = await db.select().from(incomeTable).orderBy(incomeTable.created_at);
  res.json(GetIncomeResponse.parse(income.map(formatIncome)));
}));

router.post("/income", async (req, res): Promise<void> => {
  const parsed = CreateIncomeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const safe_id: number | undefined = req.body.safe_id ? parseInt(req.body.safe_id) : undefined;
  const amt = parsed.data.amount;

  try {
    const income = await db.transaction(async (tx) => {
      let safe: typeof safesTable.$inferSelect | null = null;
      if (safe_id) {
        const [s] = await tx.select().from(safesTable).where(eq(safesTable.id, safe_id));
        if (!s) throw new Error("الخزينة غير موجودة");
        await tx.update(safesTable).set({ balance: String(Number(s.balance) + amt) }).where(eq(safesTable.id, s.id));
        safe = s;
      }
      const [inc] = await tx.insert(incomeTable).values({
        source: parsed.data.source,
        amount: String(amt),
        description: parsed.data.description ?? null,
        safe_id: safe?.id ?? null,
        safe_name: safe?.name ?? null,
      }).returning();
      await tx.insert(transactionsTable).values({
        type: "income", reference_type: "income", reference_id: inc.id,
        safe_id: safe?.id ?? null, safe_name: safe?.name ?? null,
        amount: String(amt), direction: safe ? "in" : "none",
        description: parsed.data.description ?? parsed.data.source,
        date: new Date().toISOString().split("T")[0], related_id: inc.id,
      });
      return inc;
    });
    res.status(201).json(formatIncome(income));
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : "خطأ في حفظ الإيراد" });
  }
});

router.delete("/income/:id", wrap(async (req, res) => {
  const params = DeleteIncomeParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.transaction(async (tx) => {
    const [inc] = await tx.select().from(incomeTable).where(eq(incomeTable.id, params.data.id));
    if (inc?.safe_id) {
      const [safe] = await tx.select().from(safesTable).where(eq(safesTable.id, inc.safe_id));
      if (safe) await tx.update(safesTable).set({ balance: String(Number(safe.balance) - Number(inc.amount)) }).where(eq(safesTable.id, safe.id));
    }
    await tx.delete(incomeTable).where(eq(incomeTable.id, params.data.id));
  });
  res.json(DeleteIncomeResponse.parse({ success: true, message: "Income deleted" }));
}));

export default router;
