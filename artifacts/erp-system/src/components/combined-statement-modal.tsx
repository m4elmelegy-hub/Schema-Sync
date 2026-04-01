import { useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency, formatDate } from "@/lib/format";
import { X, Loader2, TrendingUp, TrendingDown, ArrowUpFromLine, ArrowDownToLine, RotateCcw, Printer } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

interface StatementRow {
  date: string;
  type: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  reference_no?: string | null;
}

interface FullStatementResponse {
  contact: {
    id: number;
    name: string;
    phone: string | null;
    type: "customer" | "supplier" | "both";
    customer_id: number | null;
    supplier_id: number | null;
  };
  summary: {
    total_sales: number;
    total_purchases: number;
    total_receipts: number;
    total_payments: number;
    total_sale_returns: number;
    total_purchase_returns: number;
    closing_balance: number;
  };
  statement: StatementRow[];
}

const rowTypeConfig: Record<string, { label: string; icon: string; credit_color: string; debit_color: string }> = {
  opening_balance: { label: "رصيد أول المدة", icon: "⚖", credit_color: "text-amber-400", debit_color: "text-amber-400" },
  sale:            { label: "فاتورة مبيعات", icon: "🛍", credit_color: "text-emerald-400", debit_color: "text-white/50" },
  sale_return:     { label: "مرتجع مبيعات",  icon: "↩", credit_color: "text-white/50", debit_color: "text-orange-400" },
  purchase:        { label: "فاتورة شراء",   icon: "📦", credit_color: "text-red-400", debit_color: "text-white/50" },
  purchase_return: { label: "مرتجع مشتريات", icon: "↪", credit_color: "text-white/50", debit_color: "text-blue-400" },
  receipt_voucher: { label: "سند قبض",       icon: "💰", credit_color: "text-white/50", debit_color: "text-emerald-400" },
  payment_voucher: { label: "سند صرف",       icon: "💸", credit_color: "text-orange-400", debit_color: "text-white/50" },
  supplier_payment:{ label: "سداد للمورد",   icon: "🏦", credit_color: "text-white/50", debit_color: "text-blue-400" },
};

