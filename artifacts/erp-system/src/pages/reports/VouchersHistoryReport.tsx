/**
 * VouchersHistoryReport — سجل السندات المحسّن
 * Features: date filter, search, pagination, type filter, read-focused (no delete), post/cancel
 */
import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetSettingsSafes } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import {
  HandCoins, ArrowUpFromLine, ArrowLeftRight, ReceiptText,
  Search, CheckCircle, XCircle, ChevronRight, ChevronLeft, Filter,
} from "lucide-react";
import { api, authFetch, formatCurrency, TableSkeleton, DateFilterBar, getDateRange, DateMode, thisMonthStart, todayStr } from "./shared";
import { safeArray } from "@/lib/safe-data";
import { useToast } from "@/hooks/use-toast";

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface RV { id:number; voucher_no:string; date:string; customer_name:string; safe_name:string; amount:number; notes:string|null; }
interface DV { id:number; voucher_no:string; date:string; customer_name:string|null; safe_name:string; amount:number; posting_status:string; source:string|null; notes:string|null; }
interface PV { id:number; voucher_no:string; date:string; customer_name:string; safe_name:string; amount:number; posting_status:string; notes:string|null; }
interface ST { id:number; type:string; safe_name:string|null; amount:number; direction:string; description:string|null; date:string|null; }

type VKind = "receipt"|"deposit"|"payment"|"transfer";
interface UV {
  uid:string; kind:VKind; rawId:number; voucherNo:string; partyName:string;
  safeName:string; amount:number; status:string|null; date:string; notes:string|null;
  voucherType:"قبض"|"صرف"; subType:string;
}

function unifyVouchers(r:RV[], d:DV[], p:PV[], t:ST[]): UV[] {
  const rows: UV[] = [];
  r.forEach(v=>rows.push({uid:`receipt-${v.id}`,kind:"receipt",rawId:v.id,voucherNo:v.voucher_no,partyName:v.customer_name,safeName:v.safe_name,amount:v.amount,status:null,date:v.date,notes:v.notes,voucherType:"قبض",subType:"عميل"}));
  d.forEach(v=>rows.push({uid:`deposit-${v.id}`,kind:"deposit",rawId:v.id,voucherNo:v.voucher_no,partyName:v.customer_name||v.source||"—",safeName:v.safe_name,amount:v.amount,status:v.posting_status,date:v.date,notes:v.notes,voucherType:"قبض",subType:"توريد"}));
  p.forEach(v=>rows.push({uid:`payment-${v.id}`,kind:"payment",rawId:v.id,voucherNo:v.voucher_no,partyName:v.customer_name,safeName:v.safe_name,amount:v.amount,status:v.posting_status,date:v.date,notes:v.notes,voucherType:"صرف",subType:"صرف"}));
  t.filter(x=>x.direction==="out"&&x.type==="transfer_out").forEach(x=>rows.push({uid:`transfer-${x.id}`,kind:"transfer",rawId:x.id,voucherNo:`TRF-${x.id}`,partyName:x.description||"تحويل خزنة",safeName:x.safe_name||"—",amount:x.amount,status:null,date:x.date||"",notes:null,voucherType:"صرف",subType:"تحويل"}));
  return rows.sort((a,b)=>b.date.localeCompare(a.date));
}

/* ─── Badges ─────────────────────────────────────────────────────────────── */
function VTypeBadge({ type }: { type:"قبض"|"صرف" }) {
  return type==="قبض"
    ? <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"><HandCoins className="w-3 h-3"/>قبض</span>
    : <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30"><ArrowUpFromLine className="w-3 h-3"/>صرف</span>;
}
function VSubBadge({ sub }: { sub:string }) {
  const map: Record<string,string> = {
    "عميل":   "bg-blue-500/15 text-blue-300 border-blue-500/20",
    "توريد":  "bg-teal-500/15 text-teal-300 border-teal-500/20",
    "صرف":    "bg-orange-500/15 text-orange-300 border-orange-500/20",
    "تحويل":  "bg-violet-500/15 text-violet-300 border-violet-500/20",
  };
  return <span className={`px-2 py-0.5 rounded-lg text-xs font-medium border ${map[sub]??"bg-white/10 text-white/50 border-white/10"}`}>{sub}</span>;
}
function VoucherStatusBadge({ status }: { status:string|null }) {
  if (!status)                return <span className="text-xs text-white/30">—</span>;
  if (status==="posted")      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400">مرحَّل</span>;
  if (status==="cancelled")   return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">ملغى</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-white/10 text-white/50">مسودة</span>;
}

