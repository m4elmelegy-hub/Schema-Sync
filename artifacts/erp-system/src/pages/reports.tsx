import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useGetProducts, useGetSales, useGetPurchases } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  TrendingUp, TrendingDown, Package, FileText, DollarSign,
  X, ShoppingBag, ShoppingCart, Search, FileDown, Printer,
  Loader2, BarChart3, AlertTriangle, ChevronDown, Filter, ArrowUpDown,
} from "lucide-react";
import { exportSalesExcel, exportPurchasesExcel } from "@/lib/export-excel";
import { printSalesReport, printPurchasesReport, printSaleInvoice, printPurchaseInvoice, printPLReport } from "@/lib/export-pdf";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { TableSkeleton } from "@/components/skeletons";

/* ─── API helpers ───────────────────────────────────────────────────────────── */

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api  = (p: string) => `${BASE}${p}`;
const getToken = () => localStorage.getItem("erp_auth_token") ?? "";
const authFetch = <T,>(url: string): Promise<T> =>
  fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } })
    .then(r => { if (!r.ok) throw new Error("API error"); return r.json() as Promise<T>; });

/* ─── Count-up animation hook ───────────────────────────────────────────────── */

function useCountUp(target: number, duration = 1300): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let startTime: number | null = null;
    let rafId: number;
    const animate = (ts: number) => {
      if (startTime === null) startTime = ts;
      const p = Math.min((ts - startTime) / duration, 1);
      setValue(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) { rafId = requestAnimationFrame(animate); }
    };
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [target, duration]);
  return value;
}

/* ─── Text highlight helper ─────────────────────────────────────────────────── */

function HighlightText({ text, search }: { text: string; search: string }) {
  if (!search || !text) return <>{text}</>;
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === search.toLowerCase()
          ? <mark key={i} className="bg-amber-400/30 text-amber-300 rounded px-0.5 not-italic">{part}</mark>
          : <span key={i}>{part}</span>
      )}
    </>
  );
}

/* ─── Date helpers ──────────────────────────────────────────────────────────── */

const todayStr = () => new Date().toISOString().split("T")[0];
const thisMonthStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};
const fmtMonth = (m: string) => {
  const AR_MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  const [y, mon] = m.split("-");
  return `${AR_MONTHS[parseInt(mon) - 1]} ${y}`;
};
const fmtDay = (d: string) => {
  const AR_MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  const [, mon, day] = d.split("-");
  return `${parseInt(day)} ${AR_MONTHS[parseInt(mon) - 1]}`;
};

type DateMode = "today" | "yesterday" | "week" | "month" | "year" | "custom";

const DATE_MODES: { id: DateMode; label: string }[] = [
  { id: "today",     label: "اليوم" },
  { id: "yesterday", label: "أمس" },
  { id: "week",      label: "هذا الأسبوع" },
  { id: "month",     label: "هذا الشهر" },
  { id: "year",      label: "هذه السنة" },
  { id: "custom",    label: "مخصص 📅" },
];

function getDateRange(mode: DateMode, cf: string, ct: string): [string, string] {
  const t = todayStr();
  if (mode === "today")     return [t, t];
  if (mode === "yesterday") { const d = new Date(); d.setDate(d.getDate() - 1); const y = d.toISOString().split("T")[0]; return [y, y]; }
  if (mode === "week")      { const d = new Date(); d.setDate(d.getDate() - 6); return [d.toISOString().split("T")[0], t]; }
  if (mode === "month")     return [thisMonthStart(), t];
  if (mode === "year")      return [`${new Date().getFullYear()}-01-01`, t];
  return [cf, ct];
}

function getPrevRange(dateFrom: string, dateTo: string): [string, string] {
  const from = new Date(dateFrom + "T12:00:00");
  const to   = new Date(dateTo   + "T12:00:00");
  const days = Math.max(Math.ceil((to.getTime() - from.getTime()) / 86_400_000) + 1, 1);
  const prevTo = new Date(from); prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - days + 1);
  return [prevFrom.toISOString().split("T")[0], prevTo.toISOString().split("T")[0]];
}

/* ─── Types ─────────────────────────────────────────────────────────────────── */

interface ProfitsData {
  total_revenue: number;
  total_cost: number;
  gross_profit: number;
  profit_margin: number;
  net_profit: number;
  total_expenses: number;
  invoice_count: number;
  item_count: number;
  by_product: Array<{ product_id: number; product_name: string; qty_sold: number; revenue: number; cost: number; profit: number; profit_margin: number }>;
  by_month: Array<{ month: string; revenue: number; cost: number; profit: number }>;
  by_day:   Array<{ day:   string; revenue: number; cost: number; profit: number }>;
  by_expense_category: Array<{ category: string; total: number }>;
}

const EMPTY_PL: ProfitsData = { total_revenue: 0, total_cost: 0, gross_profit: 0, profit_margin: 0, net_profit: 0, total_expenses: 0, invoice_count: 0, item_count: 0, by_product: [], by_month: [], by_day: [], by_expense_category: [] };

/* ─── Shared small helpers ──────────────────────────────────────────────────── */

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

function InvoicePdfButton({ type, id }: { type: "sales" | "purchases"; id: number }) {
  const [loading, setLoading] = useState(false);
  const handleClick = async () => {
    setLoading(true);
    try {
      const data = await authFetch<any>(api(`/api/${type}/${id}`));
      if (type === "sales") printSaleInvoice(data);
      else                  printPurchaseInvoice(data);
    } catch { /* silent */ } finally { setLoading(false); }
  };
  return (
    <button onClick={handleClick} disabled={loading} title="طباعة فاتورة PDF"
      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-blue-500/15 border border-blue-500/25 text-blue-400 hover:bg-blue-500/25 disabled:opacity-50 transition-all">
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Printer className="w-3 h-3" />} PDF
    </button>
  );
}

