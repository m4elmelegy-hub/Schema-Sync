/**
 * ProfitLossReport — لوحة الأرباح والخسائر الشاملة
 * Multi-branch • Period comparison • Insights • Charts • Drill-down • Export
 */
import React, { useState, useMemo, useCallback } from "react";
import { useQuery }  from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3, TrendingUp, TrendingDown, DollarSign, ShoppingBag,
  Printer, Building2, ChevronDown, X, FileDown, Lightbulb,
  HandCoins, CreditCard, RotateCcw, Package, ArrowUpRight,
  ArrowDownRight, Minus, ChevronRight,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, ReferenceLine, LabelList,
} from "recharts";
import {
  api, authFetch, formatCurrency, useCountUp,
  DATE_MODES, DateMode, getDateRange, getPrevRange,
  ProfitsData, EMPTY_PL, thisMonthStart, todayStr, fmtMonth, fmtDay,
  ChartTooltip,
} from "./shared";
import { printPLReport } from "@/lib/export-pdf";

/* ─── Warehouse type ─────────────────────────────────────────────────────── */
interface Warehouse { id: number; name: string; address?: string | null; }

/* ─── Color palette ──────────────────────────────────────────────────────── */
const DONUT_COLORS = ["#f59e0b","#ef4444","#3b82f6","#10b981","#8b5cf6","#f97316","#06b6d4","#ec4899","#84cc16","#6b7280"];
const BRANCH_COLORS = ["#f59e0b","#3b82f6","#10b981","#8b5cf6","#f97316","#06b6d4","#ec4899","#ef4444","#84cc16"];

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}
function ChangePill({ curr, prev }: { curr: number; prev: number }) {
  const chg = pctChange(curr, prev);
  if (chg === null) return null;
  const pos = chg >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold rounded-full px-2 py-0.5 ${pos ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
      {pos ? <ArrowUpRight className="w-3 h-3"/> : <ArrowDownRight className="w-3 h-3"/>}
      {pos ? "+" : ""}{chg.toFixed(1)}%
    </span>
  );
}
function DeltaRow({ label, curr, prev }: { label: string; curr: number; prev: number }) {
  const diff = curr - prev;
  const pos  = diff >= 0;
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-white/5 last:border-0">
      <span className="text-white/50 text-xs">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-white text-xs font-bold tabular-nums">{formatCurrency(curr)}</span>
        {prev !== curr && (
          <span className={`text-xs font-bold tabular-nums ${pos ? "text-emerald-400" : "text-red-400"}`}>
            {pos ? "+" : ""}{formatCurrency(diff)}
          </span>
        )}
        <ChangePill curr={curr} prev={prev}/>
      </div>
    </div>
  );
}

/* ─── Excel export helper ─────────────────────────────────────────────────── */
function exportPLExcel(pl: ProfitsData, dateFrom: string, dateTo: string, warehouseLabel: string) {
  const rows: string[][] = [
    ["تقرير الأرباح والخسائر"],
    [`الفترة: ${dateFrom} — ${dateTo}`],
    [`الفرع: ${warehouseLabel}`],
    [],
    ["البند", "القيمة"],
    ["إجمالي المبيعات",       String(pl.total_revenue)],
    ["مبيعات نقدية",          String(pl.cash_sales)],
    ["مبيعات آجلة",           String(pl.credit_sales)],
    ["مبيعات جزئية",          String(pl.partial_sales)],
    ["المرتجعات",             String(pl.return_amount)],
    ["تكلفة البضاعة المباعة", String(pl.total_cost)],
    ["مجمل الربح",            String(pl.gross_profit)],
    ["إجمالي المصروفات",      String(pl.total_expenses)],
    ["صافي الربح",            String(pl.net_profit)],
    ["هامش الربح %",          String(pl.profit_margin)],
    [],
    ["المصروفات حسب الفئة"],
    ["الفئة", "المبلغ"],
    ...pl.by_expense_category.map(e => [e.category, String(e.total)]),
    [],
    ["الأداء حسب الفرع"],
    ["الفرع", "المبيعات", "التكلفة", "مجمل الربح", "عدد الفواتير"],
    ...pl.by_warehouse.map(w => [w.warehouse_name, String(w.revenue), String(w.cost), String(w.gross_profit), String(w.invoice_count)]),
  ];
  const csv = rows.map(r => r.map(c => `"${c.replace(/"/g,'""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a"); a.href = url; a.download = `PL_${dateFrom}_${dateTo}.csv`; a.click(); URL.revokeObjectURL(url);
}

/* ─── KPI Card ───────────────────────────────────────────────────────────── */
function KPICard({ label, value, prev, icon, color, sub, index }: {
  label: string; value: number; prev?: number; icon: React.ReactNode;
  color: string; sub?: string; index: number;
}) {
  const animated = useCountUp(value);
  return (
    <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.4, delay:index*0.08 }}
      className={`glass-panel rounded-2xl p-4 border-r-4 border-t border-b border-l border-white/5 ${color}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="p-2 rounded-xl bg-white/5">{icon}</div>
        {prev !== undefined && <ChangePill curr={value} prev={prev}/>}
      </div>
      <p className="text-white/50 text-xs mb-1">{label}</p>
      <p className="text-2xl font-black text-white tabular-nums">{formatCurrency(animated)}</p>
      {sub && <p className="text-white/30 text-xs mt-1">{sub}</p>}
    </motion.div>
  );
}

function MarginCard({ margin, prev, index }: { margin: number; prev: number; index: number }) {
  const animated = useCountUp(margin);
  const chg = pctChange(margin, prev);
  const color = margin >= 30 ? "text-emerald-400" : margin >= 15 ? "text-amber-400" : "text-red-400";
  const bg    = margin >= 30 ? "border-r-emerald-500" : margin >= 15 ? "border-r-amber-500" : "border-r-red-500";
  return (
    <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.4, delay:index*0.08 }}
      className={`glass-panel rounded-2xl p-4 border-r-4 border-t border-b border-l border-white/5 ${bg}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="p-2 rounded-xl bg-white/5"><BarChart3 className="w-4 h-4 text-amber-400"/></div>
        {chg !== null && (
          <span className={`text-xs font-bold rounded-full px-2 py-0.5 ${chg >= 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
            {chg >= 0 ? "+" : ""}{chg.toFixed(1)}pp
          </span>
        )}
      </div>
      <p className="text-white/50 text-xs mb-1">هامش الربح</p>
      <p className={`text-2xl font-black tabular-nums ${color}`}>{animated.toFixed(1)}%</p>
      <div className="mt-2 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <motion.div className={`h-full rounded-full ${margin >= 30 ? "bg-emerald-500" : margin >= 15 ? "bg-amber-500" : "bg-red-500"}`}
          initial={{ width:"0%" }} animate={{ width:`${Math.min(Math.max(margin, 0), 100)}%` }} transition={{ duration:1, ease:"easeOut", delay:index*0.08+0.3 }}/>
      </div>
    </motion.div>
  );
}

