/**
 * ReceiptModal — سند قبض
 * Minimal: customer + safe + amount + date + notes
 */
import { useState, useMemo, useEffect } from "react";
import { safeArray } from "@/lib/safe-data";
import { authFetch } from "@/lib/auth-fetch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetSettingsSafes } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { SearchableSelect } from "@/components/searchable-select";
import { HandCoins, X } from "lucide-react";
import { useAuth } from "@/contexts/auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api  = (p: string) => `${BASE}${p}`;
const today = () => new Date().toISOString().split("T")[0];

interface Customer { id: number; name: string; balance: number; customer_code?: number | null; }
interface Props { onClose: () => void; }

export default function ReceiptModal({ onClose }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: safesRaw } = useGetSettingsSafes();
  const allSafes = safeArray(safesRaw);
  const isScopedRole = user?.role === "cashier" || user?.role === "salesperson";
  const safes = isScopedRole && user?.safe_id
    ? allSafes.filter((s: any) => s.id === user.safe_id)
    : allSafes;
  const { data: customersRaw } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    queryFn: () => authFetch(api("/api/customers")).then(async r => { if (!r.ok) throw new Error(`API Error: ${r.status}`); return r.json(); }),
  });
  const customers = safeArray(customersRaw);

  const [form, setForm] = useState({
    customer_id: "", safe_id: "", amount: "", notes: "", date: today(),
  });

  // Auto-select sole safe for cashier/salesperson
  useEffect(() => {
    if (safes.length === 1 && !form.safe_id) {
      setForm(f => ({ ...f, safe_id: String(safes[0].id) }));
    }
  }, [safes.length]);

  const customerItems = useMemo(() => customers.map(c => ({
    value: String(c.id),
    label: `${c.customer_code ? `[${c.customer_code}] ` : ""}${c.name}${Number(c.balance) > 0 ? ` — دين: ${formatCurrency(c.balance)}` : ""}`,
    searchKeys: [String(c.customer_code ?? ""), c.name],
  })), [customers]);

  const selectedCustomer = customers.find(c => String(c.id) === form.customer_id);

  const mut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      authFetch(api("/api/receipt-vouchers"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(async r => { if (!r.ok) { const e = await r.json(); throw new Error(e.error || "خطأ"); } return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/receipt-vouchers"] });
      qc.invalidateQueries({ queryKey: ["/api/settings/safes"] });
      qc.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: "✅ تم حفظ سند القبض" });
      onClose();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customer_id) { toast({ title: "اختر العميل", variant: "destructive" }); return; }
    if (!form.safe_id)     { toast({ title: "اختر الخزينة", variant: "destructive" }); return; }
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) { toast({ title: "أدخل مبلغاً أكبر من صفر", variant: "destructive" }); return; }

    const cust = customers.find(c => String(c.id) === form.customer_id);
    mut.mutate({
      customer_id:   parseInt(form.customer_id),
      customer_name: cust?.name ?? "",
      safe_id:       parseInt(form.safe_id),
      amount,
      date:          form.date,
      notes:         form.notes || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <form onSubmit={handleSubmit}
        className="relative w-full max-w-sm rounded-3xl p-7 space-y-4 shadow-2xl border border-emerald-500/30 bg-[#0f1f18]">

        <button type="button" onClick={onClose}
          className="absolute top-4 left-4 text-white/30 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-emerald-500/15 border border-emerald-500/30">
            <HandCoins className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-lg font-black text-emerald-400">سند قبض</h3>
            <p className="text-white/30 text-xs">استلام مبلغ من عميل</p>
          </div>
        </div>

        <div>
          <label className="block text-white/50 text-xs mb-1.5 font-medium">العميل *</label>
          <SearchableSelect items={customerItems} value={form.customer_id}
            onChange={v => setForm(f => ({ ...f, customer_id: v }))}
            placeholder="ابحث باسم أو كود..." emptyLabel="-- اختر العميل --" clearable={false} />
          {selectedCustomer && Number(selectedCustomer.balance) > 0 && (
            <p className="text-xs mt-1 text-amber-400">دين العميل: {formatCurrency(selectedCustomer.balance)}</p>
          )}
        </div>

        <div>
          <label className="block text-white/50 text-xs mb-1.5 font-medium">الخزينة *</label>
          <select required className="glass-input w-full text-sm" value={form.safe_id}
            onChange={e => setForm(f => ({ ...f, safe_id: e.target.value }))}>
            <option value="">-- اختر الخزينة --</option>
            {safes.map(s => <option key={s.id} value={s.id}>{s.name} ({formatCurrency(Number(s.balance))})</option>)}
          </select>
        </div>

        <div>
          <label className="block text-white/50 text-xs mb-1.5 font-medium">المبلغ (ج.م) *</label>
          <input required type="number" step="0.01" min="0.01" className="glass-input w-full text-sm"
            placeholder="0.00" value={form.amount}
            onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
        </div>

        <div>
          <label className="block text-white/50 text-xs mb-1.5 font-medium">التاريخ</label>
          <input type="date" className="glass-input w-full text-sm" value={form.date}
            onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
        </div>

        <div>
          <label className="block text-white/50 text-xs mb-1.5 font-medium">ملاحظات</label>
          <input type="text" className="glass-input w-full text-sm" placeholder="اختياري..."
            value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>

        <button type="submit" disabled={mut.isPending}
          className="w-full py-3.5 rounded-2xl font-black text-sm bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-50 transition-all shadow-lg shadow-emerald-500/20">
          {mut.isPending ? "جاري الحفظ..." : "حفظ سند القبض"}
        </button>
      </form>
    </div>
  );
}
