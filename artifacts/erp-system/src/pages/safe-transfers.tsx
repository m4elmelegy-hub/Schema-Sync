import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetSettingsSafes } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import { ArrowLeftRight, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

interface Transfer {
  id: number; type: string; safe_id: number | null; safe_name: string | null;
  amount: number; direction: string; description: string | null; date: string | null; created_at: string;
}

export default function SafeTransfers() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: safes = [] } = useGetSettingsSafes();

  const { data: transfers = [], isLoading } = useQuery<Transfer[]>({
    queryKey: ["/api/safe-transfers"],
    queryFn: () => fetch(api("/api/safe-transfers")).then(r => { if (!r.ok) throw new Error("خطأ في جلب البيانات"); return r.json(); }),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ from_safe_id: "", to_safe_id: "", amount: "", notes: "", date: new Date().toISOString().split("T")[0] });

  const createMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(api("/api/safe-transfers"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "خطأ"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "تم التحويل بنجاح" });
      qc.invalidateQueries({ queryKey: ["/api/safe-transfers"] });
      qc.invalidateQueries({ queryKey: ["/api/settings/safes"] });
      setShowAdd(false);
      setForm({ from_safe_id: "", to_safe_id: "", amount: "", notes: "", date: new Date().toISOString().split("T")[0] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.from_safe_id || !form.to_safe_id || !form.amount) { toast({ title: "الرجاء ملء جميع الحقول المطلوبة", variant: "destructive" }); return; }
    if (form.from_safe_id === form.to_safe_id) { toast({ title: "لا يمكن التحويل من وإلى نفس الخزينة", variant: "destructive" }); return; }
    createMutation.mutate({ from_safe_id: parseInt(form.from_safe_id), to_safe_id: parseInt(form.to_safe_id), amount: parseFloat(form.amount), notes: form.notes || undefined, date: form.date });
  };

  const outTransfers = transfers.filter(t => t.direction === "out" && t.type === "transfer_out");

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <ArrowLeftRight className="w-6 h-6 text-purple-400" />
          <h2 className="text-xl font-bold text-white">التحويل بين الخزائن</h2>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2 px-5 py-2.5 rounded-xl">
          <Plus className="w-4 h-4" /> تحويل جديد
        </button>
      </div>

      {/* بطاقات الخزائن */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {safes.map(s => (
          <div key={s.id} className="glass-panel rounded-2xl p-4 border border-white/5">
            <p className="text-white/50 text-xs mb-1">{s.name}</p>
            <p className="text-xl font-black text-amber-400">{formatCurrency(Number(s.balance))}</p>
          </div>
        ))}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="glass-panel rounded-3xl p-8 w-full max-w-md space-y-4 animate-in zoom-in-95">
            <h3 className="text-xl font-bold text-white mb-2">تحويل بين الخزائن</h3>
            <div>
              <label className="text-white/60 text-sm block mb-1">من الخزينة *</label>
              <select required className="glass-input w-full" value={form.from_safe_id} onChange={e => setForm(f => ({ ...f, from_safe_id: e.target.value }))}>
                <option value="">-- اختر --</option>
                {safes.map(s => <option key={s.id} value={s.id}>{s.name} ({formatCurrency(Number(s.balance))})</option>)}
              </select>
            </div>
            <div>
              <label className="text-white/60 text-sm block mb-1">إلى الخزينة *</label>
              <select required className="glass-input w-full" value={form.to_safe_id} onChange={e => setForm(f => ({ ...f, to_safe_id: e.target.value }))}>
                <option value="">-- اختر --</option>
                {safes.map(s => <option key={s.id} value={s.id}>{s.name} ({formatCurrency(Number(s.balance))})</option>)}
              </select>
            </div>
            <div>
              <label className="text-white/60 text-sm block mb-1">المبلغ (ج.م) *</label>
              <input required type="number" step="0.01" min="0.01" className="glass-input w-full" placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <label className="text-white/60 text-sm block mb-1">التاريخ</label>
              <input type="date" className="glass-input w-full" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className="text-white/60 text-sm block mb-1">ملاحظات</label>
              <input type="text" className="glass-input w-full" placeholder="اختياري" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={createMutation.isPending} className="flex-1 btn-primary py-3 rounded-xl font-bold">{createMutation.isPending ? "جاري التحويل..." : "تنفيذ التحويل"}</button>
              <button type="button" onClick={() => setShowAdd(false)} className="flex-1 bg-white/10 text-white py-3 rounded-xl font-bold hover:bg-white/20">إلغاء</button>
            </div>
          </form>
        </div>
      )}

      <div className="glass-panel rounded-3xl overflow-hidden">
        <div className="p-4 border-b border-white/10 bg-white/5">
          <h3 className="text-white/70 font-medium text-sm">سجل التحويلات</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-white/80 whitespace-nowrap">
            <thead className="border-b border-white/10">
              <tr>
                <th className="p-4 font-medium text-sm text-white/50">الخزينة</th>
                <th className="p-4 font-medium text-sm text-white/50">الاتجاه</th>
                <th className="p-4 font-medium text-sm text-white/50">المبلغ</th>
                <th className="p-4 font-medium text-sm text-white/50">البيان</th>
                <th className="p-4 font-medium text-sm text-white/50">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="p-8 text-center text-white/50">جاري التحميل...</td></tr>
              ) : outTransfers.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-white/40">لا توجد تحويلات بعد</td></tr>
              ) : outTransfers.map(t => (
                <tr key={t.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="p-4 font-bold text-white">{t.safe_name}</td>
                  <td className="p-4"><span className={`px-2 py-1 rounded-lg text-xs font-bold ${t.direction === 'out' ? 'bg-red-500/15 text-red-400 border border-red-500/20' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'}`}>{t.direction === 'out' ? '↑ صادر' : '↓ وارد'}</span></td>
                  <td className="p-4 font-bold text-amber-400">{formatCurrency(t.amount)}</td>
                  <td className="p-4 text-white/60 text-sm max-w-xs truncate">{t.description}</td>
                  <td className="p-4 text-sm text-white/50">{t.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
