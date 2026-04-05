import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, authFetch, formatCurrency, TableSkeleton, DateFilterBar, getDateRange, DateMode, thisMonthStart, todayStr } from "./shared";

interface DailyProfitData {
  days: Array<{ day:string; total_sales:number; total_returns:number; net_sales:number; total_cogs:number; gross_profit:number; expenses:number; net_profit:number }>;
  summary: { total_net_sales:number; total_cogs:number; total_gross_profit:number; total_expenses:number; total_net_profit:number };
}

export default function DailyProfitReport() {
  const [mode,setMode]             = useState<DateMode>("month");
  const [customFrom,setCustomFrom] = useState(thisMonthStart());
  const [customTo,setCustomTo]     = useState(todayStr());
  const [dateFrom,dateTo]          = getDateRange(mode,customFrom,customTo);

  const { data, isLoading } = useQuery<DailyProfitData>({
    queryKey:["/api/reports/daily-profit",dateFrom,dateTo],
    queryFn:()=>authFetch(api(`/api/reports/daily-profit?date_from=${dateFrom}&date_to=${dateTo}`)).then(r=>r.json()),
    staleTime:60_000,
  });
  const days    = data?.days ?? [];
  const summary = data?.summary ?? { total_net_sales:0, total_cogs:0, total_gross_profit:0, total_expenses:0, total_net_profit:0 };

  return (
    <div className="space-y-4" style={{ fontFamily:"'Tajawal','Cairo',sans-serif" }}>
      <DateFilterBar mode={mode} setMode={setMode} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo}/>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label:"صافي المبيعات",   value:summary.total_net_sales,    color:"text-emerald-400" },
          { label:"تكلفة البضاعة",   value:summary.total_cogs,          color:"text-red-400" },
          { label:"مجمل الربح",      value:summary.total_gross_profit,  color:"text-amber-400" },
          { label:"المصروفات",       value:summary.total_expenses,      color:"text-orange-400" },
          { label:"صافي الربح",      value:summary.total_net_profit,    color:summary.total_net_profit>=0?"text-blue-400":"text-red-400" },
        ].map(c=>(
          <div key={c.label} className="glass-panel rounded-2xl p-4 border border-white/5">
            <p className="text-white/40 text-xs mb-1">{c.label}</p>
            <p className={`text-lg font-black ${c.color}`}>{formatCurrency(c.value)}</p>
          </div>
        ))}
      </div>
      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-3 text-white/50">التاريخ</th>
                <th className="p-3 text-white/50">المبيعات</th>
                <th className="p-3 text-white/50">المرتجعات</th>
                <th className="p-3 text-white/50">صافي المبيعات</th>
                <th className="p-3 text-white/50">تكلفة البضاعة</th>
                <th className="p-3 text-white/50">مجمل الربح</th>
                <th className="p-3 text-white/50">المصروفات</th>
                <th className="p-3 text-white/50">صافي الربح</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <TableSkeleton cols={8} rows={5}/> :
               days.length===0 ? <tr><td colSpan={8} className="p-12 text-center text-white/40">لا توجد بيانات في هذه الفترة</td></tr> :
               days.map(d=>(
                <tr key={d.day} className="border-b border-white/5 erp-table-row">
                  <td className="p-3 text-white/70 font-mono">{d.day}</td>
                  <td className="p-3 text-emerald-400 font-bold">{formatCurrency(d.total_sales)}</td>
                  <td className="p-3 text-red-400">{d.total_returns>0?formatCurrency(d.total_returns):"—"}</td>
                  <td className="p-3 text-white font-bold">{formatCurrency(d.net_sales)}</td>
                  <td className="p-3 text-red-400">{formatCurrency(d.total_cogs)}</td>
                  <td className={`p-3 font-bold ${d.gross_profit>=0?"text-amber-400":"text-red-400"}`}>{formatCurrency(d.gross_profit)}</td>
                  <td className="p-3 text-orange-400">{d.expenses>0?formatCurrency(d.expenses):"—"}</td>
                  <td className={`p-3 font-black ${d.net_profit>=0?"text-blue-400":"text-red-400"}`}>{formatCurrency(d.net_profit)}</td>
                </tr>
              ))}
            </tbody>
            {days.length>0&&(
              <tfoot className="bg-white/5 border-t border-white/10">
                <tr>
                  <td className="p-3 font-bold text-white/50">الإجمالي</td>
                  <td className="p-3"/><td className="p-3"/>
                  <td className="p-3 font-black text-white">{formatCurrency(summary.total_net_sales)}</td>
                  <td className="p-3 font-black text-red-400">{formatCurrency(summary.total_cogs)}</td>
                  <td className="p-3 font-black text-amber-400">{formatCurrency(summary.total_gross_profit)}</td>
                  <td className="p-3 font-black text-orange-400">{formatCurrency(summary.total_expenses)}</td>
                  <td className={`p-3 font-black ${summary.total_net_profit>=0?"text-blue-400":"text-red-400"}`}>{formatCurrency(summary.total_net_profit)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
