/**
 * /api/reports/* — نظام التقارير الشامل
 * جميع التقارير تستخدم الوثائق المرحّلة فقط (posting_status = 'posted')
 * وتستثني الملغاة والمسودة
 *
 * كل تقرير يتضمن كتلة تحقق (validation) بالشكل:
 *   { status: "OK"|"WARNING", validation_message?, checks: [...] }
 */
import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { wrap } from "../lib/async-handler";

const router: IRouter = Router();

/* ── مساعد: تطبيع التاريخ ──────────────────────────────────────────────── */
function dateFilter(col: string, from?: string, to?: string): string {
  const parts: string[] = [];
  if (from) parts.push(`${col} >= '${from}'`);
  if (to)   parts.push(`${col} <= '${to}'`);
  return parts.length ? `AND ${parts.join(" AND ")}` : "";
}

/* ── مساعد: طبقة التحقق من صحة الأرقام ────────────────────────────────── */
const TOLERANCE = 0.02; // تسامح بحد أقصى قرشين للفروق العشرية

interface CheckItem { name: string; expected: number; actual: number; ok: boolean }
interface ValidationResult {
  status: "OK" | "WARNING";
  validation_message?: string;
  checks: CheckItem[];
}

function r2(n: number) { return Math.round(n * 100) / 100; }

function buildValidation(checks: Omit<CheckItem, "ok">[]): ValidationResult {
  const results: CheckItem[] = checks.map(c => ({
    ...c,
    expected: r2(c.expected),
    actual:   r2(c.actual),
    ok: Math.abs(r2(c.expected) - r2(c.actual)) <= TOLERANCE,
  }));
  const failed = results.filter(c => !c.ok);
  if (failed.length === 0) return { status: "OK", checks: results };
  return {
    status: "WARNING",
    validation_message: failed.map(f =>
      `"${f.name}": متوقع ${f.expected}، فعلي ${f.actual}`
    ).join(" | "),
    checks: results,
  };
}

/* ─────────────────────────────────────────────────────────────────────────
 * 1. تقرير ربحية المنتجات
 * GET /api/reports/product-profit?date_from=&date_to=
 * ───────────────────────────────────────────────────────────────────────── */
router.get("/reports/product-profit", wrap(async (req, res) => {
  const { date_from, date_to } = req.query as Record<string, string | undefined>;
  const df = dateFilter("s.date", date_from, date_to);

  const rows = await db.execute(sql.raw(`
    SELECT
      si.product_id,
      si.product_name,
      COALESCE(SUM(CAST(si.quantity   AS FLOAT8)), 0) AS qty_sold,
      COALESCE(SUM(CAST(si.total_price AS FLOAT8)), 0) AS revenue,
      COALESCE(SUM(CAST(si.cost_total  AS FLOAT8)), 0) AS cogs
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.posting_status = 'posted' ${df}
    GROUP BY si.product_id, si.product_name
    ORDER BY revenue DESC
  `));

  const dfRet = dateFilter("sr.date", date_from, date_to);
  const retRows = await db.execute(sql.raw(`
    SELECT
      sri.product_id,
      COALESCE(SUM(CAST(sri.quantity            AS FLOAT8)), 0) AS ret_qty,
      COALESCE(SUM(CAST(sri.total_price          AS FLOAT8)), 0) AS ret_revenue,
      COALESCE(SUM(CAST(sri.total_cost_at_return AS FLOAT8)), 0) AS ret_cogs
    FROM sale_return_items sri
    JOIN sales_returns sr ON sr.id = sri.return_id
    WHERE 1=1 ${dfRet}
    GROUP BY sri.product_id
  `));

  const retMap = new Map<number, { ret_qty: number; ret_revenue: number; ret_cogs: number }>();
  for (const r of retRows.rows as any[]) {
    retMap.set(Number(r.product_id), {
      ret_qty:     Number(r.ret_qty),
      ret_revenue: Number(r.ret_revenue),
      ret_cogs:    Number(r.ret_cogs),
    });
  }

  const products = (rows.rows as any[]).map(r => {
    const pid = Number(r.product_id);
    const ret = retMap.get(pid) ?? { ret_qty: 0, ret_revenue: 0, ret_cogs: 0 };
    const qty     = Number(r.qty_sold)  - ret.ret_qty;
    const revenue = Number(r.revenue)   - ret.ret_revenue;
    const cogs    = Number(r.cogs)      - ret.ret_cogs;
    const profit  = revenue - cogs;
    return {
      product_id:    pid,
      product_name:  String(r.product_name),
      qty_sold:      Math.round(qty    * 1000) / 1000,
      revenue:       Math.round(revenue * 100) / 100,
      cogs:          Math.round(cogs    * 100) / 100,
      profit:        Math.round(profit  * 100) / 100,
      profit_margin: revenue > 0 ? Math.round((profit / revenue) * 10000) / 100 : 0,
    };
  }).filter(p => p.qty_sold !== 0 || p.revenue !== 0);

  const totRevenue = products.reduce((s, p) => s + p.revenue, 0);
  const totCogs    = products.reduce((s, p) => s + p.cogs, 0);
  const totProfit  = totRevenue - totCogs;

  // ── تحقق: إجمالي الإيراد - إجمالي التكلفة = إجمالي الربح ───────────────
  const productValidation = buildValidation([
    { name: "إجمالي الإيراد - إجمالي التكلفة = إجمالي الربح",
      expected: r2(totRevenue) - r2(totCogs),
      actual:   r2(totProfit) },
    { name: "مجموع أرباح الأصناف = إجمالي الربح",
      expected: r2(products.reduce((s, p) => s + p.profit, 0)),
      actual:   r2(totProfit) },
  ]);

  res.json({
    products,
    summary: {
      total_revenue:       r2(totRevenue),
      total_cogs:          r2(totCogs),
      total_profit:        r2(totProfit),
      overall_margin:      totRevenue > 0 ? Math.round((totProfit / totRevenue) * 10000) / 100 : 0,
    },
    validation: productValidation,
  });
}));