/* ─── Branch Selector ─────────────────────────────────────────────────────── */
function BranchSelector({ warehouses, selected, onChange }: {
  warehouses: Warehouse[];
  selected: number[];   // empty = all
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const allSelected = selected.length === 0;
  const label = allSelected
    ? "جميع الفروع"
    : selected.length === 1
      ? (warehouses.find(w => w.id === selected[0])?.name ?? "فرع واحد")
      : `${selected.length} فروع`;

  const toggle = (id: number) => {
    if (selected.includes(id)) {
      const next = selected.filter(x => x !== id);
      onChange(next);
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl glass-panel border border-white/10 text-sm font-bold text-white/80 hover:text-white hover:border-white/20 transition-all min-w-[160px]">
        <Building2 className="w-4 h-4 text-amber-400 shrink-0"/>
        <span className="flex-1 text-right">{label}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-white/40 transition-transform ${open ? "rotate-180" : ""}`}/>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity:0, y:-8, scale:0.97 }} animate={{ opacity:1, y:0, scale:1 }} exit={{ opacity:0, y:-8, scale:0.97 }}
            transition={{ duration:0.15 }}
            className="absolute top-full mt-2 right-0 z-30 min-w-[220px] glass-panel border border-white/10 rounded-2xl shadow-2xl p-2 overflow-hidden">
            <button onClick={() => { onChange([]); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-all text-right ${allSelected ? "bg-amber-500/20 text-amber-400" : "text-white/60 hover:bg-white/5 hover:text-white"}`}>
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${allSelected ? "bg-amber-500 border-amber-500" : "border-white/20"}`}>
                {allSelected && <span className="text-black text-xs font-black">✓</span>}
              </div>
              جميع الفروع
            </button>
            <div className="h-px bg-white/8 my-1"/>
            {warehouses.map(w => {
              const checked = selected.includes(w.id);
              return (
                <button key={w.id} onClick={() => toggle(w.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all text-right ${checked ? "bg-white/8 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"}`}>
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${checked ? "bg-amber-500 border-amber-500" : "border-white/20"}`}>
                    {checked && <span className="text-black text-xs font-black">✓</span>}
                  </div>
                  <span className="flex-1 truncate">{w.name}</span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
      {open && <div className="fixed inset-0 z-20" onClick={() => setOpen(false)}/>}
    </div>
  );
}

/* ─── Branch Comparison Table ─────────────────────────────────────────────── */
function BranchTable({ warehouses, drillId, onDrill }: {
  warehouses: ProfitsData["by_warehouse"];
  drillId: number | null;
  onDrill: (id: number | null) => void;
}) {
  if (!warehouses.length) return null;
  const topRevenue = Math.max(...warehouses.map(w => w.revenue), 1);
  return (
    <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden" style={{ fontFamily:"'Tajawal','Cairo',sans-serif" }}>
      <div className="px-5 py-3 border-b border-white/10 flex items-center gap-2">
        <Building2 className="w-4 h-4 text-amber-400"/>
        <h3 className="text-white font-bold text-sm">مقارنة الفروع</h3>
        <span className="text-white/30 text-xs mr-auto">{warehouses.length} فرع</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-right text-sm whitespace-nowrap">
          <thead className="bg-white/3">
            <tr>
              <th className="px-5 py-3 text-white/50 font-medium text-xs">الفرع</th>
              <th className="px-5 py-3 text-white/50 font-medium text-xs">المبيعات</th>
              <th className="px-5 py-3 text-white/50 font-medium text-xs">التكلفة</th>
              <th className="px-5 py-3 text-white/50 font-medium text-xs">مجمل الربح</th>
              <th className="px-5 py-3 text-white/50 font-medium text-xs">الهامش</th>
              <th className="px-5 py-3 text-white/50 font-medium text-xs">الفواتير</th>
              <th className="px-5 py-3 text-white/50 font-medium text-xs w-36">الأداء</th>
            </tr>
          </thead>
          <tbody>
            {warehouses.map((w, i) => {
              const margin = w.revenue > 0 ? (w.gross_profit / w.revenue) * 100 : 0;
              const barPct = topRevenue > 0 ? (w.revenue / topRevenue) * 100 : 0;
              const isTop  = i === 0 && w.revenue > 0;
              return (
                <tr key={w.warehouse_id}
                  onClick={() => onDrill(drillId === w.warehouse_id ? null : w.warehouse_id)}
                  className={`border-b border-white/5 cursor-pointer transition-colors ${drillId === w.warehouse_id ? "bg-amber-500/8" : "hover:bg-white/3"}`}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: BRANCH_COLORS[i % BRANCH_COLORS.length] }}/>
                      <span className="font-bold text-white">{w.warehouse_name}</span>
                      {isTop && <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold">🏆 الأعلى</span>}
                    </div>
                  </td>
                  <td className="px-5 py-3 font-bold text-emerald-400">{formatCurrency(w.revenue)}</td>
                  <td className="px-5 py-3 text-red-400">{formatCurrency(w.cost)}</td>
                  <td className="px-5 py-3">
                    <span className={`font-bold ${w.gross_profit >= 0 ? "text-amber-400" : "text-red-400"}`}>{formatCurrency(w.gross_profit)}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${margin >= 30 ? "bg-emerald-500/20 text-emerald-400" : margin >= 15 ? "bg-amber-500/20 text-amber-400" : "bg-red-500/15 text-red-400"}`}>{margin.toFixed(1)}%</span>
                  </td>
                  <td className="px-5 py-3 text-white/50 font-mono text-xs">{w.invoice_count}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width:`${barPct}%`, background: BRANCH_COLORS[i % BRANCH_COLORS.length] }}/>
                      </div>
                      <span className="text-white/30 text-xs tabular-nums">{barPct.toFixed(0)}%</span>
                      <ChevronRight className={`w-3 h-3 text-white/20 transition-transform ${drillId === w.warehouse_id ? "rotate-90" : ""}`}/>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {warehouses.length > 1 && (
            <tfoot className="bg-white/3 border-t border-white/10">
              <tr>
                <td className="px-5 py-3 text-white/50 font-bold text-xs">الإجمالي</td>
                <td className="px-5 py-3 font-black text-emerald-400">{formatCurrency(warehouses.reduce((s,w)=>s+w.revenue,0))}</td>
                <td className="px-5 py-3 font-bold text-red-400">{formatCurrency(warehouses.reduce((s,w)=>s+w.cost,0))}</td>
                <td className="px-5 py-3 font-black text-amber-400">{formatCurrency(warehouses.reduce((s,w)=>s+w.gross_profit,0))}</td>
                <td colSpan={3}/>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/* ─── Waterfall ───────────────────────────────────────────────────────────── */
const WF = {
  revenue: "#10b981", cost: "#ef4444", grossPos: "#f59e0b", grossNeg: "#ef4444",
  expenses: "#f97316", netPos: "#10b981", netNeg: "#ef4444",
};
function WaterfallSection({ pl }: { pl: ProfitsData }) {
  const { total_revenue:rev, total_cost:cost, gross_profit:gross, total_expenses:exp, net_profit:net } = pl;
  const wfData = useMemo(() => [
    { name:"المبيعات",       displayVal:rev,            base:0,              fill:WF.revenue,                    label:`+${formatCurrency(rev)}` },
    { name:"(-) التكلفة",   displayVal:cost,           base:Math.max(gross,0), fill:WF.cost,                   label:`-${formatCurrency(cost)}` },
    { name:"مجمل الربح",    displayVal:Math.abs(gross), base:gross>=0?0:gross, fill:gross>=0?WF.grossPos:WF.grossNeg, label:`=${formatCurrency(gross)}`, result:true },
    { name:"(-) المصروفات", displayVal:exp,             base:Math.max(net,0),  fill:WF.expenses,               label:`-${formatCurrency(exp)}` },
    { name:"صافي الربح",    displayVal:Math.abs(net),   base:net>=0?0:net,     fill:net>=0?WF.netPos:WF.netNeg,   label:`=${formatCurrency(net)}`, result:true },
  ], [rev,cost,gross,exp,net]);
  const maxDomain = Math.max(rev,cost,Math.abs(gross),exp,Math.abs(net),1);
  const customLabel = (props: any) => {
    const { x,y,width,height,index } = props;
    const item = wfData[index]; if (!item) return null;
    const cx=x+width/2; const cy=height>24?y+height/2:y-7;
    return <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.9)" fontSize={9} fontWeight={700} fontFamily="Tajawal,Cairo,sans-serif">{item.label}</text>;
  };
  return (
    <div className="glass-panel rounded-2xl p-5 border border-white/5">
      <h3 className="text-white font-bold mb-4 flex items-center gap-2 text-sm"><BarChart3 className="w-4 h-4 text-amber-400"/> تدفق الأرباح</h3>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={wfData} margin={{ top:12,right:8,left:8,bottom:0 }} barCategoryGap="18%">
          <XAxis dataKey="name" tick={{ fill:"rgba(255,255,255,0.4)",fontSize:9,fontFamily:"Tajawal,Cairo,sans-serif" }} axisLine={false} tickLine={false}/>
          <YAxis hide domain={[Math.min(net<0?net:0,0)*1.1, maxDomain*1.15]}/>
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)"/>
          <Tooltip contentStyle={{ background:"rgba(10,18,35,0.95)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,fontSize:11,fontFamily:"Tajawal,Cairo" }}
            formatter={(_:any,__:any,p:any)=>{const i=wfData[p.index];return[i?i.label:"",i?.name??""];}} labelFormatter={l=>`${l}`}/>
          <Bar dataKey="base" stackId="wf" fill="transparent" isAnimationActive={false}/>
          <Bar dataKey="displayVal" stackId="wf" radius={[4,4,0,0]} animationDuration={800} animationEasing="ease-out">
            {wfData.map((e,i) => <Cell key={i} fill={e.fill} stroke={e.result?e.fill:"transparent"} strokeWidth={e.result?1.5:0}/>)}
            <LabelList content={customLabel}/>
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── Sales Breakdown Bar ─────────────────────────────────────────────────── */
function SalesBreakdownBar({ pl }: { pl: ProfitsData }) {
  const segments = [
    { label:"نقدي", value:pl.cash_sales,    color:"#10b981", icon:<HandCoins className="w-3 h-3"/> },
    { label:"آجل",  value:pl.credit_sales,  color:"#3b82f6", icon:<CreditCard className="w-3 h-3"/> },
    { label:"جزئي", value:pl.partial_sales, color:"#f59e0b", icon:<Minus className="w-3 h-3"/> },
  ].filter(s => s.value > 0);
  const total = segments.reduce((s,x)=>s+x.value, 0);
  if (total === 0) return null;
  return (
    <div className="glass-panel rounded-2xl p-5 border border-white/5" style={{ fontFamily:"'Tajawal','Cairo',sans-serif" }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-bold flex items-center gap-2 text-sm"><ShoppingBag className="w-4 h-4 text-blue-400"/> توزيع المبيعات</h3>
        {pl.return_amount > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-red-400 font-bold bg-red-500/10 px-2.5 py-1 rounded-full border border-red-500/20">
            <RotateCcw className="w-3 h-3"/> مرتجعات: {formatCurrency(pl.return_amount)}
          </span>
        )}
      </div>
      <div className="flex h-3 rounded-full overflow-hidden gap-0.5 mb-4">
        {segments.map(s => (
          <motion.div key={s.label} className="h-full rounded-full" style={{ background:s.color }}
            initial={{ flexGrow:0 }} animate={{ flexGrow: s.value / total }} transition={{ duration:0.8, ease:"easeOut" }}/>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {segments.map(s => {
          const pct = total > 0 ? (s.value / total) * 100 : 0;
          return (
            <div key={s.label} className="rounded-xl p-3" style={{ background:`${s.color}12`, border:`1px solid ${s.color}30` }}>
              <div className="flex items-center gap-1.5 mb-1" style={{ color:s.color }}>{s.icon}<span className="text-xs font-bold">{s.label}</span></div>
              <p className="text-white font-black text-sm tabular-nums">{formatCurrency(s.value)}</p>
              <p className="text-white/30 text-xs">{pct.toFixed(1)}%</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Period Comparison ───────────────────────────────────────────────────── */
function PeriodCompare({ curr, prev, currLabel, prevLabel }: { curr: ProfitsData; prev: ProfitsData; currLabel: string; prevLabel: string }) {
  const rows = [
    { label:"إجمالي المبيعات",       curr:curr.total_revenue, prev:prev.total_revenue },
    { label:"تكلفة البضاعة",          curr:curr.total_cost,    prev:prev.total_cost },
    { label:"مجمل الربح",             curr:curr.gross_profit,  prev:prev.gross_profit },
    { label:"المصروفات",              curr:curr.total_expenses,prev:prev.total_expenses },
    { label:"صافي الربح",             curr:curr.net_profit,    prev:prev.net_profit },
  ];
  return (
    <div className="glass-panel rounded-2xl p-5 border border-white/5" style={{ fontFamily:"'Tajawal','Cairo',sans-serif" }}>
      <h3 className="text-white font-bold mb-3 flex items-center gap-2 text-sm"><TrendingUp className="w-4 h-4 text-violet-400"/> مقارنة الفترات</h3>
      <div className="flex items-center justify-between text-xs text-white/40 mb-3 px-0.5">
        <span>{currLabel}</span>
        <span>{prevLabel}</span>
      </div>
      <div className="space-y-0">
        {rows.map(r => <DeltaRow key={r.label} {...r}/>)}
      </div>
    </div>
  );
}

/* ─── Insights Section ────────────────────────────────────────────────────── */
function InsightsSection({ pl }: { pl: ProfitsData }) {
  const topBranch    = useMemo(() => [...pl.by_warehouse].sort((a,b)=>b.gross_profit-a.gross_profit)[0], [pl.by_warehouse]);
  const bottomBranch = useMemo(() => pl.by_warehouse.length > 1 ? [...pl.by_warehouse].sort((a,b)=>a.gross_profit-b.gross_profit)[0] : null, [pl.by_warehouse]);
  const topExpCat    = pl.by_expense_category[0];
  const avgMargin    = pl.total_revenue > 0 ? (pl.gross_profit / pl.total_revenue) * 100 : 0;
  const insights: { icon: string; text: string; color: string }[] = [];
  if (topBranch && topBranch.revenue > 0)
    insights.push({ icon:"🏆", text:`أفضل فرع: ${topBranch.warehouse_name} (ربح: ${formatCurrency(topBranch.gross_profit)})`, color:"text-amber-400" });
  if (bottomBranch && bottomBranch.gross_profit < 0)
    insights.push({ icon:"⚠️", text:`أقل فرع: ${bottomBranch.warehouse_name} (${formatCurrency(bottomBranch.gross_profit)})`, color:"text-red-400" });
  if (topExpCat)
    insights.push({ icon:"💸", text:`أعلى فئة مصروفات: ${topExpCat.category} (${formatCurrency(topExpCat.total)})`, color:"text-orange-400" });
  if (avgMargin < 15 && pl.total_revenue > 0)
    insights.push({ icon:"📉", text:`هامش الربح منخفض: ${avgMargin.toFixed(1)}% — راجع تكاليف البضاعة`, color:"text-red-400" });
  if (pl.return_amount > pl.total_revenue * 0.1 && pl.total_revenue > 0)
    insights.push({ icon:"🔄", text:`نسبة مرتجعات مرتفعة: ${((pl.return_amount/pl.total_revenue)*100).toFixed(1)}%`, color:"text-orange-400" });
  if (pl.credit_sales > pl.cash_sales && pl.credit_sales > 0)
    insights.push({ icon:"💳", text:`المبيعات الآجلة أعلى من النقدية — تابع الديون بانتظام`, color:"text-blue-400" });
  if (insights.length === 0) return null;
  return (
    <div className="glass-panel rounded-2xl p-5 border border-white/5" style={{ fontFamily:"'Tajawal','Cairo',sans-serif" }}>
      <h3 className="text-white font-bold mb-4 flex items-center gap-2 text-sm"><Lightbulb className="w-4 h-4 text-yellow-400"/> رؤى تحليلية</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {insights.map((ins,i) => (
          <motion.div key={i} initial={{ opacity:0, x:-10 }} animate={{ opacity:1, x:0 }} transition={{ delay:i*0.06 }}
            className="flex items-start gap-2.5 p-3 rounded-xl bg-white/4 border border-white/6">
            <span className="text-lg leading-none mt-0.5">{ins.icon}</span>
            <p className={`text-xs font-medium leading-relaxed ${ins.color}`}>{ins.text}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ─── Branch Bar Chart ────────────────────────────────────────────────────── */
function BranchBarChart({ warehouses }: { warehouses: ProfitsData["by_warehouse"] }) {
  const data = warehouses.filter(w => w.revenue > 0).map(w => ({
    name: w.warehouse_name.length > 10 ? w.warehouse_name.slice(0, 10) + "…" : w.warehouse_name,
    مبيعات: w.revenue,
    ربح: w.gross_profit,
  }));
  if (data.length < 2) return null;
  return (
    <div className="glass-panel rounded-2xl p-5 border border-white/5" style={{ fontFamily:"'Tajawal','Cairo',sans-serif" }}>
      <h3 className="text-white font-bold mb-4 flex items-center gap-2 text-sm"><BarChart3 className="w-4 h-4 text-blue-400"/> مقارنة مبيعات الفروع</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top:8,right:8,left:0,bottom:0 }} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)"/>
          <XAxis dataKey="name" tick={{ fill:"rgba(255,255,255,0.4)",fontSize:10,fontFamily:"Tajawal,Cairo,sans-serif" }} axisLine={false} tickLine={false}/>
          <YAxis tick={{ fill:"rgba(255,255,255,0.4)",fontSize:9 }} tickFormatter={v=>`${(v/1000).toFixed(0)}k`} width={38}/>
          <Tooltip content={<ChartTooltip/>}/>
          <Bar dataKey="مبيعات" fill="#10b981" radius={[4,4,0,0]} maxBarSize={40}/>
          <Bar dataKey="ربح"    fill="#f59e0b" radius={[4,4,0,0]} maxBarSize={40}/>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex justify-center gap-5 mt-2">
        {[{color:"#10b981",label:"المبيعات"},{color:"#f59e0b",label:"مجمل الربح"}].map(l=>(
          <div key={l.label} className="flex items-center gap-1.5 text-xs text-white/40"><div className="w-3 h-2 rounded-sm" style={{background:l.color}}/>{l.label}</div>
        ))}
      </div>
    </div>
  );
}

/* ─── Expense Donut ───────────────────────────────────────────────────────── */
function ExpenseDonut({ data, total }: { data: ProfitsData["by_expense_category"]; total: number }) {
  if (!data?.length) return (
    <div className="glass-panel rounded-2xl p-5 border border-white/5 flex flex-col items-center justify-center min-h-[220px]">
      <DollarSign className="w-8 h-8 text-white/15 mb-2"/><p className="text-white/30 text-sm">لا توجد مصروفات</p>
    </div>
  );
  return (
    <div className="glass-panel rounded-2xl p-5 border border-white/5" style={{ fontFamily:"'Tajawal','Cairo',sans-serif" }}>
      <h3 className="text-white font-bold mb-4 flex items-center gap-2 text-sm"><DollarSign className="w-4 h-4 text-red-400"/> توزيع المصروفات ({formatCurrency(total)})</h3>
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <ResponsiveContainer width={160} height={160}>
          <PieChart><Pie data={data} cx="50%" cy="50%" innerRadius={44} outerRadius={72} dataKey="total" nameKey="category" strokeWidth={0}>
            {data.map((_,i)=><Cell key={i} fill={DONUT_COLORS[i%DONUT_COLORS.length]}/>)}
          </Pie>
          <Tooltip contentStyle={{background:"rgba(10,18,35,0.95)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,fontSize:11}} formatter={(v:number)=>[formatCurrency(v),""]}/></PieChart>
        </ResponsiveContainer>
        <div className="flex-1 space-y-2 w-full">
          {data.slice(0,7).map((item,i) => {
            const pct = total > 0 ? (item.total/total)*100 : 0;
            return (
              <div key={item.category} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full shrink-0" style={{background:DONUT_COLORS[i%DONUT_COLORS.length]}}/>
                <span className="text-white/60 text-xs flex-1 truncate">{item.category}</span>
                <span className="text-white/40 text-xs">{pct.toFixed(0)}%</span>
                <span className="text-white/70 text-xs font-bold tabular-nums">{formatCurrency(item.total)}</span>
              </div>
            );
          })}
          {data.length>7&&<p className="text-white/25 text-xs">+ {data.length-7} فئات أخرى</p>}
        </div>
      </div>
    </div>
  );
}

/* ─── Trend Chart ─────────────────────────────────────────────────────────── */
function TrendChart({ pl }: { pl: ProfitsData }) {
  const [view, setView] = useState<"month"|"day">("month");
  const data = useMemo(() => {
    if (view==="day") return [...pl.by_day].sort((a,b)=>a.day.localeCompare(b.day)).map(d=>({name:fmtDay(d.day),الإيرادات:+d.revenue.toFixed(2),ربح:+d.profit.toFixed(2)}));
    return [...pl.by_month].sort((a,b)=>a.month.localeCompare(b.month)).map(m=>({name:fmtMonth(m.month),الإيرادات:+m.revenue.toFixed(2),ربح:+m.profit.toFixed(2)}));
  }, [view,pl]);
  return (
    <div className="glass-panel rounded-2xl p-5 border border-white/5" style={{ fontFamily:"'Tajawal','Cairo',sans-serif" }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-bold flex items-center gap-2 text-sm"><TrendingUp className="w-4 h-4 text-emerald-400"/> تطور الأداء</h3>
        <div className="flex bg-white/5 rounded-xl p-0.5 gap-0.5">
          {([{id:"month" as const,label:"شهري"},{id:"day" as const,label:"يومي"}]).map(t=>(
            <button key={t.id} onClick={()=>setView(t.id)} className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${view===t.id?"bg-amber-500/20 text-amber-400 border border-amber-500/30":"text-white/40 hover:text-white/70"}`}>{t.label}</button>
          ))}
        </div>
      </div>
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={190}>
          <AreaChart data={data} margin={{ top:4,right:0,left:0,bottom:0 }}>
            <defs>
              <linearGradient id="gRevPL" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
              <linearGradient id="gProfPL" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/><stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)"/>
            <XAxis dataKey="name" tick={{ fill:"rgba(255,255,255,0.35)",fontSize:9,fontFamily:"Tajawal,Cairo,sans-serif" }}/>
            <YAxis tick={{ fill:"rgba(255,255,255,0.35)",fontSize:9 }} tickFormatter={v=>`${(v/1000).toFixed(0)}k`} width={36}/>
            <Tooltip content={<ChartTooltip/>}/>
            <Area type="monotone" dataKey="الإيرادات" stroke="#10b981" strokeWidth={2} fill="url(#gRevPL)" dot={false}/>
            <Area type="monotone" dataKey="ربح"       stroke="#f59e0b" strokeWidth={2} fill="url(#gProfPL)" dot={false}/>
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[190px] flex flex-col items-center justify-center text-white/25">
          <BarChart3 className="w-8 h-8 mb-2 opacity-30"/><p className="text-sm">لا توجد بيانات</p>
        </div>
      )}
    </div>
  );
}

/* ─── Top Products ────────────────────────────────────────────────────────── */
const MEDALS = ["🥇","🥈","🥉"];
function TopProducts({ products }: { products: ProfitsData["by_product"] }) {
  const top = useMemo(() => [...products].sort((a,b)=>b.profit-a.profit).slice(0,5), [products]);
  if (!top.length) return null;
  return (
    <div className="space-y-2.5" style={{ fontFamily:"'Tajawal','Cairo',sans-serif" }}>
      <div className="flex items-center gap-2 px-0.5"><Package className="w-4 h-4 text-amber-400"/><h3 className="text-white font-bold text-sm">أعلى المنتجات ربحية</h3></div>
      {top.map((p,i) => {
        const margin = p.revenue > 0 ? (p.profit/p.revenue)*100 : 0;
        const color  = margin >= 50 ? "#10b981" : margin >= 30 ? "#f59e0b" : "#ef4444";
        return (
          <motion.div key={p.product_id} initial={{ opacity:0,x:20 }} animate={{ opacity:1,x:0 }} transition={{ duration:0.35,delay:i*0.09 }}
            className="glass-panel rounded-xl p-4 border border-white/6">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">{MEDALS[i] ?? `#${i+1}`}</span>
                <div>
                  <p className="text-white font-bold text-sm">{p.product_name}</p>
                  <p className="text-white/30 text-xs">{p.qty_sold} وحدة</p>
                </div>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full border" style={{ color, background:`${color}20`, borderColor:`${color}40` }}>
                {margin.toFixed(1)}%
              </span>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden mb-2">
              <motion.div className="h-full rounded-full" style={{ background:`linear-gradient(to left,${color}cc,${color})` }}
                initial={{ width:"0%" }} animate={{ width:`${Math.min(margin,100)}%` }} transition={{ duration:0.9,delay:i*0.1+0.3 }}/>
            </div>
            <div className="flex gap-4 text-xs flex-wrap">
              <span className="text-white/40">إيراد: <span className="text-emerald-400 font-bold">{formatCurrency(p.revenue)}</span></span>
              <span className="text-white/20">|</span>
              <span className="text-white/40">ربح: <span className="font-black" style={{ color }}>{formatCurrency(p.profit)}</span></span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ─── P&L Statement Table ─────────────────────────────────────────────────── */
function PLStatement({ pl }: { pl: ProfitsData }) {
  const rows = [
    { label:"(+) إجمالي المبيعات", value:pl.total_revenue, color:"text-emerald-400", bold:true },
    { label:"(-) المرتجعات",       value:-pl.return_amount, color:"text-red-400" },
    { label:"(-) تكلفة البضاعة",   value:-pl.total_cost,   color:"text-red-400" },
    { label:"= مجمل الربح",        value:pl.gross_profit,   color:pl.gross_profit>=0?"text-amber-400":"text-red-400", bold:true, separator:true },
    { label:"(-) المصروفات",       value:-pl.total_expenses, color:"text-orange-400" },
    { label:"= صافي الربح",        value:pl.net_profit,    color:pl.net_profit>=0?"text-emerald-400":"text-red-400", bold:true, separator:true, big:true },
  ];
  return (
    <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden" style={{ fontFamily:"'Tajawal','Cairo',sans-serif" }}>
      <div className="px-5 py-3 border-b border-white/10 flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-amber-400"/>
        <h3 className="text-white font-bold text-sm">قائمة الأرباح والخسائر</h3>
      </div>
      <div className="p-4 space-y-1">
        {rows.map((r,i) => (
          <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg ${r.separator ? "bg-white/4 border border-white/8 mt-2" : ""} ${r.bold ? "font-bold" : ""}`}>
            <span className={`text-sm ${r.bold ? "text-white" : "text-white/60"}`}>{r.label}</span>
            <span className={`tabular-nums ${r.big ? "text-lg" : "text-sm"} ${r.color} font-bold`}>
              {r.value >= 0 ? formatCurrency(r.value) : `(${formatCurrency(Math.abs(r.value))})`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Main Component ──────────────────────────────────────────────────────── */
export default function ProfitLossReport() {
  const [mode,setMode]             = useState<DateMode>("month");
  const [customFrom,setCustomFrom] = useState(thisMonthStart());
  const [customTo,setCustomTo]     = useState(todayStr());
  const [selectedBranches,setSelectedBranches] = useState<number[]>([]);
  const [drillBranchId,setDrillBranchId]       = useState<number | null>(null);

  const [dateFrom,dateTo] = getDateRange(mode, customFrom, customTo);
  const [prevFrom,prevTo] = getPrevRange(dateFrom, dateTo);

  // ── Warehouses list ──
  const { data:warehouses=[] } = useQuery<Warehouse[]>({
    queryKey:["/api/settings/warehouses"],
    queryFn: () => authFetch(api("/api/settings/warehouses")).then(r=>r.json()),
    staleTime: 300_000,
  });

  // ── Build query string with warehouse filter ──
  const warehouseQS = useCallback((from: string, to: string, branchIds: number[]) => {
    let qs = `/api/profits?date_from=${from}&date_to=${to}`;
    if (branchIds.length > 0) qs += `&warehouse_ids=${branchIds.join(",")}`;
    return qs;
  }, []);

  const { data:plData, isLoading } = useQuery<ProfitsData>({
    queryKey: ["/api/profits", dateFrom, dateTo, selectedBranches.join(",")],
    queryFn:  () => authFetch(api(warehouseQS(dateFrom, dateTo, selectedBranches))).then(r=>r.json()),
    staleTime: 60_000,
  });
  const { data:prevData } = useQuery<ProfitsData>({
    queryKey: ["/api/profits", prevFrom, prevTo, selectedBranches.join(",")],
    queryFn:  () => authFetch(api(warehouseQS(prevFrom, prevTo, selectedBranches))).then(r=>r.json()),
    staleTime: 60_000,
    enabled: !!prevFrom,
  });

  const pl   = plData   ? { ...EMPTY_PL, ...plData   } : EMPTY_PL;
  const prev = prevData ? { ...EMPTY_PL, ...prevData } : EMPTY_PL;

  // ── Date range label helpers ──
  const currLabel = `${dateFrom} → ${dateTo}`;
  const prevLabel = `${prevFrom} → ${prevTo}`;

  const warehouseLabel = selectedBranches.length === 0
    ? "جميع الفروع"
    : selectedBranches.map(id => warehouses.find(w => w.id === id)?.name ?? String(id)).join(", ");

  // ── Handlers ──
  const handleExportPDF  = () => printPLReport({ dateFrom, dateTo, ...pl });
  const handleExportExcel = () => exportPLExcel(pl, dateFrom, dateTo, warehouseLabel);

  return (
    <div className="space-y-5" dir="rtl" style={{ fontFamily:"'Tajawal','Cairo',sans-serif" }}>

      {/* ── Control Bar ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Date mode pills */}
        {DATE_MODES.map(m => (
          <button key={m.id} onClick={() => setMode(m.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${mode===m.id?"bg-amber-500/25 border-amber-500/50 text-amber-300 shadow-lg":"glass-panel border-white/10 text-white/50 hover:text-white"}`}>
            {m.label}
          </button>
        ))}
        {mode==="custom"&&(
          <div className="flex items-center gap-2">
            <input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} className="glass-input rounded-xl px-3 py-1.5 text-sm text-white"/>
            <span className="text-white/30">←</span>
            <input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} className="glass-input rounded-xl px-3 py-1.5 text-sm text-white"/>
          </div>
        )}

        {/* Branch selector */}
        <BranchSelector warehouses={warehouses} selected={selectedBranches} onChange={setSelectedBranches}/>

        {/* Export buttons */}
        <div className="flex gap-2 mr-auto">
          <button onClick={handleExportExcel} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30 transition-all">
            <FileDown className="w-3.5 h-3.5"/> Excel
          </button>
          <button onClick={handleExportPDF} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-500/20 border border-blue-500/40 text-blue-400 hover:bg-blue-500/30 transition-all">
            <Printer className="w-3.5 h-3.5"/> PDF
          </button>
        </div>
      </div>

      {/* ── KPI Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard index={0} label="إجمالي المبيعات" value={pl.total_revenue} prev={prev.total_revenue} color="border-r-emerald-500"
          icon={<TrendingUp className="w-4 h-4 text-emerald-400"/>} sub={`${pl.invoice_count} فاتورة`}/>
        <KPICard index={1} label="إجمالي المصروفات" value={pl.total_expenses} prev={prev.total_expenses} color="border-r-orange-500"
          icon={<DollarSign className="w-4 h-4 text-orange-400"/>}/>
        <KPICard index={2} label="صافي الربح" value={pl.net_profit} prev={prev.net_profit} color={pl.net_profit>=0?"border-r-amber-500":"border-r-red-500"}
          icon={<BarChart3 className="w-4 h-4 text-amber-400"/>}/>
        <MarginCard index={3} margin={pl.profit_margin} prev={prev.profit_margin}/>
      </div>

      {/* ── Waterfall + Sales Breakdown ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <WaterfallSection pl={pl}/>
        <SalesBreakdownBar pl={pl}/>
      </div>

      {/* ── Branch Comparison Table ── */}
      {pl.by_warehouse.length > 0 && (
        <BranchTable warehouses={pl.by_warehouse} drillId={drillBranchId} onDrill={setDrillBranchId}/>
      )}

      {/* ── Branch Bar Chart ── */}
      <BranchBarChart warehouses={pl.by_warehouse}/>

      {/* ── P&L Statement + Period Comparison ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <PLStatement pl={pl}/>
        {prevData && <PeriodCompare curr={pl} prev={prev} currLabel={currLabel} prevLabel={prevLabel}/>}
      </div>

      {/* ── Trend + Expense Donut ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <TrendChart pl={pl}/>
        <ExpenseDonut data={pl.by_expense_category} total={pl.total_expenses}/>
      </div>

      {/* ── Insights ── */}
      <InsightsSection pl={pl}/>

      {/* ── Top Products ── */}
      <TopProducts products={pl.by_product}/>

      {/* ── Empty state ── */}
      {!isLoading && pl.invoice_count === 0 && pl.total_expenses === 0 && (
        <div className="glass-panel rounded-2xl p-12 text-center border border-white/5">
          <BarChart3 className="w-10 h-10 text-white/20 mx-auto mb-3"/>
          <p className="text-white/40 font-bold">لا توجد بيانات في هذه الفترة</p>
          <p className="text-white/25 text-xs mt-1">جرّب تغيير نطاق التاريخ أو الفرع</p>
        </div>
      )}
    </div>
  );
}
