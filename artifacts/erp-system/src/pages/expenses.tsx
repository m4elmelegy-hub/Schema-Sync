import { useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDeleteExpense, useGetSettingsSafes } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Plus, Trash2, ReceiptText, ShieldOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TableSkeleton } from "@/components/skeletons";
import { ConfirmModal } from "@/components/confirm-modal";
import { useAuth } from "@/contexts/auth";
import { hasPermission } from "@/lib/permissions";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

interface Expense {
  id: number; category: string; amount: number;
  description: string | null; safe_id: number | null; safe_name: string | null;
  created_at: string;
}

function AccessDenied({ msg }: { msg: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <ShieldOff className="w-14 h-14 text-red-400/40 mb-4" />
      <p className="text-white/60 font-bold text-lg">غير مصرح</p>
      <p className="text-white/30 text-sm mt-1">{msg}</p>
    </div>
  );
}

export default function Expenses() {
  const { user } = useAuth();
  const canView   = hasPermission(user, "can_view_expenses") === true;
  const isCashier = user?.role === "cashier";

  const { data: expenses = [], isLoading } = useQuery<Expense[]>({
    queryKey: ["/api/expenses"],
    queryFn: () => authFetch(api("/api/expenses")).then(r => { if (!r.ok) throw new Error("خطأ في جلب البيانات"); return r.json(); }),
  });
  const { data: safes = [] } = useGetSettingsSafes();
  const deleteMutation = useDeleteExpense();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [showAdd, setShowAdd] = useState(false);
  const [formData, setFormData] = useState({ category: "", amount: "", description: "", safe_id: "" });
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const createMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await authFetch(api("/api/expenses"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "خطأ"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "تم إضافة المصروف بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/safes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/financial-transactions"] });
      setShowAdd(false);
      setFormData({ category: "", amount: "", description: "", safe_id: "" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = { category: formData.category, amount: parseFloat(formData.amount), description: formData.description || undefined };
    if (isCashier && user?.safe_id) {
      body.safe_id = user.safe_id;
    } else if (formData.safe_id) {
      body.safe_id = parseInt(formData.safe_id);
    }
    createMutation.mutate(body);
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "تم حذف المصروف بنجاح" });
        queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
        queryClient.invalidateQueries({ queryKey: ["/api/settings/safes"] });
        setConfirmDeleteId(null);
      },
      onError: (e: Error) => {
        toast({ title: e.message, variant: "destructive" });
        setConfirmDeleteId(null);
      },
    });
  };

  if (!canView) return <AccessDenied msg="غير مصرح لك بالوصول إلى المصروفات — تواصل مع المدير لتفعيل الصلاحية" />;

  return (
    <div className="space-y-6">
      {confirmDeleteId !== null && (
        <ConfirmModal
          title="حذف المصروف"
          description="هل أنت متأكد من حذف هذا المصروف؟ سيتم عكس الحركة من الخزينة."
          isPending={deleteMutation.isPending}
          onConfirm={() => handleDelete(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-white">إدارة المصروفات</h2>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold">
          <Plus className="w-5 h-5" /> إضافة مصروف
        </button>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm modal-overlay">
          <form onSubmit={handleAdd} className="glass-panel rounded-3xl p-8 w-full max-w-md animate-in zoom-in-95 space-y-4">
            <h3 className="text-2xl font-bold text-white">مصروف جديد</h3>
            <div>
              <label className="block text-white/70 text-sm mb-1">التصنيف (مثال: رواتب، إيجار، كهرباء) *</label>
              <input required type="text" className="glass-input w-full" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} />
            </div>
            <div>
              <label className="block text-white/70 text-sm mb-1">المبلغ (ج.م) *</label>
              <input required type="number" step="0.01" min="0.01" className="glass-input w-full" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} />
            </div>
            {isCashier ? (
              <div>
                <label className="block text-white/70 text-sm mb-1">الخزينة</label>
                <div className="glass-input w-full flex items-center gap-2 opacity-70 cursor-not-allowed">
                  <span className="text-amber-300 font-bold text-sm">
                    {safes.find(s => s.id === user?.safe_id)?.name ?? "الخزينة الافتراضية"}
                  </span>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-white/70 text-sm mb-1">الخزينة المدفوع منها</label>
                <select className="glass-input w-full" value={formData.safe_id} onChange={e => setFormData({...formData, safe_id: e.target.value})}>
                  <option value="">-- بدون خزينة --</option>
                  {safes.map(s => <option key={s.id} value={s.id}>{s.name} ({formatCurrency(Number(s.balance))})</option>)}
                </select>
              </div>
            )}
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
                <th className="p-4 font-medium">التصنيف</th>
                <th className="p-4 font-medium">المبلغ</th>
                <th className="p-4 font-medium">الخزينة</th>
                <th className="p-4 font-medium">التفاصيل</th>
                <th className="p-4 font-medium">التاريخ</th>
                <th className="p-4 font-medium w-16"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeleton cols={6} rows={5} />
              ) : expenses.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-white/50">لا توجد مصروفات</td></tr>
              ) : (
                expenses.map(exp => (
                  <tr key={exp.id} className="border-b border-white/5 erp-table-row">
                    <td className="p-4 font-bold text-white">{exp.category}</td>
                    <td className="p-4 font-bold text-red-400">{formatCurrency(exp.amount)}</td>
                    <td className="p-4 text-blue-300 text-sm">{exp.safe_name || '—'}</td>
                    <td className="p-4 text-white/70">{exp.description || '-'}</td>
                    <td className="p-4 text-sm text-white/60">{formatDate(exp.created_at)}</td>
                    <td className="p-4">
                      <button onClick={() => setConfirmDeleteId(exp.id)} className="btn-icon btn-icon-danger">
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
