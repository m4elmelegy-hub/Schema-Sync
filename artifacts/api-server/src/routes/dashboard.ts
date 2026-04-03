import { Router, type IRouter } from "express";
import { gte, sum, desc, inArray, and, eq } from "drizzle-orm";
import {
  db, salesTable, saleItemsTable, expensesTable, incomeTable,
  productsTable, transactionsTable,
} from "@workspace/db";
import { GetDashboardStatsResponse } from "@workspace/api-zod";
import { wrap } from "../lib/async-handler";
import { getTotalCustomerLedgerBalance, getTotalSupplierLedgerBalance } from "../lib/ledger-balance";

const router: IRouter = Router();

router.get("/dashboard/stats", wrap(async (req, res) => {
  const role = req.user?.role ?? "cashier";
  const queryWarehouseId = req.query.warehouse_id ? parseInt(String(req.query.warehouse_id), 10) : null;
  const effectiveWarehouseId = (role === "admin" || role === "manager")
    ? queryWarehouseId
    : (req.user?.warehouse_id ?? null);
  if ((role === "cashier" || role === "salesperson") && effectiveWarehouseId === null) {
    res.status(403).json({ error: "المستخدم غير مرتبط بمخزن" }); return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  // ── مبيعات اليوم ─────────────────────────────────────────────────────────
  const companyId = req.user?.company_id ?? null;
  const salesDateFilter = and(
    gte(salesTable.date, todayStr),
    effectiveWarehouseId ? eq(salesTable.warehouse_id, effectiveWarehouseId) : undefined,
    companyId !== null ? eq(salesTable.company_id, companyId) : undefined,
  );
  const [salesToday] = await db.select({ total: sum(salesTable.total_amount) })
    .from(salesTable).where(salesDateFilter);
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
  const todaySales = await db.select({ id: salesTable.id }).from(salesTable).where(salesDateFilter);
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

  // ── ديون العملاء والموردين — من دفتر الأستاذ (AR / AP) ──────────────────
  const [total_customer_debts, total_supplier_debts] = await Promise.all([
    getTotalCustomerLedgerBalance(),
    getTotalSupplierLedgerBalance(),
  ]);

  // ── منتجات منخفضة المخزون ────────────────────────────────────────────────
  const allProducts = await db.select().from(productsTable)
    .where(companyId !== null ? eq(productsTable.company_id, companyId) : undefined);
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
  const ALLOWED_TX_TYPES = new Set([
    "sale","purchase","expense","income","receipt","payment",
    "sale_return","purchase_return","sale_cash","sale_credit",
    "sale_partial","purchase_cash","purchase_credit","receipt_voucher",
    "payment_voucher","sale_cancel","supplier_payment","safe_closing",
    "safe_adjustment","deposit_voucher",
  ]);
  const recentTxns = await db.select().from(transactionsTable)
    .orderBy(desc(transactionsTable.created_at)).limit(50);
  const recent_transactions = recentTxns
    .filter(t => ALLOWED_TX_TYPES.has(t.type))
    .slice(0, 10)
    .map(t => ({
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
