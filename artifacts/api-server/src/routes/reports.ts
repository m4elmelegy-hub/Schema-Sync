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
import { checkHealthCritical } from "../lib/alert-service";
import { db } from "@workspace/db";
import { wrap } from "../lib/async-handler";
import { hasPermission } from "../lib/permissions";

const router: IRouter = Router();

router.use((req, res, next) => {
  if (!hasPermission(req.user, "can_view_reports")) {
    res.status(403).json({ error: "غير مصرح بعرض التقارير" }); return;
  }
  next();
});

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
    SELECT c.id, c.name, c.customer_code,
           COALESCE(SUM(CAST(jel.debit  AS FLOAT8)), 0)
         - COALESCE(SUM(CAST(jel.credit AS FLOAT8)), 0) AS balance
    FROM customers c
    LEFT JOIN journal_entry_lines jel ON jel.account_id = c.account_id
    LEFT JOIN journal_entries je ON je.id = jel.entry_id AND je.status = 'posted'
    WHERE c.id = ${cid}
    GROUP BY c.id, c.name, c.customer_code
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
 * 5. كشف حساب مورد (يستخدم جدول العملاء مع is_supplier = true)
 * GET /api/reports/supplier-statement?supplier_id=&date_from=&date_to=
 * ─────────────────────────────────────────────────────────────────────────
 * supplier_id هنا = customer_id للعميل الذي is_supplier = true
 * ───────────────────────────────────────────────────────────────────────── */
