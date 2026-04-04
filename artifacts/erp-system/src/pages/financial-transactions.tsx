import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useGetSettingsSafes } from "@workspace/api-client-react";
import { authFetch } from "@/lib/auth-fetch";
import { formatCurrency } from "@/lib/format";
import { useAppSettings } from "@/contexts/app-settings";
import {
  Activity, ArrowUpCircle, ArrowDownCircle, Scale,
  ArrowUp, ArrowDown, Search, X, Download,
  ChevronDown, ExternalLink, RotateCcw,
  FileSpreadsheet, Calendar, Building2,
} from "lucide-react";
import { TableSkeleton } from "@/components/skeletons";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

/* ─── Types ──────────────────────────────────────────────────────────────── */

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

/* ─── Translation Maps ───────────────────────────────────────────────────── */

const TYPE_LABELS: Record<string, string> = {
  sale:                   "مبيعة",
  sale_cash:              "مبيعة نقدية",
  sale_credit:            "مبيعة آجلة",
  sale_partial:           "مبيعة جزئية",
  purchase:               "مشترى",
  purchase_cash:          "شراء نقدي",
  purchase_credit:        "شراء آجل",
  purchase_partial:       "شراء جزئي",
  sales_return:           "مرتجع مبيعات",
  sale_return:            "مرتجع مبيعات",
  sale_return_cancel:     "إلغاء مرتجع مبيعات",
  purchase_return:        "مرتجع مشتريات",
  purchase_return_cancel: "إلغاء مرتجع مشتريات",
  receipt_voucher:        "سند قبض",
  payment_voucher:        "سند صرف",
  deposit_voucher:        "إيداع",
  supplier_payment:       "تسديد دفعة",
  safe_transfer:          "تحويل خزينة",
  transfer_in:            "تحويل وارد",
  transfer_out:           "تحويل صادر",
  expense:                "مصروف",
  income:                 "إيراد",
  opening_balance:        "رصيد أول المدة",
  customer_opening:       "رصيد أول مدة عميل",
  supplier_opening:       "رصيد أول مدة عميل",
  balance_credit:         "خصم رصيد",
  adjustment:             "تسوية",
};

const toArabicType = (raw: string) =>
  TYPE_LABELS[raw] ?? "معاملة مالية";

const REF_TYPE_LABELS: Record<string, string> = {
  sale:             "مبيعة",
  purchase:         "مشترى",
  sale_return:      "مرتجع مبيعات",
  purchase_return:  "مرتجع مشتريات",
  expense:          "مصروف",
  income:           "إيراد",
  receipt_voucher:  "سند قبض",
  payment_voucher:  "سند صرف",
  deposit_voucher:  "إيداع",
  safe_transfer:    "تحويل خزينة",
  supplier_payment: "تسديد دفعة",
};

const FILTER_TYPES = [
  { value: "sale_cash",         label: "مبيعة نقدية" },
  { value: "sale_credit",       label: "مبيعة آجلة" },
  { value: "sale",              label: "مبيعة" },
  { value: "purchase_cash",     label: "شراء نقدي" },
  { value: "purchase_credit",   label: "شراء آجل" },
  { value: "purchase",          label: "مشترى" },
  { value: "sale_return",       label: "مرتجع مبيعات" },
  { value: "purchase_return",   label: "مرتجع مشتريات" },
  { value: "receipt_voucher",   label: "سند قبض" },
  { value: "payment_voucher",   label: "سند صرف" },
  { value: "deposit_voucher",   label: "إيداع" },
  { value: "supplier_payment",  label: "تسديد دفعة" },
  { value: "safe_transfer",     label: "تحويل خزينة" },
  { value: "expense",           label: "مصروف" },
  { value: "income",            label: "إيراد" },
  { value: "opening_balance",   label: "رصيد أول المدة" },
  { value: "customer_opening",  label: "رصيد أول مدة عميل" },
  { value: "supplier_opening",  label: "رصيد أول مدة عميل" },
];

/* ─── Badge styles per type ──────────────────────────────────────────────── */

