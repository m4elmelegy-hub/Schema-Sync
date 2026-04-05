/**
 * PaymentModal — سند صرف
 * Orange/red theme | Calls /api/payment-vouchers
 */
import { useState, useMemo } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetSettingsSafes } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { SearchableSelect } from "@/components/searchable-select";
import { ArrowUpFromLine, X } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api  = (p: string) => `${BASE}${p}`;
const today = () => new Date().toISOString().split("T")[0];

interface Customer { id: number; name: string; balance: number; customer_code?: number | null; }

type PaymentReason = "مصروف عام" | "دفع لمورد" | "مرتجع لعميل" | "أخرى";

const REASONS: PaymentReason[] = ["مصروف عام", "دفع لمورد", "مرتجع لعميل", "أخرى"];

interface Props { onClose: () => void; }

export default function PaymentModal({ onClose }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: safes = [] } = useGetSettingsSafes();
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    queryFn: () => authFetch(api("/api/customers")).then(r => r.json()),
  });

  const [reason, setReason] = useState<PaymentReason>("مصروف عام");
  const [form, setForm] = useState({
    customer_id: "", party_name: "", safe_id: "", amount: "", notes: "", date: today(),
  });

  const customerItems = useMemo(() => customers.map(c => ({
    value: String(c.id),
    label: `${c.customer_code ? `[${c.customer_code}] ` : ""}${c.name}`,
    searchKeys: [String(c.customer_code ?? ""), c.name],
  })), [customers]);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["/api/payment-vouchers"] });
    qc.invalidateQueries({ queryKey: ["/api/settings/safes"] });
    qc.invalidateQueries({ queryKey: ["/api/customers"] });
  }

  const paymentMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      authFetch(api("/api/payment-vouchers"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then(async r => { if (!r.ok) { const e = await r.json(); throw new Error(e.error || "خطأ"); } return r.json(); }),
    onSuccess: () => { invalidate(); toast({ title: "✅ تم حفظ سند الصرف" }); onClose(); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.safe_id || !form.amount) {
      toast({ title: "اختر الخزينة وأدخل المبلغ", variant: "destructive" }); return;
    }
    const cust = customers.find(c => String(c.id) === form.customer_id);
    const name = cust?.name || form.party_name || "";
    if (!name) { toast({ title: "أدخل اسم الطرف المستفيد", variant: "destructive" }); return; }

    paymentMut.mutate({
      customer_id: form.customer_id ? parseInt(form.customer_id) : undefined,
      customer_name: name,
      safe_id: parseInt(form.safe_id),
      amount: parseFloat(form.amount),
      notes: [reason !== "أخرى" ? reason : "", form.notes].filter(Boolean).join(" — ") || undefined,
      date: form.date,
    });
  };

  const reasonColors: Record<PaymentReason, string> = {
    "مصروف عام":    "selected:bg-orange-500 border-orange-500/40 text-orange-400",
    "دفع لمورد":   "selected:bg-red-500 border-red-500/40 text-red-400",
    "مرتجع لعميل": "selected:bg-amber-500 border-amber-500/40 text-amber-400",
    "أخرى":        "selected:bg-white/20 border-white/20 text-white/60",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <form onSubmit={handleSubmit}
        className="relative w-full max-w-md rounded-3xl p-7 space-y-5 shadow-2xl border border-orange-500/30 bg-[#1f1408]">

        {/* Close */}
        <button type="button" onClick={onClose}
          className="absolute top-4 left-4 text-white/30 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-orange-500/15 border border-orange-500/30">
            <ArrowUpFromLine className="w-6 h-6 text-orange-400" />
          </div>
          <div>
            <h3 className="text-lg font-black text-orange-400">سند صرف</h3>
            <p className="text-white/30 text-xs">صرف مبلغ من الخزينة</p>
          </div>
        </div>

        {/* Reason selector */}
        <div>
          <label className="block text-white/50 text-xs mb-2 font-semibold tracking-wider uppercase">سبب الصرف</label>
          <div className="grid grid-cols-2 gap-2">
            {REASONS.map(r => (
              <button key={r} type="button" onClick={() => setReason(r)}
                className={`py-2.5 rounded-xl text-sm font-bold border transition-all ${
                  reason === r
                    ? "bg-orange-500 text-black border-orange-500 shadow-lg shadow-orange-500/20"
                    : "bg-white/5 text-white/50 border-white/10 hover:border-orange-500/40 hover:text-white/80"
                }`}>{r}</button>
            ))}
          </div>
        </div>

        {/* Party */}
        <div>
          <label className="block text-white/50 text-xs mb-1.5 font-medium">الطرف المستفيد *</label>
          <SearchableSelect items={customerItems} value={form.customer_id}
            onChange={v => setForm(f => ({ ...f, customer_id: v, party_name: "" }))}
            placeholder="ابحث عن عميل / مورد..." emptyLabel="-- غير مرتبط بعميل --" />
          {!form.customer_id && (
            <input type="text" className="glass-input w-full mt-2 text-sm" placeholder="أو اكتب الاسم يدوياً..."
              value={form.party_name} onChange={e => setForm(f => ({ ...f, party_name: e.target.value }))} />
          )}
        </div>

        {/* Safe */}
        <div>
          <label className="block text-white/50 text-xs mb-1.5 font-medium">الخزينة الصارفة *</label>
          <select required className="glass-input w-full text-sm" value={form.safe_id}
            onChange={e => setForm(f => ({ ...f, safe_id: e.target.value }))}>
            <option value="">-- اختر الخزينة --</option>
            {safes.map(s => <option key={s.id} value={s.id}>{s.name} ({formatCurrency(Number(s.balance))})</option>)}
          </select>
        </div>

        {/* Amount + Date */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-white/50 text-xs mb-1.5 font-medium">المبلغ (ج.م) *</label>
            <input required type="number" step="0.01" min="0.01" className="glass-input w-full text-sm"
              placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <div>
            <label className="block text-white/50 text-xs mb-1.5 font-medium">التاريخ</label>
            <input type="date" className="glass-input w-full text-sm" value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-white/50 text-xs mb-1.5 font-medium">ملاحظات إضافية</label>
          <input type="text" className="glass-input w-full text-sm" placeholder="اختياري..."
            value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>

        <button type="submit" disabled={paymentMut.isPending}
          className="w-full py-3.5 rounded-2xl font-black text-sm transition-all bg-orange-500 text-black hover:bg-orange-400 disabled:opacity-50 shadow-lg shadow-orange-500/20">
          {paymentMut.isPending ? "جاري الحفظ..." : "حفظ سند الصرف"}
        </button>
      </form>
    </div>
  );
}