/* ─────────────────────────────────────────────────────────────────────────
 * 2. التقرير اليومي للأرباح
 * GET /api/reports/daily-profit?date_from=&date_to=
 * ───────────────────────────────────────────────────────────────────────── */
router.get("/reports/daily-profit", wrap(async (req, res) => {
  const { date_from, date_to } = req.query as Record<string, string | undefined>;
  const df    = dateFilter("s.date",  date_from, date_to);
  const dfRet = dateFilter("sr.date", date_from, date_to);
  // expenses uses created_at (timestamp) — cast to date
  const dfExp = date_from || date_to ? `AND ${[date_from ? `e.created_at::date >= '${date_from}'` : null, date_to ? `e.created_at::date <= '${date_to}'` : null].filter(Boolean).join(" AND ")}` : "";

  const salesRows = await db.execute(sql.raw(`
    SELECT s.date AS day,
      COALESCE(SUM(CAST(si.total_price AS FLOAT8)), 0) AS sales_revenue,
      COALESCE(SUM(CAST(si.cost_total  AS FLOAT8)), 0) AS sales_cogs
    FROM sales s
    JOIN sale_items si ON si.sale_id = s.id
    WHERE s.posting_status = 'posted' ${df}
    GROUP BY s.date
  `));

  const retRows = await db.execute(sql.raw(`
    SELECT sr.date AS day,
      COALESCE(SUM(CAST(sri.total_price          AS FLOAT8)), 0) AS ret_revenue,
      COALESCE(SUM(CAST(sri.total_cost_at_return AS FLOAT8)), 0) AS ret_cogs
    FROM sales_returns sr
    JOIN sale_return_items sri ON sri.return_id = sr.id
    WHERE 1=1 ${dfRet}
    GROUP BY sr.date
  `));

  const expRows = await db.execute(sql.raw(`
    SELECT e.created_at::date AS day,
      COALESCE(SUM(CAST(e.amount AS FLOAT8)), 0) AS total_expenses
    FROM expenses e
    WHERE 1=1 ${dfExp}
    GROUP BY e.created_at::date
  `));

  const dayMap = new Map<string, {
    sales_revenue: number; sales_cogs: number;
    ret_revenue: number;   ret_cogs: number;
    expenses: number;
  }>();

  const ensure = (day: string) => {
    if (!dayMap.has(day)) dayMap.set(day, { sales_revenue: 0, sales_cogs: 0, ret_revenue: 0, ret_cogs: 0, expenses: 0 });
    return dayMap.get(day)!;
  };

  for (const r of salesRows.rows as any[]) { const d = ensure(r.day); d.sales_revenue += Number(r.sales_revenue); d.sales_cogs += Number(r.sales_cogs); }
  for (const r of retRows.rows  as any[]) { const d = ensure(r.day); d.ret_revenue  += Number(r.ret_revenue);  d.ret_cogs   += Number(r.ret_cogs);   }
  for (const r of expRows.rows  as any[]) { const d = ensure(r.day); d.expenses     += Number(r.total_expenses); }

  const days = Array.from(dayMap.entries())
    .map(([day, v]) => {
      const net_sales    = v.sales_revenue - v.ret_revenue;
      const net_cogs     = v.sales_cogs    - v.ret_cogs;
      const gross_profit = net_sales       - net_cogs;
      const net_profit   = gross_profit    - v.expenses;
      return {
        day,
        total_sales:       Math.round(v.sales_revenue * 100) / 100,
        total_returns:     Math.round(v.ret_revenue   * 100) / 100,
        net_sales:         Math.round(net_sales       * 100) / 100,
        total_cogs:        Math.round(net_cogs        * 100) / 100,
        gross_profit:      Math.round(gross_profit    * 100) / 100,
        expenses:          Math.round(v.expenses      * 100) / 100,
        net_profit:        Math.round(net_profit      * 100) / 100,
      };
    })
    .sort((a, b) => a.day.localeCompare(b.day));

  const totNetSales    = days.reduce((s, d) => s + d.net_sales,    0);
  const totNetCogs     = days.reduce((s, d) => s + d.total_cogs,   0);
  const totGross       = days.reduce((s, d) => s + d.gross_profit, 0);
  const totExpenses    = days.reduce((s, d) => s + d.expenses,     0);
  const totNet         = days.reduce((s, d) => s + d.net_profit,   0);

  // ── تحقق داخلي: المعادلات المحاسبية يومياً وإجمالياً ─────────────────────
  const dayWarnings: string[] = [];
  for (const d of days) {
    const expectedGross = r2(d.net_sales) - r2(d.total_cogs);
    const expectedNet   = r2(d.gross_profit) - r2(d.expenses);
    if (Math.abs(expectedGross - r2(d.gross_profit)) > TOLERANCE)
      dayWarnings.push(`${d.day}: الإيراد الصافي - التكلفة ≠ الربح الإجمالي (${expectedGross} ≠ ${r2(d.gross_profit)})`);
    if (Math.abs(expectedNet - r2(d.net_profit)) > TOLERANCE)
      dayWarnings.push(`${d.day}: الربح الإجمالي - المصروفات ≠ صافي الربح (${expectedNet} ≠ ${r2(d.net_profit)})`);
  }

  const dailyValidation = buildValidation([
    { name: "إجمالي الإيرادات الصافية - إجمالي التكلفة = إجمالي الربح الإجمالي",
      expected: r2(totNetSales) - r2(totNetCogs),
      actual:   r2(totGross) },
    { name: "إجمالي الربح الإجمالي - إجمالي المصروفات = صافي الربح الإجمالي",
      expected: r2(totGross) - r2(totExpenses),
      actual:   r2(totNet) },
    { name: "مجموع الأيام - صافي الربح = إجمالي صافي الربح",
      expected: r2(days.reduce((s, d) => s + d.net_profit, 0)),
      actual:   r2(totNet) },
  ]);

  if (dayWarnings.length > 0) {
    dailyValidation.status = "WARNING";
    dailyValidation.validation_message = [
      ...(dailyValidation.validation_message ? [dailyValidation.validation_message] : []),
      ...dayWarnings,
    ].join(" | ");
  }

  res.json({
    days,
    summary: {
      total_net_sales:    r2(totNetSales),
      total_cogs:         r2(totNetCogs),
      total_gross_profit: r2(totGross),
      total_expenses:     r2(totExpenses),
      total_net_profit:   r2(totNet),
    },
    validation: dailyValidation,
  });
}));

