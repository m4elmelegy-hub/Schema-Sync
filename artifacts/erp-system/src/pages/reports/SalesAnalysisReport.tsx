import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package, Users } from "lucide-react";
import { api, authFetch, formatCurrency, TableSkeleton, DateFilterBar, getDateRange, DateMode, thisMonthStart, todayStr } from "./shared";

interface SalesAnalysisData {
  by_product: Array<{ product_id:number; product_name:string; total_qty:number; total_revenue:number; avg_price:number; invoice_count:number }>;
  by_customer: Array<{ customer_id:number|null; customer_name:string; total_revenue:number; invoice_count:number }>;
}

export default function SalesAnalysisReport() {
  const [mode,setMode]             = useState<DateMode>("month");
  const [customFrom,setCustomFrom] = useState(thisMonthStart());
  const [customTo,setCustomTo]     = useState(todayStr());
  const [view,setView]             = useState<"product"|"customer">("product");
  const [topLimit,setTopLimit]     = useState<"all"|"5"|"10">("all");
  const [dateFrom,dateTo]          = getDateRange(mode,customFrom,customTo);

  const { data, isLoading } = useQuery<SalesAnalysisData>({
    queryKey:["/api/reports/sales-analysis",dateFrom,dateTo],
    queryFn:()=>authFetch(api(`/api/reports/sales-analysis?date_from=${dateFrom}&date_to=${dateTo}`)).then(async r=>{ if(!r.ok) throw new Error(`API Error: ${r.status}`); return r.json(); }),
    staleTime:60_000,
  });

  /* ── Sort by total_revenue DESC (default), then apply top-N limit ── */
  const byProductSorted = useMemo(() => {
    const sorted = [...(data?.by_product ?? [])].sort((a,b) => b.total_revenue - a.total_revenue);
    if (topLimit === "5")  return sorted.slice(0, 5);
    if (topLimit === "10") return sorted.slice(0, 10);
    return sorted;
  }, [data?.by_product, topLimit]);

  const byCustomer  = data?.by_customer ?? [];
  const totalByProd = (data?.by_product ?? []).reduce((s,p) => s + p.total_revenue, 0);
  const totalByCust = byCustomer.reduce((s,c) => s + c.total_revenue, 0);

  return (
    <div className="space-y-4" style={{ fontFamily:"'Tajawal','Cairo',sans-serif" }}>
      <DateFilterBar mode={mode} setMode={setMode} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo}/>
      <div className="flex bg-white/5 rounded-xl p-1 gap-1 w-fit">
        <button onClick={()=>setView("product")} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${view==="product"?"bg-amber-500/20 border border-amber-500/40 text-amber-400":"text-white/50 hover:text-white"}`}><Package className="w-4 h-4"/> حسب المنتج</button>
        <button onClick={()=>setView("customer")} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${view==="customer"?"bg-amber-500/20 border border-amber-500/40 text-amber-400":"text-white/50 hover:text-white"}`}><Users className="w-4 h-4"/> حسب العميل</button>
      </div>
      {view==="product" ? (
        <>
          {/* ── Quick sort + top-N controls ── */}
          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 rounded-xl text-xs font-bold border border-amber-500/40 bg-amber-500/15 text-amber-400 select-none">
              🏆 الأعلى مبيعًا
            </span>
            <select value={topLimit} onChange={e => setTopLimit(e.target.value as "all"|"5"|"10")}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-bold text-white/70 cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-400/40">
              <option value="all" className="bg-[#1a1a2e]">الكل</option>
              <option value="5"   className="bg-[#1a1a2e]">Top 5</option>
              <option value="10"  className="bg-[#1a1a2e]">Top 10</option>
            </select>
          </div>

          <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm whitespace-nowrap">
                <thead className="bg-white/5 border-b border-white/10"><tr><th className="p-3 text-white/50">#</th><th className="p-3 text-white/50">المنتج</th><th className="p-3 text-white/50">الكمية</th><th className="p-3 text-white/50">متوسط السعر</th><th className="p-3 text-white/50"><span title="مرتب حسب الأعلى مبيعًا" className="inline-flex items-center gap-1 cursor-default">إجمالي المبيعات <span className="text-amber-400">↓</span></span></th><th className="p-3 text-white/50">% من الإجمالي</th><th className="p-3 text-white/50">عدد الفواتير</th></tr></thead>
                <tbody>
                  {isLoading ? <TableSkeleton cols={7} rows={5}/> :
                   byProductSorted.length===0 ? <tr><td colSpan={7} className="p-12 text-center text-white/40">لا توجد بيانات</td></tr> :
                   byProductSorted.map((p,i)=>(
                    <tr key={p.product_id} className="border-b border-white/5 erp-table-row">
                      <td className="p-3 text-white/30 text-xs">{i+1}</td>
                      <td className="p-3 text-white font-bold">{p.product_name}</td>
                      <td className="p-3 text-white/70">{p.total_qty.toFixed(2)}</td>
                      <td className="p-3 text-white/70">{formatCurrency(p.avg_price)}</td>
                      <td className="p-3 text-emerald-400 font-bold">{formatCurrency(p.total_revenue)}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 bg-white/5 rounded-full flex-1 max-w-[80px] overflow-hidden"><div className="h-full bg-amber-400 rounded-full" style={{width:`${totalByProd>0?(p.total_revenue/totalByProd*100):0}%`}}/></div>
                          <span className="text-white/40 text-xs">{totalByProd>0?(p.total_revenue/totalByProd*100).toFixed(1):0}%</span>
                        </div>
                      </td>
                      <td className="p-3 text-white/50">{p.invoice_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm whitespace-nowrap">
              <thead className="bg-white/5 border-b border-white/10"><tr><th className="p-3 text-white/50">#</th><th className="p-3 text-white/50">العميل</th><th className="p-3 text-white/50">إجمالي المبيعات</th><th className="p-3 text-white/50">% من الإجمالي</th><th className="p-3 text-white/50">عدد الفواتير</th></tr></thead>
              <tbody>
                {isLoading ? <TableSkeleton cols={5} rows={5}/> :
                 byCustomer.length===0 ? <tr><td colSpan={5} className="p-12 text-center text-white/40">لا توجد بيانات</td></tr> :
                 byCustomer.map((c,i)=>(
                  <tr key={c.customer_id??i} className="border-b border-white/5 erp-table-row">
                    <td className="p-3 text-white/30 text-xs">{i+1}</td>
                    <td className="p-3 text-white font-bold">{c.customer_name}</td>
                    <td className="p-3 text-emerald-400 font-bold">{formatCurrency(c.total_revenue)}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 bg-white/5 rounded-full flex-1 max-w-[80px] overflow-hidden"><div className="h-full bg-blue-400 rounded-full" style={{width:`${totalByCust>0?(c.total_revenue/totalByCust*100):0}%`}}/></div>
                        <span className="text-white/40 text-xs">{totalByCust>0?(c.total_revenue/totalByCust*100).toFixed(1):0}%</span>
                      </div>
                    </td>
                    <td className="p-3 text-white/50">{c.invoice_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
