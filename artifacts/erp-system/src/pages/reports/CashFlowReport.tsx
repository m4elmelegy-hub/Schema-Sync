import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, CreditCard } from "lucide-react";
import { api, authFetch, formatCurrency, TableSkeleton, DateFilterBar, getDateRange, DateMode, thisMonthStart, todayStr } from "./shared";

interface CashFlowData {
  days: Array<{ day:string; receipts_in:number; cash_sales:number; deposits_in:number; total_in:number; payments_out:number; expenses_out:number; total_out:number; net_flow:number }>;
  summary: { total_in:number; total_out:number; net_cash_flow:number };
}

export default function CashFlowReport() {
  const [mode,setMode]             = useState<DateMode>("month");
  const [customFrom,setCustomFrom] = useState(thisMonthStart());
  const [customTo,setCustomTo]     = useState(todayStr());
  const [dateFrom,dateTo]          = getDateRange(mode,customFrom,customTo);

  const { data, isLoading } = useQuery<CashFlowData>({
    queryKey:["/api/reports/cash-flow",dateFrom,dateTo],
    queryFn:()=>authFetch(api(`/api/reports/cash-flow?date_from=${dateFrom}&date_to=${dateTo}`)).then(r=>r.json()),
    staleTime:60_000,
  });
  const days    = data?.days    ?? [];
  const summary = data?.summary ?? { total_in:0, total_out:0, net_cash_flow:0 };

  return (
    <div className="space-y-4" style={{ fontFamily:"'Tajawal','Cairo',sans-serif" }}>
      <DateFilterBar mode={mode} setMode={setMode} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo}/>
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-panel rounded-2xl p-4 border border-emerald-500/10"><div className="flex items-center gap-2 mb-1"><ArrowDown className="w-4 h-4 text-emerald-400"/><p className="text-emerald-400 text-xs">إجمالي الوارد</p></div><p className="text-lg font-black text-white">{formatCurrency(summary.total_in)}</p></div>
        <div className="glass-panel rounded-2xl p-4 border border-red-500/10"><div className="flex items-center gap-2 mb-1"><ArrowUp className="w-4 h-4 text-red-400"/><p className="text-red-400 text-xs">إجمالي الصادر</p></div><p className="text-lg font-black text-white">{formatCurrency(summary.total_out)}</p></div>
        <div className={`glass-panel rounded-2xl p-4 border ${summary.net_cash_flow>=0?"border-blue-500/10":"border-red-500/20"}`}><div className="flex items-center gap-2 mb-1"><CreditCard className="w-4 h-4 text-blue-400"/><p className="text-blue-400 text-xs">صافي التدفق النقدي</p></div><p className={`text-lg font-black ${summary.net_cash_flow>=0?"text-blue-400":"text-red-400"}`}>{formatCurrency(summary.net_cash_flow)}</p></div>
      </div>
      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-3 text-white/50">التاريخ</th>
                <th className="p-3 text-white/50">مبيعات نقدية</th>
                <th className="p-3 text-white/50">سندات قبض</th>
                <th className="p-3 text-white/50">إيداعات</th>
                <th className="p-3 text-emerald-400 font-bold">إجمالي الوارد</th>
                <th className="p-3 text-white/50">سندات دفع</th>
                <th className="p-3 text-white/50">مصروفات</th>
                <th className="p-3 text-red-400 font-bold">إجمالي الصادر</th>
                <th className="p-3 text-white/50">صافي</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <TableSkeleton cols={9} rows={5}/> :
               days.length===0 ? <tr><td colSpan={9} className="p-12 text-center text-white/40">لا توجد حركات نقدية في هذه الفترة</td></tr> :
               days.map(d=>(
                <tr key={d.day} className="border-b border-white/5 erp-table-row">
                  <td className="p-3 font-mono text-white/60 text-xs">{d.day}</td>
                  <td className="p-3 text-emerald-400">{d.cash_sales>0?formatCurrency(d.cash_sales):"—"}</td>
                  <td className="p-3 text-emerald-400">{d.receipts_in>0?formatCurrency(d.receipts_in):"—"}</td>
                  <td className="p-3 text-blue-400">{d.deposits_in>0?formatCurrency(d.deposits_in):"—"}</td>
                  <td className="p-3 font-bold text-emerald-400">{formatCurrency(d.total_in)}</td>
                  <td className="p-3 text-red-400">{d.payments_out>0?formatCurrency(d.payments_out):"—"}</td>
                  <td className="p-3 text-orange-400">{d.expenses_out>0?formatCurrency(d.expenses_out):"—"}</td>
                  <td className="p-3 font-bold text-red-400">{formatCurrency(d.total_out)}</td>
                  <td className={`p-3 font-black ${d.net_flow>=0?"text-blue-400":"text-red-400"}`}>{formatCurrency(d.net_flow)}</td>
                </tr>
              ))}
            </tbody>
            {days.length>0&&(
              <tfoot className="bg-white/5 border-t border-white/10">
                <tr>
                  <td colSpan={4} className="p-3 font-bold text-white/50">الإجمالي</td>
                  <td className="p-3 font-black text-emerald-400">{formatCurrency(summary.total_in)}</td>
                  <td colSpan={2}/>
                  <td className="p-3 font-black text-red-400">{formatCurrency(summary.total_out)}</td>
                  <td className={`p-3 font-black ${summary.net_cash_flow>=0?"text-blue-400":"text-red-400"}`}>{formatCurrency(summary.net_cash_flow)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
