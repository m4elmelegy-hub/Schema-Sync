import { useGetSales, useGetSaleById } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Search, X, Printer } from "lucide-react";
import { useState } from "react";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    partial: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    unpaid: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  const labels: Record<string, string> = { paid: "مدفوع", partial: "جزئي", unpaid: "غير مدفوع" };
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${map[status] || map.unpaid}`}>
      {labels[status] || status}
    </span>
  );
}

function PaymentBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    cash: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    credit: "bg-red-500/20 text-red-400 border-red-500/30",
    partial: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  };
  const labels: Record<string, string> = { cash: "نقدي", credit: "آجل", partial: "جزئي" };
  return (
    <span className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${map[type] || ''}`}>
      {labels[type] || type}
    </span>
  );
}

function SaleDetailModal({ saleId, onClose }: { saleId: number; onClose: () => void }) {
  const { data: sale, isLoading } = useGetSaleById({ id: saleId });

  const handlePrint = () => window.print();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="glass-panel rounded-3xl p-8 w-full max-w-2xl border border-white/10 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-bold text-white">تفاصيل الفاتورة</h3>
          <div className="flex gap-2">
            <button onClick={handlePrint} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 transition-colors">
              <Printer className="w-5 h-5" />
            </button>
            <button onClick={onClose} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-white/40">جاري التحميل...</div>
        ) : !sale ? (
          <div className="text-center py-12 text-white/40">لم يتم العثور على الفاتورة</div>
        ) : (
          <div className="space-y-6">
            {/* Invoice Header */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
              <div>
                <p className="text-white/50 text-sm">رقم الفاتورة</p>
                <p className="text-white font-bold text-lg">{sale.invoice_no}</p>
              </div>
              <div>
                <p className="text-white/50 text-sm">التاريخ</p>
                <p className="text-white">{formatDate(sale.created_at)}</p>
              </div>
              <div>
                <p className="text-white/50 text-sm">العميل</p>
                <p className="text-white font-semibold">{sale.customer_name || 'عميل نقدي'}</p>
              </div>
              <div>
                <p className="text-white/50 text-sm">طريقة الدفع</p>
                <PaymentBadge type={sale.payment_type} />
              </div>
              {sale.notes && (
                <div className="col-span-2">
                  <p className="text-white/50 text-sm">ملاحظات</p>
                  <p className="text-white/80">{sale.notes}</p>
                </div>
              )}
            </div>

            {/* Items Table */}
            <div>
              <h4 className="text-white font-bold mb-3 text-lg">أصناف الفاتورة</h4>
              <div className="rounded-2xl overflow-hidden border border-white/10">
                <table className="w-full text-right text-sm">
                  <thead className="bg-white/5 border-b border-white/10">
                    <tr>
                      <th className="p-3 font-semibold text-white/60">الصنف</th>
                      <th className="p-3 font-semibold text-white/60">الكمية</th>
                      <th className="p-3 font-semibold text-white/60">سعر الوحدة</th>
                      <th className="p-3 font-semibold text-white/60">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sale.items || []).map((item, i) => (
                      <tr key={i} className="border-b border-white/5 hover:bg-white/3">
                        <td className="p-3 font-bold text-white">{item.product_name}</td>
                        <td className="p-3 text-white/70">{item.quantity}</td>
                        <td className="p-3 text-white/70">{formatCurrency(item.unit_price)}</td>
                        <td className="p-3 font-bold text-emerald-400">{formatCurrency(item.total_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals */}
            <div className="p-5 bg-white/5 rounded-2xl border border-white/5 space-y-3">
              <div className="flex justify-between">
                <span className="text-white/60">إجمالي الفاتورة</span>
                <span className="font-bold text-white text-lg">{formatCurrency(sale.total_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">المدفوع</span>
                <span className="font-bold text-emerald-400">{formatCurrency(sale.paid_amount)}</span>
              </div>
              {sale.remaining_amount > 0 && (
                <div className="flex justify-between border-t border-white/10 pt-3">
                  <span className="text-white/60">المتبقي</span>
                  <span className="font-bold text-red-400 text-lg">{formatCurrency(sale.remaining_amount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-white/10 pt-3">
                <span className="text-white/60">الحالة</span>
                <StatusBadge status={sale.status} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Sales() {
  const { data: sales = [], isLoading } = useGetSales();
  const [search, setSearch] = useState("");
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null);

  const filtered = sales.filter(s => 
    s.invoice_no.includes(search) || 
    (s.customer_name && s.customer_name.includes(search))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative w-full max-w-md">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
          <input 
            type="text" 
            placeholder="بحث برقم الفاتورة أو العميل..." 
            className="glass-input pl-4 pr-12 w-full"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="text-white/40 text-sm whitespace-nowrap">
          إجمالي: {filtered.length} فاتورة
        </div>
      </div>

      {selectedSaleId && (
        <SaleDetailModal saleId={selectedSaleId} onClose={() => setSelectedSaleId(null)} />
      )}

      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-white/80 whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-4 font-semibold text-white/60">رقم الفاتورة</th>
                <th className="p-4 font-semibold text-white/60">العميل</th>
                <th className="p-4 font-semibold text-white/60">الإجمالي</th>
                <th className="p-4 font-semibold text-white/60">المدفوع</th>
                <th className="p-4 font-semibold text-white/60">المتبقي</th>
                <th className="p-4 font-semibold text-white/60">الدفع</th>
                <th className="p-4 font-semibold text-white/60">الحالة</th>
                <th className="p-4 font-semibold text-white/60">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="p-12 text-center text-white/40">جاري التحميل...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="p-12 text-center text-white/40">لا توجد مبيعات</td></tr>
              ) : (
                filtered.map(sale => (
                  <tr 
                    key={sale.id} 
                    className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                    onClick={() => setSelectedSaleId(sale.id)}
                    title="انقر لعرض تفاصيل الفاتورة"
                  >
                    <td className="p-4 font-bold text-amber-400 hover:underline">{sale.invoice_no}</td>
                    <td className="p-4">{sale.customer_name || 'عميل نقدي'}</td>
                    <td className="p-4 font-bold text-white">{formatCurrency(sale.total_amount)}</td>
                    <td className="p-4 text-emerald-400 font-bold">{formatCurrency(sale.paid_amount)}</td>
                    <td className="p-4 text-red-400 font-bold">{formatCurrency(sale.remaining_amount)}</td>
                    <td className="p-4"><PaymentBadge type={sale.payment_type} /></td>
                    <td className="p-4"><StatusBadge status={sale.status} /></td>
                    <td className="p-4 text-sm text-white/50">{formatDate(sale.created_at)}</td>
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