const TYPE_BADGE: Record<string, { bg: string; dot: string }> = {
  sale:                  { bg: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300", dot: "bg-emerald-400" },
  sale_cash:             { bg: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300", dot: "bg-emerald-400" },
  sale_credit:           { bg: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300", dot: "bg-emerald-400" },
  sale_partial:          { bg: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300", dot: "bg-emerald-400" },
  purchase:              { bg: "bg-blue-500/15 border-blue-500/30 text-blue-300",          dot: "bg-blue-400" },
  purchase_cash:         { bg: "bg-blue-500/15 border-blue-500/30 text-blue-300",          dot: "bg-blue-400" },
  purchase_credit:       { bg: "bg-blue-500/15 border-blue-500/30 text-blue-300",          dot: "bg-blue-400" },
  purchase_partial:      { bg: "bg-blue-500/15 border-blue-500/30 text-blue-300",          dot: "bg-blue-400" },
  sales_return:          { bg: "bg-orange-500/15 border-orange-500/30 text-orange-300",    dot: "bg-orange-400" },
  sale_return:           { bg: "bg-orange-500/15 border-orange-500/30 text-orange-300",    dot: "bg-orange-400" },
  sale_return_cancel:    { bg: "bg-orange-500/15 border-orange-500/30 text-orange-300",    dot: "bg-orange-400" },
  purchase_return:       { bg: "bg-orange-500/15 border-orange-500/30 text-orange-300",    dot: "bg-orange-400" },
  purchase_return_cancel:{ bg: "bg-orange-500/15 border-orange-500/30 text-orange-300",    dot: "bg-orange-400" },
  receipt_voucher:       { bg: "bg-teal-500/15 border-teal-500/30 text-teal-300",          dot: "bg-teal-400" },
  payment_voucher:       { bg: "bg-purple-500/15 border-purple-500/30 text-purple-300",    dot: "bg-purple-400" },
  deposit_voucher:       { bg: "bg-purple-500/15 border-purple-500/30 text-purple-300",    dot: "bg-purple-400" },
  supplier_payment:      { bg: "bg-red-500/15 border-red-500/30 text-red-300",             dot: "bg-red-400" },
  safe_transfer:         { bg: "bg-slate-500/15 border-slate-500/30 text-slate-300",       dot: "bg-slate-400" },
  transfer_in:           { bg: "bg-slate-500/15 border-slate-500/30 text-slate-300",       dot: "bg-slate-400" },
  transfer_out:          { bg: "bg-slate-500/15 border-slate-500/30 text-slate-300",       dot: "bg-slate-400" },
  expense:               { bg: "bg-red-500/15 border-red-500/30 text-red-300",             dot: "bg-red-400" },
  income:                { bg: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300", dot: "bg-emerald-400" },
  opening_balance:       { bg: "bg-amber-500/15 border-amber-500/30 text-amber-300",       dot: "bg-amber-400" },
  customer_opening:      { bg: "bg-amber-500/15 border-amber-500/30 text-amber-300",       dot: "bg-amber-400" },
  supplier_opening:      { bg: "bg-amber-500/15 border-amber-500/30 text-amber-300",       dot: "bg-amber-400" },
};

const DEFAULT_BADGE = { bg: "bg-white/5 border-white/10 text-white/50", dot: "bg-white/30" };

/* ─── Document routes ────────────────────────────────────────────────────── */

const REF_ROUTES: Record<string, string> = {
  sale:             "/sales",
  purchase:         "/purchases",
  sale_return:      "/returns",
  purchase_return:  "/returns",
  expense:          "/expenses",
  income:           "/income",
  receipt_voucher:  "/receipt-vouchers",
  payment_voucher:  "/payment-vouchers",
  deposit_voucher:  "/deposit-vouchers",
  safe_transfer:    "/safe-transfers",
};

/* ─── Date helpers ───────────────────────────────────────────────────────── */

const toDateStr = (d: Date) => d.toISOString().split("T")[0];

const DATE_PILLS = [
  { label: "اليوم",        range: () => { const t = toDateStr(new Date()); return { from: t, to: t }; } },
  { label: "أمس",          range: () => { const d = new Date(); d.setDate(d.getDate() - 1); const t = toDateStr(d); return { from: t, to: t }; } },
  { label: "هذا الأسبوع", range: () => { const d = new Date(); const start = new Date(d); start.setDate(d.getDate() - d.getDay()); return { from: toDateStr(start), to: toDateStr(d) }; } },
  { label: "هذا الشهر",   range: () => { const d = new Date(); return { from: toDateStr(new Date(d.getFullYear(), d.getMonth(), 1)), to: toDateStr(d) }; } },
  { label: "هذه السنة",   range: () => { const d = new Date(); return { from: toDateStr(new Date(d.getFullYear(), 0, 1)), to: toDateStr(d) }; } },
];

const PAGE_SIZE = 25;

/* ─── Export helpers ─────────────────────────────────────────────────────── */

function exportToCSV(transactions: FinancialTransaction[]) {
  const headers = ["#", "النوع", "الخزينة", "الطرف", "المبلغ", "الاتجاه", "البيان", "التاريخ"];
  const rows = transactions.map(t => [
    t.id,
    toArabicType(t.type),
    t.safe_name ?? "",
    t.customer_name ?? "",
    t.amount.toFixed(2),
    t.direction === "in" ? "وارد" : t.direction === "out" ? "صادر" : "",
    (t.description ?? "").replace(/,/g, "،"),
    t.date ?? t.created_at.split("T")[0],
  ]);
  const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `الحركات_المالية_${toDateStr(new Date())}.csv`; a.click();
  URL.revokeObjectURL(url);
}

/* ─── Custom Dropdown ────────────────────────────────────────────────────── */

interface DropdownOption { value: string; label: string; dot?: string }

function CustomDropdown({
  value, onChange, options, placeholder, icon,
}: {
  value: string;
  onChange: (v: string) => void;
  options: DropdownOption[];
  placeholder: string;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { settings } = useAppSettings();
  const isDark = settings.theme !== "light";

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const selected = options.find(o => o.value === value);

  const bg       = isDark ? "#1A2235"              : "var(--erp-bg-surface)";
  const bgCard   = isDark ? "#111827"              : "var(--erp-bg-card)";
  const border   = isDark ? "#2D3748"              : "var(--erp-border)";
  const divider  = isDark ? "#1F2937"              : "var(--erp-border)";
  const txtBase  = isDark ? "rgba(255,255,255,0.7)": "var(--erp-text-2)";
  const txtMuted = isDark ? "rgba(255,255,255,0.35)": "var(--erp-text-3)";

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 h-10 rounded-xl text-sm text-right transition-all outline-none"
        style={{
          background: bg,
          border: open ? "1px solid #F59E0B" : `1px solid ${border}`,
          color: selected ? "var(--erp-text-1)" : txtMuted,
          boxShadow: open ? "0 0 0 3px rgba(245,158,11,0.12)" : "none",
        }}
      >
        {icon && <span style={{ color: "var(--erp-text-3)" }} className="flex-shrink-0">{icon}</span>}
        {selected?.dot && (
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${selected.dot}`} />
        )}
        <span className="flex-1 text-right truncate">{selected?.label ?? placeholder}</span>
        <ChevronDown
          className="w-3.5 h-3.5 flex-shrink-0 transition-transform"
          style={{ color: "var(--erp-text-4)", transform: open ? "rotate(180deg)" : "rotate(0)" }}
        />
      </button>

      {open && (
        <div
          className="absolute top-full mt-1.5 w-full rounded-xl overflow-hidden z-50 shadow-2xl"
          style={{ background: bgCard, border: `1px solid ${divider}`, maxHeight: 240, overflowY: "auto" }}
        >
          {/* "All" option */}
          <button
            type="button"
            onClick={() => { onChange(""); setOpen(false); }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-right transition-colors"
            style={{
              background: !value ? "rgba(245,158,11,0.08)" : "transparent",
              color: !value ? "#FCD34D" : txtMuted,
            }}
          >
            <span className="w-2 h-2 rounded-full bg-white/20 flex-shrink-0" />
            {placeholder}
          </button>
          <div style={{ height: 1, background: divider }} />
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-right transition-colors"
              style={{
                background: value === o.value ? "rgba(245,158,11,0.08)" : "transparent",
                color: value === o.value ? "#FCD34D" : txtBase,
              }}
              onMouseEnter={e => { if (value !== o.value) e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"; }}
              onMouseLeave={e => { if (value !== o.value) e.currentTarget.style.background = "transparent"; }}
            >
              {o.dot && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${o.dot}`} />}
              {o.label}
              {value === o.value && (
                <span className="mr-auto text-amber-400 text-xs">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════════════ */

export default function FinancialTransactions() {
  const [, navigate] = useLocation();
  const { data: safes = [] } = useGetSettingsSafes();
  const { settings } = useAppSettings();
  const isDark = settings.theme !== "light";

  /* ── Theme-aware tokens ── */
  const surfaceBg  = isDark ? "#1A2235"               : "var(--erp-bg-surface)";
  const cardBg     = isDark ? "#111827"               : "var(--erp-bg-card)";
  const panelBg    = isDark ? "#0F1A2E"               : "var(--erp-bg-app)";
  const inputBg    = isDark ? "#1A2235"               : "var(--erp-bg-surface)";
  const bdr        = isDark ? "#2D3748"               : "var(--erp-border)";
  const txt1       = isDark ? "white"                 : "var(--erp-text-1)";
  const txt2       = isDark ? "rgba(255,255,255,0.7)" : "var(--erp-text-2)";
  const txt3       = isDark ? "rgba(255,255,255,0.4)" : "var(--erp-text-3)";
  const txt4       = isDark ? "rgba(255,255,255,0.25)": "var(--erp-text-4)";

  const [filters, setFilters] = useState({
    safe_id: "", direction: "", type: "", from: "", to: "", search: "",
  });
  const [page, setPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  /* ── Close export menu on outside click ── */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* ── Query string ── */
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.safe_id)   p.set("safe_id",   filters.safe_id);
    if (filters.direction) p.set("direction", filters.direction);
    if (filters.type)      p.set("type",      filters.type);
    if (filters.from)      p.set("from",      filters.from);
    if (filters.to)        p.set("to",        filters.to);
    if (filters.search)    p.set("search",    filters.search);
    return p.toString();
  }, [filters]);

  const { data: transactions = [], isLoading } = useQuery<FinancialTransaction[]>({
    queryKey: ["/api/financial-transactions", qs],
    queryFn: () =>
      authFetch(api(`/api/financial-transactions${qs ? "?" + qs : ""}`))
        .then(r => { if (!r.ok) throw new Error("خطأ في جلب البيانات"); return r.json(); }),
  });

  /* ── Summary cards ── */
  const totalIn  = useMemo(() => transactions.filter(t => t.direction === "in").reduce((s, t) => s + t.amount, 0),  [transactions]);
  const totalOut = useMemo(() => transactions.filter(t => t.direction === "out").reduce((s, t) => s + t.amount, 0), [transactions]);
  const net = totalIn - totalOut;

  /* ── Pagination ── */
  const totalPages = Math.max(1, Math.ceil(transactions.length / PAGE_SIZE));
  const paginated  = transactions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  /* ── Filter helpers ── */
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
    setExpandedRow(null);
  }, []);

  const toggleRow = (id: number) => setExpandedRow(prev => prev === id ? null : id);

  /* ── Render ── */
  return (
    <div className="space-y-5 pb-10 px-6 py-4">

      {/* ═══════════════════════════════════════
          HEADER
          ═══════════════════════════════════════ */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-11 h-11">
            <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400/20 animate-ping" />
            <div className="relative w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Activity className="w-5 h-5 text-amber-400" />
            </div>
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">سجل الحركات المالية</h2>
            <p className="text-xs text-white/40 mt-0.5">
              {isLoading ? "جارٍ التحميل..." : `${transactions.length.toLocaleString("ar-EG")} حركة${hasFilters ? " — مفلترة" : " — إجمالي"}`}
            </p>
          </div>
        </div>

        {/* Export button */}
        <div className="relative" ref={exportRef}>
          <button
            onClick={() => setShowExportMenu(v => !v)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white/70 hover:text-white text-sm transition-all"
          >
            <Download className="w-4 h-4" />
            تصدير
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showExportMenu ? "rotate-180" : ""}`} />
          </button>
          {showExportMenu && (
            <div
              className="absolute left-0 top-full mt-2 w-44 rounded-xl border border-white/10 shadow-2xl overflow-hidden z-50"
              style={{ background: panelBg }}
            >
              <button
                onClick={() => { exportToCSV(transactions); setShowExportMenu(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors text-right"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                تصدير Excel/CSV
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════
          SUMMARY CARDS
          ═══════════════════════════════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        {/* Incoming */}
        <div
          className="group rounded-2xl p-5 flex items-center gap-4 transition-all cursor-default"
          style={{ background: surfaceBg, border: `1px solid ${bdr}` }}
          onMouseEnter={e => (e.currentTarget.style.border = "1px solid rgba(52,211,153,0.4)")}
          onMouseLeave={e => (e.currentTarget.style.border = `1px solid ${bdr}`)}
        >
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-all"
            style={{ background: "linear-gradient(135deg,#059669,#10b981)" }}
          >
            <ArrowUpCircle className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white/45 text-xs font-medium mb-1 flex items-center gap-1.5">
              <span>📥</span> إجمالي الوارد
            </p>
            <p className="text-[1.6rem] font-black text-emerald-400 leading-none truncate tabular-nums">
              {formatCurrency(totalIn)}
            </p>
            <p className="text-white/25 text-[11px] mt-1.5">خلال الفترة المحددة</p>
          </div>
        </div>

        {/* Outgoing */}
        <div
          className="group rounded-2xl p-5 flex items-center gap-4 transition-all cursor-default"
          style={{ background: surfaceBg, border: `1px solid ${bdr}` }}
          onMouseEnter={e => (e.currentTarget.style.border = "1px solid rgba(248,113,113,0.4)")}
          onMouseLeave={e => (e.currentTarget.style.border = `1px solid ${bdr}`)}
        >
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg,#dc2626,#ef4444)" }}
          >
            <ArrowDownCircle className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white/45 text-xs font-medium mb-1 flex items-center gap-1.5">
              <span>📤</span> إجمالي الصادر
            </p>
            <p className="text-[1.6rem] font-black text-red-400 leading-none truncate tabular-nums">
              {formatCurrency(totalOut)}
            </p>
            <p className="text-white/25 text-[11px] mt-1.5">خلال الفترة المحددة</p>
          </div>
        </div>

        {/* Net balance */}
        <div
          className="group rounded-2xl p-5 flex items-center gap-4 transition-all cursor-default"
          style={{ background: surfaceBg, border: `1px solid ${bdr}` }}
          onMouseEnter={e => (e.currentTarget.style.border = net >= 0 ? "1px solid rgba(251,191,36,0.4)" : "1px solid rgba(251,113,133,0.4)")}
          onMouseLeave={e => (e.currentTarget.style.border = `1px solid ${bdr}`)}
        >
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: net >= 0 ? "linear-gradient(135deg,#d97706,#f59e0b)" : "linear-gradient(135deg,#be123c,#f43f5e)" }}
          >
            <Scale className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white/45 text-xs font-medium mb-1 flex items-center gap-1.5">
              <span>⚖️</span> الصافي
              {net < 0 && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{ background: "rgba(244,63,94,0.15)", border: "1px solid rgba(244,63,94,0.25)", color: "#fb7185" }}
                >
                  عجز
                </span>
              )}
            </p>
            <p
              className="text-[1.6rem] font-black leading-none truncate tabular-nums"
              style={{ color: net >= 0 ? "#fbbf24" : "#fb7185" }}
            >
              {net < 0 && "−"}{formatCurrency(Math.abs(net))}
            </p>
            <p className="text-white/25 text-[11px] mt-1.5">خلال الفترة المحددة</p>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════
          FILTERS PANEL
          ═══════════════════════════════════════ */}
      <div
        className="rounded-2xl p-4"
        style={{ background: cardBg, border: `1px solid ${bdr}` }}
      >
        {/* ── Row 1: Dropdowns (3-col grid) ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Safe */}
          <CustomDropdown
            value={filters.safe_id}
            onChange={v => setFilter("safe_id", v)}
            placeholder="كل الخزائن"
            icon={<Building2 className="w-4 h-4" />}
            options={(safes as { id: number; name: string }[]).map(s => ({
              value: String(s.id),
              label: s.name,
              dot: "bg-blue-400",
            }))}
          />
          {/* Direction */}
          <CustomDropdown
            value={filters.direction}
            onChange={v => setFilter("direction", v)}
            placeholder="كل الاتجاهات"
            options={[
              { value: "in",  label: "↑ وارد",  dot: "bg-emerald-400" },
              { value: "out", label: "↓ صادر",  dot: "bg-red-400" },
            ]}
          />
          {/* Type */}
          <CustomDropdown
            value={filters.type}
            onChange={v => setFilter("type", v)}
            placeholder="كل الأنواع"
            options={FILTER_TYPES.map(t => ({
              value: t.value,
              label: t.label,
              dot: (TYPE_BADGE[t.value] ?? DEFAULT_BADGE).dot,
            }))}
          />
        </div>

        {/* ── Row 2: Dates + Search (3-col grid) ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
          {/* Date from */}
          <div className="relative">
            <Calendar
              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: filters.from ? "#F59E0B" : txt4 }}
            />
            <input
              type="date"
              value={filters.from}
              onChange={e => setFilter("from", e.target.value)}
              placeholder="من تاريخ"
              className="w-full h-10 rounded-xl text-sm transition-all outline-none pr-10 pl-3"
              style={{
                background: inputBg,
                border: filters.from ? "1px solid #F59E0B" : `1px solid ${bdr}`,
                color: filters.from ? txt1 : txt3,
                boxShadow: filters.from ? "0 0 0 3px rgba(245,158,11,0.1)" : "none",
                colorScheme: isDark ? "dark" : "light",
              }}
              onFocus={e => {
                e.currentTarget.style.border = "1px solid #F59E0B";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(245,158,11,0.12)";
              }}
              onBlur={e => {
                e.currentTarget.style.border = filters.from ? "1px solid #F59E0B" : `1px solid ${bdr}`;
                e.currentTarget.style.boxShadow = filters.from ? "0 0 0 3px rgba(245,158,11,0.1)" : "none";
              }}
            />
            {!filters.from && (
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs pointer-events-none" style={{ color: txt4 }}>
                من تاريخ
              </span>
            )}
          </div>

          {/* Date to */}
          <div className="relative">
            <Calendar
              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: filters.to ? "#F59E0B" : txt4 }}
            />
            <input
              type="date"
              value={filters.to}
              onChange={e => setFilter("to", e.target.value)}
              className="w-full h-10 rounded-xl text-sm transition-all outline-none pr-10 pl-3"
              style={{
                background: inputBg,
                border: filters.to ? "1px solid #F59E0B" : `1px solid ${bdr}`,
                color: filters.to ? txt1 : txt3,
                boxShadow: filters.to ? "0 0 0 3px rgba(245,158,11,0.1)" : "none",
                colorScheme: isDark ? "dark" : "light",
              }}
              onFocus={e => {
                e.currentTarget.style.border = "1px solid #F59E0B";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(245,158,11,0.12)";
              }}
              onBlur={e => {
                e.currentTarget.style.border = filters.to ? "1px solid #F59E0B" : `1px solid ${bdr}`;
                e.currentTarget.style.boxShadow = filters.to ? "0 0 0 3px rgba(245,158,11,0.1)" : "none";
              }}
            />
            {!filters.to && (
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs pointer-events-none" style={{ color: txt4 }}>
                إلى تاريخ
              </span>
            )}
          </div>

          {/* Search */}
          <div
            className="flex items-center gap-2 h-10 rounded-xl px-3 transition-all"
            style={{ background: inputBg, border: `1px solid ${bdr}` }}
            onFocusCapture={e => (e.currentTarget.style.border = "1px solid #F59E0B")}
            onBlurCapture={e => (e.currentTarget.style.border = filters.search ? "1px solid #F59E0B" : `1px solid ${bdr}`)}
          >
            <Search className="w-4 h-4 flex-shrink-0" style={{ color: txt3 }} />
            <input
              type="text"
              placeholder="بحث في البيان أو الطرف..."
              value={filters.search}
              onChange={e => setFilter("search", e.target.value)}
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: txt1 }}
            />
            {filters.search && (
              <button
                onClick={() => setFilter("search", "")}
                className="flex-shrink-0 text-white/30 hover:text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ── Row 3: Quick pills + Reset ── */}
        <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs ml-1" style={{ color: txt4 }}>سريع:</span>
            {DATE_PILLS.map(pill => {
              const r = pill.range();
              const isActive = filters.from === r.from && filters.to === r.to;
              const pillBdr = isDark ? "#374151" : "var(--erp-border)";
              const pillTxt = isDark ? "rgba(255,255,255,0.4)" : "var(--erp-text-3)";
              const pillHoverBdr = isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)";
              const pillHoverTxt = isDark ? "rgba(255,255,255,0.7)" : "var(--erp-text-2)";
              return (
                <button
                  key={pill.label}
                  onClick={() => applyDatePill(pill.range)}
                  className="text-xs rounded-full px-3 py-1 transition-all"
                  style={
                    isActive
                      ? { background: "rgba(245,158,11,0.2)", border: "1px solid #F59E0B", color: "#FCD34D" }
                      : { background: "transparent", border: `1px solid ${pillBdr}`, color: pillTxt }
                  }
                  onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor = pillHoverBdr; e.currentTarget.style.color = pillHoverTxt; }}}
                  onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = pillBdr; e.currentTarget.style.color = pillTxt; }}}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>

          {/* Reset — right aligned, always show if has filters */}
          {hasFilters ? (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-all flex-shrink-0"
              style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#F87171" }}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              إعادة تعيين الفلاتر
            </button>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-white/20">
              <div className="w-1.5 h-1.5 rounded-full bg-white/15" />
              لا توجد فلاتر نشطة
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════
          TRANSACTIONS TABLE
          ═══════════════════════════════════════ */}
      <div className="glass-panel rounded-3xl overflow-hidden border border-white/[0.06]">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-white/80 whitespace-nowrap" dir="rtl">
            <thead>
              <tr style={{
                background: isDark ? "rgba(255,255,255,0.03)" : "#f1f5f9",
                borderBottom: isDark ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(0,0,0,0.08)",
              }}>
                <th className="px-4 py-3.5 font-medium text-xs text-white/30 text-right w-14">#</th>
                <th className="px-4 py-3.5 font-medium text-xs text-white/30 text-right" style={{ minWidth: 120 }}>النوع</th>
                <th className="px-4 py-3.5 font-medium text-xs text-white/30 text-right">الخزينة</th>
                <th className="px-4 py-3.5 font-medium text-xs text-white/30 text-right" style={{ maxWidth: 150 }}>الطرف</th>
                <th className="px-4 py-3.5 font-medium text-xs text-white/30 text-right">المبلغ</th>
                <th className="px-4 py-3.5 font-medium text-xs text-white/30 text-right">الاتجاه</th>
                <th className="px-4 py-3.5 font-medium text-xs text-white/30 text-right" style={{ maxWidth: 200 }}>البيان</th>
                <th className="px-4 py-3.5 font-medium text-xs text-white/30 text-right">التاريخ</th>
                <th className="px-4 py-3.5 w-10" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeleton cols={9} rows={10} />
              ) : paginated.length === 0 ? (
                /* ── Empty State ── */
                <tr>
                  <td colSpan={9} className="py-24 text-center">
                    <div className="flex flex-col items-center gap-5">
                      <div className="relative">
                        <div className="w-20 h-20 rounded-2xl bg-white/3 border border-white/8 flex items-center justify-center">
                          <Activity className="w-9 h-9 text-white/15" />
                        </div>
                        <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                          <Search className="w-3 h-3 text-amber-400" />
                        </div>
                      </div>
                      <div>
                        <p className="text-white/50 text-base font-medium">لا توجد حركات مالية في هذه الفترة</p>
                        <p className="text-white/25 text-sm mt-1.5">جرّب تغيير الفلاتر أو توسيع نطاق التاريخ</p>
                      </div>
                      {hasFilters && (
                        <button
                          onClick={resetFilters}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm transition-all"
                          style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", color: "#FCD34D" }}
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
                  const badge = TYPE_BADGE[t.type] ?? DEFAULT_BADGE;
                  const typeLabel = toArabicType(t.type);
                  const isExpanded = expandedRow === t.id;
                  const txDate = t.date ?? t.created_at.split("T")[0];
                  const refRoute = t.reference_type ? REF_ROUTES[t.reference_type] : null;
                  const refLabel = t.reference_type ? (REF_TYPE_LABELS[t.reference_type] ?? toArabicType(t.reference_type)) : null;

                  return (
                    <>
                      {/* ── Main row ── */}
                      <tr
                        key={t.id}
                        className={`border-b border-white/[0.05] cursor-pointer transition-colors ${
                          isExpanded ? "bg-amber-500/[0.04]" : "hover:bg-white/[0.025]"
                        }`}
                        onClick={() => toggleRow(t.id)}
                      >
                        {/* # */}
                        <td className="px-4 py-3.5">
                          <span className="text-white/25 text-xs font-mono">{t.id}</span>
                        </td>

                        {/* Type badge */}
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${badge.bg}`}>
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${badge.dot}`} />
                            {typeLabel}
                          </span>
                        </td>

                        {/* Safe */}
                        <td className="px-4 py-3.5">
                          {t.safe_name
                            ? <span className="text-blue-300/80 text-sm">{t.safe_name}</span>
                            : <span className="text-white/15 text-sm">—</span>
                          }
                        </td>

                        {/* Party */}
                        <td className="px-4 py-3.5" style={{ maxWidth: 150 }}>
                          {t.customer_name
                            ? <span className="text-white/70 text-sm block truncate" title={t.customer_name} style={{ maxWidth: 140 }}>{t.customer_name}</span>
                            : <span className="text-white/15 text-sm">—</span>
                          }
                        </td>

                        {/* Amount */}
                        <td className="px-4 py-3.5">
                          {t.direction === "in" ? (
                            <div className="flex items-center gap-1.5 text-emerald-400 font-bold tabular-nums">
                              <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                                <ArrowUp className="w-2.5 h-2.5" />
                              </div>
                              {formatCurrency(t.amount)}
                            </div>
                          ) : t.direction === "out" ? (
                            <div className="flex items-center gap-1.5 text-red-400 font-bold tabular-nums">
                              <div className="w-5 h-5 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
                                <ArrowDown className="w-2.5 h-2.5" />
                              </div>
                              {formatCurrency(t.amount)}
                            </div>
                          ) : (
                            <span className="text-white/40 font-bold tabular-nums">{formatCurrency(t.amount)}</span>
                          )}
                        </td>

                        {/* Direction pill */}
                        <td className="px-4 py-3.5">
                          {t.direction === "in" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-emerald-500/10 border border-emerald-500/15 text-emerald-400">
                              <ArrowUp className="w-2.5 h-2.5" /> وارد
                            </span>
                          ) : t.direction === "out" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-red-500/10 border border-red-500/15 text-red-400">
                              <ArrowDown className="w-2.5 h-2.5" /> صادر
                            </span>
                          ) : (
                            <span className="text-white/15 text-xs">—</span>
                          )}
                        </td>

                        {/* Description (truncated with tooltip) */}
                        <td className="px-4 py-3.5" style={{ maxWidth: 200 }}>
                          {t.description
                            ? <span className="text-white/50 text-sm truncate block" title={t.description} style={{ maxWidth: 190 }}>{t.description}</span>
                            : <span className="text-white/15 text-sm">—</span>
                          }
                        </td>

                        {/* Date */}
                        <td className="px-4 py-3.5">
                          <span className="text-white/40 text-sm font-mono">{txDate}</span>
                        </td>

                        {/* Expand */}
                        <td className="px-4 py-3.5">
                          <div className={`text-white/25 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}>
                            <ChevronDown className="w-4 h-4" />
                          </div>
                        </td>
                      </tr>

                      {/* ── Expanded detail row ── */}
                      {isExpanded && (
                        <tr key={`${t.id}-detail`} className="border-b border-white/[0.05]">
                          <td colSpan={9} className="px-6 py-5">
                            <div
                              className="rounded-2xl p-4 flex flex-wrap gap-6 items-start"
                              style={{
                                background: isDark ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.025)",
                                border: isDark ? "1px solid rgba(255,255,255,0.06)" : `1px solid ${bdr}`,
                              }}
                            >
                              {/* Reference */}
                              <div className="min-w-[130px]">
                                <p className="text-white/30 text-xs mb-2 font-medium">رقم المرجع</p>
                                {t.reference_id ? (
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-white/60 text-xs">{refLabel}</span>
                                    <span className="text-white/80 font-mono font-semibold text-sm">#{t.reference_id}</span>
                                  </div>
                                ) : (
                                  <span className="text-white/20 text-sm">—</span>
                                )}
                              </div>

                              {/* Full description */}
                              <div className="flex-1 min-w-[200px]">
                                <p className="text-white/30 text-xs mb-2 font-medium">البيان الكامل</p>
                                <p className="text-white/70 text-sm leading-relaxed">{t.description || "—"}</p>
                              </div>

                              {/* Timestamps */}
                              <div className="min-w-[150px]">
                                <p className="text-white/30 text-xs mb-2 font-medium">وقت التسجيل</p>
                                <p className="text-white/50 text-xs font-mono leading-relaxed">
                                  {new Date(t.created_at).toLocaleString("ar-EG", {
                                    year: "numeric", month: "short", day: "numeric",
                                    hour: "2-digit", minute: "2-digit",
                                  })}
                                </p>
                              </div>

                              {/* Link to source document */}
                              {refRoute && t.reference_id && (
                                <div className="flex items-end">
                                  <button
                                    onClick={e => { e.stopPropagation(); navigate(refRoute); }}
                                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs transition-all"
                                    style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", color: "#FCD34D" }}
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
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

        {/* ── Pagination ── */}
        {transactions.length > PAGE_SIZE && (
          <div
            className="px-6 py-4 flex items-center justify-between flex-wrap gap-3"
            style={{ borderTop: isDark ? "1px solid rgba(255,255,255,0.06)" : `1px solid ${bdr}` }}
          >
            <p className="text-white/35 text-sm">
              عرض{" "}
              <span className="text-white/65 font-semibold">
                {Math.min((page - 1) * PAGE_SIZE + 1, transactions.length).toLocaleString("ar-EG")}–{Math.min(page * PAGE_SIZE, transactions.length).toLocaleString("ar-EG")}
              </span>{" "}
              من{" "}
              <span className="text-white/65 font-semibold">{transactions.length.toLocaleString("ar-EG")}</span>{" "}
              حركة
            </p>

            <div className="flex items-center gap-1.5">
              {[
                { label: "««", onClick: () => setPage(1), disabled: page === 1, cls: "w-8 h-8 text-xs" },
                { label: "السابق", onClick: () => setPage(p => Math.max(1, p - 1)), disabled: page === 1, cls: "px-3 h-8 text-sm" },
              ].map(btn => (
                <button
                  key={btn.label}
                  onClick={btn.onClick}
                  disabled={btn.disabled}
                  className={`${btn.cls} rounded-lg transition-all disabled:opacity-25 disabled:cursor-not-allowed`}
                  style={{ background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)", border: `1px solid ${bdr}`, color: txt2 }}
                >
                  {btn.label}
                </button>
              ))}

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, idx) =>
                  p === "..." ? (
                    <span key={`ellipsis-${idx}`} className="text-white/20 text-sm px-1">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p as number)}
                      className="w-8 h-8 rounded-lg text-sm transition-all font-medium"
                      style={
                        page === p
                          ? { background: "rgba(245,158,11,0.2)", border: "1px solid rgba(245,158,11,0.35)", color: "#FCD34D" }
                          : { background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)", border: `1px solid ${bdr}`, color: txt3 }
                      }
                    >
                      {p}
                    </button>
                  )
                )}

              {[
                { label: "التالي", onClick: () => setPage(p => Math.min(totalPages, p + 1)), disabled: page === totalPages, cls: "px-3 h-8 text-sm" },
                { label: "»»", onClick: () => setPage(totalPages), disabled: page === totalPages, cls: "w-8 h-8 text-xs" },
              ].map(btn => (
                <button
                  key={btn.label}
                  onClick={btn.onClick}
                  disabled={btn.disabled}
                  className={`${btn.cls} rounded-lg transition-all disabled:opacity-25 disabled:cursor-not-allowed`}
                  style={{ background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)", border: `1px solid ${bdr}`, color: txt2 }}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Bottom count strip (no pagination) ── */}
        {transactions.length > 0 && transactions.length <= PAGE_SIZE && (
          <div className="px-6 py-3.5 text-center" style={{ borderTop: isDark ? "1px solid rgba(255,255,255,0.06)" : `1px solid ${bdr}` }}>
            <p className="text-sm" style={{ color: txt4 }}>
              إجمالي <span className="font-semibold" style={{ color: txt3 }}>{transactions.length}</span> حركة مالية
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
