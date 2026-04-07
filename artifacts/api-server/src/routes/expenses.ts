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
import { hasPermission } from "../lib/permissions";
import { assertPeriodOpen } from "../lib/period-lock";
import { writeAuditLog } from "../lib/audit-log";
import { getOrCreateSafeAccount, getOrCreateGeneralExpenseAccount, createAutoJournalEntry } from "../lib/auto-account";

const router: IRouter = Router();

function formatExpense(e: typeof expensesTable.$inferSelect) {
  return { ...e, amount: Number(e.amount), created_at: e.created_at.toISOString() };
}

router.get("/expenses", wrap(async (req, res) => {
  if (!hasPermission(req.user, "can_view_expenses")) {
    res.status(403).json({ error: "غير مصرح بعرض المصروفات" }); return;
  }
  const expenses = await db.select().from(expensesTable).orderBy(expensesTable.created_at);
  res.json(GetExpensesResponse.parse(expenses.map(formatExpense)));
}));

router.post("/expenses", wrap(async (req, res) => {
  if (!hasPermission(req.user, "can_add_expense")) {
    res.status(403).json({ error: "غير مصرح بإضافة مصروفات" }); return;
  }

  await assertPeriodOpen(new Date().toISOString().split("T")[0], req);

  const parsed = CreateExpenseBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const safe_id: number | undefined = req.body.safe_id ? parseInt(req.body.safe_id) : undefined;
  const amt = parsed.data.amount;

  const result = await db.transaction(async (tx) => {
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
    return { exp, safe };
  });
  /* ── قيد يومية تلقائي للمصروف النقدي ────────────────────────────────────
   * مدين: مصروفات عمومية (EXP-GENERAL)
   * دائن: الخزينة (SAFE-{safeId})
   * ملاحظة: إذا لم تكن هناك خزينة فلا يوجد أثر نقدي فوري → لا قيد
   * ─────────────────────────────────────────────────────────────────────── */
  const { exp: expense, safe } = result;
  if (safe) {
    try {
      const expAcct  = await getOrCreateGeneralExpenseAccount();
      const safeAcct = await getOrCreateSafeAccount(safe.id, safe.name);
      const todayStr = new Date().toISOString().split("T")[0];
      await createAutoJournalEntry({
        date:        todayStr,
        description: `مصروف: ${parsed.data.category}${parsed.data.description ? ` — ${parsed.data.description}` : ""}`,
        reference:   `EXP-${expense.id}`,
        debit:  expAcct,
        credit: safeAcct,
        amount: amt,
      });
    } catch (jeErr) {
      /* غير فادح — المصروف سُجِّل بنجاح حتى لو فشل القيد */
      console.error("Failed to create journal entry for expense:", jeErr);
    }
  }
  res.status(201).json(formatExpense(expense));
}));

router.delete("/expenses/:id", wrap(async (req, res) => {
  const params = DeleteExpenseParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [preCheck] = await db.select().from(expensesTable).where(eq(expensesTable.id, params.data.id));
  if (preCheck) await assertPeriodOpen(preCheck.created_at?.toISOString().split("T")[0] ?? null, req);

  /* نحفظ بيانات المصروف قبل الحذف لإنشاء قيد عكسي */
  let deletedSafeId:   number | null = null;
  let deletedSafeName: string | null = null;
  let deletedAmount:   number        = 0;
  let deletedCategory: string        = "";

  await db.transaction(async (tx) => {
    const [exp] = await tx.select().from(expensesTable).where(eq(expensesTable.id, params.data.id));
    if (exp?.safe_id) {
      const [safe] = await tx.select().from(safesTable).where(eq(safesTable.id, exp.safe_id));
      if (safe) {
        deletedSafeId   = safe.id;
        deletedSafeName = safe.name;
        await tx.update(safesTable).set({ balance: String(Number(safe.balance) + Number(exp.amount)) }).where(eq(safesTable.id, safe.id));
      }
    }
    if (exp) {
      deletedAmount   = Number(exp.amount);
      deletedCategory = exp.category ?? "مصروف محذوف";
    }
    await tx.delete(expensesTable).where(eq(expensesTable.id, params.data.id));
  });

  /* ── قيد عكسي لإلغاء أثر المصروف المحذوف على الدفتر ──────────────────
   * مدين: الخزينة / دائن: مصروفات عمومية   (عكس القيد الأصلي)
   * ─────────────────────────────────────────────────────────────────────*/
  if (deletedSafeId !== null && deletedAmount > 0) {
    try {
      const safeAcct = await getOrCreateSafeAccount(deletedSafeId, deletedSafeName ?? `خزينة ${deletedSafeId}`);
      const expAcct  = await getOrCreateGeneralExpenseAccount();
      const todayStr = new Date().toISOString().split("T")[0];
      await createAutoJournalEntry({
        date:        todayStr,
        description: `إلغاء مصروف: ${deletedCategory}`,
        reference:   `EXP-DEL-${params.data.id}`,
        debit:  safeAcct,
        credit: expAcct,
        amount: deletedAmount,
      });
    } catch (jeErr) {
      console.error("Failed to create reversal JE for deleted expense:", jeErr);
    }
  }

  res.json(DeleteExpenseResponse.parse({ success: true, message: "Expense deleted" }));
}));

export default router;
