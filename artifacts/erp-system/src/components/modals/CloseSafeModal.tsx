/**
 * CloseSafeModal — إقفال الخزينة
 * Gold/amber theme | Reads /api/financial-transactions
 */
import { useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useQuery } from "@tanstack/react-query";
import { useGetSettingsSafes } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import { Lock, Printer, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api  = (p: string) => `${BASE}${p}`;
const today = () => new Date().toISOString().split("T")[0];

interface Transaction {
  id: number; type: string; amount: number; direction: string;
  safe_id: number; description: string; date: string;
}

const IN_LABELS:  Record<string, string> = {
  sale_cash: "مبيعات نقدي", sale_credit: "مبيعات آجل", income: "إيرادات",
  receipt_voucher: "سندات قبض", transfer_in: "تحويل وارد", deposit_voucher: "سندات توريد",
};
const OUT_LABELS: Record<string, string> = {
  purchase_cash: "مشتريات نقدي", purchase_credit: "مشتريات آجل", expense: "مصروفات",
  payment_voucher: "سندات صرف", transfer_out: "تحويل صادر",
};

function grouped(rows: Transaction[], labels: Record<string, string>) {
  const map: Record<string, number> = {};
  rows.forEach(t => { const k = labels[t.type] || t.type; map[k] = (map[k] || 0) + t.amount; });
  return Object.entries(map);
}

interface Props { onClose: () => void; }

export default function CloseSafeModal({ onClose }: Props) {
  const { toast } = useToast();
  const { data: safes = [] } = useGetSettingsSafes();
  const [safeId,      setSafeId]      = useState(safes.length > 0 ? String(safes[0].id) : "");
  const [closingDate, setClosingDate] = useState(today());
  const [actualBal,   setActualBal]   = useState("");

  const { data: txToday = [] } = useQuery<Transaction[]>({
    queryKey: ["/api/financial-transactions", safeId, closingDate],
    queryFn: () =>
      safeId
        ? authFetch(api(`/api/financial-transactions?safe_id=${safeId}&from=${closingDate}&to=${closingDate}`))
            .then(r => { if (!r.ok) throw new Error("خطأ"); return r.json(); })
        : Promise.resolve([]),
    enabled: !!safeId,
  });

  const selectedSafe  = safes.find(s => String(s.id) === safeId);
  const systemBalance = selectedSafe ? Number(selectedSafe.balance) : 0;
  const inRows        = txToday.filter(t => t.direction === "in");
  const outRows       = txToday.filter(t => t.direction === "out");
  const totalIn       = inRows.reduce((s, t) => s + t.amount, 0);
  const totalOut      = outRows.reduce((s, t) => s + t.amount, 0);
  const prevBalance   = systemBalance - totalIn + totalOut;
  const actual        = actualBal !== "" ? Number(actualBal) : null;
  const variance      = actual !== null ? actual - systemBalance : null;

  const printClosing = () => {
    const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>إقفال الخزينة</title>
    <style>body{font-family:'Segoe UI',sans-serif;direction:rtl;padding:20px;font-size:13px}
    h2{text-align:center;margin-bottom:4px}p.sub{text-align:center;color:#666;margin-bottom:16px;font-size:11px}
    table{width:100%;border-collapse:collapse;margin-bottom:12px}th{background:#1a1a2e;color:white;padding:6px 10px;text-align:right;font-size:11px}
    td{padding:5px 10px;border-bottom:1px solid #eee}.tr td{font-weight:bold;background:#f5f5f5}
    .tc{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .sm{background:#f9f9f9;padding:10px;border-radius:6px;margin-top:12px}
    .sr{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #ddd}
    .vp{color:green;font-weight:bold}.vn{color:red;font-weight:bold}</style></head><body>
    <h2>Halal Tech — إقفال الخزينة</h2>
    <p class="sub">الخزينة: ${selectedSafe?.name || ""} | التاريخ: ${closingDate}</p>
    <div class="tc">
      <table><tr><th colspan="2">الوارد</th></tr>
        ${grouped(inRows, IN_LABELS).map(([k, v]) => `<tr><td>${k}</td><td>${formatCurrency(v)}</td></tr>`).join("")}
        <tr class="tr"><td>إجمالي الداخل</td><td>${formatCurrency(totalIn)}</td></tr></table>
      <table><tr><th colspan="2">الصادر</th></tr>
        ${grouped(outRows, OUT_LABELS).map(([k, v]) => `<tr><td>${k}</td><td>${formatCurrency(v)}</td></tr>`).join("")}
        <tr class="tr"><td>إجمالي الخارج</td><td>${formatCurrency(totalOut)}</td></tr></table>
    </div>
    <div class="sm">
      <div class="sr"><span>رصيد سابق</span><span>${formatCurrency(prevBalance)}</span></div>
      <div class="sr"><span>الرصيد الحالي (نظام)</span><span>${formatCurrency(systemBalance)}</span></div>
      ${actual !== null ? `<div class="sr"><span>الرصيد الفعلي (جرد)</span><span>${formatCurrency(actual)}</span></div>` : ""}
      ${variance !== null ? `<div class="sr"><span>العجز / الزيادة</span><span class="${variance >= 0 ? "vp" : "vn"}">${variance >= 0 ? "+" : ""}${formatCurrency(variance)}</span></div>` : ""}
    </div>
    <p style="text-align:center;font-size:10px;color:#999;margin-top:20px">طُبع بواسطة Halal Tech ERP — ${new Date().toLocaleString("ar-EG")}</p>
    <script>window.print();</script></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-3xl p-7 space-y-5 shadow-2xl border border-amber-500/30 bg-[#1a1408] max-h-[92vh] overflow-y-auto">

        {/* Close */}
        <button type="button" onClick={onClose}
          className="absolute top-4 left-4 text-white/30 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-amber-500/15 border border-amber-500/30">
            <Lock className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h3 className="text-lg font-black text-amber-400">إقفال الخزينة</h3>
            <p className="text-white/30 text-xs">جرد ومطابقة يومية للخزينة</p>
          </div>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-white/50 text-xs mb-1.5 font-medium">الخزينة</label>
            <select className="glass-input w-full text-sm" value={safeId} onChange={e => setSafeId(e.target.value)}>
              <option value="">-- اختر --</option>
              {safes.map(s => <option key={s.id} value={s.id}>{s.name} — {formatCurrency(Number(s.balance))}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-white/50 text-xs mb-1.5 font-medium">تاريخ الإقفال</label>
            <input type="date" className="glass-input w-full text-sm" value={closingDate}
              onChange={e => setClosingDate(e.target.value)} />
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "رصيد سابق",            val: prevBalance,   c: "text-white/60" },
            { label: "الرصيد الحالي (نظام)",  val: systemBalance, c: "text-amber-400" },
            { label: "إجمالي الداخل",         val: totalIn,       c: "text-emerald-400" },
            { label: "إجمالي الخارج",         val: totalOut,      c: "text-red-400" },
          ].map(({ label, val, c }) => (
            <div key={label} className="bg-white/5 border border-white/8 rounded-xl p-3">
              <p className="text-white/30 text-xs">{label}</p>
              <p className={`${c} font-bold text-sm mt-1`}>{formatCurrency(val)}</p>
            </div>
          ))}
        </div>

        {/* Breakdown */}
        {txToday.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-3">
              <p className="text-emerald-400 font-bold text-xs mb-2">الوارد (داخل)</p>
              <div className="space-y-1">
                {grouped(inRows, IN_LABELS).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs">
                    <span className="text-white/40">{k}</span>
                    <span className="text-emerald-400 font-medium">{formatCurrency(v)}</span>
                  </div>
                ))}
                {inRows.length === 0 && <p className="text-white/20 text-xs">لا يوجد</p>}
              </div>
            </div>
            <div className="bg-red-500/5 border border-red-500/15 rounded-xl p-3">
              <p className="text-red-400 font-bold text-xs mb-2">الصادر (خارج)</p>
              <div className="space-y-1">
                {grouped(outRows, OUT_LABELS).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs">
                    <span className="text-white/40">{k}</span>
                    <span className="text-red-400 font-medium">{formatCurrency(v)}</span>
                  </div>
                ))}
                {outRows.length === 0 && <p className="text-white/20 text-xs">لا يوجد</p>}
              </div>
            </div>
          </div>
        )}
        {txToday.length === 0 && safeId && (
          <p className="text-center text-white/25 text-xs py-1">لا توجد حركات في هذا اليوم</p>
        )}

        {/* Actual balance input */}
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 space-y-3">
          <div>
            <label className="block text-white/50 text-xs mb-1.5 font-medium">الرصيد الفعلي — جرد يدوي (ج.م)</label>
            <input type="number" min="0" step="0.01" className="glass-input w-full text-sm"
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
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 rounded-xl text-white/60 hover:text-white hover:border-white/20 transition-all text-sm font-medium">
            <Printer className="w-4 h-4" /> طباعة الجرد
          </button>
          <button onClick={() => { toast({ title: `✅ تم حفظ إقفال "${selectedSafe?.name}" بتاريخ ${closingDate}` }); onClose(); }}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-amber-500 text-black rounded-xl font-black text-sm hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20">
            <Lock className="w-4 h-4" /> تأكيد الإقفال
          </button>
        </div>
      </div>
    </div>
  );
}
