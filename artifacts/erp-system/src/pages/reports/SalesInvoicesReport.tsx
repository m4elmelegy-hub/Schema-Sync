import React, { useState } from "react";
import { useGetSales } from "@workspace/api-client-react";
import { Search, FileDown, Printer } from "lucide-react";
import { formatCurrency, formatDate, TableSkeleton, PaymentBadge, StatusBadge, InvoicePdfButton } from "./shared";

const PAY_AR: Record<string,string> = { cash:"نقدي", credit:"آجل", partial:"جزئي" };
const STATUS_AR: Record<string,string> = { paid:"مدفوع", partial:"جزئي", unpaid:"غير مدفوع", pending:"معلق" };

function exportSalesExcel(rows: any[]) {
  const header = ["رقم الفاتورة","العميل","الإجمالي","المدفوع","المتبقي","نوع الدفع","الحالة","التاريخ"];
  const body = rows.map(s => [s.invoice_no, s.customer_name||"عميل نقدي", s.total_amount, s.paid_amount, s.remaining_amount, PAY_AR[s.payment_type]||s.payment_type, STATUS_AR[s.status]||s.status, formatDate(s.created_at)]);
  const csv = [header, ...body].map(r => r.join(",")).join("\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF"+csv], {type:"text/csv;charset=utf-8;"}));
  const a = document.createElement("a"); a.href=url; a.download="فواتير_المبيعات.csv"; a.click(); URL.revokeObjectURL(url);
}
function printSalesReport(rows: any[]) {
  const html = `<html dir="rtl"><head><meta charset="UTF-8"><style>body{font-family:Tajawal,Cairo,Arial;font-size:11px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px;text-align:right}th{background:#f5f5f5}@media print{body{margin:0}}</style></head><body><h2>تقرير فواتير المبيعات</h2><table><thead><tr><th>رقم الفاتورة</th><th>العميل</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>نوع الدفع</th><th>الحالة</th><th>التاريخ</th></tr></thead><tbody>${rows.map(s=>`<tr><td>${s.invoice_no}</td><td>${s.customer_name||"عميل نقدي"}</td><td>${formatCurrency(s.total_amount)}</td><td>${formatCurrency(s.paid_amount)}</td><td>${formatCurrency(s.remaining_amount)}</td><td>${PAY_AR[s.payment_type]||s.payment_type}</td><td>${STATUS_AR[s.status]||s.status}</td><td>${formatDate(s.created_at)}</td></tr>`).join("")}</tbody></table></body></html>`;
  const w = window.open("","_blank"); if (w) { w.document.write(html); w.document.close(); setTimeout(()=>w.print(),500); }
}

export default function SalesInvoicesReport() {
  const { data:sales=[], isLoading } = useGetSales();
  const [search,setSearch]           = useState("");
  const [payFilter,setPayFilter]     = useState("");

  const filtered = sales.filter(s => {
    const matchS = !search || s.invoice_no.includes(search) || (s.customer_name&&s.customer_name.includes(search));
    return matchS && (!payFilter || s.payment_type===payFilter);
  });
  const totalSales = filtered.reduce((s,v)=>s+v.total_amount,0);
  const totalPaid  = filtered.reduce((s,v)=>s+v.paid_amount,0);
  const totalDebt  = filtered.reduce((s,v)=>s+v.remaining_amount,0);

  return (
    <div className="space-y-4" style={{ fontFamily:"'Tajawal','Cairo',sans-serif" }}>
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-panel rounded-2xl p-4 border border-emerald-500/10"><p className="text-emerald-400 text-xs mb-1">إجمالي المبيعات</p><p className="text-2xl font-black text-white">{formatCurrency(totalSales)}</p><p className="text-white/30 text-xs">{filtered.length} فاتورة</p></div>
        <div className="glass-panel rounded-2xl p-4 border border-blue-500/10"><p className="text-blue-400 text-xs mb-1">المحصَّل</p><p className="text-2xl font-black text-white">{formatCurrency(totalPaid)}</p></div>
        <div className="glass-panel rounded-2xl p-4 border border-red-500/10"><p className="text-red-400 text-xs mb-1">الديون المتبقية</p><p className="text-2xl font-black text-white">{formatCurrency(totalDebt)}</p></div>
      </div>
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 max-w-xs"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30"/><input className="glass-input w-full pr-9 text-sm" placeholder="بحث برقم الفاتورة أو العميل..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
        <div className="flex gap-1">{[{v:"",l:"الكل"},{v:"cash",l:"نقدي"},{v:"credit",l:"آجل"},{v:"partial",l:"جزئي"}].map(opt=>(
          <button key={opt.v} onClick={()=>setPayFilter(opt.v)} className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${payFilter===opt.v?"bg-amber-500/20 border-amber-500/40 text-amber-400":"glass-panel border-white/10 text-white/50 hover:text-white"}`}>{opt.l}</button>
        ))}</div>
        <div className="flex gap-2 mr-auto">
          <button onClick={()=>exportSalesExcel(filtered)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30 transition-all"><FileDown className="w-3.5 h-3.5"/> Excel</button>
          <button onClick={()=>printSalesReport(filtered)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-500/20 border border-blue-500/40 text-blue-400 hover:bg-blue-500/30 transition-all"><Printer className="w-3.5 h-3.5"/> PDF الكل</button>
        </div>
      </div>
      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10"><tr><th className="p-3 text-white/50">رقم الفاتورة</th><th className="p-3 text-white/50">العميل</th><th className="p-3 text-white/50">الإجمالي</th><th className="p-3 text-white/50">المدفوع</th><th className="p-3 text-white/50">المتبقي</th><th className="p-3 text-white/50">الدفع</th><th className="p-3 text-white/50">الحالة</th><th className="p-3 text-white/50">التاريخ</th><th className="p-3 text-white/50">فاتورة</th></tr></thead>
            <tbody>
              {isLoading ? <TableSkeleton cols={9} rows={5}/>
                : filtered.length===0 ? <tr><td colSpan={9} className="p-12 text-center text-white/40">لا توجد فواتير</td></tr>
                : filtered.map(s=>(
                  <tr key={s.id} className="border-b border-white/5 erp-table-row">
                    <td className="p-3 font-bold text-amber-400">{s.invoice_no}</td>
                    <td className="p-3 text-white">{s.customer_name||"عميل نقدي"}</td>
                    <td className="p-3 font-bold text-white">{formatCurrency(s.total_amount)}</td>
                    <td className="p-3 text-emerald-400 font-bold">{formatCurrency(s.paid_amount)}</td>
                    <td className="p-3 text-red-400 font-bold">{s.remaining_amount>0?formatCurrency(s.remaining_amount):"—"}</td>
                    <td className="p-3"><PaymentBadge type={s.payment_type}/></td>
                    <td className="p-3"><StatusBadge status={s.status}/></td>
                    <td className="p-3 text-white/40 text-xs">{formatDate(s.created_at)}</td>
                    <td className="p-3"><InvoicePdfButton type="sales" id={s.id}/></td>
                  </tr>
                ))
              }
            </tbody>
            {filtered.length>0&&(
              <tfoot className="bg-white/5 border-t border-white/10"><tr><td colSpan={2} className="p-3 text-white/50 font-bold">الإجمالي ({filtered.length} فاتورة)</td><td className="p-3 font-black text-white">{formatCurrency(totalSales)}</td><td className="p-3 font-black text-emerald-400">{formatCurrency(totalPaid)}</td><td className="p-3 font-black text-red-400">{formatCurrency(totalDebt)}</td><td colSpan={4}/></tr></tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
