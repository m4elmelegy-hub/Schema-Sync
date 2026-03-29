/**
 * /api/profits — حساب الأرباح بدقة باستخدام متوسط التكلفة المرجّح
 *
 * معادلة الربح:
 *   ربح_الصنف = (سعر_البيع − تكلفة_الوحدة_وقت_البيع) × الكمية
 *   ربح_إجمالي = Σ أرباح كل أصناف الفواتير المباعة خلال الفترة
 *
 * تُطرح المصاريف الفعلية للفترة إن طُلب الربح الصافي.
 */

import { Router, type IRouter } from "express";
import { gte, lte, and, eq } from "drizzle-orm";
import {
  db, salesTable, saleItemsTable, expensesTable,
} from "@workspace/db";
import { wrap } from "../lib/async-handler";

const router: IRouter = Router();

// ──────────────────────────────────────────────────────────
//  GET /api/profits?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&product_id=N
// ──────────────────────────────────────────────────────────
router.get("/profits", wrap(async (req, res) => {
  const { date_from, date_to, product_id } = req.query as {
      date_from?: string;
      date_to?: string;
      product_id?: string;
    };

    // ── شروط الفترة للمبيعات (salesTable) ─────────────────
    const saleConditions = [];
    if (date_from) {
      saleConditions.push(gte(salesTable.created_at, new Date(date_from + "T00:00:00Z")));
    }
    if (date_to) {
      saleConditions.push(lte(salesTable.created_at, new Date(date_to + "T23:59:59Z")));
    }
    const saleWhereClause = saleConditions.length > 0 ? and(...saleConditions) : undefined;

    // ── شروط الفترة للمصاريف (expensesTable) — منفصلة تماماً
    const expenseConditions = [];
    if (date_from) {
      expenseConditions.push(gte(expensesTable.created_at, new Date(date_from + "T00:00:00Z")));
    }
    if (date_to) {
      expenseConditions.push(lte(expensesTable.created_at, new Date(date_to + "T23:59:59Z")));
    }
    const expenseWhereClause = expenseConditions.length > 0 ? and(...expenseConditions) : undefined;

    // ── جلب الفواتير في الفترة ─────────────────────────────
    const sales = saleWhereClause
      ? await db.select().from(salesTable).where(saleWhereClause)
      : await db.select().from(salesTable);

    const emptyResult = {
      total_revenue: 0, total_cost: 0, gross_profit: 0,
      profit_margin: 0, net_profit: 0, total_expenses: 0,
      by_product: [], by_month: [], invoice_count: 0, item_count: 0,
    };

    if (sales.length === 0) {
      res.json(emptyResult);
      return;
    }

    const saleIds = sales.map(s => s.id);

    // ── جلب بنود الفواتير مع فلتر اختياري للصنف ──────────
    const allItems = await db.select().from(saleItemsTable);
    let items = allItems.filter(i => saleIds.includes(i.sale_id));

    // فلتر صنف معين
    if (product_id) {
      const pid = parseInt(product_id);
      items = items.filter(i => i.product_id === pid);
    }

    // ── جلب المصاريف في الفترة (بشروط منفصلة) ─────────────
    const allExpenses = expenseWhereClause
      ? await db.select().from(expensesTable).where(expenseWhereClause)
      : await db.select().from(expensesTable);
    const totalExpenses = allExpenses.reduce((s, e) => s + Number(e.amount), 0);

    // ── حساب الأرباح حسب الصنف ────────────────────────────
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

    const grossProfit = totalRevenue - totalCost;
    const netProfit = grossProfit - totalExpenses;
    const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    // ── تجميع شهري ────────────────────────────────────────
    const byMonth = new Map<string, { month: string; revenue: number; cost: number; profit: number }>();
    for (const item of items) {
      const sale = sales.find(s => s.id === item.sale_id);
      if (!sale) continue;
      const monthKey = sale.created_at.toISOString().slice(0, 7);
      const itemRevenue = Number(item.total_price);
      const itemCost = Number(item.cost_total);
      const existing = byMonth.get(monthKey);
      if (existing) {
        existing.revenue += itemRevenue;
        existing.cost += itemCost;
        existing.profit += itemRevenue - itemCost;
      } else {
        byMonth.set(monthKey, { month: monthKey, revenue: itemRevenue, cost: itemCost, profit: itemRevenue - itemCost });
      }
    }

    // ── ترتيب الأصناف بالأكثر ربحاً ──────────────────────
    const byProductArr = Array.from(byProduct.values())
      .map(p => ({
        ...p,
        profit_margin: p.revenue > 0 ? Math.round((p.profit / p.revenue) * 10000) / 100 : 0,
        avg_cost_price: p.qty_sold > 0 ? Math.round((p.cost / p.qty_sold) * 100) / 100 : 0,
        avg_sale_price: p.qty_sold > 0 ? Math.round((p.revenue / p.qty_sold) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.profit - a.profit);

    const byMonthArr = Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));

    // عدد الفواتير الفعلية (قد يختلف لو فُلتر صنف معين)
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
