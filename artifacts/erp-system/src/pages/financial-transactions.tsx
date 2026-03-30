import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useGetSettingsSafes } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import {
  Activity, ArrowUpCircle, ArrowDownCircle, Scale,
  ArrowUp, ArrowDown, Minus, Search, X, Download,
  ChevronDown, ChevronUp, ExternalLink, RotateCcw,
  Calendar, Filter,
} from "lucide-react";
import { TableSkeleton } from "@/components/skeletons";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

/* ─── Types ────────────────────────────────────────────────────────────── */

interface FinancialTransaction {
  id: number;
  type: string;
  reference_type: string | null;
  reference_id: number | null;
  safe_id: number | null;
  safe_name: string | null;
  customer_id: number | null;
  customer_name: string | null;
  amount: number;
  direction: string;
  description: string | null;
  date: string | null;
  created_at: string;
}

/* ─── Translation Maps ─────────────────────────────────────────────────── */

const TYPE_LABELS: Record<string, string> = {
  sale: "مبيعة",
  sale_cash: "مبيعة نقدية",
  sale_credit: "مبيعة آجلة",
  sale_partial: "مبيعة جزئية",
  purchase: "مشترى",
  purchase_cash: "شراء نقدي",
  purchase_credit: "شراء آجل",
  sales_return: "مرتجع مبيعات",
  sale_return: "مرتجع مبيعات",
  sale_return_cancel: "إلغاء مرتجع مبيعات",
  purchase_return: "مرتجع مشتريات",
  purchase_return_cancel: "إلغاء مرتجع مشتريات",
  receipt_voucher: "سند قبض",
  payment_voucher: "سند صرف",
  deposit_voucher: "إيداع",
  supplier_payment: "تسديد مورد",
  safe_transfer: "تحويل خزينة",
  transfer_in: "تحويل وارد",
  transfer_out: "تحويل صادر",
  expense: "مصروف",
  income: "إيراد",
  opening_balance: "رصيد أول المدة",
  customer_opening: "رصيد أول مدة عميل",
  supplier_opening: "رصيد أول مدة مورد",
  balance_credit: "خصم رصيد",
  adjustment: "تسوية",
};

const UNIQUE_FILTER_TYPES = [
  { value: "sale_cash", label: "مبيعة نقدية" },
  { value: "sale_credit", label: "مبيعة آجلة" },
  { value: "sale", label: "مبيعة" },
  { value: "purchase_cash", label: "شراء نقدي" },
  { value: "purchase_credit", label: "شراء آجل" },
  { value: "purchase", label: "مشترى" },
  { value: "sale_return", label: "مرتجع مبيعات" },
  { value: "purchase_return", label: "مرتجع مشتريات" },
  { value: "receipt_voucher", label: "سند قبض" },
  { value: "payment_voucher", label: "سند صرف" },
  { value: "deposit_voucher", label: "إيداع" },
  { value: "supplier_payment", label: "تسديد مورد" },
  { value: "safe_transfer", label: "تحويل خزينة" },
  { value: "expense", label: "مصروف" },
  { value: "income", label: "إيراد" },
  { value: "opening_balance", label: "رصيد أول المدة" },
  { value: "customer_opening", label: "رصيد أول مدة عميل" },
  { value: "supplier_opening", label: "رصيد أول مدة مورد" },
];

/* ─── Badge styles per type ────────────────────────────────────────────── */