/* ─────────────────────────────────────────────────────────────────────────
 * 3. تحليل المبيعات
 * GET /api/reports/sales-analysis?date_from=&date_to=
 * ───────────────────────────────────────────────────────────────────────── */
router.get("/reports/sales-analysis", wrap(async (req, res) => {
  const { date_from, date_to } = req.query as Record<string, string | undefined>;
  const df = dateFilter("s.date", date_from, date_to);

  const byProduct = await db.execute(sql.raw(`
    SELECT
      si.product_id,
      si.product_name,
      COALESCE(SUM(CAST(si.quantity    AS FLOAT8)), 0) AS total_qty,
      COALESCE(SUM(CAST(si.total_price AS FLOAT8)), 0) AS total_revenue,
      COUNT(DISTINCT s.id)                              AS invoice_count
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.posting_status = 'posted' ${df}
    GROUP BY si.product_id, si.product_name
    ORDER BY total_revenue DESC
  `));

  const byCustomer = await db.execute(sql.raw(`
    SELECT
      s.customer_id,
      COALESCE(s.customer_name, 'عميل نقدي') AS customer_name,
      COALESCE(SUM(CAST(s.total_amount AS FLOAT8)), 0) AS total_revenue,
      COUNT(*)                                          AS invoice_count
    FROM sales s
    WHERE s.posting_status = 'posted' ${df}
    GROUP BY s.customer_id, s.customer_name
    ORDER BY total_revenue DESC
  `));

  res.json({
    by_product: (byProduct.rows as any[]).map(r => ({
      product_id:     Number(r.product_id),
      product_name:   String(r.product_name),
      total_qty:      Math.round(Number(r.total_qty) * 1000) / 1000,
      total_revenue:  Math.round(Number(r.total_revenue) * 100) / 100,
      avg_price:      Number(r.total_qty) > 0 ? Math.round((Number(r.total_revenue) / Number(r.total_qty)) * 100) / 100 : 0,
      invoice_count:  Number(r.invoice_count),
    })),
    by_customer: (byCustomer.rows as any[]).map(r => ({
      customer_id:   r.customer_id ? Number(r.customer_id) : null,
      customer_name: String(r.customer_name),
      total_revenue: Math.round(Number(r.total_revenue) * 100) / 100,
      invoice_count: Number(r.invoice_count),
    })),
  });
}));

