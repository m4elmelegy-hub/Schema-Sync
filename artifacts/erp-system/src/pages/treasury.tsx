import { safeArray } from "@/lib/safe-data";
import { useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetSettingsSafes, useCreateSettingsSafe, useDeleteSettingsSafe } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import {
  HandCoins, ArrowUpFromLine, ArrowLeftRight, Lock,
  TrendingUp, TrendingDown, Wallet, ChevronLeft, ReceiptText,
  Landmark, Plus, Loader2, X, Trash2, AlertTriangle,
} from "lucide-react";
import ReceiptModal  from "@/components/modals/ReceiptModal";
import PaymentModal  from "@/components/modals/PaymentModal";
import TransferModal from "@/components/modals/TransferModal";
import CloseSafeModal from "@/components/modals/CloseSafeModal";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api  = (p: string) => `${BASE}${p}`;

type ModalType = "receipt" | "payment" | "transfer" | "safe-closing" | null;

export default function Treasury() {
  const [openModal,    setOpenModal]    = useState<ModalType>(null);
  const [showAddSafe,  setShowAddSafe]  = useState(false);
  const [addForm,      setAddForm]      = useState({ name: "", balance: "" });
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string; balance: number } | null>(null);

  const queryClient  = useQueryClient();
  const createSafe   = useCreateSettingsSafe();
  const deleteSafe   = useDeleteSettingsSafe();
  const { toast }    = useToast();

  const { data: safesRaw } = useGetSettingsSafes();
  const safes = safeArray(safesRaw);

  const { data: stats } = useQuery<Record<string, number>>({
    queryKey: ["/api/dashboard/stats"],
    queryFn: () => authFetch(api("/api/dashboard/stats")).then(r => { if (!r.ok) throw new Error("خطأ"); return r.json(); }),
  });

  const totalSafeBalance = safes.reduce((s, safe) => s + Number(safe.balance), 0);

  const invalidateSafes = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/settings/safes"] });
  };

  /* ── KPI cards ── */
  const kpis = [
    {
      label: "رصيد الخزائن الإجمالي",
      value: formatCurrency(totalSafeBalance),
      sub:   `${safes.length} خزينة`,
      icon:  Wallet,
      color: "amber",
    },
    {
      label: "مبيعات اليوم",
      value: formatCurrency(Number(stats?.total_sales_today ?? 0)),
      sub:   "إجمالي القبض",
      icon:  TrendingUp,
      color: "emerald",
    },
    {
      label: "مصروفات اليوم",
      value: formatCurrency(Number(stats?.total_expenses_today ?? 0)),
      sub:   "إجمالي الصرف",
      icon:  TrendingDown,
      color: "red",
    },
  ];

  /* ── Action buttons ── */
  const actions: {
    id: ModalType;
    label: string;
    sub: string;
    icon: React.ElementType;
    border: string;
    bg: string;
    text: string;
    glow: string;
  }[] = [
    {
      id:     "receipt",
      label:  "سند قبض",
      sub:    "استلام مبلغ وإضافته للخزينة",
      icon:   HandCoins,
      border: "border-emerald-500/30",
      bg:     "bg-emerald-500/8 hover:bg-emerald-500/15",
      text:   "text-emerald-400",
      glow:   "shadow-emerald-500/10",
    },
    {
      id:     "payment",
      label:  "سند صرف",
      sub:    "صرف مبلغ من الخزينة",
      icon:   ArrowUpFromLine,
      border: "border-orange-500/30",
      bg:     "bg-orange-500/8 hover:bg-orange-500/15",
      text:   "text-orange-400",
      glow:   "shadow-orange-500/10",
    },
    {
      id:     "transfer",
      label:  "تحويل خزائن",
      sub:    "نقل رصيد من خزينة إلى أخرى",
      icon:   ArrowLeftRight,
      border: "border-violet-500/30",
      bg:     "bg-violet-500/8 hover:bg-violet-500/15",
      text:   "text-violet-400",
      glow:   "shadow-violet-500/10",
    },
    {
      id:     "safe-closing",
      label:  "إقفال الخزينة",
      sub:    "جرد ومطابقة الرصيد اليومي",
      icon:   Lock,
      border: "border-amber-500/30",
      bg:     "bg-amber-500/8 hover:bg-amber-500/15",
      text:   "text-amber-400",
      glow:   "shadow-amber-500/10",
    },
  ];

  const colorMap: Record<string, { border: string; bg: string; text: string }> = {
    amber:   { border: "border-amber-500/25",   bg: "bg-amber-500/8",   text: "text-amber-400" },
    emerald: { border: "border-emerald-500/25", bg: "bg-emerald-500/8", text: "text-emerald-400" },
    red:     { border: "border-red-500/25",     bg: "bg-red-500/8",     text: "text-red-400" },
  };

  return (
    <div className="space-y-8" dir="rtl">

      {/* ── Modals ── */}
      {openModal === "receipt"      && <ReceiptModal   onClose={() => setOpenModal(null)} />}
      {openModal === "payment"      && <PaymentModal   onClose={() => setOpenModal(null)} />}
      {openModal === "transfer"     && <TransferModal  onClose={() => setOpenModal(null)} />}
      {openModal === "safe-closing" && <CloseSafeModal onClose={() => setOpenModal(null)} />}

      {/* ── Add Safe Modal ── */}
      {showAddSafe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
          <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-sky-500/15 flex items-center justify-center">
                  <Landmark className="w-4 h-4 text-sky-400" />
                </div>
                <p className="font-black text-white text-sm">إضافة خزينة جديدة</p>
              </div>
              <button onClick={() => { setShowAddSafe(false); setAddForm({ name: "", balance: "" }); }}
                className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-white/50 text-xs font-bold mb-1.5">اسم الخزينة</label>
                <input
                  value={addForm.name}
                  onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="مثال: الخزينة الرئيسية"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/20 outline-none focus:border-sky-500/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-white/50 text-xs font-bold mb-1.5">الرصيد الابتدائي</label>
                <input
                  type="number"
                  value={addForm.balance}
                  onChange={e => setAddForm(f => ({ ...f, balance: e.target.value }))}
                  placeholder="0"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/20 outline-none focus:border-sky-500/50 transition-colors"
                />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-white/8">
              <button
                disabled={createSafe.isPending}
                onClick={() => {
                  if (!addForm.name.trim()) { toast({ title: "اسم الخزينة مطلوب", variant: "destructive" }); return; }
                  createSafe.mutate(
                    { name: addForm.name.trim(), balance: Number(addForm.balance) || 0 },
                    {
                      onSuccess: () => {
                        invalidateSafes();
                        toast({ title: "تم إضافة الخزينة بنجاح" });
                        setAddForm({ name: "", balance: "" });
                        setShowAddSafe(false);
                      },
                      onError: () => toast({ title: "فشل إضافة الخزينة", variant: "destructive" }),
                    }
                  );
                }}
                className="flex-1 flex items-center justify-center gap-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white font-bold text-sm rounded-xl py-2.5 transition-colors"
              >
                {createSafe.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                إضافة
              </button>
              <button
                onClick={() => { setShowAddSafe(false); setAddForm({ name: "", balance: "" }); }}
                className="flex-1 bg-white/5 hover:bg-white/10 text-white/60 font-bold text-sm rounded-xl py-2.5 transition-colors border border-white/8"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
          <div className="bg-[#111827] border border-red-500/20 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="p-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-7 h-7 text-red-400" />
              </div>
              <div>
                <p className="text-white font-black text-base">حذف الخزينة</p>
                <p className="text-white/50 text-sm mt-1.5 leading-relaxed">
                  سيتم حذف <span className="text-white font-semibold">"{deleteTarget.name}"</span> نهائياً.
                  <br />هذا الإجراء لا يمكن التراجع عنه.
                </p>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-white/8">
              <button
                disabled={deleteSafe.isPending}
                onClick={() => {
                  deleteSafe.mutate(deleteTarget.id, {
                    onSuccess: () => {
                      invalidateSafes();
                      toast({ title: "تم حذف الخزينة بنجاح" });
                      setDeleteTarget(null);
                    },
                    onError: (e: any) => {
                      const msg = e?.response?.data?.error || e?.message || "فشل حذف الخزينة";
                      toast({ title: msg, variant: "destructive" });
                      setDeleteTarget(null);
                    },
                  });
                }}
                className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl py-2.5 transition-colors"
              >
                {deleteSafe.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                حذف نهائي
              </button>
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 bg-white/5 hover:bg-white/10 text-white/60 font-bold text-sm rounded-xl py-2.5 transition-colors border border-white/8"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page title ── */}
      <div>
        <h1 className="text-2xl font-black text-white flex items-center gap-3">
          <Wallet className="w-7 h-7 text-amber-400" />
          السندات والخزينة
        </h1>
        <p className="text-white/40 text-sm mt-1">
          {new Date().toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {kpis.map(k => {
          const Icon = k.icon;
          const cls = colorMap[k.color];
          return (
            <div key={k.label} className={`rounded-2xl border ${cls.border} ${cls.bg} p-5 transition-all`}>
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${cls.border} bg-white/5`}>
                  <Icon className={`w-5 h-5 ${cls.text}`} />
                </div>
                <span className="text-white/30 text-xs">{k.sub}</span>
              </div>
              <p className="text-white/50 text-xs mb-1">{k.label}</p>
              <p className={`text-2xl font-black ${cls.text}`}>{k.value}</p>
            </div>
          );
        })}
      </div>

      {/* ── Safe balances — enhanced cards ── */}
      {safes.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-white/40 text-xs font-bold uppercase tracking-widest">أرصدة الخزائن</p>
            <p className="text-white/25 text-xs">{safes.length} خزينة · إجمالي {formatCurrency(totalSafeBalance)}</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {safes.map(s => {
              const balance = Number(s.balance);
              const pct = totalSafeBalance > 0 ? (balance / totalSafeBalance) * 100 : 0;
              const canDelete = balance === 0;

              return (
                <div
                  key={s.id}
                  className="group bg-[#111827] border border-white/5 hover:border-amber-500/20 rounded-2xl p-5 transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)] relative"
                >
                  {/* Header row */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                      <Landmark className="w-5 h-5 text-amber-400" />
                    </div>

                    {/* Delete button */}
                    <div className="relative">
                      <button
                        onClick={() => {
                          if (canDelete) {
                            setDeleteTarget({ id: s.id as number, name: s.name, balance });
                          }
                        }}
                        disabled={!canDelete}
                        title={canDelete ? "حذف الخزينة" : "لا يمكن حذف خزينة تحتوي على رصيد أو حركات"}
                        className={`opacity-0 group-hover:opacity-100 p-1.5 rounded-lg transition-all
                          ${canDelete
                            ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 cursor-pointer"
                            : "bg-white/5 text-white/20 cursor-not-allowed"
                          }`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Name & balance */}
                  <p className="text-white font-bold text-sm mb-1 truncate">{s.name}</p>
                  <p className="text-amber-400 font-black text-xl mb-3">{formatCurrency(balance)}</p>

                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-white/30">
                      <span>نسبة من الإجمالي</span>
                      <span>{pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Zero-balance badge */}
                  {canDelete && (
                    <div className="mt-3 pt-3 border-t border-white/5">
                      <span className="text-[10px] text-white/25 font-medium">رصيد صفر · قابلة للحذف</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Action buttons ── */}
      <div>
        <p className="text-white/40 text-xs font-bold uppercase tracking-widest mb-3">العمليات</p>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {actions.map(a => {
            const Icon = a.icon;
            return (
              <button key={a.id} onClick={() => setOpenModal(a.id)}
                className={`rounded-2xl border ${a.border} ${a.bg} p-5 text-right transition-all hover:-translate-y-1 active:scale-95 group shadow-lg ${a.glow}`}>
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${a.border} bg-white/5`}>
                    <Icon className={`w-5 h-5 ${a.text}`} />
                  </div>
                  <ChevronLeft className={`w-4 h-4 ${a.text} opacity-40 group-hover:opacity-80 transition-opacity`} />
                </div>
                <p className={`font-black text-base leading-tight ${a.text}`}>{a.label}</p>
                <p className="text-white/40 text-xs mt-1 leading-tight">{a.sub}</p>
                <div className={`mt-4 pt-3 border-t ${a.border}`}>
                  <div className={`inline-flex items-center gap-1.5 text-xs font-bold ${a.text}`}>
                    <span>فتح النموذج</span>
                  </div>
                </div>
              </button>
            );
          })}

          {/* إضافة خزينة */}
          <button
            onClick={() => setShowAddSafe(true)}
            className="rounded-2xl border border-sky-500/30 bg-sky-500/8 hover:bg-sky-500/15 p-5 text-right transition-all hover:-translate-y-1 active:scale-95 group shadow-lg shadow-sky-500/10">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center border border-sky-500/30 bg-white/5">
                <Landmark className="w-5 h-5 text-sky-400" />
              </div>
              <ChevronLeft className="w-4 h-4 text-sky-400 opacity-40 group-hover:opacity-80 transition-opacity" />
            </div>
            <p className="font-black text-base leading-tight text-sky-400">إضافة خزينة</p>
            <p className="text-white/40 text-xs mt-1 leading-tight">إنشاء خزينة جديدة</p>
            <div className="mt-4 pt-3 border-t border-sky-500/30">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-400">
                <Plus className="w-3.5 h-3.5" />
                <span>فتح النموذج</span>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Quick link to vouchers list */}
      <div className="flex items-center justify-center">
        <a href="/vouchers"
          className="flex items-center gap-2 text-white/30 hover:text-amber-400 transition-colors text-sm group">
          <ReceiptText className="w-4 h-4" />
          <span>عرض سجل السندات الكامل</span>
          <ChevronLeft className="w-3 h-3 group-hover:-translate-x-0.5 transition-transform" />
        </a>
      </div>
    </div>
  );
}