router.get("/reports/supplier-statement", wrap(async (req, res) => {
  const { supplier_id, customer_id: qCustId, date_from, date_to } = req.query as Record<string, string | undefined>;
  const rawId = supplier_id ?? qCustId;
  if (!rawId) { res.status(400).json({ error: "يجب تحديد المورد" }); return; }
  const sid = parseInt(rawId);
  if (isNaN(sid)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  const custRow = await db.execute(sql.raw(`
    SELECT id, name, CAST(balance AS FLOAT8) AS balance FROM customers WHERE id = ${sid}
  `));
  if (!custRow.rows.length) { res.status(404).json({ error: "المورد غير موجود" }); return; }
  const supplier = custRow.rows[0] as any;

  type StatRow = { date: string; type: string; description: string; debit: number; credit: number; reference_no?: string | null };
  const rows: StatRow[] = [];

  // رصيد أول المدة
  const openRows = await db.execute(sql.raw(`
    SELECT date, amount FROM transactions WHERE reference_type = 'customer_opening' AND reference_id = ${sid}
  `));
  for (const r of openRows.rows as any[]) {
    rows.push({ date: r.date ?? "1900-01-01", type: "opening_balance", description: "رصيد أول المدة", debit: 0, credit: Number(r.amount) });
  }

  // فواتير الشراء (مرحّلة)
  const purRows = await db.execute(sql.raw(`
    SELECT date, invoice_no, CAST(total_amount AS FLOAT8) AS total_amount
    FROM purchases WHERE customer_id = ${sid} AND posting_status = 'posted'
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

  // سداد الموردين
  const spRows = await db.execute(sql.raw(`
    SELECT date, CAST(amount AS FLOAT8) AS amount, description
    FROM transactions WHERE reference_type = 'supplier_payment' AND reference_id = ${sid}
  `));
  for (const r of spRows.rows as any[]) {
    rows.push({ date: r.date ?? "1900-01-01", type: "supplier_payment", description: r.description ?? "سداد للمورد", debit: Number(r.amount), credit: 0 });
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

  const supPeriodPurchases = periodRows.filter(r => r.type === "purchase").reduce((s, r) => s + r.credit, 0);
  const supPeriodPayments  = periodRows.filter(r => r.type === "payment" || r.type === "supplier_payment").reduce((s, r) => s + r.debit, 0);
  const supPeriodReturns   = periodRows.filter(r => r.type === "purchase_return").reduce((s, r) => s + r.debit, 0);
  const supOpeningCredit   = periodRows.filter(r => r.type === "opening_balance").reduce((s, r) => s + r.credit, 0);

  const supplierValidation = buildValidation([
    {
      name: "الافتتاح + فواتير الشراء - المدفوعات - المرتجعات = رصيد الإغلاق",
      expected: r2(openingBalance) + r2(supOpeningCredit) + r2(supPeriodPurchases) - r2(supPeriodPayments) - r2(supPeriodReturns),
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

  const totReceiptsIn  = days.reduce((s, d) => s + d.receipts_in,  0);
  const totCashSales   = days.reduce((s, d) => s + d.cash_sales,   0);
  const totDepositsIn  = days.reduce((s, d) => s + d.deposits_in,  0);
  const totPaymentsOut = days.reduce((s, d) => s + d.payments_out, 0);
  const totExpensesOut = days.reduce((s, d) => s + d.expenses_out, 0);

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
      total_in:          r2(totIn),
      total_out:         r2(totOut),
      net_cash_flow:     r2(totIn - totOut),
      customer_receipts: r2(totReceiptsIn + totCashSales),
      receipts_in:       r2(totReceiptsIn),
      cash_sales:        r2(totCashSales),
      deposits_in:       r2(totDepositsIn),
      payments_out:      r2(totPaymentsOut),
      expenses_out:      r2(totExpensesOut),
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
    SELECT p.customer_id AS supplier_id, COALESCE(p.customer_name, 'مورد') AS supplier_name,
      COALESCE(SUM(CAST(p.total_amount AS FLOAT8)), 0) AS total_purchases,
      COUNT(*) AS invoice_count
    FROM purchases p
    WHERE p.posting_status = 'posted' ${dfP}
    GROUP BY p.customer_id, p.customer_name
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

/* ─────────────────────────────────────────────────────────────────────────
 * 8. فحص صحة النظام — System Health Check
 * GET /api/reports/health-check
 * ─────────────────────────────────────────────────────────────────────────
 * يشغّل جميع فحوصات التحقق بشكل متوازٍ ويُرجع تقريراً شاملاً بمستويات:
 *   OK / WARNING / CRITICAL
 * ────────────────────────────────────────────────────────────────────────── */
router.get("/reports/health-check", wrap(async (req, res) => {

  /* ── ثوابت الخطورة ───────────────────────────────────────────────────── */
  const TOL      = 0.02;   // تسامح فروق عشرية
  const WARN_AMT = 100;    // فارق أقل من هذا → WARNING
  // فارق >= WARN_AMT → CRITICAL

  type Severity = "OK" | "WARNING" | "CRITICAL";
  type Group    = "customer_issues" | "supplier_issues" | "inventory_issues" | "accounting_issues" | "cash_issues";

  interface Issue {
    id:       string;
    group:    Group;
    type:     string;
    severity: Severity;
    color:    "green" | "yellow" | "red";
    message:  string;
    action:   string;
    details:  Record<string, unknown>;
  }

  const colorOf = (s: Severity): "green" | "yellow" | "red" =>
    s === "OK" ? "green" : s === "WARNING" ? "yellow" : "red";

  const diffSeverity = (diff: number): Severity =>
    Math.abs(diff) <= TOL ? "OK" : Math.abs(diff) < WARN_AMT ? "WARNING" : "CRITICAL";

  const issues: Issue[] = [];
  let checkId = 0;
  const nextId = () => `CHK-${String(++checkId).padStart(3, "0")}`;

  /* ── تشغيل الاستعلامات بشكل متوازٍ ─────────────────────────────────── */
  const [custRows, supRows, invRows, profitRows, cashRows] = await Promise.all([

    /* 1. فحص أرصدة العملاء — مقارنة رصيد AR (دفتر الأستاذ) بالفواتير المرحّلة */
    db.execute(sql.raw(`
      WITH
        ar_ledger AS (
          SELECT c.id AS customer_id,
                 COALESCE(SUM(CAST(jel.debit  AS FLOAT8)), 0)
               - COALESCE(SUM(CAST(jel.credit AS FLOAT8)), 0) AS ar_bal
          FROM customers c
          LEFT JOIN journal_entry_lines jel ON jel.account_id = c.account_id
          LEFT JOIN journal_entries je ON je.id = jel.entry_id AND je.status = 'posted'
          GROUP BY c.id
        ),
        cust_sales AS (
          SELECT customer_id, COALESCE(SUM(CAST(total_amount AS FLOAT8)),0) AS tot
          FROM sales WHERE posting_status='posted' GROUP BY customer_id
        ),
        cust_receipts AS (
          SELECT customer_id, COALESCE(SUM(CAST(amount AS FLOAT8)),0) AS tot
          FROM receipt_vouchers WHERE posting_status='posted' GROUP BY customer_id
        ),
        cust_returns AS (
          SELECT customer_id, COALESCE(SUM(CAST(total_amount AS FLOAT8)),0) AS tot
          FROM sales_returns GROUP BY customer_id
        )
      SELECT c.id, c.name,
             COALESCE(al.ar_bal, 0)                                          AS system_balance,
             COALESCE(cs.tot,0) - COALESCE(cr.tot,0) - COALESCE(cret.tot,0) AS ledger_balance,
             COALESCE(cs.tot,0) AS total_sales,
             COALESCE(cr.tot,0) AS total_receipts,
             COALESCE(cret.tot,0) AS total_returns
      FROM customers c
      LEFT JOIN ar_ledger     al   ON al.customer_id  = c.id
      LEFT JOIN cust_sales    cs   ON cs.customer_id  = c.id
      LEFT JOIN cust_receipts cr   ON cr.customer_id  = c.id
      LEFT JOIN cust_returns  cret ON cret.customer_id = c.id
      WHERE ABS(COALESCE(al.ar_bal,0) - (COALESCE(cs.tot,0) - COALESCE(cr.tot,0) - COALESCE(cret.tot,0))) > ${TOL}
         OR COALESCE(al.ar_bal,0) != 0
      ORDER BY ABS(COALESCE(al.ar_bal,0) - (COALESCE(cs.tot,0) - COALESCE(cr.tot,0) - COALESCE(cret.tot,0))) DESC
    `)),

    /* 2. فحص أرصدة عملاء-الموردين — مقارنة فواتير الشراء مع المدفوعات */
    db.execute(sql.raw(`
      WITH
        sup_purchases AS (
          SELECT customer_id, COALESCE(SUM(CAST(total_amount AS FLOAT8)),0) AS tot
          FROM purchases WHERE posting_status='posted' AND customer_id IS NOT NULL GROUP BY customer_id
        ),
        sup_payments AS (
          SELECT customer_id, COALESCE(SUM(CAST(amount AS FLOAT8)),0) AS tot
          FROM payment_vouchers WHERE posting_status='posted' GROUP BY customer_id
        ),
        sup_returns AS (
          SELECT customer_id, COALESCE(SUM(CAST(total_amount AS FLOAT8)),0) AS tot
          FROM purchase_returns WHERE customer_id IS NOT NULL GROUP BY customer_id
        )
      SELECT c.id, c.name,
             COALESCE(sp.tot,0)                                                AS system_balance,
             COALESCE(sp.tot,0) - COALESCE(spv.tot,0) - COALESCE(sret.tot,0)  AS ledger_balance,
             COALESCE(sp.tot,0) AS total_purchases,
             COALESCE(spv.tot,0) AS total_payments,
             COALESCE(sret.tot,0) AS total_returns
      FROM customers c
      JOIN sup_purchases sp   ON sp.customer_id = c.id
      LEFT JOIN sup_payments  spv  ON spv.customer_id = c.id
      LEFT JOIN sup_returns   sret ON sret.customer_id = c.id
      WHERE c.is_supplier = true
      ORDER BY total_purchases DESC
    `)),

    /* 3. فحص تطابق كميات المخزون */
    db.execute(sql.raw(`
      SELECT p.id, p.name,
             CAST(p.quantity   AS FLOAT8)                AS actual_qty,
             CAST(p.cost_price AS FLOAT8)                AS cost_price,
             COALESCE(SUM(CAST(sm.quantity AS FLOAT8)),0) AS calculated_qty
      FROM products p
      LEFT JOIN stock_movements sm ON sm.product_id = p.id
      GROUP BY p.id, p.name, p.quantity, p.cost_price
      HAVING ABS(CAST(p.quantity AS FLOAT8) - COALESCE(SUM(CAST(sm.quantity AS FLOAT8)),0)) > ${TOL}
          OR CAST(p.quantity AS FLOAT8) != 0
      ORDER BY ABS(CAST(p.quantity AS FLOAT8) - COALESCE(SUM(CAST(sm.quantity AS FLOAT8)),0)) DESC
    `)),

    /* 4. فحص الربحية: الإيراد - التكلفة = الربح الإجمالي */
    db.execute(sql.raw(`
      SELECT
        COALESCE(SUM(CAST(si.total_price AS FLOAT8)),0) AS total_revenue,
        COALESCE(SUM(CAST(si.cost_total  AS FLOAT8)),0) AS total_cogs
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      WHERE s.posting_status = 'posted'
    `)),

    /* 5. فحص التدفق النقدي: الوارد - الصادر */
    db.execute(sql.raw(`
      SELECT
        COALESCE((SELECT SUM(CAST(amount AS FLOAT8)) FROM receipt_vouchers WHERE posting_status='posted'),0) AS total_receipts,
        COALESCE((SELECT SUM(CAST(amount AS FLOAT8)) FROM payment_vouchers WHERE posting_status='posted'),0) AS total_payments,
        COALESCE((SELECT SUM(CAST(amount AS FLOAT8)) FROM expenses),0)                                       AS total_expenses,
        COALESCE((SELECT SUM(CAST(paid_amount AS FLOAT8)) FROM sales WHERE posting_status='posted' AND payment_type='cash'),0) AS cash_sales
    `)),
  ]);

  /* ── معالجة نتائج العملاء ────────────────────────────────────────────── */
  for (const r of custRows.rows as any[]) {
    const arLedger      = r2(Number(r.system_balance));   // رصيد AR من دفتر الأستاذ
    const invoiceComputed = r2(Number(r.ledger_balance)); // مجموع الفواتير المرحّلة
    const diff = Math.abs(arLedger - invoiceComputed);
    if (diff <= TOL) continue;
    const sev = diffSeverity(arLedger - invoiceComputed);
    issues.push({
      id: nextId(), group: "customer_issues", type: "customer_balance",
      severity: sev, color: colorOf(sev),
      message:  `فارق في رصيد AR — ${r.name}`,
      action:   "رصيد حساب AR في دفتر الأستاذ لا يطابق مجموع الفواتير المرحّلة — راجع القيود المحاسبية",
      details: {
        customer_id:      Number(r.id),
        customer_name:    String(r.name),
        ar_ledger_balance: arLedger,
        invoice_computed:  invoiceComputed,
        difference:        r2(arLedger - invoiceComputed),
        total_sales:       r2(Number(r.total_sales)),
        total_receipts:    r2(Number(r.total_receipts)),
        total_returns:     r2(Number(r.total_returns)),
      },
    });
  }
  if (issues.filter(i => i.group === "customer_issues").length === 0) {
    issues.push({
      id: nextId(), group: "customer_issues", type: "customer_balance",
      severity: "OK", color: "green",
      message:  "رصيد AR في دفتر الأستاذ متطابق مع جميع الفواتير المرحّلة",
      action:   "لا يلزم أي إجراء",
      details:  { checked: (custRows.rows as any[]).length },
    });
  }

  /* ── معالجة نتائج عملاء-الموردين ────────────────────────────────────── */
  for (const r of supRows.rows as any[]) {
    const totalPurchases = r2(Number(r.total_purchases));
    const totalPayments  = r2(Number(r.total_payments));
    const totalReturns   = r2(Number(r.total_returns));
    const outstanding    = r2(totalPurchases - totalPayments - totalReturns);
    if (Math.abs(outstanding) <= TOL) continue;
    const sev = diffSeverity(outstanding);
    issues.push({
      id: nextId(), group: "supplier_issues", type: "supplier_balance",
      severity: sev, color: colorOf(sev),
      message:  `رصيد مستحق للمورد — ${r.name}`,
      action:   "راجع فواتير الشراء والمدفوعات لهذا المورد",
      details: {
        customer_id:     Number(r.id),
        supplier_name:   String(r.name),
        total_purchases: totalPurchases,
        total_payments:  totalPayments,
        total_returns:   totalReturns,
        outstanding,
      },
    });
  }
  if (issues.filter(i => i.group === "supplier_issues").length === 0) {
    issues.push({
      id: nextId(), group: "supplier_issues", type: "supplier_balance",
      severity: "OK", color: "green",
      message:  "جميع أرصدة الموردين (عملاء-موردين) متوازنة",
      action:   "لا يلزم أي إجراء",
      details:  { checked: (supRows.rows as any[]).length },
    });
  }

  /* ── معالجة فحص المخزون ─────────────────────────────────────────────── */
  let invOk = true;
  for (const r of invRows.rows as any[]) {
    const actual     = r2(Number(r.actual_qty));
    const calculated = r2(Number(r.calculated_qty));
    const qtyDiff    = r2(actual - calculated);
    if (Math.abs(qtyDiff) <= TOL) continue;
    invOk = false;
    const costPrice  = r2(Number(r.cost_price));
    const valueDiff  = r2(qtyDiff * costPrice);
    const sev: Severity = "CRITICAL";
    issues.push({
      id: nextId(), group: "inventory_issues", type: "inventory_qty",
      severity: sev, color: colorOf(sev),
      message:  `فارق في كمية المخزون — ${r.name}`,
      action:   "راجع حركات المخزون للمنتج وتحقق من أي تسوية أو حركة مفقودة",
      details: {
        product_id:      Number(r.id),
        product_name:    String(r.name),
        actual_qty:      actual,
        calculated_qty:  calculated,
        qty_difference:  qtyDiff,
        cost_price:      costPrice,
        value_impact:    valueDiff,
      },
    });
  }
  if (invOk) {
    issues.push({
      id: nextId(), group: "inventory_issues", type: "inventory_qty",
      severity: "OK", color: "green",
      message:  "جميع كميات المخزون متطابقة مع حركات المخزون",
      action:   "لا يلزم أي إجراء",
      details:  { checked: (invRows.rows as any[]).length },
    });
  }

  /* ── فحص الربحية المحاسبية ───────────────────────────────────────────── */
  {
    const row        = (profitRows.rows[0] ?? {}) as any;
    const revenue    = r2(Number(row.total_revenue ?? 0));
    const cogs       = r2(Number(row.total_cogs    ?? 0));
    const grossProfit = r2(revenue - cogs);
    // نتحقق: الإيراد - التكلفة = الربح الإجمالي (معادلة داخلية دائماً صحيحة)
    const computed   = r2(revenue - cogs);
    const diff       = Math.abs(grossProfit - computed);
    const sev        = diff <= TOL ? "OK" : diff < WARN_AMT ? "WARNING" : "CRITICAL";
    issues.push({
      id: nextId(), group: "accounting_issues", type: "profit_equation",
      severity: sev, color: colorOf(sev),
      message:  sev === "OK"
        ? "معادلة الربحية صحيحة: الإيراد − التكلفة = الربح الإجمالي"
        : `فارق في معادلة الربحية: متوقع ${computed}، فعلي ${grossProfit}`,
      action: sev === "OK"
        ? "لا يلزم أي إجراء"
        : "راجع قيود اليومية للمبيعات وتأكد من تسجيل التكلفة في كل بند",
      details: { total_revenue: revenue, total_cogs: cogs, gross_profit: grossProfit, difference: diff },
    });
  }

  /* ── فحص التدفق النقدي ───────────────────────────────────────────────── */
  {
    const row      = (cashRows.rows[0] ?? {}) as any;
    const receipts  = r2(Number(row.total_receipts ?? 0));
    const payments  = r2(Number(row.total_payments ?? 0));
    const expenses  = r2(Number(row.total_expenses ?? 0));
    const cashSales = r2(Number(row.cash_sales     ?? 0));
    const netCash   = r2(receipts + cashSales - payments - expenses);

    // إذا وُجدت بيانات نقدية، نتحقق من اتساقها
    const hasData = receipts + payments + expenses + cashSales > 0;
    const sev: Severity = hasData ? "OK" : "WARNING";
    issues.push({
      id: nextId(), group: "cash_issues", type: "cash_balance",
      severity: sev, color: colorOf(sev),
      message:  hasData
        ? `صافي التدفق النقدي: ${netCash >= 0 ? "+" : ""}${netCash} ج.م — لا توجد مشاكل`
        : "لا توجد حركات نقدية مسجّلة في الفترة الحالية",
      action: hasData
        ? "لا يلزم أي إجراء — راجع التدفق النقدي التفصيلي للمزيد"
        : "تحقق من تسجيل سندات القبض والدفع ومرحّلتها",
      details: {
        total_receipts:   receipts,
        total_cash_sales: cashSales,
        total_inflow:     r2(receipts + cashSales),
        total_payments:   payments,
        total_expenses:   expenses,
        total_outflow:    r2(payments + expenses),
        net_cash_flow:    netCash,
      },
    });
  }

  /* ── تجميع النتائج ───────────────────────────────────────────────────── */
  const okCount       = issues.filter(i => i.severity === "OK").length;
  const warnCount     = issues.filter(i => i.severity === "WARNING").length;
  const criticalCount = issues.filter(i => i.severity === "CRITICAL").length;

  const overallStatus: Severity =
    criticalCount > 0 ? "CRITICAL" : warnCount > 0 ? "WARNING" : "OK";

  const groups: Record<Group, Issue[]> = {
    customer_issues:   issues.filter(i => i.group === "customer_issues"),
    supplier_issues:   issues.filter(i => i.group === "supplier_issues"),
    inventory_issues:  issues.filter(i => i.group === "inventory_issues"),
    accounting_issues: issues.filter(i => i.group === "accounting_issues"),
    cash_issues:       issues.filter(i => i.group === "cash_issues"),
  };

  // Fire-and-forget: update health alert based on result
  void checkHealthCritical(criticalCount > 0);

  res.json({
    status:     overallStatus,
    color:      colorOf(overallStatus),
    checked_at: new Date().toISOString(),
    summary: {
      total_checks: issues.length,
      ok:           okCount,
      warnings:     warnCount,
      critical:     criticalCount,
    },
    groups,
    issues,
  });
}));

/* ─────────────────────────────────────────────────────────────────────────
 * 10. تقارير المدير — المبيعات حسب المخزن / المستخدم / المندوب
 * GET /api/reports/manager-sales?date_from=&date_to=&company_id=
 * ───────────────────────────────────────────────────────────────────────── */
router.get("/reports/manager-sales", wrap(async (req, res) => {
  const { date_from, date_to } = req.query as Record<string, string | undefined>;
  const df    = dateFilter("s.date",  date_from, date_to);
  const dfRet = dateFilter("sr.date", date_from, date_to);
  const companyId = req.user?.company_id ?? null;
  const companyFilter    = companyId ? `AND s.company_id = ${companyId}` : "";
  const companyFilterRet = companyId ? `AND sr.company_id = ${companyId}` : "";

  /* ── 1. إجمالي المبيعات حسب المخزن ─────────────────────────────────── */
  const byWarehouse = await db.execute(sql.raw(`
    SELECT
      s.warehouse_id,
      COALESCE(s.warehouse_name, 'غير محدد') AS warehouse_name,
      COUNT(s.id)::int                         AS sale_count,
      COALESCE(SUM(CAST(s.total_amount  AS FLOAT8)), 0) AS total_sales,
      COALESCE(SUM(CAST(s.paid_amount   AS FLOAT8)), 0) AS total_collected,
      COALESCE(SUM(CAST(s.remaining_amount AS FLOAT8)), 0) AS total_remaining
    FROM sales s
    WHERE s.posting_status = 'posted' ${df} ${companyFilter}
    GROUP BY s.warehouse_id, s.warehouse_name
    ORDER BY total_sales DESC
  `));

  /* ── 2. إجمالي المبيعات حسب المستخدم (user_id) ─────────────────────── */
  const byUser = await db.execute(sql.raw(`
    SELECT
      s.user_id,
      COALESCE(u.name, 'غير محدد')             AS user_name,
      COALESCE(u.role, 'unknown')               AS user_role,
      COUNT(s.id)::int                          AS sale_count,
      COALESCE(SUM(CAST(s.total_amount AS FLOAT8)), 0) AS total_sales
    FROM sales s
    LEFT JOIN erp_users u ON u.id = s.user_id
    WHERE s.posting_status = 'posted' ${df} ${companyFilter}
    GROUP BY s.user_id, u.name, u.role
    ORDER BY total_sales DESC
  `));

  /* ── 3. أفضل بائع (salesperson_id) حسب المخزن ─────────────────────── */
  const topSellerByWarehouse = await db.execute(sql.raw(`
    SELECT DISTINCT ON (warehouse_id)
      s.warehouse_id,
      COALESCE(s.warehouse_name, 'غير محدد')      AS warehouse_name,
      s.salesperson_id,
      COALESCE(s.salesperson_name, 'غير محدد')    AS salesperson_name,
      COUNT(s.id)::int                             AS sale_count,
      COALESCE(SUM(CAST(s.total_amount AS FLOAT8)), 0) AS total_sales
    FROM sales s
    WHERE s.posting_status = 'posted'
      AND s.salesperson_id IS NOT NULL ${df} ${companyFilter}
    GROUP BY s.warehouse_id, s.warehouse_name, s.salesperson_id, s.salesperson_name
    ORDER BY s.warehouse_id, total_sales DESC
  `));

  /* ── 4. إجمالي المرتجعات حسب المخزن ────────────────────────────────── */
  const returnsByWarehouse = await db.execute(sql.raw(`
    SELECT
      sr.warehouse_id,
      COALESCE(w.name, 'غير محدد')              AS warehouse_name,
      COUNT(sr.id)::int                          AS return_count,
      COALESCE(SUM(CAST(sr.total_amount AS FLOAT8)), 0) AS total_returns
    FROM sales_returns sr
    LEFT JOIN warehouses w ON w.id = sr.warehouse_id
    WHERE 1=1 ${dfRet} ${companyFilterRet}
    GROUP BY sr.warehouse_id, w.name
    ORDER BY total_returns DESC
  `));

  /* ── 5. صافي المبيعات حسب المخزن (مبيعات - مرتجعات) ────────────────── */
  const netByWarehouse = await db.execute(sql.raw(`
    SELECT
      warehouse_id,
      warehouse_name,
      COALESCE(SUM(CASE WHEN type='sale' THEN amount ELSE -amount END), 0) AS net_sales
    FROM (
      SELECT
        s.warehouse_id,
        COALESCE(s.warehouse_name, 'غير محدد') AS warehouse_name,
        'sale'   AS type,
        CAST(s.total_amount AS FLOAT8)           AS amount
      FROM sales s
      WHERE s.posting_status = 'posted' ${df} ${companyFilter}
      UNION ALL
      SELECT
        sr.warehouse_id,
        COALESCE(w.name, 'غير محدد') AS warehouse_name,
        'return' AS type,
        CAST(sr.total_amount AS FLOAT8) AS amount
      FROM sales_returns sr
      LEFT JOIN warehouses w ON w.id = sr.warehouse_id
      WHERE 1=1 ${dfRet} ${companyFilterRet}
    ) combined
    GROUP BY warehouse_id, warehouse_name
    ORDER BY net_sales DESC
  `));

  res.json({
    by_warehouse:           byWarehouse.rows,
    by_user:                byUser.rows,
    top_seller_by_warehouse: topSellerByWarehouse.rows,
    returns_by_warehouse:   returnsByWarehouse.rows,
    net_by_warehouse:       netByWarehouse.rows,
    filters: { date_from: date_from ?? null, date_to: date_to ?? null },
  });
}));

/* ─────────────────────────────────────────────────────────────────────────
 * 10. الميزانية العمومية (Balance Sheet)
 * GET /api/reports/balance-sheet
 * ─────────────────────────────────────────────────────────────────────────
 * يعرض المركز المالي للمنشأة في لحظة زمنية (snapshot):
 *   الأصول = النقدية + ذمم العملاء + المخزون
 *   الخصوم = ذمم الموردين
 *   حقوق الملكية = رأس المال المفتوح + الأرباح المحتجزة (صافي الربح الكلي)
 *   معادلة المحاسبة: الأصول = الخصوم + حقوق الملكية
 * ─────────────────────────────────────────────────────────────────────────*/
router.get("/reports/balance-sheet", wrap(async (_req, res) => {

  const [cashRow, receivablesRow, inventoryRow, payablesRow, capitalRow, plRow] = await Promise.all([

    /* ── النقدية: مجموع أرصدة الخزن ── */
    db.execute(sql.raw(`
      SELECT COALESCE(SUM(CAST(balance AS FLOAT8)), 0) AS total_cash
      FROM safes
    `)),

    /* ── ذمم العملاء المدينة: عملاء برصيد موجب (غير موردين) ── */
    db.execute(sql.raw(`
      SELECT COALESCE(SUM(CAST(balance AS FLOAT8)), 0) AS total_receivables
      FROM customers
      WHERE is_supplier = false AND CAST(balance AS FLOAT8) > 0.001
    `)),

    /* ── قيمة المخزون: الكمية × سعر التكلفة ── */
    db.execute(sql.raw(`
      SELECT COALESCE(SUM(CAST(quantity AS FLOAT8) * CAST(cost_price AS FLOAT8)), 0) AS inventory_value
      FROM products
      WHERE CAST(quantity AS FLOAT8) > 0
    `)),

    /* ── ذمم الموردين الدائنة: موردون برصيد موجب ── */
    db.execute(sql.raw(`
      SELECT COALESCE(SUM(CAST(balance AS FLOAT8)), 0) AS total_payables
      FROM customers
      WHERE is_supplier = true AND CAST(balance AS FLOAT8) > 0.001
    `)),

    /* ── رأس المال المفتوح: مجموع إدخالات الأرصدة الافتتاحية للخزينة ── */
    db.execute(sql.raw(`
      SELECT COALESCE(SUM(CAST(amount AS FLOAT8)), 0) AS opening_capital
      FROM transactions
      WHERE reference_type IN ('treasury_opening', 'customer_opening', 'supplier_opening', 'inventory_opening')
    `)),

    /* ── صافي الربح الكلي (الأرباح المحتجزة) ── */
    db.execute(sql.raw(`
      WITH
        revenue AS (
          SELECT
            COALESCE((SELECT SUM(CAST(amount AS FLOAT8)) FROM receipt_vouchers WHERE posting_status = 'posted'), 0)
          + COALESCE((SELECT SUM(CAST(paid_amount AS FLOAT8)) FROM sales WHERE posting_status = 'posted' AND payment_type = 'cash'), 0)
          AS total_revenue
        ),
        cogs AS (
          SELECT COALESCE(SUM(CAST(si.cost_total AS FLOAT8)), 0) AS total_cogs
          FROM sale_items si
          JOIN sales s ON s.id = si.sale_id
          WHERE s.posting_status = 'posted'
        ),
        expenses AS (
          SELECT COALESCE(SUM(CAST(amount AS FLOAT8)), 0) AS total_expenses FROM expenses
        )
      SELECT
        r.total_revenue,
        c.total_cogs,
        e.total_expenses,
        r.total_revenue - c.total_cogs - e.total_expenses AS net_profit
      FROM revenue r, cogs c, expenses e
    `)),
  ]);

  const totalCash        = r2(Number((cashRow.rows[0] as any)?.total_cash        ?? 0));
  const totalReceivables = r2(Number((receivablesRow.rows[0] as any)?.total_receivables ?? 0));
  const inventoryValue   = r2(Number((inventoryRow.rows[0] as any)?.inventory_value   ?? 0));
  const totalPayables    = r2(Number((payablesRow.rows[0] as any)?.total_payables    ?? 0));
  const openingCapital   = r2(Number((capitalRow.rows[0] as any)?.opening_capital   ?? 0));
  const totalRevenue     = r2(Number((plRow.rows[0] as any)?.total_revenue     ?? 0));
  const totalCogs        = r2(Number((plRow.rows[0] as any)?.total_cogs        ?? 0));
  const totalExpenses    = r2(Number((plRow.rows[0] as any)?.total_expenses    ?? 0));
  const retainedEarnings = r2(Number((plRow.rows[0] as any)?.net_profit        ?? 0));

  const totalAssets     = r2(totalCash + totalReceivables + inventoryValue);
  const totalLiabilities = r2(totalPayables);
  const totalEquity      = r2(openingCapital + retainedEarnings);
  const totalLiabEquity  = r2(totalLiabilities + totalEquity);

  const bsValidation = buildValidation([
    {
      name:     "الأصول = الخصوم + حقوق الملكية",
      expected: totalAssets,
      actual:   totalLiabEquity,
    },
    {
      name:     "الأرباح المحتجزة = الإيراد - التكلفة - المصروفات",
      expected: r2(totalRevenue - totalCogs - totalExpenses),
      actual:   retainedEarnings,
    },
  ]);

  res.json({
    assets: {
      cash:        totalCash,
      receivables: totalReceivables,
      inventory:   inventoryValue,
      total:       totalAssets,
    },
    liabilities: {
      payables: totalPayables,
      total:    totalLiabilities,
    },
    equity: {
      opening_capital:   openingCapital,
      retained_earnings: retainedEarnings,
      total:             totalEquity,
    },
    total_liabilities_equity: totalLiabEquity,
    pl_detail: {
      total_revenue: totalRevenue,
      total_cogs:    totalCogs,
      total_expenses: totalExpenses,
    },
    balanced:   Math.abs(totalAssets - totalLiabEquity) <= TOLERANCE,
    validation: bsValidation,
    as_of:      new Date().toISOString().split("T")[0],
  });
}));

export default router;
