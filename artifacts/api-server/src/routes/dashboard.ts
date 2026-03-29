import { Router, type IRouter } from "express";
import { gte, sum, desc, inArray } from "drizzle-orm";
import {
  db, salesTable, saleItemsTable, expensesTable, incomeTable,
  customersTable, suppliersTable, productsTable, transactionsTable,
} from "@workspace/db";
import { GetDashboardStatsResponse } from "@workspace/api-zod";
import { wrap } from "../lib/async-handler";

const router: IRouter = Router();

router.get("/dashboard/stats", wrap(async (_req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  // ── مبيعات اليوم ─────────────────────────────────────────────────────────
  const [salesToday] = await db.select({ total: sum(salesTable.total_amount) })
    .from(salesTable).where(gte(salesTable.date, todayStr));
  const total_sales_today = Number(salesToday?.total ?? 0);

  // ── مصاريف اليوم ─────────────────────────────────────────────────────────
  const [expensesToday] = await db.select({ total: sum(expensesTable.amount) })
    .from(expensesTable).where(gte(expensesTable.created_at, today));
  const total_expenses_today = Number(expensesToday?.total ?? 0);

  // ── إيرادات اليوم ─────────────────────────────────────────────────────────
  const [incomeToday] = await db.select({ total: sum(incomeTable.amount) })
    .from(incomeTable).where(gte(incomeTable.created_at, today));
  const total_income_today = Number(incomeToday?.total ?? 0);

  // ── صافي الربح: تكلفة المبيعات الفعلية لا إجمالي المبيعات ───────────────
  const todaySales = await db.select({ id: salesTable.id }).from(salesTable).where(gte(salesTable.date, todayStr));
  let gross_profit_today = 0;
  if (todaySales.length > 0) {
    const todaySaleIds = todaySales.map(s => s.id);
    const todayItems = await db
      .select({ total_price: saleItemsTable.total_price, cost_total: saleItemsTable.cost_total })
      .from(saleItemsTable)
      .where(inArray(saleItemsTable.sale_id, todaySaleIds));
    gross_profit_today = todayItems.reduce((acc, item) => {
      return acc + (Number(item.total_price) - Number(item.cost_total));
    }, 0);
  }
  const net_profit = gross_profit_today - total_expenses_today + total_income_today;

  // ── ديون العملاء والموردين ────────────────────────────────────────────────
  const [custDebts] = await db.select({ total: sum(customersTable.balance) }).from(customersTable);
  const total_customer_debts = Number(custDebts?.total ?? 0);

  const [suppDebts] = await db.select({ total: sum(suppliersTable.balance) }).from(suppliersTable);
  const total_supplier_debts = Number(suppDebts?.total ?? 0);

  // ── منتجات منخفضة المخزون ────────────────────────────────────────────────
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

  // ── آخر الحركات المالية ───────────────────────────────────────────────────
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
    net_profit: Math.round(net_profit * 100) / 100,
    total_customer_debts,
    total_supplier_debts,
    low_stock_products,
    recent_transactions,
  }));
}));

export default router;
