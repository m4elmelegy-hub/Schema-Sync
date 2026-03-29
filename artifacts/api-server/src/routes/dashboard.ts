import { Router, type IRouter } from "express";
import { gte, sum, desc } from "drizzle-orm";
import { db, salesTable, expensesTable, incomeTable, customersTable, suppliersTable, productsTable, transactionsTable } from "@workspace/db";
import { GetDashboardStatsResponse } from "@workspace/api-zod";
import { wrap } from "../lib/async-handler";

const router: IRouter = Router();

router.get("/dashboard/stats", wrap(async (_req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [salesToday] = await db.select({ total: sum(salesTable.total_amount) })
    .from(salesTable).where(gte(salesTable.created_at, today));
  const total_sales_today = Number(salesToday?.total ?? 0);

  const [expensesToday] = await db.select({ total: sum(expensesTable.amount) })
    .from(expensesTable).where(gte(expensesTable.created_at, today));
  const total_expenses_today = Number(expensesToday?.total ?? 0);

  const [incomeToday] = await db.select({ total: sum(incomeTable.amount) })
    .from(incomeTable).where(gte(incomeTable.created_at, today));
  const total_income_today = Number(incomeToday?.total ?? 0);

  const [allSales] = await db.select({ total: sum(salesTable.total_amount) }).from(salesTable);
  const [allExpenses] = await db.select({ total: sum(expensesTable.amount) }).from(expensesTable);
  const [allIncome] = await db.select({ total: sum(incomeTable.amount) }).from(incomeTable);
  const net_profit =
    Number(allSales?.total ?? 0) -
    Number(allExpenses?.total ?? 0) +
    Number(allIncome?.total ?? 0);

  const [custDebts] = await db.select({ total: sum(customersTable.balance) }).from(customersTable);
  const total_customer_debts = Number(custDebts?.total ?? 0);

  const [suppDebts] = await db.select({ total: sum(suppliersTable.balance) }).from(suppliersTable);
  const total_supplier_debts = Number(suppDebts?.total ?? 0);

  const allProducts = await db.select().from(productsTable);
  const low_stock_products = allProducts
    .filter(p => p.low_stock_threshold !== null && Number(p.quantity) <= (p.low_stock_threshold ?? 0))
    .map(p => ({
      ...p,
      quantity: Number(p.quantity),
      cost_price: Number(p.cost_price),
      sale_price: Number(p.sale_price),
      created_at: p.created_at.toISOString(),
    }));

  const recentTxns = await db.select().from(transactionsTable)
    .orderBy(desc(transactionsTable.created_at)).limit(10);
  const recent_transactions = recentTxns.map(t => ({
    ...t,
    amount: Number(t.amount),
    created_at: t.created_at.toISOString(),
  }));

  res.json(GetDashboardStatsResponse.parse({
    total_sales_today,
    total_expenses_today,
    total_income_today,
    net_profit,
    total_customer_debts,
    total_supplier_debts,
    low_stock_products,
    recent_transactions,
  }));
}));

export default router;
