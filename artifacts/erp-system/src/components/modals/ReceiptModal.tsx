/**
 * ReceiptModal — سند قبض
 * Green theme | Calls /api/receipt-vouchers OR /api/deposit-vouchers
 */
import { useState, useMemo } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetSettingsSafes } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { SearchableSelect } from "@/components/searchable-select";
import { HandCoins, X } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api  = (p: string) => `${BASE}${p}`;
const today = () => new Date().toISOString().split("T")[0];

interface Customer { id: number; name: string; balance: number; customer_code?: number | null; }

type ReceiptSource = "عميل" | "توريد";

interface Props { onClose: () => void; }

export default function ReceiptModal({ onClose }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: safes = [] } = useGetSettingsSafes();
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    queryFn: () => authFetch(api("/api/customers")).then(r => r.json()),
  });

  const [source, setSource] = useState<ReceiptSource>("عميل");
  const [form, setForm] = useState({
    customer_id: "", party_name: "", safe_id: "", amount: "", notes: "", date: today(),
  });

  const customerItems = useMemo(() => customers.map(c => ({
    value: String(c.id),
    label: `${c.customer_code ? `[${c.customer_code}] ` : ""}${c.name}${Number(c.balance) > 0 ? ` — دين: ${formatCurrency(c.balance)}` : ""}`,
    searchKeys: [String(c.customer_code ?? ""), c.name],
  })), [customers]);

  const selectedCustomer = customers.find(c => String(c.id) === form.customer_id);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["/api/receipt-vouchers"] });
    qc.invalidateQueries({ queryKey: ["/api/deposit-vouchers"] });
    qc.invalidateQueries({ queryKey: ["/api/settings/safes"] });
    qc.invalidateQueries({ queryKey: ["/api/customers"] });
  }

  const receiptMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      authFetch(api("/api/receipt-vouchers"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then(async r => { if (!r.ok) { const e = await r.json(); throw new Error(e.error || "خطأ"); } return r.json(); }),
    onSuccess: () => { invalidate(); toast({ title: "✅ تم حفظ سند القبض" }); onClose(); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const depositMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      authFetch(api("/api/deposit-vouchers"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then(async r => { if (!r.ok) { const e = await r.json(); throw new Error(e.error || "خطأ"); } return r.json(); }),
    onSuccess: () => { invalidate(); toast({ title: "✅ تم حفظ سند التوريد" }); onClose(); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const isPending = receiptMut.isPending || depositMut.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.safe_id || !form.amount) {
      toast({ title: "اختر الخزينة وأدخل المبلغ", variant: "destructive" }); return;
    }
    const amount = parseFloat(form.amount);
    const cust   = customers.find(c => String(c.id) === form.customer_id);

    if (source === "عميل") {
      if (!form.customer_id) { toast({ title: "اختر العميل", variant: "destructive" }); return; }
      receiptMut.mutate({
        customer_id: parseInt(form.customer_id),
        customer_name: cust?.name ?? "",
        safe_id: parseInt(form.safe_id), amount, notes: form.notes || undefined, date: form.date,
      });
    } else {
      depositMut.mutate({
        customer_id: form.customer_id ? parseInt(form.customer_id) : undefined,
        customer_name: cust?.name || form.party_name || undefined,
        safe_id: parseInt(form.safe_id), amount, notes: form.notes || undefined, date: form.date,
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <form onSubmit={handleSubmit}
        className="relative w-full max-w-md rounded-3xl p-7 space-y-5 shadow-2xl border border-emerald-500/30 bg-[#0f1f18]">

        {/* Close */}
        <button type="button" onClick={onClose}
          className="absolute top-4 left-4 text-white/30 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-emerald-500/15 border border-emerald-500/30">
            <HandCoins className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-lg font-black text-emerald-400">سند قبض</h3>
            <p className="text-white/30 text-xs">استلام مبلغ وإضافته للخزينة</p>
          </div>
        </div>

        {/* Source selector */}
        <div>
          <label className="block text-white/50 text-xs mb-2 font-semibold tracking-wider uppercase">مصدر القبض</label>
          <div className="grid grid-cols-2 gap-2">
            {(["عميل", "توريد"] as ReceiptSource[]).map(s => (
              <button key={s} type="button"
                onClick={() => { setSource(s); setForm(f => ({ ...f, customer_id: "", party_name: "" })); }}
                className={`py-2.5 rounded-xl text-sm font-bold border transition-all ${
                  source === s
                    ? "bg-emerald-500 text-black border-emerald-500 shadow-lg shadow-emerald-500/20"
                    : "bg-white/5 text-white/50 border-white/10 hover:border-emerald-500/40 hover:text-white/80"
                }`}>{s}</button>
            ))}
          </div>
          <p className="text-white/25 text-xs mt-1.5">
            {source === "عميل" ? "العميل يسدد دينه ← الخزينة ترتفع، رصيده ينزل"
                               : "توريد نقدي (عميل أو طرف آخر) ← الخزينة ترتفع"}
          </p>
        </div>

        {/* Party */}
        {source === "عميل" ? (
          <div>
            <label className="block text-white/50 text-xs mb-1.5 font-medium">العميل *</label>
            <SearchableSelect items={customerItems} value={form.customer_id}
              onChange={v => setForm(f => ({ ...f, customer_id: v }))}
              placeholder="ابحث باسم أو كود..." emptyLabel="-- اختر العميل --" clearable={false} />
            {selectedCustomer && (
              <p className="text-xs mt-1 text-amber-400 font-medium">
                دين العميل الحالي: {formatCurrency(selectedCustomer.balance)}
              </p>
            )}
          </div>
        ) : (
          <div>
            <label className="block text-white/50 text-xs mb-1.5 font-medium">الطرف المورِّد (اختياري)</label>
            <SearchableSelect items={customerItems} value={form.customer_id}
              onChange={v => setForm(f => ({ ...f, customer_id: v, party_name: "" }))}
              placeholder="ابحث عن عميل..." emptyLabel="-- غير مرتبط بعميل --" />
            {!form.customer_id && (
              <input type="text" className="glass-input w-full mt-2 text-sm" placeholder="أو اكتب الاسم يدوياً..."
                value={form.party_name} onChange={e => setForm(f => ({ ...f, party_name: e.target.value }))} />
            )}
          </div>
        )}

        {/* Safe */}
        <div>
          <label className="block text-white/50 text-xs mb-1.5 font-medium">الخزينة المستلِمة *</label>
          <select required className="glass-input w-full text-sm" value={form.safe_id}
            onChange={e => setForm(f => ({ ...f, safe_id: e.target.value }))}>
            <option value="">-- اختر الخزينة --</option>
            {safes.map(s => <option key={s.id} value={s.id}>{s.name} ({formatCurrency(Number(s.balance))})</option>)}
          </select>
        </div>

        {/* Amount + Date row */}
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
          <label className="block text-white/50 text-xs mb-1.5 font-medium">ملاحظات</label>
          <input type="text" className="glass-input w-full text-sm" placeholder="اختياري..."
            value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>

        {/* Submit */}
        <button type="submit" disabled={isPending}
          className="w-full py-3.5 rounded-2xl font-black text-sm transition-all bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-50 shadow-lg shadow-emerald-500/20">
          {isPending ? "جاري الحفظ..." : "حفظ سند القبض"}
        </button>
      </form>
    </div>
  );
}
