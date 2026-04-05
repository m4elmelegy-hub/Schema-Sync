import { useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useQuery } from "@tanstack/react-query";
import { useGetSettingsSafes } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import {
  HandCoins, ArrowUpFromLine, ArrowLeftRight, Lock,
  TrendingUp, TrendingDown, Wallet, ChevronLeft, ReceiptText,
} from "lucide-react";
import ReceiptModal  from "@/components/modals/ReceiptModal";
import PaymentModal  from "@/components/modals/PaymentModal";
import TransferModal from "@/components/modals/TransferModal";
import CloseSafeModal from "@/components/modals/CloseSafeModal";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api  = (p: string) => `${BASE}${p}`;

type ModalType = "receipt" | "payment" | "transfer" | "safe-closing" | null;

export default function Treasury() {
  const [openModal, setOpenModal] = useState<ModalType>(null);

  const { data: safes = [] } = useGetSettingsSafes();
  const { data: stats }      = useQuery<Record<string, number>>({
    queryKey: ["/api/dashboard/stats"],
    queryFn: () => authFetch(api("/api/dashboard/stats")).then(r => { if (!r.ok) throw new Error("خطأ"); return r.json(); }),
  });

  const totalSafeBalance = safes.reduce((s, safe) => s + Number(safe.balance), 0);

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
    btn: string;
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
      btn:    "bg-emerald-500 text-black hover:bg-emerald-400",
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
      btn:    "bg-orange-500 text-black hover:bg-orange-400",
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
      btn:    "bg-violet-500 text-white hover:bg-violet-400",
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
      btn:    "bg-amber-500 text-black hover:bg-amber-400",
    },
  ];

  return (
    <div className="space-y-8" dir="rtl">

      {/* Modals */}
      {openModal === "receipt"      && <ReceiptModal   onClose={() => setOpenModal(null)} />}
      {openModal === "payment"      && <PaymentModal   onClose={() => setOpenModal(null)} />}
      {openModal === "transfer"     && <TransferModal  onClose={() => setOpenModal(null)} />}
      {openModal === "safe-closing" && <CloseSafeModal onClose={() => setOpenModal(null)} />}

      {/* Page title */}
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
          const colorMap: Record<string, { border: string; bg: string; text: string }> = {
            amber:   { border: "border-amber-500/25",   bg: "bg-amber-500/8",   text: "text-amber-400" },
            emerald: { border: "border-emerald-500/25", bg: "bg-emerald-500/8", text: "text-emerald-400" },
            red:     { border: "border-red-500/25",     bg: "bg-red-500/8",     text: "text-red-400" },
          };
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

      {/* Safe balances */}
      {safes.length > 0 && (
        <div>
          <p className="text-white/40 text-xs font-bold uppercase tracking-widest mb-3">أرصدة الخزائن</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {safes.map(s => (
              <div key={s.id} className="bg-white/5 border border-white/8 rounded-2xl p-4">
                <p className="text-white/40 text-xs mb-1">{s.name}</p>
                <p className="text-xl font-black text-amber-400">{formatCurrency(Number(s.balance))}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Action buttons ── */}
      <div>
        <p className="text-white/40 text-xs font-bold uppercase tracking-widest mb-3">العمليات</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
