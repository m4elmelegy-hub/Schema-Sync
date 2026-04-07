import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api, authFetch, formatCurrency, TableSkeleton, DateFilterBar, getDateRange, DateMode, thisMonthStart, todayStr } from "./shared";

interface ProductProfitData {
  products: Array<{ product_id:number; product_name:string; qty_sold:number; revenue:number; cogs:number; profit:number; profit_margin:number }>;
  summary: { total_revenue:number; total_cogs:number; total_profit:number; overall_margin:number };
}

export default function ProductProfitReport() {
  const [mode,setMode]             = useState<DateMode>("month");
  const [customFrom,setCustomFrom] = useState(thisMonthStart());
  const [customTo,setCustomTo]     = useState(todayStr());
  const [search,setSearch]         = useState("");
  const [sort,setSort]             = useState<"profit"|"revenue"|"margin"|"qty">("profit");
  const [dateFrom,dateTo]          = getDateRange(mode,customFrom,customTo);

  const { data, isLoading } = useQuery<ProductProfitData>({
    queryKey:["/api/reports/product-profit",dateFrom,dateTo],
    queryFn:()=>authFetch(api(`/api/reports/product-profit?date_from=${dateFrom}&date_to=${dateTo}`)).then(async r=>{ if(!r.ok) throw new Error(`API Error: ${r.status}`); return r.json(); }),
    staleTime:60_000,
  });

  const products = useMemo(()=>{
    let list = data?.products ?? [];
    if (search) list=list.filter(p=>p.product_name.includes(search));
    return [...list].sort((a,b)=>{
      if (sort==="profit")  return b.profit-a.profit;
      if (sort==="revenue") return b.revenue-a.revenue;
      if (sort==="margin")  return b.profit_margin-a.profit_margin;
      return b.qty_sold-a.qty_sold;
    });
  },[data,search,sort]);
  const summary = data?.summary ?? { total_revenue:0, total_cogs:0, total_profit:0, overall_margin:0 };

  return (
    <div className="space-y-4" style={{ fontFamily:"'Tajawal','Cairo',sans-serif" }}>
      <DateFilterBar mode={mode} setMode={setMode} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo}/>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label:"إجمالي المبيعات",   value:formatCurrency(summary.total_revenue),           color:summary.total_revenue>=0?"text-emerald-400":"text-red-400" },
          { label:"تكلفة البضاعة",     value:formatCurrency(summary.total_cogs),              color:"text-red-400" },
          { label:"إجمالي الربح",      value:formatCurrency(summary.total_profit),            color:summary.total_profit>=0?"text-amber-400":"text-red-400" },
          { label:"هامش الربح الكلي",  value:`${summary.overall_margin.toFixed(1)}%`,         color:summary.overall_margin>=20?"text-emerald-400":"text-red-400" },
        ].map(c=>(
          <div key={c.label} className="glass-panel rounded-2xl p-4 border border-white/5">
            <p className="text-white/40 text-xs mb-1">{c.label}</p>
            <p className={`text-lg font-black ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 max-w-xs"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30"/><input className="glass-input w-full pr-9 text-sm" placeholder="بحث بالمنتج..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
        <div className="flex gap-1">{(["profit","revenue","margin","qty"] as const).map(s=>(
          <button key={s} onClick={()=>setSort(s)} className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${sort===s?"bg-amber-500/20 border-amber-500/40 text-amber-400":"glass-panel border-white/10 text-white/50 hover:text-white"}`}>
            {s==="profit"?"الربح":s==="revenue"?"المبيعات":s==="margin"?"الهامش":"الكمية"}
          </button>
        ))}</div>
      </div>
      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr><th className="p-3 text-white/50">#</th><th className="p-3 text-white/50">المنتج</th><th className="p-3 text-white/50">الكمية المباعة</th><th className="p-3 text-white/50">إجمالي المبيعات</th><th className="p-3 text-white/50">تكلفة البضاعة</th><th className="p-3 text-white/50">الربح</th><th className="p-3 text-white/50">هامش الربح</th></tr>
            </thead>
            <tbody>
              {isLoading ? <TableSkeleton cols={7} rows={5}/> :
               products.length===0 ? <tr><td colSpan={7} className="p-12 text-center text-white/40">لا توجد بيانات</td></tr> :
               products.map((p,i)=>(
                <tr key={p.product_id} className="border-b border-white/5 erp-table-row">
                  <td className="p-3 text-white/30 text-xs">{i+1}</td>
                  <td className="p-3 text-white font-bold">{p.product_name}</td>
                  <td className="p-3 text-white/70">{p.qty_sold.toFixed(2)}</td>
                  <td className="p-3 text-emerald-400 font-bold">{formatCurrency(p.revenue)}</td>
                  <td className="p-3 text-red-400">{formatCurrency(p.cogs)}</td>
                  <td className={`p-3 font-black ${p.profit>=0?"text-amber-400":"text-red-400"}`}>{formatCurrency(p.profit)}</td>
                  <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${p.profit_margin>=30?"bg-emerald-500/20 border-emerald-500/30 text-emerald-400":p.profit_margin>=15?"bg-amber-500/20 border-amber-500/30 text-amber-400":"bg-red-500/20 border-red-500/30 text-red-400"}`}>{p.profit_margin.toFixed(1)}%</span></td>
                </tr>
              ))}
            </tbody>
            {products.length>0&&(
              <tfoot className="bg-white/5 border-t border-white/10">
                <tr>
                  <td colSpan={3} className="p-3 text-white/50 font-bold">الإجمالي ({products.length} منتج)</td>
                  <td className="p-3 font-black text-emerald-400">{formatCurrency(summary.total_revenue)}</td>
                  <td className="p-3 font-black text-red-400">{formatCurrency(summary.total_cogs)}</td>
                  <td className={`p-3 font-black ${summary.total_profit>=0?"text-amber-400":"text-red-400"}`}>{formatCurrency(summary.total_profit)}</td>
                  <td className="p-3 font-bold text-white/50">{summary.overall_margin.toFixed(1)}%</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
