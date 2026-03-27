import { useState } from "react";
import { useGetCustomers, useCreateCustomer, useCreateCustomerReceipt, useGetSales, useGetTransactions } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Plus, Search, DollarSign, FileText, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

function CustomerReportModal({ customerId, customerName, onClose }: {
  customerId: number;
  customerName: string;
  onClose: () => void;
}) {
  const { data: allSales = [] } = useGetSales();
  const { data: transactions = [] } = useGetTransactions();

  const customerSales = allSales.filter(s =>
    s.customer_id === customerId || s.customer_name === customerName
  );

  const receiptTxns = transactions.filter(t =>
    t.type === "receipt" && t.related_id === customerId
  );

  const totalSold = customerSales.reduce((s, v) => s + v.total_amount, 0);
  const totalPaid = customerSales.reduce((s, v) => s + v.paid_amount, 0);
  const totalRemaining = customerSales.reduce((s, v) => s + v.remaining_amount, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="glass-panel rounded-3xl p-0 w-full max-w-3xl border border-white/10 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-white/10 bg-white/5">
          <div>
            <h3 className="text-2xl font-bold text-white">كشف حساب عميل</h3>
            <p className="text-amber-400 font-semibold mt-1">{customerName}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
            <X className="w-5 h-5 text-white/70" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 text-center">
              <p className="text-blue-400 text-xs mb-1">إجمالي المبيعات</p>
              <p className="text-white font-black text-lg">{formatCurrency(totalSold)}</p>
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

          {/* Sales History */}
          <div>
            <h4 className="text-white font-bold mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-400" /> فواتير المبيعات ({customerSales.length})
            </h4>
            {customerSales.length === 0 ? (
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
                    {customerSales.map(sale => (
                      <tr key={sale.id} className="border-b border-white/5 hover:bg-white/3">
                        <td className="p-3 font-bold text-amber-400">{sale.invoice_no}</td>
                        <td className="p-3 text-white">{formatCurrency(sale.total_amount)}</td>
                        <td className="p-3 text-emerald-400">{formatCurrency(sale.paid_amount)}</td>
                        <td className="p-3 text-red-400">{formatCurrency(sale.remaining_amount)}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${
                            sale.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                            sale.status === 'partial' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                            'bg-red-500/20 text-red-400 border-red-500/30'
                          }`}>
                            {sale.status === 'paid' ? 'مدفوع' : sale.status === 'partial' ? 'جزئي' : 'غير مدفوع'}
                          </span>
                        </td>
                        <td className="p-3 text-white/50">{formatDate(sale.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Receipt History */}
          <div>
            <h4 className="text-white font-bold mb-3 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" /> سندات القبض ({receiptTxns.length})
            </h4>
            {receiptTxns.length === 0 ? (
              <p className="text-white/30 text-sm text-center py-4">لا توجد سندات قبض</p>
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
                    {receiptTxns.map(t => (
                      <tr key={t.id} className="border-b border-white/5 hover:bg-white/3">
                        <td className="p-3 font-bold text-emerald-400">{formatCurrency(t.amount)}</td>
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

export default function Customers() {
  const { data: customers = [], isLoading } = useGetCustomers();
  const createMutation = useCreateCustomer();
  const receiptMutation = useCreateCustomerReceipt();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showReceipt, setShowReceipt] = useState<number | null>(null);
  const [showReport, setShowReport] = useState<{ id: number; name: string } | null>(null);
  const [formData, setFormData] = useState({ name: "", phone: "", balance: 0 });
  const [receiptData, setReceiptData] = useState({ amount: 0, description: "" });

  const filtered = customers.filter(c => c.name.includes(search) || (c.phone && c.phone.includes(search)));

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ data: formData }, {
      onSuccess: () => {
        toast({ title: "✅ تم إضافة العميل بنجاح" });
        queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
        setShowAdd(false);
        setFormData({ name: "", phone: "", balance: 0 });
      }
    });
  };

  const handleReceipt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!showReceipt) return;
    receiptMutation.mutate({ id: showReceipt, data: receiptData }, {
      onSuccess: () => {
        toast({ title: "✅ تم تسجيل الدفعة بنجاح" });
        queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
        setShowReceipt(null);
        setReceiptData({ amount: 0, description: "" });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative w-full max-w-md">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
          <input type="text" placeholder="بحث عن عميل..." className="glass-input pl-4 pr-12 w-full"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2 whitespace-nowrap">
          <Plus className="w-5 h-5" /> إضافة عميل
        </button>
      </div>

      {/* Report Modal */}
      {showReport && (
        <CustomerReportModal
          customerId={showReport.id}
          customerName={showReport.name}
          onClose={() => setShowReport(null)}
        />
      )}

      {/* Add Customer Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form onSubmit={handleAdd} className="glass-panel rounded-3xl p-8 w-full max-w-md border border-white/10">
            <h3 className="text-2xl font-bold text-white mb-6">عميل جديد</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-white/70 text-sm mb-1">اسم العميل *</label>
                <input required type="text" className="glass-input" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-1">رقم الهاتف</label>
                <input type="text" className="glass-input" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-1">رصيد ابتدائي (عليه)</label>
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

      {/* Receipt Modal */}
      {showReceipt !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form onSubmit={handleReceipt} className="glass-panel rounded-3xl p-8 w-full max-w-md border border-white/10">
            <h3 className="text-2xl font-bold text-white mb-2">سند قبض</h3>
            <p className="text-white/50 text-sm mb-6">استلام دفعة من العميل</p>
            <div className="space-y-4">
              <div>
                <label className="block text-white/70 text-sm mb-1">المبلغ المستلم *</label>
                <input required type="number" step="0.01" min="0.01" className="glass-input" value={receiptData.amount || ''} onChange={e => setReceiptData({...receiptData, amount: parseFloat(e.target.value) || 0})} />
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-1">البيان</label>
                <input type="text" className="glass-input" placeholder="اختياري..." value={receiptData.description} onChange={e => setReceiptData({...receiptData, description: e.target.value})} />
              </div>
            </div>
            <div className="flex gap-4 mt-8">
              <button type="submit" disabled={receiptMutation.isPending} className="flex-1 bg-emerald-500 text-white py-3 rounded-xl font-bold hover:bg-emerald-600 transition-colors">تأكيد الاستلام</button>
              <button type="button" onClick={() => setShowReceipt(null)} className="flex-1 btn-secondary py-3">إلغاء</button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-white/80 whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-4 font-semibold text-white/60">العميل</th>
                <th className="p-4 font-semibold text-white/60">رقم الهاتف</th>
                <th className="p-4 font-semibold text-white/60">الرصيد المستحق</th>
                <th className="p-4 font-semibold text-white/60">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={4} className="p-12 text-center text-white/40">جاري التحميل...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} className="p-12 text-center text-white/40">لا يوجد عملاء</td></tr>
              ) : (
                filtered.map(customer => (
                  <tr key={customer.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                    <td className="p-4 font-bold text-white">{customer.name}</td>
                    <td className="p-4 text-white/60">{customer.phone || '-'}</td>
                    <td className={`p-4 font-bold ${customer.balance > 0 ? 'text-yellow-400' : 'text-white/30'}`}>
                      {formatCurrency(customer.balance)}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setShowReport({ id: customer.id, name: customer.name })}
                          className="flex items-center gap-1.5 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors border border-blue-500/30"
                        >
                          <FileText className="w-3.5 h-3.5" /> كشف حساب
                        </button>
                        <button
                          onClick={() => setShowReceipt(customer.id)}
                          disabled={customer.balance <= 0}
                          className="flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed border border-emerald-500/30"
                        >
                          <DollarSign className="w-3.5 h-3.5" /> قبض دفعة
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
