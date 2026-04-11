import { useState, useEffect, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { authFetch } from "@/lib/auth-fetch";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, HardDrive, History, RefreshCcw, Download, Upload, Save,
  CheckCircle2, AlertTriangle, X, Check, Database, Trash2,
} from "lucide-react";
import { PageHeader, FieldLabel, SInput, SSelect, PrimaryBtn } from "./_shared";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

const BACKUP_MODULES_LIST = [
  { key: "sales",     icon: "🛍️", label: "المبيعات",         sub: "الفواتير، العملاء، المرتجعات",    url: "/api/sales" },
  { key: "purchases", icon: "🛒", label: "المشتريات",         sub: "فواتير المشتريات، المرتجعات",     url: "/api/purchases" },
  { key: "products",  icon: "📦", label: "المخزن",            sub: "الأصناف، الكميات، الحركات",       url: "/api/products" },
  { key: "treasury",  icon: "💰", label: "الخزينة",           sub: "الإيرادات، المصروفات، السندات",   url: "/api/financial-transactions" },
  { key: "customers", icon: "👥", label: "العملاء",           sub: "الأرصدة والبيانات",               url: "/api/customers" },
  { key: "settings",  icon: "⚙️", label: "الإعدادات",         sub: "العملة والتفضيلات",               url: null },
  { key: "reports",   icon: "📊", label: "التقارير المحفوظة", sub: "الإحصائيات والبيانات التاريخية",  url: null },
] as const;

const ACTIVITY_KEY  = "halal_erp_activity_log";
const LAST_BK_KEY   = "halal_erp_last_backup";

interface ActivityEntry {
  id: string; date: string; type: "backup" | "import-products" | "import-purchases";
  file: string; status: string; user: string;
}

interface PurchaseRow {
  idx: number; sku: string; name: string; quantity: string; unitPrice: string;
  supplier: string; invoiceNo: string; date: string; tax: string; discount: string;
  productId: number | null; errors: string[];
}

type BackupRecord = { id: number; filename: string; size: number; trigger: string; created_at: string };

