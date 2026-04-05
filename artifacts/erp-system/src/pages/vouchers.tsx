/**
 * Vouchers page — READ ONLY
 * Shows unified list of all vouchers with filters and actions (post/cancel/delete)
 * Create new vouchers → go to /treasury
 */
import { useState, useMemo } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetSettingsSafes } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import {
  Trash2, CheckCircle, XCircle,
  ArrowLeftRight, HandCoins, ArrowUpFromLine, ReceiptText,
  ChevronRight, Wallet,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TableSkeleton } from "@/components/skeletons";
import { ConfirmModal } from "@/components/confirm-modal";
import { useLocation } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api  = (p: string) => `${BASE}${p}`;

/* ── interfaces ── */
interface ReceiptVoucher {
  id: number; voucher_no: string; date: string;
  customer_id: number | null; customer_name: string;
  safe_id: number; safe_name: string; amount: number;
  notes: string | null;
}
interface DepositVoucher {
  id: number; voucher_no: string; date: string;
  customer_id: number | null; customer_name: string | null;
  safe_id: number; safe_name: string; amount: number;
  posting_status: string; source: string | null; notes: string | null;
}
interface PaymentVoucher {
  id: number; voucher_no: string; date: string;
  customer_id: number | null; customer_name: string;
  safe_id: number; safe_name: string; amount: number;
  posting_status: string; notes: string | null;
}
interface SafeTransfer {
  id: number; type: string; safe_id: number | null; safe_name: string | null;
  amount: number; direction: string; description: string | null; date: string | null;
}

/* ── unified row ── */
type VoucherKind = "receipt" | "deposit" | "payment" | "transfer";
interface UnifiedVoucher {
  uid: string; kind: VoucherKind; rawId: number;
  voucherNo: string; partyName: string; safeName: string;
  amount: number; status: string | null;
  date: string; notes: string | null;
  voucherType: "قبض" | "صرف";
  subType: string;
}

function toUnified(
  receipts: ReceiptVoucher[],
  deposits: DepositVoucher[],
  payments: PaymentVoucher[],
  transfers: SafeTransfer[],
): UnifiedVoucher[] {
  const rows: UnifiedVoucher[] = [];

  receipts.forEach(v => rows.push({
    uid: `receipt-${v.id}`, kind: "receipt", rawId: v.id,
    voucherNo: v.voucher_no, partyName: v.customer_name, safeName: v.safe_name,
    amount: v.amount, status: null, date: v.date, notes: v.notes,
    voucherType: "قبض", subType: "عميل",
  }));

  deposits.forEach(v => rows.push({
    uid: `deposit-${v.id}`, kind: "deposit", rawId: v.id,
    voucherNo: v.voucher_no, partyName: v.customer_name || v.source || "—", safeName: v.safe_name,
    amount: v.amount, status: v.posting_status, date: v.date, notes: v.notes,
    voucherType: "قبض", subType: "توريد",
  }));

  payments.forEach(v => rows.push({
    uid: `payment-${v.id}`, kind: "payment", rawId: v.id,
    voucherNo: v.voucher_no, partyName: v.customer_name, safeName: v.safe_name,
    amount: v.amount, status: v.posting_status, date: v.date, notes: v.notes,
    voucherType: "صرف", subType: "صرف",
  }));

  transfers.filter(t => t.direction === "out" && t.type === "transfer_out").forEach(t => rows.push({
    uid: `transfer-${t.id}`, kind: "transfer", rawId: t.id,
    voucherNo: `TRF-${t.id}`, partyName: t.description || "تحويل خزنة", safeName: t.safe_name || "—",
    amount: t.amount, status: null, date: t.date || "", notes: null,
    voucherType: "صرف", subType: "تحويل خزنة",
  }));

  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

/* ── badges ── */
function TypeBadge({ type }: { type: "قبض" | "صرف" }) {
  return type === "قبض"
    ? <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"><HandCoins className="w-3 h-3"/>قبض</span>
    : <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30"><ArrowUpFromLine className="w-3 h-3"/>صرف</span>;
}

function SubBadge({ sub }: { sub: string }) {
  const map: Record<string, string> = {
    "عميل":        "bg-blue-500/15 text-blue-300 border-blue-500/20",
    "توريد":       "bg-teal-500/15 text-teal-300 border-teal-500/20",
    "صرف":         "bg-orange-500/15 text-orange-300 border-orange-500/20",
    "تحويل خزنة": "bg-violet-500/15 text-violet-300 border-violet-500/20",
  };
  return <span className={`px-2 py-0.5 rounded-lg text-xs font-medium border ${map[sub] ?? "bg-white/10 text-white/50 border-white/10"}`}>{sub}</span>;
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status)                return <span className="text-xs text-white/30">—</span>;
  if (status === "posted")    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400">مرحَّل</span>;
  if (status === "cancelled") return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">ملغى</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-white/10 text-white/50">مسودة</span>;
}

