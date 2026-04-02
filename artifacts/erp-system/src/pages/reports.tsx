import React, { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useGetProducts, useGetSales, useGetPurchases } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  TrendingUp, TrendingDown, Package, FileText, DollarSign,
  X, ShoppingBag, ShoppingCart, Search, FileDown, Printer,
  Loader2, BarChart3, AlertTriangle, ChevronDown, Filter, ArrowUpDown,
  Users, Truck, Calendar, CreditCard, Award, ArrowUp, ArrowDown,
} from "lucide-react";
import { exportSalesExcel, exportPurchasesExcel } from "@/lib/export-excel";
import { printSalesReport, printPurchasesReport, printSaleInvoice, printPurchaseInvoice, printPLReport } from "@/lib/export-pdf";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar, LabelList, ReferenceLine,
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
 *  Recharts Waterfall Chart
 * ───────────────────────────────────────────────────────────────────────────── */

const WF_COLORS = {
  revenue:     { fill: "#10b981", stroke: "#059669" },
  cost:        { fill: "#ef4444", stroke: "#dc2626" },
  grossPos:    { fill: "#f59e0b", stroke: "#d97706" },
  grossNeg:    { fill: "#ef4444", stroke: "#dc2626" },
  expenses:    { fill: "#f97316", stroke: "#ea580c" },
  netPos:      { fill: "#10b981", stroke: "#059669" },
  netNeg:      { fill: "#ef4444", stroke: "#dc2626" },
};

