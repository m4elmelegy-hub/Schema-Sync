import { useGetSales } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Search } from "lucide-react";
import { useState } from "react";

export default function Sales() {
  const { data: sales = [], isLoading } = useGetSales();
  const [search, setSearch] = useState("");

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
      </div>

      <div className="glass-panel rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-white/80 whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-4 font-medium">رقم الفاتورة</th>
                <th className="p-4 font-medium">العميل</th>
                <th className="p-4 font-medium">الإجمالي</th>
                <th className="p-4 font-medium">المدفوع</th>
                <th className="p-4 font-medium">المتبقي</th>
                <th className="p-4 font-medium">طريقة الدفع</th>
                <th className="p-4 font-medium">الحالة</th>
                <th className="p-4 font-medium">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="p-8 text-center text-white/50">جاري التحميل...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-white/50">لا توجد مبيعات</td></tr>
              ) : (
                filtered.map(sale => (
                  <tr key={sale.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="p-4 font-bold text-white">{sale.invoice_no}</td>
                    <td className="p-4">{sale.customer_name || 'عميل نقدي'}</td>
                    <td className="p-4 font-bold">{formatCurrency(sale.total_amount)}</td>
                    <td className="p-4 text-emerald-400">{formatCurrency(sale.paid_amount)}</td>
                    <td className="p-4 text-red-400">{formatCurrency(sale.remaining_amount)}</td>
                    <td className="p-4">
                      {sale.payment_type === 'cash' ? 'نقدي' : sale.payment_type === 'credit' ? 'آجل' : 'جزئي'}
                    </td>
                    <td className="p-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                        sale.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                        sale.status === 'partial' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                        'bg-red-500/20 text-red-400 border-red-500/30'
                      }`}>
                        {sale.status === 'paid' ? 'مدفوع' : sale.status === 'partial' ? 'جزئي' : 'غير مدفوع'}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-white/60">{formatDate(sale.created_at)}</td>
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
