import { useState } from "react";
import { useGetSuppliers, useCreateSupplier, useCreateSupplierPayment } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import { Plus, Search, DollarSign } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Suppliers() {
  const { data: suppliers = [], isLoading } = useGetSuppliers();
  const createMutation = useCreateSupplier();
  const paymentMutation = useCreateSupplierPayment();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showPayment, setShowPayment] = useState<number | null>(null);

  const [formData, setFormData] = useState({ name: "", phone: "", balance: 0 });
  const [paymentData, setPaymentData] = useState({ amount: 0, description: "" });

  const filtered = suppliers.filter(s => s.name.includes(search) || (s.phone && s.phone.includes(search)));

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ data: formData }, {
      onSuccess: () => {
        toast({ title: "تم إضافة المورد بنجاح" });
        queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
        setShowAdd(false);
        setFormData({ name: "", phone: "", balance: 0 });
      }
    });
  };

  const handlePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!showPayment) return;
    paymentMutation.mutate({ id: showPayment, data: paymentData }, {
      onSuccess: () => {
        toast({ title: "تم تسجيل الدفعة بنجاح" });
        queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
        setShowPayment(null);
        setPaymentData({ amount: 0, description: "" });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative w-full max-w-md">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
          <input 
            type="text" 
            placeholder="بحث عن مورد..." 
            className="glass-input pl-4 pr-12 w-full"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button 
          onClick={() => setShowAdd(true)}
          className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-primary/20"
        >
          <Plus className="w-5 h-5" /> إضافة مورد
        </button>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form onSubmit={handleAdd} className="glass-panel rounded-3xl p-8 w-full max-w-md animate-in zoom-in-95">
            <h3 className="text-2xl font-bold text-white mb-6">مورد جديد</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-white/70 text-sm mb-1">اسم المورد</label>
                <input required type="text" className="glass-input" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-1">رقم الهاتف</label>
                <input type="text" className="glass-input" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-1">الرصيد الافتتاحي (له)</label>
                <input required type="number" step="0.01" className="glass-input" value={formData.balance || ''} onChange={e => setFormData({...formData, balance: parseFloat(e.target.value)})} />
              </div>
            </div>
            <div className="flex gap-4 mt-8">
              <button type="submit" disabled={createMutation.isPending} className="flex-1 bg-primary text-white py-3 rounded-xl font-bold hover:bg-primary/90 transition-colors">حفظ</button>
              <button type="button" onClick={() => setShowAdd(false)} className="flex-1 bg-white/10 text-white py-3 rounded-xl font-bold hover:bg-white/20 transition-colors">إلغاء</button>
            </div>
          </form>
        </div>
      )}

      {showPayment !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form onSubmit={handlePayment} className="glass-panel rounded-3xl p-8 w-full max-w-md animate-in zoom-in-95">
            <h3 className="text-2xl font-bold text-white mb-6">سند صرف (دفع למورد)</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-white/70 text-sm mb-1">المبلغ المدفوع</label>
                <input required type="number" step="0.01" className="glass-input" value={paymentData.amount || ''} onChange={e => setPaymentData({...paymentData, amount: parseFloat(e.target.value)})} />
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-1">البيان (اختياري)</label>
                <input type="text" className="glass-input" value={paymentData.description} onChange={e => setPaymentData({...paymentData, description: e.target.value})} />
              </div>
            </div>
            <div className="flex gap-4 mt-8">
              <button type="submit" disabled={paymentMutation.isPending} className="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20">تأكيد الدفع</button>
              <button type="button" onClick={() => setShowPayment(null)} className="flex-1 bg-white/10 text-white py-3 rounded-xl font-bold hover:bg-white/20 transition-colors">إلغاء</button>
            </div>
          </form>
        </div>
      )}

      <div className="glass-panel rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-white/80 whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-4 font-medium">المورد</th>
                <th className="p-4 font-medium">رقم الهاتف</th>
                <th className="p-4 font-medium">الرصيد المستحق (له)</th>
                <th className="p-4 font-medium w-32">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={4} className="p-8 text-center text-white/50">جاري التحميل...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-white/50">لا يوجد موردون</td></tr>
              ) : (
                filtered.map(supplier => (
                  <tr key={supplier.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="p-4 font-bold text-white">{supplier.name}</td>
                    <td className="p-4">{supplier.phone || '-'}</td>
                    <td className={`p-4 font-bold ${supplier.balance > 0 ? 'text-red-400' : 'text-white/50'}`}>
                      {formatCurrency(supplier.balance)}
                    </td>
                    <td className="p-4">
                      <button 
                        onClick={() => setShowPayment(supplier.id)}
                        disabled={supplier.balance <= 0}
                        className="flex items-center gap-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed border border-red-500/30"
                      >
                        <DollarSign className="w-4 h-4" /> دفع دفعة
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
