/**
 * backup-tab.tsx — النسخ الاحتياطية والاستعادة فقط
 * المحتوى: نسخ محلي/خادم، جدولة تلقائية، سجل الخادم، استعادة
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, HardDrive, History, RefreshCcw, Download, Upload, Save,
  CheckCircle2, AlertTriangle, X, Check, Database, Trash2, Clock,
} from "lucide-react";
import { PageHeader, PrimaryBtn } from "./_shared";
import { BACKUP_MODULES_LIST } from "./_constants";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api  = (p: string) => `${BASE}${p}`;

const LAST_BK_KEY = "halal_erp_last_backup";

type BackupRecord = { id: number; filename: string; size: number; trigger: string; created_at: string };

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(2)} MB`;
}
function formatTrigger(t: string) {
  return ({ login: "تسجيل دخول", logout: "تسجيل خروج", sale_post: "ترحيل مبيعات", purchase_post: "ترحيل مشتريات", scheduled: "جدولة تلقائية", manual: "يدوي" } as Record<string, string>)[t] ?? t;
}
function nextBackupTime(sched: string, last: string | null) {
  if (!last || sched === "none") return null;
  const hours = sched === "daily" ? 24 : sched === "weekly" ? 168 : 720;
  return new Date(new Date(last).getTime() + hours * 3600000).toLocaleString("ar-EG");
}

const MODULE_ICONS: Record<string, string> = { sales: "🛍️", purchases: "🛒", products: "📦", treasury: "💰", customers: "👥", settings: "⚙️", reports: "📊" };

export default function BackupTab() {
  const { toast } = useToast();

  /* ── نوع النسخة المحلية ── */
  const [bkMode,     setBkMode]     = useState<"local" | "server">("local");
  const [bkModules,  setBkModules]  = useState<Set<string>>(new Set(BACKUP_MODULES_LIST.map(m => m.key)));
  const [bkLoading,  setBkLoading]  = useState(false);
  const [bkProgress, setBkProgress] = useState(0);
  const [bkResult,   setBkResult]   = useState<{ name: string; size: string; count: number } | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(() => localStorage.getItem(LAST_BK_KEY));

  /* ── إعدادات الخادم ── */
  const [schedule,      setSchedule]      = useState("none");
  const [destination,   setDestination]   = useState("local");
  const [lastScheduled, setLastScheduled] = useState<string | null>(null);
  const [schedSaving,   setSchedSaving]   = useState(false);
  const [serverBkBusy,  setServerBkBusy]  = useState(false);

  /* ── سجل الخادم ── */
  const [backupList,     setBackupList]     = useState<BackupRecord[]>([]);
  const [listLoading,    setListLoading]    = useState(false);
  const [deletingId,     setDeletingId]     = useState<number | null>(null);

  /* ── الاستعادة ── */
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreResult,  setRestoreResult]  = useState<{ counts: Record<string, number>; meta: { file_version: string; file_date: string | null; is_legacy: boolean } } | null>(null);
  const [restoreError,   setRestoreError]   = useState<string | null>(null);
  const restoreFileRef = useRef<HTMLInputElement>(null);

  /* ── Modal تأكيد الاستعادة ── */
  const [modal,         setModal]         = useState(false);
  const [modalText,     setModalText]     = useState("");
  const [understood,    setUnderstood]    = useState(false);
  const [pending,       setPending]       = useState<{ fileName: string; parsed: unknown; version: string | null; date: string | null; tableCount: number } | null>(null);

  /* ── تحميل بيانات الخادم ── */
  const loadSettings = useCallback(async () => {
    try {
      const r = await authFetch(api("/api/backups/settings"));
      if (r.ok) { const d = await r.json() as { schedule: string; destination: string; last_scheduled: string | null }; setSchedule(d.schedule ?? "none"); setDestination(d.destination ?? "local"); setLastScheduled(d.last_scheduled ?? null); }
    } catch {}
  }, []);

  const loadList = useCallback(async () => {
    setListLoading(true);
    try { const r = await authFetch(api("/api/backups")); if (r.ok) setBackupList(await r.json() as BackupRecord[]); }
    catch {} finally { setListLoading(false); }
  }, []);

  useEffect(() => { void loadSettings(); void loadList(); }, [loadSettings, loadList]);

  /* ── نسخة محلية انتقائية ── */
  const toggleModule = (key: string) => setBkModules(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });
  const toggleAll    = () => setBkModules(bkModules.size === BACKUP_MODULES_LIST.length ? new Set() : new Set(BACKUP_MODULES_LIST.map(m => m.key)));

  const lastBackupLabel = () => {
    if (!lastBackup) return "لم يتم إنشاء نسخة بعد";
    const d = Math.floor((Date.now() - new Date(lastBackup).getTime()) / 86400000);
    return d === 0 ? "اليوم" : d === 1 ? "منذ يوم" : d < 30 ? `منذ ${d} أيام` : new Date(lastBackup).toLocaleDateString("ar-EG");
  };

  const handleLocalBackup = async () => {
    if (bkModules.size === 0) { toast({ title: "اختر وحدة واحدة على الأقل", variant: "destructive" }); return; }
    setBkLoading(true); setBkProgress(5); setBkResult(null);
    try {
      const selected = BACKUP_MODULES_LIST.filter(m => bkModules.has(m.key));
      const bundle: Record<string, unknown> = { version: "1.0", created_at: new Date().toISOString(), app: "Halal Tech ERP", modules: selected.map(m => m.label) };
      const step = Math.floor(75 / selected.length);
      for (const mod of selected) {
        setBkProgress(p => Math.min(p + step, 85));
        if (mod.url) {
          try { const r = await authFetch(api(mod.url)); bundle[mod.key] = r.ok ? await r.json() : []; }
          catch { bundle[mod.key] = []; }
        } else if (mod.key === "settings") {
          bundle[mod.key] = JSON.parse(localStorage.getItem("halal_erp_settings") || "{}");
        } else { bundle[mod.key] = null; }
      }
      setBkProgress(90);
      const blob  = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const dt    = new Date().toISOString().replace("T", "_").replace(/:/g, "-").slice(0, 19);
      const fname = `backup_${dt}.json`;
      const a     = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = fname; a.click(); URL.revokeObjectURL(a.href);
      setBkResult({ name: fname, size: `${(blob.size / 1024).toFixed(1)} KB`, count: selected.length });
      setBkProgress(100);
      const now = new Date().toISOString();
      localStorage.setItem(LAST_BK_KEY, now); setLastBackup(now);
      toast({ title: `✅ تم إنشاء النسخة — ${fname}` });
    } catch { toast({ title: "فشل إنشاء النسخة", variant: "destructive" }); }
    finally { setBkLoading(false); setTimeout(() => setBkProgress(0), 1500); }
  };

  /* ── نسخة الخادم ── */
  const handleServerDownload = async () => {
    setServerBkBusy(true);
    try {
      const r = await authFetch(api("/api/system/backup"), { method: "POST" });
      if (!r.ok) throw new Error(await r.text());
      const blob  = await r.blob();
      const cd    = r.headers.get("Content-Disposition") ?? "";
      const m     = cd.match(/filename="([^"]+)"/);
      const fname = m?.[1] ?? `halal-tech-backup_${new Date().toISOString().slice(0, 10)}.json`;
      const a     = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = fname; a.click(); URL.revokeObjectURL(a.href);
      const now = new Date().toISOString(); localStorage.setItem(LAST_BK_KEY, now); setLastBackup(now);
      toast({ title: `✅ تم تنزيل النسخة الكاملة — ${fname}` });
    } catch (e) { toast({ title: "فشل إنشاء النسخة الكاملة", description: String(e), variant: "destructive" }); }
    finally { setServerBkBusy(false); }
  };

  const handleServerSave = async () => {
    setServerBkBusy(true);
    try {
      const r = await authFetch(api("/api/backups"), { method: "POST" });
      if (r.ok) { toast({ title: "✅ تم حفظ النسخة على الخادم" }); void loadList(); void loadSettings(); }
      else { const d = await r.json().catch(() => ({ error: "فشل" })) as { error?: string }; toast({ title: d.error ?? "فشل", variant: "destructive" }); }
    } catch { toast({ title: "خطأ في الاتصال", variant: "destructive" }); }
    finally { setServerBkBusy(false); }
  };

  const handleSaveSchedule = async (s: string, d: string) => {
    setSchedSaving(true);
    try {
      const r = await authFetch(api("/api/backups/settings"), { method: "PUT", body: JSON.stringify({ schedule: s, destination: d }) });
      if (r.ok) { setSchedule(s); setDestination(d); toast({ title: "✅ تم حفظ إعدادات الجدولة" }); }
    } catch {} finally { setSchedSaving(false); }
  };

  const handleDeleteBackup = async (id: number) => {
    setDeletingId(id);
    try {
      const r = await authFetch(api(`/api/backups/${id}`), { method: "DELETE" });
      if (r.ok) { setBackupList(p => p.filter(b => b.id !== id)); toast({ title: "تم حذف النسخة" }); }
    } catch {} finally { setDeletingId(null); }
  };

  const handleDownloadById = async (id: number, filename: string) => {
    try {
      const r = await authFetch(api(`/api/backups/${id}/download`));
      if (!r.ok) { toast({ title: "فشل التنزيل", variant: "destructive" }); return; }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(await r.blob()); a.download = filename; a.click();
    } catch { toast({ title: "خطأ في التنزيل", variant: "destructive" }); }
  };

  /* ── اختيار ملف الاستعادة ── */
  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return; e.target.value = "";
    if (!file.name.endsWith(".json")) { toast({ title: "يجب اختيار ملف JSON", variant: "destructive" }); return; }
    try {
      const parsed     = JSON.parse(await file.text()) as Record<string, unknown>;
      const dataSection = (parsed.data ?? parsed.tables ?? parsed) as Record<string, unknown>;
      setPending({ fileName: file.name, parsed, version: typeof parsed.version === "string" ? parsed.version : null, date: typeof parsed.created_at === "string" ? parsed.created_at : null, tableCount: Object.values(dataSection).filter(Array.isArray).length });
      setModalText(""); setUnderstood(false); setModal(true);
    } catch { toast({ title: "ملف JSON غير صالح", variant: "destructive" }); }
  };

  const handleConfirmRestore = async () => {
    if (!pending) return;
    setModal(false); setRestoreLoading(true); setRestoreResult(null); setRestoreError(null);
    try {
      const r    = await authFetch(api("/api/system/restore"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pending.parsed) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "فشل الاستعادة");
      setRestoreResult({ counts: data.counts ?? {}, meta: data.meta ?? { file_version: "legacy", file_date: null, is_legacy: true } });
      toast({ title: "✅ تمت الاستعادة بنجاح" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setRestoreError(msg);
      toast({ title: "فشل الاستعادة", description: msg, variant: "destructive" });
    } finally { setRestoreLoading(false); setPending(null); }
  };

  const canConfirm = modalText === "RESTORE" && understood;

  /* ── العناصر المشتركة للـ trigger badges ── */
  const triggerBadge = (trigger: string) => {
    const cls = trigger === "login" ? "bg-blue-500/15 text-blue-400" : trigger === "sale_post" || trigger === "purchase_post" ? "bg-emerald-500/15 text-emerald-400" : trigger === "scheduled" ? "bg-sky-500/15 text-sky-400" : "bg-white/8 text-white/40";
    return <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${cls}`}>{formatTrigger(trigger)}</span>;
  };

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="النسخ الاحتياطية"
        sub="احمِ بياناتك — آخر نسخة: محلية"
        action={<span className="text-white/30 text-xs">{lastBackupLabel()}</span>}
      />

      {/* ═══════════════════════════════════════════════════
          بطاقة 1 — إنشاء نسخة احتياطية
      ════════════════════════════════════════════════════ */}
      <div className="bg-[#111827] border border-white/8 rounded-2xl overflow-hidden">
        {/* Tabs داخلية */}
        <div className="flex border-b border-white/8">
          {([["local", "💾 نسخة محلية", "تنزيل مباشر للجهاز"], ["server", "☁️ نسخة الخادم", "حفظ أو تنزيل عبر الخادم"]] as const).map(([id, label, sub]) => (
            <button key={id} onClick={() => setBkMode(id)}
              className={`flex-1 px-4 py-3.5 text-right transition-all border-b-2 ${bkMode === id ? "border-amber-400 bg-amber-500/5" : "border-transparent hover:bg-white/3"}`}>
              <p className={`text-sm font-bold ${bkMode === id ? "text-amber-400" : "text-white/50"}`}>{label}</p>
              <p className="text-white/25 text-xs">{sub}</p>
            </button>
          ))}
        </div>

        {/* ── النسخة المحلية ── */}
        {bkMode === "local" && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-white/50 text-xs">اختر الوحدات المطلوبة في النسخة</p>
              <button onClick={toggleAll} className="text-xs text-amber-400 hover:text-amber-300 transition-colors font-semibold">
                {bkModules.size === BACKUP_MODULES_LIST.length ? "إلغاء الكل" : "تحديد الكل"}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {BACKUP_MODULES_LIST.map(m => {
                const on = bkModules.has(m.key);
                return (
                  <button key={m.key} onClick={() => toggleModule(m.key)}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-right transition-all ${on ? "bg-amber-500/10 border-amber-500/25" : "bg-[#1A2235] border-[#2D3748] hover:border-amber-500/15"}`}>
                    <span className="text-lg shrink-0">{MODULE_ICONS[m.key] ?? "📁"}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-bold truncate ${on ? "text-amber-300" : "text-white/60"}`}>{m.label}</p>
                      <p className="text-white/20 text-[10px] truncate">{m.sub}</p>
                    </div>
                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${on ? "bg-amber-500 border-amber-500" : "border-white/20"}`}>
                      {on && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {bkLoading && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-white/40">
                  <span>جاري إنشاء النسخة...</span><span>{bkProgress}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full bg-amber-400 rounded-full transition-all duration-300" style={{ width: `${bkProgress}%` }} />
                </div>
              </div>
            )}

            {bkResult && !bkLoading && (
              <div className="flex items-center gap-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-emerald-400 font-bold flex-1 truncate">{bkResult.name}</span>
                <span className="text-white/40">{bkResult.size}</span>
                <span className="text-white/40">{bkResult.count} وحدات</span>
              </div>
            )}

            <PrimaryBtn onClick={handleLocalBackup} disabled={bkLoading || bkModules.size === 0} className="w-full">
              {bkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {bkLoading ? `جاري الإنشاء... ${bkProgress}%` : `تنزيل نسخة (${bkModules.size} وحدات)`}
            </PrimaryBtn>
          </div>
        )}

        {/* ── النسخة الخادم ── */}
        {bkMode === "server" && (
          <div className="p-5 space-y-4">
            {/* تلقائية */}
            <div className="space-y-3">
              <p className="text-white/40 text-xs font-black uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" /> الجدولة التلقائية
              </p>
              <div className="flex flex-wrap gap-2">
                {[{ v: "none", l: "بدون" }, { v: "daily", l: "يومياً" }, { v: "weekly", l: "أسبوعياً" }, { v: "monthly", l: "شهرياً" }].map(s => (
                  <button key={s.v} onClick={() => void handleSaveSchedule(s.v, destination)} disabled={schedSaving}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${schedule === s.v ? "bg-sky-500/20 border-sky-500/40 text-sky-300" : "border-white/10 text-white/40 hover:text-white/70 hover:border-white/20"}`}>
                    {s.l}
                  </button>
                ))}
              </div>
              {schedule !== "none" && (
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-white/3 border border-white/5">
                    <p className="text-white/30 mb-0.5">آخر نسخة تلقائية</p>
                    <p className="text-white font-bold">{lastScheduled ? new Date(lastScheduled).toLocaleString("ar-EG") : "—"}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-white/3 border border-white/5">
                    <p className="text-white/30 mb-0.5">النسخة القادمة</p>
                    <p className="text-sky-300 font-bold">{nextBackupTime(schedule, lastScheduled) ?? "قريباً"}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="h-px bg-white/5" />

            {/* أزرار */}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => void handleServerSave()} disabled={serverBkBusy}
                className="flex items-center justify-center gap-2 py-3 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/25 text-sky-300 font-bold text-xs transition-all disabled:opacity-40">
                {serverBkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                حفظ على الخادم
              </button>
              <button onClick={() => void handleServerDownload()} disabled={serverBkBusy}
                className="flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/25 text-emerald-300 font-bold text-xs transition-all disabled:opacity-40">
                {serverBkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                تنزيل نسخة كاملة
              </button>
            </div>
            <p className="text-white/25 text-xs text-center">
              "حفظ على الخادم" تحفظ في السجل أدناه · "تنزيل كاملة" تُصدِّر مباشرةً من قاعدة البيانات
            </p>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════
          بطاقة 2 — سجل النسخ على الخادم
      ════════════════════════════════════════════════════ */}
      <div className="bg-[#111827] border border-white/8 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center">
              <History className="w-4 h-4 text-white/40" />
            </div>
            <div>
              <p className="font-bold text-white text-sm">سجل النسخ على الخادم</p>
              <p className="text-white/30 text-xs">{backupList.length > 0 ? `${backupList.length} نسخة` : "لا توجد نسخ بعد"}</p>
            </div>
          </div>
          <button onClick={() => void loadList()} disabled={listLoading} className="p-2 rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-colors">
            <RefreshCcw className={`w-3.5 h-3.5 ${listLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {listLoading && backupList.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-10 text-white/25 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />جاري التحميل...
          </div>
        ) : backupList.length === 0 ? (
          <div className="text-center py-10 text-white/20 text-sm">
            <HardDrive className="w-8 h-8 mx-auto mb-2 opacity-30" />
            لا توجد نسخ محفوظة حتى الآن
          </div>
        ) : (
          <div className="divide-y divide-white/4">
            {backupList.map(b => (
              <div key={b.id} className="flex items-center gap-3 px-5 py-3 hover:bg-white/2 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                  <HardDrive className="w-3.5 h-3.5 text-white/30" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-mono truncate">{b.filename}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-white/25 text-[10px]">{new Date(b.created_at).toLocaleString("ar-EG")}</span>
                    <span className="text-white/15">·</span>
                    <span className="text-white/25 text-[10px]">{formatBytes(b.size)}</span>
                    <span className="text-white/15">·</span>
                    {triggerBadge(b.trigger)}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => void handleDownloadById(b.id, b.filename)}
                    className="p-1.5 rounded-lg text-emerald-400/50 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors">
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => void handleDeleteBackup(b.id)} disabled={deletingId === b.id}
                    className="p-1.5 rounded-lg text-red-400/40 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40">
                    {deletingId === b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════
          بطاقة 3 — الاستعادة
      ════════════════════════════════════════════════════ */}
      <div className="bg-[#111827] border border-violet-500/20 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center">
            <Upload className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <p className="font-bold text-white text-sm">استعادة نسخة احتياطية</p>
            <p className="text-white/30 text-xs">ارفع ملف JSON — يتم التنفيذ داخل معاملة آمنة</p>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/15 text-amber-300/70 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <span>ستُحذف البيانات الحالية وتُستبدل بمحتوى الملف. المستخدمون والإعدادات تبقى.</span>
          </div>

          <input ref={restoreFileRef} type="file" accept=".json" className="hidden" onChange={handleRestoreFile} />

          {restoreLoading && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-violet-500/10 border border-violet-500/20">
              <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
              <p className="text-violet-300 text-sm">جاري الاستعادة...</p>
            </div>
          )}

          {restoreResult && !restoreLoading && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400 font-bold text-sm">تمت الاستعادة بنجاح</span>
                <span className="mr-auto px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">v{restoreResult.meta.file_version}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                {Object.entries(restoreResult.counts).filter(([, v]) => (v as number) > 0).slice(0, 9).map(([k, v]) => (
                  <div key={k} className="bg-white/5 rounded-lg p-2">
                    <p className="text-white/35 text-[10px]">{k}</p>
                    <p className="text-white font-bold">{String(v)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {restoreError && !restoreLoading && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <X className="w-4 h-4 shrink-0" /> {restoreError}
            </div>
          )}

          <button onClick={() => restoreFileRef.current?.click()} disabled={restoreLoading}
            className="w-full py-3.5 rounded-xl border-2 border-dashed border-violet-500/30 hover:border-violet-500/55 text-violet-400 hover:text-violet-300 transition-all flex items-center justify-center gap-2 text-sm font-bold disabled:opacity-40">
            <Upload className="w-4 h-4" /> اختر ملف النسخة الاحتياطية (.json)
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          Modal تأكيد الاستعادة
      ════════════════════════════════════════════════════ */}
      {modal && pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setModal(false)} />
          <div className="relative w-full max-w-md bg-[#0F1623] border border-red-500/30 rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-red-500/20 bg-red-500/5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-red-500/15 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                </div>
                <div>
                  <p className="font-bold text-red-400 text-sm">تأكيد الاستعادة</p>
                  <p className="text-white/30 text-xs">{pending.fileName}</p>
                </div>
              </div>
              <button onClick={() => setModal(false)} className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
                <p className="text-red-300 font-bold text-sm">⚠️ سيتم حذف البيانات الحالية واستبدالها</p>
                <p className="text-white/35 text-xs mt-0.5">{pending.tableCount} جداول · الإصدار {pending.version ?? "legacy"}</p>
              </div>

              <div className="space-y-2">
                <label className="text-white/55 text-sm block">اكتب <span className="text-red-400 font-black tracking-widest">RESTORE</span> للمتابعة:</label>
                <input type="text" value={modalText} onChange={e => setModalText(e.target.value)} placeholder="RESTORE" spellCheck={false} autoComplete="off"
                  className={`w-full bg-white/5 border rounded-xl px-4 py-3 text-sm font-bold text-center tracking-widest outline-none transition-all ${modalText === "RESTORE" ? "border-emerald-500/50 text-emerald-400" : modalText.length > 0 ? "border-red-500/40 text-white" : "border-white/10 text-white"}`} />
              </div>

              <label className="flex items-start gap-3 cursor-pointer" onClick={() => setUnderstood(v => !v)}>
                <div className={`mt-0.5 w-5 h-5 shrink-0 rounded-md border-2 flex items-center justify-center transition-all ${understood ? "bg-red-500 border-red-500" : "border-white/20"}`}>
                  {understood && <Check className="w-3 h-3 text-white" />}
                </div>
                <span className="text-white/55 text-sm leading-relaxed select-none">أفهم أن <span className="text-red-400 font-bold">جميع البيانات الحالية ستُحذف</span></span>
              </label>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setModal(false)} className="flex-1 py-3 rounded-xl border border-white/10 text-white/40 hover:text-white transition-all text-sm font-bold">إلغاء</button>
                <button onClick={handleConfirmRestore} disabled={!canConfirm}
                  className={`flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${canConfirm ? "bg-red-500 hover:bg-red-400 text-white" : "bg-white/5 text-white/20 cursor-not-allowed"}`}>
                  <Upload className="w-4 h-4" /> استعادة
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
