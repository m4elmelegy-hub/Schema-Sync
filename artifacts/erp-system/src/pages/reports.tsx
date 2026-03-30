import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGetProducts, useGetSales, useGetPurchases } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  AlertTriangle, TrendingUp, TrendingDown, Package, FileText,
  DollarSign, X, ChevronDown, ChevronUp, ShoppingBag, ShoppingCart,
  Search, FileDown, Printer, Loader2, BarChart3, RotateCcw,
} from "lucide-react";
import { exportSalesExcel, exportPurchasesExcel } from "@/lib/export-excel";
import { printSalesReport, printPurchasesReport, printSaleInvoice, printPurchaseInvoice, printPLReport } from "@/lib/export-pdf";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";
import { TableSkeleton } from "@/components/skeletons";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api  = (p: string) => `${BASE}${p}`;
const getToken = () => localStorage.getItem("erp_auth_token") ?? "";
const authFetch = <T,>(url: string): Promise<T> =>
  fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } })
    .then(r => { if (!r.ok) throw new Error("API error"); return r.json() as Promise<T>; });

/* ─── Date helpers ──────────────────────────────────────────────────────────── */

function todayStr() { return new Date().toISOString().split("T")[0]; }
function thisMonthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function fmtMonth(m: string): string {
  const months = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  const [y, mon] = m.split("-");
  return `${months[parseInt(mon) - 1]} ${y}`;
}

/* ─── Small helpers ─────────────────────────────────────────────────────────── */

function PaymentBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    cash:    { label: "نقدي",  cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
    credit:  { label: "آجل",   cls: "bg-red-500/20 text-red-400 border-red-500/30" },
    partial: { label: "جزئي",  cls: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  };
  const d = map[type] || { label: type, cls: "bg-white/10 text-white/50 border-white/10" };
  return <span className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${d.cls}`}>{d.label}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    paid:    { label: "مدفوع",      cls: "text-emerald-400" },
    partial: { label: "جزئي",       cls: "text-yellow-400" },
    pending: { label: "معلق",       cls: "text-red-400" },
    unpaid:  { label: "غير مدفوع", cls: "text-red-400" },
  };
  const d = map[status] || { label: status, cls: "text-white/50" };
  return <span className={`text-xs font-bold ${d.cls}`}>{d.label}</span>;
}

/* ─── Per-row invoice PDF button ────────────────────────────────────────────── */

function InvoicePdfButton({ type, id }: { type: "sales" | "purchases"; id: number }) {
  const [loading, setLoading] = useState(false);
  const handleClick = async () => {
    setLoading(true);
    try {
      const data = await authFetch<any>(api(`/api/${type}/${id}`));
      if (type === "sales") printSaleInvoice(data);
      else                  printPurchaseInvoice(data);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  };
  return (
    <button
      onClick={handleClick}
      disabled={loading}
      title="طباعة فاتورة PDF"
      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-blue-500/15 border border-blue-500/25 text-blue-400 hover:bg-blue-500/25 disabled:opacity-50 transition-all"
    >
      {loading
        ? <Loader2 className="w-3 h-3 animate-spin" />
        : <Printer className="w-3 h-3" />
      }
      PDF
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  TAB 1: قائمة الأرباح والخسائر
 * ───────────────────────────────────────────────────────────────────────────── */

interface ProfitsData {
  total_revenue: number;
  total_cost: number;
  gross_profit: number;
  profit_margin: number;
  net_profit: number;
  total_expenses: number;
  invoice_count: number;
  item_count: number;
  by_product: Array<{ product_id: number; product_name: string; qty_sold: number; revenue: number; cost: number; profit: number }>;
  by_month: Array<{ month: string; revenue: number; cost: number; profit: number }>;
}

type DateMode = "today" | "week" | "month" | "year" | "custom";

const DATE_MODES: { id: DateMode; label: string }[] = [
  { id: "today", label: "اليوم" },
  { id: "week",  label: "الأسبوع" },
  { id: "month", label: "الشهر" },
  { id: "year",  label: "السنة" },
  { id: "custom", label: "مخصص" },
];

function getDateRange(mode: DateMode, customFrom: string, customTo: string): [string, string] {
  const t = todayStr();
  if (mode === "today")  return [t, t];
  if (mode === "week")   { const d = new Date(); d.setDate(d.getDate() - 7); return [d.toISOString().split("T")[0], t]; }
  if (mode === "month")  return [thisMonthStart(), t];
  if (mode === "year")   return [`${new Date().getFullYear()}-01-01`, t];
  return [customFrom, customTo];
}

const CHART_DARK = {
  grid: "rgba(255,255,255,0.06)",
  tick: { fill: "rgba(255,255,255,0.4)", fontSize: 11 },
  tooltip: { contentStyle: { background: "#1a2235", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#fff", fontSize: 12 }, cursor: { fill: "rgba(255,255,255,0.04)" } },
};

function ProfitLossReport() {
  const [mode, setMode]         = useState<DateMode>("month");
  const [customFrom, setCustomFrom] = useState(thisMonthStart());
  const [customTo,   setCustomTo]   = useState(todayStr());

  const [dateFrom, dateTo] = getDateRange(mode, customFrom, customTo);

  const { data: plData, isLoading } = useQuery<ProfitsData>({
    queryKey: ["/api/profits", dateFrom, dateTo],
    queryFn: () => {
      const p = new URLSearchParams();
      if (dateFrom) p.set("date_from", dateFrom);
      if (dateTo)   p.set("date_to",   dateTo);
      return authFetch<ProfitsData>(api(`/api/profits?${p.toString()}`));
    },
    staleTime: 60_000,
  });

  const pl = plData ?? { total_revenue: 0, total_cost: 0, gross_profit: 0, profit_margin: 0, net_profit: 0, total_expenses: 0, invoice_count: 0, item_count: 0, by_product: [], by_month: [] };

  const chartData = useMemo(() =>
    [...pl.by_month].sort((a, b) => a.month.localeCompare(b.month)).map(m => ({
      name: fmtMonth(m.month),
      مبيعات: +m.revenue.toFixed(2),
      تكلفة: +m.cost.toFixed(2),
      ربح: +m.profit.toFixed(2),
    })), [pl.by_month]);

  const barData = [
    { name: "مبيعات",     value: pl.total_revenue,   fill: "#10b981" },
    { name: "تكلفة COGS", value: pl.total_cost,      fill: "#ef4444" },
    { name: "مصروفات",    value: pl.total_expenses,  fill: "#f97316" },
    { name: "صافي الربح", value: Math.max(0, pl.net_profit), fill: pl.net_profit >= 0 ? "#f59e0b" : "#ef4444" },
  ];

  const top5 = useMemo(() =>
    [...pl.by_product].sort((a, b) => b.profit - a.profit).slice(0, 5),
    [pl.by_product]);

  const handleExport = () => {
    printPLReport({ dateFrom, dateTo, ...pl });
  };

  return (
    <div className="space-y-5">

      {/* ── Date filter bar ── */}
      <div className="flex flex-wrap items-center gap-2">
        {DATE_MODES.map(m => (
          <button key={m.id} onClick={() => setMode(m.id)}
            className={`px-4 py-1.5 rounded-xl text-sm font-bold border transition-all ${mode === m.id ? "bg-amber-500/20 border-amber-500/40 text-amber-400" : "glass-panel border-white/10 text-white/50 hover:text-white"}`}>
            {m.label}
          </button>
        ))}
        {mode === "custom" && (
          <>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="glass-input rounded-xl px-3 py-1.5 text-sm text-white" />
            <span className="text-white/30">←</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="glass-input rounded-xl px-3 py-1.5 text-sm text-white" />
          </>
        )}
        <button onClick={handleExport}
          className="mr-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-500/20 border border-blue-500/40 text-blue-400 hover:bg-blue-500/30 transition-all">
          <Printer className="w-3.5 h-3.5" /> تصدير PDF
        </button>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel rounded-2xl p-5 border border-emerald-500/15">
          <p className="text-emerald-400 text-xs mb-2 flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" /> إجمالي المبيعات</p>
          <p className="text-2xl font-black text-white">{isLoading ? "…" : formatCurrency(pl.total_revenue)}</p>
          <p className="text-white/30 text-xs mt-1">{pl.invoice_count} فاتورة</p>
        </div>
        <div className="glass-panel rounded-2xl p-5 border border-red-500/15">
          <p className="text-red-400 text-xs mb-2 flex items-center gap-1"><TrendingDown className="w-3.5 h-3.5" /> تكلفة البضاعة COGS</p>
          <p className="text-2xl font-black text-white">{isLoading ? "…" : formatCurrency(pl.total_cost)}</p>
          <p className="text-white/30 text-xs mt-1">{pl.item_count} صنف مباع</p>
        </div>
        <div className="glass-panel rounded-2xl p-5 border border-amber-500/15">
          <p className="text-amber-400 text-xs mb-2 flex items-center gap-1"><BarChart3 className="w-3.5 h-3.5" /> مجمل الربح</p>
          <p className="text-2xl font-black text-white">{isLoading ? "…" : formatCurrency(pl.gross_profit)}</p>
          <p className="text-white/30 text-xs mt-1">الهامش: {pl.profit_margin.toFixed(1)}%</p>
        </div>
        <div className={`glass-panel rounded-2xl p-5 border ${pl.net_profit >= 0 ? "border-blue-500/15" : "border-red-500/20"}`}>
          <p className={`text-xs mb-2 flex items-center gap-1 ${pl.net_profit >= 0 ? "text-blue-400" : "text-red-400"}`}>
            <DollarSign className="w-3.5 h-3.5" /> صافي الربح
          </p>
          <p className={`text-2xl font-black ${pl.net_profit >= 0 ? "text-white" : "text-red-400"}`}>
            {isLoading ? "…" : formatCurrency(pl.net_profit)}
          </p>
          <p className="text-white/30 text-xs mt-1">بعد المصروفات ({formatCurrency(pl.total_expenses)})</p>
        </div>
      </div>

      {/* ── P&L Statement + Bar chart ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* P&L accounting statement */}
        <div className="glass-panel rounded-2xl p-6 border border-white/5 space-y-0">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2"><FileText className="w-4 h-4 text-amber-400" /> قائمة الأرباح والخسائر</h3>
          <div className="space-y-0 font-mono text-sm">
            <div className="flex justify-between py-2.5 border-b border-white/10">
              <span className="text-white/70">إجمالي المبيعات</span>
              <span className="text-emerald-400 font-bold">{formatCurrency(pl.total_revenue)}</span>
            </div>
            <div className="flex justify-between py-2.5 border-b border-white/10">
              <span className="text-white/50 pr-4">(-) تكلفة البضاعة المباعة</span>
              <span className="text-red-400">({formatCurrency(pl.total_cost)})</span>
            </div>
            <div className="flex justify-between py-2.5 border-b-2 border-white/20 bg-amber-500/5 px-2 rounded-lg my-1">
              <span className="text-amber-400 font-bold">= مجمل الربح</span>
              <span className="text-amber-400 font-bold">{formatCurrency(pl.gross_profit)}</span>
            </div>
            <div className="flex justify-between py-2.5 border-b border-white/10">
              <span className="text-white/50 pr-4">(-) المصروفات</span>
              <span className="text-orange-400">({formatCurrency(pl.total_expenses)})</span>
            </div>
            <div className="flex justify-between py-2.5 border-b border-white/10">
              <span className="text-white/50 pr-4">(+) الإيرادات الأخرى</span>
              <span className="text-white/40">0.00</span>
            </div>
            <div className={`flex justify-between py-3 px-2 rounded-xl mt-2 ${pl.net_profit >= 0 ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-red-500/10 border border-red-500/20"}`}>
              <span className={`font-bold text-base ${pl.net_profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>= صافي الربح</span>
              <span className={`font-black text-base ${pl.net_profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatCurrency(pl.net_profit)}</span>
            </div>
          </div>
        </div>

        {/* Bar chart: P&L components */}
        <div className="glass-panel rounded-2xl p-5 border border-white/5">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-amber-400" /> ملخص مرئي</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_DARK.grid} />
              <XAxis dataKey="name" tick={CHART_DARK.tick} />
              <YAxis tick={CHART_DARK.tick} tickFormatter={v => formatCurrency(v).replace(/[^\d.,٠-٩]/g, "").slice(0, 6)} />
              <Tooltip
                contentStyle={CHART_DARK.tooltip.contentStyle}
                cursor={CHART_DARK.tooltip.cursor}
                formatter={(v: number) => [formatCurrency(v), ""]}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {barData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Trend chart (by month) ── */}
      {chartData.length > 0 && (
        <div className="glass-panel rounded-2xl p-5 border border-white/5">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-400" /> تطور الأداء الشهري</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_DARK.grid} />
              <XAxis dataKey="name" tick={CHART_DARK.tick} />
              <YAxis tick={CHART_DARK.tick} tickFormatter={v => formatCurrency(v).slice(0, 7)} />
              <Tooltip contentStyle={CHART_DARK.tooltip.contentStyle} formatter={(v: number) => [formatCurrency(v), ""]} />
              <Legend wrapperStyle={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }} />
              <Line type="monotone" dataKey="مبيعات" stroke="#10b981" strokeWidth={2} dot={{ r: 4, fill: "#10b981" }} />
              <Line type="monotone" dataKey="تكلفة"  stroke="#ef4444" strokeWidth={2} dot={{ r: 4, fill: "#ef4444" }} />
              <Line type="monotone" dataKey="ربح"    stroke="#f59e0b" strokeWidth={2} dot={{ r: 4, fill: "#f59e0b" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Top 5 products ── */}
      {top5.length > 0 && (
        <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
          <div className="p-4 border-b border-white/10 flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-amber-400" />
            <h3 className="text-white font-bold">أعلى 5 منتجات ربحية</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm whitespace-nowrap">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  <th className="p-3 text-white/50">المنتج</th>
                  <th className="p-3 text-white/50">كمية مباعة</th>
                  <th className="p-3 text-white/50">الإيراد</th>
                  <th className="p-3 text-white/50">التكلفة</th>
                  <th className="p-3 text-white/50">الربح</th>
                  <th className="p-3 text-white/50">الهامش%</th>
                </tr>
              </thead>
              <tbody>
                {top5.map((p, i) => {
                  const margin = p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0;
                  return (
                    <tr key={p.product_id} className="border-b border-white/5 erp-table-row">
                      <td className="p-3 font-bold text-white">
                        <span className="inline-flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-xs flex items-center justify-center font-bold flex-shrink-0">{i + 1}</span>
                          {p.product_name}
                        </span>
                      </td>
                      <td className="p-3 text-white/70">{p.qty_sold}</td>
                      <td className="p-3 text-emerald-400 font-bold">{formatCurrency(p.revenue)}</td>
                      <td className="p-3 text-red-400">{formatCurrency(p.cost)}</td>
                      <td className={`p-3 font-black ${p.profit >= 0 ? "text-amber-400" : "text-red-400"}`}>{formatCurrency(p.profit)}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${margin >= 30 ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" : margin >= 0 ? "bg-amber-500/15 border-amber-500/30 text-amber-400" : "bg-red-500/15 border-red-500/30 text-red-400"}`}>
                          {margin.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isLoading && pl.invoice_count === 0 && (
        <div className="glass-panel rounded-2xl p-12 text-center border border-white/5">
          <BarChart3 className="w-10 h-10 text-white/20 mx-auto mb-3" />
          <p className="text-white/40">لا توجد بيانات في هذه الفترة</p>
          <p className="text-white/25 text-xs mt-1">جرّب تغيير نطاق التاريخ</p>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  TAB 2: تقرير المخزن (enhanced)
 * ───────────────────────────────────────────────────────────────────────────── */

interface ProductDetail {
  actual_qty: number;
  opening_qty: number;
  purchased_qty: number;
  sold_qty: number;
  sale_return_qty: number;
  purchase_return_qty: number;
  adjustment_qty: number;
  movements: Array<{
    id: number;
    movement_type: string;
    quantity: number;
    quantity_before: number;
    quantity_after: number;
    reference_no: string | null;
    unit_cost: number;
    notes: string | null;
    created_at: string;
  }>;
}

const MOVE_LABELS: Record<string, { label: string; color: string }> = {
  opening_balance:  { label: "رصيد أول المدة", color: "text-amber-400" },
  purchase:         { label: "مشترى",           color: "text-blue-400"  },
  sale:             { label: "مبيعة",            color: "text-emerald-400" },
  sale_return:      { label: "مرتجع مبيعات",    color: "text-orange-400" },
  purchase_return:  { label: "مرتجع مشتريات",   color: "text-orange-400" },
  adjustment:       { label: "تسوية",            color: "text-slate-400"  },
};

function InventoryReport() {
  const { data: products = [], isLoading } = useGetProducts();
  const [catFilter, setCatFilter]           = useState("");
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);

  const categories = Array.from(new Set(products.map(p => p.category).filter((c): c is string => Boolean(c))));
  const filtered   = catFilter ? products.filter(p => p.category === catFilter) : products;

  const totalStockValue  = filtered.reduce((s, p) => s + p.quantity * p.cost_price, 0);
  const totalSaleValue   = filtered.reduce((s, p) => s + p.quantity * p.sale_price, 0);
  const potentialProfit  = totalSaleValue - totalStockValue;
  const lowStockItems    = filtered.filter(p => p.low_stock_threshold !== null && p.quantity > 0 && p.quantity <= (p.low_stock_threshold ?? 5));
  const outOfStock       = filtered.filter(p => p.quantity === 0);

  const selectedProduct  = products.find(p => p.id === selectedProductId);

  const { data: detail, isLoading: detailLoading } = useQuery<ProductDetail>({
    queryKey: ["/api/inventory/product", selectedProductId],
    enabled: !!selectedProductId,
    queryFn: () => authFetch<ProductDetail>(api(`/api/inventory/product/${selectedProductId}`)),
    staleTime: 30_000,
  });

  return (
    <div className="space-y-5">

      {/* Low stock alert banner */}
      {(lowStockItems.length > 0 || outOfStock.length > 0) && (
        <div className="flex flex-wrap gap-3">
          {outOfStock.length > 0 && (
            <div className="glass-panel rounded-2xl px-4 py-3 border border-red-500/30 bg-red-500/5 flex items-center gap-3">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="text-red-400 text-sm font-bold">{outOfStock.length} منتج نافذ المخزون</span>
              <span className="text-white/30 text-xs">{outOfStock.map(p => p.name).join("، ")}</span>
            </div>
          )}
          {lowStockItems.length > 0 && (
            <div className="glass-panel rounded-2xl px-4 py-3 border border-yellow-500/30 bg-yellow-500/5 flex items-center gap-3">
              <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
              <span className="text-yellow-400 text-sm font-bold">{lowStockItems.length} منتج وصل للحد الأدنى</span>
              <span className="text-white/30 text-xs">{lowStockItems.map(p => p.name).join("، ")}</span>
            </div>
          )}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel rounded-2xl p-5 border border-white/5">
          <p className="text-white/50 text-xs mb-1">إجمالي الأصناف</p>
          <p className="text-3xl font-black text-white">{filtered.length}</p>
          <p className="text-xs text-white/30 mt-1">صنف في المخزون</p>
        </div>
        <div className="glass-panel rounded-2xl p-5 border border-blue-500/10">
          <p className="text-blue-400 text-xs mb-1">قيمة المخزون (التكلفة)</p>
          <p className="text-xl font-black text-white">{formatCurrency(totalStockValue)}</p>
        </div>
        <div className="glass-panel rounded-2xl p-5 border border-emerald-500/10">
          <p className="text-emerald-400 text-xs mb-1">قيمة المخزون (البيع)</p>
          <p className="text-xl font-black text-white">{formatCurrency(totalSaleValue)}</p>
        </div>
        <div className="glass-panel rounded-2xl p-5 border border-amber-500/10">
          <p className="text-amber-400 text-xs mb-1">الربح المتوقع</p>
          <p className="text-xl font-black text-white">{formatCurrency(potentialProfit)}</p>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-white/40 text-xs">التصنيف:</span>
        <button onClick={() => setCatFilter("")}
          className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${!catFilter ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "bg-white/5 text-white/50 border-white/10 hover:bg-white/10"}`}>
          الكل ({products.length})
        </button>
        {categories.map(cat => (
          <button key={cat} onClick={() => setCatFilter(cat)}
            className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${catFilter === cat ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "bg-white/5 text-white/50 border-white/10 hover:bg-white/10"}`}>
            {cat} ({products.filter(p => p.category === cat).length})
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-4 text-white/60">المنتج</th>
                <th className="p-4 text-white/60">التصنيف</th>
                <th className="p-4 text-white/60">الكمية</th>
                <th className="p-4 text-white/60">سعر التكلفة</th>
                <th className="p-4 text-white/60">سعر البيع</th>
                <th className="p-4 text-white/60">قيمة المخزون</th>
                <th className="p-4 text-white/60">هامش الربح</th>
                <th className="p-4 text-white/60">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <TableSkeleton cols={8} rows={5} />
                : filtered.length === 0 ? <tr><td colSpan={8} className="p-12 text-center text-white/40">لا توجد منتجات</td></tr>
                : filtered.map(product => {
                  const stockValue = product.quantity * product.cost_price;
                  const margin     = product.sale_price > 0 ? ((product.sale_price - product.cost_price) / product.sale_price) * 100 : 0;
                  const isLow      = product.low_stock_threshold !== null && product.quantity > 0 && product.quantity <= (product.low_stock_threshold ?? 5);
                  const isOut      = product.quantity === 0;
                  return (
                    <tr key={product.id}
                      className={`border-b border-white/5 cursor-pointer transition-colors ${selectedProductId === product.id ? "bg-amber-500/8" : "hover:bg-white/3"} ${isOut ? "bg-red-500/5" : isLow ? "bg-yellow-500/5" : ""}`}
                      onClick={() => setSelectedProductId(selectedProductId === product.id ? null : product.id)}>
                      <td className="p-4 font-bold text-white flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0 mt-0.5" />
                        {product.name}
                      </td>
                      <td className="p-4">
                        {product.category ? <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20">{product.category}</span> : "—"}
                      </td>
                      <td className="p-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold border ${isOut ? "bg-red-500/20 text-red-400 border-red-500/30" : isLow ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"}`}>
                          {isOut ? "⚠ نافذ" : product.quantity}
                        </span>
                      </td>
                      <td className="p-4 text-white/60">{formatCurrency(product.cost_price)}</td>
                      <td className="p-4 text-emerald-400">{formatCurrency(product.sale_price)}</td>
                      <td className="p-4 font-bold text-blue-400">{formatCurrency(stockValue)}</td>
                      <td className="p-4">
                        <span className={`text-xs font-bold ${margin >= 30 ? "text-emerald-400" : margin > 0 ? "text-amber-400" : "text-red-400"}`}>{margin.toFixed(1)}%</span>
                      </td>
                      <td className="p-4">
                        <span className={`text-xs font-bold ${isOut ? "text-red-400" : isLow ? "text-yellow-400" : "text-emerald-400"}`}>{isOut ? "نافذ" : isLow ? "منخفض" : "جيد"}</span>
                      </td>
                    </tr>
                  );
                })
              }
            </tbody>
            <tfoot className="bg-white/5 border-t border-white/10">
              <tr>
                <td colSpan={5} className="p-4 font-bold text-white/60">الإجمالي ({filtered.length} صنف)</td>
                <td className="p-4 font-black text-blue-400">{formatCurrency(totalStockValue)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── Product detail drawer ── */}
      {selectedProductId && (
        <div className="fixed inset-0 z-40 flex items-start justify-end" onClick={() => setSelectedProductId(null)}>
          <div
            className="h-full w-full max-w-md glass-panel border-r border-white/10 shadow-2xl overflow-y-auto"
            style={{ background: "rgba(10,18,35,0.97)", backdropFilter: "blur(20px)" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="sticky top-0 z-10 flex items-center justify-between p-5 border-b border-white/10" style={{ background: "rgba(10,18,35,0.95)", backdropFilter: "blur(10px)" }}>
              <div>
                <h3 className="text-white font-bold text-lg">{selectedProduct?.name}</h3>
                {selectedProduct?.category && <p className="text-amber-400 text-xs mt-0.5">{selectedProduct.category}</p>}
              </div>
              <button onClick={() => setSelectedProductId(null)} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                <X className="w-4 h-4 text-white/70" />
              </button>
            </div>

            <div className="p-5 space-y-5">

              {/* Product stats */}
              {detailLoading ? (
                <div className="text-center py-8 text-white/40 text-sm">جاري التحميل...</div>
              ) : detail ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                      <p className="text-white/40 text-xs mb-1">الكمية الحالية</p>
                      <p className="text-2xl font-black text-white">{detail.actual_qty}</p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                      <p className="text-white/40 text-xs mb-1">متوسط التكلفة</p>
                      <p className="text-lg font-black text-blue-400">{formatCurrency(selectedProduct?.cost_price ?? 0)}</p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                      <p className="text-white/40 text-xs mb-1">قيمة المخزون</p>
                      <p className="text-lg font-black text-emerald-400">{formatCurrency((selectedProduct?.cost_price ?? 0) * detail.actual_qty)}</p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                      <p className="text-white/40 text-xs mb-1">سعر البيع</p>
                      <p className="text-lg font-black text-amber-400">{formatCurrency(selectedProduct?.sale_price ?? 0)}</p>
                    </div>
                  </div>

                  {/* Movement breakdown */}
                  <div className="bg-white/3 rounded-xl p-4 border border-white/8 space-y-2 text-sm">
                    <p className="text-white/50 text-xs font-bold mb-2">ملخص الحركات</p>
                    {[
                      { label: "رصيد أول المدة",   value: `+${detail.opening_qty}`,          color: "text-amber-400" },
                      { label: "مشتريات",           value: `+${detail.purchased_qty}`,         color: "text-blue-400" },
                      { label: "مبيعات",            value: `-${detail.sold_qty}`,              color: "text-emerald-400" },
                      { label: "مرتجع مبيعات",      value: `+${detail.sale_return_qty}`,       color: "text-orange-400" },
                      { label: "مرتجع مشتريات",     value: `-${detail.purchase_return_qty}`,   color: "text-orange-400" },
                      { label: "تسويات",            value: String(detail.adjustment_qty),      color: "text-slate-400" },
                    ].map(row => (
                      <div key={row.label} className="flex justify-between py-1 border-b border-white/5">
                        <span className="text-white/60">{row.label}</span>
                        <span className={`font-bold ${row.color}`}>{row.value}</span>
                      </div>
                    ))}
                    <div className="flex justify-between py-1 pt-2">
                      <span className="text-white font-bold">الرصيد الحالي</span>
                      <span className="text-white font-black">{detail.actual_qty}</span>
                    </div>
                  </div>

                  {/* Movements table */}
                  {detail.movements.length > 0 && (
                    <div>
                      <p className="text-white/50 text-xs font-bold mb-3">سجل الحركات ({detail.movements.length})</p>
                      <div className="space-y-2">
                        {detail.movements.slice(-20).reverse().map(m => {
                          const mv = MOVE_LABELS[m.movement_type] ?? { label: m.movement_type, color: "text-white/50" };
                          const isPositive = m.quantity > 0;
                          return (
                            <div key={m.id} className="bg-white/3 rounded-xl p-3 border border-white/8 text-xs">
                              <div className="flex justify-between items-start mb-1">
                                <span className={`font-bold ${mv.color}`}>{mv.label}</span>
                                <span className={`font-black ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                                  {isPositive ? "+" : ""}{m.quantity}
                                </span>
                              </div>
                              <div className="flex justify-between text-white/30">
                                <span>{m.reference_no ?? "—"}</span>
                                <span>{m.quantity_before} ← {m.quantity_after}</span>
                              </div>
                              <p className="text-white/25 mt-1">{new Date(m.created_at).toLocaleDateString("ar-EG")}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  TAB 3: فواتير المبيعات
 * ───────────────────────────────────────────────────────────────────────────── */

function SalesInvoicesReport() {
  const { data: sales = [], isLoading } = useGetSales();
  const [search, setSearch]             = useState("");
  const [payFilter, setPayFilter]       = useState("");

  const filtered = sales.filter(s => {
    const matchS = !search || s.invoice_no.includes(search) || (s.customer_name && s.customer_name.includes(search));
    const matchP = !payFilter || s.payment_type === payFilter;
    return matchS && matchP;
  });

  const totalSales = filtered.reduce((s, v) => s + v.total_amount, 0);
  const totalPaid  = filtered.reduce((s, v) => s + v.paid_amount, 0);
  const totalDebt  = filtered.reduce((s, v) => s + v.remaining_amount, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-panel rounded-2xl p-4 border border-emerald-500/10">
          <p className="text-emerald-400 text-xs mb-1">إجمالي المبيعات</p>
          <p className="text-2xl font-black text-white">{formatCurrency(totalSales)}</p>
          <p className="text-white/30 text-xs">{filtered.length} فاتورة</p>
        </div>
        <div className="glass-panel rounded-2xl p-4 border border-blue-500/10">
          <p className="text-blue-400 text-xs mb-1">المحصَّل</p>
          <p className="text-2xl font-black text-white">{formatCurrency(totalPaid)}</p>
        </div>
        <div className="glass-panel rounded-2xl p-4 border border-red-500/10">
          <p className="text-red-400 text-xs mb-1">الديون المتبقية</p>
          <p className="text-2xl font-black text-white">{formatCurrency(totalDebt)}</p>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input className="glass-input w-full pr-9 text-sm" placeholder="بحث برقم الفاتورة أو العميل..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {[{ v: "", l: "الكل" }, { v: "cash", l: "نقدي" }, { v: "credit", l: "آجل" }, { v: "partial", l: "جزئي" }].map(opt => (
            <button key={opt.v} onClick={() => setPayFilter(opt.v)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${payFilter === opt.v ? "bg-amber-500/20 border-amber-500/40 text-amber-400" : "glass-panel border-white/10 text-white/50 hover:text-white"}`}>
              {opt.l}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mr-auto">
          <button onClick={() => exportSalesExcel(filtered)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30 transition-all">
            <FileDown className="w-3.5 h-3.5" /> Excel
          </button>
          <button onClick={() => printSalesReport(filtered)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-500/20 border border-blue-500/40 text-blue-400 hover:bg-blue-500/30 transition-all">
            <Printer className="w-3.5 h-3.5" /> PDF الكل
          </button>
        </div>
      </div>

      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-3 text-white/50">رقم الفاتورة</th>
                <th className="p-3 text-white/50">العميل</th>
                <th className="p-3 text-white/50">الإجمالي</th>
                <th className="p-3 text-white/50">المدفوع</th>
                <th className="p-3 text-white/50">المتبقي</th>
                <th className="p-3 text-white/50">الدفع</th>
                <th className="p-3 text-white/50">الحالة</th>
                <th className="p-3 text-white/50">التاريخ</th>
                <th className="p-3 text-white/50">فاتورة</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <TableSkeleton cols={9} rows={5} />
                : filtered.length === 0 ? <tr><td colSpan={9} className="p-12 text-center text-white/40">لا توجد فواتير</td></tr>
                : filtered.map(s => (
                  <tr key={s.id} className="border-b border-white/5 erp-table-row">
                    <td className="p-3 font-bold text-amber-400">{s.invoice_no}</td>
                    <td className="p-3 text-white">{s.customer_name || "عميل نقدي"}</td>
                    <td className="p-3 font-bold text-white">{formatCurrency(s.total_amount)}</td>
                    <td className="p-3 text-emerald-400 font-bold">{formatCurrency(s.paid_amount)}</td>
                    <td className="p-3 text-red-400 font-bold">{s.remaining_amount > 0 ? formatCurrency(s.remaining_amount) : "—"}</td>
                    <td className="p-3"><PaymentBadge type={s.payment_type} /></td>
                    <td className="p-3"><StatusBadge status={s.status} /></td>
                    <td className="p-3 text-white/40 text-xs">{formatDate(s.created_at)}</td>
                    <td className="p-3"><InvoicePdfButton type="sales" id={s.id} /></td>
                  </tr>
                ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="bg-white/5 border-t border-white/10">
                <tr>
                  <td colSpan={2} className="p-3 text-white/50 font-bold">الإجمالي ({filtered.length} فاتورة)</td>
                  <td className="p-3 font-black text-white">{formatCurrency(totalSales)}</td>
                  <td className="p-3 font-black text-emerald-400">{formatCurrency(totalPaid)}</td>
                  <td className="p-3 font-black text-red-400">{formatCurrency(totalDebt)}</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  TAB 4: فواتير المشتريات
 * ───────────────────────────────────────────────────────────────────────────── */

function PurchasesInvoicesReport() {
  const { data: purchases = [], isLoading } = useGetPurchases();
  const [search, setSearch]                 = useState("");
  const [payFilter, setPayFilter]           = useState("");

  const filtered = purchases.filter(p => {
    const matchS = !search || p.invoice_no.includes(search) || (p.customer_name && p.customer_name.includes(search));
    const matchP = !payFilter || p.payment_type === payFilter;
    return matchS && matchP;
  });

  const totalPurchases = filtered.reduce((s, v) => s + v.total_amount, 0);
  const totalPaid      = filtered.reduce((s, v) => s + v.paid_amount, 0);
  const totalRemaining = filtered.reduce((s, v) => s + v.remaining_amount, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-panel rounded-2xl p-4 border border-red-500/10">
          <p className="text-red-400 text-xs mb-1">إجمالي المشتريات</p>
          <p className="text-2xl font-black text-white">{formatCurrency(totalPurchases)}</p>
          <p className="text-white/30 text-xs">{filtered.length} فاتورة</p>
        </div>
        <div className="glass-panel rounded-2xl p-4 border border-emerald-500/10">
          <p className="text-emerald-400 text-xs mb-1">المدفوع</p>
          <p className="text-2xl font-black text-white">{formatCurrency(totalPaid)}</p>
        </div>
        <div className="glass-panel rounded-2xl p-4 border border-amber-500/10">
          <p className="text-amber-400 text-xs mb-1">المتبقي للموردين</p>
          <p className="text-2xl font-black text-white">{formatCurrency(totalRemaining)}</p>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input className="glass-input w-full pr-9 text-sm" placeholder="بحث برقم الفاتورة أو المورد..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {[{ v: "", l: "الكل" }, { v: "cash", l: "نقدي" }, { v: "credit", l: "آجل" }, { v: "partial", l: "جزئي" }].map(opt => (
            <button key={opt.v} onClick={() => setPayFilter(opt.v)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${payFilter === opt.v ? "bg-amber-500/20 border-amber-500/40 text-amber-400" : "glass-panel border-white/10 text-white/50 hover:text-white"}`}>
              {opt.l}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mr-auto">
          <button onClick={() => exportPurchasesExcel(filtered)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30 transition-all">
            <FileDown className="w-3.5 h-3.5" /> Excel
          </button>
          <button onClick={() => printPurchasesReport(filtered)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-500/20 border border-blue-500/40 text-blue-400 hover:bg-blue-500/30 transition-all">
            <Printer className="w-3.5 h-3.5" /> PDF الكل
          </button>
        </div>
      </div>

      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-3 text-white/50">رقم الفاتورة</th>
                <th className="p-3 text-white/50">المورد / العميل</th>
                <th className="p-3 text-white/50">الإجمالي</th>
                <th className="p-3 text-white/50">المدفوع</th>
                <th className="p-3 text-white/50">المتبقي</th>
                <th className="p-3 text-white/50">الدفع</th>
                <th className="p-3 text-white/50">الحالة</th>
                <th className="p-3 text-white/50">التاريخ</th>
                <th className="p-3 text-white/50">فاتورة</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <TableSkeleton cols={9} rows={5} />
                : filtered.length === 0 ? <tr><td colSpan={9} className="p-12 text-center text-white/40">لا توجد مشتريات</td></tr>
                : filtered.map(p => (
                  <tr key={p.id} className="border-b border-white/5 erp-table-row">
                    <td className="p-3 font-bold text-amber-400">{p.invoice_no}</td>
                    <td className="p-3 text-white">{p.customer_name || "—"}</td>
                    <td className="p-3 font-bold text-white">{formatCurrency(p.total_amount)}</td>
                    <td className="p-3 text-emerald-400 font-bold">{formatCurrency(p.paid_amount)}</td>
                    <td className="p-3 text-red-400 font-bold">{p.remaining_amount > 0 ? formatCurrency(p.remaining_amount) : "—"}</td>
                    <td className="p-3"><PaymentBadge type={p.payment_type} /></td>
                    <td className="p-3"><StatusBadge status={p.status} /></td>
                    <td className="p-3 text-white/40 text-xs">{formatDate(p.created_at)}</td>
                    <td className="p-3"><InvoicePdfButton type="purchases" id={p.id} /></td>
                  </tr>
                ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="bg-white/5 border-t border-white/10">
                <tr>
                  <td colSpan={2} className="p-3 text-white/50 font-bold">الإجمالي ({filtered.length} فاتورة)</td>
                  <td className="p-3 font-black text-white">{formatCurrency(totalPurchases)}</td>
                  <td className="p-3 font-black text-emerald-400">{formatCurrency(totalPaid)}</td>
                  <td className="p-3 font-black text-red-400">{formatCurrency(totalRemaining)}</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Main: Reports page with 4 tabs
 * ───────────────────────────────────────────────────────────────────────────── */

type Tab = "pl" | "inventory" | "purchases" | "sales";

const TABS: { id: Tab; label: string }[] = [
  { id: "pl",        label: "📊 الأرباح والخسائر" },
  { id: "inventory", label: "📦 تقرير المخزن" },
  { id: "purchases", label: "🛒 فواتير المشتريات" },
  { id: "sales",     label: "🧾 فواتير المبيعات" },
];

export default function Reports() {
  const [tab, setTab] = useState<Tab>("pl");

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex bg-white/5 rounded-2xl p-1 border border-white/10 flex-wrap gap-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex-1 min-w-fit ${tab === t.id ? "bg-amber-500 text-black shadow" : "text-white/50 hover:text-white"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "pl"        && <ProfitLossReport />}
      {tab === "inventory" && <InventoryReport />}
      {tab === "purchases" && <PurchasesInvoicesReport />}
      {tab === "sales"     && <SalesInvoicesReport />}
    </div>
  );
}
