import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Truck, Package, BarChart3, DollarSign, AlertTriangle, ArrowUp, Loader2, ChevronDown, X } from "lucide-react";
import { api, authFetch, formatCurrency } from "./shared";

interface HealthIssue {
  id:string; group:string; type:string; severity:"OK"|"WARNING"|"CRITICAL"; color:"green"|"yellow"|"red";
  message:string; action:string; details:Record<string,unknown>;
}
interface HealthCheckData {
  status:"OK"|"WARNING"|"CRITICAL"; color:"green"|"yellow"|"red"; checked_at:string;
  summary:{ total_checks:number; ok:number; warnings:number; critical:number };
  groups:Record<string,HealthIssue[]>; issues:HealthIssue[];
}

const GROUP_LABELS: Record<string,string> = {
  customer_issues:"مشاكل العملاء", supplier_issues:"مشاكل العملاء (مشتريات)",
  inventory_issues:"مشاكل المخزون", accounting_issues:"مشاكل المحاسبة", cash_issues:"مشاكل النقدية",
};
const GROUP_ICONS: Record<string,React.ReactNode> = {
  customer_issues:<Users className="w-4 h-4"/>, supplier_issues:<Truck className="w-4 h-4"/>,
  inventory_issues:<Package className="w-4 h-4"/>, accounting_issues:<BarChart3 className="w-4 h-4"/>, cash_issues:<DollarSign className="w-4 h-4"/>,
};
const SEV_CFG = {
  OK:       { bg:"bg-emerald-500/15", border:"border-emerald-500/30", text:"text-emerald-400", badge:"bg-emerald-500/20 text-emerald-300", dot:"bg-emerald-400", label:"سليم" },
  WARNING:  { bg:"bg-amber-500/15",   border:"border-amber-500/30",   text:"text-amber-400",   badge:"bg-amber-500/20 text-amber-300",   dot:"bg-amber-400",   label:"تحذير" },
  CRITICAL: { bg:"bg-red-500/15",     border:"border-red-500/30",     text:"text-red-400",     badge:"bg-red-500/20 text-red-300",       dot:"bg-red-400",     label:"حرج" },
};