function loadActivityLog(): ActivityEntry[] {
  try { return JSON.parse(localStorage.getItem(ACTIVITY_KEY) || "[]"); } catch { return []; }
}
function pushActivity(e: Omit<ActivityEntry, "id">) {
  const log = loadActivityLog();
  log.unshift({ ...e, id: `${Date.now()}` });
  try { localStorage.setItem(ACTIVITY_KEY, JSON.stringify(log.slice(0, 50))); } catch {}
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatBackupTrigger(trigger: string): string {
  const map: Record<string, string> = {
    login: "تسجيل دخول", logout: "تسجيل خروج",
    sale_post: "ترحيل مبيعات", purchase_post: "ترحيل مشتريات",
    scheduled: "جدولة تلقائية", manual: "يدوي",
  };
  return map[trigger] ?? trigger;
}

function getNextBackupTime(sched: string, lastRun: string | null): string | null {
  if (!lastRun || sched === "none") return null;
  const last  = new Date(lastRun);
  const hours = sched === "daily" ? 24 : sched === "weekly" ? 168 : 720;
  return new Date(last.getTime() + hours * 3600 * 1000).toLocaleString("ar-EG");
}

export default function BackupImportTab() {
  const { toast } = useToast();
  const [importSubTab, setImportSubTab] = useState<"products" | "purchases">("products");

  /* ── Selective backup ── */
  const [bkModules,  setBkModules]  = useState<Set<string>>(new Set(BACKUP_MODULES_LIST.map(m => m.key)));
  const [bkLoading,  setBkLoading]  = useState(false);
  const [bkProgress, setBkProgress] = useState(0);
  const [bkResult,   setBkResult]   = useState<{ name: string; size: string; count: number } | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(() => localStorage.getItem(LAST_BK_KEY));

  /* ── Products import ── */
  const [prodImporting, setProdImporting] = useState(false);
  const [prodExporting, setProdExporting] = useState(false);
  const [prodResult,    setProdResult]    = useState<{ success: number; failed: number } | null>(null);
  const prodFileRef = useRef<HTMLInputElement>(null);

  /* ── Purchase import ── */
  const [purRows,       setPurRows]       = useState<PurchaseRow[]>([]);
  const [purParsed,     setPurParsed]     = useState(false);
  const [purLoading,    setPurLoading]    = useState(false);
  const [purConfirming, setPurConfirming] = useState(false);
  const [purResult,     setPurResult]     = useState<string | null>(null);
  const [purSupplier,   setPurSupplier]   = useState("");
  const [purPayType,    setPurPayType]    = useState<"cash" | "credit">("cash");
  const purFileRef = useRef<HTMLInputElement>(null);

  /* ── Activity log ── */
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>(() => loadActivityLog());
  const refreshLog = () => setActivityLog(loadActivityLog());

  /* ── Full backup / restore ── */
  const [fullBkLoading,  setFullBkLoading]  = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreResult,  setRestoreResult]  = useState<{ counts: Record<string, number>; meta: { file_version: string; file_date: string | null; is_legacy: boolean } } | null>(null);
  const [restoreError,   setRestoreError]   = useState<string | null>(null);
  const restoreFileRef = useRef<HTMLInputElement>(null);

  /* ── Restore confirm modal ── */
  const [restoreModal,       setRestoreModal]       = useState(false);
  const [restoreConfirmText, setRestoreConfirmText] = useState("");
  const [restoreUnderstood,  setRestoreUnderstood]  = useState(false);
  const [pendingRestore,     setPendingRestore]     = useState<{
    fileName: string; parsed: unknown; version: string | null; date: string | null; tableCount: number;
  } | null>(null);

  /* ── Server backup list ── */
  const [backupList,        setBackupList]        = useState<BackupRecord[]>([]);
  const [backupListLoading, setBackupListLoading] = useState(false);
  const [serverSchedule,    setServerSchedule]    = useState("none");
  const [serverDestination, setServerDestination] = useState("local");
  const [lastScheduled,     setLastScheduled]     = useState<string | null>(null);
  const [schedSaving,       setSchedSaving]       = useState(false);
  const [deletingBackup,    setDeletingBackup]    = useState<number | null>(null);
  const [serverBkLoading,   setServerBkLoading]   = useState(false);

  const loadBackupSettings = useCallback(async () => {
    try {
      const r = await authFetch(api("/api/backups/settings"));
      if (r.ok) {
        const d = await r.json() as { schedule: string; destination: string; last_scheduled: string | null };
        setServerSchedule(d.schedule ?? "none");
        setServerDestination(d.destination ?? "local");
        setLastScheduled(d.last_scheduled ?? null);
      }
    } catch {}
  }, []);

  const loadBackupList = useCallback(async () => {
    setBackupListLoading(true);
    try {
      const r = await authFetch(api("/api/backups"));
      if (r.ok) setBackupList(await r.json() as BackupRecord[]);
    } catch {} finally { setBackupListLoading(false); }
  }, []);

  useEffect(() => { void loadBackupSettings(); void loadBackupList(); }, [loadBackupSettings, loadBackupList]);

  const handleSaveSchedule = async (sched: string, dest: string) => {
    setSchedSaving(true);
    try {
      const r = await authFetch(api("/api/backups/settings"), { method: "PUT", body: JSON.stringify({ schedule: sched, destination: dest }) });
      if (r.ok) { setServerSchedule(sched); setServerDestination(dest); toast({ title: "✅ تم حفظ إعدادات الجدولة" }); }
    } catch {} finally { setSchedSaving(false); }
  };

  const handleDeleteBackup = async (id: number) => {
    setDeletingBackup(id);
    try {
      const r = await authFetch(api(`/api/backups/${id}`), { method: "DELETE" });
      if (r.ok) { setBackupList(prev => prev.filter(b => b.id !== id)); toast({ title: "تم حذف النسخة الاحتياطية" }); }
    } catch {} finally { setDeletingBackup(null); }
  };

  const handleDownloadBackupById = async (id: number, filename: string) => {
    try {
      const r = await authFetch(api(`/api/backups/${id}/download`));
      if (!r.ok) { toast({ title: "فشل تنزيل الملف", variant: "destructive" }); return; }
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = filename; a.click();
      URL.revokeObjectURL(a.href);
    } catch { toast({ title: "خطأ في التنزيل", variant: "destructive" }); }
  };

  const handleServerManualBackup = async () => {
    setServerBkLoading(true);
    try {
      const r = await authFetch(api("/api/backups"), { method: "POST" });
      if (r.ok) { toast({ title: "✅ تم حفظ النسخة الاحتياطية على الخادم" }); void loadBackupList(); void loadBackupSettings(); }
      else { const d = await r.json().catch(() => ({ error: "فشل" })) as { error?: string }; toast({ title: d.error ?? "فشل إنشاء النسخة", variant: "destructive" }); }
    } catch { toast({ title: "خطأ في الاتصال", variant: "destructive" }); } finally { setServerBkLoading(false); }
  };

  /* ── Local backup ── */
  const toggleModule = (key: string) => setBkModules(prev => { const s = new Set(prev); if (s.has(key)) s.delete(key); else s.add(key); return s; });
  const toggleAllModules = () => setBkModules(bkModules.size === BACKUP_MODULES_LIST.length ? new Set() : new Set(BACKUP_MODULES_LIST.map(m => m.key)));

  const lastBackupLabel = () => {
    if (!lastBackup) return "لم يتم إنشاء نسخة بعد";
    const days = Math.floor((Date.now() - new Date(lastBackup).getTime()) / 86400000);
    if (days === 0) return "اليوم"; if (days === 1) return "منذ يوم واحد";
    if (days < 30)  return `منذ ${days} أيام`;
    return new Date(lastBackup).toLocaleDateString("ar-EG");
  };

  const handleBackup = async () => {
    if (bkModules.size === 0) { toast({ title: "اختر وحدة واحدة على الأقل", variant: "destructive" }); return; }
    setBkLoading(true); setBkProgress(5); setBkResult(null);
    try {
      const selected = BACKUP_MODULES_LIST.filter(m => bkModules.has(m.key));
      const bundle: Record<string, unknown> = { version: "1.0", created_at: new Date().toISOString(), app: "Halal Tech ERP", modules: selected.map(m => m.label) };
      const step = Math.floor(75 / selected.length);
      for (const mod of selected) {
        setBkProgress(p => Math.min(p + step, 85));
        if (mod.url) {
          try { const res = await authFetch(api(mod.url)); bundle[mod.key] = res.ok ? await res.json() : []; } catch { bundle[mod.key] = []; }
        } else if (mod.key === "settings") {
          try { bundle[mod.key] = JSON.parse(localStorage.getItem("halal_erp_settings") || "{}"); } catch { bundle[mod.key] = {}; }
        } else { bundle[mod.key] = null; }
      }
      setBkProgress(90);
      const blob  = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const dt    = new Date().toISOString().replace("T", "_").replace(/:/g, "-").slice(0, 19);
      const fname = `backup_${dt}.json`;
      const a     = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = fname; a.click();
      URL.revokeObjectURL(a.href);
      setBkResult({ name: fname, size: `${(blob.size / 1024).toFixed(1)} KB`, count: selected.length });
      setBkProgress(100);
      const now = new Date().toISOString();
      localStorage.setItem(LAST_BK_KEY, now); setLastBackup(now);
      pushActivity({ date: now, type: "backup", file: fname, status: `✅ ${selected.length} وحدات`, user: "Admin" });
      refreshLog();
      toast({ title: `✅ تم إنشاء النسخة الاحتياطية — ${fname}` });
    } catch { toast({ title: "فشل إنشاء النسخة الاحتياطية", variant: "destructive" }); }
    finally { setBkLoading(false); setTimeout(() => setBkProgress(0), 1500); }
  };

  /* ── Full backup from server ── */
  const handleFullBackup = async () => {
    setFullBkLoading(true);
    try {
      const res  = await authFetch(api("/api/system/backup"), { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const cd   = res.headers.get("Content-Disposition") ?? "";
      const m    = cd.match(/filename="([^"]+)"/);
      const fname = m ? m[1] : `halal-tech-backup_${new Date().toISOString().slice(0, 10)}.json`;
      const a    = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = fname; a.click();
      URL.revokeObjectURL(a.href);
      const now = new Date().toISOString();
      localStorage.setItem(LAST_BK_KEY, now); setLastBackup(now);
      pushActivity({ date: now, type: "backup", file: fname, status: "✅ نسخة كاملة", user: "Admin" });
      refreshLog();
      toast({ title: `✅ تم تنزيل النسخة الكاملة — ${fname}` });
    } catch (e) { toast({ title: "فشل إنشاء النسخة الكاملة", description: String(e), variant: "destructive" }); }
    finally { setFullBkLoading(false); }
  };

  /* ── Restore file pick ── */
  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    e.target.value = "";
    if (!file.name.endsWith(".json")) { toast({ title: "يجب اختيار ملف JSON", variant: "destructive" }); return; }
    try {
      const parsed  = JSON.parse(await file.text()) as Record<string, unknown>;
      const version = typeof parsed.version === "string" ? parsed.version : null;
      const date    = typeof parsed.created_at === "string" ? parsed.created_at : null;
      const dataSection = (parsed.data ?? parsed.tables ?? parsed) as Record<string, unknown>;
      setPendingRestore({ fileName: file.name, parsed, version, date, tableCount: Object.values(dataSection).filter(Array.isArray).length });
      setRestoreConfirmText(""); setRestoreUnderstood(false); setRestoreModal(true);
    } catch { toast({ title: "ملف JSON غير صالح", variant: "destructive" }); }
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestore) return;
    setRestoreModal(false); setRestoreLoading(true); setRestoreResult(null); setRestoreError(null);
    try {
      const res  = await authFetch(api("/api/system/restore"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pendingRestore.parsed) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "فشل الاستعادة");
      setRestoreResult({ counts: data.counts ?? {}, meta: data.meta ?? { file_version: "legacy", file_date: null, is_legacy: true } });
      pushActivity({ date: new Date().toISOString(), type: "backup", file: pendingRestore.fileName, status: "✅ استعادة ناجحة", user: "Admin" });
      refreshLog();
      toast({ title: "✅ تمت استعادة النسخة الاحتياطية بنجاح" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setRestoreError(msg);
      toast({ title: "فشل الاستعادة", description: msg, variant: "destructive" });
    } finally { setRestoreLoading(false); setPendingRestore(null); }
  };

  /* ── Products export ── */
  const handleProductsExport = async () => {
    setProdExporting(true);
    try {
      const res = await authFetch(api("/api/products"));
      const prods = await res.json();
      const rows = prods.map((p: any) => ({
        "اسم الصنف": p.name, "كود الصنف (SKU)": p.sku || "", "التصنيف": p.category || "",
        "الكمية": Number(p.quantity), "سعر التكلفة": Number(p.cost_price),
        "سعر البيع": Number(p.sale_price), "حد التنبيه": p.low_stock_threshold || "",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [{ wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "الأصناف");
      XLSX.writeFile(wb, `halal-tech-products-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast({ title: `تم تصدير ${prods.length} صنف بنجاح` });
    } catch { toast({ title: "فشل التصدير", variant: "destructive" }); }
    finally { setProdExporting(false); }
  };

  /* ── Products import ── */
  const handleProductsImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setProdImporting(true); setProdResult(null);
    try {
      const wb   = XLSX.read(await file.arrayBuffer());
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as any[];
      let success = 0, failed = 0;
      for (const row of rows) {
        const name = row["اسم الصنف"] || row["name"] || row["Name"];
        if (!name) { failed++; continue; }
        try {
          const res = await authFetch(api("/api/products"), {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: String(name), sku: String(row["كود الصنف (SKU)"] || row["sku"] || ""),
              category: String(row["التصنيف"] || row["category"] || ""),
              quantity: Number(row["الكمية"] || row["quantity"] || 0),
              cost_price: Number(row["سعر التكلفة"] || row["cost_price"] || 0),
              sale_price: Number(row["سعر البيع"] || row["sale_price"] || 0),
              low_stock_threshold: row["حد التنبيه"] ? Number(row["حد التنبيه"]) : undefined,
            }),
          });
          if (res.ok) success++; else failed++;
        } catch { failed++; }
      }
      setProdResult({ success, failed });
      const now = new Date().toISOString();
      pushActivity({ date: now, type: "import-products", file: file.name, status: `✅ ${success} صنف${failed > 0 ? ` — ⚠️ ${failed} خطأ` : ""}`, user: "Admin" });
      refreshLog();
      toast({ title: `تم الاستيراد: ${success} صنف ✓، ${failed} فشل` });
    } catch { toast({ title: "فشل قراءة الملف", variant: "destructive" }); }
    finally { setProdImporting(false); if (prodFileRef.current) prodFileRef.current.value = ""; }
  };

  const downloadProductsTemplate = () => {
    const rows = [
      { "اسم الصنف": "شاشة LCD", "كود الصنف (SKU)": "SCR001", "التصنيف": "قطع غيار", "الكمية": 10, "سعر التكلفة": 150, "سعر البيع": 200, "حد التنبيه": 5 },
      { "اسم الصنف": "بطارية أيفون", "كود الصنف (SKU)": "BAT002", "التصنيف": "بطاريات", "الكمية": 20, "سعر التكلفة": 80, "سعر البيع": 120, "حد التنبيه": 3 },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الأصناف");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { "الحقل": "اسم الصنف",        "الوصف": "اسم المنتج (إلزامي)",    "مثال": "شاشة LCD" },
      { "الحقل": "كود الصنف (SKU)",  "الوصف": "رمز تعريف فريد",         "مثال": "SCR001"   },
      { "الحقل": "التصنيف",           "الوصف": "فئة المنتج",             "مثال": "قطع غيار" },
      { "الحقل": "الكمية",            "الوصف": "الكمية في المخزن",       "مثال": "10"       },
      { "الحقل": "سعر التكلفة",       "الوصف": "سعر الشراء",             "مثال": "150"      },
      { "الحقل": "سعر البيع",         "الوصف": "سعر البيع للعميل",       "مثال": "200"      },
    ]), "التعليمات");
    XLSX.writeFile(wb, "template-products.xlsx");
  };

  /* ── Purchases import ── */
  const handlePurchaseFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setPurLoading(true); setPurParsed(false); setPurRows([]); setPurResult(null);
    try {
      const prodRes  = await authFetch(api("/api/products"));
      const products: any[] = prodRes.ok ? await prodRes.json() : [];
      const skuMap   = new Map<string, { id: number; name: string }>();
      for (const p of products) { if (p.sku) skuMap.set(String(p.sku).trim().toUpperCase(), { id: p.id, name: p.name }); }
      const wb      = XLSX.read(await file.arrayBuffer());
      const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as any[];
      const parsed: PurchaseRow[] = rawRows.map((row, idx) => {
        const sku       = String(row["كود الصنف (SKU)"] || row["sku"] || "").trim();
        const name      = String(row["اسم الصنف"]       || row["name"]       || "");
        const quantity  = String(row["الكمية"]           || row["quantity"]   || "");
        const unitPrice = String(row["سعر الشراء"]       || row["unit_price"] || "");
        const supplier  = String(row["المورد"]           || row["supplier"]   || "");
        const invoiceNo = String(row["رقم الفاتورة"]     || row["invoice_no"] || "");
        const date      = String(row["تاريخ الفاتورة"]   || row["date"]       || "");
        const tax       = String(row["الضريبة%"]         || row["tax"]        || "0");
        const discount  = String(row["الخصم%"]           || row["discount"]   || "0");
        const errors: string[] = [];
        if (!sku)                                                              errors.push("كود الصنف مفقود");
        else if (!skuMap.has(sku.toUpperCase()))                              errors.push(`كود غير موجود: ${sku}`);
        if (!quantity  || isNaN(Number(quantity))  || Number(quantity) <= 0)  errors.push("الكمية غير صالحة");
        if (!unitPrice || isNaN(Number(unitPrice)) || Number(unitPrice) <= 0) errors.push("السعر غير صالح");
        const resolved = skuMap.get(sku.toUpperCase());
        return { idx, sku, name: name || resolved?.name || "", quantity, unitPrice, supplier, invoiceNo, date, tax, discount, productId: resolved?.id ?? null, errors };
      });
      setPurRows(parsed); setPurParsed(true);
      if (parsed.length > 0 && parsed[0].supplier) setPurSupplier(parsed[0].supplier);
    } catch { toast({ title: "فشل قراءة ملف المشتريات", variant: "destructive" }); }
    finally { setPurLoading(false); if (purFileRef.current) purFileRef.current.value = ""; }
  };

  const updatePurRow = (idx: number, field: "quantity" | "unitPrice", value: string) => {
    setPurRows(prev => prev.map(r => {
      if (r.idx !== idx) return r;
      const u = { ...r, [field]: value };
      const errors: string[] = [];
      if (!u.sku) errors.push("كود الصنف مفقود"); else if (!u.productId) errors.push("كود غير موجود");
      if (!u.quantity  || isNaN(Number(u.quantity))  || Number(u.quantity) <= 0)  errors.push("الكمية غير صالحة");
      if (!u.unitPrice || isNaN(Number(u.unitPrice)) || Number(u.unitPrice) <= 0) errors.push("السعر غير صالح");
      return { ...u, errors };
    }));
  };

  const validRows = purRows.filter(r => r.errors.length === 0);
  const errorRows = purRows.filter(r => r.errors.length > 0);

  const handlePurchaseConfirm = async () => {
    if (validRows.length === 0) { toast({ title: "لا توجد صفوف صالحة للاستيراد", variant: "destructive" }); return; }
    setPurConfirming(true);
    try {
      const items = validRows.map(r => {
        const qty = Number(r.quantity), price = Number(r.unitPrice);
        const unitNet = price * (1 - Number(r.discount || 0) / 100);
        return { product_id: r.productId!, product_name: r.name, quantity: qty, unit_price: unitNet, total_price: qty * unitNet * (1 + Number(r.tax || 0) / 100) };
      });
      const total = items.reduce((s, i) => s + i.total_price, 0);
      const res   = await authFetch(api("/api/purchases"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_type: purPayType, total_amount: total, paid_amount: purPayType === "credit" ? 0 : total, items, supplier_name: purSupplier || undefined, notes: `استيراد من Excel — ${validRows.length} صنف` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الاستيراد");
      const msg = `تم إنشاء فاتورة مشتريات ${data.invoice_no} وتحديث المخزن بـ ${validRows.length} صنف ✓`;
      setPurResult(msg);
      pushActivity({ date: new Date().toISOString(), type: "import-purchases", file: "Excel", status: `✅ ${validRows.length} صنف — ${data.invoice_no}`, user: "Admin" });
      refreshLog();
      toast({ title: msg });
    } catch (err: any) { toast({ title: err.message || "فشل الاستيراد", variant: "destructive" }); }
    finally { setPurConfirming(false); }
  };

  const downloadPurchaseTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([{ "كود الصنف (SKU)": "SCR001", "اسم الصنف": "شاشة LCD", "الكمية": 10, "سعر الشراء": 150, "المورد": "مورد الشاشات", "تاريخ الفاتورة": "2024-01-15", "رقم الفاتورة": "INV-001", "الضريبة%": 14, "الخصم%": 0 }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "فاتورة المشتريات");
    XLSX.writeFile(wb, "template-purchase-invoice.xlsx");
  };

  const canConfirmRestore = restoreConfirmText === "RESTORE" && restoreUnderstood;

  return (
    <div className="space-y-6">
      <PageHeader title="النسخ الاحتياطية والاستيراد" sub="احتفظ ببيانات نظامك واستورد البيانات بأمان" />

      {/* ── Restore Modal ── */}
      {restoreModal && pendingRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setRestoreModal(false)} />
          <div className="relative w-full max-w-md bg-[#0F1623] border border-red-500/30 rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-red-500/20 bg-red-500/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <p className="font-bold text-red-400 text-sm">تأكيد الاستعادة</p>
                  <p className="text-white/30 text-xs">هذا الإجراء لا يمكن التراجع عنه</p>
                </div>
              </div>
              <button onClick={() => setRestoreModal(false)} className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-5">
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-center space-y-1">
                <p className="text-red-300 font-bold text-sm">⚠️ سيتم حذف كل البيانات الحالية واستبدالها</p>
                <p className="text-white/40 text-xs">المستخدمون والإعدادات الأساسية تبقى كما هي</p>
              </div>
              <div className="p-3 rounded-xl bg-white/3 border border-white/8 space-y-2">
                <p className="text-white/50 text-xs font-bold uppercase tracking-widest">معلومات الملف</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><p className="text-white/30 mb-0.5">اسم الملف</p><p className="text-white font-bold truncate">{pendingRestore.fileName}</p></div>
                  <div><p className="text-white/30 mb-0.5">الإصدار</p><p className="text-white font-bold">{pendingRestore.version ?? "legacy"}</p></div>
                  {pendingRestore.date && <div className="col-span-2"><p className="text-white/30 mb-0.5">تاريخ الإنشاء</p><p className="text-white font-bold">{new Date(pendingRestore.date).toLocaleString("ar-EG")}</p></div>}
                  <div><p className="text-white/30 mb-0.5">عدد الجداول</p><p className="text-white font-bold">{pendingRestore.tableCount}</p></div>
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-white/60 text-sm">اكتب <span className="text-red-400 font-black tracking-widest">RESTORE</span> للمتابعة:</label>
                <input type="text" value={restoreConfirmText} onChange={e => setRestoreConfirmText(e.target.value)}
                  placeholder="RESTORE" autoComplete="off" spellCheck={false}
                  className={`w-full bg-white/5 border rounded-xl px-4 py-3 text-sm font-bold text-center tracking-widest outline-none transition-all placeholder:text-white/15 placeholder:font-normal placeholder:tracking-normal ${restoreConfirmText === "RESTORE" ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/5" : restoreConfirmText.length > 0 ? "border-red-500/40 text-white" : "border-white/10 text-white"}`}
                />
                {restoreConfirmText === "RESTORE" && <p className="text-emerald-400/70 text-xs text-center flex items-center justify-center gap-1"><Check className="w-3 h-3" /> صحيح</p>}
              </div>
              <label className="flex items-start gap-3 cursor-pointer group">
                <div onClick={() => setRestoreUnderstood(v => !v)}
                  className={`mt-0.5 w-5 h-5 shrink-0 rounded-md border-2 flex items-center justify-center transition-all ${restoreUnderstood ? "bg-red-500 border-red-500" : "bg-transparent border-white/20 group-hover:border-white/40"}`}>
                  {restoreUnderstood && <Check className="w-3 h-3 text-white" />}
                </div>
                <span className="text-white/60 text-sm leading-relaxed select-none">فهمت أن <span className="text-red-400 font-bold">جميع البيانات الحالية سيتم حذفها</span></span>
              </label>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setRestoreModal(false)} className="flex-1 py-3 rounded-xl border border-white/10 text-white/50 hover:text-white hover:border-white/20 transition-all text-sm font-bold">إلغاء</button>
                <button onClick={handleConfirmRestore} disabled={!canConfirmRestore}
                  className={`flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${canConfirmRestore ? "bg-red-500 hover:bg-red-400 text-white shadow-lg shadow-red-500/25" : "bg-white/5 text-white/20 cursor-not-allowed"}`}>
                  <Upload className="w-4 h-4" /> استعادة
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Selective Backup ── */}
      <div className="bg-[#111827] border border-white/5 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center"><HardDrive className="w-4 h-4 text-blue-400" /></div>
            <div><p className="font-bold text-white text-sm">النسخ الاحتياطية</p><p className="text-white/30 text-xs">آخر نسخة: {lastBackupLabel()}</p></div>
          </div>
          <button onClick={toggleAllModules} className="text-xs text-amber-400 hover:text-amber-300 transition-colors">
            {bkModules.size === BACKUP_MODULES_LIST.length ? "إلغاء الكل" : "تحديد الكل"}
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {BACKUP_MODULES_LIST.map(m => {
              const active = bkModules.has(m.key);
              return (
                <button key={m.key} onClick={() => toggleModule(m.key)}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-right transition-all ${active ? "bg-blue-500/10 border-blue-500/30" : "bg-[#1A2235] border-[#2D3748] hover:border-blue-500/20"}`}>
                  <span className="text-xl">{m.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`font-bold text-sm ${active ? "text-blue-300" : "text-white/70"}`}>{m.label}</p>
                    <p className="text-white/25 text-xs truncate">{m.sub}</p>
                  </div>
                  <div className={`w-4 h-4 rounded-md border shrink-0 flex items-center justify-center transition-all ${active ? "bg-blue-500 border-blue-500" : "border-white/20"}`}>
                    {active && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                </button>
              );
            })}
          </div>
          {bkLoading && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-white/40"><span>جاري إنشاء النسخة...</span><span>{bkProgress}%</span></div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden"><div className="h-full bg-blue-400 rounded-full transition-all duration-300" style={{ width: `${bkProgress}%` }} /></div>
            </div>
          )}
          {bkResult && !bkLoading && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <div className="flex items-center gap-2 mb-3"><CheckCircle2 className="w-5 h-5 text-emerald-400" /><span className="text-emerald-400 font-bold text-sm">تم إنشاء النسخة الاحتياطية بنجاح</span></div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div><p className="text-white/30 text-xs mb-0.5">الملف</p><p className="text-white text-xs font-bold truncate">{bkResult.name.slice(0, 20)}…</p></div>
                <div><p className="text-white/30 text-xs mb-0.5">الحجم</p><p className="text-white text-sm font-bold">{bkResult.size}</p></div>
                <div><p className="text-white/30 text-xs mb-0.5">الوحدات</p><p className="text-white text-sm font-bold">{bkResult.count}</p></div>
              </div>
            </div>
          )}
          <PrimaryBtn onClick={handleBackup} disabled={bkLoading || bkModules.size === 0} className="w-full">
            {bkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4" />}
            {bkLoading ? `جاري الإنشاء... ${bkProgress}%` : `إنشاء نسخة احتياطية (${bkModules.size} وحدات)`}
          </PrimaryBtn>
        </div>
      </div>

      {/* ── Auto Backup ── */}
      <div className="bg-[#111827] border border-sky-500/20 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center"><RefreshCcw className="w-4 h-4 text-sky-400" /></div>
            <div><p className="font-bold text-white text-sm">النسخ التلقائي</p><p className="text-white/30 text-xs">جدولة وإعدادات الحفظ التلقائي على الخادم</p></div>
          </div>
          {schedSaving && <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />}
        </div>
        <div className="p-5 space-y-4">
          <div className="p-3 rounded-xl bg-sky-500/5 border border-sky-500/15 text-sky-300/70 text-xs leading-relaxed space-y-1">
            <p className="font-semibold text-sky-300">يتم إنشاء نسخة احتياطية تلقائياً عند:</p>
            <div className="grid grid-cols-2 gap-1 mt-2">
              {["تسجيل الدخول", "ترحيل فاتورة مبيعات", "ترحيل فاتورة مشتريات", "الجدولة التلقائية"].map(l => (
                <div key={l} className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" /><span>{l}</span></div>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-white/40 text-xs font-semibold uppercase tracking-wider">الجدولة المنتظمة</p>
            <div className="flex flex-wrap gap-2">
              {[{ v: "none", l: "بدون" }, { v: "daily", l: "يومياً" }, { v: "weekly", l: "أسبوعياً" }, { v: "monthly", l: "شهرياً" }].map(s => (
                <button key={s.v} onClick={() => void handleSaveSchedule(s.v, serverDestination)} disabled={schedSaving}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${serverSchedule === s.v ? "bg-sky-500/20 border-sky-500/40 text-sky-300" : "border-white/10 text-white/40 hover:border-sky-500/25 hover:text-sky-300/60"}`}>
                  {s.l}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-white/40 text-xs font-semibold uppercase tracking-wider">وجهة الحفظ</p>
            <div className="flex gap-2">
              {[{ v: "local", l: "خادم محلي", icon: "🖥️" }, { v: "server", l: "مجلد الخادم", icon: "📁" }].map(d => (
                <button key={d.v} onClick={() => void handleSaveSchedule(serverSchedule, d.v)} disabled={schedSaving}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${serverDestination === d.v ? "bg-sky-500/20 border-sky-500/40 text-sky-300" : "border-white/10 text-white/40 hover:border-sky-500/25 hover:text-sky-300/60"}`}>
                  <span>{d.icon}</span>{d.l}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-white/3 border border-white/5 space-y-1">
              <p className="text-white/30 text-xs">آخر نسخة تلقائية</p>
              <p className="text-white text-sm font-bold truncate">{lastScheduled ? new Date(lastScheduled).toLocaleString("ar-EG") : "—"}</p>
            </div>
            <div className="p-3 rounded-xl bg-white/3 border border-white/5 space-y-1">
              <p className="text-white/30 text-xs">النسخة القادمة</p>
              <p className="text-sky-300 text-sm font-bold truncate">{getNextBackupTime(serverSchedule, lastScheduled) ?? (serverSchedule === "none" ? "معطّل" : "قريباً")}</p>
            </div>
          </div>
          <button onClick={() => void handleServerManualBackup()} disabled={serverBkLoading}
            className="w-full py-3 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 hover:border-sky-500/50 text-sky-300 font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50">
            {serverBkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {serverBkLoading ? "جاري الحفظ..." : "حفظ نسخة الآن على الخادم"}
          </button>
        </div>
      </div>

      {/* ── Server Backup History ── */}
      <div className="bg-[#111827] border border-white/8 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center"><History className="w-4 h-4 text-white/50" /></div>
            <div>
              <p className="font-bold text-white text-sm">سجل النسخ الاحتياطية</p>
              <p className="text-white/30 text-xs">{backupList.length > 0 ? `${backupList.length} نسخة محفوظة` : "لا توجد نسخ محفوظة بعد"}</p>
            </div>
          </div>
          <button onClick={() => void loadBackupList()} disabled={backupListLoading} className="p-2 rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-colors">
            <RefreshCcw className={`w-4 h-4 ${backupListLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="p-3">
          {backupListLoading && backupList.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8 text-white/30 text-sm"><Loader2 className="w-4 h-4 animate-spin" /><span>جاري التحميل...</span></div>
          ) : backupList.length === 0 ? (
            <div className="text-center py-8 text-white/25 text-sm">لا توجد نسخ احتياطية محفوظة على الخادم حتى الآن</div>
          ) : (
            <div className="divide-y divide-white/5">
              {backupList.map(b => (
                <div key={b.id} className="flex items-center justify-between gap-3 py-3 px-2 rounded-xl hover:bg-white/3 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0"><HardDrive className="w-3.5 h-3.5 text-white/40" /></div>
                    <div className="min-w-0">
                      <p className="text-white text-xs font-mono truncate max-w-[200px]" title={b.filename}>{b.filename}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-white/30 text-[10px]">{new Date(b.created_at).toLocaleString("ar-EG")}</span>
                        <span className="text-white/20 text-[10px]">•</span>
                        <span className="text-white/30 text-[10px]">{formatBytes(b.size)}</span>
                        <span className="text-white/20 text-[10px]">•</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${b.trigger === "login" ? "bg-blue-500/15 text-blue-400" : b.trigger === "sale_post" || b.trigger === "purchase_post" ? "bg-emerald-500/15 text-emerald-400" : b.trigger === "scheduled" ? "bg-sky-500/15 text-sky-400" : "bg-white/8 text-white/40"}`}>{formatBackupTrigger(b.trigger)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => void handleDownloadBackupById(b.id, b.filename)} className="p-2 rounded-lg text-emerald-400/60 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors" title="تنزيل"><Download className="w-3.5 h-3.5" /></button>
                    <button onClick={() => void handleDeleteBackup(b.id)} disabled={deletingBackup === b.id} className="p-2 rounded-lg text-red-400/40 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50" title="حذف">
                      {deletingBackup === b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Full Server Backup ── */}
      <div className="bg-[#111827] border border-emerald-500/20 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center"><Database className="w-4 h-4 text-emerald-400" /></div>
          <div><p className="font-bold text-white text-sm">نسخة احتياطية كاملة من الخادم</p><p className="text-white/30 text-xs">تصدير جميع الجداول مباشرة من قاعدة البيانات</p></div>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-emerald-300/70 text-xs leading-relaxed">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
            <span>تشمل: العملاء، المنتجات، المبيعات، المشتريات، المصروفات، الخزائن، القيود المحاسبية، التنبيهات وجميع الحركات</span>
          </div>
          <PrimaryBtn onClick={handleFullBackup} disabled={fullBkLoading} className="w-full" style={{ background: "linear-gradient(to right, #10b981, #059669)" }}>
            {fullBkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {fullBkLoading ? "جاري التصدير..." : "تنزيل نسخة احتياطية كاملة (JSON)"}
          </PrimaryBtn>
        </div>
      </div>

      {/* ── Restore ── */}
      <div className="bg-[#111827] border border-violet-500/20 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center"><Upload className="w-4 h-4 text-violet-400" /></div>
          <div><p className="font-bold text-white text-sm">استعادة نسخة احتياطية</p><p className="text-white/30 text-xs">ارفع ملف JSON وسيتم الاستعادة داخل معاملة آمنة</p></div>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/15 text-amber-300/70 text-xs leading-relaxed">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <span>تحذير: ستُحذف البيانات الحالية. المستخدمون والإعدادات تبقى كما هي. العملية لا يمكن التراجع عنها.</span>
          </div>
          <input ref={restoreFileRef} type="file" accept=".json" className="hidden" onChange={handleRestoreFile} />
          {restoreLoading && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-violet-500/10 border border-violet-500/20">
              <Loader2 className="w-4 h-4 text-violet-400 animate-spin" /><p className="text-violet-300 text-sm">جاري الاستعادة...</p>
            </div>
          )}
          {restoreResult && !restoreLoading && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /><span className="text-emerald-400 font-bold text-sm">تمت الاستعادة بنجاح</span></div>
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">v{restoreResult.meta.file_version}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                {Object.entries(restoreResult.counts).filter(([, v]) => (v as number) > 0).slice(0, 9).map(([k, v]) => (
                  <div key={k} className="bg-white/5 rounded-lg p-2"><p className="text-white/40 text-[10px]">{k}</p><p className="text-white font-bold">{String(v)}</p></div>
                ))}
              </div>
            </div>
          )}
          {restoreError && !restoreLoading && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm"><X className="w-4 h-4 shrink-0" /> {restoreError}</div>
          )}
          <button onClick={() => restoreFileRef.current?.click()} disabled={restoreLoading}
            className="w-full py-3 rounded-xl border-2 border-dashed border-violet-500/30 hover:border-violet-500/60 text-violet-400 hover:text-violet-300 transition-all flex items-center justify-center gap-2 text-sm font-bold disabled:opacity-50">
            <Upload className="w-4 h-4" /> اختر ملف النسخة الاحتياطية (.json)
          </button>
        </div>
      </div>

      {/* ── Import ── */}
      <div className="bg-[#111827] border border-white/5 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center"><Upload className="w-4 h-4 text-amber-400" /></div>
            <div><p className="font-bold text-white text-sm">الاستيراد</p><p className="text-white/30 text-xs">استيراد الأصناف وفواتير المشتريات من ملفات Excel</p></div>
          </div>
          <div className="flex gap-2">
            {[{ id: "products" as const, label: "📦 استيراد الأصناف" }, { id: "purchases" as const, label: "🛒 استيراد فاتورة مشتريات" }].map(t => (
              <button key={t.id} onClick={() => setImportSubTab(t.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${importSubTab === t.id ? "bg-amber-500/20 border-amber-500/30 text-amber-400" : "border-white/8 text-white/35 hover:text-white/60 hover:border-white/15"}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5">
          {importSubTab === "products" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                <div><p className="text-emerald-400 font-bold text-sm">تصدير الأصناف الحالية</p><p className="text-white/30 text-xs">تحميل جميع الأصناف كملف Excel</p></div>
                <button onClick={handleProductsExport} disabled={prodExporting}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 rounded-xl text-emerald-400 font-bold text-xs transition-all disabled:opacity-40">
                  {prodExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  {prodExporting ? "جاري التصدير..." : "تصدير Excel"}
                </button>
              </div>
              <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-3">
                <div><p className="text-amber-400 font-bold text-sm">استيراد أصناف جديدة</p><p className="text-white/30 text-xs">رفع ملف Excel لإضافة الأصناف دفعةً واحدة</p></div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => prodFileRef.current?.click()} disabled={prodImporting}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 rounded-xl text-amber-400 font-bold text-xs transition-all disabled:opacity-40">
                    {prodImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    {prodImporting ? "جاري الاستيراد..." : "رفع ملف Excel"}
                  </button>
                  <button onClick={downloadProductsTemplate} className="flex items-center gap-2 px-4 py-2 border border-white/10 hover:border-white/20 rounded-xl text-white/50 hover:text-white text-xs transition-all">
                    <Download className="w-3.5 h-3.5" /> تحميل نموذج فارغ
                  </button>
                </div>
                <input ref={prodFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleProductsImport} />
                {prodResult && (
                  <div className={`p-3 rounded-xl border text-xs ${prodResult.failed === 0 ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-amber-500/10 border-amber-500/20 text-amber-400"}`}>
                    <CheckCircle2 className="w-3.5 h-3.5 inline ml-2" />
                    تم استيراد <strong>{prodResult.success}</strong> صنف{prodResult.failed > 0 && <span className="text-red-400"> — فشل {prodResult.failed}</span>}
                  </div>
                )}
              </div>
            </div>
          )}

          {importSubTab === "purchases" && (
            <div className="space-y-4">
              {!purParsed ? (
                <div className="p-4 rounded-xl border border-violet-500/20 bg-violet-500/5 space-y-3">
                  <div><p className="text-violet-400 font-bold text-sm">استيراد فاتورة مشتريات</p><p className="text-white/30 text-xs">رفع ملف Excel يحتوي على بنود الفاتورة</p></div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => purFileRef.current?.click()} disabled={purLoading}
                      className="flex items-center gap-2 px-4 py-2 bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/30 rounded-xl text-violet-400 font-bold text-xs transition-all disabled:opacity-40">
                      {purLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      {purLoading ? "جاري القراءة والتحقق..." : "رفع ملف Excel"}
                    </button>
                    <button onClick={downloadPurchaseTemplate} className="flex items-center gap-2 px-4 py-2 border border-white/10 hover:border-white/20 rounded-xl text-white/50 hover:text-white text-xs transition-all">
                      <Download className="w-3.5 h-3.5" /> تحميل نموذج فارغ
                    </button>
                  </div>
                  <input ref={purFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handlePurchaseFile} />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-white/3 border border-white/8">
                    <div className="flex gap-4">
                      <span className="text-emerald-400 text-sm font-bold">{validRows.length} صنف صحيح ✓</span>
                      {errorRows.length > 0 && <span className="text-red-400 text-sm font-bold">{errorRows.length} صنف به أخطاء ✗</span>}
                    </div>
                    <button onClick={() => { setPurParsed(false); setPurRows([]); setPurResult(null); }} className="text-xs text-white/40 hover:text-white transition-colors">إلغاء</button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><FieldLabel>العميل (اختياري)</FieldLabel><SInput placeholder="اسم العميل" value={purSupplier} onChange={e => setPurSupplier(e.target.value)} /></div>
                    <div><FieldLabel>طريقة الدفع</FieldLabel>
                      <SSelect value={purPayType} onChange={e => setPurPayType(e.target.value as "cash" | "credit")}>
                        <option value="cash">نقدي</option><option value="credit">آجل</option>
                      </SSelect>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-white/8">
                    <table className="w-full text-xs min-w-[500px]">
                      <thead>
                        <tr className="bg-white/3 border-b border-white/8">
                          {["SKU", "الصنف", "الكمية", "السعر", "الإجمالي", "الحالة"].map(h => (
                            <th key={h} className="px-3 py-2.5 text-right text-white/40 font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {purRows.map(r => {
                          const hasError = r.errors.length > 0;
                          const total    = (Number(r.quantity) || 0) * (Number(r.unitPrice) || 0);
                          return (
                            <tr key={r.idx} className={`border-b border-white/4 ${hasError ? "bg-red-500/5" : "hover:bg-white/2"}`}>
                              <td className="px-3 py-2 text-white/50 font-mono">{r.sku || "—"}</td>
                              <td className="px-3 py-2 text-white/70 max-w-[100px] truncate">{r.name || "—"}</td>
                              <td className="px-3 py-2">
                                <input type="number" value={r.quantity} onChange={e => updatePurRow(r.idx, "quantity", e.target.value)}
                                  className={`w-16 px-2 py-1 rounded-lg bg-white/5 border text-white text-center text-xs outline-none ${!r.quantity || Number(r.quantity) <= 0 ? "border-red-500/50" : "border-white/10"}`} />
                              </td>
                              <td className="px-3 py-2">
                                <input type="number" value={r.unitPrice} onChange={e => updatePurRow(r.idx, "unitPrice", e.target.value)}
                                  className={`w-20 px-2 py-1 rounded-lg bg-white/5 border text-white text-center text-xs outline-none ${!r.unitPrice || Number(r.unitPrice) <= 0 ? "border-red-500/50" : "border-white/10"}`} />
                              </td>
                              <td className="px-3 py-2 text-white/55 font-mono">{isNaN(total) ? "—" : total.toFixed(2)}</td>
                              <td className="px-3 py-2">
                                {hasError ? <span className="text-red-400 text-xs" title={r.errors.join(" | ")}>✗ {r.errors[0]}</span> : <span className="text-emerald-400 text-xs">✓ صالح</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {validRows.length > 0 && (
                    <div className="flex justify-between items-center p-3 rounded-xl bg-white/3 border border-white/8">
                      <span className="text-white/50 text-sm">إجمالي الفاتورة</span>
                      <span className="text-amber-400 font-black text-lg">{validRows.reduce((s, r) => s + (Number(r.quantity)||0) * (Number(r.unitPrice)||0), 0).toFixed(2)}</span>
                    </div>
                  )}
                  {purResult && <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm"><CheckCircle2 className="w-4 h-4 inline ml-2" />{purResult}</div>}
                  <button onClick={handlePurchaseConfirm} disabled={purConfirming || validRows.length === 0}
                    className="w-full flex items-center justify-center gap-2 py-3.5 bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/30 rounded-xl text-violet-400 font-bold text-sm transition-all disabled:opacity-40">
                    {purConfirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    {purConfirming ? "جاري إنشاء الفاتورة..." : `تأكيد استيراد ${validRows.length} صنف وإنشاء فاتورة مشتريات`}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Activity Log ── */}
      <div className="bg-[#111827] border border-white/5 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center"><History className="w-4 h-4 text-white/40" /></div>
            <div><p className="font-bold text-white text-sm">سجل العمليات</p><p className="text-white/30 text-xs">آخر {activityLog.length} عملية</p></div>
          </div>
          {activityLog.length > 0 && (
            <button onClick={() => { localStorage.removeItem(ACTIVITY_KEY); setActivityLog([]); }} className="text-xs text-white/25 hover:text-red-400 transition-colors">مسح السجل</button>
          )}
        </div>
        <div className="overflow-x-auto">
          {activityLog.length === 0 ? (
            <div className="p-8 text-center text-white/20 text-sm">لا توجد عمليات مسجلة بعد</div>
          ) : (
            <table className="w-full text-xs min-w-[500px]">
              <thead><tr className="border-b border-white/5 bg-white/2">
                {["التاريخ", "النوع", "الملف", "الحالة"].map(h => <th key={h} className="px-4 py-3 text-right text-white/30 font-medium">{h}</th>)}
              </tr></thead>
              <tbody>
                {activityLog.map(e => (
                  <tr key={e.id} className="border-b border-white/4 hover:bg-white/2 transition-colors">
                    <td className="px-4 py-3 text-white/40 font-mono">{new Date(e.date).toLocaleDateString("ar-EG")} {new Date(e.date).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${e.type === "backup" ? "bg-blue-500/15 text-blue-400" : e.type === "import-products" ? "bg-amber-500/15 text-amber-400" : "bg-violet-500/15 text-violet-400"}`}>
                        {e.type === "backup" ? "نسخ احتياطي" : e.type === "import-products" ? "استيراد أصناف" : "استيراد مشتريات"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white/40 font-mono max-w-[120px] truncate">{e.file}</td>
                    <td className="px-4 py-3 text-white/55">{e.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
