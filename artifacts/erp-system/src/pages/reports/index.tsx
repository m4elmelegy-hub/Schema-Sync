/**
 * Reports — Main Orchestrator
 * Thin shell: tab bar + lazy render of each report component.
 * Includes FinancialConsistencyBar — always-visible cross-report validation strip.
 */
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { hasPermission } from "@/lib/permissions";
import { api, authFetch, formatCurrency } from "./shared";
import { safeArray } from "@/lib/safe-data";

import ProfitLossReport        from "./ProfitLossReport";
import SalesInvoicesReport     from "./SalesInvoicesReport";
import PurchasesInvoicesReport from "./PurchasesInvoicesReport";
import VouchersHistoryReport   from "./VouchersHistoryReport";
import DailyProfitReport       from "./DailyProfitReport";
import ProductProfitReport     from "./ProductProfitReport";
import SalesAnalysisReport     from "./SalesAnalysisReport";
import CustomerStatementReport from "./CustomerStatementReport";
import CashFlowReport          from "./CashFlowReport";
import BalanceSheetReport      from "./BalanceSheetReport";
import TopReportsTab           from "./TopReportsTab";
import HealthCheckReport       from "./HealthCheckReport";

/* ── Types ─────────────────────────────────────────────────────────────── */
interface BsSnapshot {
  assets:      { total: number };
  liabilities: { total: number };
  equity:      { opening_capital: number; retained_earnings: number; total: number };
  total_liabilities_equity: number;
  balanced: boolean;
}

interface SafeRow { balance: string | number }

