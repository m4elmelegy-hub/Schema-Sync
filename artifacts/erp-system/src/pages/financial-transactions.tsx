import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGetSettingsSafes } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import { Activity, TrendingUp, TrendingDown, Minus } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

interface FinancialTransaction {
  id: number; type: string; reference_type: string | null; reference_id: number | null;
  safe_id: number | null; safe_name: string | null;
  customer_id: number | null; customer_name: string | null;
  amount: number; direction: string; description: string | null;
  date: string | null; created_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  sale_cash: "بيع نقدي", sale_credit: "بيع آجل", sale_partial: "بيع جزئي",
  expense: "مصروف", income: "إيراد",
  voucher_receipt: "سند قبض (خزينة)", voucher_payment: "سند توريد (خزينة)",
  receipt_voucher: "سند قبض عميل", deposit_voucher: "سند توريد",
  transfer_in: "تحويل وارد", transfer_out: "تحويل صادر",
};

const DIRECTION_CONFIG = {
  in: { label: "داخل", icon: TrendingUp, cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  out: { label: "خارج", icon: TrendingDown, cls: "text-red-400 bg-red-500/10 border-red-500/20" },
  none: { label: "—", icon: Minus, cls: "text-white/30 bg-white/5 border-white/10" },
};

export default function FinancialTransactions() {
  const { data: safes = [] } = useGetSettingsSafes();
  const [filters, setFilters] = useState({ safe_id: "", direction: "", from: "", to: "" });

  const queryParams = new URLSearchParams();
  if (filters.safe_id) queryParams.set("safe_id", filters.safe_id);
  if (filters.direction) queryParams.set("direction", filters.direction);
  if (filters.from) queryParams.set("from", filters.from);
  if (filters.to) queryParams.set("to", filters.to);
  const qs = queryParams.toString();

  const { data: transactions = [], isLoading } = useQuery<FinancialTransaction[]>({
    queryKey: ["/api/financial-transactions", qs],
    queryFn: () => fetch(api(`/api/financial-transactions${qs ? "?" + qs : ""}`)).then(r => { if (!r.ok) throw new Error("خطأ في جلب البيانات"); return r.json(); }),
  });

  const totalIn = transactions.filter(t => t.direction === "in").reduce((s, t) => s + t.amount, 0);
  const totalOut = transactions.filter(t => t.direction === "out").reduce((s, t) => s + t.amount, 0);
  const net = totalIn - totalOut;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Activity className="w-6 h-6 text-amber-400" />
        <h2 className="text-xl font-bold text-white">سجل الحركات المالية المركزي</h2>
        <span className="text-xs text-white/40 bg-white/5 px-2 py-1 rounded-full">{transactions.length} حركة</span>
      </div>

      {/* ملخص */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-panel rounded-2xl p-5 border border-emerald-500/20">
          <p className="text-white/50 text-xs mb-1">إجمالي الوارد</p>
          <p className="text-2xl font-black text-emerald-400">{formatCurrency(totalIn)}</p>
        </div>
        <div className="glass-panel rounded-2xl p-5 border border-red-500/20">
          <p className="text-white/50 text-xs mb-1">إجمالي الصادر</p>
          <p className="text-2xl font-black text-red-400">{formatCurrency(totalOut)}</p>
        </div>
        <div className={`glass-panel rounded-2xl p-5 border ${net >= 0 ? "border-amber-500/20" : "border-orange-500/20"}`}>
          <p className="text-white/50 text-xs mb-1">الصافي</p>
          <p className={`text-2xl font-black ${net >= 0 ? "text-amber-400" : "text-orange-400"}`}>{formatCurrency(Math.abs(net))} {net < 0 ? "(عجز)" : ""}</p>
        </div>
      </div>

      {/* فلاتر */}
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap gap-3">
        <select className="glass-input rounded-xl px-3 py-2 text-sm text-white" value={filters.safe_id} onChange={e => setFilters(f => ({ ...f, safe_id: e.target.value }))}>
          <option value="">كل الخزائن</option>
          {safes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="glass-input rounded-xl px-3 py-2 text-sm text-white" value={filters.direction} onChange={e => setFilters(f => ({ ...f, direction: e.target.value }))}>
          <option value="">كل الاتجاهات</option>
          <option value="in">وارد (in)</option>
          <option value="out">صادر (out)</option>
          <option value="none">بدون خزينة</option>
        </select>
        <input type="date" className="glass-input rounded-xl px-3 py-2 text-sm text-white" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} placeholder="من تاريخ" />
        <input type="date" className="glass-input rounded-xl px-3 py-2 text-sm text-white" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} placeholder="إلى تاريخ" />
        {(filters.safe_id || filters.direction || filters.from || filters.to) && (
          <button onClick={() => setFilters({ safe_id: "", direction: "", from: "", to: "" })} className="text-xs text-white/50 hover:text-white px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">مسح الفلاتر ×</button>
        )}
      </div>

      {/* الجدول */}
      <div className="glass-panel rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-white/80 whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-4 font-medium text-sm text-white/50">#</th>
                <th className="p-4 font-medium text-sm text-white/50">النوع</th>
                <th className="p-4 font-medium text-sm text-white/50">الخزينة</th>
                <th className="p-4 font-medium text-sm text-white/50">العميل</th>
                <th className="p-4 font-medium text-sm text-white/50">المبلغ</th>
                <th className="p-4 font-medium text-sm text-white/50">الاتجاه</th>
                <th className="p-4 font-medium text-sm text-white/50">البيان</th>
                <th className="p-4 font-medium text-sm text-white/50">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="p-8 text-center text-white/50">جاري التحميل...</td></tr>
              ) : transactions.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-white/40">لا توجد حركات مالية بعد</td></tr>
              ) : transactions.map(t => {
                const dir = DIRECTION_CONFIG[t.direction as keyof typeof DIRECTION_CONFIG] ?? DIRECTION_CONFIG.none;
                const DirIcon = dir.icon;
                return (
                  <tr key={t.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="p-4 text-white/30 text-xs">{t.id}</td>
                    <td className="p-4"><span className="px-2 py-1 rounded-lg text-xs bg-amber-500/10 border border-amber-500/20 text-amber-300">{TYPE_LABELS[t.type] ?? t.type}</span></td>
                    <td className="p-4 text-blue-300 text-sm">{t.safe_name || '—'}</td>
                    <td className="p-4 text-white/70 text-sm">{t.customer_name || '—'}</td>
                    <td className="p-4 font-bold text-white">{formatCurrency(t.amount)}</td>
                    <td className="p-4">
                      <span className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs border w-fit ${dir.cls}`}>
                        <DirIcon className="w-3 h-3" /> {dir.label}
                      </span>
                    </td>
                    <td className="p-4 text-white/60 text-sm max-w-xs truncate">{t.description || '—'}</td>
                    <td className="p-4 text-sm text-white/50">{t.date || t.created_at?.split("T")[0]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