const TYPE_BADGE: Record<string, string> = {
  sale: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
  sale_cash: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
  sale_credit: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
  sale_partial: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
  purchase: "bg-blue-500/15 border-blue-500/30 text-blue-300",
  purchase_cash: "bg-blue-500/15 border-blue-500/30 text-blue-300",
  purchase_credit: "bg-blue-500/15 border-blue-500/30 text-blue-300",
  sales_return: "bg-orange-500/15 border-orange-500/30 text-orange-300",
  sale_return: "bg-orange-500/15 border-orange-500/30 text-orange-300",
  sale_return_cancel: "bg-orange-500/15 border-orange-500/30 text-orange-300",
  purchase_return: "bg-orange-500/15 border-orange-500/30 text-orange-300",
  purchase_return_cancel: "bg-orange-500/15 border-orange-500/30 text-orange-300",
  receipt_voucher: "bg-teal-500/15 border-teal-500/30 text-teal-300",
  payment_voucher: "bg-purple-500/15 border-purple-500/30 text-purple-300",
  deposit_voucher: "bg-purple-500/15 border-purple-500/30 text-purple-300",
  supplier_payment: "bg-red-500/15 border-red-500/30 text-red-300",
  safe_transfer: "bg-slate-500/15 border-slate-500/30 text-slate-300",
  transfer_in: "bg-slate-500/15 border-slate-500/30 text-slate-300",
  transfer_out: "bg-slate-500/15 border-slate-500/30 text-slate-300",
  expense: "bg-red-500/15 border-red-500/30 text-red-300",
  income: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
  opening_balance: "bg-amber-500/15 border-amber-500/30 text-amber-300",
  customer_opening: "bg-amber-500/15 border-amber-500/30 text-amber-300",
  supplier_opening: "bg-amber-500/15 border-amber-500/30 text-amber-300",
};

const DEFAULT_BADGE = "bg-white/5 border-white/10 text-white/50";

/* ─── Reference type → app route ──────────────────────────────────────── */

const REF_ROUTES: Record<string, string> = {
  sale: "/sales",
  purchase: "/purchases",
  sale_return: "/returns",
  purchase_return: "/returns",
  expense: "/expenses",
  income: "/income",
  receipt_voucher: "/receipt-vouchers",
  payment_voucher: "/payment-vouchers",
  deposit_voucher: "/deposit-vouchers",
  safe_transfer: "/safe-transfers",
};

/* ─── Date helpers ─────────────────────────────────────────────────────── */

function toDateStr(d: Date) {
  return d.toISOString().split("T")[0];
}

const DATE_PILLS = [
  {
    label: "اليوم",
    range: () => { const t = toDateStr(new Date()); return { from: t, to: t }; },
  },
  {
    label: "أمس",
    range: () => {
      const d = new Date(); d.setDate(d.getDate() - 1);
      const t = toDateStr(d); return { from: t, to: t };
    },
  },
  {
    label: "هذا الأسبوع",
    range: () => {
      const d = new Date();
      const day = d.getDay();
      const start = new Date(d); start.setDate(d.getDate() - day);
      return { from: toDateStr(start), to: toDateStr(d) };
    },
  },
  {
    label: "هذا الشهر",
    range: () => {
      const d = new Date();
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      return { from: toDateStr(start), to: toDateStr(d) };
    },
  },
];

/* ─── Page size ────────────────────────────────────────────────────────── */

const PAGE_SIZE = 25;

/* ─── Component ────────────────────────────────────────────────────────── */