/* ── Financial Consistency Bar ──────────────────────────────────────────── */
function FinancialConsistencyBar() {
  const { data: bs } = useQuery<BsSnapshot>({
    queryKey: ["balance-sheet"],
    queryFn: () => authFetch(api("/api/reports/balance-sheet")).then(async r => { if (!r.ok) throw new Error(`API Error: ${r.status}`); return r.json(); }),
    staleTime: 120_000,
  });

  const { data: safes } = useQuery<SafeRow[]>({
    queryKey: ["/api/settings/safes"],
    queryFn: () => authFetch(api("/api/settings/safes")).then(async r => { if (!r.ok) throw new Error(`API Error: ${r.status}`); return r.json(); }),
    staleTime: 120_000,
  });

  if (!bs || !bs.assets) return null;

  const treasury   = safeArray<SafeRow>(safes).reduce((s, safe) => s + Number(safe.balance ?? 0), 0);
  const diff       = Math.abs(bs.assets.total - bs.total_liabilities_equity);
  const balanced   = bs.balanced;

  const items: { label: string; value: string; color: string }[] = [
    { label: "إجمالي الأصول",         value: formatCurrency(bs.assets.total),           color: "#d97706" },
    { label: "رأس المال + الأرباح",    value: formatCurrency(bs.equity.total),            color: "#059669" },
    { label: "الأرباح التراكمية",      value: formatCurrency(bs.equity.retained_earnings), color: "#6366f1" },
    { label: "رصيد الخزينة",           value: formatCurrency(treasury),                   color: "#0ea5e9" },
  ];

  return (
    <div
      className="no-print flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl px-4 py-2.5"
      style={{
        background: balanced ? "rgba(5,150,105,0.06)" : "rgba(220,38,38,0.06)",
        border: `1px solid ${balanced ? "rgba(5,150,105,0.20)" : "rgba(220,38,38,0.25)"}`,
        fontFamily: "'Tajawal','Cairo',sans-serif",
      }}
      dir="rtl"
    >
      {/* Balance status badge */}
      <span className="flex items-center gap-1.5 text-xs font-bold shrink-0" style={{ color: balanced ? "#059669" : "#dc2626" }}>
        {balanced
          ? <><CheckCircle className="w-3.5 h-3.5" /> الميزانية متوازنة</>
          : <><AlertTriangle className="w-3.5 h-3.5" /> فرق {formatCurrency(diff)}</>}
      </span>

      <span style={{ color: "rgba(255,255,255,0.10)", fontSize: 18 }}>|</span>

      {/* Key metrics */}
      {items.map(it => (
        <span key={it.label} className="flex items-center gap-1.5 text-xs shrink-0">
          <span style={{ color: "rgba(255,255,255,0.35)" }}>{it.label}:</span>
          <span style={{ color: it.color, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{it.value}</span>
        </span>
      ))}
    </div>
  );
}

/* ── Tab config ─────────────────────────────────────────────────────────── */
type Tab =
  | "health" | "pl" | "cashflow" | "balance" | "daily" | "products" | "analysis" | "customer"
  | "top" | "sales" | "purchases" | "vouchers";

const TABS: { id: Tab; label: string; group?: string }[] = [
  /* ── النظام ── */
  { id: "health",    label: "🩺 صحة النظام",        group: "النظام" },
  /* ── مالي ── */
  { id: "pl",        label: "📊 الأرباح والخسائر",   group: "مالي" },
  { id: "cashflow",  label: "💰 التدفق النقدي",       group: "مالي" },
  { id: "balance",   label: "⚖️ الميزانية",           group: "مالي" },
  { id: "daily",     label: "📅 يومي",               group: "مالي" },
  /* ── مبيعات ── */
  { id: "products",  label: "📦 ربحية المنتجات",      group: "مبيعات" },
  { id: "analysis",  label: "📈 تحليل المبيعات",      group: "مبيعات" },
  { id: "top",       label: "🏆 الأعلى مبيعاً",       group: "مبيعات" },
  { id: "customer",  label: "👤 كشف عميل",            group: "مبيعات" },
  /* ── سجلات ── */
  { id: "sales",     label: "🧾 فواتير المبيعات",     group: "سجلات" },
  { id: "purchases", label: "🛒 فواتير المشتريات",    group: "سجلات" },
  { id: "vouchers",  label: "🏦 سجل السندات",         group: "سجلات" },
];

/* ── Main Page ──────────────────────────────────────────────────────────── */
export default function Reports() {
  const { user }  = useAuth();
  const canView   = hasPermission(user, "can_view_reports") === true;
  const [tab, setTab] = useState<Tab>("health");

  if (!canView) return (
    <div className="flex flex-col items-center justify-center py-20 text-center" style={{ fontFamily:"'Tajawal','Cairo',sans-serif" }}>
      <svg className="w-14 h-14 text-red-400/40 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 115.636 5.636m12.728 12.728L5.636 5.636"/>
      </svg>
      <p className="text-white/60 font-bold text-lg">غير مصرح</p>
      <p className="text-white/30 text-sm mt-1">غير مصرح لك بالوصول إلى التقارير — تواصل مع المدير لتفعيل الصلاحية</p>
    </div>
  );

  /* ── Group tabs by their group label ── */
  const groups = Array.from(new Set(TABS.map(t => t.group ?? ""))).filter(Boolean);

  return (
    <div className="space-y-4" dir="rtl">
      {/* ── Tab bar — grouped ── */}
      <div className="no-print space-y-1" style={{ fontFamily:"'Tajawal','Cairo',sans-serif" }}>
        {groups.map(grp => (
          <div key={grp} className="flex flex-wrap items-center gap-1">
            <span className="text-white/20 text-xs font-bold w-12 shrink-0 text-left">{grp}</span>
            <div className="flex flex-wrap gap-1">
              {TABS.filter(t => t.group === grp).map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${tab === t.id ? "bg-amber-500 text-black shadow" : "text-white/50 hover:text-white bg-white/5 border border-white/8"}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Financial Consistency Bar — always visible ── */}
      <FinancialConsistencyBar />

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }} transition={{ duration:0.2 }}>
          {tab === "health"    && <HealthCheckReport />}
          {tab === "pl"        && <ProfitLossReport />}
          {tab === "daily"     && <DailyProfitReport />}
          {tab === "products"  && <ProductProfitReport />}
          {tab === "analysis"  && <SalesAnalysisReport />}
          {tab === "customer"  && <CustomerStatementReport />}
          {tab === "cashflow"  && <CashFlowReport />}
          {tab === "balance"   && <BalanceSheetReport />}
          {tab === "top"       && <TopReportsTab />}
          {tab === "sales"     && <SalesInvoicesReport />}
          {tab === "purchases" && <PurchasesInvoicesReport />}
          {tab === "vouchers"  && <VouchersHistoryReport />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
