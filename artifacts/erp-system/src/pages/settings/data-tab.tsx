/**
 * data-tab.tsx — إدارة البيانات
 * المحتوى: استيراد الأصناف، استيراد المشتريات، سجل العمليات، منطقة الخطر
 */
import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { authFetch } from "@/lib/auth-fetch";
import { useToast } from "@/hooks/use-toast";
import { useResetDatabase } from "@workspace/api-client-react";
import {
  AlertTriangle, Loader2, Check, Download, Upload, CheckCircle2,
  X, Package, ShoppingCart, History, Trash2,
} from "lucide-react";
import { PageHeader, FieldLabel, SInput, SSelect, DangerBtn } from "./_shared";
import { DATA_GROUPS } from "./_constants";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api  = (p: string) => `${BASE}${p}`;

const ACTIVITY_KEY = "halal_erp_activity_log";

interface ActivityEntry {
  id: string; date: string;
  type: "import-products" | "import-purchases" | "delete" | "reset";
  file: string; status: string;
}

function loadActivityLog(): ActivityEntry[] {
  try { return JSON.parse(localStorage.getItem(ACTIVITY_KEY) || "[]"); } catch { return []; }
}
function pushActivity(e: Omit<ActivityEntry, "id">) {
  const log = loadActivityLog();
  log.unshift({ ...e, id: `${Date.now()}` });
  try { localStorage.setItem(ACTIVITY_KEY, JSON.stringify(log.slice(0, 50))); } catch {}
}

interface PurchaseRow {
  idx: number; sku: string; name: string; quantity: string; unitPrice: string;
  supplier: string; invoiceNo: string; date: string; tax: string; discount: string;
  productId: number | null; errors: string[];
}

const ACTIVITY_STYLE: Record<ActivityEntry["type"], { label: string; cls: string }> = {
  "import-products":  { label: "استيراد أصناف",    cls: "bg-amber-500/15 text-amber-400"  },
  "import-purchases": { label: "استيراد مشتريات",  cls: "bg-violet-500/15 text-violet-400" },
  "delete":           { label: "حذف انتقائي",       cls: "bg-red-500/15 text-red-400"       },
  "reset":            { label: "إعادة تعيين",        cls: "bg-red-900/30 text-red-300"       },
};

/* ── Hook مشترك للعد التنازلي ── */
function useCountdown(trigger: boolean, seconds: number) {
  const [count,  setCount]  = useState(seconds);
  const [ready,  setReady]  = useState(false);
  useEffect(() => {
    if (!trigger) { setCount(seconds); setReady(false); return; }
    setCount(seconds); setReady(false);
    const iv = setInterval(() => {
      setCount(c => { if (c <= 1) { clearInterval(iv); setReady(true); return 0; } return c - 1; });
    }, 1000);
    return () => clearInterval(iv);
  }, [trigger, seconds]);
  return { count, ready };
}

