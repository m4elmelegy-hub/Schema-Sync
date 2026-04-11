import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Lock, LockOpen, AlertOctagon, Info, ClipboardList, ChevronDown,
} from "lucide-react";
import { PageHeader, FieldLabel, SInput } from "./_shared";
import { ACTION_LABELS } from "./_constants";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

interface PeriodStatus {
  closing_date: string | null;
  locked_by:    string | null;
  locked_at:    string | null;
  lock_mode:    string;
  is_locked:    boolean;
}

interface AuditLogEntry {
  id:          number;
  action:      string;
  record_type: string;
  record_id:   number;
  old_value:   object | null;
  new_value:   object | null;
  user_id:     number | null;
  username:    string | null;
  created_at:  string;
}

export default function FinancialLockTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [lockDate,         setLockDate]         = useState("");
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [unlockReason,     setUnlockReason]     = useState("");
  const [showAuditLog,     setShowAuditLog]     = useState(false);

  const { data: status, isLoading: statusLoading } = useQuery<PeriodStatus>({
    queryKey: ["period-status"],
    queryFn: async () => {
      const r = await authFetch(api("/api/settings/period"));
      if (!r.ok) throw new Error(`API Error: ${r.status}`);
      return r.json();
    },
    staleTime: 10_000,
  });

  const { data: auditLogs = [], isLoading: logsLoading } = useQuery<AuditLogEntry[]>({
    queryKey: ["financial-audit-logs"],
    queryFn: async () => {
      const r = await authFetch(api("/api/settings/audit-logs?limit=100"));
      if (!r.ok) throw new Error(`API Error: ${r.status}`);
      return r.json();
    },
    staleTime: 30_000,
    enabled: showAuditLog,
  });

  const lockMutation = useMutation({
    mutationFn: async (date: string) => {
      const r = await authFetch(api("/api/settings/period"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closing_date: date, lock_mode: "manual" }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "فشل الإغلاق"); }
    },
    onSuccess: () => {
      toast({ title: "تم إغلاق الفترة المالية", description: `مغلق حتى ${lockDate}` });
      setLockDate("");
      qc.invalidateQueries({ queryKey: ["period-status"] });
      qc.invalidateQueries({ queryKey: ["financial-audit-logs"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const unlockMutation = useMutation({
    mutationFn: async (reason: string) => {
      const r = await authFetch(api("/api/settings/period"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closing_date: null, unlock_reason: reason }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "فشل فتح الفترة"); }
    },
    onSuccess: () => {
      toast({ title: "تم فتح الفترة المالية", description: "يمكن الآن تعديل السجلات" });
      setShowUnlockDialog(false);
      setUnlockReason("");
      qc.invalidateQueries({ queryKey: ["period-status"] });
      qc.invalidateQueries({ queryKey: ["financial-audit-logs"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const locked = status?.is_locked ?? false;

  return (
    <div className="space-y-5">
      <PageHeader title="إغلاق الفترات المالية" sub="تحكم في إغلاق الفترات المحاسبية وسجل التدقيق" />

      {/* ── Status Card ── */}
      <div className={`rounded-2xl border p-5 ${locked ? "bg-red-500/5 border-red-500/20" : "bg-green-500/5 border-green-500/20"}`}>
        {statusLoading ? (
          <div className="flex items-center gap-2 text-white/40">
            <Loader2 className="w-4 h-4 animate-spin" />جاري التحميل...
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              {locked
                ? <Lock className="w-7 h-7 text-red-400" />
                : <LockOpen className="w-7 h-7 text-green-400" />
              }
              <div>
                <p className={`text-lg font-bold ${locked ? "text-red-400" : "text-green-400"}`}>
                  {locked ? "الفترة مغلقة" : "الفترة مفتوحة"}
                </p>
                {locked && status?.closing_date && (
                  <p className="text-white/50 text-sm mt-0.5">
                    مغلق حتى: <span className="text-white/80 font-semibold">{formatDate(status.closing_date)}</span>
                  </p>
                )}
                {locked && status?.locked_by && (
                  <p className="text-white/40 text-xs mt-1">
                    بواسطة: <span className="text-white/60">{status.locked_by}</span>
                    {status.locked_at && (
                      <> · <span className="text-white/40">{new Date(status.locked_at).toLocaleString("ar-EG")}</span></>
                    )}
                  </p>
                )}
                {!locked && (
                  <p className="text-green-400/60 text-xs mt-0.5">لا يوجد إغلاق مالي مفعَّل حالياً</p>
                )}
              </div>
            </div>
            <span className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border ${locked ? "text-red-400 bg-red-500/10 border-red-500/30" : "text-green-400 bg-green-500/10 border-green-500/30"}`}>
              {locked ? "🔒 مغلقة" : "🔓 مفتوحة"}
            </span>
          </div>
        )}
      </div>

      {/* ── Warning Box ── */}
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/8 border border-amber-500/20">
        <AlertOctagon className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-amber-400 font-bold text-sm">تنبيه مهم</p>
          <p className="text-amber-300/60 text-xs mt-1 leading-relaxed">
            بعد إغلاق الفترة لا يمكن تعديل السجلات القديمة مباشرة.
            يتم التصحيح فقط من خلال قيود أو سندات عكسية في فترة مفتوحة.
            إلغاء الإغلاق يتطلب تقديم سبب ويُسجَّل في سجل التدقيق.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* ── Lock Action ── */}
        <div className="rounded-2xl border border-white/10 p-5 space-y-4" style={{ background: "var(--erp-bg-card)" }}>
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-red-400" />
            <p className="text-white font-bold text-sm">إغلاق فترة مالية</p>
          </div>
          <div className="space-y-2">
            <label className="text-white/40 text-xs font-semibold">إغلاق حتى تاريخ</label>
            <input
              type="date"
              value={lockDate}
              onChange={e => setLockDate(e.target.value)}
              max={new Date().toISOString().split("T")[0]}
              className="w-full rounded-xl px-3 py-2.5 bg-[#1A2235] border border-white/10 text-white text-sm focus:outline-none focus:border-amber-500/50"
            />
          </div>
          <button
            onClick={() => lockDate && lockMutation.mutate(lockDate)}
            disabled={lockMutation.isPending || !lockDate}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 font-semibold text-sm hover:bg-red-500/25 transition-all disabled:opacity-40"
          >
            {lockMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            تنفيذ الإغلاق
          </button>
          <p className="text-white/25 text-[10px]">
            سيُمنع تعديل أو حذف أي سجل تاريخه قبل أو يساوي هذا التاريخ.
          </p>
        </div>

        {/* ── Unlock Action ── */}
        <div className="rounded-2xl border border-white/10 p-5 space-y-4" style={{ background: "var(--erp-bg-card)" }}>
          <div className="flex items-center gap-2">
            <LockOpen className="w-4 h-4 text-green-400" />
            <p className="text-white font-bold text-sm">فتح الفترة المالية</p>
          </div>
          {locked ? (
            <>
              <p className="text-white/40 text-xs leading-relaxed">
                فتح الفترة يتطلب تقديم سبب واضح ويُسجَّل فوراً في سجل التدقيق.
                هذه العملية للمدير فقط.
              </p>
              <button
                onClick={() => setShowUnlockDialog(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-500/10 border border-green-500/25 text-green-400 font-semibold text-sm hover:bg-green-500/20 transition-all"
              >
                <LockOpen className="w-4 h-4" />
                فتح الفترة
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 py-4 text-white/25">
              <LockOpen className="w-8 h-8" />
              <p className="text-xs text-center">الفترة مفتوحة حالياً<br />لا يلزم أي إجراء</p>
            </div>
          )}
        </div>
      </div>

      {/* ── How Corrections Work ── */}
      <div className="rounded-2xl border border-white/8 p-5" style={{ background: "var(--erp-bg-card)" }}>
        <div className="flex items-center gap-2 mb-3">
          <Info className="w-4 h-4 text-blue-400" />
          <p className="text-white font-bold text-sm">كيف يتم التصحيح بعد الإغلاق؟</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { icon: "🔄", title: "سند عكسي",    desc: "لسند إيصال أو صرف مقفل — أنشئ سنداً معاكساً بنفس المبلغ مرتبطاً بالأصلي" },
            { icon: "📝", title: "فاتورة إرجاع", desc: "لفاتورة مبيعات مقفلة — استخدم فاتورة إرجاع ولا تعدّل الأصل مباشرة" },
            { icon: "↩️", title: "مصروف عكسي",  desc: "لمصروف خاطئ — أنشئ مصروفاً سالباً ثم أنشئ المصروف الصحيح" },
          ].map(c => (
            <div key={c.title} className="rounded-xl p-3 bg-white/3 border border-white/6">
              <p className="text-lg mb-1">{c.icon}</p>
              <p className="text-white/80 font-semibold text-xs mb-1">{c.title}</p>
              <p className="text-white/35 text-[11px] leading-relaxed">{c.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Audit Log ── */}
      <div className="rounded-2xl border border-white/10 overflow-hidden" style={{ background: "var(--erp-bg-card)" }}>
        <button
          onClick={() => setShowAuditLog(p => !p)}
          className="w-full flex items-center justify-between gap-2 px-5 py-4 hover:bg-white/3 transition-all"
        >
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-amber-400" />
            <p className="text-white font-bold text-sm">سجل التدقيق المالي</p>
          </div>
          <ChevronDown className={`w-4 h-4 text-white/40 transition-transform ${showAuditLog ? "rotate-180" : ""}`} />
        </button>

        {showAuditLog && (
          <div className="border-t border-white/8">
            {logsLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-white/40">
                <Loader2 className="w-4 h-4 animate-spin" />
                جاري تحميل السجل...
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-white/25">
                <ClipboardList className="w-8 h-8" />
                <p className="text-sm">لا توجد سجلات بعد</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/8">
                      {["الإجراء", "النوع", "المستخدم", "التوقيت", "التفاصيل"].map(h => (
                        <th key={h} className="px-4 py-3 text-right text-white/30 text-xs font-bold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log, i) => {
                      const actionInfo = ACTION_LABELS[log.action] ?? { label: log.action, color: "text-white/40 bg-white/5 border-white/10" };
                      const detail = log.new_value
                        ? Object.entries(log.new_value as Record<string, unknown>)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(" · ")
                        : "—";
                      return (
                        <tr key={log.id} className={`border-b border-white/5 hover:bg-white/3 ${i % 2 === 0 ? "" : "bg-white/[0.015]"}`}>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${actionInfo.color}`}>
                              {actionInfo.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-white/50 text-xs">{log.record_type}</td>
                          <td className="px-4 py-3 text-white/70 text-xs font-medium">{log.username ?? "—"}</td>
                          <td className="px-4 py-3 text-white/40 text-xs" dir="ltr">
                            {new Date(log.created_at).toLocaleString("ar-EG")}
                          </td>
                          <td className="px-4 py-3 text-white/35 text-[11px] max-w-[200px] truncate" title={detail}>{detail}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Unlock Dialog ── */}
      {showUnlockDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
          <div className="w-full max-w-md rounded-2xl border border-white/10 shadow-2xl p-6 space-y-5" style={{ background: "var(--erp-bg-card)" }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                <LockOpen className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-white font-bold">تأكيد فتح الفترة المالية</p>
                <p className="text-white/40 text-xs">هذه العملية تسجَّل في سجل التدقيق</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-red-500/8 border border-red-500/20 text-red-400/80 text-xs leading-relaxed">
              ⚠️ بعد فتح الفترة، يمكن تعديل السجلات القديمة مباشرة.
              تأكد من وجود سبب موثَّق قبل المتابعة.
            </div>

            <div className="space-y-2">
              <FieldLabel>سبب فتح الفترة *</FieldLabel>
              <textarea
                value={unlockReason}
                onChange={e => setUnlockReason(e.target.value)}
                placeholder="اكتب سبباً واضحاً لفتح الفترة المالية..."
                rows={3}
                className="w-full rounded-xl px-3 py-2.5 bg-[#1A2235] border border-white/10 text-white text-sm focus:outline-none focus:border-amber-500/50 resize-none"
              />
              <p className="text-white/25 text-[10px]">{unlockReason.length} / 3 أحرف كحد أدنى</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowUnlockDialog(false); setUnlockReason(""); }}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/50 text-sm font-semibold hover:bg-white/5 transition-all"
              >
                إلغاء
              </button>
              <button
                onClick={() => unlockMutation.mutate(unlockReason)}
                disabled={unlockMutation.isPending || unlockReason.trim().length < 3}
                className="flex-1 py-2.5 rounded-xl bg-green-500/15 border border-green-500/30 text-green-400 text-sm font-semibold hover:bg-green-500/25 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {unlockMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <LockOpen className="w-4 h-4" />}
                تأكيد الفتح
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