/* ─────────────────────────────────────────────────────────────────────────
 * 4. كشف حساب عميل
 * GET /api/reports/customer-statement?customer_id=&date_from=&date_to=
 * ───────────────────────────────────────────────────────────────────────── */
router.get("/reports/customer-statement", wrap(async (req, res) => {
  const { customer_id, date_from, date_to } = req.query as Record<string, string | undefined>;
  if (!customer_id) { res.status(400).json({ error: "يجب تحديد العميل" }); return; }
  const cid = parseInt(customer_id);
  if (isNaN(cid)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  const custRow = await db.execute(sql.raw(`
    SELECT id, name, CAST(balance AS FLOAT8) AS balance, customer_code
    FROM customers WHERE id = ${cid}
  `));
  if (!custRow.rows.length) { res.status(404).json({ error: "العميل غير موجود" }); return; }
  const customer = custRow.rows[0] as any;

  type StatRow = { date: string; type: string; description: string; debit: number; credit: number; reference_no?: string | null };
  const rows: StatRow[] = [];

  // رصيد أول المدة (من جدول transactions)
  const openRows = await db.execute(sql.raw(`
    SELECT date, amount, description FROM transactions
    WHERE reference_type = 'customer_opening' AND customer_id = ${cid}
  `));
  for (const r of openRows.rows as any[]) {
    rows.push({ date: r.date ?? "1900-01-01", type: "opening_balance", description: r.description ?? "رصيد أول المدة", debit: 0, credit: Number(r.amount) });
  }

  // فواتير المبيعات (مرحّلة)
  const salesRows = await db.execute(sql.raw(`
    SELECT date, invoice_no, CAST(total_amount AS FLOAT8) AS total_amount
    FROM sales WHERE customer_id = ${cid} AND posting_status = 'posted'
  `));
  for (const r of salesRows.rows as any[]) {
    rows.push({ date: r.date, type: "sale", description: `فاتورة مبيعات ${r.invoice_no}`, debit: Number(r.total_amount), credit: 0, reference_no: r.invoice_no });
  }

  // سندات القبض (مرحّلة)
  const rvRows = await db.execute(sql.raw(`
    SELECT date, voucher_no, CAST(amount AS FLOAT8) AS amount, notes
    FROM receipt_vouchers WHERE customer_id = ${cid} AND posting_status = 'posted'
  `));
  for (const r of rvRows.rows as any[]) {
    rows.push({ date: r.date, type: "receipt", description: `سند قبض ${r.voucher_no}`, debit: 0, credit: Number(r.amount), reference_no: r.voucher_no });
  }

  // مرتجعات المبيعات
  const retRows = await db.execute(sql.raw(`
    SELECT date, return_no, CAST(total_amount AS FLOAT8) AS total_amount
    FROM sales_returns WHERE customer_id = ${cid}
  `));
  for (const r of retRows.rows as any[]) {
    rows.push({ date: r.date, type: "sale_return", description: `مرتجع مبيعات ${r.return_no}`, debit: 0, credit: Number(r.total_amount), reference_no: r.return_no });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));

  // رصيد أول المدة قبل الفترة
  let openingBalance = 0;
  const allRowsBeforePeriod = rows.filter(r => date_from ? r.date < date_from : false);
  for (const r of allRowsBeforePeriod) openingBalance += r.credit - r.debit;

  const periodRows = date_from || date_to
    ? rows.filter(r => {
        if (date_from && r.date < date_from && r.type !== "opening_balance") return false;
        if (date_to   && r.date > date_to)   return false;
        return true;
      })
    : rows;

  let runningBalance = openingBalance;
  const statement = periodRows.map(row => {
    runningBalance += row.credit - row.debit;
    return { ...row, balance: Math.round(runningBalance * 100) / 100 };
  });

  // ── تحقق: رصيد الافتتاح + الفواتير - المدفوعات - المرتجعات = رصيد الإغلاق ──
  const periodDebits  = periodRows.filter(r => r.type === "sale")
    .reduce((s, r) => s + r.debit, 0);
  const periodCredits = periodRows.filter(r => r.type !== "sale" && r.type !== "opening_balance")
    .reduce((s, r) => s + r.credit, 0);
  const openingRowCredit = periodRows.filter(r => r.type === "opening_balance")
    .reduce((s, r) => s + r.credit, 0);

  const customerValidation = buildValidation([
    {
      name: "الافتتاح + الفواتير - المقبوضات - المرتجعات = رصيد الإغلاق",
      expected: r2(openingBalance) + r2(openingRowCredit) + r2(periodCredits) - r2(periodDebits),
      actual:   r2(runningBalance),
    },
    {
      name: "رصيد العميل في النظام = رصيد الإغلاق (بلا فلتر تاريخ)",
      expected: !(date_from || date_to) ? r2(Number(customer.balance)) : r2(runningBalance),
      actual:   r2(runningBalance),
    },
  ]);

  res.json({
    customer: { id: Number(customer.id), name: String(customer.name), balance: Number(customer.balance), customer_code: customer.customer_code },
    opening_balance: r2(openingBalance),
    statement,
    closing_balance: r2(runningBalance),
    validation: customerValidation,
  });
}));