/* ── main component ── */
type TabFilter = "الكل" | "قبض" | "صرف";

export default function Vouchers() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: safes = [] } = useGetSettingsSafes();

  const { data: receipts  = [], isLoading: l1 } = useQuery<ReceiptVoucher[]>({
    queryKey: ["/api/receipt-vouchers"],
    queryFn: () => authFetch(api("/api/receipt-vouchers")).then(r => { if (!r.ok) throw new Error("خطأ"); return r.json(); }),
  });
  const { data: deposits  = [], isLoading: l2 } = useQuery<DepositVoucher[]>({
    queryKey: ["/api/deposit-vouchers"],
    queryFn: () => authFetch(api("/api/deposit-vouchers")).then(r => { if (!r.ok) throw new Error("خطأ"); return r.json(); }),
  });
  const { data: payments  = [], isLoading: l3 } = useQuery<PaymentVoucher[]>({
    queryKey: ["/api/payment-vouchers"],
    queryFn: () => authFetch(api("/api/payment-vouchers")).then(r => { if (!r.ok) throw new Error("خطأ"); return r.json(); }),
  });
  const { data: transfers = [], isLoading: l4 } = useQuery<SafeTransfer[]>({
    queryKey: ["/api/safe-transfers"],
    queryFn: () => authFetch(api("/api/safe-transfers")).then(r => { if (!r.ok) throw new Error("خطأ"); return r.json(); }),
  });

  const isLoading = l1 || l2 || l3 || l4;

  const [tab,           setTab]           = useState<TabFilter>("الكل");
  const [confirmDelete, setConfirmDelete] = useState<{ uid: string; kind: VoucherKind; rawId: number } | null>(null);

  const allRows  = useMemo(() => toUnified(receipts, deposits, payments, transfers), [receipts, deposits, payments, transfers]);
  const filtered = tab === "الكل" ? allRows : allRows.filter(r => r.voucherType === tab);

  /* ── mutations ── */
  const deleteReceipt = useMutation({
    mutationFn: (id: number) => authFetch(api(`/api/receipt-vouchers/${id}`), { method: "DELETE" }).then(r => { if (!r.ok) throw new Error("فشل الحذف"); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/receipt-vouchers"] });
      qc.invalidateQueries({ queryKey: ["/api/settings/safes"] });
      qc.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: "تم الحذف" }); setConfirmDelete(null);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const deleteDeposit = useMutation({
    mutationFn: (id: number) => authFetch(api(`/api/deposit-vouchers/${id}`), { method: "DELETE" }).then(async r => { if (!r.ok) { const e = await r.json(); throw new Error(e.error || "فشل"); } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/deposit-vouchers"] });
      qc.invalidateQueries({ queryKey: ["/api/settings/safes"] });
      toast({ title: "تم الحذف" }); setConfirmDelete(null);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const deletePayment = useMutation({
    mutationFn: (id: number) => authFetch(api(`/api/payment-vouchers/${id}`), { method: "DELETE" }).then(async r => { if (!r.ok) { const e = await r.json(); throw new Error(e.error || "فشل"); } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/payment-vouchers"] });
      qc.invalidateQueries({ queryKey: ["/api/settings/safes"] });
      toast({ title: "تم الحذف" }); setConfirmDelete(null);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const postDeposit = useMutation({
    mutationFn: (id: number) => authFetch(api(`/api/deposit-vouchers/${id}/post`), { method: "POST" })
      .then(async r => { if (!r.ok) { const e = await r.json(); throw new Error(e.error || "فشل"); } return r.json(); }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/deposit-vouchers"] }); toast({ title: "✅ تم الترحيل" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const cancelDeposit = useMutation({
    mutationFn: (id: number) => authFetch(api(`/api/deposit-vouchers/${id}/cancel`), { method: "POST" })
      .then(async r => { if (!r.ok) { const e = await r.json(); throw new Error(e.error || "فشل"); } return r.json(); }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/deposit-vouchers"] }); toast({ title: "تم الإلغاء" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const postPayment = useMutation({
    mutationFn: (id: number) => authFetch(api(`/api/payment-vouchers/${id}/post`), { method: "POST" })
      .then(async r => { if (!r.ok) { const e = await r.json(); throw new Error(e.error || "فشل"); } return r.json(); }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/payment-vouchers"] }); toast({ title: "✅ تم الترحيل" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const cancelPayment = useMutation({
    mutationFn: (id: number) => authFetch(api(`/api/payment-vouchers/${id}/cancel`), { method: "POST" })
      .then(async r => { if (!r.ok) { const e = await r.json(); throw new Error(e.error || "فشل"); } return r.json(); }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/payment-vouchers"] }); toast({ title: "تم الإلغاء" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  function handleDelete() {
    if (!confirmDelete) return;
    if (confirmDelete.kind === "receipt") deleteReceipt.mutate(confirmDelete.rawId);
    if (confirmDelete.kind === "deposit") deleteDeposit.mutate(confirmDelete.rawId);
    if (confirmDelete.kind === "payment") deletePayment.mutate(confirmDelete.rawId);
  }

  /* ── summaries ── */
  const totalReceipt  = allRows.filter(r => r.voucherType === "قبض").reduce((s, r) => s + r.amount, 0);
  const totalPayment  = allRows.filter(r => r.voucherType === "صرف" && r.kind !== "transfer").reduce((s, r) => s + r.amount, 0);
  const totalTransfer = allRows.filter(r => r.kind === "transfer").reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-6" dir="rtl">

      {/* Confirm delete */}
      {confirmDelete && (
        <ConfirmModal title="حذف السند"
          description="سيتم حذف السند وعكس أثره على الخزينة."
          isPending={deleteReceipt.isPending || deleteDeposit.isPending || deletePayment.isPending}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)} />
      )}

      {/* ── Back navigation ── */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/treasury")}
          className="flex items-center gap-2 text-white/40 hover:text-amber-400 transition-colors group text-sm">
          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          <Wallet className="w-4 h-4" />
          <span>العودة إلى الخزينة</span>
        </button>
        <span className="text-white/15">|</span>
        <div className="flex items-center gap-2 text-white/50">
          <ReceiptText className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-bold text-white">سجل السندات</span>
        </div>
      </div>

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <ReceiptText className="w-6 h-6 text-amber-400" />
            سجل السندات
          </h1>
          <p className="text-white/40 text-sm mt-1">
            عرض جميع السندات والتحويلات — لإنشاء سند جديد انتقل إلى{" "}
            <button onClick={() => navigate("/treasury")} className="text-amber-400 hover:underline">الخزينة</button>
          </p>
        </div>

        {/* Quick create link */}
        <button onClick={() => navigate("/treasury")}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 whitespace-nowrap">
          <Wallet className="w-4 h-4" />
          إضافة سند جديد
        </button>
      </div>

      {/* Safe balances */}
      {safes.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {safes.map(s => (
            <div key={s.id} className="bg-white/5 border border-white/8 rounded-2xl p-4">
              <p className="text-white/50 text-xs mb-1">{s.name}</p>
              <p className="text-xl font-black text-amber-400">{formatCurrency(Number(s.balance))}</p>
            </div>
          ))}
        </div>
      )}

      {/* Summary KPI cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 text-right">
          <div className="text-emerald-400/70 text-xs mb-1">إجمالي القبض</div>
          <div className="text-lg font-black text-emerald-400">{formatCurrency(totalReceipt)}</div>
          <div className="text-white/30 text-xs mt-1">{allRows.filter(r => r.voucherType === "قبض").length} سند</div>
        </div>
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 text-right">
          <div className="text-orange-400/70 text-xs mb-1">إجمالي الصرف</div>
          <div className="text-lg font-black text-orange-400">{formatCurrency(totalPayment)}</div>
          <div className="text-white/30 text-xs mt-1">{allRows.filter(r => r.voucherType === "صرف" && r.kind !== "transfer").length} سند</div>
        </div>
        <div className="bg-violet-500/10 border border-violet-500/20 rounded-2xl p-4 text-right">
          <div className="text-violet-400/70 text-xs mb-1">تحويلات الخزائن</div>
          <div className="text-lg font-black text-violet-400">{formatCurrency(totalTransfer)}</div>
          <div className="text-white/30 text-xs mt-1">{allRows.filter(r => r.kind === "transfer").length} تحويل</div>
        </div>
      </div>

      {/* Tab filter */}
      <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-2xl p-1 w-fit">
        {(["الكل", "قبض", "صرف"] as TabFilter[]).map(t => {
          const count = t === "الكل" ? allRows.length : allRows.filter(r => r.voucherType === t).length;
          return (
            <button key={t} onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-bold transition-all ${
                tab === t ? "bg-amber-500 text-black shadow-lg" : "text-white/50 hover:text-white"
              }`}>
              {t === "قبض"  && <HandCoins className="w-3.5 h-3.5" />}
              {t === "صرف"  && <ArrowUpFromLine className="w-3.5 h-3.5" />}
              {t === "الكل" && <ArrowLeftRight className="w-3.5 h-3.5" />}
              {t}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === t ? "bg-black/20" : "bg-white/10"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-white/80 whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-4 font-medium text-white/60">النوع</th>
                <th className="p-4 font-medium text-white/60">رقم السند</th>
                <th className="p-4 font-medium text-white/60">الطرف</th>
                <th className="p-4 font-medium text-white/60">الخزينة</th>
                <th className="p-4 font-medium text-white/60">المبلغ</th>
                <th className="p-4 font-medium text-white/60">الحالة</th>
                <th className="p-4 font-medium text-white/60">التاريخ</th>
                <th className="p-4 font-medium text-white/60">ملاحظات</th>
                <th className="p-4 w-28"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeleton cols={9} rows={6} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-16 text-center">
                    <ReceiptText className="w-10 h-10 text-white/15 mx-auto mb-3" />
                    <p className="text-white/40 text-sm">لا توجد سندات بعد</p>
                    <button onClick={() => navigate("/treasury")}
                      className="mt-3 text-amber-400 text-xs hover:underline">
                      أنشئ سنداً جديداً من صفحة الخزينة
                    </button>
                  </td>
                </tr>
              ) : filtered.map(row => (
                <tr key={row.uid} className="border-b border-white/5 erp-table-row">
                  <td className="p-4">
                    <div className="flex flex-col gap-1">
                      <TypeBadge type={row.voucherType} />
                      <SubBadge sub={row.subType} />
                    </div>
                  </td>
                  <td className="p-4 font-mono text-amber-400 text-sm">{row.voucherNo}</td>
                  <td className="p-4 font-bold text-white">{row.partyName}</td>
                  <td className="p-4 text-blue-300">{row.safeName}</td>
                  <td className="p-4 font-bold">
                    <span className={row.voucherType === "قبض" ? "text-emerald-400" : "text-orange-400"}>
                      {formatCurrency(row.amount)}
                    </span>
                  </td>
                  <td className="p-4"><StatusBadge status={row.status} /></td>
                  <td className="p-4 text-sm text-white/60">{row.date || "—"}</td>
                  <td className="p-4 text-white/50 text-sm max-w-[150px] truncate">{row.notes || "—"}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-1">
                      {row.kind === "deposit" && row.status === "draft" && (
                        <button onClick={() => postDeposit.mutate(row.rawId)} disabled={postDeposit.isPending} title="ترحيل"
                          className="btn-icon text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10">
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                      {row.kind === "deposit" && row.status === "posted" && (
                        <button onClick={() => cancelDeposit.mutate(row.rawId)} disabled={cancelDeposit.isPending} title="إلغاء"
                          className="btn-icon text-amber-400 hover:text-amber-300 hover:bg-amber-500/10">
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                      {row.kind === "payment" && row.status === "draft" && (
                        <button onClick={() => postPayment.mutate(row.rawId)} disabled={postPayment.isPending} title="ترحيل"
                          className="btn-icon text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10">
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                      {row.kind === "payment" && row.status === "posted" && (
                        <button onClick={() => cancelPayment.mutate(row.rawId)} disabled={cancelPayment.isPending} title="إلغاء"
                          className="btn-icon text-amber-400 hover:text-amber-300 hover:bg-amber-500/10">
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                      {row.kind !== "transfer" && row.status !== "posted" && (
                        <button onClick={() => setConfirmDelete({ uid: row.uid, kind: row.kind, rawId: row.rawId })}
                          className="btn-icon btn-icon-danger" title="حذف">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
