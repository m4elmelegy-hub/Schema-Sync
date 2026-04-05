import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  BarChart3, TrendingUp, TrendingDown, DollarSign, ShoppingBag, Printer,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, LabelList, ReferenceLine,
} from "recharts";
import {
  api, authFetch, formatCurrency, useCountUp,
  DATE_MODES, DateMode, getDateRange, getPrevRange,
  ProfitsData, EMPTY_PL, thisMonthStart, todayStr, fmtMonth, fmtDay,
  ChartTooltip,
} from "./shared";
import { printPLReport } from "@/lib/export-pdf";

/* ── Hero KPI Card ─────────────────────────────────────────────────────────── */
interface KPICardProps {
  label: string; value: number; prevValue?: number; sub?: string;
  border: string; icon: React.ReactNode; valueColor?: string; index: number; extra?: React.ReactNode;
}
function HeroKPICard({ label, value, prevValue, sub, border, icon, valueColor = "text-white", index, extra }: KPICardProps) {
  const animated = useCountUp(value);
  const change = (prevValue && prevValue !== 0) ? ((value - prevValue) / Math.abs(prevValue)) * 100 : null;
  return (
    <motion.div initial={{ opacity:0, y:24 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.45, delay:index*0.09 }}
      whileHover={{ y:-4, transition:{duration:0.15} }}
      className={`glass-panel rounded-2xl p-5 border-r-4 border-t border-b border-l border-white/5 cursor-default ${border}`}
      style={{ fontFamily:"'Tajawal','Cairo',sans-serif" }}>
      <div className="flex items-start justify-between mb-3">
        <div className="p-2 rounded-xl bg-white/5">{icon}</div>
        {change !== null && (
          <div className={`flex items-center gap-1 text-xs font-bold rounded-full px-2 py-0.5 ${change >= 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
            {change >= 0 ? <TrendingUp className="w-3 h-3"/> : <TrendingDown className="w-3 h-3"/>}
            {change >= 0 ? "+" : ""}{change.toFixed(1)}%
          </div>
        )}
      </div>
      <p className="text-white/50 text-xs mb-1">{label}</p>
      <p className={`text-2xl font-black ${valueColor}`} style={{ fontFeatureSettings:'"tnum"' }}>{formatCurrency(animated)}</p>
      {sub && <p className="text-white/30 text-xs mt-1">{sub}</p>}
      {extra}
    </motion.div>
  );
}

/* ── Waterfall Chart ───────────────────────────────────────────────────────── */
const WF = {
  revenue: { fill:"#10b981", stroke:"#059669" }, cost: { fill:"#ef4444", stroke:"#dc2626" },
  grossPos: { fill:"#f59e0b", stroke:"#d97706" }, grossNeg: { fill:"#ef4444", stroke:"#dc2626" },
  expenses: { fill:"#f97316", stroke:"#ea580c" }, netPos: { fill:"#10b981", stroke:"#059669" }, netNeg: { fill:"#ef4444", stroke:"#dc2626" },
};
function WaterfallSection({ pl }: { pl: ProfitsData }) {
  const { total_revenue:rev, total_cost:cost, gross_profit:gross, total_expenses:exp, net_profit:net } = pl;
  const wfData = useMemo(() => [
    { name:"إجمالي المبيعات", displayVal:rev,             base:0,                fill:WF.revenue.fill,   stroke:WF.revenue.stroke,   label:`+${formatCurrency(rev)}`,           isResult:false },
    { name:"(-) تكلفة البضاعة", displayVal:cost,          base:Math.max(gross,0), fill:WF.cost.fill,      stroke:WF.cost.stroke,      label:`-${formatCurrency(cost)}`,          isResult:false },
    { name:"= مجمل الربح",     displayVal:Math.abs(gross), base:gross>=0?0:gross,  fill:gross>=0?WF.grossPos.fill:WF.grossNeg.fill, stroke:gross>=0?WF.grossPos.stroke:WF.grossNeg.stroke, label:`= ${formatCurrency(gross)}`, isResult:true },
    { name:"(-) المصروفات",    displayVal:exp,             base:Math.max(net,0),   fill:WF.expenses.fill,  stroke:WF.expenses.stroke,  label:`-${formatCurrency(exp)}`,           isResult:false },
    { name:"= صافي الربح",     displayVal:Math.abs(net),   base:net>=0?0:net,      fill:net>=0?WF.netPos.fill:WF.netNeg.fill, stroke:net>=0?WF.netPos.stroke:WF.netNeg.stroke, label:`${net>=0?"+":"-"} ${formatCurrency(Math.abs(net))}`, isResult:true },
  ], [rev,cost,gross,exp,net]);
  const maxDomain = Math.max(rev,cost,Math.abs(gross),exp,Math.abs(net),1);
  const customLabel = (props: any) => {
    const { x, y, width, height, index } = props;
    const item = wfData[index];
    if (!item) return null;
    const cx = x + width / 2;
    const cy = height > 24 ? y + height / 2 : y - 6;
    return <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.9)" fontSize={10} fontWeight={700} fontFamily="Tajawal,Cairo,sans-serif">{item.label}</text>;
  };
  return (
    <div className="glass-panel rounded-2xl p-6 border border-white/5" style={{ fontFamily:"'Tajawal','Cairo',sans-serif" }}>
      <h3 className="text-white font-bold mb-5 flex items-center gap-2 text-sm"><BarChart3 className="w-4 h-4 text-amber-400"/> تدفق الأرباح والخسائر (Waterfall)</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={wfData} margin={{ top:12, right:16, left:8, bottom:0 }} barCategoryGap="20%">
          <XAxis dataKey="name" tick={{ fill:"rgba(255,255,255,0.5)", fontSize:10, fontFamily:"Tajawal,Cairo,sans-serif" }} axisLine={false} tickLine={false}/>
          <YAxis hide domain={[Math.min(net<0?net:0,0)*1.05, maxDomain*1.1]}/>
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeWidth={1}/>
          <Tooltip contentStyle={{ background:"rgba(10,18,35,0.95)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, fontSize:11, fontFamily:"Tajawal,Cairo" }}
            formatter={(_: any,__: any,props: any) => { const i=wfData[props.index]; return [i?i.label:"",i?.name??""]; }}
            labelFormatter={(l) => `${l}`}/>
          <Bar dataKey="base" stackId="wf" fill="transparent" isAnimationActive={false}/>
          <Bar dataKey="displayVal" stackId="wf" radius={[4,4,0,0]} isAnimationActive animationDuration={800} animationEasing="ease-out">
            {wfData.map((e,i) => <Cell key={i} fill={e.fill} stroke={e.isResult?e.stroke:"transparent"} strokeWidth={e.isResult?1.5:0} style={e.isResult?{filter:`drop-shadow(0 0 6px ${e.fill}66)`}:{}}/>)}
            <LabelList content={customLabel}/>
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap justify-center gap-4 mt-3">
        {[{color:WF.revenue.fill,label:"إيراد"},{color:WF.cost.fill,label:"تكلفة/مصروف"},{color:WF.grossPos.fill,label:"نتيجة إيجابية"},{color:WF.netNeg.fill,label:"نتيجة سلبية"}].map(l => (
          <div key={l.label} className="flex items-center gap-1.5 text-xs text-white/40">
            <div className="w-3 h-2 rounded-sm" style={{ background:l.color }}/>
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Trend Area Chart ─────────────────────────────────────────────────────── */
function TrendAreaChart({ by_month, by_day }: { by_month: ProfitsData["by_month"]; by_day: ProfitsData["by_day"] }) {
  const [view, setView] = useState<"month"|"day">("month");
  const chartData = useMemo(() => {
    if (view === "day") return [...by_day].sort((a,b)=>a.day.localeCompare(b.day)).map(d=>({ name:fmtDay(d.day), الإيرادات:+d.revenue.toFixed(2), تكلفة:+d.cost.toFixed(2), ربح:+d.profit.toFixed(2) }));
    return [...by_month].sort((a,b)=>a.month.localeCompare(b.month)).map(m=>({ name:fmtMonth(m.month), الإيرادات:+m.revenue.toFixed(2), تكلفة:+m.cost.toFixed(2), ربح:+m.profit.toFixed(2) }));
  }, [view,by_month,by_day]);
  return (
    <div className="glass-panel rounded-2xl p-5 border border-white/5" style={{ fontFamily:"'Tajawal','Cairo',sans-serif" }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-bold flex items-center gap-2 text-sm"><TrendingUp className="w-4 h-4 text-emerald-400"/> تطور الأداء</h3>
        <div className="flex bg-white/5 rounded-xl p-0.5 gap-0.5">
          {([{id:"month" as const,label:"📆 شهري"},{id:"day" as const,label:"📅 يومي"}]).map(t => (
            <button key={t.id} onClick={()=>setView(t.id)} className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${view===t.id?"bg-amber-500/20 text-amber-400 border border-amber-500/30":"text-white/40 hover:text-white/70"}`}>{t.label}</button>
          ))}
        </div>
      </div>
      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={210}>
          <AreaChart data={chartData} margin={{ top:4, right:0, left:0, bottom:0 }}>
            <defs>
              <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.35}/><stop offset="95%" stopColor="#10b981" stopOpacity={0.02}/></linearGradient>
              <linearGradient id="gCost" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/><stop offset="95%" stopColor="#ef4444" stopOpacity={0.02}/></linearGradient>
              <linearGradient id="gProfit" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35}/><stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02}/></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)"/>
            <XAxis dataKey="name" tick={{ fill:"rgba(255,255,255,0.4)", fontSize:10, fontFamily:"Tajawal,Cairo,sans-serif" }}/>
            <YAxis tick={{ fill:"rgba(255,255,255,0.4)", fontSize:10 }} tickFormatter={v=>`${(v/1000).toFixed(0)}k`} width={42}/>
            <Tooltip content={<ChartTooltip/>}/>
            <Area type="monotone" dataKey="الإيرادات" stroke="#10b981" strokeWidth={2} fill="url(#gRev)" dot={false}/>
            <Area type="monotone" dataKey="تكلفة" stroke="#ef4444" strokeWidth={2} fill="url(#gCost)" dot={false}/>
            <Area type="monotone" dataKey="ربح" stroke="#f59e0b" strokeWidth={2} fill="url(#gProfit)" dot={false}/>
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[210px] flex flex-col items-center justify-center text-white/30">
          <BarChart3 className="w-8 h-8 mb-2 opacity-30"/><p className="text-sm">لا توجد بيانات بعد</p>
        </div>
      )}
      <div className="flex justify-center gap-5 mt-3">
        {[{color:"#10b981",label:"الإيرادات"},{color:"#ef4444",label:"تكلفة البضاعة"},{color:"#f59e0b",label:"صافي الربح"}].map(l=>(
          <div key={l.label} className="flex items-center gap-1.5 text-xs text-white/40"><div className="w-3 h-0.5 rounded-full" style={{background:l.color}}/>{l.label}</div>
        ))}
      </div>
    </div>
  );
}