/* ─── Pagination helper ───────────────────────────────────────────────────── */
function Paginator({ page, total, perPage, onChange }: { page:number; total:number; perPage:number; onChange:(p:number)=>void }) {
  const totalPages = Math.max(1, Math.ceil(total/perPage));
  if (totalPages<=1) return null;
  return (
    <div className="flex items-center justify-center gap-2 pt-2" dir="ltr">
      <button onClick={()=>onChange(1)} disabled={page===1} className="p-1.5 rounded-lg text-white/40 hover:text-white disabled:opacity-30 hover:bg-white/10 transition-all"><ChevronRight className="w-4 h-4"/><ChevronRight className="w-4 h-4 -mr-2.5"/></button>
      <button onClick={()=>onChange(page-1)} disabled={page===1} className="p-1.5 rounded-lg text-white/40 hover:text-white disabled:opacity-30 hover:bg-white/10 transition-all"><ChevronRight className="w-4 h-4"/></button>
      <span className="text-xs text-white/50 min-w-[80px] text-center font-mono">{page} / {totalPages}</span>
      <button onClick={()=>onChange(page+1)} disabled={page===totalPages} className="p-1.5 rounded-lg text-white/40 hover:text-white disabled:opacity-30 hover:bg-white/10 transition-all"><ChevronLeft className="w-4 h-4"/></button>
      <button onClick={()=>onChange(totalPages)} disabled={page===totalPages} className="p-1.5 rounded-lg text-white/40 hover:text-white disabled:opacity-30 hover:bg-white/10 transition-all"><ChevronLeft className="w-4 h-4"/><ChevronLeft className="w-4 h-4 -ml-2.5"/></button>
    </div>
  );
}

/* ─── Main Component ──────────────────────────────────────────────────────── */
type VFilter = "الكل"|"قبض"|"صرف"|"تحويل";
const PER_PAGE_OPTIONS = [10,20,50];

