/**
 * TransferModal — تحويل بين الخزائن
 * Purple theme | Calls /api/safe-transfers
 */
import { useState } from "react";
import { safeArray } from "@/lib/safe-data";
import { authFetch } from "@/lib/auth-fetch";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetSettingsSafes } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeftRight, X, ArrowRight } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api  = (p: string) => `${BASE}${p}`;
const today = () => new Date().toISOString().split("T")[0];

interface Props { onClose: () => void; }

export default function TransferModal({ onClose }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: safesRaw } = useGetSettingsSafes();
  const safes = safeArray(safesRaw);

  const [form, setForm] = useState({
    from_safe_id: "", to_safe_id: "", amount: "", notes: "", date: today(),
  });

  const fromSafe = safes.find(s => String(s.id) === form.from_safe_id);
  const toSafe   = safes.find(s => String(s.id) === form.to_safe_id);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["/api/safe-transfers"] });
    qc.invalidateQueries({ queryKey: ["/api/settings/safes"] });
  }

  const transferMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      authFetch(api("/api/safe-transfers"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then(async r => { if (!r.ok) { const e = await r.json(); throw new Error(e.error || "خطأ"); } return r.json(); }),
    onSuccess: () => { invalidate(); toast({ title: "✅ تم التحويل بنجاح" }); onClose(); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.from_safe_id || !form.to_safe_id) {
      toast({ title: "اختر خزينتَي التحويل", variant: "destructive" }); return;
    }
    if (form.from_safe_id === form.to_safe_id) {
      toast({ title: "لا يمكن التحويل من وإلى نفس الخزينة", variant: "destructive" }); return;
    }
    if (!form.amount) {
      toast({ title: "أدخل المبلغ", variant: "destructive" }); return;
    }
    transferMut.mutate({
      from_safe_id: parseInt(form.from_safe_id),
      to_safe_id:   parseInt(form.to_safe_id),
      amount:       parseFloat(form.amount),
      notes:        form.notes || undefined,
      date:         form.date,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <form onSubmit={handleSubmit}
        className="relative w-full max-w-md rounded-3xl p-7 space-y-5 shadow-2xl border border-violet-500/30 bg-[#130f1f]">

        {/* Close */}
        <button type="button" onClick={onClose}
          className="absolute top-4 left-4 text-white/30 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-violet-500/15 border border-violet-500/30">
            <ArrowLeftRight className="w-6 h-6 text-violet-400" />
          </div>
          <div>
            <h3 className="text-lg font-black text-violet-400">تحويل بين الخزائن</h3>
            <p className="text-white/30 text-xs">نقل رصيد من خزينة إلى أخرى</p>
          </div>
        </div>

        {/* Transfer visualization */}
        {(fromSafe || toSafe) && (
          <div className="flex items-center gap-3 bg-violet-500/10 border border-violet-500/20 rounded-2xl px-4 py-3">
            <div className="flex-1 text-center">
              <p className="text-white/40 text-xs">من</p>
              <p className="text-violet-400 font-bold text-sm">{fromSafe?.name || "—"}</p>
              {fromSafe && <p className="text-white/30 text-xs">{formatCurrency(Number(fromSafe.balance))}</p>}
            </div>
            <ArrowRight className="w-5 h-5 text-violet-500 shrink-0" />
            <div className="flex-1 text-center">
              <p className="text-white/40 text-xs">إلى</p>
              <p className="text-violet-400 font-bold text-sm">{toSafe?.name || "—"}</p>
              {toSafe && <p className="text-white/30 text-xs">{formatCurrency(Number(toSafe.balance))}</p>}
            </div>
          </div>
        )}

        {/* From safe */}
        <div>
          <label className="block text-white/50 text-xs mb-1.5 font-medium">من الخزينة *</label>
          <select required className="glass-input w-full text-sm" value={form.from_safe_id}
            onChange={e => setForm(f => ({ ...f, from_safe_id: e.target.value }))}>
            <option value="">-- اختر الخزينة المُحوِّلة --</option>
            {safes.map(s => <option key={s.id} value={s.id}>{s.name} ({formatCurrency(Number(s.balance))})</option>)}
          </select>
        </div>

        {/* To safe */}
        <div>
          <label className="block text-white/50 text-xs mb-1.5 font-medium">إلى الخزينة *</label>
          <select required className="glass-input w-full text-sm" value={form.to_safe_id}
            onChange={e => setForm(f => ({ ...f, to_safe_id: e.target.value }))}>
            <option value="">-- اختر الخزينة المستقبِلة --</option>
            {safes.filter(s => String(s.id) !== form.from_safe_id).map(s =>
              <option key={s.id} value={s.id}>{s.name} ({formatCurrency(Number(s.balance))})</option>
            )}
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
          <label className="block text-white/50 text-xs mb-1.5 font-medium">ملاحظات</label>
          <input type="text" className="glass-input w-full text-sm" placeholder="اختياري..."
            value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>

        <button type="submit" disabled={transferMut.isPending}
          className="w-full py-3.5 rounded-2xl font-black text-sm transition-all bg-violet-500 text-white hover:bg-violet-400 disabled:opacity-50 shadow-lg shadow-violet-500/20">
          {transferMut.isPending ? "جاري التحويل..." : "تنفيذ التحويل"}
        </button>
      </form>
    </div>
  );
}