/* ── Expense Donut ─────────────────────────────────────────────────────────── */
const DONUT_COLORS = ["#f59e0b","#ef4444","#3b82f6","#10b981","#8b5cf6","#f97316","#06b6d4","#ec4899","#84cc16","#6b7280"];
function ExpenseDonutChart({ data, total }: { data: ProfitsData["by_expense_category"]; total: number }) {
  if (!data?.length) return (
    <div className="glass-panel rounded-2xl p-5 border border-white/5 flex flex-col items-center justify-center" style={{ minHeight:260, fontFamily:"'Tajawal','Cairo',sans-serif" }}>
      <DollarSign className="w-8 h-8 text-white/15 mb-2"/><p className="text-white/30 text-sm">لا توجد مصروفات في هذه الفترة</p>
    </div>
  );
  return (
    <div className="glass-panel rounded-2xl p-5 border border-white/5" style={{ fontFamily:"'Tajawal','Cairo',sans-serif" }}>
      <h3 className="text-white font-bold mb-4 flex items-center gap-2 text-sm"><DollarSign className="w-4 h-4 text-red-400"/> توزيع المصروفات ({formatCurrency(total)})</h3>
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <ResponsiveContainer width={180} height={180}>
          <PieChart><Pie data={data} cx="50%" cy="50%" innerRadius={52} outerRadius={80} dataKey="total" nameKey="category" strokeWidth={0}>
            {data.map((_,i)=><Cell key={i} fill={DONUT_COLORS[i%DONUT_COLORS.length]}/>)}
          </Pie>
          <Tooltip contentStyle={{background:"rgba(10,18,35,0.95)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,fontSize:11}} formatter={(v:number)=>[formatCurrency(v),""]}/></PieChart>
        </ResponsiveContainer>
        <div className="flex-1 space-y-2 w-full">
          {data.slice(0,6).map((item,i)=>{
            const pct=total>0?(item.total/total)*100:0;
            return (
              <div key={item.category} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background:DONUT_COLORS[i%DONUT_COLORS.length]}}/>
                <span className="text-white/60 text-xs flex-1 truncate">{item.category}</span>
                <span className="text-white/40 text-xs">{pct.toFixed(0)}%</span>
                <span className="text-white/70 text-xs font-bold tabular-nums">{formatCurrency(item.total)}</span>
              </div>
            );
          })}
          {data.length>6&&<p className="text-white/25 text-xs">+ {data.length-6} فئات أخرى</p>}
        </div>
      </div>
    </div>
  );
}