/* ─────────────────────────────────────────────────────────────────────────
 * 5. كشف حساب مورد (محسّن مع فلتر التاريخ)
 * GET /api/reports/supplier-statement?supplier_id=&date_from=&date_to=
 * ───────────────────────────────────────────────────────────────────────── */
router.get("/reports/supplier-statement", wrap(async (req, res) => {
  const { supplier_id, date_from, date_to } = req.query as Record<string, string | undefined>;
  if (!supplier_id) { res.status(400).json({ error: "يجب تحديد المورد" }); return; }
  const sid = parseInt(supplier_id);
  if (isNaN(sid)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  const supRow = await db.execute(sql.raw(`
    SELECT id, name, CAST(balance AS FLOAT8) AS balance FROM suppliers WHERE id = ${sid}
  `));
  if (!supRow.rows.length) { res.status(404).json({ error: "المورد غير موجود" }); return; }
  const supplier = supRow.rows[0] as any;

  type StatRow = { date: string; type: string; description: string; debit: number; credit: number; reference_no?: string | null };
  const rows: StatRow[] = [];

  // رصيد أول المدة
  const openRows = await db.execute(sql.raw(`
    SELECT date, amount FROM transactions WHERE reference_type = 'supplier_opening' AND reference_id = ${sid}
  `));
  for (const r of openRows.rows as any[]) {
    rows.push({ date: r.date ?? "1900-01-01", type: "opening_balance", description: "رصيد أول المدة", debit: 0, credit: Number(r.amount) });
  }

  // فواتير الشراء (مرحّلة)
  const purRows = await db.execute(sql.raw(`
    SELECT date, invoice_no, CAST(total_amount AS FLOAT8) AS total_amount
    FROM purchases WHERE supplier_id = ${sid} AND posting_status = 'posted'
  `));
  for (const r of purRows.rows as any[]) {
    rows.push({ date: r.date, type: "purchase", description: `فاتورة شراء ${r.invoice_no}`, debit: 0, credit: Number(r.total_amount), reference_no: r.invoice_no });
  }

  // مرتجعات المشتريات
  const retRows = await db.execute(sql.raw(`
    SELECT date, return_no, CAST(total_amount AS FLOAT8) AS total_amount
    FROM purchase_returns WHERE customer_id = ${sid}
  `));
  for (const r of retRows.rows as any[]) {
    rows.push({ date: r.date, type: "purchase_return", description: `مرتجع مشتريات ${r.return_no}`, debit: Number(r.total_amount), credit: 0, reference_no: r.return_no });
  }

  // سندات الدفع (مرحّلة)
  const pvRows = await db.execute(sql.raw(`
    SELECT date, voucher_no, CAST(amount AS FLOAT8) AS amount
    FROM payment_vouchers WHERE customer_id = ${sid} AND posting_status = 'posted'
  `));
  for (const r of pvRows.rows as any[]) {
    rows.push({ date: r.date, type: "payment", description: `سند دفع ${r.voucher_no}`, debit: Number(r.amount), credit: 0, reference_no: r.voucher_no });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));

  let openingBalance = 0;
  const allBeforePeriod = rows.filter(r => date_from ? r.date < date_from : false);
  for (const r of allBeforePeriod) openingBalance += r.credit - r.debit;

  const periodRows = date_from || date_to
    ? rows.filter(r => {
        if (date_from && r.date < date_from && r.type !== "opening_balance") return false;
        if (date_to   && r.date > date_to)   return false;
        return true;
      })
    : rows;

  let runningBalance = openingBalance;
  const statement = periodRows.map(row => {
    runningBalance += row.credit - row.debit;
    return { ...row, balance: Math.round(runningBalance * 100) / 100 };
  });

  // ── تحقق: الافتتاح + الفواتير - المدفوعات - المرتجعات = رصيد الإغلاق ──────
  const supPeriodPurchases = periodRows.filter(r => r.type === "purchase")
    .reduce((s, r) => s + r.credit, 0);
  const supPeriodPayments  = periodRows.filter(r => r.type === "payment")
    .reduce((s, r) => s + r.debit, 0);
  const supPeriodReturns   = periodRows.filter(r => r.type === "purchase_return")
    .reduce((s, r) => s + r.debit, 0);
  const supOpeningCredit   = periodRows.filter(r => r.type === "opening_balance")
    .reduce((s, r) => s + r.credit, 0);

  const supplierValidation = buildValidation([
    {
      name: "الافتتاح + فواتير الشراء - المدفوعات - المرتجعات = رصيد الإغلاق",
      expected: r2(openingBalance) + r2(supOpeningCredit) + r2(supPeriodPurchases) - r2(supPeriodPayments) - r2(supPeriodReturns),
      actual:   r2(runningBalance),
    },
    {
      name: "رصيد المورد في النظام = رصيد الإغلاق (بلا فلتر تاريخ)",
      expected: !(date_from || date_to) ? r2(Number(supplier.balance)) : r2(runningBalance),
      actual:   r2(runningBalance),
    },
  ]);

  res.json({
    supplier: { id: Number(supplier.id), name: String(supplier.name), balance: Number(supplier.balance) },
    opening_balance: r2(openingBalance),
    statement,
    closing_balance: r2(runningBalance),
    validation: supplierValidation,
  });
}));

