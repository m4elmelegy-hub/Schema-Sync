import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { useToast } from "@/hooks/use-toast";
import { useResetDatabase } from "@workspace/api-client-react";
import { AlertTriangle, Loader2, Check } from "lucide-react";
import { PageHeader, SInput, DangerBtn } from "./_shared";
import { DATA_GROUPS } from "./_constants";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

export default function DataTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const resetDb = useResetDatabase();

  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [confirmText, setConfirmText] = useState("");
  const [loading,     setLoading]     = useState(false);
  const [countdown,   setCountdown]   = useState(5);
  const [canDelete,   setCanDelete]   = useState(false);
  const [resetText,   setResetText]   = useState("");
  const [resetCountdown, setResetCountdown] = useState(10);
  const [canReset,    setCanReset]    = useState(false);

  const readyToDelete = confirmText === "تأكيد الحذف" && selected.size > 0;
  const readyToReset  = resetText === "إعادة تعيين كاملة";

  useEffect(() => {
    if (!readyToDelete) { setCanDelete(false); setCountdown(5); return; }
    setCountdown(5); setCanDelete(false);
    const iv = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(iv); setCanDelete(true); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [readyToDelete]);

  useEffect(() => {
    if (!readyToReset) { setCanReset(false); setResetCountdown(10); return; }
    setResetCountdown(10); setCanReset(false);
    const iv = setInterval(() => {
      setResetCountdown(c => {
        if (c <= 1) { clearInterval(iv); setCanReset(true); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [readyToReset]);

  const toggle = (key: string) => {
    setSelected(prev => { const s = new Set(prev); if (s.has(key)) { s.delete(key); } else { s.add(key); } return s; });
    setConfirmText(""); setCanDelete(false);
  };
  const toggleAll = () => {
    if (selected.size === DATA_GROUPS.length) setSelected(new Set());
    else setSelected(new Set(DATA_GROUPS.map(g => g.key)));
    setConfirmText(""); setCanDelete(false);
  };

  const handleClear = async () => {
    if (!canDelete) return;
    setLoading(true);
    const res = await authFetch(api("/api/admin/clear"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tables: Array.from(selected) }),
    });
    setLoading(false);
    const data = await res.json();
    if (!res.ok) { toast({ title: data.error ?? "فشل المسح", variant: "destructive" }); return; }
    toast({ title: `✅ تم مسح: ${Array.from(selected).length} جدول بنجاح` });
    setSelected(new Set()); setConfirmText("");
    qc.invalidateQueries();
  };

  const handleResetFull = () => {
    if (!canReset) return;
    resetDb.mutate({ confirm: "إعادة تعيين كاملة" }, {
      onSuccess: () => { toast({ title: "✅ تمت إعادة تعيين قاعدة البيانات بالكامل" }); setResetText(""); qc.invalidateQueries(); },
      onError: (e: any) => toast({ title: e?.message ?? "فشلت إعادة التعيين", variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader title="إدارة البيانات" sub="مسح جداول محددة أو إعادة تعيين قاعدة البيانات" />

      {/* Danger Banner */}
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/30">
        <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-red-400 font-bold text-sm">منطقة خطر — العمليات في هذه الصفحة لا يمكن التراجع عنها</p>
          <p className="text-red-400/60 text-xs mt-0.5">تأكد من عمل نسخة احتياطية قبل حذف أي بيانات</p>
        </div>
      </div>

      {/* Selective Delete */}
      <div className="bg-[#111827] border border-red-500/20 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-white/70 text-sm font-semibold">
            الحذف الانتقائي
            {selected.size > 0 && (
              <span className="mr-2 px-2 py-0.5 rounded-md bg-red-500/20 text-red-400 text-xs font-bold">
                {selected.size} محدد
              </span>
            )}
          </p>
          <button onClick={toggleAll} className="text-xs text-amber-400 hover:text-amber-300 transition-colors">
            {selected.size === DATA_GROUPS.length ? "إلغاء الكل" : "تحديد الكل"}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {DATA_GROUPS.map(g => {
            const active = selected.has(g.key);
            return (
              <button
                key={g.key}
                onClick={() => toggle(g.key)}
                className={`p-3 rounded-xl text-right border transition-all ${
                  active
                    ? "bg-red-500/15 border-red-500/40 shadow-[0_0_8px_rgba(239,68,68,0.1)]"
                    : "bg-[#1A2235] border-[#2D3748] hover:border-red-500/20"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-bold ${active ? "text-red-300" : "text-white/70"}`}>{g.label}</span>
                  {active
                    ? <Check className="w-3.5 h-3.5 text-red-400" />
                    : <div className="w-3.5 h-3.5 rounded border border-white/15" />
                  }
                </div>
                <p className="text-white/25 text-xs">{g.sub}</p>
              </button>
            );
          })}
        </div>

        {selected.size > 0 && (
          <div className="space-y-3 pt-2 border-t border-red-500/10">
            <div>
              <label className="text-white/50 text-sm font-medium block mb-2">
                اكتب <span className="text-red-400 font-black">"تأكيد الحذف"</span> لتفعيل الحذف:
              </label>
              <SInput
                placeholder="تأكيد الحذف"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                className="border-red-500/20 focus:border-red-500"
              />
            </div>
            {readyToDelete && !canDelete && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <Loader2 className="w-4 h-4 text-red-400 animate-spin" />
                <p className="text-red-400 text-sm">يمكنك الحذف بعد <span className="font-black">{countdown}</span> ثانية...</p>
              </div>
            )}
            <DangerBtn onClick={handleClear} disabled={loading || !canDelete} className="w-full">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
              {loading ? "جاري المسح..." : `مسح ${selected.size} جداول`}
            </DangerBtn>
          </div>
        )}
      </div>

      {/* Full Reset */}
      <div className="bg-[#111827] border border-red-800/40 rounded-2xl p-5 space-y-4">
        <div>
          <p className="text-red-300 font-bold text-sm">⚠️ إعادة تعيين كاملة لقاعدة البيانات</p>
          <p className="text-red-300/50 text-xs mt-0.5">سيتم حذف جميع البيانات والإعادة للوضع الافتراضي — لا يمكن التراجع</p>
        </div>
        <div className="space-y-3">
          <label className="text-white/50 text-sm font-medium block">
            اكتب <span className="text-red-400 font-black">"إعادة تعيين كاملة"</span> لتفعيل الأمر:
          </label>
          <SInput
            placeholder="إعادة تعيين كاملة"
            value={resetText}
            onChange={e => setResetText(e.target.value)}
            className="border-red-800/30 focus:border-red-600"
          />
          {readyToReset && !canReset && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <Loader2 className="w-4 h-4 text-red-400 animate-spin" />
              <p className="text-red-400 text-sm">سيتم التنفيذ بعد <span className="font-black">{resetCountdown}</span> ثانية...</p>
            </div>
          )}
          <button
            onClick={handleResetFull}
            disabled={resetDb.isPending || !canReset}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-900/30 hover:bg-red-900/50 border border-red-800/40 text-red-300 font-bold text-sm transition-all disabled:opacity-40"
          >
            {resetDb.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
            {resetDb.isPending ? "جاري إعادة التعيين..." : "إعادة تعيين كاملة"}
          </button>
        </div>
      </div>
    </div>
  );
}
