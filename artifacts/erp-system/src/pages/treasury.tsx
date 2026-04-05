import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { authFetch } from "@/lib/auth-fetch";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetSettingsSafes } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import {
  HandCoins, ArrowUpFromLine, ArrowLeftRight, Lock,
  TrendingUp, TrendingDown, Wallet, Printer, ChevronLeft,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api  = (p: string) => `${BASE}${p}`;
const todayStr = () => new Date().toISOString().split("T")[0];

interface Safe { id: number; name: string; balance: number | string; }
interface Transaction {
  id: number; type: string; amount: number; direction: string;
  safe_id: number; description: string; date: string;
}

/* ─────────────────── Safe Closing Modal ─────────────────── */
function SafeClosingModal({ safes, onClose }: { safes: Safe[]; onClose: () => void }) {
  const [safeId,       setSafeId]       = useState(safes.length > 0 ? String(safes[0].id) : "");
  const [closingDate,  setClosingDate]  = useState(todayStr());
  const [actualBal,    setActualBal]    = useState("");

  const { data: txToday = [] } = useQuery<Transaction[]>({
    queryKey: ["/api/financial-transactions", safeId, closingDate],
    queryFn: () =>
      safeId
        ? authFetch(api(`/api/financial-transactions?safe_id=${safeId}&from=${closingDate}&to=${closingDate}`))
            .then(r => { if (!r.ok) throw new Error("خطأ"); return r.json(); })
        : Promise.resolve([]),
    enabled: !!safeId,
  });

  const inLabels:  Record<string, string> = { sale_cash: "مبيعات نقدي", sale_credit: "مبيعات آجل", income: "إيرادات", receipt_voucher: "سندات قبض", transfer_in: "تحويل وارد", deposit_voucher: "سندات توريد" };
  const outLabels: Record<string, string> = { purchase_cash: "مشتريات نقدي", purchase_credit: "مشتريات آجل", expense: "مصروفات", payment_voucher: "سندات صرف", transfer_out: "تحويل صادر" };

  const inRows  = txToday.filter(t => t.direction === "in");
  const outRows = txToday.filter(t => t.direction === "out");
  const totalIn  = inRows.reduce((s, t) => s + t.amount, 0);
  const totalOut = outRows.reduce((s, t) => s + t.amount, 0);

  const selectedSafe = safes.find(s => String(s.id) === safeId);
  const systemBalance = selectedSafe ? Number(selectedSafe.balance) : 0;
  const prevBalance   = systemBalance - totalIn + totalOut;
  const actual        = actualBal !== "" ? Number(actualBal) : null;
  const variance      = actual !== null ? actual - systemBalance : null;

  function grouped(rows: Transaction[], labels: Record<string, string>) {
    const map: Record<string, number> = {};
    rows.forEach(t => { const k = labels[t.type] || t.type; map[k] = (map[k] || 0) + t.amount; });
    return Object.entries(map);
  }

  const printClosing = () => {
    const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>إقفال الخزينة</title>
    <style>body{font-family:'Segoe UI',sans-serif;direction:rtl;padding:20px;font-size:13px}h2{text-align:center;margin-bottom:4px}
    p.sub{text-align:center;color:#666;margin-bottom:16px;font-size:11px}
    table{width:100%;border-collapse:collapse;margin-bottom:12px}
    th{background:#1a1a2e;color:white;padding:6px 10px;text-align:right;font-size:11px}
    td{padding:5px 10px;border-bottom:1px solid #eee}.total-row td{font-weight:bold;background:#f5f5f5}
    .two-col{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .summary{background:#f9f9f9;padding:10px;border-radius:6px;margin-top:12px}
    .summary .row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #ddd}
    .vp{color:green;font-weight:bold}.vn{color:red;font-weight:bold}</style></head><body>
    <h2>Halal Tech — إقفال الخزينة</h2>
    <p class="sub">الخزينة: ${selectedSafe?.name || ""} | التاريخ: ${closingDate}</p>
    <div class="two-col">
      <table><tr><th colspan="2">الوارد (داخل)</th></tr>
        ${grouped(inRows, inLabels).map(([k, v]) => `<tr><td>${k}</td><td>${formatCurrency(v)}</td></tr>`).join("")}
        <tr class="total-row"><td>إجمالي الداخل</td><td>${formatCurrency(totalIn)}</td></tr></table>
      <table><tr><th colspan="2">الصادر (خارج)</th></tr>
        ${grouped(outRows, outLabels).map(([k, v]) => `<tr><td>${k}</td><td>${formatCurrency(v)}</td></tr>`).join("")}
        <tr class="total-row"><td>إجمالي الخارج</td><td>${formatCurrency(totalOut)}</td></tr></table>
    </div>
    <div class="summary">
      <div class="row"><span>رصيد سابق</span><span>${formatCurrency(prevBalance)}</span></div>
      <div class="row"><span>الرصيد الحالي (نظام)</span><span>${formatCurrency(systemBalance)}</span></div>
      ${actual !== null ? `<div class="row"><span>الرصيد الفعلي (جرد)</span><span>${formatCurrency(actual)}</span></div>` : ""}
      ${variance !== null ? `<div class="row"><span>العجز / الزيادة</span><span class="${variance >= 0 ? "vp" : "vn"}">${variance >= 0 ? "+" : ""}${formatCurrency(variance)}</span></div>` : ""}
    </div>
    <br/><p style="text-align:center;font-size:10px;color:#999">طُبع بواسطة Halal Tech ERP — ${new Date().toLocaleString("ar-EG")}</p>
    <script>window.print();</script></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="glass-panel rounded-3xl p-6 w-full max-w-lg modal-panel max-h-[92vh] overflow-y-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-500/10 border border-amber-500/30">
              <Lock className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-black text-amber-400">إقفال الخزينة</h3>
              <p className="text-white/30 text-xs">جرد ومطابقة يومية</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white text-2xl leading-none">×</button>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-white/40 text-xs mb-1.5 font-medium">الخزينة</label>
            <select className="glass-input w-full text-white text-sm" value={safeId} onChange={e => setSafeId(e.target.value)}>
              <option value="">-- اختر --</option>
              {safes.map(s => <option key={s.id} value={s.id}>{s.name} — {formatCurrency(Number(s.balance))}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-white/40 text-xs mb-1.5 font-medium">تاريخ الإقفال</label>
            <input type="date" className="glass-input w-full text-white text-sm"
              value={closingDate} onChange={e => setClosingDate(e.target.value)} />
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "رصيد سابق",          val: prevBalance,    c: "white/60" },
            { label: "الرصيد الحالي (نظام)", val: systemBalance,  c: "amber-400" },
            { label: "إجمالي الداخل",       val: totalIn,        c: "emerald-400" },
            { label: "إجمالي الخارج",       val: totalOut,       c: "red-400" },
          ].map(({ label, val, c }) => (
            <div key={label} className="bg-white/5 border border-white/8 rounded-xl p-3">
              <p className="text-white/30 text-xs">{label}</p>
              <p className={`text-${c} font-bold text-sm mt-1`}>{formatCurrency(val)}</p>
            </div>
          ))}
        </div>

        {/* Breakdown tables */}
        {txToday.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-3">
              <p className="text-emerald-400 font-bold text-xs mb-2">الوارد (داخل)</p>
              <div className="space-y-1.5">
                {grouped(inRows, inLabels).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs">
                    <span className="text-white/50">{k}</span>
                    <span className="text-emerald-400 font-medium">{formatCurrency(v)}</span>
                  </div>
                ))}
                {inRows.length === 0 && <p className="text-white/20 text-xs">لا يوجد</p>}
              </div>
            </div>
            <div className="bg-red-500/5 border border-red-500/15 rounded-xl p-3">
              <p className="text-red-400 font-bold text-xs mb-2">الصادر (خارج)</p>
              <div className="space-y-1.5">
                {grouped(outRows, outLabels).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs">
                    <span className="text-white/50">{k}</span>
                    <span className="text-red-400 font-medium">{formatCurrency(v)}</span>
                  </div>
                ))}
                {outRows.length === 0 && <p className="text-white/20 text-xs">لا يوجد</p>}
              </div>
            </div>
          </div>
        )}
        {txToday.length === 0 && safeId && (
          <p className="text-center text-white/25 text-sm py-2">لا توجد حركات في هذا اليوم</p>
        )}

        {/* Actual balance input */}
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 space-y-3">
          <div>
            <label className="block text-white/40 text-xs mb-1.5 font-medium">الرصيد الفعلي — جرد يدوي (ج.م)</label>
            <input type="number" min="0" step="0.01" className="glass-input w-full text-white text-sm"
              placeholder="أدخل الرصيد الفعلي بعد الجرد..."
              value={actualBal} onChange={e => setActualBal(e.target.value)} />
          </div>
          {variance !== null && (
            <div className={`flex items-center justify-between rounded-xl px-4 py-3 border ${
              variance === 0  ? "bg-emerald-500/10 border-emerald-500/20"
            : variance > 0   ? "bg-teal-500/10 border-teal-500/20"
            :                  "bg-red-500/10 border-red-500/20"}`}>
              <span className="text-white/60 text-sm font-medium">العجز / الزيادة</span>
              <span className={`font-black text-xl ${variance === 0 ? "text-emerald-400" : variance > 0 ? "text-teal-400" : "text-red-400"}`}>
                {variance > 0 ? "+" : ""}{formatCurrency(variance)}
                {variance === 0 && " ✓ مطابق"}
                {variance > 0 && " زيادة"}
                {variance < 0 && " عجز"}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button onClick={printClosing}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 rounded-xl text-white/70 hover:text-white hover:border-white/20 transition-all text-sm font-medium">
            <Printer className="w-4 h-4" /> طباعة الجرد
          </button>
          <button onClick={onClose}
            className="flex-1 btn-primary py-3 font-bold text-sm flex items-center justify-center gap-2">
            <Lock className="w-4 h-4" /> تأكيد الإقفال
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────── Main Page ──────────────────────────── */
export default function Treasury() {
  const [, navigate]       = useLocation();
  const [showClosing, setShowClosing] = useState(false);
  const { data: safes = [] } = useGetSettingsSafes();
  const { data: stats }      = useQuery<Record<string, number>>({
    queryKey: ["/api/dashboard/stats"],
    queryFn: () => authFetch(api("/api/dashboard/stats")).then(r => { if (!r.ok) throw new Error("خطأ"); return r.json(); }),
  });

  const totalSafeBalance = safes.reduce((s, safe) => s + Number(safe.balance), 0);

  const kpis = [
    {
      label:    "رصيد الخزائن الإجمالي",
      value:    formatCurrency(totalSafeBalance),
      icon:     Wallet,
      color:    "amber",
      sub:      `${safes.length} خزينة`,
    },
    {
      label:    "مبيعات اليوم",
      value:    formatCurrency(Number(stats?.total_sales_today ?? 0)),
      icon:     TrendingUp,
      color:    "emerald",
      sub:      "إجمالي القبض",
    },
    {
      label:    "مصروفات اليوم",
      value:    formatCurrency(Number(stats?.total_expenses_today ?? 0)),
      icon:     TrendingDown,
      color:    "red",
      sub:      "إجمالي الصرف",
    },
  ];

  const actions = [
    {
      label:   "سند قبض",
      sub:     "استلام مبلغ من عميل أو توريد",
      icon:    HandCoins,
      color:   "emerald",
      onClick: () => navigate("/vouchers"),
    },
    {
      label:   "سند صرف",
      sub:     "صرف مبلغ أو تسديد للمورد",
      icon:    ArrowUpFromLine,
      color:   "orange",
      onClick: () => navigate("/vouchers"),
    },
    {
      label:   "تحويل خزائن",
      sub:     "نقل رصيد بين الخزائن",
      icon:    ArrowLeftRight,
      color:   "violet",
      onClick: () => navigate("/vouchers"),
    },
    {
      label:   "إقفال الخزينة",
      sub:     "جرد ومطابقة الرصيد اليومي",
      icon:    Lock,
      color:   "amber",
      onClick: () => setShowClosing(true),
    },
  ];

  const colorMap: Record<string, string> = {
    amber:   "border-amber-500/30  bg-amber-500/8  text-amber-400  hover:bg-amber-500/15",
    emerald: "border-emerald-500/30 bg-emerald-500/8 text-emerald-400 hover:bg-emerald-500/15",
    orange:  "border-orange-500/30  bg-orange-500/8  text-orange-400  hover:bg-orange-500/15",
    violet:  "border-violet-500/30  bg-violet-500/8  text-violet-400  hover:bg-violet-500/15",
    red:     "border-red-500/30     bg-red-500/8     text-red-400     hover:bg-red-500/15",
  };

  return (
    <div className="space-y-8" dir="rtl">
      {showClosing && (
        <SafeClosingModal safes={safes as Safe[]} onClose={() => setShowClosing(false)} />
      )}

      {/* Page title */}
      <div>
        <h1 className="text-2xl font-black text-white flex items-center gap-3">
          <Wallet className="w-7 h-7 text-amber-400" />
          السندات والخزينة
        </h1>
        <p className="text-white/40 text-sm mt-1">
          {new Date().toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {kpis.map(k => {
          const Icon = k.icon;
          const cls = colorMap[k.color];
          return (
            <div key={k.label} className={`rounded-2xl border p-5 transition-all ${cls}`}>
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-current/10 border border-current/20`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-white/30 text-xs">{k.sub}</span>
              </div>
              <p className="text-white/50 text-xs mb-1">{k.label}</p>
              <p className="text-2xl font-black">{k.value}</p>
            </div>
          );
        })}
      </div>

      {/* Safe balances strip */}
      {safes.length > 0 && (
        <div>
          <p className="text-white/40 text-xs font-semibold uppercase tracking-widest mb-3">أرصدة الخزائن</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {safes.map(s => (
              <div key={s.id} className="bg-white/5 border border-white/8 rounded-2xl p-4">
                <p className="text-white/40 text-xs mb-1">{s.name}</p>
                <p className="text-xl font-black text-amber-400">{formatCurrency(Number(s.balance))}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Action buttons ── */}
      <div>
        <p className="text-white/40 text-xs font-semibold uppercase tracking-widest mb-3">العمليات</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {actions.map(a => {
            const Icon = a.icon;
            const cls  = colorMap[a.color];
            return (
              <button
                key={a.label}
                onClick={a.onClick}
                className={`rounded-2xl border p-5 text-right transition-all hover:-translate-y-0.5 active:scale-95 group ${cls}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <Icon className="w-6 h-6" />
                  <ChevronLeft className="w-4 h-4 text-current/40 group-hover:text-current/70 transition-colors" />
                </div>
                <p className="font-bold text-base leading-tight">{a.label}</p>
                <p className="text-white/40 text-xs mt-1 leading-tight">{a.sub}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