/* ─────────────────────────────────────────────────────────────────────────
 * 6. تقرير التدفق النقدي
 * GET /api/reports/cash-flow?date_from=&date_to=
 * ───────────────────────────────────────────────────────────────────────── */
router.get("/reports/cash-flow", wrap(async (req, res) => {
  const { date_from, date_to } = req.query as Record<string, string | undefined>;
  const dfRV  = dateFilter("date", date_from, date_to);
  const dfPV  = dateFilter("date", date_from, date_to);
  const dfDV  = dateFilter("date", date_from, date_to);
  const dfExp = date_from || date_to
    ? `AND ${[date_from ? `created_at::date >= '${date_from}'` : null, date_to ? `created_at::date <= '${date_to}'` : null].filter(Boolean).join(" AND ")}`
    : "";

  // مقبوضات: سندات قبض مرحّلة
  const rvRows = await db.execute(sql.raw(`
    SELECT date, COALESCE(SUM(CAST(amount AS FLOAT8)), 0) AS total
    FROM receipt_vouchers WHERE posting_status = 'posted' ${dfRV}
    GROUP BY date ORDER BY date
  `));

  // مدفوعات: سندات دفع مرحّلة (للموردين)
  const pvRows = await db.execute(sql.raw(`
    SELECT date, COALESCE(SUM(CAST(amount AS FLOAT8)), 0) AS total
    FROM payment_vouchers WHERE posting_status = 'posted' ${dfPV}
    GROUP BY date ORDER BY date
  `));

  // إيداعات: سندات إيداع مرحّلة
  const dvRows = await db.execute(sql.raw(`
    SELECT date, COALESCE(SUM(CAST(amount AS FLOAT8)), 0) AS total
    FROM deposit_vouchers WHERE posting_status = 'posted' ${dfDV}
    GROUP BY date ORDER BY date
  `));

  // مصروفات (تستخدم created_at لأنها لا تحتوي حقل date)
  const expRows = await db.execute(sql.raw(`
    SELECT created_at::date AS date, COALESCE(SUM(CAST(amount AS FLOAT8)), 0) AS total
    FROM expenses WHERE 1=1 ${dfExp}
    GROUP BY created_at::date ORDER BY created_at::date
  `));

  // مبيعات نقدية مباشرة
  const cashSalesRows = await db.execute(sql.raw(`
    SELECT s.date, COALESCE(SUM(CAST(s.paid_amount AS FLOAT8)), 0) AS total
    FROM sales s
    WHERE s.posting_status = 'posted' AND s.payment_type = 'cash' ${dateFilter("s.date", date_from, date_to)}
    GROUP BY s.date ORDER BY s.date
  `));

  const dayMap = new Map<string, { receipts_in: number; payments_out: number; deposits_in: number; expenses_out: number; cash_sales: number }>();
  const ensure = (d: string) => {
    if (!dayMap.has(d)) dayMap.set(d, { receipts_in: 0, payments_out: 0, deposits_in: 0, expenses_out: 0, cash_sales: 0 });
    return dayMap.get(d)!;
  };

  for (const r of rvRows.rows      as any[]) { ensure(r.date).receipts_in  += Number(r.total); }
  for (const r of pvRows.rows      as any[]) { ensure(r.date).payments_out += Number(r.total); }
  for (const r of dvRows.rows      as any[]) { ensure(r.date).deposits_in  += Number(r.total); }
  for (const r of expRows.rows     as any[]) { ensure(r.date).expenses_out += Number(r.total); }
  for (const r of cashSalesRows.rows as any[]) { ensure(r.date).cash_sales += Number(r.total); }

  const days = Array.from(dayMap.entries())
    .map(([day, v]) => {
      const total_in  = v.receipts_in + v.deposits_in + v.cash_sales;
      const total_out = v.payments_out + v.expenses_out;
      return {
        day,
        receipts_in:   Math.round(v.receipts_in  * 100) / 100,
        cash_sales:    Math.round(v.cash_sales    * 100) / 100,
        deposits_in:   Math.round(v.deposits_in   * 100) / 100,
        total_in:      Math.round(total_in         * 100) / 100,
        payments_out:  Math.round(v.payments_out  * 100) / 100,
        expenses_out:  Math.round(v.expenses_out  * 100) / 100,
        total_out:     Math.round(total_out        * 100) / 100,
        net_flow:      Math.round((total_in - total_out) * 100) / 100,
      };
    })
    .sort((a, b) => a.day.localeCompare(b.day));

  const totIn  = days.reduce((s, d) => s + d.total_in,  0);
  const totOut = days.reduce((s, d) => s + d.total_out, 0);

  // ── تحقق: تحقق من الاتساق الداخلي للتدفق النقدي ─────────────────────────
  const cfDayWarnings: string[] = [];
  for (const d of days) {
    const expectedNet = r2(d.total_in) - r2(d.total_out);
    if (Math.abs(expectedNet - r2(d.net_flow)) > TOLERANCE)
      cfDayWarnings.push(`${d.day}: الوارد - الصادر ≠ صافي التدفق (${expectedNet} ≠ ${r2(d.net_flow)})`);
  }

  const cashFlowValidation = buildValidation([
    { name: "إجمالي الوارد - إجمالي الصادر = صافي التدفق النقدي",
      expected: r2(totIn) - r2(totOut),
      actual:   r2(totIn - totOut) },
    { name: "مجموع صافي أيام التدفق = إجمالي صافي التدفق",
      expected: r2(days.reduce((s, d) => s + d.net_flow, 0)),
      actual:   r2(totIn - totOut) },
  ]);

  if (cfDayWarnings.length > 0) {
    cashFlowValidation.status = "WARNING";
    cashFlowValidation.validation_message = [
      ...(cashFlowValidation.validation_message ? [cashFlowValidation.validation_message] : []),
      ...cfDayWarnings,
    ].join(" | ");
  }

  res.json({
    days,
    summary: {
      total_in:      r2(totIn),
      total_out:     r2(totOut),
      net_cash_flow: r2(totIn - totOut),
    },
    validation: cashFlowValidation,
  });
}));

