/**
 * ProfitLossReport — قائمة الأرباح والخسائر
 * Accounting-grade statement · Multi-branch · Clean layout
 */
import React, { useState, useMemo, useCallback } from "react";
import { useAppSettings } from "@/contexts/app-settings";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3, TrendingUp, DollarSign,
  Printer, Building2, ChevronDown, FileDown, Lightbulb,
  HandCoins, CreditCard, Package, ArrowUpRight, ArrowDownRight,
  Minus, RotateCcw,
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

/* ── Types ────────────────────────────────────────────────────────────────── */
interface Warehouse { id: number; name: string; }

/* ── Palette ──────────────────────────────────────────────────────────────── */
const BRANCH_COLORS = ["#f59e0b","#3b82f6","#10b981","#8b5cf6","#f97316","#06b6d4","#ec4899","#ef4444"];
const CAT_COLORS    = ["#f59e0b","#ef4444","#3b82f6","#10b981","#8b5cf6","#f97316","#06b6d4","#ec4899","#84cc16","#6b7280"];

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function pctChange(curr: number, prev: number): number | null {
  if (!prev) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}
/** Accounting number format: negative → (300.00), positive → 300.00 */
function fmtAcct(n: number): string {
  const abs = formatCurrency(Math.abs(n));
  return n < 0 ? `(${abs})` : abs;
}