/* ─── Custom tooltip for recharts ───────────────────────────────────────────── */

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl p-3 border border-white/10 text-xs shadow-2xl" style={{ background: "rgba(10,18,35,0.95)", backdropFilter: "blur(10px)" }}>
      <p className="text-white/60 font-bold mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
          <span className="text-white/50">{p.dataKey}:</span>
          <span className="font-bold" style={{ color: p.color }}>{formatCurrency(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
 *  Hero KPI Card
 * ───────────────────────────────────────────────────────────────────────────── */

interface KPICardProps {
  label: string;
  value: number;
  prevValue?: number;
  sub?: string;
  border: string;
  icon: React.ReactNode;
  valueColor?: string;
  index: number;
  extra?: React.ReactNode;
}

function HeroKPICard({ label, value, prevValue, sub, border, icon, valueColor = "text-white", index, extra }: KPICardProps) {
  const animated = useCountUp(value);
  const change = (prevValue && prevValue !== 0) ? ((value - prevValue) / Math.abs(prevValue)) * 100 : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.09 }}
      whileHover={{ y: -4, transition: { duration: 0.15 } }}
      className={`glass-panel rounded-2xl p-5 border-r-4 border-t border-b border-l border-white/5 cursor-default ${border}`}
      style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="p-2 rounded-xl bg-white/5">{icon}</div>
        {change !== null && (
          <div className={`flex items-center gap-1 text-xs font-bold rounded-full px-2 py-0.5 ${change >= 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
            {change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {change >= 0 ? "+" : ""}{change.toFixed(1)}%
          </div>
        )}
      </div>
      <p className="text-white/50 text-xs mb-1">{label}</p>
      <p className={`text-2xl font-black ${valueColor}`} style={{ fontFeatureSettings: '"tnum"' }}>
        {formatCurrency(animated)}
      </p>
      {sub && <p className="text-white/30 text-xs mt-1">{sub}</p>}
      {extra}
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Animated Waterfall Section
 * ───────────────────────────────────────────────────────────────────────────── */

function WaterfallSection({ pl }: { pl: ProfitsData }) {
  const maxVal = Math.max(pl.total_revenue, 1);
  const rows = [
    { label: "إجمالي المبيعات",   value: pl.total_revenue,   sign: "+", gradient: "from-emerald-600 to-emerald-400", textCls: "text-emerald-400", isResult: false },
    { label: "(-) تكلفة البضاعة", value: pl.total_cost,      sign: "-", gradient: "from-red-600 to-red-400",     textCls: "text-red-400",     isResult: false },
    { label: "= مجمل الربح",      value: pl.gross_profit,    sign: pl.gross_profit >= 0 ? "+" : "-", gradient: pl.gross_profit >= 0 ? "from-amber-600 to-amber-400" : "from-red-600 to-red-400", textCls: pl.gross_profit >= 0 ? "text-amber-400" : "text-red-400", isResult: true },
    { label: "(-) المصروفات",     value: pl.total_expenses,  sign: "-", gradient: "from-orange-600 to-orange-400", textCls: "text-orange-400",  isResult: false },
    { label: "= صافي الربح",      value: Math.abs(pl.net_profit), sign: pl.net_profit >= 0 ? "+" : "-", gradient: pl.net_profit >= 0 ? "from-emerald-600 to-emerald-400" : "from-red-700 to-red-500", textCls: pl.net_profit >= 0 ? "text-emerald-400" : "text-red-400", isResult: true },
  ];

  return (
    <div className="glass-panel rounded-2xl p-6 border border-white/5" style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }}>
      <h3 className="text-white font-bold mb-5 flex items-center gap-2 text-sm">
        <BarChart3 className="w-4 h-4 text-amber-400" /> تدفق الأرباح والخسائر
      </h3>
      <div className="space-y-3">
        {rows.map((row, i) => {
          const pct = Math.min((row.value / maxVal) * 100, 100);
          return (
            <div key={i} className={row.isResult ? "pt-2 border-t border-white/10" : ""}>
              <div className="flex items-center gap-3">
                <span className="text-white/50 text-xs w-36 text-right flex-shrink-0">{row.label}</span>
                <div className="flex-1 h-7 bg-white/4 rounded-lg overflow-hidden relative">
                  <motion.div
                    className={`absolute inset-y-0 right-0 rounded-lg bg-gradient-to-l ${row.gradient}`}
                    style={{ opacity: 0.8 }}
                    initial={{ width: "0%" }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.75, delay: i * 0.1, ease: "easeOut" }}
                  />
                  {row.isResult && (
                    <motion.div
                      className="absolute inset-0 rounded-lg"
                      style={{ background: "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.03) 4px, rgba(255,255,255,0.03) 8px)" }}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.1 + 0.6 }}
                    />
                  )}
                </div>
                <span className={`text-sm font-black w-28 text-right flex-shrink-0 ${row.textCls}`}>
                  {row.sign}{formatCurrency(row.value)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Area Chart — يومي / شهري tabs
 * ───────────────────────────────────────────────────────────────────────────── */

function TrendAreaChart({ by_month, by_day }: { by_month: ProfitsData["by_month"]; by_day: ProfitsData["by_day"] }) {
  const [view, setView] = useState<"month" | "day">("month");

  const chartData = useMemo(() => {
    if (view === "day") {
      return [...by_day].sort((a, b) => a.day.localeCompare(b.day)).map(d => ({
        name: fmtDay(d.day), مبيعات: +d.revenue.toFixed(2), تكلفة: +d.cost.toFixed(2), ربح: +d.profit.toFixed(2),
      }));
    }
    return [...by_month].sort((a, b) => a.month.localeCompare(b.month)).map(m => ({
      name: fmtMonth(m.month), مبيعات: +m.revenue.toFixed(2), تكلفة: +m.cost.toFixed(2), ربح: +m.profit.toFixed(2),
    }));
  }, [view, by_month, by_day]);

  const hasData = chartData.length > 0;

  return (
    <div className="glass-panel rounded-2xl p-5 border border-white/5" style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-bold flex items-center gap-2 text-sm">
          <TrendingUp className="w-4 h-4 text-emerald-400" /> تطور الأداء
        </h3>
        <div className="flex bg-white/5 rounded-xl p-0.5 gap-0.5">
          {[{ id: "month" as const, label: "📆 شهري" }, { id: "day" as const, label: "📅 يومي" }].map(t => (
            <button key={t.id} onClick={() => setView(t.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${view === t.id ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "text-white/40 hover:text-white/70"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {hasData ? (
        <ResponsiveContainer width="100%" height={210}>
          <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#10b981" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gCost" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gProfit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10, fontFamily: "Tajawal, Cairo, sans-serif" }} />
            <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} width={42} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="مبيعات" stroke="#10b981" strokeWidth={2} fill="url(#gRev)"    dot={false} />
            <Area type="monotone" dataKey="تكلفة"  stroke="#ef4444" strokeWidth={2} fill="url(#gCost)"  dot={false} />
            <Area type="monotone" dataKey="ربح"    stroke="#f59e0b" strokeWidth={2} fill="url(#gProfit)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[210px] flex flex-col items-center justify-center text-white/30">
          <BarChart3 className="w-8 h-8 mb-2 opacity-30" />
          <p className="text-sm">لا توجد بيانات بعد</p>
        </div>
      )}

      <div className="flex justify-center gap-5 mt-3">
        {[{ color: "#10b981", label: "مبيعات" }, { color: "#ef4444", label: "تكلفة" }, { color: "#f59e0b", label: "ربح" }].map(l => (
          <div key={l.label} className="flex items-center gap-1.5 text-xs text-white/40">
            <div className="w-3 h-0.5 rounded-full" style={{ background: l.color }} />
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Expense Donut Chart
 * ───────────────────────────────────────────────────────────────────────────── */

const DONUT_COLORS = ["#f59e0b","#ef4444","#3b82f6","#10b981","#8b5cf6","#f97316","#06b6d4","#ec4899","#84cc16","#6b7280"];

function ExpenseDonutChart({ data, total }: { data: ProfitsData["by_expense_category"]; total: number }) {
  if (!data || data.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-5 border border-white/5 flex flex-col items-center justify-center" style={{ minHeight: 260, fontFamily: "'Tajawal', 'Cairo', sans-serif" }}>
        <DollarSign className="w-8 h-8 text-white/15 mb-2" />
        <p className="text-white/30 text-sm">لا توجد مصروفات في هذه الفترة</p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl p-5 border border-white/5" style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }}>
      <h3 className="text-white font-bold mb-4 flex items-center gap-2 text-sm">
        <DollarSign className="w-4 h-4 text-red-400" /> توزيع المصروفات ({formatCurrency(total)})
      </h3>
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <ResponsiveContainer width={180} height={180}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={80}
              dataKey="total"
              nameKey="category"
              strokeWidth={0}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: "rgba(10,18,35,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
              formatter={(value: number) => [formatCurrency(value), ""]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex-1 space-y-2 w-full">
          {data.slice(0, 6).map((item, i) => {
            const pct = total > 0 ? (item.total / total) * 100 : 0;
            return (
              <div key={item.category} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                <span className="text-white/60 text-xs flex-1 truncate">{item.category}</span>
                <span className="text-white/40 text-xs">{pct.toFixed(0)}%</span>
                <span className="text-white/70 text-xs font-bold tabular-nums">{formatCurrency(item.total)}</span>
              </div>
            );
          })}
          {data.length > 6 && (
            <p className="text-white/25 text-xs">+ {data.length - 6} فئات أخرى</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Ranked Products List
 * ───────────────────────────────────────────────────────────────────────────── */

const MEDALS = ["🥇", "🥈", "🥉"];
const MEDAL_BORDERS = [
  "border-amber-400/50 shadow-amber-400/10",
  "border-slate-400/40 shadow-slate-400/10",
  "border-orange-700/40 shadow-orange-700/10",
];

function RankedProductsList({ products }: { products: ProfitsData["by_product"] }) {
  const top = useMemo(() => [...products].sort((a, b) => b.profit - a.profit).slice(0, 5), [products]);
  if (top.length === 0) return null;

  return (
    <div className="glass-panel rounded-2xl overflow-hidden border border-white/5" style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }}>
      <div className="p-4 border-b border-white/8 flex items-center gap-2">
        <ShoppingBag className="w-4 h-4 text-amber-400" />
        <h3 className="text-white font-bold text-sm">أعلى 5 منتجات ربحية</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-right text-sm whitespace-nowrap" dir="rtl">
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <th className="px-4 py-3 text-white/30 font-medium text-xs">#</th>
              <th className="px-4 py-3 text-white/30 font-medium text-xs">المنتج</th>
              <th className="px-4 py-3 text-white/30 font-medium text-xs">كمية مباعة</th>
              <th className="px-4 py-3 text-white/30 font-medium text-xs">الإيراد</th>
              <th className="px-4 py-3 text-white/30 font-medium text-xs">التكلفة</th>
              <th className="px-4 py-3 text-white/30 font-medium text-xs">الربح</th>
              <th className="px-4 py-3 text-white/30 font-medium text-xs">هامش%</th>
            </tr>
          </thead>
          <tbody>
            {top.map((p, i) => {
              const margin = p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0;
              return (
                <motion.tr
                  key={p.product_id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.07 }}
                  className="border-b border-white/[0.05] hover:bg-white/[0.025] transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="text-base">{MEDALS[i] ?? `#${i + 1}`}</span>
                  </td>
                  <td className="px-4 py-3 font-bold text-white">{p.product_name}</td>
                  <td className="px-4 py-3 text-white/60 tabular-nums">{p.qty_sold} وحدة</td>
                  <td className="px-4 py-3 text-emerald-400 font-bold tabular-nums">{formatCurrency(p.revenue)}</td>
                  <td className="px-4 py-3 text-red-400 tabular-nums">{formatCurrency(p.cost)}</td>
                  <td className="px-4 py-3">
                    <span className={`font-black tabular-nums ${p.profit >= 0 ? "text-amber-400" : "text-red-400"}`}>
                      {formatCurrency(p.profit)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg border ${
                      margin >= 50 ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                      : margin >= 30 ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
                      : "bg-red-500/15 border-red-500/30 text-red-400"
                    }`}>
                      {margin.toFixed(1)}%
                    </span>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  TAB 1: قائمة الأرباح والخسائر — WORLD CLASS
 * ───────────────────────────────────────────────────────────────────────────── */

function ProfitLossReport() {
  const [mode, setMode]         = useState<DateMode>("month");
  const [customFrom, setCustomFrom] = useState(thisMonthStart());
  const [customTo,   setCustomTo]   = useState(todayStr());

  const [dateFrom, dateTo] = getDateRange(mode, customFrom, customTo);
  const [prevFrom, prevTo] = getPrevRange(dateFrom, dateTo);

  const qOpts = (from: string, to: string) => ({
    queryKey: ["/api/profits", from, to],
    queryFn: () => authFetch<ProfitsData>(api(`/api/profits?date_from=${from}&date_to=${to}`)),
    staleTime: 60_000,
  });

  const { data: plData, isLoading } = useQuery<ProfitsData>(qOpts(dateFrom, dateTo));
  const { data: prevData }          = useQuery<ProfitsData>({ ...qOpts(prevFrom, prevTo), enabled: !!prevFrom });

  const pl   = plData   ?? EMPTY_PL;
  const prev = prevData ?? EMPTY_PL;

  const handlePdfExport = () => printPLReport({ dateFrom, dateTo, ...pl });

  return (
    <div className="space-y-5" style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }}>

      {/* ── Date filter bar ── */}
      <div className="flex flex-wrap items-center gap-2">
        {DATE_MODES.map(m => (
          <button key={m.id} onClick={() => setMode(m.id)}
            className={`px-4 py-1.5 rounded-xl text-sm font-bold border transition-all ${mode === m.id ? "bg-amber-500/25 border-amber-500/50 text-amber-300 shadow-lg shadow-amber-500/10" : "glass-panel border-white/10 text-white/50 hover:text-white hover:border-white/20"}`}>
            {m.label}
          </button>
        ))}
        {mode === "custom" && (
          <div className="flex items-center gap-2">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="glass-input rounded-xl px-3 py-1.5 text-sm text-white" />
            <span className="text-white/30">←</span>
            <input type="date" value={customTo}   onChange={e => setCustomTo(e.target.value)}   className="glass-input rounded-xl px-3 py-1.5 text-sm text-white" />
          </div>
        )}
        <button onClick={handlePdfExport}
          className="mr-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-500/20 border border-blue-500/40 text-blue-400 hover:bg-blue-500/30 transition-all">
          <Printer className="w-3.5 h-3.5" /> تصدير PDF
        </button>
      </div>

      {/* ── Hero KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <HeroKPICard index={0} label="إجمالي المبيعات" value={pl.total_revenue} prevValue={prev.total_revenue}
          sub={`${pl.invoice_count} فاتورة · ${pl.item_count} صنف`}
          border="border-r-emerald-500/70" icon={<TrendingUp className="w-4 h-4 text-emerald-400" />} />
        <HeroKPICard index={1} label="تكلفة البضاعة COGS" value={pl.total_cost} prevValue={prev.total_cost}
          sub={pl.total_revenue > 0 ? `${((pl.total_cost / pl.total_revenue) * 100).toFixed(1)}% من المبيعات` : "—"}
          border="border-r-red-500/70" icon={<TrendingDown className="w-4 h-4 text-red-400" />} valueColor="text-red-400" />
        <HeroKPICard index={2} label="مجمل الربح" value={pl.gross_profit} prevValue={prev.gross_profit}
          sub={undefined}
          border="border-r-amber-500/70" icon={<BarChart3 className="w-4 h-4 text-amber-400" />}
          extra={
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${pl.profit_margin >= 20 ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>{pl.profit_margin.toFixed(1)}%</span>
                <span className="text-white/30 text-xs">الهامش</span>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <motion.div className={`h-full rounded-full ${pl.profit_margin >= 20 ? "bg-emerald-500" : "bg-red-500"}`}
                  initial={{ width: "0%" }} animate={{ width: `${Math.min(pl.profit_margin, 100)}%` }}
                  transition={{ duration: 1, delay: 0.5 }} />
              </div>
            </div>
          } />
        <HeroKPICard index={3} label="صافي الربح" value={pl.net_profit} prevValue={prev.net_profit}
          sub={`بعد خصم ${formatCurrency(pl.total_expenses)} مصروفات`}
          border={pl.net_profit >= 0 ? "border-r-blue-500/70" : "border-r-red-600/80"}
          icon={<DollarSign className={`w-4 h-4 ${pl.net_profit >= 0 ? "text-blue-400" : "text-red-400"}`} />}
          valueColor={pl.net_profit >= 0 ? "text-white" : "text-red-400"} />
      </div>

      {/* ── Waterfall P&L Statement ── */}
      <WaterfallSection pl={pl} />

      {/* ── Trend Chart + Expense Donut ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <TrendAreaChart by_month={pl.by_month} by_day={pl.by_day} />
        <ExpenseDonutChart data={pl.by_expense_category} total={pl.total_expenses} />
      </div>

      {/* ── Top 5 Products Table ── */}
      <RankedProductsList products={pl.by_product} />

      {!isLoading && pl.invoice_count === 0 && (
        <div className="glass-panel rounded-2xl p-12 text-center border border-white/5">
          <BarChart3 className="w-10 h-10 text-white/20 mx-auto mb-3" />
          <p className="text-white/40 font-bold">لا توجد بيانات في هذه الفترة</p>
          <p className="text-white/25 text-xs mt-1">جرّب تغيير نطاق التاريخ</p>
        </div>
      )}
    </div>
  );
}

/* ─── Animated stat card (inventory) — hook-safe sub-component ─────────────── */

function AnimStatCard({ label, value, fmt, color, delay }: {
  label: string; value: number; fmt: (v: number) => string; color: string; delay: number;
}) {
  const animated = useCountUp(value);
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay }} whileHover={{ y: -3 }}
      className="glass-panel rounded-2xl p-5 border border-white/5" style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }}>
      <p className="text-white/40 text-xs mb-2">{label}</p>
      <p className={`text-xl font-black ${color}`}>{fmt(animated)}</p>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  TAB 2: تقرير المخزن — ENHANCED
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

const MOVE_META: Record<string, { label: string; textCls: string; dotCls: string }> = {
  opening_balance: { label: "رصيد أول المدة", textCls: "text-amber-400",  dotCls: "bg-amber-500"  },
  purchase:        { label: "مشترى",           textCls: "text-blue-400",   dotCls: "bg-blue-500"   },
  sale:            { label: "مبيعة",            textCls: "text-emerald-400",dotCls: "bg-emerald-500"},
  sale_return:     { label: "مرتجع مبيعات",    textCls: "text-orange-400", dotCls: "bg-orange-500" },
  purchase_return: { label: "مرتجع مشتريات",   textCls: "text-orange-400", dotCls: "bg-orange-500" },
  adjustment:      { label: "تسوية",            textCls: "text-slate-400",  dotCls: "bg-slate-500"  },
};

type SortMode = "value" | "profit" | "lowStock" | "default";

function InventoryReport() {
  const { data: products = [], isLoading } = useGetProducts();
  const [catFilter, setCatFilter]           = useState("");
  const [search, setSearch]                 = useState("");
  const [lowStockOnly, setLowStockOnly]     = useState(false);
  const [sortMode, setSortMode]             = useState<SortMode>("default");
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);

  const categories = useMemo(() =>
    Array.from(new Set(products.map(p => p.category).filter((c): c is string => Boolean(c)))),
    [products]);

  const filtered = useMemo(() => {
    let list = products;
    if (catFilter) list = list.filter(p => p.category === catFilter);
    if (search)    list = list.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || (p.category && p.category.toLowerCase().includes(search.toLowerCase())));
    if (lowStockOnly) list = list.filter(p => p.quantity <= (p.low_stock_threshold ?? 5));
    return [...list].sort((a, b) => {
      if (sortMode === "value")    return b.quantity * b.cost_price - a.quantity * a.cost_price;
      if (sortMode === "profit")   { const mA = a.sale_price > 0 ? (a.sale_price - a.cost_price) / a.sale_price : 0; const mB = b.sale_price > 0 ? (b.sale_price - b.cost_price) / b.sale_price : 0; return mB - mA; }
      if (sortMode === "lowStock") return a.quantity - b.quantity;
      return 0;
    });
  }, [products, catFilter, search, lowStockOnly, sortMode]);

  const totalStockValue = filtered.reduce((s, p) => s + p.quantity * p.cost_price, 0);
  const totalSaleValue  = filtered.reduce((s, p) => s + p.quantity * p.sale_price, 0);
  const lowStockItems   = products.filter(p => p.quantity > 0 && p.quantity <= (p.low_stock_threshold ?? 5));
  const outOfStock      = products.filter(p => p.quantity === 0);
  const selectedProduct = products.find(p => p.id === selectedProductId);

  const { data: detail, isLoading: detailLoading } = useQuery<ProductDetail>({
    queryKey: ["/api/inventory/product", selectedProductId],
    enabled: !!selectedProductId,
    queryFn: () => authFetch<ProductDetail>(api(`/api/inventory/product/${selectedProductId}`)),
    staleTime: 30_000,
  });

  const stockChartData = useMemo(() => {
    if (!detail) return [];
    return [...detail.movements]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(m => ({
        date: new Date(m.created_at).toLocaleDateString("ar-EG", { month: "short", day: "numeric" }),
        qty: m.quantity_after,
      }));
  }, [detail]);

  return (
    <div className="space-y-4" style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }}>

      {/* Alerts */}
      {(lowStockItems.length > 0 || outOfStock.length > 0) && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap gap-3">
          {outOfStock.length > 0 && (
            <div className="glass-panel rounded-2xl px-4 py-3 border border-red-500/30 bg-red-500/5 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="text-red-400 text-sm font-bold">{outOfStock.length} منتج نافذ</span>
            </div>
          )}
          {lowStockItems.length > 0 && (
            <div className="glass-panel rounded-2xl px-4 py-3 border border-yellow-500/30 bg-yellow-500/5 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
              <span className="text-yellow-400 text-sm font-bold">{lowStockItems.length} منتج وصل للحد الأدنى</span>
            </div>
          )}
        </motion.div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <AnimStatCard label="إجمالي الأصناف"          value={filtered.length}                 fmt={v => String(Math.round(v))} color="text-white"       delay={0} />
        <AnimStatCard label="قيمة المخزون (التكلفة)"  value={totalStockValue}                 fmt={formatCurrency}             color="text-blue-400"    delay={0.08} />
        <AnimStatCard label="قيمة المخزون (البيع)"    value={totalSaleValue}                  fmt={formatCurrency}             color="text-emerald-400" delay={0.16} />
        <AnimStatCard label="الربح المتوقع من المخزن"  value={totalSaleValue - totalStockValue} fmt={formatCurrency}             color="text-amber-400"   delay={0.24} />
      </div>

      {/* Smart search + filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input className="glass-input w-full pr-9 text-sm" placeholder="ابحث عن منتج أو صنف..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={() => setLowStockOnly(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${lowStockOnly ? "bg-red-500/20 border-red-500/40 text-red-400" : "glass-panel border-white/10 text-white/50"}`}>
          <AlertTriangle className="w-3.5 h-3.5" /> نافدة فقط
        </button>
        <div className="relative">
          <select value={sortMode} onChange={e => setSortMode(e.target.value as SortMode)}
            className="glass-input rounded-xl px-3 py-2 text-xs font-bold text-white/70 appearance-none pl-8 cursor-pointer">
            <option value="default">الترتيب الافتراضي</option>
            <option value="value">الأعلى قيمة</option>
            <option value="profit">الأعلى ربحاً</option>
            <option value="lowStock">الأقل مخزوناً</option>
          </select>
          <ArrowUpDown className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/30 pointer-events-none" />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-1 flex-wrap border-b border-white/8 pb-2">
        {[{ id: "", label: `الكل (${products.length})` }, ...categories.map(c => ({ id: c, label: `${c} (${products.filter(p => p.category === c).length})` }))].map(cat => (
          <button key={cat.id} onClick={() => setCatFilter(cat.id)}
            className={`px-3 py-1.5 text-xs font-bold rounded-t-lg transition-all relative ${catFilter === cat.id ? "text-amber-400" : "text-white/40 hover:text-white/70"}`}>
            {cat.label}
            {catFilter === cat.id && (
              <motion.div layoutId="cat-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-400 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Products table */}
      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-3 text-white/50">المنتج</th>
                <th className="p-3 text-white/50">التصنيف</th>
                <th className="p-3 text-white/50">الكمية</th>
                <th className="p-3 text-white/50">سعر التكلفة</th>
                <th className="p-3 text-white/50">سعر البيع</th>
                <th className="p-3 text-white/50">قيمة المخزون</th>
                <th className="p-3 text-white/50">هامش%</th>
                <th className="p-3 text-white/50">تفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <TableSkeleton cols={8} rows={5} />
                : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="p-12 text-center text-white/40">
                    {search ? `لا نتائج لـ "${search}"` : "لا توجد منتجات"}
                  </td></tr>
                )
                : filtered.map((product, rowIdx) => {
                  const margin     = product.sale_price > 0 ? ((product.sale_price - product.cost_price) / product.sale_price) * 100 : 0;
                  const stockValue = product.quantity * product.cost_price;
                  const threshold  = product.low_stock_threshold ?? 5;
                  const isOut      = product.quantity === 0;
                  const isLow      = !isOut && product.quantity <= threshold;
                  const isSelected = selectedProductId === product.id;
                  return (
                    <motion.tr key={product.id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      transition={{ delay: rowIdx * 0.03 }}
                      className={`border-b border-white/5 transition-colors cursor-pointer ${isSelected ? "bg-amber-500/8" : isOut ? "bg-red-500/4 hover:bg-red-500/8" : isLow ? "bg-yellow-500/4 hover:bg-yellow-500/8" : "hover:bg-white/3"}`}>
                      <td className="p-3 font-bold text-white">
                        <HighlightText text={product.name} search={search} />
                      </td>
                      <td className="p-3">
                        {product.category
                          ? <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20">
                              <HighlightText text={product.category} search={search} />
                            </span>
                          : <span className="text-white/30">—</span>}
                      </td>
                      <td className="p-3">
                        <span className={`relative inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${
                          isOut ? "bg-red-500/20 text-red-400 border-red-500/30"
                          : isLow ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                          : "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"}`}>
                          {isOut && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 animate-ping" />}
                          {isOut ? "⚠ نافذ" : isLow ? `⚠ ${product.quantity}` : product.quantity}
                        </span>
                      </td>
                      <td className="p-3 text-white/60">{formatCurrency(product.cost_price)}</td>
                      <td className="p-3 text-emerald-400">{formatCurrency(product.sale_price)}</td>
                      <td className="p-3 font-bold text-blue-400">{formatCurrency(stockValue)}</td>
                      <td className="p-3">
                        <span className={`text-xs font-bold ${margin >= 30 ? "text-emerald-400" : margin > 0 ? "text-amber-400" : "text-red-400"}`}>
                          {margin.toFixed(1)}%
                        </span>
                      </td>
                      <td className="p-3">
                        <button onClick={() => setSelectedProductId(isSelected ? null : product.id)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${isSelected ? "bg-amber-500/30 border-amber-500/50 text-amber-300" : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10"}`}>
                          {isSelected ? "إغلاق" : "تفاصيل ◀"}
                        </button>
                      </td>
                    </motion.tr>
                  );
                })
              }
            </tbody>
            <tfoot className="bg-white/5 border-t border-white/10">
              <tr>
                <td colSpan={5} className="p-3 text-white/40 text-xs">الإجمالي ({filtered.length} صنف)</td>
                <td className="p-3 font-black text-blue-400 text-sm">{formatCurrency(totalStockValue)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── Product Detail Drawer ── */}
      <AnimatePresence>
        {selectedProductId && (
          <motion.div className="fixed inset-0 z-40 flex items-start justify-end"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setSelectedProductId(null)}>
            <motion.div
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="h-full w-full max-w-md overflow-y-auto shadow-2xl border-r border-white/10"
              style={{ background: "rgba(8,14,28,0.97)", backdropFilter: "blur(24px)", fontFamily: "'Tajawal', 'Cairo', sans-serif" }}
              onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="sticky top-0 z-10 flex items-center justify-between p-5 border-b border-white/10" style={{ background: "rgba(8,14,28,0.95)", backdropFilter: "blur(12px)" }}>
                <div>
                  <h3 className="text-white font-bold text-lg">{selectedProduct?.name}</h3>
                  {selectedProduct?.category && (
                    <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 mt-1 inline-block">{selectedProduct.category}</span>
                  )}
                </div>
                <button onClick={() => setSelectedProductId(null)} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                  <X className="w-4 h-4 text-white/70" />
                </button>
              </div>

              <div className="p-5 space-y-6">
                {detailLoading ? (
                  <div className="text-center py-8 text-white/40 text-sm">جاري التحميل...</div>
                ) : detail ? (
                  <>
                    {/* Stats 2x2 */}
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: "الكمية الحالية",   value: String(detail.actual_qty), color: "text-white text-2xl font-black" },
                        { label: "متوسط التكلفة",    value: formatCurrency(selectedProduct?.cost_price ?? 0), color: "text-blue-400 text-lg font-black" },
                        { label: "قيمة المخزون",     value: formatCurrency((selectedProduct?.cost_price ?? 0) * detail.actual_qty), color: "text-emerald-400 text-lg font-black" },
                        { label: "الربح المتوقع",    value: formatCurrency(((selectedProduct?.sale_price ?? 0) - (selectedProduct?.cost_price ?? 0)) * detail.actual_qty), color: "text-amber-400 text-lg font-black" },
                      ].map(s => (
                        <div key={s.label} className="bg-white/4 rounded-xl p-3 border border-white/8">
                          <p className="text-white/40 text-xs mb-1">{s.label}</p>
                          <p className={s.color}>{s.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Mini stock chart */}
                    {stockChartData.length > 1 && (
                      <div>
                        <p className="text-white/40 text-xs font-bold mb-3">مستوى المخزون عبر الزمن</p>
                        <ResponsiveContainer width="100%" height={90}>
                          <AreaChart data={stockChartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id="gStock" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 9 }} />
                            <YAxis hide />
                            <Tooltip contentStyle={{ background: "rgba(10,18,35,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }} />
                            <Area type="monotone" dataKey="qty" stroke="#f59e0b" strokeWidth={1.5} fill="url(#gStock)" dot={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* Timeline */}
                    {detail.movements.length > 0 && (
                      <div>
                        <p className="text-white/40 text-xs font-bold mb-4">سجل الحركات ({detail.movements.length})</p>
                        <div className="space-y-0">
                          {[...detail.movements].reverse().map((m, i) => {
                            const mv = MOVE_META[m.movement_type] ?? { label: m.movement_type, textCls: "text-white/50", dotCls: "bg-slate-500" };
                            const isAdd = m.quantity > 0;
                            return (
                              <motion.div key={m.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.04 }} className="flex gap-3">
                                <div className="flex flex-col items-center flex-shrink-0">
                                  <div className={`w-3 h-3 rounded-full mt-1 ring-2 ring-black/60 ${mv.dotCls}`} />
                                  {i < detail.movements.length - 1 && (
                                    <div className="w-px flex-1 bg-white/10 mt-1 mb-0 min-h-6" />
                                  )}
                                </div>
                                <div className={`flex-1 ${i < detail.movements.length - 1 ? "pb-4" : "pb-2"}`}>
                                  <div className="flex items-center justify-between mb-0.5">
                                    <span className={`font-bold text-sm ${mv.textCls}`}>{mv.label}</span>
                                    <span className={`text-sm font-black ${isAdd ? "text-emerald-400" : "text-red-400"}`}>
                                      {isAdd ? "+" : ""}{m.quantity} وحدة
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-white/30">
                                    {m.reference_no && <span className="font-mono text-white/40">{m.reference_no}</span>}
                                    {m.unit_cost > 0 && <span>التكلفة: {formatCurrency(m.unit_cost)}</span>}
                                    <span>{m.quantity_before} ← {m.quantity_after}</span>
                                  </div>
                                  <p className="text-white/20 text-xs mt-0.5">
                                    {new Date(m.created_at).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" })}
                                  </p>
                                </div>
                              </motion.div>
                            );
                          })}
                          {/* Final balance node */}
                          <div className="flex gap-3 pt-2">
                            <div className="flex-shrink-0">
                              <div className="w-4 h-4 rounded-full bg-amber-500 ring-2 ring-amber-500/40 shadow-lg shadow-amber-500/20" />
                            </div>
                            <div>
                              <span className="text-amber-400 font-bold text-sm">الرصيد الحالي: </span>
                              <span className="text-white font-black text-sm">{detail.actual_qty} وحدة</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  TAB 3 & 4: فواتير
 * ───────────────────────────────────────────────────────────────────────────── */

function SalesInvoicesReport() {
  const { data: sales = [], isLoading } = useGetSales();
  const [search, setSearch]             = useState("");
  const [payFilter, setPayFilter]       = useState("");

  const filtered = sales.filter(s => {
    const matchS = !search || s.invoice_no.includes(search) || (s.customer_name && s.customer_name.includes(search));
    return matchS && (!payFilter || s.payment_type === payFilter);
  });

  const totalSales = filtered.reduce((s, v) => s + v.total_amount, 0);
  const totalPaid  = filtered.reduce((s, v) => s + v.paid_amount, 0);
  const totalDebt  = filtered.reduce((s, v) => s + v.remaining_amount, 0);

  return (
    <div className="space-y-4" style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }}>
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-panel rounded-2xl p-4 border border-emerald-500/10"><p className="text-emerald-400 text-xs mb-1">إجمالي المبيعات</p><p className="text-2xl font-black text-white">{formatCurrency(totalSales)}</p><p className="text-white/30 text-xs">{filtered.length} فاتورة</p></div>
        <div className="glass-panel rounded-2xl p-4 border border-blue-500/10"><p className="text-blue-400 text-xs mb-1">المحصَّل</p><p className="text-2xl font-black text-white">{formatCurrency(totalPaid)}</p></div>
        <div className="glass-panel rounded-2xl p-4 border border-red-500/10"><p className="text-red-400 text-xs mb-1">الديون المتبقية</p><p className="text-2xl font-black text-white">{formatCurrency(totalDebt)}</p></div>
      </div>
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 max-w-xs"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" /><input className="glass-input w-full pr-9 text-sm" placeholder="بحث برقم الفاتورة أو العميل..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        <div className="flex gap-1">{[{ v: "", l: "الكل" }, { v: "cash", l: "نقدي" }, { v: "credit", l: "آجل" }, { v: "partial", l: "جزئي" }].map(opt => (<button key={opt.v} onClick={() => setPayFilter(opt.v)} className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${payFilter === opt.v ? "bg-amber-500/20 border-amber-500/40 text-amber-400" : "glass-panel border-white/10 text-white/50 hover:text-white"}`}>{opt.l}</button>))}</div>
        <div className="flex gap-2 mr-auto">
          <button onClick={() => exportSalesExcel(filtered)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30 transition-all"><FileDown className="w-3.5 h-3.5" /> Excel</button>
          <button onClick={() => printSalesReport(filtered)}  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-500/20 border border-blue-500/40 text-blue-400 hover:bg-blue-500/30 transition-all"><Printer className="w-3.5 h-3.5" /> PDF الكل</button>
        </div>
      </div>
      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10"><tr><th className="p-3 text-white/50">رقم الفاتورة</th><th className="p-3 text-white/50">العميل</th><th className="p-3 text-white/50">الإجمالي</th><th className="p-3 text-white/50">المدفوع</th><th className="p-3 text-white/50">المتبقي</th><th className="p-3 text-white/50">الدفع</th><th className="p-3 text-white/50">الحالة</th><th className="p-3 text-white/50">التاريخ</th><th className="p-3 text-white/50">فاتورة</th></tr></thead>
            <tbody>
              {isLoading ? <TableSkeleton cols={9} rows={5} />
                : filtered.length === 0 ? <tr><td colSpan={9} className="p-12 text-center text-white/40">لا توجد فواتير</td></tr>
                : filtered.map(s => (<tr key={s.id} className="border-b border-white/5 erp-table-row"><td className="p-3 font-bold text-amber-400">{s.invoice_no}</td><td className="p-3 text-white">{s.customer_name || "عميل نقدي"}</td><td className="p-3 font-bold text-white">{formatCurrency(s.total_amount)}</td><td className="p-3 text-emerald-400 font-bold">{formatCurrency(s.paid_amount)}</td><td className="p-3 text-red-400 font-bold">{s.remaining_amount > 0 ? formatCurrency(s.remaining_amount) : "—"}</td><td className="p-3"><PaymentBadge type={s.payment_type} /></td><td className="p-3"><StatusBadge status={s.status} /></td><td className="p-3 text-white/40 text-xs">{formatDate(s.created_at)}</td><td className="p-3"><InvoicePdfButton type="sales" id={s.id} /></td></tr>))}
            </tbody>
            {filtered.length > 0 && (<tfoot className="bg-white/5 border-t border-white/10"><tr><td colSpan={2} className="p-3 text-white/50 font-bold">الإجمالي ({filtered.length} فاتورة)</td><td className="p-3 font-black text-white">{formatCurrency(totalSales)}</td><td className="p-3 font-black text-emerald-400">{formatCurrency(totalPaid)}</td><td className="p-3 font-black text-red-400">{formatCurrency(totalDebt)}</td><td colSpan={4} /></tr></tfoot>)}
          </table>
        </div>
      </div>
    </div>
  );
}

function PurchasesInvoicesReport() {
  const { data: purchases = [], isLoading } = useGetPurchases();
  const [search, setSearch]                 = useState("");
  const [payFilter, setPayFilter]           = useState("");

  const filtered = purchases.filter(p => {
    const matchS = !search || p.invoice_no.includes(search) || (p.customer_name && p.customer_name.includes(search));
    return matchS && (!payFilter || p.payment_type === payFilter);
  });

  const totalPurchases = filtered.reduce((s, v) => s + v.total_amount, 0);
  const totalPaid      = filtered.reduce((s, v) => s + v.paid_amount, 0);
  const totalRemaining = filtered.reduce((s, v) => s + v.remaining_amount, 0);

  return (
    <div className="space-y-4" style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }}>
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-panel rounded-2xl p-4 border border-red-500/10"><p className="text-red-400 text-xs mb-1">إجمالي المشتريات</p><p className="text-2xl font-black text-white">{formatCurrency(totalPurchases)}</p><p className="text-white/30 text-xs">{filtered.length} فاتورة</p></div>
        <div className="glass-panel rounded-2xl p-4 border border-emerald-500/10"><p className="text-emerald-400 text-xs mb-1">المدفوع</p><p className="text-2xl font-black text-white">{formatCurrency(totalPaid)}</p></div>
        <div className="glass-panel rounded-2xl p-4 border border-amber-500/10"><p className="text-amber-400 text-xs mb-1">المتبقي للموردين</p><p className="text-2xl font-black text-white">{formatCurrency(totalRemaining)}</p></div>
      </div>
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 max-w-xs"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" /><input className="glass-input w-full pr-9 text-sm" placeholder="بحث برقم الفاتورة أو المورد..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        <div className="flex gap-1">{[{ v: "", l: "الكل" }, { v: "cash", l: "نقدي" }, { v: "credit", l: "آجل" }, { v: "partial", l: "جزئي" }].map(opt => (<button key={opt.v} onClick={() => setPayFilter(opt.v)} className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${payFilter === opt.v ? "bg-amber-500/20 border-amber-500/40 text-amber-400" : "glass-panel border-white/10 text-white/50 hover:text-white"}`}>{opt.l}</button>))}</div>
        <div className="flex gap-2 mr-auto">
          <button onClick={() => exportPurchasesExcel(filtered)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30 transition-all"><FileDown className="w-3.5 h-3.5" /> Excel</button>
          <button onClick={() => printPurchasesReport(filtered)}  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-500/20 border border-blue-500/40 text-blue-400 hover:bg-blue-500/30 transition-all"><Printer className="w-3.5 h-3.5" /> PDF الكل</button>
        </div>
      </div>
      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10"><tr><th className="p-3 text-white/50">رقم الفاتورة</th><th className="p-3 text-white/50">المورد / العميل</th><th className="p-3 text-white/50">الإجمالي</th><th className="p-3 text-white/50">المدفوع</th><th className="p-3 text-white/50">المتبقي</th><th className="p-3 text-white/50">الدفع</th><th className="p-3 text-white/50">الحالة</th><th className="p-3 text-white/50">التاريخ</th><th className="p-3 text-white/50">فاتورة</th></tr></thead>
            <tbody>
              {isLoading ? <TableSkeleton cols={9} rows={5} />
                : filtered.length === 0 ? <tr><td colSpan={9} className="p-12 text-center text-white/40">لا توجد مشتريات</td></tr>
                : filtered.map(p => (<tr key={p.id} className="border-b border-white/5 erp-table-row"><td className="p-3 font-bold text-amber-400">{p.invoice_no}</td><td className="p-3 text-white">{p.customer_name || "—"}</td><td className="p-3 font-bold text-white">{formatCurrency(p.total_amount)}</td><td className="p-3 text-emerald-400 font-bold">{formatCurrency(p.paid_amount)}</td><td className="p-3 text-red-400 font-bold">{p.remaining_amount > 0 ? formatCurrency(p.remaining_amount) : "—"}</td><td className="p-3"><PaymentBadge type={p.payment_type} /></td><td className="p-3"><StatusBadge status={p.status} /></td><td className="p-3 text-white/40 text-xs">{formatDate(p.created_at)}</td><td className="p-3"><InvoicePdfButton type="purchases" id={p.id} /></td></tr>))}
            </tbody>
            {filtered.length > 0 && (<tfoot className="bg-white/5 border-t border-white/10"><tr><td colSpan={2} className="p-3 text-white/50 font-bold">الإجمالي ({filtered.length} فاتورة)</td><td className="p-3 font-black text-white">{formatCurrency(totalPurchases)}</td><td className="p-3 font-black text-emerald-400">{formatCurrency(totalPaid)}</td><td className="p-3 font-black text-red-400">{formatCurrency(totalRemaining)}</td><td colSpan={4} /></tr></tfoot>)}
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Main Reports — 4 tabs
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
      <div className="flex bg-white/5 rounded-2xl p-1 border border-white/10 flex-wrap gap-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex-1 min-w-fit ${tab === t.id ? "bg-amber-500 text-black shadow" : "text-white/50 hover:text-white"}`}
            style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }}>
            {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
          {tab === "pl"        && <ProfitLossReport />}
          {tab === "inventory" && <InventoryReport />}
          {tab === "purchases" && <PurchasesInvoicesReport />}
          {tab === "sales"     && <SalesInvoicesReport />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
