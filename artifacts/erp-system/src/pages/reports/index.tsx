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
import InventoryReport         from "./InventoryReport";
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
    queryFn: () => authFetch(api("/api/reports/balance-sheet")).then(r => r.json()),
    staleTime: 120_000,
  });

  const { data: safes } = useQuery<SafeRow[]>({
    queryKey: ["/api/settings/safes"],
    queryFn: () => authFetch(api("/api/settings/safes")).then(r => r.json()),
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
  | "top" | "inventory" | "sales" | "purchases" | "vouchers";

const TABS: { id: Tab; label: string }[] = [
  { id: "health",    label: "🩺 صحة النظام" },
  { id: "pl",        label: "📊 الأرباح والخسائر" },
  { id: "cashflow",  label: "💰 التدفق النقدي" },
  { id: "balance",   label: "⚖️ الميزانية العمومية" },
  { id: "daily",     label: "📅 يومي" },
  { id: "products",  label: "📦 ربحية المنتجات" },
  { id: "analysis",  label: "📈 تحليل المبيعات" },
  { id: "customer",  label: "👤 كشف عميل" },
  { id: "top",       label: "🏆 الأعلى" },
  { id: "inventory", label: "🏪 المخزون" },
  { id: "sales",     label: "🧾 فواتير المبيعات" },
  { id: "purchases", label: "🛒 فواتير المشتريات" },
  { id: "vouchers",  label: "🏦 سجل السندات" },
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

  return (
    <div className="space-y-4">
      {/* ── Tab bar ── */}
      <div className="no-print flex bg-white/5 rounded-2xl p-1 border border-white/10 flex-wrap gap-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${tab === t.id ? "bg-amber-500 text-black shadow" : "text-white/50 hover:text-white"}`}
            style={{ fontFamily:"'Tajawal','Cairo',sans-serif" }}>
            {t.label}
          </button>
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
          {tab === "inventory" && <InventoryReport />}
          {tab === "sales"     && <SalesInvoicesReport />}
          {tab === "purchases" && <PurchasesInvoicesReport />}
          {tab === "vouchers"  && <VouchersHistoryReport />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