export default function VouchersHistoryReport() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data:safes=[] } = useGetSettingsSafes();

  const { data:receiptsRaw,  isLoading:l1 } = useQuery<RV[]>({ queryKey:["/api/receipt-vouchers"],  queryFn:()=>authFetch(api("/api/receipt-vouchers")).then(async r=>{ if(!r.ok) throw new Error(`API Error: ${r.status}`); return r.json(); }) });
  const { data:depositsRaw,  isLoading:l2 } = useQuery<DV[]>({ queryKey:["/api/deposit-vouchers"],  queryFn:()=>authFetch(api("/api/deposit-vouchers")).then(async r=>{ if(!r.ok) throw new Error(`API Error: ${r.status}`); return r.json(); }) });
  const { data:paymentsRaw,  isLoading:l3 } = useQuery<PV[]>({ queryKey:["/api/payment-vouchers"],  queryFn:()=>authFetch(api("/api/payment-vouchers")).then(async r=>{ if(!r.ok) throw new Error(`API Error: ${r.status}`); return r.json(); }) });
  const { data:transfersRaw, isLoading:l4 } = useQuery<ST[]>({ queryKey:["/api/safe-transfers"],    queryFn:()=>authFetch(api("/api/safe-transfers")).then(async r=>{ if(!r.ok) throw new Error(`API Error: ${r.status}`); return r.json(); }) });
  const receipts  = safeArray<RV>(receiptsRaw);
  const deposits  = safeArray<DV>(depositsRaw);
  const payments  = safeArray<PV>(paymentsRaw);
  const transfers = safeArray<ST>(transfersRaw);
  const isLoading = l1||l2||l3||l4;

  const [vFilter,setVFilter]         = useState<VFilter>("الكل");
  const [search,setSearch]           = useState("");
  const [mode,setMode]               = useState<DateMode>("month");
  const [customFrom,setCustomFrom]   = useState(thisMonthStart());
  const [customTo,setCustomTo]       = useState(todayStr());
  const [page,setPage]               = useState(1);
  const [perPage,setPerPage]         = useState(20);
  const [dateFrom,dateTo]            = getDateRange(mode,customFrom,customTo);

  const allRows  = useMemo(()=>unifyVouchers(receipts,deposits,payments,transfers),[receipts,deposits,payments,transfers]);
  const filtered = useMemo(()=>{
    let rows = allRows;
    if (vFilter==="قبض")    rows=rows.filter(r=>r.voucherType==="قبض"&&r.kind!=="transfer");
    if (vFilter==="صرف")    rows=rows.filter(r=>r.voucherType==="صرف"&&r.kind!=="transfer");
    if (vFilter==="تحويل")  rows=rows.filter(r=>r.kind==="transfer");
    if (search) {
      const q=search.trim().toLowerCase();
      rows=rows.filter(r=>r.voucherNo.toLowerCase().includes(q)||r.partyName.toLowerCase().includes(q)||r.safeName.toLowerCase().includes(q));
    }
    rows=rows.filter(r=>!r.date||r.date.slice(0,10)>=dateFrom&&r.date.slice(0,10)<=dateTo);
    return rows;
  },[allRows,vFilter,search,dateFrom,dateTo]);

  const totalPages = Math.max(1,Math.ceil(filtered.length/perPage));
  const safePage   = Math.min(page,totalPages);
  const pageRows   = filtered.slice((safePage-1)*perPage, safePage*perPage);

  const handlePageChange=(p:number)=>{ setPage(p); };
  const handleFilter=(f:VFilter)=>{ setVFilter(f); setPage(1); };
  const handleSearch=(q:string)=>{ setSearch(q); setPage(1); };
  const handlePerPage=(n:number)=>{ setPerPage(n); setPage(1); };

  const totalReceipt  = allRows.filter(r=>r.voucherType==="قبض").reduce((s,r)=>s+r.amount,0);
  const totalPayment  = allRows.filter(r=>r.voucherType==="صرف"&&r.kind!=="transfer").reduce((s,r)=>s+r.amount,0);
  const netFlow       = totalReceipt - totalPayment;

  /* ── Mutations: post/cancel (no delete in reports) ── */
  const postDeposit   = useMutation({ mutationFn:(id:number)=>authFetch(api(`/api/deposit-vouchers/${id}/post`),{method:"POST"}).then(async r=>{if(!r.ok){const e=await r.json();throw new Error(e.error||"فشل");}return r.json();}), onSuccess:()=>{qc.invalidateQueries({queryKey:["/api/deposit-vouchers"]});toast({title:"✅ تم الترحيل"});}, onError:(e:Error)=>toast({title:e.message,variant:"destructive"}) });
  const cancelDeposit = useMutation({ mutationFn:(id:number)=>authFetch(api(`/api/deposit-vouchers/${id}/cancel`),{method:"POST"}).then(async r=>{if(!r.ok){const e=await r.json();throw new Error(e.error||"فشل");}return r.json();}), onSuccess:()=>{qc.invalidateQueries({queryKey:["/api/deposit-vouchers"]});toast({title:"تم الإلغاء"});}, onError:(e:Error)=>toast({title:e.message,variant:"destructive"}) });
  const postPayment   = useMutation({ mutationFn:(id:number)=>authFetch(api(`/api/payment-vouchers/${id}/post`),{method:"POST"}).then(async r=>{if(!r.ok){const e=await r.json();throw new Error(e.error||"فشل");}return r.json();}), onSuccess:()=>{qc.invalidateQueries({queryKey:["/api/payment-vouchers"]});toast({title:"✅ تم الترحيل"});}, onError:(e:Error)=>toast({title:e.message,variant:"destructive"}) });
  const cancelPayment = useMutation({ mutationFn:(id:number)=>authFetch(api(`/api/payment-vouchers/${id}/cancel`),{method:"POST"}).then(async r=>{if(!r.ok){const e=await r.json();throw new Error(e.error||"فشل");}return r.json();}), onSuccess:()=>{qc.invalidateQueries({queryKey:["/api/payment-vouchers"]});toast({title:"تم الإلغاء"});}, onError:(e:Error)=>toast({title:e.message,variant:"destructive"}) });

  return (
    <div className="space-y-5" dir="rtl" style={{ fontFamily:"'Tajawal','Cairo',sans-serif" }}>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4">
          <div className="text-emerald-400/70 text-xs mb-1">إجمالي القبض</div>
          <div className="text-lg font-black text-emerald-400">{formatCurrency(totalReceipt)}</div>
          <div className="text-white/30 text-xs mt-1">{allRows.filter(r=>r.voucherType==="قبض").length} سند</div>
        </div>
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4">
          <div className="text-orange-400/70 text-xs mb-1">إجمالي الصرف</div>
          <div className="text-lg font-black text-orange-400">{formatCurrency(totalPayment)}</div>
          <div className="text-white/30 text-xs mt-1">{allRows.filter(r=>r.voucherType==="صرف"&&r.kind!=="transfer").length} سند</div>
        </div>
        <div className={`border rounded-2xl p-4 ${netFlow>=0?"bg-blue-500/10 border-blue-500/20":"bg-red-500/10 border-red-500/20"}`}>
          <div className={`text-xs mb-1 ${netFlow>=0?"text-blue-400/70":"text-red-400/70"}`}>صافي الحركة النقدية</div>
          <div className={`text-lg font-black ${netFlow>=0?"text-blue-400":"text-red-400"}`}>{netFlow>=0?"+":""}{formatCurrency(netFlow)}</div>
          <div className="text-white/30 text-xs mt-1">{allRows.length} حركة إجمالاً</div>
        </div>
      </div>

      {/* ── Safe Balances ── */}
      {safes.length>0&&(
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {safes.map((s:any)=>(
            <div key={s.id} className="bg-white/5 border border-white/8 rounded-2xl p-4">
              <p className="text-white/50 text-xs mb-1">{s.name}</p>
              <p className="text-xl font-black text-amber-400">{formatCurrency(Number(s.balance))}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Date Filter ── */}
      <DateFilterBar mode={mode} setMode={setMode} customFrom={customFrom} setCustomFrom={v=>{setCustomFrom(v);setPage(1);}} customTo={customTo} setCustomTo={v=>{setCustomTo(v);setPage(1);}}/>

      {/* ── Search + Type Filter + Per-page ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30"/>
          <input className="glass-input w-full pr-9 text-sm" placeholder="بحث برقم السند أو الطرف أو الخزينة..." value={search} onChange={e=>handleSearch(e.target.value)}/>
        </div>
        <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-2xl p-1">
          {(["الكل","قبض","صرف","تحويل"] as VFilter[]).map(t=>{
            const count=t==="الكل"?allRows.length:t==="قبض"?allRows.filter(r=>r.voucherType==="قبض").length:t==="صرف"?allRows.filter(r=>r.voucherType==="صرف"&&r.kind!=="transfer").length:allRows.filter(r=>r.kind==="transfer").length;
            return (
              <button key={t} onClick={()=>handleFilter(t)}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${vFilter===t?"bg-amber-500 text-black shadow":"text-white/50 hover:text-white"}`}>
                {t==="قبض"&&<HandCoins className="w-3 h-3"/>}
                {t==="صرف"&&<ArrowUpFromLine className="w-3 h-3"/>}
                {t==="تحويل"&&<ArrowLeftRight className="w-3 h-3"/>}
                {t==="الكل"&&<Filter className="w-3 h-3"/>}
                {t}
                <span className={`text-xs px-1 py-0.5 rounded-full ${vFilter===t?"bg-black/20":"bg-white/10"}`}>{count}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5 mr-auto text-xs text-white/40">
          <span>عرض:</span>
          {PER_PAGE_OPTIONS.map(n=>(
            <button key={n} onClick={()=>handlePerPage(n)} className={`px-2 py-1 rounded-lg font-bold border transition-all ${perPage===n?"bg-amber-500/20 border-amber-500/40 text-amber-400":"border-white/10 text-white/40 hover:text-white"}`}>{n}</button>
          ))}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-white/80 whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-4 font-medium text-white/60 text-sm">النوع</th>
                <th className="p-4 font-medium text-white/60 text-sm">رقم السند</th>
                <th className="p-4 font-medium text-white/60 text-sm">الطرف</th>
                <th className="p-4 font-medium text-white/60 text-sm">الخزينة</th>
                <th className="p-4 font-medium text-white/60 text-sm">المبلغ</th>
                <th className="p-4 font-medium text-white/60 text-sm">الحالة</th>
                <th className="p-4 font-medium text-white/60 text-sm">التاريخ</th>
                <th className="p-4 font-medium text-white/60 text-sm">ملاحظات</th>
                <th className="p-4 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <TableSkeleton cols={9} rows={6}/> :
               pageRows.length===0 ? (
                <tr><td colSpan={9} className="p-16 text-center">
                  <ReceiptText className="w-10 h-10 text-white/15 mx-auto mb-3"/>
                  <p className="text-white/40 text-sm">{search?"لا نتائج للبحث":"لا توجد سندات في هذه الفترة"}</p>
                  {!search&&<p className="text-white/25 text-xs mt-1">جرّب تغيير نطاق التاريخ أو الفلتر</p>}
                </td></tr>
               ) : pageRows.map(row=>(
                <motion.tr key={row.uid} initial={{opacity:0}} animate={{opacity:1}} className="border-b border-white/5 erp-table-row">
                  <td className="p-4">
                    <div className="flex flex-col gap-1"><VTypeBadge type={row.voucherType}/><VSubBadge sub={row.subType}/></div>
                  </td>
                  <td className="p-4 font-mono text-amber-400 text-sm">{row.voucherNo}</td>
                  <td className="p-4 font-bold text-white">{row.partyName}</td>
                  <td className="p-4 text-blue-300 text-sm">{row.safeName}</td>
                  <td className="p-4 font-bold">
                    <span className={row.voucherType==="قبض"?"text-emerald-400":"text-orange-400"}>{formatCurrency(row.amount)}</span>
                  </td>
                  <td className="p-4"><VoucherStatusBadge status={row.status}/></td>
                  <td className="p-4 text-sm text-white/60 font-mono">{row.date||"—"}</td>
                  <td className="p-4 text-white/50 text-sm max-w-[140px] truncate" title={row.notes||undefined}>{row.notes||"—"}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-1">
                      {row.kind==="deposit"&&row.status==="draft"&&(
                        <button onClick={()=>postDeposit.mutate(row.rawId)} disabled={postDeposit.isPending} title="ترحيل" className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/15 transition-all disabled:opacity-50"><CheckCircle className="w-4 h-4"/></button>
                      )}
                      {row.kind==="deposit"&&row.status==="posted"&&(
                        <button onClick={()=>cancelDeposit.mutate(row.rawId)} disabled={cancelDeposit.isPending} title="إلغاء" className="p-1.5 rounded-lg text-amber-400 hover:bg-amber-500/15 transition-all disabled:opacity-50"><XCircle className="w-4 h-4"/></button>
                      )}
                      {row.kind==="payment"&&row.status==="draft"&&(
                        <button onClick={()=>postPayment.mutate(row.rawId)} disabled={postPayment.isPending} title="ترحيل" className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/15 transition-all disabled:opacity-50"><CheckCircle className="w-4 h-4"/></button>
                      )}
                      {row.kind==="payment"&&row.status==="posted"&&(
                        <button onClick={()=>cancelPayment.mutate(row.rawId)} disabled={cancelPayment.isPending} title="إلغاء" className="p-1.5 rounded-lg text-amber-400 hover:bg-amber-500/15 transition-all disabled:opacity-50"><XCircle className="w-4 h-4"/></button>
                      )}
                    </div>
                  </td>
                </motion.tr>
               ))
              }
            </tbody>
          </table>
        </div>

        {/* Footer: row count + pagination */}
        {filtered.length>0&&(
          <div className="border-t border-white/8 px-6 py-3 flex items-center justify-between gap-4">
            <span className="text-xs text-white/30">{filtered.length} سند إجمالاً — يعرض {Math.min((safePage-1)*perPage+1,filtered.length)}-{Math.min(safePage*perPage,filtered.length)}</span>
            <Paginator page={safePage} total={filtered.length} perPage={perPage} onChange={handlePageChange}/>
          </div>
        )}
      </div>
    </div>
  );
}