/* ── Ranked Products ───────────────────────────────────────────────────────── */
const MEDALS = ["🥇","🥈","🥉"];
const MEDAL_GLOW = ["shadow-amber-400/20 border-amber-400/40","shadow-slate-400/15 border-slate-400/30","shadow-orange-700/15 border-orange-700/30","border-white/8","border-white/8"];
function RankedProductsList({ products }: { products: ProfitsData["by_product"] }) {
  const top = useMemo(()=>[...products].sort((a,b)=>b.profit-a.profit).slice(0,5),[products]);
  if (!top.length) return null;
  return (
    <div className="space-y-3" style={{ fontFamily:"'Tajawal','Cairo',sans-serif" }}>
      <div className="flex items-center gap-2 px-1"><ShoppingBag className="w-4 h-4 text-amber-400"/><h3 className="text-white font-bold text-sm">أعلى المنتجات ربحية</h3></div>
      {top.map((p,i)=>{
        const margin=p.revenue>0?(p.profit/p.revenue)*100:0;
        const barColor=margin>=50?"#10b981":margin>=30?"#f59e0b":"#ef4444";
        const marginCls=margin>=50?"bg-emerald-500/20 border-emerald-500/30 text-emerald-400":margin>=30?"bg-amber-500/20 border-amber-500/30 text-amber-400":"bg-red-500/20 border-red-500/30 text-red-400";
        return (
          <motion.div key={p.product_id} initial={{opacity:0,x:30}} animate={{opacity:1,x:0}} transition={{duration:0.4,delay:i*0.1}} whileHover={{y:-3,transition:{duration:0.15}}} className={`glass-panel rounded-2xl p-4 border shadow-lg ${MEDAL_GLOW[i]??"border-white/8"}`}>
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-3">
                <span className="text-2xl leading-none select-none">{MEDALS[i]??`#${i+1}`}</span>
                <div><p className="text-white font-bold">{p.product_name}</p><p className="text-white/30 text-xs mt-0.5">{p.qty_sold} وحدة مباعة</p></div>
              </div>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${marginCls}`}>هامش: {margin.toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden mb-3">
              <motion.div className="h-full rounded-full" style={{background:`linear-gradient(to left,${barColor}cc,${barColor})`}} initial={{width:"0%"}} animate={{width:`${Math.min(margin,100)}%`}} transition={{duration:0.9,delay:i*0.1+0.3,ease:"easeOut"}}/>
            </div>
            <div className="flex gap-4 text-xs flex-wrap">
              <span className="text-white/40">إيراد: <span className="text-emerald-400 font-bold">{formatCurrency(p.revenue)}</span></span>
              <span className="text-white/20">|</span>
              <span className="text-white/40">تكلفة: <span className="text-red-400 font-bold">{formatCurrency(p.cost)}</span></span>
              <span className="text-white/20">|</span>
              <span className="text-white/40">ربح: <span className={`font-black ${p.profit>=0?"text-amber-400":"text-red-400"}`}>{formatCurrency(p.profit)}</span></span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ── Main Component ───────────────────────────────────────────────────────── */
export default function ProfitLossReport() {
  const [mode,setMode]             = useState<DateMode>("month");
  const [customFrom,setCustomFrom] = useState(thisMonthStart());
  const [customTo,setCustomTo]     = useState(todayStr());
  const [dateFrom,dateTo]          = getDateRange(mode,customFrom,customTo);
  const [prevFrom,prevTo]          = getPrevRange(dateFrom,dateTo);

  const qOpts = (from: string, to: string) => ({
    queryKey:["/api/profits",from,to],
    queryFn:()=>authFetch(api(`/api/profits?date_from=${from}&date_to=${to}`)).then(r=>r.json() as Promise<ProfitsData>),
    staleTime:60_000,
  });
  const { data:plData, isLoading } = useQuery<ProfitsData>(qOpts(dateFrom,dateTo));
  const { data:prevData }          = useQuery<ProfitsData>({ ...qOpts(prevFrom,prevTo), enabled:!!prevFrom });
  const pl   = plData   ?? EMPTY_PL;
  const prev = prevData ?? EMPTY_PL;

  return (
    <div className="space-y-5" style={{ fontFamily:"'Tajawal','Cairo',sans-serif" }}>
      <div className="flex flex-wrap items-center gap-2">
        {DATE_MODES.map(m=>(
          <button key={m.id} onClick={()=>setMode(m.id)}
            className={`px-4 py-1.5 rounded-xl text-sm font-bold border transition-all ${mode===m.id?"bg-amber-500/25 border-amber-500/50 text-amber-300 shadow-lg shadow-amber-500/10":"glass-panel border-white/10 text-white/50 hover:text-white hover:border-white/20"}`}>
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
        <button onClick={()=>printPLReport({ dateFrom, dateTo, ...pl })}
          className="mr-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-500/20 border border-blue-500/40 text-blue-400 hover:bg-blue-500/30 transition-all">
          <Printer className="w-3.5 h-3.5"/> تصدير PDF
        </button>
      </div>

      <WaterfallSection pl={pl}/>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <TrendAreaChart by_month={pl.by_month} by_day={pl.by_day}/>
        <ExpenseDonutChart data={pl.by_expense_category} total={pl.total_expenses}/>
      </div>

      <RankedProductsList products={pl.by_product}/>

      {!isLoading && pl.invoice_count===0 && (
        <div className="glass-panel rounded-2xl p-12 text-center border border-white/5">
          <BarChart3 className="w-10 h-10 text-white/20 mx-auto mb-3"/>
          <p className="text-white/40 font-bold">لا توجد بيانات في هذه الفترة</p>
          <p className="text-white/25 text-xs mt-1">جرّب تغيير نطاق التاريخ</p>
        </div>
      )}
    </div>
  );
}
