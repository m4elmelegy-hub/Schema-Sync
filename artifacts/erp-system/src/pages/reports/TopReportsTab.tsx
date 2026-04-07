import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package, Users, Truck } from "lucide-react";
import { api, authFetch, formatCurrency, TableSkeleton, DateFilterBar, getDateRange, DateMode, thisMonthStart, todayStr } from "./shared";

interface TopData {
  top_products:  Array<{ product_id:number;  product_name:string;  total_qty:number;    total_revenue:number; total_profit:number }>;
  top_customers: Array<{ customer_id:number|null; customer_name:string; total_revenue:number; invoice_count:number }>;
  top_suppliers: Array<{ supplier_id:number|null; supplier_name:string; total_purchases:number; invoice_count:number }>;
}

export default function TopReportsTab() {
  const [mode,setMode]             = useState<DateMode>("month");
  const [customFrom,setCustomFrom] = useState(thisMonthStart());
  const [customTo,setCustomTo]     = useState(todayStr());
  const [dateFrom,dateTo]          = getDateRange(mode,customFrom,customTo);

  const { data, isLoading } = useQuery<TopData>({
    queryKey:["/api/reports/top",dateFrom,dateTo],
    queryFn:()=>authFetch(api(`/api/reports/top?date_from=${dateFrom}&date_to=${dateTo}&limit=10`)).then(async r=>{ if(!r.ok) throw new Error(`API Error: ${r.status}`); return r.json(); }),
    staleTime:60_000,
  });
  const topProducts  = data?.top_products  ?? [];
  const topCustomers = data?.top_customers ?? [];
  const topSuppliers = data?.top_suppliers ?? [];

  const TopTable = ({ title, icon, rows, cols }: { title:string; icon:React.ReactNode; rows:any[]; cols:{key:string;label:string;fmt?:(v:any)=>string;cls?:string}[] }) => (
    <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">{icon}<h3 className="text-white font-bold text-sm">{title}</h3></div>
      <table className="w-full text-right text-sm">
        <thead className="bg-white/5"><tr><th className="p-3 text-white/40 text-xs">#</th>{cols.map(c=><th key={c.key} className="p-3 text-white/40 text-xs">{c.label}</th>)}</tr></thead>
        <tbody>
          {isLoading ? <TableSkeleton cols={cols.length+1} rows={5}/> :
           rows.length===0 ? <tr><td colSpan={cols.length+1} className="p-8 text-center text-white/30 text-xs">لا توجد بيانات</td></tr> :
           rows.map((row,i)=>(
            <tr key={i} className="border-b border-white/5 erp-table-row">
              <td className="p-3"><span className="text-base">{["🥇","🥈","🥉"][i]??<span className="text-white/30 text-xs font-bold">#{i+1}</span>}</span></td>
              {cols.map(c=>(<td key={c.key} className={`p-3 font-bold ${c.cls??"text-white"}`}>{c.fmt?c.fmt(row[c.key]):row[c.key]}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4" style={{ fontFamily:"'Tajawal','Cairo',sans-serif" }}>
      <DateFilterBar mode={mode} setMode={setMode} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo}/>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TopTable title="أعلى المنتجات مبيعاً" icon={<Package className="w-4 h-4 text-amber-400"/>} rows={topProducts} cols={[
          {key:"product_name", label:"المنتج"},
          {key:"total_revenue",label:"المبيعات",fmt:v=>formatCurrency(v),cls:"text-emerald-400"},
          {key:"total_profit", label:"الربح",   fmt:v=>formatCurrency(v),cls:"text-amber-400"},
        ]}/>
        <TopTable title="أفضل العملاء" icon={<Users className="w-4 h-4 text-blue-400"/>} rows={topCustomers} cols={[
          {key:"customer_name", label:"العميل"},
          {key:"total_revenue", label:"المبيعات",fmt:v=>formatCurrency(v),cls:"text-emerald-400"},
          {key:"invoice_count", label:"الفواتير", cls:"text-white/50"},
        ]}/>
        <TopTable title="أكثر العملاء بمشتريات" icon={<Truck className="w-4 h-4 text-purple-400"/>} rows={topSuppliers} cols={[
          {key:"supplier_name",   label:"العميل"},
          {key:"total_purchases", label:"المشتريات",fmt:v=>formatCurrency(v),cls:"text-blue-400"},
          {key:"invoice_count",   label:"الفواتير",  cls:"text-white/50"},
        ]}/>
      </div>
    </div>
  );
}