export function CombinedStatementModal({
  contactId,
  contactType,
  onClose,
}: {
  contactId: number;
  contactType: "customer" | "supplier";
  onClose: () => void;
}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("erp_auth_token") : null;
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data, isLoading, isError } = useQuery<FullStatementResponse>({
    queryKey: [`/api/contacts/${contactId}/full-statement`, contactType],
    queryFn: async () => {
      const res = await authFetch(api(`/api/contacts/${contactId}/full-statement?type=${contactType}`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("فشل جلب كشف الحساب");
      return res.json();
    },
  });

  const filtered = (data?.statement ?? []).filter(row => {
    if (dateFrom && row.date < dateFrom) return false;
    if (dateTo && row.date > dateTo) return false;
    return true;
  });

  const { summary, contact } = data ?? {};
  const closingBalance = filtered.length > 0
    ? (filtered[filtered.length - 1]?.balance ?? 0)
    : (summary?.closing_balance ?? 0);

  const handlePrint = () => {
    if (!data) return;
    const rows = filtered.map((r, i) => {
      const cfg = rowTypeConfig[r.type] ?? { label: r.type, icon: "•" };
      return `<tr style="background:${i % 2 === 0 ? '#f8f9fa' : '#fff'}">
        <td style="padding:6px;border:1px solid #dee2e6">${r.date}</td>
        <td style="padding:6px;border:1px solid #dee2e6">${cfg.icon} ${r.description}</td>
        <td style="padding:6px;border:1px solid #dee2e6;text-align:center;color:#28a745">${r.debit > 0 ? r.debit.toLocaleString("ar-EG", { minimumFractionDigits: 2 }) : "—"}</td>
        <td style="padding:6px;border:1px solid #dee2e6;text-align:center;color:#dc3545">${r.credit > 0 ? r.credit.toLocaleString("ar-EG", { minimumFractionDigits: 2 }) : "—"}</td>
        <td style="padding:6px;border:1px solid #dee2e6;text-align:center;font-weight:bold;color:${r.balance >= 0 ? '#856404' : '#0c5460'}">
          ${r.balance !== 0 ? `${Math.abs(r.balance).toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ${r.balance > 0 ? "عليه" : "له"}` : "صفر"}
        </td>
      </tr>`;
    }).join("");
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8">
      <title>كشف الحساب الموحد — ${contact?.name}</title>
      <style>body{font-family:Arial,sans-serif;font-size:12px;padding:20px}h2{color:#333}table{width:100%;border-collapse:collapse}th{background:#343a40;color:#fff;padding:8px;border:1px solid #dee2e6}</style>
      </head><body>
      <h2>كشف الحساب الموحد</h2>
      <p><strong>${contact?.name}</strong> | ${contact?.phone ?? "—"} | النوع: ${contact?.type === "both" ? "عميل ومورد" : contact?.type === "customer" ? "عميل" : "مورد"}</p>
      <p>الرصيد النهائي: <strong>${Math.abs(closingBalance).toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ${closingBalance >= 0 ? "عليه لنا" : "له علينا"}</strong></p>
      <table><thead><tr><th>التاريخ</th><th>البيان</th><th>مدين (له)</th><th>دائن (عليه)</th><th>الرصيد</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <script>window.print();</script></body></html>`);
    win.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm modal-overlay"
      onKeyDown={e => e.key === "Escape" && onClose()}>
      <div className="glass-panel rounded-3xl w-full max-w-5xl max-h-[92vh] flex flex-col border border-white/10 shadow-2xl overflow-hidden">
        {/* رأس النافذة */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-white">كشف الحساب الموحد</h2>
            {contact && (
              <p className="text-white/50 text-sm mt-0.5">
                {contact.name}
                {contact.phone && <span className="mr-2 text-white/30">| {contact.phone}</span>}
                <span className={`mr-2 text-xs px-2 py-0.5 rounded-full border font-bold
                  ${contact.type === "both" ? "bg-violet-500/20 border-violet-500/30 text-violet-400"
                  : contact.type === "customer" ? "bg-blue-500/20 border-blue-500/30 text-blue-400"
                  : "bg-orange-500/20 border-orange-500/30 text-orange-400"}`}>
                  {contact.type === "both" ? "عميل ومورد" : contact.type === "customer" ? "عميل" : "مورد"}
                </span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 text-sm transition-colors">
              <Printer className="w-3.5 h-3.5" /> طباعة
            </button>
            <button onClick={onClose} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
              <X className="w-4 h-4 text-white/70" />
            </button>
          </div>
        </div>

        {isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
          </div>
        )}
        {isError && (
          <div className="flex-1 flex items-center justify-center text-red-400">فشل جلب البيانات</div>
        )}

        {data && (
          <>
            {/* ملخص */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-4 shrink-0 border-b border-white/10">
              <div className="glass-panel rounded-2xl px-4 py-3 border border-emerald-500/20 bg-emerald-500/5">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold mb-1"><TrendingUp className="w-3.5 h-3.5" /> إجمالي المبيعات</div>
                <div className="text-white font-black text-lg">{formatCurrency(summary!.total_sales)}</div>
              </div>
              <div className="glass-panel rounded-2xl px-4 py-3 border border-red-500/20 bg-red-500/5">
                <div className="flex items-center gap-2 text-red-400 text-xs font-bold mb-1"><TrendingDown className="w-3.5 h-3.5" /> إجمالي المشتريات</div>
                <div className="text-white font-black text-lg">{formatCurrency(summary!.total_purchases)}</div>
              </div>
              <div className="glass-panel rounded-2xl px-4 py-3 border border-blue-500/20 bg-blue-500/5">
                <div className="flex items-center gap-2 text-blue-400 text-xs font-bold mb-1"><ArrowDownToLine className="w-3.5 h-3.5" /> إجمالي المدفوعات</div>
                <div className="text-white font-black text-lg">{formatCurrency(summary!.total_receipts + summary!.total_payments)}</div>
              </div>
              <div className={`glass-panel rounded-2xl px-4 py-3 border ${closingBalance >= 0 ? "border-yellow-500/30 bg-yellow-500/5" : "border-violet-500/30 bg-violet-500/5"}`}>
                <div className={`text-xs font-bold mb-1 ${closingBalance >= 0 ? "text-yellow-400" : "text-violet-400"}`}>⚖ صافي الرصيد</div>
                <div className={`font-black text-lg ${closingBalance >= 0 ? "text-yellow-400" : "text-violet-400"}`}>
                  {formatCurrency(Math.abs(closingBalance))}
                  <span className="text-xs font-normal mr-1">{closingBalance >= 0 ? "عليه لنا" : "له علينا"}</span>
                </div>
              </div>
            </div>

            {/* فلتر التاريخ */}
            <div className="flex items-center gap-3 px-6 py-3 shrink-0 border-b border-white/5">
              <span className="text-white/50 text-sm">تصفية:</span>
              <input type="date" className="glass-input text-sm py-1.5 px-3 w-36" value={dateFrom}
                onChange={e => setDateFrom(e.target.value)} placeholder="من" />
              <span className="text-white/40">—</span>
              <input type="date" className="glass-input text-sm py-1.5 px-3 w-36" value={dateTo}
                onChange={e => setDateTo(e.target.value)} placeholder="إلى" />
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(""); setDateTo(""); }}
                  className="text-xs text-white/40 hover:text-white/70 flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" /> إعادة تعيين
                </button>
              )}
              <span className="text-white/30 text-xs mr-auto">{filtered.length} حركة</span>
            </div>

            {/* جدول الحركات */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-right text-white/80 whitespace-nowrap">
                <thead className="bg-white/5 border-b border-white/10 sticky top-0">
                  <tr>
                    <th className="p-3 font-semibold text-white/60 text-sm">التاريخ</th>
                    <th className="p-3 font-semibold text-white/60 text-sm">البيان</th>
                    <th className="p-3 font-semibold text-white/60 text-sm">مرجع</th>
                    <th className="p-3 font-semibold text-center text-emerald-400 text-sm">مدين (له)</th>
                    <th className="p-3 font-semibold text-center text-red-400 text-sm">دائن (عليه)</th>
                    <th className="p-3 font-semibold text-center text-white/60 text-sm">الرصيد</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={6} className="p-12 text-center text-white/30">لا توجد حركات</td></tr>
                  ) : (
                    filtered.map((row, i) => {
                      const cfg = rowTypeConfig[row.type] ?? { label: row.type, icon: "•", credit_color: "text-red-400", debit_color: "text-emerald-400" };
                      return (
                        <tr key={i} className="border-b border-white/5 erp-table-row">
                          <td className="p-3 text-white/50 tabular-nums text-sm">{row.date ? formatDate(row.date) : "—"}</td>
                          <td className="p-3 font-medium text-sm">
                            <span className="ml-1">{cfg.icon}</span>
                            <span className="text-white/70">{row.description}</span>
                          </td>
                          <td className="p-3 text-white/30 font-mono text-xs">{row.reference_no ?? "—"}</td>
                          <td className={`p-3 text-center font-bold text-sm ${row.debit > 0 ? cfg.debit_color : "text-white/20"}`}>
                            {row.debit > 0 ? formatCurrency(row.debit) : "—"}
                          </td>
                          <td className={`p-3 text-center font-bold text-sm ${row.credit > 0 ? cfg.credit_color : "text-white/20"}`}>
                            {row.credit > 0 ? formatCurrency(row.credit) : "—"}
                          </td>
                          <td className={`p-3 text-center font-black text-sm ${row.balance > 0 ? "text-yellow-400" : row.balance < 0 ? "text-violet-400" : "text-white/30"}`}>
                            {row.balance !== 0
                              ? `${formatCurrency(Math.abs(row.balance))} ${row.balance > 0 ? "عليه" : "له"}`
                              : "صفر"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {filtered.length > 0 && (
                  <tfoot className="bg-white/5 border-t border-white/10">
                    <tr>
                      <td colSpan={3} className="p-3 text-white/60 font-bold text-sm">الرصيد النهائي</td>
                      <td className="p-3 text-center font-black text-emerald-400">{formatCurrency(filtered.reduce((s, r) => s + r.debit, 0))}</td>
                      <td className="p-3 text-center font-black text-red-400">{formatCurrency(filtered.reduce((s, r) => s + r.credit, 0))}</td>
                      <td className={`p-3 text-center font-black ${closingBalance >= 0 ? "text-yellow-400" : "text-violet-400"}`}>
                        {formatCurrency(Math.abs(closingBalance))} {closingBalance >= 0 ? "عليه" : "له"}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
