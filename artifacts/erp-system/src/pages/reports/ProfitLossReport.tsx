/**
 * ProfitLossReport — لوحة الأرباح والخسائر
 * Clean dashboard layout · Multi-branch · Lazy accordion sections
 */
import React, { useState, useMemo, useCallback, useRef } from "react";
import { useAppSettings } from "@/contexts/app-settings";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3, TrendingUp, TrendingDown, DollarSign,
  Printer, Building2, ChevronDown, FileDown, Lightbulb,
  HandCoins, CreditCard, Package, ArrowUpRight, ArrowDownRight,
  Minus, RotateCcw, ChevronRight,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, LabelList, ReferenceLine,
} from "recharts";
import {
  api, authFetch, formatCurrency, useCountUp,
  DATE_MODES, DateMode, getDateRange, getPrevRange,
  ProfitsData, EMPTY_PL, thisMonthStart, todayStr, fmtMonth, fmtDay,
  ChartTooltip,
} from "./shared";
import { printPLReport } from "@/lib/export-pdf";

/* ── Types ─────────────────────────────────────────────────────────────────── */
interface Warehouse { id: number; name: string; }

/* ── Palette ───────────────────────────────────────────────────────────────── */
const BRANCH_COLORS = ["#f59e0b","#3b82f6","#10b981","#8b5cf6","#f97316","#06b6d4","#ec4899","#ef4444"];
const CAT_COLORS    = ["#f59e0b","#ef4444","#3b82f6","#10b981","#8b5cf6","#f97316","#06b6d4","#ec4899","#84cc16","#6b7280"];

