import { useState, useEffect } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { formatCurrency } from "@/lib/format";
import {
  Wallet, TrendingUp, HandCoins, ArrowUpFromLine,
  ArrowLeftRight, CheckCircle2, Lock, Printer,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { hasPermission } from "@/lib/permissions";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

type Operation = "hub" | "safe-closing";

interface Safe { id: number; name: string; balance: number | string; }
interface Transaction { id: number; type: string; amount: number; direction: string; safe_id: number; description: string; date: string; }

export default function Tasks() {
  const [op, setOp] = useState<Operation>("hub");
  const [successMsg, setSuccessMsg] = useState("");
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: safes = [] } = useQuery<Safe[]>({
    queryKey: ["/api/settings/safes"],
    queryFn: () => authFetch(api("/api/settings/safes")).then(r => { if (!r.ok) throw new Error("خطأ في جلب البيانات"); return r.json(); }),
  });
  const { data: stats } = useQuery<Record<string, number>>({
    queryKey: ["/api/dashboard/stats"],
    queryFn: () => authFetch(api("/api/dashboard/stats")).then(r => { if (!r.ok) throw new Error("خطأ في جلب البيانات"); return r.json(); }),
  });

  const goHub = (msg: string) => {
    setSuccessMsg(msg);
    qc.invalidateQueries();
    setTimeout(() => { setOp("hub"); setSuccessMsg(""); }, 2000);
  };

  if (op === "safe-closing") {
    return (
      <div className="space-y-4 max-w-xl mx-auto">
        <button
          onClick={() => setOp("hub")}
          className="flex items-center gap-2 text-white/40 hover:text-amber-400 transition-colors text-sm group"
        >
          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          العودة للمهام
        </button>
        <SafeClosingForm safes={safes} onSuccess={goHub} />
      </div>
    );
  }

  const allNavActions = [
    {
      href: "/receipt-vouchers",
      title: "سند قبض",
      sub: "استلام من عميل",
      icon: HandCoins,
      color: "text-violet-400",
      ring: "ring-violet-500/30",
      bg: "bg-violet-500/8",
      stat: "اضغط للفتح",
      statLabel: "سندات القبض",
      permission: null,
    },
    {
      href: "/payment-vouchers",
      title: "سند صرف",
      sub: "تسديد للعميل",
      icon: ArrowUpFromLine,
      color: "text-orange-400",
      ring: "ring-orange-500/30",
      bg: "bg-orange-500/8",
      stat: "اضغط للفتح",
      statLabel: "سندات الصرف",
      permission: null,
    },
    {
      href: "/expenses",
      title: "مصروف",
      sub: "صرف من الخزينة",
      icon: Wallet,
      color: "text-red-400",
      ring: "ring-red-500/30",
      bg: "bg-red-500/8",
      stat: "اضغط للفتح",
      statLabel: "المصروفات",
      permission: "can_view_expenses",
    },
    {
      href: "/income",
      title: "إيراد",
      sub: "إضافة للخزينة",
      icon: TrendingUp,
      color: "text-emerald-400",
      ring: "ring-emerald-500/30",
      bg: "bg-emerald-500/8",
      stat: "اضغط للفتح",
      statLabel: "الإيرادات",
      permission: null,
    },
    {
      href: "/safe-transfers",
      title: "تحويل خزائن",
      sub: "نقل بين الخزائن",
      icon: ArrowLeftRight,
      color: "text-cyan-400",
      ring: "ring-cyan-500/30",
      bg: "bg-cyan-500/8",
      stat: "اضغط للفتح",
      statLabel: "التحويلات",
      permission: null,
    },
  ];

  const navActions = allNavActions.filter(a =>
    a.permission === null || hasPermission(user, a.permission) === true
  );

  return (
    <div className="space-y-5">
      {successMsg && (
        <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl px-4 py-3 text-emerald-400 font-bold text-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {successMsg}
        </div>
      )}

      {/* Daily summary strip */}
      {stats && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "مبيعات", val: stats.total_sales_today, c: "emerald" },
            { label: "مصروفات", val: stats.total_expenses_today, c: "red" },
            { label: "إيرادات", val: stats.total_income_today, c: "teal" },
            { label: "الصافي", val: stats.net_profit, c: Number(stats.net_profit) >= 0 ? "emerald" : "red" },
          ].map(({ label, val, c }) => (
            <div key={label} className={`glass-panel rounded-xl p-3 border border-${c}-500/15`}>
              <p className="text-white/30 text-xs">{label}</p>
              <p className={`text-${c}-400 font-black text-sm mt-0.5`}>{formatCurrency(Number(val))}</p>
            </div>
          ))}
        </div>
      )}

      {/* Section header */}
      <div className="flex items-center gap-3">
        <div className="w-1 h-4 rounded-full bg-amber-400" />
        <h2 className="text-sm font-bold text-white/60 uppercase tracking-widest">العمليات السريعة</h2>
      </div>

      {/* Quick actions grid — 3 cols mobile / 6 cols desktop */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
        {navActions.map(a => {
          const Icon = a.icon;
          return (
            <Link key={a.href} href={a.href}>
              <div
                className={`glass-panel rounded-xl text-right ring-1 ${a.ring} ${a.bg} hover:brightness-110 transition-all duration-200 hover:-translate-y-0.5 active:scale-95 group cursor-pointer`}
                style={{ padding: "10px 12px" }}
              >
                <div className="flex items-center justify-between mb-1">
                  <Icon className={`w-4 h-4 shrink-0 ${a.color}`} />
                  <ChevronLeft className="w-3 h-3 text-white/20 group-hover:text-white/40 transition-colors" />
                </div>
                <p className={`font-bold text-sm leading-tight ${a.color}`}>{a.title}</p>
                <p className="text-white/40 text-xs mt-0.5 leading-tight">{a.sub}</p>
                <div className="mt-1.5 pt-1.5 border-t border-white/5">
                  <p className="text-white/30 text-xs leading-none">{a.statLabel}</p>
                  <p className={`font-bold text-xs mt-0.5 leading-tight ${a.color}`}>{a.stat}</p>
                </div>
              </div>
            </Link>
          );
        })}

        {/* Safe closing — stays inline (no dedicated page yet) */}
        <button
          onClick={() => setOp("safe-closing")}
          className="glass-panel rounded-xl text-right ring-1 ring-amber-500/30 bg-amber-500/8 hover:brightness-110 transition-all duration-200 hover:-translate-y-0.5 active:scale-95 group"
          style={{ padding: "10px 12px" }}
        >
          <div className="flex items-center justify-between mb-1">
            <Lock className="w-4 h-4 shrink-0 text-amber-400" />
            <ChevronLeft className="w-3 h-3 text-white/20 group-hover:text-white/40 transition-colors" />
          </div>
          <p className="font-bold text-sm leading-tight text-amber-400">إقفال الخزينة</p>
          <p className="text-white/40 text-xs mt-0.5 leading-tight">جرد ومطابقة اليومية</p>
          <div className="mt-1.5 pt-1.5 border-t border-white/5">
            <p className="text-white/30 text-xs leading-none">إقفال يوم</p>
            <p className="font-bold text-xs mt-0.5 leading-tight text-amber-400">
              {new Date().toLocaleDateString("ar-EG", { day: "2-digit", month: "2-digit", year: "numeric" })}
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}

