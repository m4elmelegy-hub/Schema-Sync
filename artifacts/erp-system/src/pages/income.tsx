import { useState } from "react";
import { useGetIncome, useCreateIncome, useDeleteIncome } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Plus, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Income() {
  const { data: incomeList = [], isLoading } = useGetIncome();
  const createMutation = useCreateIncome();
  const deleteMutation = useDeleteIncome();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [showAdd, setShowAdd] = useState(false);
  const [formData, setFormData] = useState({ source: "", amount: 0, description: "" });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ data: formData }, {
      onSuccess: () => {
        toast({ title: "تم إضافة الإيراد بنجاح" });
        queryClient.invalidateQueries({ queryKey: ["/api/income"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
        setShowAdd(false);
        setFormData({ source: "", amount: 0, description: "" });
      }
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("هل أنت متأكد من حذف هذا الإيراد؟")) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => {
          toast({ title: "تم الحذف بنجاح" });
          queryClient.invalidateQueries({ queryKey: ["/api/income"] });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
        }
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-white">إدارة الإيرادات الإضافية</h2>
        <button 
          onClick={() => setShowAdd(true)}
          className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-primary/20"
        >
          <Plus className="w-5 h-5" /> إضافة إيراد
        </button>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form onSubmit={handleAdd} className="glass-panel rounded-3xl p-8 w-full max-w-md animate-in zoom-in-95">
            <h3 className="text-2xl font-bold text-white mb-6">إيراد جديد</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-white/70 text-sm mb-1">المصدر (مثال: عمولة، استثمار)</label>
                <input required type="text" className="glass-input" value={formData.source} onChange={e => setFormData({...formData, source: e.target.value})} />
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-1">المبلغ</label>
                <input required type="number" step="0.01" className="glass-input" value={formData.amount || ''} onChange={e => setFormData({...formData, amount: parseFloat(e.target.value)})} />
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-1">التفاصيل (اختياري)</label>
                <input type="text" className="glass-input" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
              </div>
            </div>
            <div className="flex gap-4 mt-8">
              <button type="submit" disabled={createMutation.isPending} className="flex-1 bg-primary text-white py-3 rounded-xl font-bold hover:bg-primary/90 transition-colors">حفظ</button>
              <button type="button" onClick={() => setShowAdd(false)} className="flex-1 bg-white/10 text-white py-3 rounded-xl font-bold hover:bg-white/20 transition-colors">إلغاء</button>
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
                <th className="p-4 font-medium">التفاصيل</th>
                <th className="p-4 font-medium">التاريخ</th>
                <th className="p-4 font-medium w-16"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="p-8 text-center text-white/50">جاري التحميل...</td></tr>
              ) : incomeList.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-white/50">لا توجد إيرادات</td></tr>
              ) : (
                incomeList.map(inc => (
                  <tr key={inc.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="p-4 font-bold text-white">{inc.source}</td>
                    <td className="p-4 font-bold text-emerald-400">{formatCurrency(inc.amount)}</td>
                    <td className="p-4">{inc.description || '-'}</td>
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
