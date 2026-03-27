import { useState } from "react";
import { useGetSuppliers, useCreateSupplier, useCreateSupplierPayment, useGetPurchases, useGetTransactions } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Plus, Search, DollarSign, FileText, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

function SupplierReportModal({ supplierId, supplierName, onClose }: {
  supplierId: number;
  supplierName: string;
  onClose: () => void;
}) {
  const { data: allPurchases = [] } = useGetPurchases();
  const { data: transactions = [] } = useGetTransactions();

  const supplierPurchases = allPurchases.filter(p =>
    p.supplier_id === supplierId || p.supplier_name === supplierName
  );

  const paymentTxns = transactions.filter(t =>
    t.type === "payment" && t.related_id === supplierId
  );

  const totalBought = supplierPurchases.reduce((s, v) => s + v.total_amount, 0);
  const totalPaid = supplierPurchases.reduce((s, v) => s + v.paid_amount, 0);
  const totalRemaining = supplierPurchases.reduce((s, v) => s + v.remaining_amount, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="glass-panel rounded-3xl p-0 w-full max-w-3xl border border-white/10 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-white/10 bg-white/5">
          <div>
            <h3 className="text-2xl font-bold text-white">كشف حساب مورد</h3>
            <p className="text-amber-400 font-semibold mt-1">{supplierName}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
            <X className="w-5 h-5 text-white/70" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 text-center">
              <p className="text-blue-400 text-xs mb-1">إجمالي المشتريات</p>
              <p className="text-white font-black text-lg">{formatCurrency(totalBought)}</p>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 text-center">
              <p className="text-emerald-400 text-xs mb-1">إجمالي المدفوع</p>
              <p className="text-white font-black text-lg">{formatCurrency(totalPaid)}</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-center">
              <p className="text-red-400 text-xs mb-1">الرصيد المستحق</p>
              <p className="text-white font-black text-lg">{formatCurrency(totalRemaining)}</p>
            </div>
          </div>

          <div>
            <h4 className="text-white font-bold mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-400" /> فواتير المشتريات ({supplierPurchases.length})
            </h4>
            {supplierPurchases.length === 0 ? (
              <p className="text-white/30 text-sm text-center py-4">لا توجد فواتير</p>
            ) : (
              <div className="rounded-2xl overflow-hidden border border-white/10">
                <table className="w-full text-right text-sm">
                  <thead className="bg-white/5 border-b border-white/10">
                    <tr>
                      <th className="p-3 text-white/60 font-semibold">الفاتورة</th>
                      <th className="p-3 text-white/60 font-semibold">الإجمالي</th>
                      <th className="p-3 text-white/60 font-semibold">المدفوع</th>
                      <th className="p-3 text-white/60 font-semibold">المتبقي</th>
                      <th className="p-3 text-white/60 font-semibold">الحالة</th>
                      <th className="p-3 text-white/60 font-semibold">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierPurchases.map(purchase => (
                      <tr key={purchase.id} className="border-b border-white/5 hover:bg-white/3">
                        <td className="p-3 font-bold text-amber-400">{purchase.invoice_no}</td>
                        <td className="p-3 text-white">{formatCurrency(purchase.total_amount)}</td>
                        <td className="p-3 text-emerald-400">{formatCurrency(purchase.paid_amount)}</td>
                        <td className="p-3 text-red-400">{formatCurrency(purchase.remaining_amount)}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${
                            purchase.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                            purchase.status === 'partial' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                            'bg-red-500/20 text-red-400 border-red-500/30'
                          }`}>
                            {purchase.status === 'paid' ? 'مدفوع' : purchase.status === 'partial' ? 'جزئي' : 'غير مدفوع'}
                          </span>
                        </td>
                        <td className="p-3 text-white/50">{formatDate(purchase.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h4 className="text-white font-bold mb-3 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-red-400" /> سندات الصرف ({paymentTxns.length})
            </h4>
            {paymentTxns.length === 0 ? (
              <p className="text-white/30 text-sm text-center py-4">لا توجد سندات صرف</p>
            ) : (
              <div className="rounded-2xl overflow-hidden border border-white/10">
                <table className="w-full text-right text-sm">
                  <thead className="bg-white/5 border-b border-white/10">
                    <tr>
                      <th className="p-3 text-white/60 font-semibold">المبلغ</th>
                      <th className="p-3 text-white/60 font-semibold">البيان</th>
                      <th className="p-3 text-white/60 font-semibold">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentTxns.map(t => (
                      <tr key={t.id} className="border-b border-white/5 hover:bg-white/3">
                        <td className="p-3 font-bold text-red-400">{formatCurrency(t.amount)}</td>
                        <td className="p-3 text-white/70">{t.description || '-'}</td>
                        <td className="p-3 text-white/50">{formatDate(t.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Suppliers() {
  const { data: suppliers = [], isLoading } = useGetSuppliers();
  const createMutation = useCreateSupplier();
  const paymentMutation = useCreateSupplierPayment();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showPayment, setShowPayment] = useState<number | null>(null);
  const [showReport, setShowReport] = useState<{ id: number; name: string } | null>(null);
  const [formData, setFormData] = useState({ name: "", phone: "", balance: 0 });
  const [paymentData, setPaymentData] = useState({ amount: 0, description: "" });

  const filtered = suppliers.filter(s => s.name.includes(search) || (s.phone && s.phone.includes(search)));

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ data: formData }, {
      onSuccess: () => {
        toast({ title: "✅ تم إضافة المورد بنجاح" });
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
        toast({ title: "✅ تم تسجيل الدفعة بنجاح" });
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
          <input type="text" placeholder="بحث عن مورد..." className="glass-input pl-4 pr-12 w-full"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2 whitespace-nowrap">
          <Plus className="w-5 h-5" /> إضافة مورد
        </button>
      </div>

      {showReport && (
        <SupplierReportModal
          supplierId={showReport.id}
          supplierName={showReport.name}
          onClose={() => setShowReport(null)}
        />
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form onSubmit={handleAdd} className="glass-panel rounded-3xl p-8 w-full max-w-md border border-white/10">
            <h3 className="text-2xl font-bold text-white mb-6">مورد جديد</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-white/70 text-sm mb-1">اسم المورد *</label>
                <input required type="text" className="glass-input" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-1">رقم الهاتف</label>
                <input type="text" className="glass-input" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-1">رصيد ابتدائي (له)</label>
                <input type="number" step="0.01" min="0" className="glass-input" value={formData.balance || ''} onChange={e => setFormData({...formData, balance: parseFloat(e.target.value) || 0})} />
              </div>
            </div>
            <div className="flex gap-4 mt-8">
              <button type="submit" disabled={createMutation.isPending} className="flex-1 btn-primary py-3">حفظ</button>
              <button type="button" onClick={() => setShowAdd(false)} className="flex-1 btn-secondary py-3">إلغاء</button>
            </div>
          </form>
        </div>
      )}

      {showPayment !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form onSubmit={handlePayment} className="glass-panel rounded-3xl p-8 w-full max-w-md border border-white/10">
            <h3 className="text-2xl font-bold text-white mb-2">سند صرف</h3>
            <p className="text-white/50 text-sm mb-6">دفع مبلغ للمورد</p>
            <div className="space-y-4">
              <div>
                <label className="block text-white/70 text-sm mb-1">المبلغ المدفوع *</label>
                <input required type="number" step="0.01" min="0.01" className="glass-input" value={paymentData.amount || ''} onChange={e => setPaymentData({...paymentData, amount: parseFloat(e.target.value) || 0})} />
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-1">البيان</label>
                <input type="text" className="glass-input" placeholder="اختياري..." value={paymentData.description} onChange={e => setPaymentData({...paymentData, description: e.target.value})} />
              </div>
            </div>
            <div className="flex gap-4 mt-8">
              <button type="submit" disabled={paymentMutation.isPending} className="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold hover:bg-red-600 transition-colors">تأكيد الدفع</button>
              <button type="button" onClick={() => setShowPayment(null)} className="flex-1 btn-secondary py-3">إلغاء</button>
            </div>
          </form>
        </div>
      )}

      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-white/80 whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-4 font-semibold text-white/60">المورد</th>
                <th className="p-4 font-semibold text-white/60">رقم الهاتف</th>
                <th className="p-4 font-semibold text-white/60">الرصيد المستحق</th>
                <th className="p-4 font-semibold text-white/60">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={4} className="p-12 text-center text-white/40">جاري التحميل...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} className="p-12 text-center text-white/40">لا يوجد موردون</td></tr>
              ) : (
                filtered.map(supplier => (
                  <tr key={supplier.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                    <td className="p-4 font-bold text-white">{supplier.name}</td>
                    <td className="p-4 text-white/60">{supplier.phone || '-'}</td>
                    <td className={`p-4 font-bold ${supplier.balance > 0 ? 'text-red-400' : 'text-white/30'}`}>
                      {formatCurrency(supplier.balance)}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setShowReport({ id: supplier.id, name: supplier.name })}
                          className="flex items-center gap-1.5 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors border border-blue-500/30"
                        >
                          <FileText className="w-3.5 h-3.5" /> كشف حساب
                        </button>
                        <button
                          onClick={() => setShowPayment(supplier.id)}
                          disabled={supplier.balance <= 0}
                          className="flex items-center gap-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed border border-red-500/30"
                        >
                          <DollarSign className="w-3.5 h-3.5" /> دفع دفعة
                        </button>
                      </div>
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