/* ─── Shared helpers (used by SafeClosingForm) ─── */

function useFirstSafeId(safes: Safe[]) {
  const [safeId, setSafeId] = useState("");
  useEffect(() => {
    if (safes.length > 0 && !safeId) setSafeId(String(safes[0].id));
  }, [safes, safeId]);
  return [safeId, setSafeId] as const;
}

function FL({ children }: { children: React.ReactNode }) {
  return <label className="block text-white/40 text-xs mb-1.5 font-medium">{children}</label>;
}

function SafeSelect({ safes, value, onChange, label }: { safes: Safe[]; value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <div>
      <FL>{label || "الخزينة (تختار تلقائياً)"}</FL>
      <select className="glass-input w-full text-white text-sm" value={value} onChange={e => onChange(e.target.value)}>
        <option value="" className="bg-gray-900">-- اختر الخزينة --</option>
        {safes.map(s => (
          <option key={s.id} value={s.id} className="bg-gray-900">
            {s.name} — {formatCurrency(Number(s.balance))}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ─── Safe Closing ─── */
function SafeClosingForm({ safes, onSuccess }: { safes: Safe[]; onSuccess: (m: string) => void }) {
  const [safeId, setSafeId] = useFirstSafeId(safes);
  const [closingDate, setClosingDate] = useState(new Date().toISOString().split("T")[0]);
  const [actualBalance, setActualBalance] = useState("");

  const selectedSafe = safes.find(s => String(s.id) === safeId);
  const systemBalance = selectedSafe ? Number(selectedSafe.balance) : 0;

  const { data: txToday = [] } = useQuery<Transaction[]>({
    queryKey: ["/api/financial-transactions", safeId, closingDate],
    queryFn: () =>
      safeId
        ? authFetch(api(`/api/financial-transactions?safe_id=${safeId}&from=${closingDate}&to=${closingDate}`)).then(r => { if (!r.ok) throw new Error("خطأ في جلب البيانات"); return r.json(); })
        : Promise.resolve([]),
    enabled: !!safeId,
  });

  const inTypes: Record<string, string> = {
    sale_cash: "مبيعات نقدي",
    sale_credit: "مبيعات آجل",
    income: "إيرادات",
    receipt_voucher: "سندات قبض",
    transfer_in: "تحويل وارد",
    deposit_voucher: "سندات توريد",
  };
  const outTypes: Record<string, string> = {
    purchase_cash: "مشتريات نقدي",
    purchase_credit: "مشتريات آجل",
    expense: "مصروفات",
    payment_voucher: "سندات صرف",
    transfer_out: "تحويل صادر",
  };

  const inRows = txToday.filter(t => t.direction === "in");
  const outRows = txToday.filter(t => t.direction === "out");

  const totalIn = inRows.reduce((s, t) => s + t.amount, 0);
  const totalOut = outRows.reduce((s, t) => s + t.amount, 0);
  const prevBalance = systemBalance - totalIn + totalOut;
  const actual = actualBalance !== "" ? Number(actualBalance) : null;
  const variance = actual !== null ? actual - systemBalance : null;

  const grouped = (rows: Transaction[], labels: Record<string, string>) => {
    const map: Record<string, number> = {};
    rows.forEach(t => {
      const key = labels[t.type] || t.type;
      map[key] = (map[key] || 0) + t.amount;
    });
    return Object.entries(map);
  };

  const printClosing = () => {
    const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8">
    <title>إقفال الخزينة</title>
    <style>
      body { font-family: 'Segoe UI', sans-serif; direction: rtl; padding: 20px; font-size: 13px; }
      h2 { text-align: center; margin-bottom: 4px; }
      p.sub { text-align: center; color: #666; margin-bottom: 16px; font-size: 11px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
      th { background: #1a1a2e; color: white; padding: 6px 10px; text-align: right; font-size: 11px; }
      td { padding: 5px 10px; border-bottom: 1px solid #eee; }
      .total-row td { font-weight: bold; background: #f5f5f5; }
      .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .summary { background: #f9f9f9; padding: 10px; border-radius: 6px; margin-top: 12px; }
      .summary .row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #ddd; }
      .variance-pos { color: green; font-weight: bold; }
      .variance-neg { color: red; font-weight: bold; }
    </style></head><body>
    <h2>Halal Tech — إقفال الخزينة</h2>
    <p class="sub">الخزينة: ${selectedSafe?.name || ""} | التاريخ: ${closingDate}</p>
    <div class="two-col">
      <table>
        <tr><th colspan="2">الوارد (داخل)</th></tr>
        ${grouped(inRows, inTypes).map(([k, v]) => `<tr><td>${k}</td><td>${formatCurrency(v)}</td></tr>`).join("")}
        <tr class="total-row"><td>إجمالي الداخل</td><td>${formatCurrency(totalIn)}</td></tr>
      </table>
      <table>
        <tr><th colspan="2">الصادر (خارج)</th></tr>
        ${grouped(outRows, outTypes).map(([k, v]) => `<tr><td>${k}</td><td>${formatCurrency(v)}</td></tr>`).join("")}
        <tr class="total-row"><td>إجمالي الخارج</td><td>${formatCurrency(totalOut)}</td></tr>
      </table>
    </div>
    <div class="summary">
      <div class="row"><span>رصيد سابق</span><span>${formatCurrency(prevBalance)}</span></div>
      <div class="row"><span>الرصيد الحالي (نظام)</span><span>${formatCurrency(systemBalance)}</span></div>
      ${actual !== null ? `<div class="row"><span>الرصيد الفعلي (جرد)</span><span>${formatCurrency(actual)}</span></div>` : ""}
      ${variance !== null ? `<div class="row"><span>العجز / الزيادة</span><span class="${variance >= 0 ? 'variance-pos' : 'variance-neg'}">${variance >= 0 ? "+" : ""}${formatCurrency(variance)}</span></div>` : ""}
    </div>
    <br/><p style="text-align:center;font-size:10px;color:#999">طُبع بواسطة Halal Tech ERP — ${new Date().toLocaleString("ar-EG")}</p>
    <script>window.print();</script>
    </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-500/10 border border-amber-500/30">
          <Lock className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h2 className="text-lg font-black text-amber-400">إقفال الخزينة</h2>
          <p className="text-white/30 text-xs">جرد ومطابقة يومية للخزينة</p>
        </div>
      </div>

      {/* Controls */}
      <div className="glass-panel rounded-2xl p-4 border border-white/10 mb-4 grid grid-cols-2 gap-3">
        <SafeSelect safes={safes} value={safeId} onChange={setSafeId} label="الخزينة" />
        <div>
          <FL>تاريخ الإقفال</FL>
          <input type="date" className="glass-input w-full text-white text-sm"
            value={closingDate} onChange={e => setClosingDate(e.target.value)} />
        </div>
      </div>

      {/* Summary grid */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {[
          { label: "رصيد سابق", val: prevBalance, c: "white/60" },
          { label: "الرصيد الحالي (نظام)", val: systemBalance, c: "amber-400" },
          { label: "إجمالي الداخل", val: totalIn, c: "emerald-400" },
          { label: "إجمالي الخارج", val: totalOut, c: "red-400" },
        ].map(({ label, val, c }) => (
          <div key={label} className="glass-panel rounded-xl p-3 border border-white/8">
            <p className="text-white/30 text-xs">{label}</p>
            <p className={`text-${c} font-bold text-sm mt-1`}>{formatCurrency(val)}</p>
          </div>
        ))}
      </div>

      {/* Breakdown tables */}
      {txToday.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="glass-panel rounded-xl p-3 border border-emerald-500/15">
            <p className="text-emerald-400 font-bold text-xs mb-2">الوارد (داخل)</p>
            <div className="space-y-1.5">
              {grouped(inRows, inTypes).map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs">
                  <span className="text-white/50">{k}</span>
                  <span className="text-emerald-400 font-medium">{formatCurrency(v)}</span>
                </div>
              ))}
              {inRows.length === 0 && <p className="text-white/20 text-xs">لا يوجد</p>}
            </div>
          </div>
          <div className="glass-panel rounded-xl p-3 border border-red-500/15">
            <p className="text-red-400 font-bold text-xs mb-2">الصادر (خارج)</p>
            <div className="space-y-1.5">
              {grouped(outRows, outTypes).map(([k, v]) => (
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
        <div className="text-center py-4 text-white/25 text-sm mb-4">لا توجد حركات لهذه الخزينة في هذا اليوم</div>
      )}

      {/* Actual balance input */}
      <div className="glass-panel rounded-2xl p-4 border border-amber-500/20 bg-amber-500/5 space-y-3">
        <div>
          <FL>الرصيد الفعلي — جرد يدوي (ج.م)</FL>
          <input type="number" min="0" step="0.01" className="glass-input w-full text-white text-sm"
            placeholder="أدخل الرصيد الفعلي بعد الجرد..."
            value={actualBalance} onChange={e => setActualBalance(e.target.value)} />
        </div>

        {variance !== null && (
          <div className={`flex items-center justify-between rounded-xl px-4 py-3 border ${variance === 0 ? "bg-emerald-500/10 border-emerald-500/20" : variance > 0 ? "bg-teal-500/10 border-teal-500/20" : "bg-red-500/10 border-red-500/20"}`}>
            <span className="text-white/60 text-sm">العجز / الزيادة</span>
            <span className={`font-black text-lg ${variance === 0 ? "text-emerald-400" : variance > 0 ? "text-teal-400" : "text-red-400"}`}>
              {variance > 0 ? "+" : ""}{formatCurrency(variance)}
              {variance === 0 && " ✓ مطابق"}
              {variance > 0 && " زيادة"}
              {variance < 0 && " عجز"}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 mt-4">
        <button
          onClick={printClosing}
          className="flex-1 flex items-center justify-center gap-2 py-3 glass-panel rounded-2xl border border-white/10 text-white/70 hover:text-white hover:border-white/20 transition-all text-sm font-medium"
        >
          <Printer className="w-4 h-4" />
          طباعة الجرد
        </button>
        <button
          onClick={() => onSuccess(`تم حفظ إقفال خزينة "${selectedSafe?.name}" بتاريخ ${closingDate} ✓`)}
          className="flex-1 btn-primary py-3 font-bold text-sm flex items-center justify-center gap-2"
        >
          <Lock className="w-4 h-4" />
          حفظ الإقفال
        </button>
      </div>
    </div>
  );
}
