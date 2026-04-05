import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { api, authFetch, formatCurrency, TableSkeleton, DateFilterBar, getDateRange, DateMode, thisMonthStart, todayStr } from "./shared";

interface StatementRow { date:string; type:string; description:string; debit:number; credit:number; balance:number; reference_no?:string|null }
interface CustomerStatementData {
  customer: { id:number; name:string; balance:number; customer_code:number };
  opening_balance:number; statement:StatementRow[]; closing_balance:number;
}
const STMT_TYPE_MAP: Record<string,{label:string;cls:string}> = {
  opening_balance: {label:"رصيد أول المدة",cls:"text-amber-400"},
  sale:            {label:"فاتورة مبيعات",cls:"text-blue-400"},
  receipt:         {label:"سند قبض",cls:"text-emerald-400"},
  sale_return:     {label:"مرتجع مبيعات",cls:"text-orange-400"},
};

export default function CustomerStatementReport() {
  const [customerId,setCustomerId] = useState<string>("");
  const [mode,setMode]             = useState<DateMode>("month");
  const [customFrom,setCustomFrom] = useState(thisMonthStart());
  const [customTo,setCustomTo]     = useState(todayStr());
  const [dateFrom,dateTo]          = getDateRange(mode,customFrom,customTo);

  const { data:customers=[] } = useQuery<any[]>({
    queryKey:["/api/customers"],
    queryFn:()=>authFetch(api("/api/customers")).then(r=>r.json()),
    staleTime:120_000,
  });
  const { data, isLoading, isFetching } = useQuery<CustomerStatementData>({
    queryKey:["/api/reports/customer-statement",customerId,dateFrom,dateTo],
    queryFn:()=>authFetch(api(`/api/reports/customer-statement?customer_id=${customerId}&date_from=${dateFrom}&date_to=${dateTo}`)).then(r=>r.json()),
    enabled:!!customerId,
    staleTime:30_000,
  });
  const stmt = data?.statement ?? [];

  return (
    <div className="space-y-4" style={{ fontFamily:"'Tajawal','Cairo',sans-serif" }}>
      <div className="flex flex-wrap gap-3 items-center">
        <select value={customerId} onChange={e=>setCustomerId(e.target.value)} className="glass-input rounded-xl px-3 py-2 text-sm text-white min-w-[200px]">
          <option value="">اختر العميل...</option>
          {customers.map((c:any)=><option key={c.id} value={String(c.id)}>{c.name}</option>)}
        </select>
        <DateFilterBar mode={mode} setMode={setMode} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo}/>
      </div>

      {!customerId ? (
        <div className="glass-panel rounded-2xl p-12 text-center border border-white/5">
          <Users className="w-10 h-10 text-white/20 mx-auto mb-3"/>
          <p className="text-white/40 font-bold">اختر عميلاً لعرض كشف حسابه</p>
        </div>
      ) : (
        <>
          {data&&(
            <div className="grid grid-cols-3 gap-3">
              <div className="glass-panel rounded-2xl p-4 border border-white/5"><p className="text-white/40 text-xs mb-1">رصيد أول المدة</p><p className={`text-lg font-black ${data.opening_balance>=0?"text-amber-400":"text-red-400"}`}>{formatCurrency(data.opening_balance)}</p></div>
              <div className="glass-panel rounded-2xl p-4 border border-white/5"><p className="text-white/40 text-xs mb-1">رصيد الختام</p><p className={`text-lg font-black ${data.closing_balance>=0?"text-emerald-400":"text-red-400"}`}>{formatCurrency(data.closing_balance)}</p></div>
              <div className="glass-panel rounded-2xl p-4 border border-white/5"><p className="text-white/40 text-xs mb-1">الرصيد الفعلي (الدفتر)</p><p className={`text-lg font-black ${data.customer.balance>=0?"text-blue-400":"text-red-400"}`}>{formatCurrency(data.customer.balance)}</p></div>
            </div>
          )}
          <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm whitespace-nowrap">
                <thead className="bg-white/5 border-b border-white/10"><tr><th className="p-3 text-white/50">التاريخ</th><th className="p-3 text-white/50">النوع</th><th className="p-3 text-white/50">البيان</th><th className="p-3 text-white/50">مدين (له)</th><th className="p-3 text-white/50">دائن (عليه)</th><th className="p-3 text-white/50">الرصيد</th></tr></thead>
                <tbody>
                  {(isLoading||isFetching) ? <TableSkeleton cols={6} rows={5}/> :
                   stmt.length===0 ? <tr><td colSpan={6} className="p-12 text-center text-white/40">لا توجد حركات في هذه الفترة</td></tr> :
                   stmt.map((row,i)=>{
                    const meta=STMT_TYPE_MAP[row.type]??{label:row.type,cls:"text-white/50"};
                    return (
                      <tr key={i} className="border-b border-white/5 erp-table-row">
                        <td className="p-3 font-mono text-white/60 text-xs">{row.date}</td>
                        <td className="p-3"><span className={`text-xs font-bold ${meta.cls}`}>{meta.label}</span></td>
                        <td className="p-3 text-white/70">{row.description}{row.reference_no&&<span className="text-white/30 text-xs mr-2">{row.reference_no}</span>}</td>
                        <td className="p-3 text-blue-400 font-bold">{row.debit>0?formatCurrency(row.debit):"—"}</td>
                        <td className="p-3 text-emerald-400 font-bold">{row.credit>0?formatCurrency(row.credit):"—"}</td>
                        <td className={`p-3 font-black ${row.balance>=0?"text-white":"text-red-400"}`}>{formatCurrency(row.balance)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
