/**
 * Reports — Main Orchestrator
 * Thin shell: tab bar + lazy render of each report component.
 */
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/auth";
import { hasPermission } from "@/lib/permissions";

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
      <div className="flex bg-white/5 rounded-2xl p-1 border border-white/10 flex-wrap gap-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${tab === t.id ? "bg-amber-500 text-black shadow" : "text-white/50 hover:text-white"}`}
            style={{ fontFamily:"'Tajawal','Cairo',sans-serif" }}>
            {t.label}
          </button>
        ))}
      </div>

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
