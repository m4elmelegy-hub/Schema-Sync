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
import { gte, lte, and } from "drizzle-orm";
import {
  db, salesTable, saleItemsTable, expensesTable,
} from "@workspace/db";

const router: IRouter = Router();

// ──────────────────────────────────────────────────────────
//  GET /api/profits?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
// ──────────────────────────────────────────────────────────
router.get("/profits", async (req, res): Promise<void> => {
  try {
    const { date_from, date_to } = req.query as { date_from?: string; date_to?: string };

    // ── بناء شروط الفترة الزمنية ──────────────────────────
    const conditions = [];
    if (date_from) {
      conditions.push(gte(salesTable.created_at, new Date(date_from + "T00:00:00Z")));
    }
    if (date_to) {
      conditions.push(lte(salesTable.created_at, new Date(date_to + "T23:59:59Z")));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // ── جلب كل الفواتير في الفترة ─────────────────────────
    const sales = whereClause
      ? await db.select().from(salesTable).where(whereClause)
      : await db.select().from(salesTable);

    if (sales.length === 0) {
      res.json({
        total_revenue: 0, total_cost: 0, gross_profit: 0,
        profit_margin: 0, net_profit: 0, total_expenses: 0,
        by_product: [], by_month: [], invoice_count: 0, item_count: 0,
      });
      return;
    }

    const saleIds = sales.map(s => s.id);

    // ── جلب كل بنود الفواتير ──────────────────────────────
    // نجلب جميع البنود ثم نُصفّي بـ JavaScript لأن drizzle لا يدعم inArray بسهولة
    const allItems = await db.select().from(saleItemsTable);
    const items = allItems.filter(i => saleIds.includes(i.sale_id));

    // ── جلب المصاريف في الفترة ───────────────────────────
    const allExpenses = whereClause
      ? await db.select().from(expensesTable).where(whereClause)
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
      const salePrice = Number(item.unit_price);   // سعر البيع للوحدة
      const costPrice = Number(item.cost_price);   // متوسط التكلفة وقت البيع
      const itemRevenue = Number(item.total_price);
      const itemCost = Number(item.cost_total);    // التكلفة الإجمالية للبند

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
      const monthKey = sale.created_at.toISOString().slice(0, 7); // YYYY-MM
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
        profit_margin: p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0,
        avg_cost_price: p.qty_sold > 0 ? p.cost / p.qty_sold : 0,
        avg_sale_price: p.qty_sold > 0 ? p.revenue / p.qty_sold : 0,
      }))
      .sort((a, b) => b.profit - a.profit);

    const byMonthArr = Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));

    res.json({
      // ── الإجماليات ──
      total_revenue: Math.round(totalRevenue * 100) / 100,
      total_cost: Math.round(totalCost * 100) / 100,
      gross_profit: Math.round(grossProfit * 100) / 100,
      profit_margin: Math.round(profitMargin * 100) / 100,
      total_expenses: Math.round(totalExpenses * 100) / 100,
      net_profit: Math.round(netProfit * 100) / 100,
      invoice_count: sales.length,
      item_count: items.reduce((s, i) => s + Number(i.quantity), 0),
      // ── تفصيل بالصنف ──
      by_product: byProductArr,
      // ── تفصيل شهري ──
      by_month: byMonthArr,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "خطأ في حساب الأرباح" });
  }
});

export default router;