function ChangePill({ curr, prev }: { curr: number; prev: number }) {
  const chg = pctChange(curr, prev);
  if (chg === null) return null;
  const up = chg >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold rounded-full px-1.5 py-0.5 ${up ? "bg-emerald-500/12 text-emerald-400" : "bg-red-500/12 text-red-400"}`}>
      {up ? <ArrowUpRight className="w-2.5 h-2.5"/> : <ArrowDownRight className="w-2.5 h-2.5"/>}
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

/* ── Accordion (lazy) ─────────────────────────────────────────────────────── */
function Accordion({ title, icon, children, badge }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; badge?: string;
}) {
  const [open, setOpen]       = useState(false);
  const [mounted, setMounted] = useState(false);
  const toggle = () => { if (!mounted) setMounted(true); setOpen(o => !o); };
  return (
    <div className="rpt-panel rounded-2xl overflow-hidden">
      <button onClick={toggle}
        className="rpt-accordion-hd w-full flex items-center justify-between px-5 py-3.5 text-right transition-colors">
        <div className="flex items-center gap-2.5">
          <span className="text-white/50">{icon}</span>
          <span className="rpt-strong font-semibold text-sm">{title}</span>
          {badge && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/12 text-amber-400 border border-amber-500/20">{badge}</span>}
        </div>
        <ChevronDown className={`w-4 h-4 text-white/30 transition-transform duration-200 ${open ? "rotate-180" : ""}`}/>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div key="body" initial={{ height:0, opacity:0 }} animate={{ height:"auto", opacity:1 }} exit={{ height:0, opacity:0 }}
            transition={{ duration:0.22, ease:"easeInOut" }} style={{ overflow:"hidden" }}>
            <div className="px-5 pb-5 pt-1">
              {mounted && children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Branch Selector ──────────────────────────────────────────────────────── */
function BranchSelector({ warehouses, selected, onChange }: {
  warehouses: Warehouse[]; selected: number[]; onChange: (ids:number[])=>void;
}) {
  const [open, setOpen] = useState(false);
  const allSelected = selected.length === 0;
  const label = allSelected
    ? "جميع الفروع"
    : selected.length === 1
      ? (warehouses.find(w=>w.id===selected[0])?.name ?? "فرع")
      : `${selected.length} فروع محددة`;
  const toggle = (id:number) =>
    onChange(selected.includes(id) ? selected.filter(x=>x!==id) : [...selected,id]);
  return (
    <div className="relative">
      <button onClick={()=>setOpen(o=>!o)}
        className="rpt-section flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/10 text-sm font-semibold hover:border-white/20 transition-all">
        <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0"/>
        <span className="rpt-strong text-sm">{label}</span>
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

/* ── KPI Strip — compact 3 cards ─────────────────────────────────────────── */
function KPICard({ label, value, prevVal, accent, sub, icon, index }: {
  label:string; value:number; prevVal:number; accent:string; sub?:string; icon:React.ReactNode; index:number;
}) {
  const animated = useCountUp(value);
  const { settings } = useAppSettings();
  const isLight = (settings.theme ?? "dark") === "light";
  const numColor = accent === "#10b981" && value < 0 ? "#ef4444" : isLight ? "#0f172a" : "#ffffff";
  return (
    <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{duration:0.3,delay:index*0.06}}
      className="rpt-panel rounded-xl px-4 py-3.5"
      style={{ borderRight:`3px solid ${accent}` }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <div style={{ color:accent }}>{icon}</div>
          <span className="rpt-label text-xs">{label}</span>
        </div>
        <ChangePill curr={value} prev={prevVal}/>
      </div>
      <p className="font-black tabular-nums leading-none" style={{ fontSize:"1.45rem", color:numColor }}>
        {formatCurrency(animated)}
      </p>
      {sub && <p className="rpt-muted text-xs mt-1.5">{sub}</p>}
    </motion.div>
  );
}

function KPIStrip({ pl, prev }: { pl: ProfitsData; prev: ProfitsData }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <KPICard label="صافي الربح" value={pl.net_profit} prevVal={prev.net_profit}
        accent={pl.net_profit>=0?"#10b981":"#ef4444"} sub={`هامش ${pl.profit_margin.toFixed(1)}%`}
        icon={<TrendingUp className="w-3.5 h-3.5"/>} index={0}/>
      <KPICard label="إجمالي المبيعات" value={pl.total_revenue} prevVal={prev.total_revenue}
        accent="#f59e0b" sub={`${pl.invoice_count} فاتورة`}
        icon={<BarChart3 className="w-3.5 h-3.5"/>} index={1}/>
      <KPICard label="إجمالي المصروفات" value={pl.total_expenses} prevVal={prev.total_expenses}
        accent="#f97316" sub={pl.by_expense_category[0]?.category}
        icon={<DollarSign className="w-3.5 h-3.5"/>} index={2}/>
    </div>
  );
}

/* ── Accounting Statement Table ───────────────────────────────────────────── */
function AccountingStatement({ pl }: { pl: ProfitsData }) {
  const { settings } = useAppSettings();
  const isLight = (settings.theme ?? "dark") === "light";

  /* ── Design tokens ── */
  const border   = isLight ? "#e5e7eb"               : "rgba(255,255,255,0.08)";
  const txtMain  = isLight ? "#111827"               : "rgba(255,255,255,0.90)";
  const txtSub   = isLight ? "#6b7280"               : "rgba(255,255,255,0.38)";
  const txtHint  = isLight ? "#9ca3af"               : "rgba(255,255,255,0.28)";
  const secBg    = isLight ? "#f8fafc"               : "rgba(255,255,255,0.03)";
  const totalBg  = isLight ? "#f1f5f9"               : "rgba(255,255,255,0.05)";
  const grossBg  = isLight ? "#fef9ec"               : "rgba(245,158,11,0.08)";
  const netBg    = pl.net_profit >= 0
    ? (isLight ? "#ecfdf5" : "rgba(5,150,105,0.10)")
    : (isLight ? "#fef2f2" : "rgba(220,38,38,0.10)");
  const netColor = pl.net_profit >= 0 ? "#059669"    : "#dc2626";
  const grossClr = pl.gross_profit >= 0 ? "#d97706"  : "#dc2626";

  const hasReturn   = pl.return_amount > 0;
  const netRevenue  = pl.total_revenue - pl.return_amount;
  const expCats     = pl.by_expense_category.slice(0, 8);
  const otherExpAmt = pl.by_expense_category.slice(8).reduce((s,e)=>s+e.total, 0);
  const grossMargin = pl.total_revenue > 0 ? (pl.gross_profit / pl.total_revenue) * 100 : 0;
  const netMargin   = pl.total_revenue > 0 ? (pl.net_profit   / pl.total_revenue) * 100 : 0;

  /* ── Shared cell styles ── */
  const cell = (extra?: React.CSSProperties): React.CSSProperties => ({
    padding: "10px 20px",
    borderBottom: `1px solid ${border}`,
    color: txtMain,
    fontSize: 13,
    verticalAlign: "middle",
    ...extra,
  });
  const cellNum = (extra?: React.CSSProperties): React.CSSProperties => ({
    ...cell(),
    textAlign: "left",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
    fontWeight: 700,
    ...extra,
  });

  /* ── Section header row ── */
  const SectionHd = ({ label, hint }: { label: string; hint?: string }) => (
    <tr style={{ background: secBg }}>
      <td colSpan={2} style={{
        padding: "10px 20px 6px",
        borderTop: `2px solid ${border}`,
        borderBottom: `1px solid ${border}`,
      }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: txtMain, letterSpacing: "0.02em" }}>{label}</p>
        {hint && <p style={{ fontSize: 10, color: txtHint, marginTop: 2 }}>{hint}</p>}
      </td>
    </tr>
  );

  /* ── Child detail row ── */
  const ChildRow = ({ label, amount, color }: { label: string; amount: string; color?: string }) => (
    <tr>
      <td style={cell({ paddingRight: 36, color: txtSub, fontSize: 12.5 })}>{label}</td>
      <td style={cellNum({ color: color ?? txtSub, fontSize: 12.5 })}>{amount}</td>
    </tr>
  );

  /* ── Subtotal / total row ── */
  const TotalRow = ({ label, amount, color, bg, fontSize = 13, borderWidth = 1, bold = 700 }:
    { label:string; amount:string; color?:string; bg?:string; fontSize?:number; borderWidth?:number; bold?:number }) => (
    <tr style={{ background: bg, borderTop: `${borderWidth}px solid ${border}`, borderBottom: `${borderWidth}px solid ${border}` }}>
      <td style={cell({ fontWeight: bold, fontSize, color: color ?? txtMain, borderBottom: "none", borderTop: "none", paddingTop: 12, paddingBottom: 12 })}>{label}</td>
      <td style={cellNum({ fontWeight: bold, fontSize, color: color ?? txtMain, borderBottom: "none", borderTop: "none", paddingTop: 12, paddingBottom: 12 })}>{amount}</td>
    </tr>
  );

  /* ── Empty spacer between sections ── */
  const Spacer = () => (
    <tr><td colSpan={2} style={{ height: 1, background: border, padding: 0 }}/></tr>
  );

  return (
    <div className="rpt-panel rounded-2xl overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: border }}>
        <div>
          <p className="rpt-strong font-bold text-sm">قائمة الأرباح والخسائر</p>
          <p style={{ fontSize: 10, color: txtHint, marginTop: 2 }}>للفترة المالية المحددة</p>
        </div>
        <span className="rpt-muted text-xs">بالجنيه المصري (ج.م)</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <colgroup>
            <col style={{ width: "62%" }}/>
            <col style={{ width: "38%" }}/>
          </colgroup>
          <tbody>

            {/* ══ 1. الإيرادات ══ */}
            <SectionHd label="الإيرادات" hint="الدخل الناتج من المبيعات"/>

            <tr>
              <td style={cell({ fontWeight: 600 })}>إجمالي المبيعات</td>
              <td style={cellNum({ color: "#059669" })}>{formatCurrency(pl.total_revenue)}</td>
            </tr>

            {hasReturn && (
              <ChildRow label="(−) مرتجعات المبيعات"
                amount={`(${formatCurrency(pl.return_amount)})`}
                color="#dc2626"/>
            )}

            {hasReturn && (
              <TotalRow label="= صافي الإيرادات"
                amount={formatCurrency(netRevenue)}
                bg={totalBg}/>
            )}

            <Spacer/>

            {/* ══ 2. تكلفة البضاعة المباعة ══ */}
            <SectionHd label="تكلفة البضاعة المباعة"/>

            <ChildRow label="(−) تكلفة المنتجات المباعة"
              amount={`(${formatCurrency(pl.total_cost)})`}
              color="#dc2626"/>

            <Spacer/>

            {/* ══ 3. مجمل الربح (إجمالي) ══ */}
            <tr style={{ background: grossBg }}>
              <td style={cell({ fontWeight: 800, fontSize: 15, color: grossClr, borderBottom: "none", borderTop: `2px solid ${border}`, paddingTop: 14, paddingBottom: 14 })}>
                = مجمل الربح
              </td>
              <td style={cellNum({ fontWeight: 800, fontSize: 15, color: grossClr, borderBottom: "none", borderTop: `2px solid ${border}`, paddingTop: 14, paddingBottom: 14 })}>
                {fmtAcct(pl.gross_profit)}
                <span style={{ fontSize: 11, fontWeight: 500, marginRight: 10, opacity: 0.65 }}>
                  {grossMargin !== 0 ? `${grossMargin.toFixed(1)}%` : ""}
                </span>
              </td>
            </tr>

            <Spacer/>

            {/* ══ 4. المصروفات التشغيلية ══ */}
            <SectionHd label="المصروفات التشغيلية" hint="تكاليف التشغيل اليومية"/>

            {expCats.length > 0 ? (
              expCats.map(e => (
                <ChildRow key={e.category}
                  label={`(−) ${e.category}`}
                  amount={`(${formatCurrency(e.total)})`}
                  color="#dc2626"/>
              ))
            ) : pl.total_expenses > 0 ? (
              <ChildRow label="(−) مصروفات تشغيلية"
                amount={`(${formatCurrency(pl.total_expenses)})`}
                color="#dc2626"/>
            ) : (
              <tr>
                <td colSpan={2} style={{ ...cell(), color: txtHint, textAlign: "center", fontStyle: "italic", fontSize: 12 }}>
                  لا توجد مصروفات مسجلة في هذه الفترة
                </td>
              </tr>
            )}

            {otherExpAmt > 0 && (
              <ChildRow label="(−) مصروفات أخرى"
                amount={`(${formatCurrency(otherExpAmt)})`}
                color="#dc2626"/>
            )}

            {/* إجمالي المصروفات — يظهر فقط إذا كان هناك تفصيل */}
            {expCats.length > 0 && (
              <TotalRow label="إجمالي المصروفات"
                amount={`(${formatCurrency(pl.total_expenses)})`}
                color="#dc2626"
                bg={totalBg}/>
            )}

            <Spacer/>

            {/* ══ 5. صافي الربح / الخسارة ══ */}
            <tr style={{ background: netBg }}>
              <td style={cell({ fontWeight: 800, fontSize: 18, color: netColor, borderBottom: "none", borderTop: `2px solid ${netColor}30`, paddingTop: 18, paddingBottom: 18 })}>
                = صافي الربح / الخسارة
              </td>
              <td style={cellNum({ fontWeight: 800, fontSize: 18, color: netColor, borderBottom: "none", borderTop: `2px solid ${netColor}30`, paddingTop: 18, paddingBottom: 18 })}>
                {fmtAcct(pl.net_profit)}
                <span style={{ fontSize: 12, fontWeight: 600, marginRight: 10, opacity: 0.68 }}>
                  {netMargin !== 0 ? `${netMargin.toFixed(1)}%` : ""}
                </span>
              </td>
            </tr>

          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Branch Comparison Table ──────────────────────────────────────────────── */
function BranchTable({ warehouses }: { warehouses: ProfitsData["by_warehouse"] }) {
  const active = warehouses.filter(w => w.revenue > 0 || w.invoice_count > 0);
  if (active.length < 2) return null;

  return (
    <div className="rpt-section rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-white/8 flex items-center gap-2">
        <Building2 className="w-4 h-4 text-amber-400"/>
        <span className="rpt-strong font-semibold text-sm">مقارنة الفروع</span>
        <span className="rpt-muted text-xs mr-auto">{active.length} فروع</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-right text-sm whitespace-nowrap" style={{borderCollapse:"collapse"}}>
          <thead>
            <tr>
              {["الفرع","المبيعات","تكلفة البضاعة","مجمل الربح","الهامش","الفواتير"].map(h=>(
                <th key={h} className="rpt-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {active.map((w, i) => {
              const margin = w.revenue > 0 ? (w.gross_profit / w.revenue) * 100 : 0;
              const mgColor = margin >= 30 ? "text-emerald-400 bg-emerald-500/12" : margin >= 15 ? "text-amber-400 bg-amber-500/12" : "text-red-400 bg-red-500/10";
              return (
                <tr key={w.warehouse_id} className="erp-table-row border-b border-white/5 transition-colors">
                  <td className="rpt-td">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{background:BRANCH_COLORS[i%BRANCH_COLORS.length]}}/>
                      <span className="rpt-strong font-semibold">{w.warehouse_name}</span>
                      {i === 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/12 text-amber-400 font-bold">الأعلى</span>}
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
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-white/10">
              <td className="rpt-td rpt-muted text-xs font-semibold">الإجمالي</td>
              <td className="rpt-td rpt-td-num font-black tabular-nums">{formatCurrency(active.reduce((s,w)=>s+w.revenue,0))}</td>
              <td className="rpt-td rpt-muted tabular-nums">{formatCurrency(active.reduce((s,w)=>s+w.cost,0))}</td>
              <td className="rpt-td font-black text-emerald-400 tabular-nums">{formatCurrency(active.reduce((s,w)=>s+w.gross_profit,0))}</td>
              <td colSpan={2}/>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* ── [Accordion] Sales Breakdown ─────────────────────────────────────────── */
function SalesBreakdown({ pl }: { pl: ProfitsData }) {
  const segments = [
    { label:"نقدي",  value:pl.cash_sales,    color:"#10b981", icon:<HandCoins className="w-3.5 h-3.5"/> },
    { label:"آجل",   value:pl.credit_sales,  color:"#3b82f6", icon:<CreditCard className="w-3.5 h-3.5"/> },
    { label:"جزئي",  value:pl.partial_sales, color:"#f59e0b", icon:<Minus className="w-3.5 h-3.5"/> },
    { label:"مرتجع", value:pl.return_amount, color:"#ef4444", icon:<RotateCcw className="w-3.5 h-3.5"/> },
  ].filter(s=>s.value>0);
  const total = pl.total_revenue + pl.return_amount;
  if (!segments.length) return <p className="rpt-muted text-sm py-4 text-center">لا توجد بيانات</p>;
  return (
    <div className="space-y-3 pt-1">
      <div className="flex h-2 rounded-full overflow-hidden gap-px">
        {segments.filter(s=>s.label!=="مرتجع").map(s=>(
          <div key={s.label} className="h-full" style={{ flexGrow: total>0?s.value/total:0, background:s.color, minWidth: s.value>0?"2px":"0" }}/>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {segments.map(s=>{
          const pct = total > 0 ? (s.value/total)*100 : 0;
          return (
            <div key={s.label} className="rounded-xl p-3 border" style={{background:`${s.color}0c`,borderColor:`${s.color}22`}}>
              <div className="flex items-center gap-1.5 mb-1.5" style={{color:s.color}}>{s.icon}<span className="text-xs font-semibold">{s.label}</span></div>
              <p className="rpt-strong font-bold text-sm tabular-nums">{formatCurrency(s.value)}</p>
              <p className="text-xs mt-0.5" style={{color:`${s.color}99`}}>{pct.toFixed(1)}%</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── [Accordion] Expense Breakdown ──────────────────────────────────────── */
function ExpenseBreakdown({ data, total }: { data: ProfitsData["by_expense_category"]; total: number }) {
  if (!data.length) return <p className="rpt-muted text-sm py-4 text-center">لا توجد مصروفات</p>;
  return (
    <div className="flex flex-col sm:flex-row gap-5 pt-1">
      <ResponsiveContainer width={150} height={150}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={68} dataKey="total" strokeWidth={0}>
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
              <span className="rpt-muted text-xs flex-1 truncate">{item.category}</span>
              <div className="w-14 h-1 rounded-full overflow-hidden" style={{background:"rgba(255,255,255,0.06)"}}>
                <div className="h-full rounded-full" style={{width:`${pct}%`,background:CAT_COLORS[i%CAT_COLORS.length]}}/>
              </div>
              <span className="rpt-muted text-xs w-7 text-left">{pct.toFixed(0)}%</span>
              <span className="rpt-strong text-xs font-bold tabular-nums">{formatCurrency(item.total)}</span>
            </div>
          );
        })}
        {data.length>8 && <p className="rpt-muted text-xs pt-1">+{data.length-8} فئات أخرى</p>}
      </div>
    </div>
  );
}

/* ── [Accordion] Top Products ───────────────────────────────────────────── */
const MEDALS = ["🥇","🥈","🥉"];
function TopProducts({ products }: { products: ProfitsData["by_product"] }) {
  const top = useMemo(()=>[...products].sort((a,b)=>b.profit-a.profit).slice(0,5),[products]);
  if (!top.length) return <p className="rpt-muted text-sm py-4 text-center">لا توجد منتجات</p>;
  return (
    <div className="space-y-2 pt-1">
      {top.map((p,i)=>{
        const margin = p.revenue>0?(p.profit/p.revenue)*100:0;
        const accent = margin>=50?"#10b981":margin>=30?"#f59e0b":"#ef4444";
        return (
          <div key={p.product_id} className="rpt-panel flex items-center gap-3 px-4 py-3 rounded-xl">
            <span className="text-base shrink-0">{MEDALS[i]??`#${i+1}`}</span>
            <div className="flex-1 min-w-0">
              <p className="rpt-strong font-semibold text-sm truncate">{p.product_name}</p>
              <p className="rpt-muted text-xs">{p.qty_sold} وحدة</p>
            </div>
            <div className="text-left shrink-0">
              <p className="font-black text-sm tabular-nums" style={{color:accent}}>{formatCurrency(p.profit)}</p>
              <p className="text-xs" style={{color:`${accent}80`}}>هامش {margin.toFixed(1)}%</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── [Accordion] Insights ───────────────────────────────────────────────── */
function InsightsContent({ pl }: { pl: ProfitsData }) {
  const topBranch = useMemo(()=>[...pl.by_warehouse].sort((a,b)=>b.gross_profit-a.gross_profit)[0],[pl.by_warehouse]);
  const topExpCat = pl.by_expense_category[0];
  const avgMargin = pl.total_revenue>0?(pl.gross_profit/pl.total_revenue)*100:0;
  const items: { icon:string; text:string; color:string }[] = [];
  if (topBranch?.revenue>0) items.push({icon:"🏆",text:`أفضل فرع: ${topBranch.warehouse_name} — ربح ${formatCurrency(topBranch.gross_profit)}`,color:"text-amber-300"});
  if (topExpCat)             items.push({icon:"💸",text:`أعلى مصروف: ${topExpCat.category} — ${formatCurrency(topExpCat.total)}`,color:"text-orange-300"});
  if (avgMargin<15&&pl.total_revenue>0) items.push({icon:"📉",text:`هامش الربح منخفض (${avgMargin.toFixed(1)}%) — راجع تكاليف البضاعة`,color:"text-red-300"});
  if (pl.return_amount>pl.total_revenue*0.1&&pl.total_revenue>0) items.push({icon:"🔄",text:`نسبة مرتجعات مرتفعة: ${((pl.return_amount/pl.total_revenue)*100).toFixed(1)}%`,color:"text-orange-300"});
  if (pl.credit_sales>pl.cash_sales&&pl.credit_sales>0) items.push({icon:"💳",text:"المبيعات الآجلة أعلى من النقدية — تابع الديون بانتظام",color:"text-blue-300"});
  if (!items.length) return <p className="rpt-muted text-sm py-4 text-center">لا توجد رؤى لهذه الفترة</p>;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
      {items.map((ins,i)=>(
        <div key={i} className="rpt-panel flex items-start gap-3 p-3 rounded-xl">
          <span className="text-base shrink-0">{ins.icon}</span>
          <p className={`text-xs leading-relaxed font-medium ${ins.color}`}>{ins.text}</p>
        </div>
      ))}
    </div>
  );
}

