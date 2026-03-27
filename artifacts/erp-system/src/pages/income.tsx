import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDeleteIncome, useGetSettingsSafes } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

interface Income {
  id: number; source: string; amount: number;
  description: string | null; safe_id: number | null; safe_name: string | null;
  created_at: string;
}

export default function Income() {
  const { data: incomeList = [], isLoading } = useQuery<Income[]>({
    queryKey: ["/api/income"],
    queryFn: () => fetch(api("/api/income")).then(r => r.json()),
  });
  const { data: safes = [] } = useGetSettingsSafes();
  const deleteMutation = useDeleteIncome();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [showAdd, setShowAdd] = useState(false);
  const [formData, setFormData] = useState({ source: "", amount: "", description: "", safe_id: "" });

  const createMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(api("/api/income"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "خطأ"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "تم إضافة الإيراد بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/income"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/safes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/financial-transactions"] });
      setShowAdd(false);
      setFormData({ source: "", amount: "", description: "", safe_id: "" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = { source: formData.source, amount: parseFloat(formData.amount), description: formData.description || undefined };
    if (formData.safe_id) body.safe_id = parseInt(formData.safe_id);
    createMutation.mutate(body);
  };

  const handleDelete = (id: number) => {
    if (confirm("هل أنت متأكد من حذف هذا الإيراد؟")) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => {
          toast({ title: "تم الحذف بنجاح" });
          queryClient.invalidateQueries({ queryKey: ["/api/income"] });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
          queryClient.invalidateQueries({ queryKey: ["/api/settings/safes"] });
        }
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-white">إدارة الإيرادات الإضافية</h2>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold">
          <Plus className="w-5 h-5" /> إضافة إيراد
        </button>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form onSubmit={handleAdd} className="glass-panel rounded-3xl p-8 w-full max-w-md animate-in zoom-in-95 space-y-4">
            <h3 className="text-2xl font-bold text-white">إيراد جديد</h3>
            <div>
              <label className="block text-white/70 text-sm mb-1">المصدر (مثال: عمولة، استثمار) *</label>
              <input required type="text" className="glass-input w-full" value={formData.source} onChange={e => setFormData({...formData, source: e.target.value})} />
            </div>
            <div>
              <label className="block text-white/70 text-sm mb-1">المبلغ (ج.م) *</label>
              <input required type="number" step="0.01" min="0.01" className="glass-input w-full" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} />
            </div>
            <div>
              <label className="block text-white/70 text-sm mb-1">الخزينة المستلِمة</label>
              <select className="glass-input w-full" value={formData.safe_id} onChange={e => setFormData({...formData, safe_id: e.target.value})}>
                <option value="">-- بدون خزينة --</option>
                {safes.map(s => <option key={s.id} value={s.id}>{s.name} ({formatCurrency(Number(s.balance))})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-white/70 text-sm mb-1">التفاصيل (اختياري)</label>
              <input type="text" className="glass-input w-full" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
            </div>
            <div className="flex gap-4 pt-2">
              <button type="submit" disabled={createMutation.isPending} className="flex-1 btn-primary py-3 rounded-xl font-bold">{createMutation.isPending ? "جاري الحفظ..." : "حفظ"}</button>
              <button type="button" onClick={() => setShowAdd(false)} className="flex-1 bg-white/10 text-white py-3 rounded-xl font-bold hover:bg-white/20">إلغاء</button>
            </div>
          </form>
        </div>
      )}

      <div className="glass-panel rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-white/80 whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-4 font-medium">المصدر</th>
                <th className="p-4 font-medium">المبلغ</th>
                <th className="p-4 font-medium">الخزينة</th>
                <th className="p-4 font-medium">التفاصيل</th>
                <th className="p-4 font-medium">التاريخ</th>
                <th className="p-4 font-medium w-16"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="p-8 text-center text-white/50">جاري التحميل...</td></tr>
              ) : incomeList.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-white/50">لا توجد إيرادات</td></tr>
              ) : (
                incomeList.map(inc => (
                  <tr key={inc.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="p-4 font-bold text-white">{inc.source}</td>
                    <td className="p-4 font-bold text-emerald-400">{formatCurrency(inc.amount)}</td>
                    <td className="p-4 text-blue-300 text-sm">{inc.safe_name || '—'}</td>
                    <td className="p-4 text-white/70">{inc.description || '-'}</td>
                    <td className="p-4 text-sm text-white/60">{formatDate(inc.created_at)}</td>
                    <td className="p-4">
                      <button onClick={() => handleDelete(inc.id)} className="text-red-400 hover:text-red-300 transition-colors p-2 hover:bg-red-400/10 rounded-lg">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