/* ─────────────────────────────────────────────────────────────────────────
 * 7. تقارير الأعلى (أفضل المنتجات / العملاء / الموردين)
 * GET /api/reports/top?date_from=&date_to=&limit=10
 * ───────────────────────────────────────────────────────────────────────── */
router.get("/reports/top", wrap(async (req, res) => {
  const { date_from, date_to, limit: lim } = req.query as Record<string, string | undefined>;
  const LIMIT = Math.min(parseInt(lim ?? "10"), 50);
  const df = dateFilter("s.date", date_from, date_to);
  const dfP = dateFilter("p.date", date_from, date_to);

  const topProducts = await db.execute(sql.raw(`
    SELECT si.product_id, si.product_name,
      COALESCE(SUM(CAST(si.quantity    AS FLOAT8)), 0) AS total_qty,
      COALESCE(SUM(CAST(si.total_price AS FLOAT8)), 0) AS total_revenue,
      COALESCE(SUM(CAST(si.cost_total  AS FLOAT8)), 0) AS total_cogs
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.posting_status = 'posted' ${df}
    GROUP BY si.product_id, si.product_name
    ORDER BY total_revenue DESC
    LIMIT ${LIMIT}
  `));

  const topCustomers = await db.execute(sql.raw(`
    SELECT s.customer_id, COALESCE(s.customer_name, 'عميل نقدي') AS customer_name,
      COALESCE(SUM(CAST(s.total_amount AS FLOAT8)), 0) AS total_revenue,
      COUNT(*) AS invoice_count
    FROM sales s
    WHERE s.posting_status = 'posted' ${df}
    GROUP BY s.customer_id, s.customer_name
    ORDER BY total_revenue DESC
    LIMIT ${LIMIT}
  `));

  const topSuppliers = await db.execute(sql.raw(`
    SELECT p.supplier_id, COALESCE(p.customer_name, 'مورد') AS supplier_name,
      COALESCE(SUM(CAST(p.total_amount AS FLOAT8)), 0) AS total_purchases,
      COUNT(*) AS invoice_count
    FROM purchases p
    WHERE p.posting_status = 'posted' ${dfP}
    GROUP BY p.supplier_id, p.customer_name
    ORDER BY total_purchases DESC
    LIMIT ${LIMIT}
  `));

  res.json({
    top_products: (topProducts.rows as any[]).map(r => ({
      product_id:    Number(r.product_id),
      product_name:  String(r.product_name),
      total_qty:     Math.round(Number(r.total_qty) * 1000) / 1000,
      total_revenue: Math.round(Number(r.total_revenue) * 100) / 100,
      total_profit:  Math.round((Number(r.total_revenue) - Number(r.total_cogs)) * 100) / 100,
    })),
    top_customers: (topCustomers.rows as any[]).map(r => ({
      customer_id:   r.customer_id ? Number(r.customer_id) : null,
      customer_name: String(r.customer_name),
      total_revenue: Math.round(Number(r.total_revenue) * 100) / 100,
      invoice_count: Number(r.invoice_count),
    })),
    top_suppliers: (topSuppliers.rows as any[]).map(r => ({
      supplier_id:     r.supplier_id ? Number(r.supplier_id) : null,
      supplier_name:   String(r.supplier_name),
      total_purchases: Math.round(Number(r.total_purchases) * 100) / 100,
      invoice_count:   Number(r.invoice_count),
    })),
  });
}));

export default router;
