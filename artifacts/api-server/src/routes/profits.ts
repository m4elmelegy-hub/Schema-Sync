/**
 * /api/profits — حساب الأرباح بدقة باستخدام متوسط التكلفة المرجّح
 *
 * FIX 5: يُرشَّح حسب حقل `date` (النص) بدلاً من `created_at` (timestamp)
 *        حتى يظهر البيع في الفترة الصحيحة عند الإدخال بتاريخ سابق.
 */

import { Router, type IRouter } from "express";
import { gte, lte, and, eq } from "drizzle-orm";
import {
  db, salesTable, saleItemsTable, expensesTable,
  salesReturnsTable, saleReturnItemsTable,
} from "@workspace/db";
import { wrap } from "../lib/async-handler";

const router: IRouter = Router();

router.get("/profits", wrap(async (req, res) => {
  const { date_from, date_to, product_id } = req.query as {
    date_from?: string;
    date_to?: string;
    product_id?: string;
  };

  // ── فلتر المبيعات بحقل date النصي (YYYY-MM-DD) ──────────────────────────
  const saleConditions = [];
  if (date_from) saleConditions.push(gte(salesTable.date, date_from));
  if (date_to)   saleConditions.push(lte(salesTable.date, date_to));
  const saleWhereClause = saleConditions.length > 0 ? and(...saleConditions) : undefined;

  // ── فلتر المصاريف بـ created_at (لا يوجد حقل date في جدول expenses) ──────
  const expenseConditions = [];
  if (date_from) expenseConditions.push(gte(expensesTable.created_at, new Date(date_from + "T00:00:00Z")));
  if (date_to)   expenseConditions.push(lte(expensesTable.created_at, new Date(date_to   + "T23:59:59Z")));
  const expenseWhereClause = expenseConditions.length > 0 ? and(...expenseConditions) : undefined;

  // ── جلب الفواتير ──────────────────────────────────────────────────────────
  const sales = saleWhereClause
    ? await db.select().from(salesTable).where(saleWhereClause)
    : await db.select().from(salesTable);

  const emptyResult = {
    total_revenue: 0, total_cost: 0, gross_profit: 0,
    profit_margin: 0, net_profit: 0, total_expenses: 0,
    by_product: [], by_month: [], invoice_count: 0, item_count: 0,
  };

  if (sales.length === 0) { res.json(emptyResult); return; }

  const saleIds = sales.map(s => s.id);

  // ── جلب بنود الفواتير ─────────────────────────────────────────────────────
  const allItems = await db.select().from(saleItemsTable);
  let items = allItems.filter(i => saleIds.includes(i.sale_id));

  if (product_id) {
    const pid = parseInt(product_id);
    items = items.filter(i => i.product_id === pid);
  }

  // ── جلب المصاريف ──────────────────────────────────────────────────────────
  const allExpenses = expenseWhereClause
    ? await db.select().from(expensesTable).where(expenseWhereClause)
    : await db.select().from(expensesTable);
  const totalExpenses = allExpenses.reduce((s, e) => s + Number(e.amount), 0);

  // ── حساب الأرباح حسب الصنف ────────────────────────────────────────────────
  const byProduct = new Map<string, {
    product_id: number;
    product_name: string;
    qty_sold: number;
    revenue: number;
    cost: number;
    profit: number;
  }>();

  let totalRevenue = 0;
  let totalCost = 0;

  for (const item of items) {
    const qty = Number(item.quantity);
    const itemRevenue = Number(item.total_price);
    const itemCost = Number(item.cost_total);

    totalRevenue += itemRevenue;
    totalCost += itemCost;

    const key = String(item.product_id);
    const existing = byProduct.get(key);
    if (existing) {
      existing.qty_sold += qty;
      existing.revenue += itemRevenue;
      existing.cost += itemCost;
      existing.profit += itemRevenue - itemCost;
    } else {
      byProduct.set(key, {
        product_id: item.product_id,
        product_name: item.product_name,
        qty_sold: qty,
        revenue: itemRevenue,
        cost: itemCost,
        profit: itemRevenue - itemCost,
      });
    }
  }

  // ── تجميع شهري بحقل date (يُبنى قبل خصم المرتجعات) ─────────────────────
  const byMonth = new Map<string, { month: string; revenue: number; cost: number; profit: number }>();
  for (const item of items) {
    const sale = sales.find(s => s.id === item.sale_id);
    if (!sale) continue;
    const monthKey = (sale.date ?? sale.created_at.toISOString().split("T")[0]).slice(0, 7);
    const itemRevenue = Number(item.total_price);
    const itemCost = Number(item.cost_total);
    const existingM = byMonth.get(monthKey);
    if (existingM) {
      existingM.revenue += itemRevenue;
      existingM.cost += itemCost;
      existingM.profit += itemRevenue - itemCost;
    } else {
      byMonth.set(monthKey, { month: monthKey, revenue: itemRevenue, cost: itemCost, profit: itemRevenue - itemCost });
    }
  }

  // ── طرح مرتجعات المبيعات من الأرباح وتفاصيل المنتجات والشهور ──────────
  const allReturns = await db.select().from(salesReturnsTable);
  const returnsInPeriod = saleConditions.length > 0
    ? allReturns.filter(r => {
        const rDate = r.date ?? r.created_at.toISOString().split("T")[0];
        if (date_from && rDate < date_from) return false;
        if (date_to   && rDate > date_to)   return false;
        return true;
      })
    : allReturns;

  for (const ret of returnsInPeriod) {
    const retItems = await db.select().from(saleReturnItemsTable).where(eq(saleReturnItemsTable.return_id, ret.id));
    const retDate = ret.date ?? ret.created_at.toISOString().split("T")[0];
    const retMonthKey = retDate.slice(0, 7);

    for (const ri of retItems) {
      const refundAmt = Number(ri.total_price);
      const retQtyNum = Number(ri.quantity);

      // ── حساب تكلفة الوحدة المُرتجَعة ────────────────────────────────────
      let unitRetCost = Number(ri.unit_price); // fallback
      if (ret.sale_id) {
        const origItems = await db.select().from(saleItemsTable)
          .where(and(eq(saleItemsTable.sale_id, ret.sale_id), eq(saleItemsTable.product_id, ri.product_id)));
        if (origItems.length > 0) {
          const origItem = origItems[0];
          unitRetCost = Number(origItem.cost_total) / Math.max(Number(origItem.quantity), 1);
        }
      }
      const retCostAmt = unitRetCost * retQtyNum;

      // ── تعديل الإجماليات الكلية ──────────────────────────────────────────
      totalRevenue -= refundAmt;
      totalCost    -= retCostAmt;

      // ── تعديل تفصيل المنتجات (by_product) ──────────────────────────────
      const pKey = String(ri.product_id);
      const existingP = byProduct.get(pKey);
      if (existingP) {
        existingP.qty_sold -= retQtyNum;
        existingP.revenue  -= refundAmt;
        existingP.cost     -= retCostAmt;
        existingP.profit   -= (refundAmt - retCostAmt);
      }

      // ── تعديل التجميع الشهري (by_month) ──────────────────────────────────
      const existingMonth = byMonth.get(retMonthKey);
      if (existingMonth) {
        existingMonth.revenue -= refundAmt;
        existingMonth.cost    -= retCostAmt;
        existingMonth.profit  -= (refundAmt - retCostAmt);
      }
    }
  }

  const grossProfit = totalRevenue - totalCost;
  const netProfit = grossProfit - totalExpenses;
  const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  const byProductArr = Array.from(byProduct.values())
    .map(p => ({
      ...p,
      profit_margin: p.revenue > 0 ? Math.round((p.profit / p.revenue) * 10000) / 100 : 0,
      avg_cost_price: p.qty_sold > 0 ? Math.round((p.cost / p.qty_sold) * 100) / 100 : 0,
      avg_sale_price: p.qty_sold > 0 ? Math.round((p.revenue / p.qty_sold) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.profit - a.profit);

  const byMonthArr = Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));

  const invoiceCount = product_id
    ? new Set(items.map(i => i.sale_id)).size
    : sales.length;

  res.json({
    total_revenue: Math.round(totalRevenue * 100) / 100,
    total_cost: Math.round(totalCost * 100) / 100,
    gross_profit: Math.round(grossProfit * 100) / 100,
    profit_margin: Math.round(profitMargin * 100) / 100,
    total_expenses: Math.round(totalExpenses * 100) / 100,
    net_profit: Math.round(netProfit * 100) / 100,
    invoice_count: invoiceCount,
    item_count: items.reduce((s, i) => s + Number(i.quantity), 0),
    by_product: byProductArr,
    by_month: byMonthArr,
  });
}));

export default router;