/* ── Helpers ───────────────────────────────────────────────────────────────── */
function pctChange(curr: number, prev: number): number | null {
  if (!prev) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function ChangePill({ curr, prev }: { curr: number; prev: number }) {
  const chg = pctChange(curr, prev);
  if (chg === null) return null;
  const up = chg >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold rounded-full px-2 py-0.5 ${up ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
      {up ? <ArrowUpRight className="w-3 h-3"/> : <ArrowDownRight className="w-3 h-3"/>}
      {up ? "+" : ""}{chg.toFixed(1)}%
    </span>
  );
}

function exportCSV(pl: ProfitsData, dateFrom: string, dateTo: string, branchLabel: string) {
  const rows: string[][] = [
    ["تقرير الأرباح والخسائر"], [`الفترة: ${dateFrom} — ${dateTo}`], [`الفرع: ${branchLabel}`], [],
    ["البند","القيمة"],
    ["إجمالي المبيعات", String(pl.total_revenue)], ["مبيعات نقدية", String(pl.cash_sales)],
    ["مبيعات آجلة", String(pl.credit_sales)], ["مبيعات جزئية", String(pl.partial_sales)],
    ["المرتجعات", String(pl.return_amount)], ["تكلفة البضاعة", String(pl.total_cost)],
    ["مجمل الربح", String(pl.gross_profit)], ["المصروفات", String(pl.total_expenses)],
    ["صافي الربح", String(pl.net_profit)], ["هامش الربح %", String(pl.profit_margin)], [],
    ["الفرع","المبيعات","التكلفة","مجمل الربح","الفواتير"],
    ...pl.by_warehouse.map(w=>[w.warehouse_name,String(w.revenue),String(w.cost),String(w.gross_profit),String(w.invoice_count)]),
  ];
  const csv = rows.map(r => r.map(c=>`"${c.replace(/"/g,'""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"}));
  const a = document.createElement("a"); a.href=url; a.download=`PL_${dateFrom}_${dateTo}.csv`; a.click(); URL.revokeObjectURL(url);
}

/* ── Accordion ─────────────────────────────────────────────────────────────── */
function Accordion({ title, icon, children, badge }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; badge?: string;
}) {
  const [open, setOpen]     = useState(false);
  const [mounted, setMounted] = useState(false);
  const toggle = () => {
    if (!mounted) setMounted(true);
    setOpen(o => !o);
  };
  return (
    <div className="rpt-panel rounded-2xl overflow-hidden">
      <button onClick={toggle}
        className="rpt-accordion-hd w-full flex items-center justify-between px-5 py-4 text-right transition-colors">
        <div className="flex items-center gap-2.5">
          <span className="text-white/60">{icon}</span>
          <span className="rpt-strong font-semibold text-sm">{title}</span>
          {badge && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">{badge}</span>}
        </div>
        <ChevronDown className={`w-4 h-4 text-white/30 transition-transform duration-200 ${open ? "rotate-180" : ""}`}/>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div key="body" initial={{ height:0, opacity:0 }} animate={{ height:"auto", opacity:1 }} exit={{ height:0, opacity:0 }}
            transition={{ duration:0.22, ease:"easeInOut" }} style={{ overflow:"hidden" }}>
            <div className="px-5 pb-5">
              {mounted && children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Branch Selector ───────────────────────────────────────────────────────── */
function BranchSelector({ warehouses, selected, onChange }: {
  warehouses: Warehouse[]; selected: number[]; onChange: (ids:number[])=>void;
}) {
  const [open, setOpen] = useState(false);
  const allSelected = selected.length === 0;
  const label = allSelected ? "جميع الفروع"
    : selected.length === 1 ? (warehouses.find(w=>w.id===selected[0])?.name ?? "فرع")
    : `${selected.length} فروع`;
  const toggle = (id:number) => {
    onChange(selected.includes(id) ? selected.filter(x=>x!==id) : [...selected,id]);
  };
  return (
    <div className="relative">
      <button onClick={()=>setOpen(o=>!o)}
        className="rpt-section flex items-center gap-2 px-3.5 py-2 rounded-xl border border-white/10 text-sm font-semibold text-white/80 hover:text-white hover:border-white/20 transition-all">
        <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0"/>
        <span className="rpt-strong">{label}</span>
        <ChevronDown className={`w-3 h-3 text-white/30 transition-transform ${open?"rotate-180":""}`}/>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{opacity:0,y:-6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-6}} transition={{duration:0.12}}
            className="rpt-dropdown absolute top-full mt-2 right-0 z-40 min-w-[200px] rounded-xl shadow-2xl overflow-hidden">
            <button onClick={()=>{onChange([]);setOpen(false);}}
              className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-right transition-colors ${allSelected?"text-amber-400 bg-amber-500/10":"text-white/60 hover:text-white hover:bg-white/4"}`}>
              <CheckBox checked={allSelected}/> جميع الفروع
            </button>
            {warehouses.length > 0 && <div className="h-px bg-white/8 mx-3"/>}
            {warehouses.map(w=>{
              const checked = selected.includes(w.id);
              return (
                <button key={w.id} onClick={()=>toggle(w.id)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-right transition-colors ${checked?"text-white bg-white/5":"text-white/60 hover:text-white hover:bg-white/4"}`}>
                  <CheckBox checked={checked}/> {w.name}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
      {open && <div className="fixed inset-0 z-30" onClick={()=>setOpen(false)}/>}
    </div>
  );
}
function CheckBox({ checked }: { checked: boolean }) {
  return (
    <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${checked?"bg-amber-500 border-amber-500":"border-white/25"}`}>
      {checked && <span className="text-black text-[9px] font-black leading-none">✓</span>}
    </div>
  );
}

/* ── 3 KPI Cards ───────────────────────────────────────────────────────────── */
function KPIStrip({ pl, prev }: { pl: ProfitsData; prev: ProfitsData }) {
  const kpis = [
    {
      label: "صافي الربح",
      value: pl.net_profit,
      prev: prev.net_profit,
      accent: pl.net_profit >= 0 ? "#10b981" : "#ef4444",
      sub: `هامش ${pl.profit_margin.toFixed(1)}%`,
      icon: <TrendingUp className="w-4 h-4"/>,
    },
    {
      label: "إجمالي المبيعات",
      value: pl.total_revenue,
      prev: prev.total_revenue,
      accent: "#f59e0b",
      sub: `${pl.invoice_count} فاتورة · ${pl.item_count} صنف`,
      icon: <BarChart3 className="w-4 h-4"/>,
    },
    {
      label: "إجمالي المصروفات",
      value: pl.total_expenses,
      prev: prev.total_expenses,
      accent: "#f97316",
      sub: pl.by_expense_category[0] ? `أعلى: ${pl.by_expense_category[0].category}` : undefined,
      icon: <DollarSign className="w-4 h-4"/>,
    },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {kpis.map((k, i) => <KPICard key={k.label} {...k} index={i}/>)}
    </div>
  );
}
function KPICard({ label, value, prev, accent, sub, icon, index }: {
  label:string; value:number; prev:number; accent:string; sub?:string; icon:React.ReactNode; index:number;
}) {
  const animated = useCountUp(value);
  const { settings } = useAppSettings();
  const isLight = (settings.theme ?? "dark") === "light";
  const numColor = accent === "#10b981" && value < 0 ? "#ef4444" : isLight ? "#0f172a" : "#ffffff";
  return (
    <motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} transition={{duration:0.35,delay:index*0.07}}
      className="rpt-panel rounded-2xl p-5"
      style={{ borderRight:`3px solid ${accent}` }}>
      <div className="flex items-center justify-between mb-3">
        <div className="p-2 rounded-lg" style={{ background:`${accent}18`, color:accent }}>{icon}</div>
        <ChangePill curr={value} prev={prev}/>
      </div>
      <p className="rpt-kpi-label mb-1">{label}</p>
      <p className="rpt-kpi-value" style={{ color:numColor }}>
        {formatCurrency(animated)}
      </p>
      {sub && <p className="rpt-kpi-sub">{sub}</p>}
    </motion.div>
  );
}

/* ── Sales vs Expenses Bar Chart ───────────────────────────────────────────── */
function SalesExpensesChart({ pl }: { pl: ProfitsData }) {
  const data = useMemo(() => {
    const months = [...pl.by_month].sort((a,b)=>a.month.localeCompare(b.month));
    if (months.length > 0) {
      return months.map(m => ({ name: fmtMonth(m.month), مبيعات: +m.revenue.toFixed(0), ربح: +m.profit.toFixed(0) }));
    }
    if (pl.by_warehouse.filter(w=>w.revenue>0).length > 1) {
      return pl.by_warehouse.filter(w=>w.revenue>0).map(w=>({
        name: w.warehouse_name.length>10 ? w.warehouse_name.slice(0,10)+"…" : w.warehouse_name,
        مبيعات: +w.revenue.toFixed(0), ربح: +w.gross_profit.toFixed(0),
      }));
    }
    return [];
  }, [pl]);

  if (data.length === 0) {
    return (
      <div className="rpt-section rounded-2xl p-8 flex flex-col items-center justify-center gap-2">
        <BarChart3 className="w-8 h-8 text-white/15"/>
        <p className="rpt-muted text-sm">لا توجد بيانات كافية للمخطط</p>
      </div>
    );
  }

  return (
    <div className="rpt-section rounded-2xl p-5">
      <p className="rpt-strong font-semibold text-sm mb-4">المبيعات والأرباح</p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{top:4,right:0,left:0,bottom:0}} barGap={3}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false}/>
          <XAxis dataKey="name" tick={{fill:"rgba(255,255,255,0.35)",fontSize:10,fontFamily:"Tajawal,Cairo,sans-serif"}} axisLine={false} tickLine={false}/>
          <YAxis tick={{fill:"rgba(255,255,255,0.3)",fontSize:9}} tickFormatter={v=>`${(v/1000).toFixed(0)}k`} width={34} axisLine={false} tickLine={false}/>
          <Tooltip content={<ChartTooltip/>}/>
          <Bar dataKey="مبيعات" fill="#f59e0b" radius={[4,4,0,0]} maxBarSize={36}/>
          <Bar dataKey="ربح"    fill="#10b981" radius={[4,4,0,0]} maxBarSize={36}/>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex gap-5 justify-center mt-2">
        {[{c:"#f59e0b",l:"المبيعات"},{c:"#10b981",l:"الأرباح"}].map(x=>(
          <div key={x.l} className="flex items-center gap-1.5 text-xs text-white/35">
            <div className="w-3 h-2 rounded-sm" style={{background:x.c}}/>
            {x.l}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Branch Comparison Table ───────────────────────────────────────────────── */
function BranchTable({ warehouses }: { warehouses: ProfitsData["by_warehouse"] }) {
  if (!warehouses.length) return null;
  const topRev = Math.max(...warehouses.map(w=>w.revenue), 1);
  return (
    <div className="rpt-section rounded-2xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-white/8 flex items-center gap-2">
        <Building2 className="w-4 h-4 text-amber-400"/>
        <span className="rpt-strong font-semibold text-sm">مقارنة الفروع</span>
        <span className="rpt-muted text-xs mr-auto">{warehouses.length} فرع</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-right text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-white/6">
              <th className="rpt-th">الفرع</th>
              <th className="rpt-th text-left">المبيعات</th>
              <th className="rpt-th text-left">التكلفة</th>
              <th className="rpt-th text-left">مجمل الربح</th>
              <th className="rpt-th text-left">الهامش</th>
              <th className="rpt-th text-left">الفواتير</th>
              <th className="rpt-th w-28">الأداء</th>
            </tr>
          </thead>
          <tbody>
            {warehouses.map((w, i) => {
              const margin = w.revenue > 0 ? (w.gross_profit / w.revenue) * 100 : 0;
              const barPct  = (w.revenue / topRev) * 100;
              const isTop   = i === 0 && w.revenue > 0;
              const mgColor = margin >= 30 ? "text-emerald-400 bg-emerald-500/12" : margin >= 15 ? "text-amber-400 bg-amber-500/12" : "text-red-400 bg-red-500/10";
              return (
                <tr key={w.warehouse_id} className="erp-table-row border-b border-white/5 transition-colors">
                  <td className="rpt-td">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{background:BRANCH_COLORS[i%BRANCH_COLORS.length]}}/>
                      <span className="rpt-strong font-semibold">{w.warehouse_name}</span>
                      {isTop && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-bold">الأعلى</span>}
                    </div>
                  </td>
                  <td className="rpt-td rpt-td-num font-bold tabular-nums">{formatCurrency(w.revenue)}</td>
                  <td className="rpt-td rpt-muted tabular-nums">{formatCurrency(w.cost)}</td>
                  <td className="rpt-td font-bold tabular-nums">
                    <span className={w.gross_profit >= 0 ? "text-emerald-400" : "text-red-400"}>{formatCurrency(w.gross_profit)}</span>
                  </td>
                  <td className="rpt-td">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${mgColor}`}>{margin.toFixed(1)}%</span>
                  </td>
                  <td className="rpt-td rpt-muted tabular-nums">{w.invoice_count}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{background:"rgba(255,255,255,0.06)"}}>
                        <div className="h-full rounded-full" style={{width:`${barPct}%`, background:BRANCH_COLORS[i%BRANCH_COLORS.length], transition:"width 0.6s ease"}}/>
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {warehouses.length > 1 && (
            <tfoot>
              <tr className="border-t border-white/10">
                <td className="px-5 py-3 text-white/40 text-xs font-medium">الإجمالي</td>
                <td className="px-5 py-3 font-black text-white tabular-nums">{formatCurrency(warehouses.reduce((s,w)=>s+w.revenue,0))}</td>
                <td className="px-5 py-3 text-white/40 tabular-nums">{formatCurrency(warehouses.reduce((s,w)=>s+w.cost,0))}</td>
                <td className="px-5 py-3 font-black text-emerald-400 tabular-nums">{formatCurrency(warehouses.reduce((s,w)=>s+w.gross_profit,0))}</td>
                <td colSpan={3}/>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/* ── [Accordion body] Sales Breakdown ─────────────────────────────────────── */
function SalesBreakdown({ pl }: { pl: ProfitsData }) {
  const segments = [
    { label:"نقدي",  value:pl.cash_sales,    color:"#10b981", icon:<HandCoins className="w-3.5 h-3.5"/> },
    { label:"آجل",   value:pl.credit_sales,  color:"#3b82f6", icon:<CreditCard className="w-3.5 h-3.5"/> },
    { label:"جزئي",  value:pl.partial_sales, color:"#f59e0b", icon:<Minus className="w-3.5 h-3.5"/> },
    { label:"مرتجع", value:pl.return_amount, color:"#ef4444", icon:<RotateCcw className="w-3.5 h-3.5"/> },
  ].filter(s=>s.value>0);
  const total = pl.total_revenue + pl.return_amount;
  if (!segments.length) return <p className="text-white/30 text-sm py-4 text-center">لا توجد بيانات</p>;
  return (
    <div className="space-y-4 pt-1">
      {/* Proportion bar */}
      <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5">
        {segments.filter(s=>s.label!=="مرتجع").map(s=>(
          <div key={s.label} className="h-full transition-all duration-700" style={{ flexGrow: total>0?s.value/total:0, background:s.color, minWidth: s.value>0?"2px":"0" }}/>
        ))}
      </div>
      {/* Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {segments.map(s=>{
          const pct = total > 0 ? (s.value/total)*100 : 0;
          return (
            <div key={s.label} className="rounded-xl p-3.5 border" style={{background:`${s.color}0d`,borderColor:`${s.color}25`}}>
              <div className="flex items-center gap-1.5 mb-2" style={{color:s.color}}>{s.icon}<span className="text-xs font-semibold">{s.label}</span></div>
              <p className="text-white font-black text-sm tabular-nums">{formatCurrency(s.value)}</p>
              <p className="text-xs mt-0.5" style={{color:`${s.color}99`}}>{pct.toFixed(1)}%</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── [Accordion body] Expense Breakdown ──────────────────────────────────── */
function ExpenseBreakdown({ data, total }: { data: ProfitsData["by_expense_category"]; total: number }) {
  if (!data.length) return <p className="text-white/30 text-sm py-4 text-center">لا توجد مصروفات</p>;
  return (
    <div className="flex flex-col sm:flex-row gap-5 pt-1">
      <ResponsiveContainer width={160} height={160}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={44} outerRadius={72} dataKey="total" strokeWidth={0}>
            {data.map((_,i)=><Cell key={i} fill={CAT_COLORS[i%CAT_COLORS.length]}/>)}
          </Pie>
          <Tooltip contentStyle={{background:"rgba(10,18,35,0.97)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,fontSize:11}} formatter={(v:number)=>[formatCurrency(v),""]}/>
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-2">
        {data.slice(0,8).map((item,i)=>{
          const pct = total>0?(item.total/total)*100:0;
          return (
            <div key={item.category} className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full shrink-0" style={{background:CAT_COLORS[i%CAT_COLORS.length]}}/>
              <span className="text-white/60 text-xs flex-1 truncate">{item.category}</span>
              <div className="w-16 h-1 rounded-full overflow-hidden" style={{background:"rgba(255,255,255,0.06)"}}>
                <div className="h-full rounded-full" style={{width:`${pct}%`,background:CAT_COLORS[i%CAT_COLORS.length]}}/>
              </div>
              <span className="text-white/40 text-xs w-8 text-left">{pct.toFixed(0)}%</span>
              <span className="text-white/70 text-xs font-bold tabular-nums">{formatCurrency(item.total)}</span>
            </div>
          );
        })}
        {data.length>8 && <p className="text-white/25 text-xs pt-1">+{data.length-8} فئات أخرى</p>}
      </div>
    </div>
  );
}

/* ── [Accordion body] Top Products ───────────────────────────────────────── */
const MEDALS = ["🥇","🥈","🥉"];
function TopProducts({ products }: { products: ProfitsData["by_product"] }) {
  const top = useMemo(()=>[...products].sort((a,b)=>b.profit-a.profit).slice(0,5),[products]);
  if (!top.length) return <p className="text-white/30 text-sm py-4 text-center">لا توجد منتجات</p>;
  return (
    <div className="space-y-2.5 pt-1">
      {top.map((p,i)=>{
        const margin = p.revenue>0?(p.profit/p.revenue)*100:0;
        const accent = margin>=50?"#10b981":margin>=30?"#f59e0b":"#ef4444";
        return (
          <div key={p.product_id} className="rpt-panel flex items-center gap-3 p-3.5 rounded-xl">
            <span className="text-xl shrink-0">{MEDALS[i]??`#${i+1}`}</span>
            <div className="flex-1 min-w-0">
              <p className="rpt-strong font-semibold text-sm truncate">{p.product_name}</p>
              <p className="rpt-muted text-xs">{p.qty_sold} وحدة</p>
            </div>
            <div className="text-left shrink-0">
              <p className="font-black text-sm tabular-nums" style={{color:accent}}>{formatCurrency(p.profit)}</p>
              <p className="text-xs" style={{color:`${accent}88`}}>هامش {margin.toFixed(1)}%</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── [Accordion body] Insights ───────────────────────────────────────────── */
function InsightsContent({ pl }: { pl: ProfitsData }) {
  const topBranch  = useMemo(()=>[...pl.by_warehouse].sort((a,b)=>b.gross_profit-a.gross_profit)[0],[pl.by_warehouse]);
  const topExpCat  = pl.by_expense_category[0];
  const avgMargin  = pl.total_revenue>0?(pl.gross_profit/pl.total_revenue)*100:0;
  const items: { icon:string; text:string; color:string }[] = [];
  if (topBranch?.revenue>0) items.push({icon:"🏆",text:`أفضل فرع: ${topBranch.warehouse_name} — ربح ${formatCurrency(topBranch.gross_profit)}`,color:"text-amber-300"});
  if (topExpCat)             items.push({icon:"💸",text:`أعلى مصروف: ${topExpCat.category} — ${formatCurrency(topExpCat.total)}`,color:"text-orange-300"});
  if (avgMargin<15&&pl.total_revenue>0) items.push({icon:"📉",text:`هامش الربح منخفض (${avgMargin.toFixed(1)}%) — راجع تكاليف البضاعة`,color:"text-red-300"});
  if (pl.return_amount>pl.total_revenue*0.1&&pl.total_revenue>0) items.push({icon:"🔄",text:`نسبة مرتجعات مرتفعة: ${((pl.return_amount/pl.total_revenue)*100).toFixed(1)}%`,color:"text-orange-300"});
  if (pl.credit_sales>pl.cash_sales&&pl.credit_sales>0) items.push({icon:"💳",text:"المبيعات الآجلة أعلى من النقدية — تابع الديون بانتظام",color:"text-blue-300"});
  if (!items.length) return <p className="text-white/30 text-sm py-4 text-center">لا توجد رؤى لهذه الفترة</p>;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
      {items.map((ins,i)=>(
        <div key={i} className="rpt-panel flex items-start gap-3 p-3.5 rounded-xl">
          <span className="text-lg shrink-0">{ins.icon}</span>
          <p className={`text-xs leading-relaxed font-medium ${ins.color}`}>{ins.text}</p>
        </div>
      ))}
    </div>
  );
}

/* ── [Accordion body] Charts ─────────────────────────────────────────────── */
function ChartsContent({ pl, prev, currLabel, prevLabel }: { pl:ProfitsData; prev:ProfitsData; currLabel:string; prevLabel:string }) {
  const [tab, setTab] = useState<"trend"|"waterfall"|"compare">("trend");
  return (
    <div className="pt-1">
      {/* Tab bar */}
      <div className="rpt-tab-bar flex gap-1 p-1 mb-4">
        {([{id:"trend" as const,label:"الأداء الزمني"},{id:"waterfall" as const,label:"تدفق الأرباح"},{id:"compare" as const,label:"مقارنة الفترات"}]).map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            className={`rpt-tab flex-1 ${tab===t.id?"active":""}`}>{t.label}</button>
        ))}
      </div>
      {tab==="trend"     && <TrendTab pl={pl}/>}
      {tab==="waterfall" && <WaterfallTab pl={pl}/>}
      {tab==="compare"   && <CompareTab curr={pl} prev={prev} currLabel={currLabel} prevLabel={prevLabel}/>}
    </div>
  );
}

function TrendTab({ pl }: { pl: ProfitsData }) {
  const [view, setView] = useState<"month"|"day">("month");
  const data = useMemo(()=>{
    if (view==="day") return [...pl.by_day].sort((a,b)=>a.day.localeCompare(b.day)).map(d=>({name:fmtDay(d.day),إيرادات:+d.revenue.toFixed(0),ربح:+d.profit.toFixed(0)}));
    return [...pl.by_month].sort((a,b)=>a.month.localeCompare(b.month)).map(m=>({name:fmtMonth(m.month),إيرادات:+m.revenue.toFixed(0),ربح:+m.profit.toFixed(0)}));
  },[view,pl]);
  if (!data.length) return <p className="text-white/30 text-sm py-6 text-center">لا توجد بيانات</p>;
  return (
    <div>
      <div className="flex justify-end mb-3">
        <div className="rpt-tab-bar flex gap-1 p-0.5">
          {([{id:"month" as const,l:"شهري"},{id:"day" as const,l:"يومي"}]).map(t=>(
            <button key={t.id} onClick={()=>setView(t.id)} className={`rpt-tab ${view===t.id?"active text-amber-400":""}`}>{t.l}</button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{top:4,right:0,left:0,bottom:0}}>
          <defs>
            <linearGradient id="gRev2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25}/><stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/></linearGradient>
            <linearGradient id="gProf2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false}/>
          <XAxis dataKey="name" tick={{fill:"rgba(255,255,255,0.3)",fontSize:10,fontFamily:"Tajawal,Cairo,sans-serif"}} axisLine={false} tickLine={false}/>
          <YAxis tick={{fill:"rgba(255,255,255,0.3)",fontSize:9}} tickFormatter={v=>`${(v/1000).toFixed(0)}k`} width={34} axisLine={false} tickLine={false}/>
          <Tooltip content={<ChartTooltip/>}/>
          <Area type="monotone" dataKey="إيرادات" stroke="#f59e0b" strokeWidth={2} fill="url(#gRev2)" dot={false}/>
          <Area type="monotone" dataKey="ربح"     stroke="#10b981" strokeWidth={2} fill="url(#gProf2)" dot={false}/>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const WF_CLR = { revenue:"#10b981", cost:"#ef4444", grossPos:"#f59e0b", expenses:"#f97316", netPos:"#10b981", netNeg:"#ef4444" };
function WaterfallTab({ pl }: { pl: ProfitsData }) {
  const {total_revenue:rev,total_cost:cost,gross_profit:gross,total_expenses:exp,net_profit:net} = pl;
  const data = [
    {name:"المبيعات",       displayVal:rev,            base:0,                fill:WF_CLR.revenue,                    label:`+${formatCurrency(rev)}`},
    {name:"التكلفة",        displayVal:cost,           base:Math.max(gross,0),fill:WF_CLR.cost,                       label:`-${formatCurrency(cost)}`},
    {name:"مجمل الربح",    displayVal:Math.abs(gross), base:gross>=0?0:gross, fill:gross>=0?WF_CLR.grossPos:"#ef4444", label:`=${formatCurrency(gross)}`, r:true},
    {name:"المصروفات",     displayVal:exp,             base:Math.max(net,0),  fill:WF_CLR.expenses,                   label:`-${formatCurrency(exp)}`},
    {name:"صافي الربح",   displayVal:Math.abs(net),   base:net>=0?0:net,     fill:net>=0?WF_CLR.netPos:WF_CLR.netNeg, label:`=${formatCurrency(net)}`, r:true},
  ];
  const maxD = Math.max(rev,cost,Math.abs(gross),exp,Math.abs(net),1);
  const lbl = (props:any) => {
    const {x,y,width,height,index}=props; const item=data[index]; if(!item) return null;
    const cx=x+width/2; const cy=height>22?y+height/2:y-7;
    return <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.85)" fontSize={9} fontWeight={700} fontFamily="Tajawal,Cairo,sans-serif">{item.label}</text>;
  };
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{top:14,right:8,left:8,bottom:0}} barCategoryGap="18%">
        <XAxis dataKey="name" tick={{fill:"rgba(255,255,255,0.35)",fontSize:9,fontFamily:"Tajawal,Cairo,sans-serif"}} axisLine={false} tickLine={false}/>
        <YAxis hide domain={[Math.min(net<0?net:0,0)*1.1,maxD*1.2]}/>
        <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)"/>
        <Bar dataKey="base" stackId="wf" fill="transparent" isAnimationActive={false}/>
        <Bar dataKey="displayVal" stackId="wf" radius={[4,4,0,0]} animationDuration={700}>
          {data.map((e,i)=><Cell key={i} fill={e.fill}/>)}
          <LabelList content={lbl}/>
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function CompareTab({ curr, prev, currLabel, prevLabel }: {curr:ProfitsData;prev:ProfitsData;currLabel:string;prevLabel:string}) {
  const rows = [
    {label:"إجمالي المبيعات", curr:curr.total_revenue, prev:prev.total_revenue},
    {label:"تكلفة البضاعة",   curr:curr.total_cost,    prev:prev.total_cost},
    {label:"مجمل الربح",      curr:curr.gross_profit,  prev:prev.gross_profit},
    {label:"المصروفات",       curr:curr.total_expenses,prev:prev.total_expenses},
    {label:"صافي الربح",      curr:curr.net_profit,    prev:prev.net_profit},
  ];
  return (
    <div>
      <div className="flex justify-between text-xs text-white/35 mb-2 px-1">
        <span>{currLabel}</span><span>{prevLabel}</span>
      </div>
      {rows.map(r=>{
        const diff=r.curr-r.prev; const up=diff>=0; const chg=pctChange(r.curr,r.prev);
        return (
          <div key={r.label} className="flex items-center justify-between gap-3 py-2.5 rpt-divider last:border-0">
            <span className="rpt-muted text-xs">{r.label}</span>
            <div className="flex items-center gap-2">
              <span className="rpt-strong text-sm font-bold tabular-nums">{formatCurrency(r.curr)}</span>
              {chg!==null&&<span className={`text-xs font-semibold ${up?"text-emerald-400":"text-red-400"}`}>{up?"+":""}{chg.toFixed(1)}%</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Main Component ────────────────────────────────────────────────────────── */
export default function ProfitLossReport() {
  const [mode,setMode]             = useState<DateMode>("month");
  const [customFrom,setCustomFrom] = useState(thisMonthStart());
  const [customTo,setCustomTo]     = useState(todayStr());
  const [branches,setBranches]     = useState<number[]>([]);

  const [dateFrom,dateTo] = getDateRange(mode, customFrom, customTo);
  const [prevFrom,prevTo] = getPrevRange(dateFrom, dateTo);

  const { data:warehouses=[] } = useQuery<Warehouse[]>({
    queryKey:["/api/settings/warehouses"],
    queryFn: ()=>authFetch(api("/api/settings/warehouses")).then(r=>r.json()),
    staleTime:300_000,
  });

  const buildQS = useCallback((from:string,to:string,ids:number[]) => {
    let qs = `/api/profits?date_from=${from}&date_to=${to}`;
    if (ids.length>0) qs+=`&warehouse_ids=${ids.join(",")}`;
    return qs;
  },[]);

  const {data:plData,isLoading} = useQuery<ProfitsData>({
    queryKey:["/api/profits",dateFrom,dateTo,branches.join(",")],
    queryFn: ()=>authFetch(api(buildQS(dateFrom,dateTo,branches))).then(r=>r.json()),
    staleTime:60_000,
  });
  const {data:prevData} = useQuery<ProfitsData>({
    queryKey:["/api/profits",prevFrom,prevTo,branches.join(",")],
    queryFn: ()=>authFetch(api(buildQS(prevFrom,prevTo,branches))).then(r=>r.json()),
    staleTime:60_000, enabled:!!prevFrom,
  });

  const pl   = plData   ? {...EMPTY_PL,...plData}   : EMPTY_PL;
  const prev = prevData ? {...EMPTY_PL,...prevData}  : EMPTY_PL;

  const branchLabel = branches.length===0 ? "جميع الفروع"
    : branches.map(id=>warehouses.find(w=>w.id===id)?.name??String(id)).join(", ");
  const currLabel = `${dateFrom} → ${dateTo}`;
  const prevLabel = `${prevFrom} → ${prevTo}`;

  const hasData = pl.invoice_count>0 || pl.total_expenses>0;

  return (
    <div className="space-y-5" dir="rtl" style={{fontFamily:"'Tajawal','Cairo',sans-serif"}}>

      {/* ── Top bar ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Date pills */}
        <div className="flex flex-wrap gap-1.5">
          {DATE_MODES.map(m=>(
            <button key={m.id} onClick={()=>setMode(m.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${mode===m.id?"text-amber-300 border-amber-500/40":"text-white/40 border-white/8 hover:text-white/70 hover:border-white/15"}`}
              style={mode===m.id?{background:"rgba(245,158,11,0.12)"}:{background:"rgba(255,255,255,0.02)"}}>
              {m.label}
            </button>
          ))}
        </div>
        {mode==="custom"&&(
          <div className="flex items-center gap-2">
            <input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} className="glass-input rounded-xl px-3 py-1.5 text-sm text-white"/>
            <span className="text-white/25">←</span>
            <input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} className="glass-input rounded-xl px-3 py-1.5 text-sm text-white"/>
          </div>
        )}
        {/* Branch selector */}
        <BranchSelector warehouses={warehouses} selected={branches} onChange={setBranches}/>
        {/* Export */}
        <div className="flex gap-2 mr-auto">
          <button onClick={()=>exportCSV(pl,dateFrom,dateTo,branchLabel)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-emerald-500/25 text-emerald-400 hover:border-emerald-500/40 transition-all"
            style={{background:"rgba(16,185,129,0.08)"}}>
            <FileDown className="w-3.5 h-3.5"/> Excel
          </button>
          <button onClick={()=>printPLReport({dateFrom,dateTo,...pl})}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-blue-500/25 text-blue-400 hover:border-blue-500/40 transition-all"
            style={{background:"rgba(59,130,246,0.08)"}}>
            <Printer className="w-3.5 h-3.5"/> PDF
          </button>
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <KPIStrip pl={pl} prev={prev}/>

      {/* ── Main content ── */}
      {hasData ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <SalesExpensesChart pl={pl}/>
            <BranchTable warehouses={pl.by_warehouse}/>
          </div>

          {/* ── Accordion sections ── */}
          <div className="space-y-3">
            <Accordion title="تفصيل المبيعات" icon={<TrendingUp className="w-4 h-4"/>}>
              <SalesBreakdown pl={pl}/>
            </Accordion>

            <Accordion
              title="توزيع المصروفات"
              icon={<DollarSign className="w-4 h-4"/>}
              badge={pl.by_expense_category.length>0?`${pl.by_expense_category.length} فئة`:undefined}>
              <ExpenseBreakdown data={pl.by_expense_category} total={pl.total_expenses}/>
            </Accordion>

            <Accordion
              title="أعلى المنتجات ربحية"
              icon={<Package className="w-4 h-4"/>}
              badge={pl.by_product.length>0?`${Math.min(pl.by_product.length,5)} منتجات`:undefined}>
              <TopProducts products={pl.by_product}/>
            </Accordion>

            <Accordion title="رؤى تحليلية" icon={<Lightbulb className="w-4 h-4"/>}>
              <InsightsContent pl={pl}/>
            </Accordion>

            <Accordion title="المخططات التفصيلية" icon={<BarChart3 className="w-4 h-4"/>}>
              <ChartsContent pl={pl} prev={prev} currLabel={currLabel} prevLabel={prevLabel}/>
            </Accordion>
          </div>
        </>
      ) : (
        !isLoading && (
          <div className="rpt-section rounded-2xl p-14 flex flex-col items-center gap-3">
            <BarChart3 className="w-10 h-10 text-white/15"/>
            <p className="rpt-strong font-semibold">لا توجد بيانات للفترة المحددة</p>
            <p className="rpt-muted text-xs">جرّب تغيير النطاق الزمني أو الفرع</p>
          </div>
        )
      )}
    </div>
  );
}