export default function DataTab() {
  const { toast } = useToast();
  const qc        = useQueryClient();
  const resetDb   = useResetDatabase();

  /* ── Import subtab ── */
  const [importTab, setImportTab] = useState<"products" | "purchases">("products");

  /* ── استيراد الأصناف ── */
  const [prodImporting, setProdImporting] = useState(false);
  const [prodExporting, setProdExporting] = useState(false);
  const [prodResult,    setProdResult]    = useState<{ success: number; failed: number } | null>(null);
  const prodRef = useRef<HTMLInputElement>(null);

  /* ── استيراد المشتريات ── */
  const [purRows,       setPurRows]       = useState<PurchaseRow[]>([]);
  const [purParsed,     setPurParsed]     = useState(false);
  const [purLoading,    setPurLoading]    = useState(false);
  const [purConfirming, setPurConfirming] = useState(false);
  const [purResult,     setPurResult]     = useState<string | null>(null);
  const [purSupplier,   setPurSupplier]   = useState("");
  const [purPayType,    setPurPayType]    = useState<"cash" | "credit">("cash");
  const purRef = useRef<HTMLInputElement>(null);

  /* ── سجل العمليات ── */
  const [log, setLog] = useState<ActivityEntry[]>(() => loadActivityLog());
  const refreshLog = () => setLog(loadActivityLog());

  /* ── الحذف الانتقائي ── */
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [confirmText, setConfirmText] = useState("");
  const [clearBusy,   setClearBusy]   = useState(false);
  const readyToDelete = confirmText === "تأكيد الحذف" && selected.size > 0;
  const { count: delCount, ready: canDelete } = useCountdown(readyToDelete, 5);

  /* ── إعادة التعيين الكاملة ── */
  const [resetText, setResetText] = useState("");
  const readyToReset = resetText === "إعادة تعيين كاملة";
  const { count: resetCount, ready: canReset } = useCountdown(readyToReset, 10);

  /* ────────────────────────────────────────
     استيراد الأصناف
  ──────────────────────────────────────── */
  const handleProductsExport = async () => {
    setProdExporting(true);
    try {
      const prods = await authFetch(api("/api/products")).then(r => r.json()) as any[];
      const rows  = prods.map((p: any) => ({
        "اسم الصنف": p.name, "كود الصنف (SKU)": p.sku || "",
        "التصنيف": p.category || "", "الكمية": Number(p.quantity),
        "سعر التكلفة": Number(p.cost_price), "سعر البيع": Number(p.sale_price),
        "حد التنبيه": p.low_stock_threshold || "",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [{ wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "الأصناف");
      XLSX.writeFile(wb, `products-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast({ title: `تم تصدير ${prods.length} صنف` });
    } catch { toast({ title: "فشل التصدير", variant: "destructive" }); }
    finally { setProdExporting(false); }
  };

  const handleProductsImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setProdImporting(true); setProdResult(null);
    try {
      const rows = XLSX.utils.sheet_to_json(XLSX.read(await file.arrayBuffer()).Sheets[XLSX.read(await file.arrayBuffer()).SheetNames[0]]) as any[];
      let ok = 0, fail = 0;
      for (const row of rows) {
        const name = row["اسم الصنف"] || row["name"] || row["Name"];
        if (!name) { fail++; continue; }
        try {
          const r = await authFetch(api("/api/products"), {
            method: "POST",
            body: JSON.stringify({ name: String(name), sku: String(row["كود الصنف (SKU)"] || row["sku"] || ""), category: String(row["التصنيف"] || ""), quantity: Number(row["الكمية"] || 0), cost_price: Number(row["سعر التكلفة"] || 0), sale_price: Number(row["سعر البيع"] || 0), low_stock_threshold: row["حد التنبيه"] ? Number(row["حد التنبيه"]) : undefined }),
          });
          r.ok ? ok++ : fail++;
        } catch { fail++; }
      }
      setProdResult({ success: ok, failed: fail });
      pushActivity({ date: new Date().toISOString(), type: "import-products", file: file.name, status: `✅ ${ok} صنف${fail > 0 ? ` — ⚠️ ${fail} خطأ` : ""}` });
      refreshLog();
      toast({ title: `تم استيراد ${ok} صنف${fail > 0 ? ` — ${fail} فشل` : ""}` });
    } catch { toast({ title: "فشل قراءة الملف", variant: "destructive" }); }
    finally { setProdImporting(false); if (prodRef.current) prodRef.current.value = ""; }
  };

  const downloadProductsTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      { "اسم الصنف": "شاشة LCD", "كود الصنف (SKU)": "SCR001", "التصنيف": "قطع غيار", "الكمية": 10, "سعر التكلفة": 150, "سعر البيع": 200, "حد التنبيه": 5 },
      { "اسم الصنف": "بطارية أيفون", "كود الصنف (SKU)": "BAT002", "التصنيف": "بطاريات", "الكمية": 20, "سعر التكلفة": 80, "سعر البيع": 120, "حد التنبيه": 3 },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الأصناف");
    XLSX.writeFile(wb, "template-products.xlsx");
  };

  /* ────────────────────────────────────────
     استيراد المشتريات
  ──────────────────────────────────────── */
  const handlePurchaseFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setPurLoading(true); setPurParsed(false); setPurRows([]); setPurResult(null);
    try {
      const products: any[] = await authFetch(api("/api/products")).then(r => r.ok ? r.json() : []);
      const skuMap = new Map<string, { id: number; name: string }>();
      for (const p of products) if (p.sku) skuMap.set(String(p.sku).trim().toUpperCase(), { id: p.id, name: p.name });

      const raw   = XLSX.utils.sheet_to_json(XLSX.read(await file.arrayBuffer()).Sheets[XLSX.read(await file.arrayBuffer()).SheetNames[0]]) as any[];
      const rows: PurchaseRow[] = raw.map((r, idx) => {
        const sku = String(r["كود الصنف (SKU)"] || r["sku"] || "").trim();
        const name = String(r["اسم الصنف"] || r["name"] || "");
        const qty  = String(r["الكمية"]     || r["quantity"]   || "");
        const up   = String(r["سعر الشراء"] || r["unit_price"] || "");
        const errors: string[] = [];
        if (!sku) errors.push("كود مفقود"); else if (!skuMap.has(sku.toUpperCase())) errors.push(`كود غير موجود: ${sku}`);
        if (!qty || isNaN(+qty) || +qty <= 0) errors.push("كمية غير صالحة");
        if (!up  || isNaN(+up)  || +up  <= 0) errors.push("سعر غير صالح");
        const res = skuMap.get(sku.toUpperCase());
        return { idx, sku, name: name || res?.name || "", quantity: qty, unitPrice: up, supplier: String(r["المورد"] || ""), invoiceNo: String(r["رقم الفاتورة"] || ""), date: String(r["تاريخ الفاتورة"] || ""), tax: String(r["الضريبة%"] || "0"), discount: String(r["الخصم%"] || "0"), productId: res?.id ?? null, errors };
      });
      setPurRows(rows); setPurParsed(true);
      if (rows.length > 0 && rows[0].supplier) setPurSupplier(rows[0].supplier);
    } catch { toast({ title: "فشل قراءة الملف", variant: "destructive" }); }
    finally { setPurLoading(false); if (purRef.current) purRef.current.value = ""; }
  };

  const updatePurRow = (idx: number, field: "quantity" | "unitPrice", val: string) => {
    setPurRows(prev => prev.map(r => {
      if (r.idx !== idx) return r;
      const u = { ...r, [field]: val };
      const errors: string[] = [];
      if (!u.sku) errors.push("كود مفقود"); else if (!u.productId) errors.push("كود غير موجود");
      if (!u.quantity  || isNaN(+u.quantity)  || +u.quantity  <= 0) errors.push("كمية غير صالحة");
      if (!u.unitPrice || isNaN(+u.unitPrice) || +u.unitPrice <= 0) errors.push("سعر غير صالح");
      return { ...u, errors };
    }));
  };

  const validRows = purRows.filter(r => r.errors.length === 0);

  const handlePurchaseConfirm = async () => {
    if (!validRows.length) return;
    setPurConfirming(true);
    try {
      const items = validRows.map(r => {
        const qty = +r.quantity, price = +r.unitPrice;
        const net = price * (1 - +r.discount / 100);
        return { product_id: r.productId!, product_name: r.name, quantity: qty, unit_price: net, total_price: qty * net * (1 + +r.tax / 100) };
      });
      const total = items.reduce((s, i) => s + i.total_price, 0);
      const r = await authFetch(api("/api/purchases"), { method: "POST", body: JSON.stringify({ payment_type: purPayType, total_amount: total, paid_amount: purPayType === "credit" ? 0 : total, items, supplier_name: purSupplier || undefined, notes: `استيراد Excel — ${validRows.length} صنف` }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "فشل");
      const msg = `تم إنشاء فاتورة ${d.invoice_no} — ${validRows.length} صنف`;
      setPurResult(msg);
      pushActivity({ date: new Date().toISOString(), type: "import-purchases", file: "Excel", status: `✅ ${validRows.length} صنف — ${d.invoice_no}` });
      refreshLog();
      toast({ title: msg });
    } catch (err: any) { toast({ title: err.message || "فشل", variant: "destructive" }); }
    finally { setPurConfirming(false); }
  };

  const downloadPurchaseTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([{ "كود الصنف (SKU)": "SCR001", "اسم الصنف": "شاشة LCD", "الكمية": 10, "سعر الشراء": 150, "المورد": "مورد الشاشات", "تاريخ الفاتورة": "2024-01-15", "رقم الفاتورة": "INV-001", "الضريبة%": 14, "الخصم%": 0 }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "المشتريات");
    XLSX.writeFile(wb, "template-purchases.xlsx");
  };

  /* ────────────────────────────────────────
     الحذف الانتقائي
  ──────────────────────────────────────── */
  const toggle = (key: string) => {
    setSelected(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });
    setConfirmText(""); };
  const toggleAll = () => { setSelected(selected.size === DATA_GROUPS.length ? new Set() : new Set(DATA_GROUPS.map(g => g.key))); setConfirmText(""); };

  const handleClear = async () => {
    if (!canDelete) return;
    setClearBusy(true);
    const r = await authFetch(api("/api/admin/clear"), { method: "POST", body: JSON.stringify({ tables: Array.from(selected) }) });
    setClearBusy(false);
    const d = await r.json();
    if (!r.ok) { toast({ title: d.error ?? "فشل المسح", variant: "destructive" }); return; }
    toast({ title: `✅ تم مسح ${selected.size} جدول` });
    pushActivity({ date: new Date().toISOString(), type: "delete", file: Array.from(selected).join(", "), status: `✅ ${selected.size} جدول` });
    refreshLog(); setSelected(new Set()); setConfirmText(""); qc.invalidateQueries();
  };

  /* ────────────────────────────────────────
     إعادة التعيين الكاملة
  ──────────────────────────────────────── */
  const handleResetFull = () => {
    if (!canReset) return;
    resetDb.mutate({ confirm: "إعادة تعيين كاملة" }, {
      onSuccess: () => {
        toast({ title: "✅ تمت إعادة تعيين قاعدة البيانات" });
        pushActivity({ date: new Date().toISOString(), type: "reset", file: "—", status: "✅ إعادة تعيين كاملة" });
        refreshLog(); setResetText(""); qc.invalidateQueries();
      },
      onError: (e: any) => toast({ title: e?.message ?? "فشلت إعادة التعيين", variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader title="إدارة البيانات" sub="استيراد البيانات وإدارة قاعدة البيانات" />

      {/* ═══════════════════════════════════════════════════
          بطاقة 1 — الاستيراد
      ════════════════════════════════════════════════════ */}
      <div className="bg-[#111827] border border-white/8 rounded-2xl overflow-hidden">
        <div className="flex border-b border-white/8">
          {([
            ["products",  <Package className="w-4 h-4" />,      "استيراد الأصناف",    "Excel → مخزن"],
            ["purchases", <ShoppingCart className="w-4 h-4" />, "استيراد المشتريات",  "Excel → فاتورة"],
          ] as const).map(([id, icon, label, sub]) => (
            <button key={id} onClick={() => setImportTab(id)}
              className={`flex-1 flex items-center gap-2.5 px-4 py-3.5 text-right transition-all border-b-2 ${importTab === id ? "border-amber-400 bg-amber-500/5" : "border-transparent hover:bg-white/3"}`}>
              <span className={importTab === id ? "text-amber-400" : "text-white/30"}>{icon}</span>
              <div>
                <p className={`text-sm font-bold ${importTab === id ? "text-amber-400" : "text-white/50"}`}>{label}</p>
                <p className="text-white/25 text-xs">{sub}</p>
              </div>
            </button>
          ))}
        </div>

        {/* ── استيراد الأصناف ── */}
        {importTab === "products" && (
          <div className="p-5 space-y-4">
            {/* تصدير الحالي */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
              <div>
                <p className="text-emerald-400 font-bold text-sm">تصدير الأصناف الحالية</p>
                <p className="text-white/30 text-xs">تحميل جميع الأصناف كملف Excel</p>
              </div>
              <button onClick={handleProductsExport} disabled={prodExporting}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/25 rounded-xl text-emerald-400 font-bold text-xs transition-all disabled:opacity-40">
                {prodExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                {prodExporting ? "جاري التصدير..." : "تصدير Excel"}
              </button>
            </div>

            <div className="h-px bg-white/5" />

            {/* رفع ملف */}
            <div className="space-y-3">
              <p className="text-white/50 text-sm font-semibold">استيراد أصناف جديدة</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => prodRef.current?.click()} disabled={prodImporting}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/25 rounded-xl text-amber-400 font-bold text-xs transition-all disabled:opacity-40">
                  {prodImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {prodImporting ? "جاري الاستيراد..." : "رفع ملف Excel"}
                </button>
                <button onClick={downloadProductsTemplate} className="flex items-center gap-2 px-4 py-2 border border-white/10 hover:border-white/20 rounded-xl text-white/40 hover:text-white text-xs transition-all">
                  <Download className="w-3.5 h-3.5" /> نموذج فارغ
                </button>
              </div>
              <input ref={prodRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleProductsImport} />
              {prodResult && (
                <div className={`flex items-center gap-2 p-3 rounded-xl border text-xs ${prodResult.failed === 0 ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-amber-500/10 border-amber-500/20 text-amber-400"}`}>
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>تم استيراد <strong>{prodResult.success}</strong> صنف{prodResult.failed > 0 && <span className="text-red-400"> — فشل {prodResult.failed}</span>}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── استيراد المشتريات ── */}
        {importTab === "purchases" && (
          <div className="p-5 space-y-4">
            {!purParsed ? (
              <div className="space-y-3">
                <p className="text-white/50 text-sm">ارفع ملف Excel يحتوي بنود فاتورة المشتريات</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => purRef.current?.click()} disabled={purLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/25 rounded-xl text-violet-400 font-bold text-xs transition-all disabled:opacity-40">
                    {purLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    {purLoading ? "جاري القراءة..." : "رفع ملف Excel"}
                  </button>
                  <button onClick={downloadPurchaseTemplate} className="flex items-center gap-2 px-4 py-2 border border-white/10 hover:border-white/20 rounded-xl text-white/40 hover:text-white text-xs transition-all">
                    <Download className="w-3.5 h-3.5" /> نموذج فارغ
                  </button>
                </div>
                <input ref={purRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handlePurchaseFile} />
              </div>
            ) : (
              <>
                {/* ملخص + إلغاء */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-white/3 border border-white/8">
                  <div className="flex gap-4 text-sm">
                    <span className="text-emerald-400 font-bold">{validRows.length} صحيح ✓</span>
                    {purRows.filter(r => r.errors.length > 0).length > 0 && (
                      <span className="text-red-400 font-bold">{purRows.filter(r => r.errors.length > 0).length} خطأ ✗</span>
                    )}
                  </div>
                  <button onClick={() => { setPurParsed(false); setPurRows([]); setPurResult(null); }} className="text-xs text-white/35 hover:text-white transition-colors">إلغاء</button>
                </div>

                {/* إعدادات الفاتورة */}
                <div className="grid grid-cols-2 gap-3">
                  <div><FieldLabel>المورد (اختياري)</FieldLabel><SInput placeholder="اسم المورد" value={purSupplier} onChange={e => setPurSupplier(e.target.value)} /></div>
                  <div><FieldLabel>طريقة الدفع</FieldLabel>
                    <SSelect value={purPayType} onChange={e => setPurPayType(e.target.value as "cash" | "credit")}>
                      <option value="cash">نقدي</option><option value="credit">آجل</option>
                    </SSelect>
                  </div>
                </div>

                {/* جدول المعاينة */}
                <div className="overflow-x-auto rounded-xl border border-white/8">
                  <table className="w-full text-xs min-w-[480px]">
                    <thead>
                      <tr className="bg-white/3 border-b border-white/8">
                        {["SKU", "الصنف", "الكمية", "السعر", "الإجمالي", "الحالة"].map(h => (
                          <th key={h} className="px-3 py-2.5 text-right text-white/35 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {purRows.map(r => {
                        const hasErr = r.errors.length > 0;
                        const total  = (+r.quantity || 0) * (+r.unitPrice || 0);
                        return (
                          <tr key={r.idx} className={`border-b border-white/4 ${hasErr ? "bg-red-500/5" : "hover:bg-white/2"}`}>
                            <td className="px-3 py-2 text-white/40 font-mono">{r.sku || "—"}</td>
                            <td className="px-3 py-2 text-white/60 max-w-[100px] truncate">{r.name || "—"}</td>
                            <td className="px-3 py-2">
                              <input type="number" value={r.quantity} onChange={e => updatePurRow(r.idx, "quantity", e.target.value)}
                                className={`w-16 px-2 py-1 rounded-lg bg-white/5 border text-white text-center text-xs outline-none ${!r.quantity || +r.quantity <= 0 ? "border-red-500/50" : "border-white/10"}`} />
                            </td>
                            <td className="px-3 py-2">
                              <input type="number" value={r.unitPrice} onChange={e => updatePurRow(r.idx, "unitPrice", e.target.value)}
                                className={`w-20 px-2 py-1 rounded-lg bg-white/5 border text-white text-center text-xs outline-none ${!r.unitPrice || +r.unitPrice <= 0 ? "border-red-500/50" : "border-white/10"}`} />
                            </td>
                            <td className="px-3 py-2 text-white/45 font-mono">{isNaN(total) ? "—" : total.toFixed(2)}</td>
                            <td className="px-3 py-2">
                              {hasErr ? <span className="text-red-400 text-[10px]" title={r.errors.join(" | ")}>✗ {r.errors[0]}</span> : <span className="text-emerald-400 text-[10px]">✓ صالح</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* إجمالي */}
                {validRows.length > 0 && (
                  <div className="flex justify-between items-center px-4 py-3 rounded-xl bg-white/3 border border-white/8">
                    <span className="text-white/40 text-sm">إجمالي الفاتورة</span>
                    <span className="text-amber-400 font-black text-lg">
                      {validRows.reduce((s, r) => s + (+r.quantity || 0) * (+r.unitPrice || 0), 0).toFixed(2)}
                    </span>
                  </div>
                )}

                {purResult && <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm"><CheckCircle2 className="w-4 h-4" />{purResult}</div>}

                <button onClick={handlePurchaseConfirm} disabled={purConfirming || !validRows.length}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/25 rounded-xl text-violet-300 font-bold text-sm transition-all disabled:opacity-40">
                  {purConfirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {purConfirming ? "جاري إنشاء الفاتورة..." : `تأكيد استيراد ${validRows.length} صنف وإنشاء فاتورة`}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════
          بطاقة 2 — سجل العمليات
      ════════════════════════════════════════════════════ */}
      <div className="bg-[#111827] border border-white/5 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center">
              <History className="w-4 h-4 text-white/35" />
            </div>
            <div>
              <p className="font-bold text-white text-sm">سجل العمليات</p>
              <p className="text-white/30 text-xs">آخر {log.length} عملية</p>
            </div>
          </div>
          {log.length > 0 && (
            <button onClick={() => { localStorage.removeItem(ACTIVITY_KEY); setLog([]); }} className="text-xs text-white/20 hover:text-red-400 transition-colors">مسح السجل</button>
          )}
        </div>

        {log.length === 0 ? (
          <div className="py-8 text-center text-white/20 text-sm">لا توجد عمليات مسجلة بعد</div>
        ) : (
          <div className="divide-y divide-white/4">
            {log.map(e => {
              const s = ACTIVITY_STYLE[e.type];
              return (
                <div key={e.id} className="flex items-center gap-4 px-5 py-3 hover:bg-white/2 transition-colors">
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${s.cls}`}>{s.label}</span>
                  <span className="text-white/35 text-xs font-mono shrink-0">{new Date(e.date).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}</span>
                  <span className="text-white/40 text-xs truncate flex-1">{e.file}</span>
                  <span className="text-white/45 text-xs shrink-0">{e.status}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════
          بطاقة 3 — منطقة الخطر
      ════════════════════════════════════════════════════ */}
      <div className="bg-[#111827] border border-red-500/25 rounded-2xl overflow-hidden">
        {/* رأس منطقة الخطر */}
        <div className="px-5 py-4 border-b border-red-500/15 bg-red-500/5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-red-500/15 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <div>
            <p className="font-bold text-red-400 text-sm">منطقة الخطر</p>
            <p className="text-red-400/50 text-xs">العمليات هنا لا يمكن التراجع عنها — تأكد من نسخة احتياطية أولاً</p>
          </div>
        </div>

        <div className="p-5 space-y-6">
          {/* ── الحذف الانتقائي ── */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-white/60 text-sm font-semibold flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-red-400/70" /> حذف انتقائي
                {selected.size > 0 && <span className="px-2 py-0.5 rounded-md bg-red-500/20 text-red-400 text-xs font-bold">{selected.size} محدد</span>}
              </p>
              <button onClick={toggleAll} className="text-xs text-amber-400 hover:text-amber-300 transition-colors">
                {selected.size === DATA_GROUPS.length ? "إلغاء الكل" : "تحديد الكل"}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {DATA_GROUPS.map(g => {
                const on = selected.has(g.key);
                return (
                  <button key={g.key} onClick={() => toggle(g.key)}
                    className={`p-3 rounded-xl text-right border transition-all ${on ? "bg-red-500/12 border-red-500/35" : "bg-[#1A2235] border-[#2D3748] hover:border-red-500/20"}`}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={`text-xs font-bold ${on ? "text-red-300" : "text-white/60"}`}>{g.label}</span>
                      {on ? <Check className="w-3 h-3 text-red-400" /> : <div className="w-3 h-3 rounded border border-white/15" />}
                    </div>
                    <p className="text-white/20 text-[10px]">{g.sub}</p>
                  </button>
                );
              })}
            </div>

            {selected.size > 0 && (
              <div className="space-y-3 pt-2 border-t border-red-500/10">
                <div>
                  <label className="text-white/45 text-xs block mb-2">اكتب <span className="text-red-400 font-black">"تأكيد الحذف"</span> لتفعيل الزر:</label>
                  <SInput placeholder="تأكيد الحذف" value={confirmText} onChange={e => setConfirmText(e.target.value)} className="border-red-500/20 focus:border-red-500/50" />
                </div>
                {readyToDelete && !canDelete && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/8 border border-red-500/15">
                    <Loader2 className="w-3.5 h-3.5 text-red-400 animate-spin" />
                    <p className="text-red-400 text-xs">يمكنك الحذف بعد <span className="font-black">{delCount}</span> ثانية...</p>
                  </div>
                )}
                <DangerBtn onClick={handleClear} disabled={clearBusy || !canDelete} className="w-full">
                  {clearBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {clearBusy ? "جاري المسح..." : `مسح ${selected.size} جدول`}
                </DangerBtn>
              </div>
            )}
          </div>

          <div className="h-px bg-red-500/10" />

          {/* ── إعادة التعيين الكاملة ── */}
          <div className="space-y-3">
            <div>
              <p className="text-red-300 font-semibold text-sm flex items-center gap-2">
                <X className="w-4 h-4" /> إعادة تعيين كاملة لقاعدة البيانات
              </p>
              <p className="text-red-300/40 text-xs mt-0.5">حذف جميع البيانات والإعادة للوضع الافتراضي</p>
            </div>
            <div>
              <label className="text-white/40 text-xs block mb-2">اكتب <span className="text-red-400 font-black">"إعادة تعيين كاملة"</span> لتفعيل الأمر:</label>
              <SInput placeholder="إعادة تعيين كاملة" value={resetText} onChange={e => setResetText(e.target.value)} className="border-red-800/30 focus:border-red-600/50" />
            </div>
            {readyToReset && !canReset && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/8 border border-red-500/15">
                <Loader2 className="w-3.5 h-3.5 text-red-400 animate-spin" />
                <p className="text-red-400 text-xs">سيتم التنفيذ بعد <span className="font-black">{resetCount}</span> ثانية...</p>
              </div>
            )}
            <button onClick={handleResetFull} disabled={resetDb.isPending || !canReset}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-900/25 hover:bg-red-900/40 border border-red-800/35 text-red-300 font-bold text-sm transition-all disabled:opacity-35">
              {resetDb.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
              {resetDb.isPending ? "جاري إعادة التعيين..." : "إعادة تعيين كاملة"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