function WaterfallSection({ pl }: { pl: ProfitsData }) {
  const { total_revenue: rev, total_cost: cost, gross_profit: gross, total_expenses: exp, net_profit: net } = pl;

  const wfData = useMemo(() => {
    const items = [
      {
        name: "إجمالي المبيعات",
        displayVal: rev,
        base: 0,
        fill: WF_COLORS.revenue.fill,
        stroke: WF_COLORS.revenue.stroke,
        label: `+${formatCurrency(rev)}`,
        isResult: false,
      },
      {
        name: "(-) تكلفة البضاعة",
        displayVal: cost,
        base: Math.max(gross, 0),
        fill: WF_COLORS.cost.fill,
        stroke: WF_COLORS.cost.stroke,
        label: `-${formatCurrency(cost)}`,
        isResult: false,
      },
      {
        name: "= مجمل الربح",
        displayVal: Math.abs(gross),
        base: gross >= 0 ? 0 : gross,
        fill: gross >= 0 ? WF_COLORS.grossPos.fill : WF_COLORS.grossNeg.fill,
        stroke: gross >= 0 ? WF_COLORS.grossPos.stroke : WF_COLORS.grossNeg.stroke,
        label: `${gross >= 0 ? "=" : "="} ${formatCurrency(gross)}`,
        isResult: true,
      },
      {
        name: "(-) المصروفات",
        displayVal: exp,
        base: Math.max(net, 0),
        fill: WF_COLORS.expenses.fill,
        stroke: WF_COLORS.expenses.stroke,
        label: `-${formatCurrency(exp)}`,
        isResult: false,
      },
      {
        name: "= صافي الربح",
        displayVal: Math.abs(net),
        base: net >= 0 ? 0 : net,
        fill: net >= 0 ? WF_COLORS.netPos.fill : WF_COLORS.netNeg.fill,
        stroke: net >= 0 ? WF_COLORS.netPos.stroke : WF_COLORS.netNeg.stroke,
        label: `${net >= 0 ? "+" : "-"} ${formatCurrency(Math.abs(net))}`,
        isResult: true,
      },
    ];
    return items;
  }, [rev, cost, gross, exp, net]);

  const maxDomain = Math.max(rev, cost, Math.abs(gross), exp, Math.abs(net), 1);

  const customLabel = (props: any) => {
    const { x, y, width, height, index } = props;
    const item = wfData[index];
    if (!item) return null;
    const cx = x + width / 2;
    const cy = height > 24 ? y + height / 2 : y - 6;
    const anchor = "middle";
    return (
      <text x={cx} y={cy} textAnchor={anchor} dominantBaseline="middle"
        fill="rgba(255,255,255,0.9)" fontSize={10} fontWeight={700}
        fontFamily="Tajawal, Cairo, sans-serif">
        {item.label}
      </text>
    );
  };

  return (
    <div className="glass-panel rounded-2xl p-6 border border-white/5" style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }}>
      <h3 className="text-white font-bold mb-5 flex items-center gap-2 text-sm">
        <BarChart3 className="w-4 h-4 text-amber-400" /> تدفق الأرباح والخسائر (Waterfall)
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={wfData} margin={{ top: 12, right: 16, left: 8, bottom: 0 }} barCategoryGap="20%">
          <XAxis
            dataKey="name"
            tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10, fontFamily: "Tajawal, Cairo, sans-serif" }}
            axisLine={false} tickLine={false}
          />
          <YAxis hide domain={[Math.min(net < 0 ? net : 0, 0) * 1.05, maxDomain * 1.1]} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
          <Tooltip
            contentStyle={{ background: "rgba(10,18,35,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 11, fontFamily: "Tajawal, Cairo" }}
            formatter={(_: any, __: any, props: any) => {
              const item = wfData[props.index];
              return [item ? item.label : "", item?.name ?? ""];
            }}
            labelFormatter={(label) => `${label}`}
          />
          <Bar dataKey="base" stackId="wf" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="displayVal" stackId="wf" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={800} animationEasing="ease-out">
            {wfData.map((entry, i) => (
              <Cell key={i}
                fill={entry.fill}
                stroke={entry.isResult ? entry.stroke : "transparent"}
                strokeWidth={entry.isResult ? 1.5 : 0}
                style={entry.isResult ? { filter: `drop-shadow(0 0 6px ${entry.fill}66)` } : {}}
              />
            ))}
            <LabelList content={customLabel} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-4 mt-3">
        {[
          { color: WF_COLORS.revenue.fill,   label: "إيراد" },
          { color: WF_COLORS.cost.fill,      label: "تكلفة/مصروف" },
          { color: WF_COLORS.grossPos.fill,  label: "نتيجة إيجابية" },
          { color: WF_COLORS.netNeg.fill,    label: "نتيجة سلبية" },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5 text-xs text-white/40">
            <div className="w-3 h-2 rounded-sm" style={{ background: l.color }} />
            {l.label}
          </div>
        ))}
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
        name: fmtDay(d.day), الإيرادات: +d.revenue.toFixed(2), تكلفة: +d.cost.toFixed(2), ربح: +d.profit.toFixed(2),
      }));
    }
    return [...by_month].sort((a, b) => a.month.localeCompare(b.month)).map(m => ({
      name: fmtMonth(m.month), الإيرادات: +m.revenue.toFixed(2), تكلفة: +m.cost.toFixed(2), ربح: +m.profit.toFixed(2),
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
            <Area type="monotone" dataKey="الإيرادات" stroke="#10b981" strokeWidth={2} fill="url(#gRev)"    dot={false} />
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
        {[{ color: "#10b981", label: "الإيرادات" }, { color: "#ef4444", label: "تكلفة البضاعة" }, { color: "#f59e0b", label: "صافي الربح" }].map(l => (
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

const MEDAL_GLOW = [
  "shadow-amber-400/20 border-amber-400/40",
  "shadow-slate-400/15 border-slate-400/30",
  "shadow-orange-700/15 border-orange-700/30",
  "border-white/8",
  "border-white/8",
];

function RankedProductsList({ products }: { products: ProfitsData["by_product"] }) {
  const top = useMemo(() => [...products].sort((a, b) => b.profit - a.profit).slice(0, 5), [products]);
  if (top.length === 0) return null;

  return (
    <div className="space-y-3" style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }}>
      <div className="flex items-center gap-2 px-1">
        <ShoppingBag className="w-4 h-4 text-amber-400" />
        <h3 className="text-white font-bold text-sm">أعلى المنتجات ربحية</h3>
      </div>
      {top.map((p, i) => {
        const margin     = p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0;
        const barColor   = margin >= 50 ? "#10b981" : margin >= 30 ? "#f59e0b" : "#ef4444";
        const marginCls  = margin >= 50 ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400"
                         : margin >= 30 ? "bg-amber-500/20 border-amber-500/30 text-amber-400"
                         : "bg-red-500/20 border-red-500/30 text-red-400";
        return (
          <motion.div
            key={p.product_id}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: i * 0.1, ease: "easeOut" }}
            whileHover={{ y: -3, transition: { duration: 0.15 } }}
            className={`glass-panel rounded-2xl p-4 border shadow-lg ${MEDAL_GLOW[i] ?? "border-white/8"}`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-3">
                <span className="text-2xl leading-none select-none">{MEDALS[i] ?? `#${i + 1}`}</span>
                <div>
                  <p className="text-white font-bold">{p.product_name}</p>
                  <p className="text-white/30 text-xs mt-0.5">{p.qty_sold} وحدة مباعة</p>
                </div>
              </div>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${marginCls}`}>
                هامش: {margin.toFixed(1)}%
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-2 bg-white/5 rounded-full overflow-hidden mb-3">
              <motion.div
                className="h-full rounded-full"
                style={{ background: `linear-gradient(to left, ${barColor}cc, ${barColor})` }}
                initial={{ width: "0%" }}
                animate={{ width: `${Math.min(margin, 100)}%` }}
                transition={{ duration: 0.9, delay: i * 0.1 + 0.3, ease: "easeOut" }}
              />
            </div>

            {/* Stats row */}
            <div className="flex gap-4 text-xs flex-wrap">
              <span className="text-white/40">
                إيراد: <span className="text-emerald-400 font-bold">{formatCurrency(p.revenue)}</span>
              </span>
              <span className="text-white/20">|</span>
              <span className="text-white/40">
                تكلفة: <span className="text-red-400 font-bold">{formatCurrency(p.cost)}</span>
              </span>
              <span className="text-white/20">|</span>
              <span className="text-white/40">
                ربح: <span className={`font-black ${p.profit >= 0 ? "text-amber-400" : "text-red-400"}`}>{formatCurrency(p.profit)}</span>
              </span>
            </div>
          </motion.div>
        );
      })}
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

      {/* ── صندوق الملخص المالي ── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-panel rounded-2xl p-5 border border-emerald-500/40 bg-emerald-500/5 flex flex-col">
          <p className="text-emerald-400/80 text-xs font-semibold mb-2 tracking-wide">الإيرادات</p>
          <p className="text-emerald-400 font-black text-2xl leading-none tabular-nums">{formatCurrency(pl.total_revenue)}</p>
          <p className="text-emerald-400/40 text-xs mt-2">{pl.invoice_count} فاتورة</p>
        </div>
        <div className="glass-panel rounded-2xl p-5 border border-red-500/40 bg-red-500/5 flex flex-col">
          <p className="text-red-400/80 text-xs font-semibold mb-2 tracking-wide">تكلفة البضاعة</p>
          <p className="text-red-400 font-black text-2xl leading-none tabular-nums">{formatCurrency(pl.total_cost)}</p>
          <p className="text-red-400/40 text-xs mt-2">{pl.total_revenue > 0 ? `${((pl.total_cost / pl.total_revenue) * 100).toFixed(1)}% من الإيرادات` : "—"}</p>
        </div>
        <div className={`glass-panel rounded-2xl p-5 border flex flex-col ${pl.net_profit >= 0 ? "border-green-500/40 bg-green-500/5" : "border-red-500/40 bg-red-500/5"}`}>
          <p className={`text-xs font-semibold mb-2 tracking-wide ${pl.net_profit >= 0 ? "text-green-400/80" : "text-red-400/80"}`}>صافي الربح</p>
          <p className={`font-black text-2xl leading-none tabular-nums ${pl.net_profit >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(pl.net_profit)}</p>
          <p className={`text-xs mt-2 font-bold ${pl.net_profit >= 0 ? "text-green-400/60" : "text-red-400/60"}`}>{pl.net_profit >= 0 ? "▲ ربح" : "▼ خسارة"} · هامش {pl.profit_margin.toFixed(1)}%</p>
        </div>
      </div>

      {/* ── Hero KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <HeroKPICard index={0} label="إجمالي المبيعات" value={pl.total_revenue} prevValue={prev.total_revenue}
          sub={`${pl.invoice_count} فاتورة · ${pl.item_count} صنف`}
          border="border-r-emerald-500/70" icon={<TrendingUp className="w-4 h-4 text-emerald-400" />} />
        <HeroKPICard index={1} label="تكلفة البضاعة" value={pl.total_cost} prevValue={prev.total_cost}
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
 *  Shared date filter bar for new reports
 * ───────────────────────────────────────────────────────────────────────────── */

function DateFilterBar({
  mode, setMode, customFrom, setCustomFrom, customTo, setCustomTo,
}: {
  mode: DateMode; setMode: (m: DateMode) => void;
  customFrom: string; setCustomFrom: (s: string) => void;
  customTo: string;   setCustomTo:   (s: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }}>
      {DATE_MODES.map(m => (
        <button key={m.id} onClick={() => setMode(m.id)}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${mode === m.id ? "bg-amber-500/25 border-amber-500/50 text-amber-300" : "glass-panel border-white/10 text-white/50 hover:text-white"}`}>
          {m.label}
        </button>
      ))}
      {mode === "custom" && (
        <div className="flex items-center gap-2">
          <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="glass-input rounded-xl px-3 py-1.5 text-sm text-white" />
          <span className="text-white/30">←</span>
          <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="glass-input rounded-xl px-3 py-1.5 text-sm text-white" />
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  TAB: التقرير اليومي للأرباح
 * ───────────────────────────────────────────────────────────────────────────── */

interface DailyProfitData {
  days: Array<{
    day: string; total_sales: number; total_returns: number; net_sales: number;
    total_cogs: number; gross_profit: number; expenses: number; net_profit: number;
  }>;
  summary: { total_net_sales: number; total_cogs: number; total_gross_profit: number; total_expenses: number; total_net_profit: number };
}

function DailyProfitReport() {
  const [mode, setMode]             = useState<DateMode>("month");
  const [customFrom, setCustomFrom] = useState(thisMonthStart());
  const [customTo,   setCustomTo]   = useState(todayStr());
  const [dateFrom, dateTo]          = getDateRange(mode, customFrom, customTo);

  const { data, isLoading } = useQuery<DailyProfitData>({
    queryKey: ["/api/reports/daily-profit", dateFrom, dateTo],
    queryFn: () => authFetch<DailyProfitData>(api(`/api/reports/daily-profit?date_from=${dateFrom}&date_to=${dateTo}`)),
    staleTime: 60_000,
  });

  const days = data?.days ?? [];
  const summary = data?.summary ?? { total_net_sales: 0, total_cogs: 0, total_gross_profit: 0, total_expenses: 0, total_net_profit: 0 };

  return (
    <div className="space-y-4" style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }}>
      <DateFilterBar mode={mode} setMode={setMode} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "صافي المبيعات", value: summary.total_net_sales, color: "text-emerald-400" },
          { label: "تكلفة البضاعة", value: summary.total_cogs,      color: "text-red-400" },
          { label: "مجمل الربح",    value: summary.total_gross_profit, color: "text-amber-400" },
          { label: "المصروفات",     value: summary.total_expenses,   color: "text-orange-400" },
          { label: "صافي الربح",   value: summary.total_net_profit, color: summary.total_net_profit >= 0 ? "text-blue-400" : "text-red-400" },
        ].map(c => (
          <div key={c.label} className="glass-panel rounded-2xl p-4 border border-white/5">
            <p className="text-white/40 text-xs mb-1">{c.label}</p>
            <p className={`text-lg font-black ${c.color}`}>{formatCurrency(c.value)}</p>
          </div>
        ))}
      </div>

      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-3 text-white/50">التاريخ</th>
                <th className="p-3 text-white/50">المبيعات</th>
                <th className="p-3 text-white/50">المرتجعات</th>
                <th className="p-3 text-white/50">صافي المبيعات</th>
                <th className="p-3 text-white/50">تكلفة البضاعة</th>
                <th className="p-3 text-white/50">مجمل الربح</th>
                <th className="p-3 text-white/50">المصروفات</th>
                <th className="p-3 text-white/50">صافي الربح</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <TableSkeleton cols={8} rows={5} /> :
               days.length === 0 ? <tr><td colSpan={8} className="p-12 text-center text-white/40">لا توجد بيانات في هذه الفترة</td></tr> :
               days.map(d => (
                <tr key={d.day} className="border-b border-white/5 erp-table-row">
                  <td className="p-3 text-white/70 font-mono">{d.day}</td>
                  <td className="p-3 text-emerald-400 font-bold">{formatCurrency(d.total_sales)}</td>
                  <td className="p-3 text-red-400">{d.total_returns > 0 ? formatCurrency(d.total_returns) : "—"}</td>
                  <td className="p-3 text-white font-bold">{formatCurrency(d.net_sales)}</td>
                  <td className="p-3 text-red-400">{formatCurrency(d.total_cogs)}</td>
                  <td className={`p-3 font-bold ${d.gross_profit >= 0 ? "text-amber-400" : "text-red-400"}`}>{formatCurrency(d.gross_profit)}</td>
                  <td className="p-3 text-orange-400">{d.expenses > 0 ? formatCurrency(d.expenses) : "—"}</td>
                  <td className={`p-3 font-black ${d.net_profit >= 0 ? "text-blue-400" : "text-red-400"}`}>{formatCurrency(d.net_profit)}</td>
                </tr>
              ))}
            </tbody>
            {days.length > 0 && (
              <tfoot className="bg-white/5 border-t border-white/10">
                <tr>
                  <td className="p-3 font-bold text-white/50">الإجمالي</td>
                  <td className="p-3" />
                  <td className="p-3" />
                  <td className="p-3 font-black text-white">{formatCurrency(summary.total_net_sales)}</td>
                  <td className="p-3 font-black text-red-400">{formatCurrency(summary.total_cogs)}</td>
                  <td className="p-3 font-black text-amber-400">{formatCurrency(summary.total_gross_profit)}</td>
                  <td className="p-3 font-black text-orange-400">{formatCurrency(summary.total_expenses)}</td>
                  <td className={`p-3 font-black ${summary.total_net_profit >= 0 ? "text-blue-400" : "text-red-400"}`}>{formatCurrency(summary.total_net_profit)}</td>
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
 *  TAB: ربحية المنتجات
 * ───────────────────────────────────────────────────────────────────────────── */

interface ProductProfitData {
  products: Array<{ product_id: number; product_name: string; qty_sold: number; revenue: number; cogs: number; profit: number; profit_margin: number }>;
  summary: { total_revenue: number; total_cogs: number; total_profit: number; overall_margin: number };
}

function ProductProfitReport() {
  const [mode, setMode]             = useState<DateMode>("month");
  const [customFrom, setCustomFrom] = useState(thisMonthStart());
  const [customTo,   setCustomTo]   = useState(todayStr());
  const [search, setSearch]         = useState("");
  const [sort, setSort]             = useState<"profit"|"revenue"|"margin"|"qty">("profit");
  const [dateFrom, dateTo]          = getDateRange(mode, customFrom, customTo);

  const { data, isLoading } = useQuery<ProductProfitData>({
    queryKey: ["/api/reports/product-profit", dateFrom, dateTo],
    queryFn: () => authFetch<ProductProfitData>(api(`/api/reports/product-profit?date_from=${dateFrom}&date_to=${dateTo}`)),
    staleTime: 60_000,
  });

  const products = useMemo(() => {
    let list = data?.products ?? [];
    if (search) list = list.filter(p => p.product_name.includes(search));
    return [...list].sort((a, b) => {
      if (sort === "profit")  return b.profit - a.profit;
      if (sort === "revenue") return b.revenue - a.revenue;
      if (sort === "margin")  return b.profit_margin - a.profit_margin;
      return b.qty_sold - a.qty_sold;
    });
  }, [data, search, sort]);

  const summary = data?.summary ?? { total_revenue: 0, total_cogs: 0, total_profit: 0, overall_margin: 0 };

  return (
    <div className="space-y-4" style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }}>
      <DateFilterBar mode={mode} setMode={setMode} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "إجمالي المبيعات",  value: formatCurrency(summary.total_revenue), color: "text-emerald-400" },
          { label: "تكلفة البضاعة",    value: formatCurrency(summary.total_cogs),    color: "text-red-400" },
          { label: "إجمالي الربح",     value: formatCurrency(summary.total_profit),  color: summary.total_profit >= 0 ? "text-amber-400" : "text-red-400" },
          { label: "هامش الربح الكلي", value: `${summary.overall_margin.toFixed(1)}%`, color: summary.overall_margin >= 20 ? "text-emerald-400" : "text-red-400" },
        ].map(c => (
          <div key={c.label} className="glass-panel rounded-2xl p-4 border border-white/5">
            <p className="text-white/40 text-xs mb-1">{c.label}</p>
            <p className={`text-lg font-black ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input className="glass-input w-full pr-9 text-sm" placeholder="بحث بالمنتج..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {(["profit","revenue","margin","qty"] as const).map(s => (
            <button key={s} onClick={() => setSort(s)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${sort === s ? "bg-amber-500/20 border-amber-500/40 text-amber-400" : "glass-panel border-white/10 text-white/50 hover:text-white"}`}>
              {s === "profit" ? "الربح" : s === "revenue" ? "المبيعات" : s === "margin" ? "الهامش" : "الكمية"}
            </button>
          ))}
        </div>
      </div>

      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-3 text-white/50">#</th>
                <th className="p-3 text-white/50">المنتج</th>
                <th className="p-3 text-white/50">الكمية المباعة</th>
                <th className="p-3 text-white/50">إجمالي المبيعات</th>
                <th className="p-3 text-white/50">تكلفة البضاعة</th>
                <th className="p-3 text-white/50">الربح</th>
                <th className="p-3 text-white/50">هامش الربح</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <TableSkeleton cols={7} rows={5} /> :
               products.length === 0 ? <tr><td colSpan={7} className="p-12 text-center text-white/40">لا توجد بيانات</td></tr> :
               products.map((p, i) => (
                <tr key={p.product_id} className="border-b border-white/5 erp-table-row">
                  <td className="p-3 text-white/30 text-xs">{i + 1}</td>
                  <td className="p-3 text-white font-bold">{p.product_name}</td>
                  <td className="p-3 text-white/70">{p.qty_sold.toFixed(2)}</td>
                  <td className="p-3 text-emerald-400 font-bold">{formatCurrency(p.revenue)}</td>
                  <td className="p-3 text-red-400">{formatCurrency(p.cogs)}</td>
                  <td className={`p-3 font-black ${p.profit >= 0 ? "text-amber-400" : "text-red-400"}`}>{formatCurrency(p.profit)}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${p.profit_margin >= 30 ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400" : p.profit_margin >= 15 ? "bg-amber-500/20 border-amber-500/30 text-amber-400" : "bg-red-500/20 border-red-500/30 text-red-400"}`}>
                      {p.profit_margin.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            {products.length > 0 && (
              <tfoot className="bg-white/5 border-t border-white/10">
                <tr>
                  <td colSpan={3} className="p-3 text-white/50 font-bold">الإجمالي ({products.length} منتج)</td>
                  <td className="p-3 font-black text-emerald-400">{formatCurrency(summary.total_revenue)}</td>
                  <td className="p-3 font-black text-red-400">{formatCurrency(summary.total_cogs)}</td>
                  <td className={`p-3 font-black ${summary.total_profit >= 0 ? "text-amber-400" : "text-red-400"}`}>{formatCurrency(summary.total_profit)}</td>
                  <td className="p-3 font-bold text-white/50">{summary.overall_margin.toFixed(1)}%</td>
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
 *  TAB: تحليل المبيعات
 * ───────────────────────────────────────────────────────────────────────────── */

interface SalesAnalysisData {
  by_product: Array<{ product_id: number; product_name: string; total_qty: number; total_revenue: number; avg_price: number; invoice_count: number }>;
  by_customer: Array<{ customer_id: number | null; customer_name: string; total_revenue: number; invoice_count: number }>;
}

function SalesAnalysisReport() {
  const [mode, setMode]             = useState<DateMode>("month");
  const [customFrom, setCustomFrom] = useState(thisMonthStart());
  const [customTo,   setCustomTo]   = useState(todayStr());
  const [view, setView]             = useState<"product"|"customer">("product");
  const [dateFrom, dateTo]          = getDateRange(mode, customFrom, customTo);

  const { data, isLoading } = useQuery<SalesAnalysisData>({
    queryKey: ["/api/reports/sales-analysis", dateFrom, dateTo],
    queryFn: () => authFetch<SalesAnalysisData>(api(`/api/reports/sales-analysis?date_from=${dateFrom}&date_to=${dateTo}`)),
    staleTime: 60_000,
  });

  const byProduct  = data?.by_product  ?? [];
  const byCustomer = data?.by_customer ?? [];
  const totalByProd = byProduct.reduce((s, p) => s + p.total_revenue, 0);
  const totalByCust = byCustomer.reduce((s, c) => s + c.total_revenue, 0);

  return (
    <div className="space-y-4" style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }}>
      <DateFilterBar mode={mode} setMode={setMode} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />

      <div className="flex bg-white/5 rounded-xl p-1 gap-1 w-fit">
        <button onClick={() => setView("product")}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${view === "product" ? "bg-amber-500/20 border border-amber-500/40 text-amber-400" : "text-white/50 hover:text-white"}`}>
          <Package className="w-4 h-4" /> حسب المنتج
        </button>
        <button onClick={() => setView("customer")}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${view === "customer" ? "bg-amber-500/20 border border-amber-500/40 text-amber-400" : "text-white/50 hover:text-white"}`}>
          <Users className="w-4 h-4" /> حسب العميل
        </button>
      </div>

      {view === "product" ? (
        <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm whitespace-nowrap">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  <th className="p-3 text-white/50">#</th>
                  <th className="p-3 text-white/50">المنتج</th>
                  <th className="p-3 text-white/50">الكمية</th>
                  <th className="p-3 text-white/50">متوسط السعر</th>
                  <th className="p-3 text-white/50">إجمالي المبيعات</th>
                  <th className="p-3 text-white/50">% من الإجمالي</th>
                  <th className="p-3 text-white/50">عدد الفواتير</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? <TableSkeleton cols={7} rows={5} /> :
                 byProduct.length === 0 ? <tr><td colSpan={7} className="p-12 text-center text-white/40">لا توجد بيانات</td></tr> :
                 byProduct.map((p, i) => (
                  <tr key={p.product_id} className="border-b border-white/5 erp-table-row">
                    <td className="p-3 text-white/30 text-xs">{i + 1}</td>
                    <td className="p-3 text-white font-bold">{p.product_name}</td>
                    <td className="p-3 text-white/70">{p.total_qty.toFixed(2)}</td>
                    <td className="p-3 text-white/70">{formatCurrency(p.avg_price)}</td>
                    <td className="p-3 text-emerald-400 font-bold">{formatCurrency(p.total_revenue)}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 bg-white/5 rounded-full flex-1 max-w-[80px] overflow-hidden">
                          <div className="h-full bg-amber-400 rounded-full" style={{ width: `${totalByProd > 0 ? (p.total_revenue / totalByProd * 100) : 0}%` }} />
                        </div>
                        <span className="text-white/40 text-xs">{totalByProd > 0 ? (p.total_revenue / totalByProd * 100).toFixed(1) : 0}%</span>
                      </div>
                    </td>
                    <td className="p-3 text-white/50">{p.invoice_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm whitespace-nowrap">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  <th className="p-3 text-white/50">#</th>
                  <th className="p-3 text-white/50">العميل</th>
                  <th className="p-3 text-white/50">إجمالي المبيعات</th>
                  <th className="p-3 text-white/50">% من الإجمالي</th>
                  <th className="p-3 text-white/50">عدد الفواتير</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? <TableSkeleton cols={5} rows={5} /> :
                 byCustomer.length === 0 ? <tr><td colSpan={5} className="p-12 text-center text-white/40">لا توجد بيانات</td></tr> :
                 byCustomer.map((c, i) => (
                  <tr key={c.customer_id ?? i} className="border-b border-white/5 erp-table-row">
                    <td className="p-3 text-white/30 text-xs">{i + 1}</td>
                    <td className="p-3 text-white font-bold">{c.customer_name}</td>
                    <td className="p-3 text-emerald-400 font-bold">{formatCurrency(c.total_revenue)}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 bg-white/5 rounded-full flex-1 max-w-[80px] overflow-hidden">
                          <div className="h-full bg-blue-400 rounded-full" style={{ width: `${totalByCust > 0 ? (c.total_revenue / totalByCust * 100) : 0}%` }} />
                        </div>
                        <span className="text-white/40 text-xs">{totalByCust > 0 ? (c.total_revenue / totalByCust * 100).toFixed(1) : 0}%</span>
                      </div>
                    </td>
                    <td className="p-3 text-white/50">{c.invoice_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  TAB: كشف حساب عميل
 * ───────────────────────────────────────────────────────────────────────────── */

interface StatementRow { date: string; type: string; description: string; debit: number; credit: number; balance: number; reference_no?: string | null }
interface CustomerStatementData {
  customer: { id: number; name: string; balance: number; customer_code: number };
  opening_balance: number;
  statement: StatementRow[];
  closing_balance: number;
}

const STMT_TYPE_MAP: Record<string, { label: string; cls: string }> = {
  opening_balance: { label: "رصيد أول المدة", cls: "text-amber-400" },
  sale:            { label: "فاتورة مبيعات",  cls: "text-blue-400" },
  receipt:         { label: "سند قبض",        cls: "text-emerald-400" },
  sale_return:     { label: "مرتجع مبيعات",   cls: "text-orange-400" },
};

function CustomerStatementReport() {
  const [customerId, setCustomerId] = useState<string>("");
  const [mode, setMode]             = useState<DateMode>("month");
  const [customFrom, setCustomFrom] = useState(thisMonthStart());
  const [customTo,   setCustomTo]   = useState(todayStr());
  const [dateFrom, dateTo]          = getDateRange(mode, customFrom, customTo);

  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ["/api/customers"],
    queryFn: () => authFetch<any[]>(api("/api/customers")),
    staleTime: 120_000,
  });

  const { data, isLoading, isFetching } = useQuery<CustomerStatementData>({
    queryKey: ["/api/reports/customer-statement", customerId, dateFrom, dateTo],
    queryFn: () => authFetch<CustomerStatementData>(api(`/api/reports/customer-statement?customer_id=${customerId}&date_from=${dateFrom}&date_to=${dateTo}`)),
    enabled: !!customerId,
    staleTime: 30_000,
  });

  const stmt = data?.statement ?? [];

  return (
    <div className="space-y-4" style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }}>
      <div className="flex flex-wrap gap-3 items-center">
        <select value={customerId} onChange={e => setCustomerId(e.target.value)}
          className="glass-input rounded-xl px-3 py-2 text-sm text-white min-w-[200px]">
          <option value="">اختر العميل...</option>
          {customers.map((c: any) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
        </select>
        <DateFilterBar mode={mode} setMode={setMode} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />
      </div>

      {!customerId ? (
        <div className="glass-panel rounded-2xl p-12 text-center border border-white/5">
          <Users className="w-10 h-10 text-white/20 mx-auto mb-3" />
          <p className="text-white/40 font-bold">اختر عميلاً لعرض كشف حسابه</p>
        </div>
      ) : (
        <>
          {data && (
            <div className="grid grid-cols-3 gap-3">
              <div className="glass-panel rounded-2xl p-4 border border-white/5">
                <p className="text-white/40 text-xs mb-1">رصيد أول المدة</p>
                <p className={`text-lg font-black ${data.opening_balance >= 0 ? "text-amber-400" : "text-red-400"}`}>{formatCurrency(data.opening_balance)}</p>
              </div>
              <div className="glass-panel rounded-2xl p-4 border border-white/5">
                <p className="text-white/40 text-xs mb-1">رصيد الختام</p>
                <p className={`text-lg font-black ${data.closing_balance >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatCurrency(data.closing_balance)}</p>
              </div>
              <div className="glass-panel rounded-2xl p-4 border border-white/5">
                <p className="text-white/40 text-xs mb-1">الرصيد الفعلي (الدفتر)</p>
                <p className={`text-lg font-black ${data.customer.balance >= 0 ? "text-blue-400" : "text-red-400"}`}>{formatCurrency(data.customer.balance)}</p>
              </div>
            </div>
          )}

          <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm whitespace-nowrap">
                <thead className="bg-white/5 border-b border-white/10">
                  <tr>
                    <th className="p-3 text-white/50">التاريخ</th>
                    <th className="p-3 text-white/50">النوع</th>
                    <th className="p-3 text-white/50">البيان</th>
                    <th className="p-3 text-white/50">مدين (له)</th>
                    <th className="p-3 text-white/50">دائن (عليه)</th>
                    <th className="p-3 text-white/50">الرصيد</th>
                  </tr>
                </thead>
                <tbody>
                  {(isLoading || isFetching) ? <TableSkeleton cols={6} rows={5} /> :
                   stmt.length === 0 ? <tr><td colSpan={6} className="p-12 text-center text-white/40">لا توجد حركات في هذه الفترة</td></tr> :
                   stmt.map((row, i) => {
                    const meta = STMT_TYPE_MAP[row.type] ?? { label: row.type, cls: "text-white/50" };
                    return (
                      <tr key={i} className="border-b border-white/5 erp-table-row">
                        <td className="p-3 font-mono text-white/60 text-xs">{row.date}</td>
                        <td className="p-3"><span className={`text-xs font-bold ${meta.cls}`}>{meta.label}</span></td>
                        <td className="p-3 text-white/70">{row.description}{row.reference_no && <span className="text-white/30 text-xs mr-2">{row.reference_no}</span>}</td>
                        <td className="p-3 text-blue-400 font-bold">{row.debit > 0 ? formatCurrency(row.debit) : "—"}</td>
                        <td className="p-3 text-emerald-400 font-bold">{row.credit > 0 ? formatCurrency(row.credit) : "—"}</td>
                        <td className={`p-3 font-black ${row.balance >= 0 ? "text-white" : "text-red-400"}`}>{formatCurrency(row.balance)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  TAB: كشف حساب مورد
 * ───────────────────────────────────────────────────────────────────────────── */

interface SupplierStatementData {
  supplier: { id: number; name: string; balance: number };
  opening_balance: number;
  statement: StatementRow[];
  closing_balance: number;
}

const SUP_TYPE_MAP: Record<string, { label: string; cls: string }> = {
  opening_balance:  { label: "رصيد أول المدة",  cls: "text-amber-400" },
  purchase:         { label: "فاتورة شراء",      cls: "text-blue-400" },
  payment:          { label: "سند دفع",          cls: "text-emerald-400" },
  purchase_return:  { label: "مرتجع مشتريات",   cls: "text-orange-400" },
};

function SupplierStatementReport() {
  const [supplierId, setSupplierId] = useState<string>("");
  const [mode, setMode]             = useState<DateMode>("month");
  const [customFrom, setCustomFrom] = useState(thisMonthStart());
  const [customTo,   setCustomTo]   = useState(todayStr());
  const [dateFrom, dateTo]          = getDateRange(mode, customFrom, customTo);

  const { data: suppliers = [] } = useQuery<any[]>({
    queryKey: ["/api/suppliers"],
    queryFn: () => authFetch<any[]>(api("/api/suppliers")),
    staleTime: 120_000,
  });

  const { data, isLoading, isFetching } = useQuery<SupplierStatementData>({
    queryKey: ["/api/reports/supplier-statement", supplierId, dateFrom, dateTo],
    queryFn: () => authFetch<SupplierStatementData>(api(`/api/reports/supplier-statement?supplier_id=${supplierId}&date_from=${dateFrom}&date_to=${dateTo}`)),
    enabled: !!supplierId,
    staleTime: 30_000,
  });

  const stmt = data?.statement ?? [];

  return (
    <div className="space-y-4" style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }}>
      <div className="flex flex-wrap gap-3 items-center">
        <select value={supplierId} onChange={e => setSupplierId(e.target.value)}
          className="glass-input rounded-xl px-3 py-2 text-sm text-white min-w-[200px]">
          <option value="">اختر المورد...</option>
          {suppliers.map((s: any) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
        </select>
        <DateFilterBar mode={mode} setMode={setMode} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />
      </div>

      {!supplierId ? (
        <div className="glass-panel rounded-2xl p-12 text-center border border-white/5">
          <Truck className="w-10 h-10 text-white/20 mx-auto mb-3" />
          <p className="text-white/40 font-bold">اختر موردًا لعرض كشف حسابه</p>
        </div>
      ) : (
        <>
          {data && (
            <div className="grid grid-cols-3 gap-3">
              <div className="glass-panel rounded-2xl p-4 border border-white/5">
                <p className="text-white/40 text-xs mb-1">رصيد أول المدة</p>
                <p className={`text-lg font-black ${data.opening_balance >= 0 ? "text-amber-400" : "text-red-400"}`}>{formatCurrency(data.opening_balance)}</p>
              </div>
              <div className="glass-panel rounded-2xl p-4 border border-white/5">
                <p className="text-white/40 text-xs mb-1">رصيد الختام</p>
                <p className={`text-lg font-black ${data.closing_balance >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatCurrency(data.closing_balance)}</p>
              </div>
              <div className="glass-panel rounded-2xl p-4 border border-white/5">
                <p className="text-white/40 text-xs mb-1">الرصيد الفعلي (الدفتر)</p>
                <p className={`text-lg font-black ${data.supplier.balance >= 0 ? "text-blue-400" : "text-red-400"}`}>{formatCurrency(data.supplier.balance)}</p>
              </div>
            </div>
          )}

          <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm whitespace-nowrap">
                <thead className="bg-white/5 border-b border-white/10">
                  <tr>
                    <th className="p-3 text-white/50">التاريخ</th>
                    <th className="p-3 text-white/50">النوع</th>
                    <th className="p-3 text-white/50">البيان</th>
                    <th className="p-3 text-white/50">مدين (دفع)</th>
                    <th className="p-3 text-white/50">دائن (شراء)</th>
                    <th className="p-3 text-white/50">الرصيد</th>
                  </tr>
                </thead>
                <tbody>
                  {(isLoading || isFetching) ? <TableSkeleton cols={6} rows={5} /> :
                   stmt.length === 0 ? <tr><td colSpan={6} className="p-12 text-center text-white/40">لا توجد حركات في هذه الفترة</td></tr> :
                   stmt.map((row, i) => {
                    const meta = SUP_TYPE_MAP[row.type] ?? { label: row.type, cls: "text-white/50" };
                    return (
                      <tr key={i} className="border-b border-white/5 erp-table-row">
                        <td className="p-3 font-mono text-white/60 text-xs">{row.date}</td>
                        <td className="p-3"><span className={`text-xs font-bold ${meta.cls}`}>{meta.label}</span></td>
                        <td className="p-3 text-white/70">{row.description}</td>
                        <td className="p-3 text-emerald-400 font-bold">{row.debit > 0 ? formatCurrency(row.debit) : "—"}</td>
                        <td className="p-3 text-blue-400 font-bold">{row.credit > 0 ? formatCurrency(row.credit) : "—"}</td>
                        <td className={`p-3 font-black ${row.balance >= 0 ? "text-white" : "text-red-400"}`}>{formatCurrency(row.balance)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  TAB: التدفق النقدي
 * ───────────────────────────────────────────────────────────────────────────── */

interface CashFlowData {
  days: Array<{ day: string; receipts_in: number; cash_sales: number; deposits_in: number; total_in: number; payments_out: number; expenses_out: number; total_out: number; net_flow: number }>;
  summary: { total_in: number; total_out: number; net_cash_flow: number };
}

function CashFlowReport() {
  const [mode, setMode]             = useState<DateMode>("month");
  const [customFrom, setCustomFrom] = useState(thisMonthStart());
  const [customTo,   setCustomTo]   = useState(todayStr());
  const [dateFrom, dateTo]          = getDateRange(mode, customFrom, customTo);

  const { data, isLoading } = useQuery<CashFlowData>({
    queryKey: ["/api/reports/cash-flow", dateFrom, dateTo],
    queryFn: () => authFetch<CashFlowData>(api(`/api/reports/cash-flow?date_from=${dateFrom}&date_to=${dateTo}`)),
    staleTime: 60_000,
  });

  const days    = data?.days    ?? [];
  const summary = data?.summary ?? { total_in: 0, total_out: 0, net_cash_flow: 0 };

  return (
    <div className="space-y-4" style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }}>
      <DateFilterBar mode={mode} setMode={setMode} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />

      <div className="grid grid-cols-3 gap-3">
        <div className="glass-panel rounded-2xl p-4 border border-emerald-500/10">
          <div className="flex items-center gap-2 mb-1"><ArrowDown className="w-4 h-4 text-emerald-400" /><p className="text-emerald-400 text-xs">إجمالي الوارد</p></div>
          <p className="text-lg font-black text-white">{formatCurrency(summary.total_in)}</p>
        </div>
        <div className="glass-panel rounded-2xl p-4 border border-red-500/10">
          <div className="flex items-center gap-2 mb-1"><ArrowUp className="w-4 h-4 text-red-400" /><p className="text-red-400 text-xs">إجمالي الصادر</p></div>
          <p className="text-lg font-black text-white">{formatCurrency(summary.total_out)}</p>
        </div>
        <div className={`glass-panel rounded-2xl p-4 border ${summary.net_cash_flow >= 0 ? "border-blue-500/10" : "border-red-500/20"}`}>
          <div className="flex items-center gap-2 mb-1"><CreditCard className="w-4 h-4 text-blue-400" /><p className="text-blue-400 text-xs">صافي التدفق النقدي</p></div>
          <p className={`text-lg font-black ${summary.net_cash_flow >= 0 ? "text-blue-400" : "text-red-400"}`}>{formatCurrency(summary.net_cash_flow)}</p>
        </div>
      </div>

      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-3 text-white/50">التاريخ</th>
                <th className="p-3 text-white/50">مبيعات نقدية</th>
                <th className="p-3 text-white/50">سندات قبض</th>
                <th className="p-3 text-white/50">إيداعات</th>
                <th className="p-3 text-emerald-400 font-bold">إجمالي الوارد</th>
                <th className="p-3 text-white/50">سندات دفع</th>
                <th className="p-3 text-white/50">مصروفات</th>
                <th className="p-3 text-red-400 font-bold">إجمالي الصادر</th>
                <th className="p-3 text-white/50">صافي</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <TableSkeleton cols={9} rows={5} /> :
               days.length === 0 ? <tr><td colSpan={9} className="p-12 text-center text-white/40">لا توجد حركات نقدية في هذه الفترة</td></tr> :
               days.map(d => (
                <tr key={d.day} className="border-b border-white/5 erp-table-row">
                  <td className="p-3 font-mono text-white/60 text-xs">{d.day}</td>
                  <td className="p-3 text-emerald-400">{d.cash_sales > 0 ? formatCurrency(d.cash_sales) : "—"}</td>
                  <td className="p-3 text-emerald-400">{d.receipts_in > 0 ? formatCurrency(d.receipts_in) : "—"}</td>
                  <td className="p-3 text-blue-400">{d.deposits_in > 0 ? formatCurrency(d.deposits_in) : "—"}</td>
                  <td className="p-3 font-bold text-emerald-400">{formatCurrency(d.total_in)}</td>
                  <td className="p-3 text-red-400">{d.payments_out > 0 ? formatCurrency(d.payments_out) : "—"}</td>
                  <td className="p-3 text-orange-400">{d.expenses_out > 0 ? formatCurrency(d.expenses_out) : "—"}</td>
                  <td className="p-3 font-bold text-red-400">{formatCurrency(d.total_out)}</td>
                  <td className={`p-3 font-black ${d.net_flow >= 0 ? "text-blue-400" : "text-red-400"}`}>{formatCurrency(d.net_flow)}</td>
                </tr>
              ))}
            </tbody>
            {days.length > 0 && (
              <tfoot className="bg-white/5 border-t border-white/10">
                <tr>
                  <td colSpan={4} className="p-3 font-bold text-white/50">الإجمالي</td>
                  <td className="p-3 font-black text-emerald-400">{formatCurrency(summary.total_in)}</td>
                  <td colSpan={2} />
                  <td className="p-3 font-black text-red-400">{formatCurrency(summary.total_out)}</td>
                  <td className={`p-3 font-black ${summary.net_cash_flow >= 0 ? "text-blue-400" : "text-red-400"}`}>{formatCurrency(summary.net_cash_flow)}</td>
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
 *  TAB: تقارير الأعلى
 * ───────────────────────────────────────────────────────────────────────────── */

interface TopData {
  top_products: Array<{ product_id: number; product_name: string; total_qty: number; total_revenue: number; total_profit: number }>;
  top_customers: Array<{ customer_id: number | null; customer_name: string; total_revenue: number; invoice_count: number }>;
  top_suppliers: Array<{ supplier_id: number | null; supplier_name: string; total_purchases: number; invoice_count: number }>;
}

function TopReportsTab() {
  const [mode, setMode]             = useState<DateMode>("month");
  const [customFrom, setCustomFrom] = useState(thisMonthStart());
  const [customTo,   setCustomTo]   = useState(todayStr());
  const [dateFrom, dateTo]          = getDateRange(mode, customFrom, customTo);

  const { data, isLoading } = useQuery<TopData>({
    queryKey: ["/api/reports/top", dateFrom, dateTo],
    queryFn: () => authFetch<TopData>(api(`/api/reports/top?date_from=${dateFrom}&date_to=${dateTo}&limit=10`)),
    staleTime: 60_000,
  });

  const topProducts  = data?.top_products  ?? [];
  const topCustomers = data?.top_customers ?? [];
  const topSuppliers = data?.top_suppliers ?? [];

  const TopTable = ({ title, icon, rows, cols }: { title: string; icon: React.ReactNode; rows: any[]; cols: { key: string; label: string; fmt?: (v: any) => string; cls?: string }[] }) => (
    <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
        {icon}
        <h3 className="text-white font-bold text-sm">{title}</h3>
      </div>
      <table className="w-full text-right text-sm">
        <thead className="bg-white/5">
          <tr>
            <th className="p-3 text-white/40 text-xs">#</th>
            {cols.map(c => <th key={c.key} className="p-3 text-white/40 text-xs">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {isLoading ? <TableSkeleton cols={cols.length + 1} rows={5} /> :
           rows.length === 0 ? <tr><td colSpan={cols.length + 1} className="p-8 text-center text-white/30 text-xs">لا توجد بيانات</td></tr> :
           rows.map((row, i) => (
            <tr key={i} className="border-b border-white/5 erp-table-row">
              <td className="p-3">
                <span className="text-base">{["🥇","🥈","🥉"][i] ?? <span className="text-white/30 text-xs font-bold">#{i+1}</span>}</span>
              </td>
              {cols.map(c => (
                <td key={c.key} className={`p-3 font-bold ${c.cls ?? "text-white"}`}>
                  {c.fmt ? c.fmt(row[c.key]) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4" style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }}>
      <DateFilterBar mode={mode} setMode={setMode} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TopTable title="أعلى المنتجات مبيعاً" icon={<Package className="w-4 h-4 text-amber-400" />}
          rows={topProducts}
          cols={[
            { key: "product_name", label: "المنتج" },
            { key: "total_revenue", label: "المبيعات", fmt: v => formatCurrency(v), cls: "text-emerald-400" },
            { key: "total_profit",  label: "الربح",    fmt: v => formatCurrency(v), cls: "text-amber-400" },
          ]} />

        <TopTable title="أفضل العملاء" icon={<Users className="w-4 h-4 text-blue-400" />}
          rows={topCustomers}
          cols={[
            { key: "customer_name",  label: "العميل" },
            { key: "total_revenue",  label: "المبيعات", fmt: v => formatCurrency(v), cls: "text-emerald-400" },
            { key: "invoice_count",  label: "الفواتير",  cls: "text-white/50" },
          ]} />

        <TopTable title="أكثر الموردين تعاملاً" icon={<Truck className="w-4 h-4 text-purple-400" />}
          rows={topSuppliers}
          cols={[
            { key: "supplier_name",   label: "المورد" },
            { key: "total_purchases", label: "المشتريات", fmt: v => formatCurrency(v), cls: "text-blue-400" },
            { key: "invoice_count",   label: "الفواتير",   cls: "text-white/50" },
          ]} />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  System Health Check Report
 * ───────────────────────────────────────────────────────────────────────────── */

interface HealthIssue {
  id: string;
  group: string;
  type: string;
  severity: "OK" | "WARNING" | "CRITICAL";
  color: "green" | "yellow" | "red";
  message: string;
  action: string;
  details: Record<string, unknown>;
}
interface HealthCheckData {
  status: "OK" | "WARNING" | "CRITICAL";
  color: "green" | "yellow" | "red";
  checked_at: string;
  summary: { total_checks: number; ok: number; warnings: number; critical: number };
  groups: Record<string, HealthIssue[]>;
  issues: HealthIssue[];
}

const GROUP_LABELS: Record<string, string> = {
  customer_issues:   "مشاكل العملاء",
  supplier_issues:   "مشاكل الموردين",
  inventory_issues:  "مشاكل المخزون",
  accounting_issues: "مشاكل المحاسبة",
  cash_issues:       "مشاكل النقدية",
};
const GROUP_ICONS: Record<string, React.ReactNode> = {
  customer_issues:   <Users  className="w-4 h-4" />,
  supplier_issues:   <Truck  className="w-4 h-4" />,
  inventory_issues:  <Package className="w-4 h-4" />,
  accounting_issues: <BarChart3 className="w-4 h-4" />,
  cash_issues:       <DollarSign className="w-4 h-4" />,
};

const SEV_CFG = {
  OK:       { bg: "bg-emerald-500/15", border: "border-emerald-500/30", text: "text-emerald-400", badge: "bg-emerald-500/20 text-emerald-300", dot: "bg-emerald-400",   label: "سليم" },
  WARNING:  { bg: "bg-amber-500/15",   border: "border-amber-500/30",   text: "text-amber-400",   badge: "bg-amber-500/20 text-amber-300",   dot: "bg-amber-400",     label: "تحذير" },
  CRITICAL: { bg: "bg-red-500/15",     border: "border-red-500/30",     text: "text-red-400",     badge: "bg-red-500/20 text-red-300",       dot: "bg-red-400",       label: "حرج" },
};

function SeverityBadge({ sev }: { sev: "OK" | "WARNING" | "CRITICAL" }) {
  const c = SEV_CFG[sev];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${c.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

function IssueCard({ issue, onClick }: { issue: HealthIssue; onClick: () => void }) {
  const c = SEV_CFG[issue.severity];
  return (
    <button
      onClick={onClick}
      className={`w-full text-right p-4 rounded-xl border ${c.bg} ${c.border} hover:brightness-110 transition-all cursor-pointer`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <SeverityBadge sev={issue.severity} />
            <span className="text-white/40 text-xs font-mono">{issue.id}</span>
          </div>
          <p className={`font-bold text-sm ${c.text} leading-snug`}>{issue.message}</p>
          <p className="text-white/50 text-xs mt-1 flex items-center gap-1">
            <ArrowUp className="w-3 h-3 rotate-45 shrink-0" />
            {issue.action}
          </p>
        </div>
        {issue.severity !== "OK" && (
          <div className="text-right shrink-0">
            {typeof issue.details.difference === "number" && (
              <span className={`text-sm font-bold tabular-nums ${c.text}`}>
                {(issue.details.difference as number) > 0 ? "+" : ""}{formatCurrency(issue.details.difference as number)}
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

function IssueDetailModal({ issue, onClose }: { issue: HealthIssue; onClose: () => void }) {
  const c = SEV_CFG[issue.severity];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
        className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 max-w-lg w-full shadow-2xl"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <SeverityBadge sev={issue.severity} />
            <span className="text-white/40 text-xs font-mono">{issue.id}</span>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <h3 className={`text-lg font-bold mb-1 ${c.text}`}>{issue.message}</h3>
        <p className="text-white/60 text-sm mb-4 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
          {issue.action}
        </p>

        <div className={`rounded-xl p-4 border ${c.bg} ${c.border} space-y-2`}>
          <p className="text-white/50 text-xs font-bold mb-2">تفاصيل الفحص</p>
          {Object.entries(issue.details).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-sm">
              <span className="text-white/40 font-mono text-xs">{k}</span>
              <span className={`font-bold tabular-nums ${typeof v === "number" && k.includes("difference") && (v as number) !== 0 ? c.text : "text-white"}`}>
                {typeof v === "number"
                  ? (k.includes("qty") || k.includes("count") || k.includes("checked") ? String(v) : formatCurrency(v))
                  : String(v)}
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function HealthCheckReport() {
  const [selected, setSelected] = useState<HealthIssue | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    customer_issues: true, supplier_issues: true, inventory_issues: true,
    accounting_issues: true, cash_issues: true,
  });

  const { data, isLoading, refetch, isFetching } = useQuery<HealthCheckData>({
    queryKey: ["health-check"],
    queryFn: () => authFetch(api("/api/reports/health-check")),
    staleTime: 30_000,
  });

  const toggleGroup = (g: string) =>
    setExpandedGroups(prev => ({ ...prev, [g]: !prev[g] }));

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <Loader2 className="w-10 h-10 animate-spin text-amber-400" />
      <p className="text-white/50 text-sm">جارٍ فحص صحة النظام…</p>
    </div>
  );

  if (!data) return null;

  const { status, summary, groups, checked_at } = data;
  const cfg = SEV_CFG[status];

  const statusEmoji = status === "OK" ? "✅" : status === "WARNING" ? "⚠️" : "🔴";
  const statusAR    = status === "OK" ? "النظام سليم" : status === "WARNING" ? "يوجد تحذيرات" : "يوجد مشاكل حرجة";

  return (
    <div className="space-y-5" dir="rtl">
      {/* ── Hero Status Card ── */}
      <motion.div
        initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className={`rounded-2xl border-2 p-6 ${cfg.bg} ${cfg.border} flex items-center justify-between`}
      >
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-4xl">{statusEmoji}</span>
            <div>
              <h2 className={`text-2xl font-black ${cfg.text}`}>{statusAR}</h2>
              <p className="text-white/40 text-xs mt-0.5">
                آخر فحص: {new Date(checked_at).toLocaleString("ar-EG")}
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 hover:text-white text-sm font-bold transition-all disabled:opacity-50"
        >
          <Loader2 className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          إعادة الفحص
        </button>
      </motion.div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "إجمالي الفحوصات", value: summary.total_checks, color: "text-white",      bg: "bg-white/5",          border: "border-white/10"  },
          { label: "سليم",            value: summary.ok,            color: "text-emerald-400", bg: "bg-emerald-500/10",  border: "border-emerald-500/20" },
          { label: "تحذيرات",         value: summary.warnings,      color: "text-amber-400",   bg: "bg-amber-500/10",    border: "border-amber-500/20"   },
          { label: "حرجة",            value: summary.critical,      color: "text-red-400",     bg: "bg-red-500/10",      border: "border-red-500/20"     },
        ].map(c => (
          <div key={c.label} className={`rounded-xl border p-4 text-center ${c.bg} ${c.border}`}>
            <div className={`text-3xl font-black tabular-nums ${c.color}`}>{c.value}</div>
            <div className="text-white/50 text-xs mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      {/* ── Issue Groups ── */}
      <div className="space-y-3">
        {Object.entries(groups).map(([groupKey, groupIssues]) => {
          const hasWarnings  = groupIssues.some(i => i.severity === "WARNING");
          const hasCritical  = groupIssues.some(i => i.severity === "CRITICAL");
          const groupStatus: "OK" | "WARNING" | "CRITICAL" = hasCritical ? "CRITICAL" : hasWarnings ? "WARNING" : "OK";
          const gc = SEV_CFG[groupStatus];
          const isOpen = expandedGroups[groupKey] ?? true;

          return (
            <div key={groupKey} className="rounded-2xl border border-white/10 overflow-hidden bg-white/3">
              <button
                onClick={() => toggleGroup(groupKey)}
                className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-2 text-white/70">
                  {GROUP_ICONS[groupKey]}
                  <span className="font-bold text-sm">{GROUP_LABELS[groupKey]}</span>
                  <span className="text-white/30 text-xs">({groupIssues.length})</span>
                </div>
                <div className="flex items-center gap-2">
                  <SeverityBadge sev={groupStatus} />
                  <ChevronDown className={`w-4 h-4 text-white/40 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </div>
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 space-y-2">
                      {groupIssues.map(issue => (
                        <IssueCard key={issue.id} issue={issue} onClick={() => setSelected(issue)} />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* ── Detail Modal ── */}
      <AnimatePresence>
        {selected && (
          <IssueDetailModal issue={selected} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Main Reports — full tab set
 * ───────────────────────────────────────────────────────────────────────────── */

type Tab = "pl" | "daily" | "products" | "analysis" | "customer" | "supplier" | "cashflow" | "top" | "inventory" | "purchases" | "sales" | "health";

const TABS: { id: Tab; label: string }[] = [
  { id: "health",    label: "🩺 صحة النظام" },
  { id: "pl",        label: "📊 الأرباح والخسائر" },
  { id: "daily",     label: "📅 يومي" },
  { id: "products",  label: "📦 ربحية المنتجات" },
  { id: "analysis",  label: "📈 تحليل المبيعات" },
  { id: "customer",  label: "👤 كشف عميل" },
  { id: "supplier",  label: "🏭 كشف مورد" },
  { id: "cashflow",  label: "💰 تدفق نقدي" },
  { id: "top",       label: "🏆 الأعلى" },
  { id: "inventory", label: "🏪 المخزون" },
  { id: "sales",     label: "🧾 فواتير المبيعات" },
  { id: "purchases", label: "🛒 فواتير المشتريات" },
];

export default function Reports() {
  const [tab, setTab] = useState<Tab>("health");

  return (
    <div className="space-y-4">
      <div className="flex bg-white/5 rounded-2xl p-1 border border-white/10 flex-wrap gap-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${tab === t.id ? "bg-amber-500 text-black shadow" : "text-white/50 hover:text-white"}`}
            style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }}>
            {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
          {tab === "health"    && <HealthCheckReport />}
          {tab === "pl"        && <ProfitLossReport />}
          {tab === "daily"     && <DailyProfitReport />}
          {tab === "products"  && <ProductProfitReport />}
          {tab === "analysis"  && <SalesAnalysisReport />}
          {tab === "customer"  && <CustomerStatementReport />}
          {tab === "supplier"  && <SupplierStatementReport />}
          {tab === "cashflow"  && <CashFlowReport />}
          {tab === "top"       && <TopReportsTab />}
          {tab === "inventory" && <InventoryReport />}
          {tab === "sales"     && <SalesInvoicesReport />}
          {tab === "purchases" && <PurchasesInvoicesReport />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
