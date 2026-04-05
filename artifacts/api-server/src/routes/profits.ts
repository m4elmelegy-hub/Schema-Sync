/**
 * /api/profits — حساب الأرباح الشامل مع دعم متعدد الفروع
 *
 * Query params:
 *   date_from      YYYY-MM-DD
 *   date_to        YYYY-MM-DD
 *   product_id     number (optional)
 *   warehouse_ids  "1,2,3" (optional, comma-separated — leave empty for all)
 */

import { Router, type IRouter } from "express";
import { gte, lte, and, eq, ne, inArray } from "drizzle-orm";
import {
  db, salesTable, saleItemsTable, expensesTable,
  salesReturnsTable, saleReturnItemsTable, warehousesTable,
} from "@workspace/db";

import { wrap } from "../lib/async-handler";

const router: IRouter = Router();

router.get("/profits", wrap(async (req, res) => {
  const { date_from, date_to, product_id, warehouse_ids } = req.query as {
    date_from?:    string;
    date_to?:      string;
    product_id?:   string;
    warehouse_ids?: string;
  };

  // ── Parse warehouse_ids filter ─────────────────────────────────────────────
  const warehouseIdList: number[] = warehouse_ids
    ? warehouse_ids.split(",").map(Number).filter(n => !isNaN(n) && n > 0)
    : [];

  // ── Sale conditions ─────────────────────────────────────────────────────────
  const saleConditions = [ne(salesTable.posting_status, "cancelled")];
  if (date_from)                saleConditions.push(gte(salesTable.date, date_from));
  if (date_to)                  saleConditions.push(lte(salesTable.date, date_to));
  if (warehouseIdList.length > 0) saleConditions.push(inArray(salesTable.warehouse_id, warehouseIdList));
  const saleWhereClause = and(...saleConditions);

  // ── Expense conditions (expenses have no warehouse_id — global) ─────────────
  const expenseConditions = [];
  if (date_from) expenseConditions.push(gte(expensesTable.created_at, new Date(date_from + "T00:00:00Z")));
  if (date_to)   expenseConditions.push(lte(expensesTable.created_at, new Date(date_to   + "T23:59:59Z")));
  const expenseWhereClause = expenseConditions.length > 0 ? and(...expenseConditions) : undefined;

  // ── Fetch data ──────────────────────────────────────────────────────────────
  const [sales, allExpenses, allWarehouses] = await Promise.all([
    db.select().from(salesTable).where(saleWhereClause),
    expenseWhereClause
      ? db.select().from(expensesTable).where(expenseWhereClause)
      : db.select().from(expensesTable),
    db.select().from(warehousesTable).orderBy(warehousesTable.id),
  ]);

  const emptyResult = {
    total_revenue: 0, total_cost: 0, gross_profit: 0, profit_margin: 0,
    net_profit: 0, total_expenses: 0, invoice_count: 0, item_count: 0,
    cash_sales: 0, credit_sales: 0, partial_sales: 0, return_amount: 0,
    by_product: [], by_month: [], by_day: [], by_expense_category: [], by_warehouse: [],
  };

  // ── Payment-type breakdown from sales ──────────────────────────────────────
  let cashSales    = 0;
  let creditSales  = 0;
  let partialSales = 0;
  for (const s of sales) {
    const amt = Number(s.total_amount ?? 0);
    if (s.payment_type === "cash")    cashSales   += amt;
    else if (s.payment_type === "credit")  creditSales  += amt;
    else if (s.payment_type === "partial") partialSales += amt;
  }

  if (sales.length === 0) {
    const totalExpenses = allExpenses.reduce((s, e) => s + Number(e.amount), 0);
    const byCatMap = new Map<string, number>();
    for (const e of allExpenses) byCatMap.set(e.category ?? "أخرى", (byCatMap.get(e.category ?? "أخرى") ?? 0) + Number(e.amount));
    const byExpenseCategory = Array.from(byCatMap.entries()).map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
    const byWarehouse = allWarehouses.map(w => ({ warehouse_id: w.id, warehouse_name: w.name, revenue: 0, cost: 0, gross_profit: 0, invoice_count: 0 }));
    res.json({ ...emptyResult, total_expenses: totalExpenses, by_expense_category: byExpenseCategory, by_warehouse: byWarehouse }); return;
  }

  const saleIds = sales.map(s => s.id);

  // ── Sale items ─────────────────────────────────────────────────────────────
  const allItems = await db.select().from(saleItemsTable);
  let items = allItems.filter(i => saleIds.includes(i.sale_id));
  if (product_id) {
    const pid = parseInt(product_id);
    items = items.filter(i => i.product_id === pid);
  }

  // ── Per-product aggregation ────────────────────────────────────────────────
  const byProduct = new Map<string, {
    product_id: number; product_name: string;
    qty_sold: number; revenue: number; cost: number; profit: number;
  }>();

  // ── Per-warehouse aggregation ──────────────────────────────────────────────
  const byWarehouseMap = new Map<number, {
    warehouse_id: number; warehouse_name: string;
    revenue: number; cost: number; gross_profit: number; invoice_count: number;
  }>();
  // pre-populate all warehouses (so 0-revenue branches still appear)
  for (const w of allWarehouses) {
    byWarehouseMap.set(w.id, { warehouse_id: w.id, warehouse_name: w.name, revenue: 0, cost: 0, gross_profit: 0, invoice_count: 0 });
  }
  const warehouseInvoiceCounted = new Set<number>(); // sale ids already counted per warehouse

  let totalRevenue = 0;
  let totalCost    = 0;

  // ── per-month / per-day ────────────────────────────────────────────────────
  const byMonth = new Map<string, { month: string; revenue: number; cost: number; profit: number }>();
  const byDay   = new Map<string, { day:   string; revenue: number; cost: number; profit: number }>();

  for (const item of items) {
    const qty        = Number(item.quantity);
    const itemRevenue = Number(item.total_price);
    const itemCost    = Number(item.cost_total);

    totalRevenue += itemRevenue;
    totalCost    += itemCost;

    // by product
    const pKey = String(item.product_id);
    const existingP = byProduct.get(pKey);
    if (existingP) {
      existingP.qty_sold += qty; existingP.revenue += itemRevenue; existingP.cost += itemCost; existingP.profit += itemRevenue - itemCost;
    } else {
      byProduct.set(pKey, { product_id: item.product_id, product_name: item.product_name, qty_sold: qty, revenue: itemRevenue, cost: itemCost, profit: itemRevenue - itemCost });
    }

    // by warehouse
    const sale = sales.find(s => s.id === item.sale_id);
    if (sale) {
      const wid = sale.warehouse_id ?? 0;
      const warehouseEntry = byWarehouseMap.get(wid);
      if (warehouseEntry) {
        warehouseEntry.revenue     += itemRevenue;
        warehouseEntry.cost        += itemCost;
        warehouseEntry.gross_profit += itemRevenue - itemCost;
        if (!warehouseInvoiceCounted.has(item.sale_id)) {
          warehouseEntry.invoice_count++;
          warehouseInvoiceCounted.add(item.sale_id);
        }
      }

      // by date
      const dayKey   = (sale.date ?? sale.created_at.toISOString().split("T")[0]).slice(0, 10);
      const monthKey = dayKey.slice(0, 7);
      const em = byMonth.get(monthKey);
      if (em) { em.revenue += itemRevenue; em.cost += itemCost; em.profit += itemRevenue - itemCost; }
      else byMonth.set(monthKey, { month: monthKey, revenue: itemRevenue, cost: itemCost, profit: itemRevenue - itemCost });
      const ed = byDay.get(dayKey);
      if (ed) { ed.revenue += itemRevenue; ed.cost += itemCost; ed.profit += itemRevenue - itemCost; }
      else byDay.set(dayKey, { day: dayKey, revenue: itemRevenue, cost: itemCost, profit: itemRevenue - itemCost });
    }
  }

  // ── Sales returns ──────────────────────────────────────────────────────────
  const allReturns = await db.select().from(salesReturnsTable);
  const returnsInPeriod = allReturns.filter(r => {
    const rDate = (r.date ?? r.created_at.toISOString().split("T")[0]) as string;
    if (date_from && rDate < date_from) return false;
    if (date_to   && rDate > date_to)   return false;
    return true;
  });

  let returnAmount = 0;

  for (const ret of returnsInPeriod) {
    const retItems = await db.select().from(saleReturnItemsTable).where(eq(saleReturnItemsTable.return_id, ret.id));
    const retDate = (ret.date ?? ret.created_at.toISOString().split("T")[0]) as string;
    const retMonthKey = retDate.slice(0, 7);

    for (const ri of retItems) {
      const refundAmt  = Number(ri.total_price);
      const retQtyNum  = Number(ri.quantity);
      returnAmount    += refundAmt;

      let retCostAmt = Number(ri.total_cost_at_return ?? 0);
      if (retCostAmt === 0 && ret.sale_id) {
        const origItems = await db.select().from(saleItemsTable)
          .where(and(eq(saleItemsTable.sale_id, ret.sale_id), eq(saleItemsTable.product_id, ri.product_id)));
        if (origItems.length > 0) {
          const unitOrigCost = Number(origItems[0].cost_total) / Math.max(Number(origItems[0].quantity), 1);
          retCostAmt = unitOrigCost * retQtyNum;
        }
      }
      if (retCostAmt === 0) retCostAmt = Number(ri.unit_price) * retQtyNum;

      totalRevenue -= refundAmt;
      totalCost    -= retCostAmt;

      const pKey = String(ri.product_id);
      const existingP = byProduct.get(pKey);
      if (existingP) {
        existingP.qty_sold -= retQtyNum; existingP.revenue -= refundAmt;
        existingP.cost -= retCostAmt; existingP.profit -= (refundAmt - retCostAmt);
      }

      const em = byMonth.get(retMonthKey);
      if (em) { em.revenue -= refundAmt; em.cost -= retCostAmt; em.profit -= (refundAmt - retCostAmt); }
      const ed = byDay.get(retDate);
      if (ed) { ed.revenue -= refundAmt; ed.cost -= retCostAmt; ed.profit -= (refundAmt - retCostAmt); }
    }
  }

  // ── Expense totals & breakdown ─────────────────────────────────────────────
  const totalExpenses = allExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const byCatMap = new Map<string, number>();
  for (const e of allExpenses) {
    const cat = e.category ?? "أخرى";
    byCatMap.set(cat, (byCatMap.get(cat) ?? 0) + Number(e.amount));
  }
  const byExpenseCategory = Array.from(byCatMap.entries())
    .map(([category, total]) => ({ category, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);

  // ── Final calculations ─────────────────────────────────────────────────────
  const grossProfit  = totalRevenue - totalCost;
  const netProfit    = grossProfit - totalExpenses;
  const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  const byProductArr = Array.from(byProduct.values()).map(p => ({
    ...p,
    profit_margin: p.revenue > 0 ? Math.round((p.profit / p.revenue) * 10000) / 100 : 0,
    avg_cost_price: p.qty_sold > 0 ? Math.round((p.cost / p.qty_sold) * 100) / 100 : 0,
    avg_sale_price: p.qty_sold > 0 ? Math.round((p.revenue / p.qty_sold) * 100) / 100 : 0,
  })).sort((a, b) => b.profit - a.profit);

  const byMonthArr  = Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));
  const byDayArr    = Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day));
  const byWarehouseArr = Array.from(byWarehouseMap.values())
    .filter(w => warehouseIdList.length === 0 || warehouseIdList.includes(w.warehouse_id))
    .map(w => ({
      ...w,
      revenue:     Math.round(w.revenue    * 100) / 100,
      cost:        Math.round(w.cost       * 100) / 100,
      gross_profit: Math.round(w.gross_profit * 100) / 100,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const invoiceCount = product_id
    ? new Set(items.map(i => i.sale_id)).size
    : sales.length;

  res.json({
    total_revenue:      Math.round(totalRevenue  * 100) / 100,
    total_cost:         Math.round(totalCost     * 100) / 100,
    gross_profit:       Math.round(grossProfit   * 100) / 100,
    profit_margin:      Math.round(profitMargin  * 100) / 100,
    total_expenses:     Math.round(totalExpenses * 100) / 100,
    net_profit:         Math.round(netProfit     * 100) / 100,
    invoice_count:      invoiceCount,
    item_count:         items.reduce((s, i) => s + Number(i.quantity), 0),
    cash_sales:         Math.round(cashSales    * 100) / 100,
    credit_sales:       Math.round(creditSales  * 100) / 100,
    partial_sales:      Math.round(partialSales * 100) / 100,
    return_amount:      Math.round(returnAmount * 100) / 100,
    by_product:         byProductArr,
    by_month:           byMonthArr,
    by_day:             byDayArr,
    by_expense_category: byExpenseCategory,
    by_warehouse:       byWarehouseArr,
  });
}));

export default router;