function SeverityBadge({ sev }: { sev:"OK"|"WARNING"|"CRITICAL" }) {
  const c=SEV_CFG[sev];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${c.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`}/>{c.label}
    </span>
  );
}

function IssueCard({ issue, onClick }: { issue:HealthIssue; onClick:()=>void }) {
  const c=SEV_CFG[issue.severity];
  return (
    <button onClick={onClick} className={`w-full text-right p-4 rounded-xl border ${c.bg} ${c.border} hover:brightness-110 transition-all cursor-pointer`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1"><SeverityBadge sev={issue.severity}/><span className="text-white/40 text-xs font-mono">{issue.id}</span></div>
          <p className={`font-bold text-sm ${c.text} leading-snug`}>{issue.message}</p>
          <p className="text-white/50 text-xs mt-1 flex items-center gap-1"><ArrowUp className="w-3 h-3 rotate-45 shrink-0"/>{issue.action}</p>
        </div>
        {issue.severity!=="OK"&&(
          <div className="text-right shrink-0">
            {typeof issue.details.difference==="number"&&(
              <span className={`text-sm font-bold tabular-nums ${c.text}`}>{(issue.details.difference as number)>0?"+":""}{formatCurrency(issue.details.difference as number)}</span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

function IssueDetailModal({ issue, onClose }: { issue:HealthIssue; onClose:()=>void }) {
  const c=SEV_CFG[issue.severity];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{scale:0.92,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.92,opacity:0}}
        className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 max-w-lg w-full shadow-2xl"
        onClick={e=>e.stopPropagation()} dir="rtl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2"><SeverityBadge sev={issue.severity}/><span className="text-white/40 text-xs font-mono">{issue.id}</span></div>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="w-5 h-5"/></button>
        </div>
        <h3 className={`text-lg font-bold mb-1 ${c.text}`}>{issue.message}</h3>
        <p className="text-white/60 text-sm mb-4 flex items-start gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400"/>{issue.action}</p>
        <div className={`rounded-xl p-4 border ${c.bg} ${c.border} space-y-2`}>
          <p className="text-white/50 text-xs font-bold mb-2">تفاصيل الفحص</p>
          {Object.entries(issue.details).map(([k,v])=>(
            <div key={k} className="flex items-center justify-between text-sm">
              <span className="text-white/40 font-mono text-xs">{k}</span>
              <span className={`font-bold tabular-nums ${typeof v==="number"&&k.includes("difference")&&(v as number)!==0?c.text:"text-white"}`}>
                {typeof v==="number" ? (k.includes("qty")||k.includes("count")||k.includes("checked")?String(v):formatCurrency(v)) : String(v)}
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

export default function HealthCheckReport() {
  const [selected,setSelected] = useState<HealthIssue|null>(null);
  const [expandedGroups,setExpandedGroups] = useState<Record<string,boolean>>({
    customer_issues:true, supplier_issues:true, inventory_issues:true, accounting_issues:true, cash_issues:true,
  });
  const { data, isLoading, refetch, isFetching } = useQuery<HealthCheckData>({
    queryKey:["health-check"],
    queryFn:()=>authFetch(api("/api/reports/health-check")).then(r=>r.json()),
    staleTime:30_000,
  });
  const toggleGroup=(g:string)=>setExpandedGroups(prev=>({...prev,[g]:!prev[g]}));

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <Loader2 className="w-10 h-10 animate-spin text-amber-400"/>
      <p className="text-white/50 text-sm">جارٍ فحص صحة النظام…</p>
    </div>
  );
  if (!data) return null;

  const { status, summary, groups, checked_at } = data;
  const cfg=SEV_CFG[status];
  const statusEmoji=status==="OK"?"✅":status==="WARNING"?"⚠️":"🔴";
  const statusAR=status==="OK"?"النظام سليم":status==="WARNING"?"يوجد تحذيرات":"يوجد مشاكل حرجة";

  return (
    <div className="space-y-5" dir="rtl" style={{ fontFamily:"'Tajawal','Cairo',sans-serif" }}>
      <motion.div initial={{scale:0.97,opacity:0}} animate={{scale:1,opacity:1}}
        className={`rounded-2xl border-2 p-6 ${cfg.bg} ${cfg.border} flex items-center justify-between`}>
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-4xl">{statusEmoji}</span>
            <div>
              <h2 className={`text-2xl font-black ${cfg.text}`}>{statusAR}</h2>
              <p className="text-white/40 text-xs mt-0.5">آخر فحص: {new Date(checked_at).toLocaleString("ar-EG")}</p>
            </div>
          </div>
        </div>
        <button onClick={()=>refetch()} disabled={isFetching}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 hover:text-white text-sm font-bold transition-all disabled:opacity-50">
          <Loader2 className={`w-4 h-4 ${isFetching?"animate-spin":""}`}/> إعادة الفحص
        </button>
      </motion.div>

      <div className="grid grid-cols-4 gap-3">
        {[
          {label:"إجمالي الفحوصات",value:summary.total_checks,color:"text-white",      bg:"bg-white/5",         border:"border-white/10"},
          {label:"سليم",           value:summary.ok,           color:"text-emerald-400",bg:"bg-emerald-500/10", border:"border-emerald-500/20"},
          {label:"تحذيرات",        value:summary.warnings,     color:"text-amber-400",  bg:"bg-amber-500/10",   border:"border-amber-500/20"},
          {label:"حرجة",           value:summary.critical,     color:"text-red-400",    bg:"bg-red-500/10",     border:"border-red-500/20"},
        ].map(c=>(
          <div key={c.label} className={`rounded-xl border p-4 text-center ${c.bg} ${c.border}`}>
            <div className={`text-3xl font-black tabular-nums ${c.color}`}>{c.value}</div>
            <div className="text-white/50 text-xs mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {Object.entries(groups).map(([groupKey,groupIssues])=>{
          const hasWarnings=groupIssues.some(i=>i.severity==="WARNING");
          const hasCritical=groupIssues.some(i=>i.severity==="CRITICAL");
          const groupStatus:"OK"|"WARNING"|"CRITICAL"=hasCritical?"CRITICAL":hasWarnings?"WARNING":"OK";
          const gc=SEV_CFG[groupStatus];
          const isOpen=expandedGroups[groupKey]??true;
          return (
            <div key={groupKey} className="rounded-2xl border border-white/10 overflow-hidden bg-white/3">
              <button onClick={()=>toggleGroup(groupKey)} className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-2 text-white/70">
                  {GROUP_ICONS[groupKey]}<span className="font-bold text-sm">{GROUP_LABELS[groupKey]}</span><span className="text-white/30 text-xs">({groupIssues.length})</span>
                </div>
                <div className="flex items-center gap-2"><SeverityBadge sev={groupStatus}/><ChevronDown className={`w-4 h-4 text-white/40 transition-transform ${isOpen?"rotate-180":""}`}/></div>
              </button>
              <AnimatePresence initial={false}>
                {isOpen&&(
                  <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.2}} className="overflow-hidden">
                    <div className="px-4 pb-4 space-y-2">
                      {groupIssues.map(issue=><IssueCard key={issue.id} issue={issue} onClick={()=>setSelected(issue)}/>)}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {selected&&<IssueDetailModal issue={selected} onClose={()=>setSelected(null)}/>}
      </AnimatePresence>
    </div>
  );
}