/* ── [Accordion] Charts (optional) ─────────────────────────────────────── */
function ChartsContent({ pl, prev, currLabel, prevLabel }: { pl:ProfitsData; prev:ProfitsData; currLabel:string; prevLabel:string }) {
  const [tab, setTab] = useState<"trend"|"waterfall"|"compare">("trend");
  return (
    <div className="pt-1">
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
  if (!data.length) return <p className="rpt-muted text-sm py-6 text-center">لا توجد بيانات</p>;
  return (
    <div>
      <div className="flex justify-end mb-3">
        <div className="rpt-tab-bar flex gap-1 p-0.5">
          {([{id:"month" as const,l:"شهري"},{id:"day" as const,l:"يومي"}]).map(t=>(
            <button key={t.id} onClick={()=>setView(t.id)} className={`rpt-tab ${view===t.id?"active text-amber-400":""}`}>{t.l}</button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={190}>
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
    {name:"المبيعات",    displayVal:rev,            base:0,                fill:WF_CLR.revenue,                    label:`+${formatCurrency(rev)}`},
    {name:"التكلفة",     displayVal:cost,           base:Math.max(gross,0),fill:WF_CLR.cost,                       label:`-${formatCurrency(cost)}`},
    {name:"مجمل الربح", displayVal:Math.abs(gross), base:gross>=0?0:gross, fill:gross>=0?WF_CLR.grossPos:"#ef4444", label:`=${formatCurrency(gross)}`, r:true},
    {name:"المصروفات",  displayVal:exp,             base:Math.max(net,0),  fill:WF_CLR.expenses,                   label:`-${formatCurrency(exp)}`},
    {name:"صافي الربح", displayVal:Math.abs(net),   base:net>=0?0:net,     fill:net>=0?WF_CLR.netPos:WF_CLR.netNeg, label:`=${formatCurrency(net)}`, r:true},
  ];
  const maxD = Math.max(rev,cost,Math.abs(gross),exp,Math.abs(net),1);
  const lbl = (props:any) => {
    const {x,y,width,height,index}=props; const item=data[index]; if(!item) return null;
    const cx=x+width/2; const cy=height>22?y+height/2:y-7;
    return <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.85)" fontSize={9} fontWeight={700} fontFamily="Tajawal,Cairo,sans-serif">{item.label}</text>;
  };
  return (
    <ResponsiveContainer width="100%" height={190}>
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
      <div className="flex justify-between text-xs rpt-muted mb-2 px-1">
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

/* ── Main Component ─────────────────────────────────────────────────────── */
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
    : branches.length===1 ? (warehouses.find(w=>w.id===branches[0])?.name??String(branches[0]))
    : `${branches.length} فروع محددة`;
  const currLabel = `${dateFrom} → ${dateTo}`;
  const prevLabel = `${prevFrom} → ${prevTo}`;
  const hasData = pl.invoice_count > 0 || pl.total_expenses > 0;

  return (
    <div className="space-y-4" dir="rtl" style={{fontFamily:"'Tajawal','Cairo',sans-serif"}}>

      {/* ── Top bar ── */}
      <div className="no-print flex flex-wrap items-center gap-2">
        {/* Date mode pills */}
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
            <span className="rpt-muted">←</span>
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

      {/* ── KPI Strip — compact ── */}
      <KPIStrip pl={pl} prev={prev}/>

      {/* ── Main content ── */}
      {hasData ? (
        <>
          {/* PRIMARY: Accounting Statement */}
          <AccountingStatement pl={pl}/>

          {/* Branch table (only if multiple) */}
          <BranchTable warehouses={pl.by_warehouse}/>

          {/* Optional accordion sections */}
          <div className="space-y-2.5">
            <Accordion title="تفصيل المبيعات" icon={<HandCoins className="w-4 h-4"/>}
              badge={pl.cash_sales+pl.credit_sales+pl.partial_sales>0?undefined:undefined}>
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
          <div className="rpt-section rounded-2xl p-16 flex flex-col items-center gap-3">
            <BarChart3 className="w-10 h-10 text-white/15"/>
            <p className="rpt-strong font-semibold">لا توجد بيانات للفترة المحددة</p>
            <p className="rpt-muted text-xs">جرّب تغيير النطاق الزمني أو الفرع المحدد</p>
          </div>
        )
      )}
    </div>
  );
}