export default function FinancialTransactions() {
  const [, navigate] = useLocation();
  const { data: safes = [] } = useGetSettingsSafes();

  const [filters, setFilters] = useState({
    safe_id: "",
    direction: "",
    type: "",
    from: "",
    to: "",
    search: "",
  });
  const [page, setPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  /* ── Build query string ── */
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.safe_id)  p.set("safe_id",  filters.safe_id);
    if (filters.direction) p.set("direction", filters.direction);
    if (filters.type)     p.set("type",     filters.type);
    if (filters.from)     p.set("from",     filters.from);
    if (filters.to)       p.set("to",       filters.to);
    if (filters.search)   p.set("search",   filters.search);
    return p.toString();
  }, [filters]);

  const { data: transactions = [], isLoading } = useQuery<FinancialTransaction[]>({
    queryKey: ["/api/financial-transactions", qs],
    queryFn: () =>
      fetch(api(`/api/financial-transactions${qs ? "?" + qs : ""}`))
        .then(r => { if (!r.ok) throw new Error("خطأ في جلب البيانات"); return r.json(); }),
  });

  /* ── Summary stats ── */
  const totalIn  = useMemo(() => transactions.filter(t => t.direction === "in").reduce((s, t) => s + t.amount, 0), [transactions]);
  const totalOut = useMemo(() => transactions.filter(t => t.direction === "out").reduce((s, t) => s + t.amount, 0), [transactions]);
  const net = totalIn - totalOut;

  /* ── Pagination ── */
  const totalPages = Math.max(1, Math.ceil(transactions.length / PAGE_SIZE));
  const paginated  = transactions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  /* ── Filters helpers ── */
  const hasFilters = Object.values(filters).some(v => v !== "");

  const setFilter = useCallback((key: keyof typeof filters, value: string) => {
    setFilters(f => ({ ...f, [key]: value }));
    setPage(1);
    setExpandedRow(null);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({ safe_id: "", direction: "", type: "", from: "", to: "", search: "" });
    setPage(1);
    setExpandedRow(null);
  }, []);

  const applyDatePill = useCallback((range: () => { from: string; to: string }) => {
    const { from, to } = range();
    setFilters(f => ({ ...f, from, to }));
    setPage(1);
  }, []);

  /* ── Export CSV ── */
  const exportCSV = useCallback(() => {
    const header = ["#", "النوع", "الخزينة", "الطرف", "المبلغ", "الاتجاه", "البيان", "التاريخ"];
    const rows = transactions.map(t => [
      t.id,
      TYPE_LABELS[t.type] ?? t.type,
      t.safe_name ?? "",
      t.customer_name ?? "",
      t.amount,
      t.direction === "in" ? "وارد" : t.direction === "out" ? "صادر" : "",
      (t.description ?? "").replace(/,/g, "،"),
      t.date ?? t.created_at.split("T")[0],
    ]);
    const csv = [header, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "الحركات_المالية.csv"; a.click();
    URL.revokeObjectURL(url);
  }, [transactions]);

  /* ── Row expand toggle ── */
  const toggleRow = (id: number) => setExpandedRow(prev => prev === id ? null : id);

  /* ── Render ── */
  return (
    <div className="space-y-5 pb-8">

      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {/* Pulse icon */}
          <div className="relative flex items-center justify-center w-10 h-10">
            <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400/20 animate-ping" />
            <Activity className="relative w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">سجل الحركات المالية</h2>
            <p className="text-xs text-white/40 mt-0.5">
              {transactions.length} حركة
              {hasFilters ? " — مفلترة" : " — إجمالي"}
            </p>
          </div>
        </div>

        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white text-sm transition-all"
        >
          <Download className="w-4 h-4" />
          تصدير CSV
        </button>
      </div>

      {/* ═══ SUMMARY CARDS ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Incoming */}
        <div className="glass-panel rounded-2xl p-5 border border-emerald-500/20 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <ArrowUpCircle className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <p className="text-white/50 text-xs mb-1 flex items-center gap-1">
              <span>📥</span> إجمالي الوارد
            </p>
            <p className="text-2xl font-black text-emerald-400 leading-none truncate">{formatCurrency(totalIn)}</p>
            <p className="text-white/30 text-xs mt-1">خلال الفترة المحددة</p>
          </div>
        </div>

        {/* Outgoing */}
        <div className="glass-panel rounded-2xl p-5 border border-red-500/20 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
            <ArrowDownCircle className="w-5 h-5 text-red-400" />
          </div>
          <div className="min-w-0">
            <p className="text-white/50 text-xs mb-1 flex items-center gap-1">
              <span>📤</span> إجمالي الصادر
            </p>
            <p className="text-2xl font-black text-red-400 leading-none truncate">{formatCurrency(totalOut)}</p>
            <p className="text-white/30 text-xs mt-1">خلال الفترة المحددة</p>
          </div>
        </div>

        {/* Net */}
        <div className={`glass-panel rounded-2xl p-5 border flex items-center gap-4 ${net >= 0 ? "border-amber-500/20" : "border-orange-500/20"}`}>
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${net >= 0 ? "bg-amber-500/10 border border-amber-500/20" : "bg-orange-500/10 border border-orange-500/20"}`}>
            <Scale className={`w-5 h-5 ${net >= 0 ? "text-amber-400" : "text-orange-400"}`} />
          </div>
          <div className="min-w-0">
            <p className="text-white/50 text-xs mb-1 flex items-center gap-1">
              <span>⚖️</span> الصافي
            </p>
            <p className={`text-2xl font-black leading-none truncate ${net >= 0 ? "text-amber-400" : "text-orange-400"}`}>
              {net < 0 && <span className="text-sm font-normal ml-1">عجز</span>}
              {formatCurrency(Math.abs(net))}
            </p>
            <p className="text-white/30 text-xs mt-1">خلال الفترة المحددة</p>
          </div>
        </div>
      </div>

      {/* ═══ FILTERS BAR ═══ */}
      <div className="glass-panel rounded-2xl p-4 space-y-3 sticky top-2 z-20 backdrop-blur-xl">
        {/* Row 1: all dropdowns + date inputs + search */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Safe selector */}
          <div className="relative">
            <select
              className="glass-input rounded-xl px-3 py-2 text-sm text-white pr-8 min-w-[130px] appearance-none cursor-pointer"
              value={filters.safe_id}
              onChange={e => setFilter("safe_id", e.target.value)}
            >
              <option value="">🏦 كل الخزائن</option>
              {safes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {/* Direction */}
          <select
            className="glass-input rounded-xl px-3 py-2 text-sm text-white min-w-[110px] cursor-pointer"
            value={filters.direction}
            onChange={e => setFilter("direction", e.target.value)}
          >
            <option value="">🔄 الكل</option>
            <option value="in">وارد ↑</option>
            <option value="out">صادر ↓</option>
            <option value="none">بدون خزينة</option>
          </select>

          {/* Type */}
          <select
            className="glass-input rounded-xl px-3 py-2 text-sm text-white min-w-[140px] cursor-pointer"
            value={filters.type}
            onChange={e => setFilter("type", e.target.value)}
          >
            <option value="">🏷️ كل الأنواع</option>
            {UNIQUE_FILTER_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>

          {/* Date from */}
          <div className="flex items-center gap-1">
            <Calendar className="w-4 h-4 text-white/30 flex-shrink-0" />
            <input
              type="date"
              className="glass-input rounded-xl px-3 py-2 text-sm text-white"
              value={filters.from}
              onChange={e => setFilter("from", e.target.value)}
            />
          </div>

          {/* Date to */}
          <span className="text-white/30 text-xs">←</span>
          <input
            type="date"
            className="glass-input rounded-xl px-3 py-2 text-sm text-white"
            value={filters.to}
            onChange={e => setFilter("to", e.target.value)}
          />

          {/* Search */}
          <div className="flex items-center gap-2 glass-input rounded-xl px-3 py-2 flex-1 min-w-[160px]">
            <Search className="w-4 h-4 text-white/30 flex-shrink-0" />
            <input
              type="text"
              className="bg-transparent outline-none text-sm text-white placeholder:text-white/30 w-full"
              placeholder="بحث في البيان / الطرف..."
              value={filters.search}
              onChange={e => setFilter("search", e.target.value)}
            />
            {filters.search && (
              <button onClick={() => setFilter("search", "")} className="text-white/40 hover:text-white transition-colors">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Reset */}
          {hasFilters && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-xs transition-all"
            >
              <RotateCcw className="w-3 h-3" />
              مسح الفلاتر
            </button>
          )}
        </div>

        {/* Row 2: quick date pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-white/30" />
          <span className="text-xs text-white/30">سريع:</span>
          {DATE_PILLS.map(pill => {
            const r = pill.range();
            const isActive = filters.from === r.from && filters.to === r.to;
            return (
              <button
                key={pill.label}
                onClick={() => applyDatePill(pill.range)}
                className={`px-3 py-1 rounded-full text-xs transition-all border ${
                  isActive
                    ? "bg-amber-500/20 border-amber-500/30 text-amber-300"
                    : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white"
                }`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══ TABLE ═══ */}
      <div className="glass-panel rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-white/80 whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-4 font-medium text-xs text-white/40 w-12">#</th>
                <th className="p-4 font-medium text-xs text-white/40">النوع</th>
                <th className="p-4 font-medium text-xs text-white/40">الخزينة</th>
                <th className="p-4 font-medium text-xs text-white/40">الطرف</th>
                <th className="p-4 font-medium text-xs text-white/40">المبلغ</th>
                <th className="p-4 font-medium text-xs text-white/40">الاتجاه</th>
                <th className="p-4 font-medium text-xs text-white/40 max-w-xs">البيان</th>
                <th className="p-4 font-medium text-xs text-white/40">التاريخ</th>
                <th className="p-4 w-8" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeleton cols={9} rows={8} />
              ) : paginated.length === 0 ? (
                /* ─── Empty State ─── */
                <tr>
                  <td colSpan={9} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                        <Activity className="w-7 h-7 text-white/20" />
                      </div>
                      <div>
                        <p className="text-white/50 text-sm font-medium">لا توجد حركات مالية في هذه الفترة</p>
                        <p className="text-white/30 text-xs mt-1">جرّب تغيير الفلاتر أو توسيع نطاق التاريخ</p>
                      </div>
                      {hasFilters && (
                        <button
                          onClick={resetFilters}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm hover:bg-amber-500/20 transition-all"
                        >
                          <RotateCcw className="w-4 h-4" />
                          إعادة تعيين الفلاتر
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginated.map(t => {
                  const badgeCls = TYPE_BADGE[t.type] ?? DEFAULT_BADGE;
                  const typeLabel = TYPE_LABELS[t.type] ?? t.type;
                  const isExpanded = expandedRow === t.id;
                  const txDate = t.date ?? t.created_at.split("T")[0];
                  const refRoute = t.reference_type ? REF_ROUTES[t.reference_type] : null;

                  return (
                    <>
                      {/* ─── Main row ─── */}
                      <tr
                        key={t.id}
                        className={`border-b border-white/5 erp-table-row cursor-pointer transition-colors ${isExpanded ? "bg-white/5" : ""}`}
                        onClick={() => toggleRow(t.id)}
                      >
                        {/* # */}
                        <td className="p-4 text-white/30 text-xs font-mono">{t.id}</td>

                        {/* Type badge */}
                        <td className="p-4">
                          <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-medium border ${badgeCls}`}>
                            {typeLabel}
                          </span>
                        </td>

                        {/* Safe */}
                        <td className="p-4 text-blue-300 text-sm">{t.safe_name || <span className="text-white/20">—</span>}</td>

                        {/* Party */}
                        <td className="p-4 text-white/70 text-sm">{t.customer_name || <span className="text-white/20">—</span>}</td>

                        {/* Amount */}
                        <td className="p-4">
                          {t.direction === "in" ? (
                            <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                              <ArrowUp className="w-3.5 h-3.5 flex-shrink-0" />
                              <span>{formatCurrency(t.amount)}</span>
                            </div>
                          ) : t.direction === "out" ? (
                            <div className="flex items-center gap-1.5 text-red-400 font-bold">
                              <ArrowDown className="w-3.5 h-3.5 flex-shrink-0" />
                              <span>{formatCurrency(t.amount)}</span>
                            </div>
                          ) : (
                            <span className="text-white/40 font-bold">{formatCurrency(t.amount)}</span>
                          )}
                        </td>

                        {/* Direction badge */}
                        <td className="p-4">
                          {t.direction === "in" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                              <ArrowUp className="w-3 h-3" /> وارد
                            </span>
                          ) : t.direction === "out" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-500/10 border border-red-500/20 text-red-400">
                              <ArrowDown className="w-3 h-3" /> صادر
                            </span>
                          ) : (
                            <span className="text-white/20 text-xs">—</span>
                          )}
                        </td>

                        {/* Description (truncated) */}
                        <td className="p-4 text-white/50 text-sm max-w-xs">
                          <span className="truncate block max-w-[200px]">{t.description || <span className="text-white/20">—</span>}</span>
                        </td>

                        {/* Date */}
                        <td className="p-4 text-sm text-white/40 font-mono">{txDate}</td>

                        {/* Expand toggle */}
                        <td className="p-4">
                          <div className={`text-white/30 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                            <ChevronDown className="w-4 h-4" />
                          </div>
                        </td>
                      </tr>

                      {/* ─── Expanded detail row ─── */}
                      {isExpanded && (
                        <tr key={`${t.id}-detail`} className="bg-white/3 border-b border-white/5">
                          <td colSpan={9} className="px-6 py-4">
                            <div className="flex flex-wrap gap-6 items-start text-sm">
                              {/* Reference number */}
                              <div>
                                <p className="text-white/30 text-xs mb-1">رقم المرجع</p>
                                <p className="text-white/80 font-mono font-medium">
                                  {t.reference_id ? `${t.reference_type?.toUpperCase()}-${t.reference_id}` : "—"}
                                </p>
                              </div>

                              {/* Full description */}
                              <div className="flex-1 min-w-[200px]">
                                <p className="text-white/30 text-xs mb-1">البيان الكامل</p>
                                <p className="text-white/70 leading-relaxed">{t.description || "—"}</p>
                              </div>

                              {/* Created at */}
                              <div>
                                <p className="text-white/30 text-xs mb-1">وقت التسجيل</p>
                                <p className="text-white/60 text-xs font-mono">
                                  {new Date(t.created_at).toLocaleString("ar-EG", {
                                    year: "numeric", month: "short", day: "numeric",
                                    hour: "2-digit", minute: "2-digit",
                                  })}
                                </p>
                              </div>

                              {/* Link to original document */}
                              {refRoute && t.reference_id && (
                                <div>
                                  <p className="text-white/30 text-xs mb-1">المستند الأصلي</p>
                                  <button
                                    onClick={e => { e.stopPropagation(); navigate(refRoute); }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 hover:bg-amber-500/20 text-xs transition-all"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    عرض المستند
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ─── Pagination ─── */}
        {transactions.length > PAGE_SIZE && (
          <div className="border-t border-white/5 px-6 py-4 flex items-center justify-between flex-wrap gap-3">
            <p className="text-white/40 text-sm">
              عرض{" "}
              <span className="text-white/70 font-medium">
                {Math.min((page - 1) * PAGE_SIZE + 1, transactions.length)}–{Math.min(page * PAGE_SIZE, transactions.length)}
              </span>{" "}
              من{" "}
              <span className="text-white/70 font-medium">{transactions.length}</span>{" "}
              حركة
            </p>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-sm transition-all"
              >
                السابق
              </button>

              {/* Page numbers — show up to 5 pages */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, idx) =>
                  p === "..." ? (
                    <span key={`ellipsis-${idx}`} className="text-white/30 text-sm px-1">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p as number)}
                      className={`w-8 h-8 rounded-lg text-sm transition-all ${
                        page === p
                          ? "bg-amber-500/20 border border-amber-500/30 text-amber-300 font-bold"
                          : "bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}

              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-sm transition-all"
              >
                التالي
              </button>
            </div>
          </div>
        )}

        {/* Bottom summary when no pagination */}
        {transactions.length > 0 && transactions.length <= PAGE_SIZE && (
          <div className="border-t border-white/5 px-6 py-3">
            <p className="text-white/30 text-xs text-center">
              إجمالي <span className="text-white/60">{transactions.length}</span> حركة مالية
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
