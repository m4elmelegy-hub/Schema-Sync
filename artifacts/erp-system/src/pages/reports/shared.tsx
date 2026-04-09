/**
 * Reports — Shared types, helpers, hooks, and small components
 */
import React, { useState, useEffect } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { formatCurrency, formatDate } from "@/lib/format";
import { Printer, Loader2 } from "lucide-react";
import { TableSkeleton } from "@/components/skeletons";
import { useAppSettings } from "@/contexts/app-settings";

export { formatCurrency, formatDate };
export { TableSkeleton };
export { authFetch };

/* ── Base URL ─────────────────────────────────────────────────────────────── */
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
export const api  = (p: string) => `${BASE}${p}`;
export const getToken = () => localStorage.getItem("erp_auth_token") ?? "";

/* ── Count-up animation hook ─────────────────────────────────────────────── */
export function useCountUp(target: number, duration = 1300): number {
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

/* ── Date helpers ─────────────────────────────────────────────────────────── */
export const todayStr = () => new Date().toISOString().split("T")[0];
export const thisMonthStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};
export const fmtMonth = (m: string) => {
  const AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  const [y, mon] = m.split("-");
  return `${AR[parseInt(mon) - 1]} ${y}`;
};
export const fmtDay = (d: string) => {
  const AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  const [, mon, day] = d.split("-");
  return `${parseInt(day)} ${AR[parseInt(mon) - 1]}`;
};

export type DateMode = "today" | "yesterday" | "week" | "month" | "year" | "custom";
export const DATE_MODES: { id: DateMode; label: string }[] = [
  { id: "today",     label: "اليوم" },
  { id: "yesterday", label: "أمس" },
  { id: "week",      label: "هذا الأسبوع" },
  { id: "month",     label: "هذا الشهر" },
  { id: "year",      label: "هذه السنة" },
  { id: "custom",    label: "مخصص 📅" },
];

export function getDateRange(mode: DateMode, cf: string, ct: string): [string, string] {
  const t = todayStr();
  if (mode === "today")     return [t, t];
  if (mode === "yesterday") { const d = new Date(); d.setDate(d.getDate() - 1); const y = d.toISOString().split("T")[0]; return [y, y]; }
  if (mode === "week")      { const d = new Date(); d.setDate(d.getDate() - 6); return [d.toISOString().split("T")[0], t]; }
  if (mode === "month")     return [thisMonthStart(), t];
  if (mode === "year")      return [`${new Date().getFullYear()}-01-01`, t];
  return [cf, ct];
}

export function getPrevRange(dateFrom: string, dateTo: string): [string, string] {
  const from = new Date(dateFrom + "T12:00:00");
  const to   = new Date(dateTo   + "T12:00:00");
  const days = Math.max(Math.ceil((to.getTime() - from.getTime()) / 86_400_000) + 1, 1);
  const prevTo = new Date(from); prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - days + 1);
  return [prevFrom.toISOString().split("T")[0], prevTo.toISOString().split("T")[0]];
}

/* ── ProfitsData type ─────────────────────────────────────────────────────── */
export interface ProfitsData {
  total_revenue: number; total_cost: number; gross_profit: number;
  profit_margin: number; net_profit: number; total_expenses: number;
  invoice_count: number; item_count: number;
  cash_sales:    number; credit_sales: number; partial_sales: number; return_amount: number;
  by_product:  Array<{ product_id: number; product_name: string; qty_sold: number; revenue: number; cost: number; profit: number; profit_margin: number }>;
  by_month:    Array<{ month: string; revenue: number; cost: number; profit: number }>;
  by_day:      Array<{ day:   string; revenue: number; cost: number; profit: number }>;
  by_expense_category: Array<{ category: string; total: number }>;
  by_warehouse: Array<{ warehouse_id: number; warehouse_name: string; revenue: number; cost: number; gross_profit: number; invoice_count: number }>;
}
export const EMPTY_PL: ProfitsData = {
  total_revenue:0, total_cost:0, gross_profit:0, profit_margin:0, net_profit:0, total_expenses:0,
  invoice_count:0, item_count:0, cash_sales:0, credit_sales:0, partial_sales:0, return_amount:0,
  by_product:[], by_month:[], by_day:[], by_expense_category:[], by_warehouse:[],
};

/* ── Shared small components ─────────────────────────────────────────────── */

export function PaymentBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    cash:    { label: "نقدي",  cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
    credit:  { label: "آجل",   cls: "bg-red-500/20 text-red-400 border-red-500/30" },
    partial: { label: "جزئي",  cls: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  };
  const d = map[type] || { label: type, cls: "bg-white/10 text-white/50 border-white/10" };
  return <span className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${d.cls}`}>{d.label}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    paid:    { label: "مدفوع",      cls: "text-emerald-400" },
    partial: { label: "جزئي",       cls: "text-yellow-400" },
    pending: { label: "معلق",       cls: "text-red-400" },
    unpaid:  { label: "غير مدفوع", cls: "text-red-400" },
  };
  const d = map[status] || { label: status, cls: "text-white/50" };
  return <span className={`text-xs font-bold ${d.cls}`}>{d.label}</span>;
}

export function InvoicePdfButton({ type, id }: { type: "sales" | "purchases"; id: number }) {
  const [loading, setLoading] = useState(false);
  const handleClick = async () => {
    setLoading(true);
    try {
      const { printSaleInvoice, printPurchaseInvoice } = await import("@/lib/export-pdf");
      const res = await authFetch(api(`/api/${type}/${id}`));
      if (!res.ok) throw new Error(`API Error: ${res.status}`);
      const data = await res.json();
      if (type === "sales") printSaleInvoice(data);
      else printPurchaseInvoice(data);
    } catch { /* silent */ } finally { setLoading(false); }
  };
  return (
    <button onClick={handleClick} disabled={loading} title="طباعة فاتورة PDF"
      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-blue-500/15 border border-blue-500/25 text-blue-400 hover:bg-blue-500/25 disabled:opacity-50 transition-all">
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Printer className="w-3 h-3" />} PDF
    </button>
  );
}

/* ── Shared DateFilterBar ─────────────────────────────────────────────────── */
export function DateFilterBar({
  mode, setMode, customFrom, setCustomFrom, customTo, setCustomTo,
}: {
  mode: DateMode; setMode: (m: DateMode) => void;
  customFrom: string; setCustomFrom: (s: string) => void;
  customTo:   string; setCustomTo:   (s: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" style={{ fontFamily: "'Tajawal','Cairo',sans-serif" }}>
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

/* ── Custom recharts tooltip ─────────────────────────────────────────────── */
export const ChartTooltip = ({ active, payload, label }: any) => {
  const { settings } = useAppSettings();
  const isDark = settings.theme !== "light";
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl p-3 text-xs shadow-2xl" style={{
      background: isDark ? "rgba(10,18,35,0.95)" : "rgba(255,255,255,0.97)",
      border: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(0,0,0,0.10)",
      backdropFilter: "blur(10px)",
    }}>
      <p className="font-bold mb-2" style={{ color: isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.5)" }}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
          <span style={{ color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)" }}>{p.dataKey}:</span>
          <span className="font-bold" style={{ color: p.color }}>{formatCurrency(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
};
