import { useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWarehouse } from "@/contexts/warehouse";
import { useAuth } from "@/contexts/auth";
import { hasPermission } from "@/lib/permissions";
import { formatCurrency } from "@/lib/format";
import {
  Package, AlertTriangle, TrendingDown, Search, X, RefreshCw,
  ChevronUp, ChevronDown, Edit3, ShieldX, ClipboardList, Truck,
  Plus, Trash2, CheckCircle, Warehouse, Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TableSkeleton } from "@/components/skeletons";
import { safeArray } from "@/lib/safe-data";
import {
  useGetSettingsWarehouses,
  useCreateSettingsWarehouse,
  useDeleteSettingsWarehouse,
} from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface AuditProduct {
  id: number; name: string; sku: string | null; category: string | null;
  actual_qty: number; cost_price: number; sale_price: number;
  low_stock_threshold: number | null; opening_qty: number; purchased_qty: number;
  sold_qty: number; sale_return_qty: number; purchase_return_qty: number;
  adjustment_qty: number; calculated_qty: number; discrepancy: number; total_value: number;
}
interface AuditSummary {
  total_products: number; total_inventory_value: number;
  low_stock_count: number; zero_stock_count: number;
}
interface StockMovement {
  id: number; product_id: number; product_name: string; movement_type: string;
  quantity: number; quantity_before: number; quantity_after: number;
  unit_cost: number; reference_type: string | null; reference_id: number | null;
  reference_no: string | null; notes: string | null; date: string | null; created_at: string;
}
interface ProductDetail {
  product: { id: number; name: string; sku: string | null; quantity: number; cost_price: number; sale_price: number };
  movements: StockMovement[]; calculated_qty: number; actual_qty: number;
  discrepancy: number; breakdown: Record<string, number>; formula: string;
}
interface CountSession {
  id: number; warehouse_id: number; status: string; notes: string | null;
  created_at: string; applied_at: string | null;
}
interface StockTransfer {
  id: number; from_warehouse_id: number; to_warehouse_id: number;
  status: string; notes: string | null; created_at: string;
}

const movementTypeLabel: Record<string, { label: string; color: string }> = {
  opening_balance: { label: "رصيد افتتاحي",  color: "bg-blue-500/20 text-blue-300" },
  purchase:        { label: "مشتريات",        color: "bg-emerald-500/20 text-emerald-300" },
  sale:            { label: "مبيعات",          color: "bg-red-500/20 text-red-300" },
  sale_return:     { label: "مرتجع مبيعات",   color: "bg-teal-500/20 text-teal-300" },
  purchase_return: { label: "مرتجع مشتريات",  color: "bg-orange-500/20 text-orange-300" },
  adjustment:      { label: "تسوية يدوية",    color: "bg-violet-500/20 text-violet-300" },
  transfer_out:    { label: "تحويل خروج",     color: "bg-amber-500/20 text-amber-300" },
  transfer_in:     { label: "تحويل دخول",     color: "bg-cyan-500/20 text-cyan-300" },
};

type Tab = "review" | "count" | "transfer";

/* ─── helpers ──────────────────────────────────────────────────────────────── */
function today() { return new Date().toISOString().slice(0, 10); }
function nowTime() { return new Date().toTimeString().slice(0, 5); }

/* ═══════════════════════════════════════════════════════════════════════════
 * Main Component
 * ═══════════════════════════════════════════════════════════════════════════ */
export default function Inventory() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { currentWarehouseId } = useWarehouse();
  const canViewInventory   = hasPermission(user, "can_view_inventory")   === true;
  const canAdjustInventory = hasPermission(user, "can_adjust_inventory") === true;
  const isAdmin = user?.role === "admin";

  const [activeTab, setActiveTab] = useState<Tab>("review");

  /* ── warehouse CRUD ── */
  const { data: warehousesRaw, isLoading: loadingWH } = useGetSettingsWarehouses();
  const warehouses = safeArray(warehousesRaw) as { id: number; name: string; address: string | null; created_at: string }[];
  const createWH = useCreateSettingsWarehouse();
  const deleteWH = useDeleteSettingsWarehouse();

  const [showAddWH, setShowAddWH]               = useState(false);
  const [deleteWHTarget, setDeleteWHTarget]     = useState<{ id: number; name: string } | null>(null);
  const [whForm, setWhForm]                     = useState({ name: "", address: "" });

  const invalidateWH = () => qc.invalidateQueries({ queryKey: ["/api/settings/warehouses"] });

  if (!canViewInventory) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center" dir="rtl">
        <ShieldX className="w-16 h-16 text-red-400/50 mb-4" />
        <h2 className="text-xl font-bold text-white/80 mb-2">غير مصرح بالوصول</h2>
        <p className="text-white/40 text-sm">ليس لديك صلاحية لعرض صفحة المخزون</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 text-right" dir="rtl">

      {/* ══════════════════════════════════════════════════════
          قسم إدارة المخازن
          ══════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">المخازن</h2>
            <p className="text-white/40 text-sm mt-0.5">أضف وأدر مواقع التخزين</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => { setWhForm({ name: "", address: "" }); setShowAddWH(true); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-violet-500/20 border border-violet-500/30 text-violet-300 hover:bg-violet-500/30 transition-all"
            >
              <Plus className="w-4 h-4" /> إضافة مخزن
            </button>
          )}
        </div>

        {loadingWH ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2].map(i => (
              <div key={i} className="h-28 bg-white/5 border border-white/5 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : warehouses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center bg-white/3 border border-white/5 rounded-2xl">
            <Warehouse className="w-10 h-10 text-white/15 mb-3" />
            <p className="text-white/40 font-bold">لا توجد مخازن بعد</p>
            {isAdmin && (
              <button onClick={() => { setWhForm({ name: "", address: "" }); setShowAddWH(true); }}
                className="mt-3 px-4 py-2 rounded-xl text-sm font-bold bg-violet-500/20 border border-violet-500/30 text-violet-300 hover:bg-violet-500/30 transition-all">
                إضافة أول مخزن
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {warehouses.map(w => (
              <div key={w.id}
                className="group relative bg-[#111827] border border-white/5 hover:border-violet-500/20 rounded-2xl p-5 transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
                {/* Delete button */}
                {isAdmin && (
                  <button
                    onClick={() => setDeleteWHTarget({ id: w.id, name: w.name })}
                    className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"
                    title="حذف المخزن"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center mb-3">
                  <Warehouse className="w-5 h-5 text-violet-400" />
                </div>
                <p className="text-white font-bold text-sm">{w.name}</p>
                {w.address && <p className="text-white/40 text-xs mt-1 truncate">{w.address}</p>}
                {currentWarehouseId === w.id && (
                  <span className="inline-block mt-2 px-2 py-0.5 rounded-lg text-xs bg-violet-500/20 text-violet-300 font-medium">
                    المخزن الحالي
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ══════════════════════════════════════════════════════
          تبويبات المخزون
          ══════════════════════════════════════════════════════ */}
      <div>
        <div className="flex gap-2 border-b border-white/10 mb-6">
          <TabBtn id="review"   label="مراجعة المخزون" icon={<Package className="w-4 h-4" />}      active={activeTab} onClick={setActiveTab} />
          {canAdjustInventory && (
            <TabBtn id="count"  label="جرد المخزون"    icon={<ClipboardList className="w-4 h-4" />} active={activeTab} onClick={setActiveTab} />
          )}
          {canAdjustInventory && (
            <TabBtn id="transfer" label="تحويل مخزون"  icon={<Truck className="w-4 h-4" />}         active={activeTab} onClick={setActiveTab} />
          )}
        </div>

        {activeTab === "review"   && <ReviewTab currentWarehouseId={currentWarehouseId} canAdjustInventory={canAdjustInventory} qc={qc} toast={toast} />}
        {activeTab === "count"    && <CountTab  warehouses={warehouses} currentWarehouseId={currentWarehouseId} qc={qc} toast={toast} />}
        {activeTab === "transfer" && <TransferTab warehouses={warehouses} qc={qc} toast={toast} />}
      </div>

      {/* ── Add Warehouse Modal ── */}
      {showAddWH && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowAddWH(false)}>
          <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Warehouse className="w-5 h-5 text-violet-400" /> إضافة مخزن جديد
              </h3>
              <button onClick={() => setShowAddWH(false)} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"><X className="w-4 h-4 text-white/60" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-white/60 text-xs mb-1.5">اسم المخزن *</label>
                <input type="text" className="glass-input" placeholder="المخزن الرئيسي"
                  value={whForm.name} onChange={e => setWhForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-white/60 text-xs mb-1.5">العنوان (اختياري)</label>
                <input type="text" className="glass-input" placeholder="القاهرة، مصر"
                  value={whForm.address} onChange={e => setWhForm(f => ({ ...f, address: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                disabled={createWH.isPending}
                onClick={() => {
                  if (!whForm.name.trim()) { toast({ title: "الاسم مطلوب", variant: "destructive" }); return; }
                  createWH.mutate({ name: whForm.name, address: whForm.address || undefined }, {
                    onSuccess: () => { invalidateWH(); toast({ title: "✅ تم إضافة المخزن" }); setShowAddWH(false); },
                    onError: (e: any) => toast({ title: e?.message ?? "فشل الإضافة", variant: "destructive" }),
                  });
                }}
                className="flex-1 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2">
                {createWH.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                إضافة
              </button>
              <button onClick={() => setShowAddWH(false)} className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/60 font-bold text-sm transition-colors">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Warehouse Modal ── */}
      {deleteWHTarget && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDeleteWHTarget(null)}>
          <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center" onClick={e => e.stopPropagation()}>
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
              <Warehouse className="w-7 h-7 text-red-400" />
            </div>
            <h3 className="text-white font-bold text-lg mb-1">حذف المخزن</h3>
            <p className="text-white/50 text-sm mb-1">
              هل تريد حذف <span className="text-red-400 font-bold">"{deleteWHTarget.name}"</span>؟
            </p>
            <p className="text-white/30 text-xs mb-6">لا يمكن حذف مخزن له حركات أو جلسات جرد أو تحويلات مسجّلة</p>
            <div className="flex gap-3">
              <button
                disabled={deleteWH.isPending}
                onClick={() => deleteWH.mutate(deleteWHTarget.id, {
                  onSuccess: () => { invalidateWH(); toast({ title: "تم حذف المخزن" }); setDeleteWHTarget(null); },
                  onError: (e: any) => { toast({ title: e?.message ?? "فشل الحذف", variant: "destructive" }); setDeleteWHTarget(null); },
                })}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2">
                {deleteWH.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                حذف
              </button>
              <button onClick={() => setDeleteWHTarget(null)} className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/60 font-bold text-sm transition-colors">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── TabBtn ─────────────────────────────────────────────────────────────── */
function TabBtn({ id, label, icon, active, onClick }: {
  id: Tab; label: string; icon: React.ReactNode; active: Tab; onClick: (t: Tab) => void;
}) {
  const isActive = id === active;
  return (
    <button
      onClick={() => onClick(id)}
      className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold border-b-2 transition-colors -mb-px ${
        isActive ? "border-violet-400 text-violet-300" : "border-transparent text-white/50 hover:text-white/80"
      }`}
    >
      {icon}{label}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * TAB 1 — مراجعة المخزون
 * ═══════════════════════════════════════════════════════════════════════════ */
function ReviewTab({ currentWarehouseId, canAdjustInventory, qc, toast }: {
  currentWarehouseId: number | null; canAdjustInventory: boolean;
  qc: ReturnType<typeof useQueryClient>; toast: ReturnType<typeof useToast>["toast"];
}) {
  const [search, setSearch]               = useState("");
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  const [sortKey, setSortKey]             = useState<keyof AuditProduct>("name");
  const [sortAsc, setSortAsc]             = useState(true);
  const [showAdjust, setShowAdjust]       = useState<number | null>(null);
  const [adjustQty, setAdjustQty]         = useState("");
  const [adjustNotes, setAdjustNotes]     = useState("");

  const warehouseParam = currentWarehouseId ? `?warehouse_id=${currentWarehouseId}` : "";

  const { data: auditData, isLoading, refetch } = useQuery<{ products: AuditProduct[]; summary: AuditSummary }>({
    queryKey: ["inventory-audit", currentWarehouseId],
    queryFn: () => authFetch(api(`/api/inventory/audit${warehouseParam}`)).then(r => { if (!r.ok) throw new Error("خطأ في جلب البيانات"); return r.json(); }),
  });

  const { data: productDetail } = useQuery<ProductDetail>({
    queryKey: ["inventory-product", selectedProduct],
    queryFn: () => authFetch(api(`/api/inventory/product/${selectedProduct}`)).then(r => { if (!r.ok) throw new Error("خطأ"); return r.json(); }),
    enabled: selectedProduct !== null,
  });

  const adjustMutation = useMutation({
    mutationFn: ({ product_id, new_quantity, notes }: { product_id: number; new_quantity: number; notes: string }) =>
      authFetch(api("/api/inventory/adjustment"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id, new_quantity, notes }),
      }).then(r => { if (!r.ok) throw new Error("خطأ"); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-audit"] });
      qc.invalidateQueries({ queryKey: ["inventory-product"] });
      setShowAdjust(null); setAdjustQty(""); setAdjustNotes("");
      toast({ title: "تم تعديل المخزون بنجاح" });
    },
    onError: () => toast({ title: "حدث خطأ أثناء تعديل المخزون", variant: "destructive" }),
  });

  const products = auditData?.products ?? [];
  const summary  = auditData?.summary;

  const filtered = products
    .filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (p.category ?? "").toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const va = a[sortKey]; const vb = b[sortKey];
      if (typeof va === "string" && typeof vb === "string")
        return sortAsc ? va.localeCompare(vb, "ar") : vb.localeCompare(va, "ar");
      return sortAsc ? Number(va) - Number(vb) : Number(vb) - Number(va);
    });

  function toggleSort(key: keyof AuditProduct) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  }

  const SortIcon = ({ k }: { k: keyof AuditProduct }) =>
    sortKey === k ? (sortAsc ? <ChevronUp className="w-3 h-3 inline ms-1" /> : <ChevronDown className="w-3 h-3 inline ms-1" />) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-2 text-xs">
          {[
            { c: "bg-blue-500/20 text-blue-300",    t: "↑ افتتاحي" },
            { c: "bg-emerald-500/20 text-emerald-300", t: "↑ مشتريات" },
            { c: "bg-teal-500/20 text-teal-300",    t: "↑ مرتجع مبيعات" },
            { c: "bg-red-500/20 text-red-300",      t: "↓ مبيعات" },
            { c: "bg-orange-500/20 text-orange-300",t: "↓ مرتجع مشتريات" },
            { c: "bg-violet-500/20 text-violet-300",t: "± تسوية" },
            { c: "bg-amber-500/20 text-amber-300",  t: "↓ خروج" },
            { c: "bg-cyan-500/20 text-cyan-300",    t: "↑ دخول" },
          ].map(b => <span key={b.t} className={`px-2 py-1 rounded-lg ${b.c}`}>{b.t}</span>)}
        </div>
        <button onClick={() => refetch()} className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-xl transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> تحديث
        </button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard label="إجمالي المنتجات"  value={String(summary.total_products)}   color="text-white" />
          <SummaryCard label="قيمة المخزون"      value={formatCurrency(summary.total_inventory_value)} color="text-emerald-400" />
          <SummaryCard label="تحت حد الطلب"     value={String(summary.low_stock_count)}  color={summary.low_stock_count > 0  ? "text-amber-400" : "text-white/40"} />
          <SummaryCard label="نفد المخزون"       value={String(summary.zero_stock_count)} color={summary.zero_stock_count > 0 ? "text-red-400"   : "text-white/40"} />
        </div>
      )}

      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث عن منتج..."
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 pe-10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20" />
        {search && <button onClick={() => setSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"><X className="w-4 h-4" /></button>}
      </div>

      {isLoading ? (
        <div className="overflow-x-auto rounded-2xl border border-white/10"><table className="w-full text-sm min-w-[1100px]"><tbody><TableSkeleton cols={12} rows={7} /></tbody></table></div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                {([
                  { key: "name"              as const, label: "المنتج" },
                  { key: "opening_qty"       as const, label: "افتتاحي" },
                  { key: "purchased_qty"     as const, label: "وارد" },
                  { key: "sale_return_qty"   as const, label: "مرتجع مبيعات" },
                  { key: "sold_qty"          as const, label: "صادر" },
                  { key: "purchase_return_qty" as const, label: "مرتجع مشتريات" },
                  { key: "calculated_qty"    as const, label: "محسوب" },
                  { key: "actual_qty"        as const, label: "فعلي" },
                  { key: "discrepancy"       as const, label: "فرق" },
                  { key: "cost_price"        as const, label: "تكلفة" },
                  { key: "total_value"       as const, label: "قيمة المخزون" },
                ] as { key: keyof AuditProduct; label: string }[]).map(col => (
                  <th key={col.key} onClick={() => toggleSort(col.key)}
                    className="p-3 text-right text-white/60 font-medium cursor-pointer hover:text-white/90 select-none whitespace-nowrap">
                    {col.label}<SortIcon k={col.key} />
                  </th>
                ))}
                <th className="p-3 text-right text-white/60 font-medium">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const isLow  = p.low_stock_threshold !== null && p.actual_qty <= p.low_stock_threshold;
                const isZero = p.actual_qty <= 0;
                const hasDisc = Math.abs(p.discrepancy) > 0.001;
                return (
                  <tr key={p.id} className="border-b border-white/5 erp-table-row">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {isZero ? <TrendingDown className="w-4 h-4 text-red-400 shrink-0" /> :
                          isLow ? <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" /> :
                          <Package className="w-4 h-4 text-white/30 shrink-0" />}
                        <div>
                          <div className="text-white font-medium">{p.name}</div>
                          {p.sku && <div className="text-white/40 text-xs">{p.sku}</div>}
                          {p.category && <div className="text-white/30 text-xs">{p.category}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-blue-300 font-mono">{p.opening_qty > 0 ? `+${p.opening_qty}` : "—"}</td>
                    <td className="p-3 text-emerald-400 font-mono">{p.purchased_qty > 0 ? `+${p.purchased_qty}` : "—"}</td>
                    <td className="p-3 text-teal-300 font-mono">{p.sale_return_qty > 0 ? `+${p.sale_return_qty}` : "—"}</td>
                    <td className="p-3 text-red-400 font-mono">{p.sold_qty > 0 ? `-${p.sold_qty}` : "—"}</td>
                    <td className="p-3 text-orange-300 font-mono">{p.purchase_return_qty > 0 ? `-${p.purchase_return_qty}` : "—"}</td>
                    <td className="p-3 font-bold text-white font-mono">{p.calculated_qty.toFixed(2)}</td>
                    <td className="p-3 font-bold font-mono">
                      <span className={isZero ? "text-red-400" : isLow ? "text-amber-400" : "text-emerald-400"}>
                        {p.actual_qty.toFixed(2)}
                      </span>
                    </td>
                    <td className="p-3 font-mono">
                      {hasDisc
                        ? <span className="text-red-400 font-bold">{p.discrepancy > 0 ? `+${p.discrepancy.toFixed(2)}` : p.discrepancy.toFixed(2)}</span>
                        : <span className="text-emerald-400">✓</span>}
                    </td>
                    <td className="p-3 text-white/70">{formatCurrency(p.cost_price)}</td>
                    <td className="p-3 text-white font-bold">{formatCurrency(p.total_value)}</td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <button onClick={() => setSelectedProduct(p.id)}
                          className="px-2 py-1 text-xs bg-blue-500/20 text-blue-300 rounded-lg hover:bg-blue-500/30 transition-colors whitespace-nowrap">
                          الحركات
                        </button>
                        {canAdjustInventory && (
                          <button onClick={() => { setShowAdjust(p.id); setAdjustQty(String(p.actual_qty)); setAdjustNotes(""); }}
                            className="px-2 py-1 text-xs bg-violet-500/20 text-violet-300 rounded-lg hover:bg-violet-500/30 transition-colors">
                            <Edit3 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={12} className="text-center text-white/40 py-12">لا توجد منتجات</td></tr>
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t border-white/20 bg-white/5">
                  <td className="p-3 text-white/60 font-bold" colSpan={10}>المجموع</td>
                  <td className="p-3 text-white font-bold">{formatCurrency(filtered.reduce((s, p) => s + p.total_value, 0))}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* مودال تفاصيل حركات منتج */}
      {selectedProduct && productDetail && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-12 px-4"
          onClick={() => setSelectedProduct(null)}>
          <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 w-full max-w-3xl max-h-[80vh] overflow-y-auto shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">{productDetail.product.name}</h2>
                <p className="text-xs text-white/40 mt-1 font-mono">{productDetail.formula}</p>
              </div>
              <button onClick={() => setSelectedProduct(null)} className="text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: "كمية محسوبة", val: productDetail.calculated_qty.toFixed(2), cls: "text-white" },
                { label: "كمية فعلية",  val: productDetail.actual_qty.toFixed(2),    cls: productDetail.actual_qty <= 0 ? "text-red-400" : "text-emerald-400" },
                { label: "فرق",         val: Math.abs(productDetail.discrepancy) > 0.001 ? productDetail.discrepancy.toFixed(2) : "✓ صفر",
                  cls: Math.abs(productDetail.discrepancy) > 0.001 ? "text-red-400" : "text-emerald-400" },
              ].map(c => (
                <div key={c.label} className="bg-white/5 rounded-xl p-3 text-center">
                  <div className="text-xs text-white/40">{c.label}</div>
                  <div className={`text-xl font-bold ${c.cls}`}>{c.val}</div>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-white/60 mb-2">سجل الحركات ({productDetail.movements.length})</h3>
              {productDetail.movements.length === 0 && <p className="text-white/30 text-sm text-center py-4">لا توجد حركات مسجّلة</p>}
              {productDetail.movements.map(m => {
                const mt = movementTypeLabel[m.movement_type] ?? { label: m.movement_type, color: "bg-white/10 text-white/60" };
                const qtyNum = Number(m.quantity);
                const isIn = qtyNum > 0;
                return (
                  <div key={m.id} className="flex items-start gap-3 bg-white/5 rounded-xl p-3">
                    <div className={`shrink-0 px-2 py-0.5 rounded-lg text-xs font-medium ${mt.color}`}>{mt.label}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`font-bold font-mono text-sm ${isIn ? "text-emerald-400" : "text-red-400"}`}>
                          {isIn ? "+" : ""}{qtyNum.toFixed(3)}
                        </span>
                        <span className="text-white/30 text-xs font-mono">
                          {m.quantity_before.toFixed(2)} → {m.quantity_after.toFixed(2)}
                        </span>
                      </div>
                      <div className="text-white/50 text-xs mt-0.5 flex gap-3">
                        {m.reference_no && <span className="font-mono">{m.reference_no}</span>}
                        {m.date && <span>{m.date}</span>}
                        {m.notes && <span className="truncate">{m.notes}</span>}
                      </div>
                    </div>
                    <div className="text-white/30 text-xs shrink-0">{formatCurrency(Number(m.unit_cost))}/وحدة</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* مودال التسوية اليدوية */}
      {showAdjust !== null && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center px-4"
          onClick={() => setShowAdjust(null)}>
          <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-4">تسوية يدوية للمخزون</h2>
            {(() => {
              const p = products.find(x => x.id === showAdjust);
              return p ? (
                <>
                  <p className="text-white/60 text-sm mb-4">{p.name} — الكمية الحالية: <span className="text-white font-bold">{p.actual_qty}</span></p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-white/50 mb-1 block">الكمية الجديدة</label>
                      <input type="number" value={adjustQty} onChange={e => setAdjustQty(e.target.value)} min="0" step="0.001"
                        className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-400/50" />
                    </div>
                    <div>
                      <label className="text-xs text-white/50 mb-1 block">سبب التسوية</label>
                      <input type="text" value={adjustNotes} onChange={e => setAdjustNotes(e.target.value)} placeholder="مثال: كسر أثناء النقل"
                        className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-violet-400/50" />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => {
                          const qty = parseFloat(adjustQty);
                          if (isNaN(qty) || qty < 0) { toast({ title: "الكمية غير صالحة", variant: "destructive" }); return; }
                          adjustMutation.mutate({ product_id: showAdjust!, new_quantity: qty, notes: adjustNotes });
                        }}
                        disabled={adjustMutation.isPending}
                        className="flex-1 py-2 bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-white rounded-xl font-medium transition-colors">
                        {adjustMutation.isPending ? "جاري الحفظ..." : "تأكيد التسوية"}
                      </button>
                      <button onClick={() => setShowAdjust(null)} className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors">إلغاء</button>
                    </div>
                  </div>
                </>
              ) : null;
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * TAB 2 — جرد المخزون (Enhanced)
 * ═══════════════════════════════════════════════════════════════════════════ */
function CountTab({ warehouses, currentWarehouseId, qc, toast }: {
  warehouses: { id: number; name: string }[];
  currentWarehouseId: number | null;
  qc: ReturnType<typeof useQueryClient>;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const defaultWH = warehouses.length > 0 ? (warehouses.find(w => w.id === currentWarehouseId)?.id ?? warehouses[0].id) : 0;
  const [selectedWarehouse, setSelectedWarehouse] = useState<number>(defaultWH);
  const [countDate, setCountDate]   = useState(today());
  const [countTime, setCountTime]   = useState(nowTime());
  const [sessionNotes, setSessionNotes] = useState("");
  const [countMode, setCountMode]   = useState<"full" | "partial">("full");
  const [physicalQtys, setPhysicalQtys] = useState<Record<number, string>>({});
  const [itemNotes, setItemNotes]   = useState<Record<number, string>>({});
  const [sessionView, setSessionView] = useState<"new" | "history">("new");
  const [applyingId, setApplyingId] = useState<number | null>(null);

  const warehouseParam = selectedWarehouse ? `?warehouse_id=${selectedWarehouse}` : "";

  const { data: auditData, isLoading: loadingProducts } = useQuery<{ products: AuditProduct[]; summary: AuditSummary }>({
    queryKey: ["inventory-audit", selectedWarehouse],
    queryFn: () => authFetch(api(`/api/inventory/audit${warehouseParam}`)).then(r => { if (!r.ok) throw new Error("خطأ"); return r.json(); }),
    enabled: selectedWarehouse > 0,
  });

  const { data: sessions, refetch: refetchSessions } = useQuery<CountSession[]>({
    queryKey: ["count-sessions"],
    queryFn: () => authFetch(api("/api/inventory/count-sessions")).then(r => r.json()),
  });

  const allProducts = auditData?.products ?? [];

  const displayProducts = countMode === "full"
    ? allProducts
    : allProducts.filter(p => physicalQtys[p.id] !== undefined && physicalQtys[p.id] !== "");

  const diffEntries = allProducts.filter(p => physicalQtys[p.id] !== undefined && physicalQtys[p.id] !== "");
  const itemsWithDiff = diffEntries.filter(p => {
    const phys = parseFloat(physicalQtys[p.id] || "0");
    return Math.abs(phys - p.actual_qty) > 0.001;
  });
  const totalDiff = diffEntries.reduce((acc, p) => acc + Math.abs(parseFloat(physicalQtys[p.id] || "0") - p.actual_qty), 0);

  const createAndApplyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWarehouse) throw new Error("اختر مخزناً أولاً");
      if (!countDate) throw new Error("التاريخ مطلوب");
      if (!countTime) throw new Error("الوقت مطلوب");

      const items = allProducts
        .filter(p => physicalQtys[p.id] !== undefined && physicalQtys[p.id] !== "")
        .map(p => ({
          product_id: p.id,
          physical_qty: parseFloat(physicalQtys[p.id] || "0"),
          notes: itemNotes[p.id] ?? undefined,
        }));

      if (items.length === 0) throw new Error("أدخل كمية فعلية لمنتج واحد على الأقل");

      const notesWithDateTime = `جرد ${countDate} الساعة ${countTime}${sessionNotes ? ` — ${sessionNotes}` : ""}`;

      const createRes = await authFetch(api("/api/inventory/count-sessions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warehouse_id: selectedWarehouse, notes: notesWithDateTime, items }),
      });
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        throw new Error((err as any).error ?? "خطأ في إنشاء الجلسة");
      }
      const { session_id } = await createRes.json();

      const applyRes = await authFetch(api(`/api/inventory/count-sessions/${session_id}/apply`), { method: "POST" });
      if (!applyRes.ok) {
        const err = await applyRes.json().catch(() => ({}));
        throw new Error((err as any).error ?? "خطأ في تطبيق الجرد");
      }
      return applyRes.json();
    },
    onSuccess: (data) => {
      toast({ title: `✅ تم تطبيق الجرد — ${data.adjustments_applied} تسوية` });
      setPhysicalQtys({}); setItemNotes({}); setSessionNotes("");
      setCountDate(today()); setCountTime(nowTime());
      qc.invalidateQueries({ queryKey: ["inventory-audit"] });
      qc.invalidateQueries({ queryKey: ["count-sessions"] });
    },
    onError: (e) => toast({ title: (e as Error).message, variant: "destructive" }),
  });

  const applyExistingMutation = useMutation({
    mutationFn: (sessionId: number) =>
      authFetch(api(`/api/inventory/count-sessions/${sessionId}/apply`), { method: "POST" })
        .then(r => { if (!r.ok) return r.json().then(e => Promise.reject(e.error)); return r.json(); }),
    onSuccess: () => {
      toast({ title: "تم تطبيق جلسة الجرد بنجاح" });
      refetchSessions();
      qc.invalidateQueries({ queryKey: ["inventory-audit"] });
      setApplyingId(null);
    },
    onError: (e) => { toast({ title: String(e), variant: "destructive" }); setApplyingId(null); },
  });

  const canApply = diffEntries.length > 0 && selectedWarehouse > 0 && !!countDate && !!countTime;

  return (
    <div className="space-y-6">
      {/* ── شريط التبديل ── */}
      <div className="flex gap-2">
        <button onClick={() => setSessionView("new")}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${sessionView === "new" ? "bg-violet-500 text-white" : "bg-white/10 text-white/60 hover:text-white"}`}>
          جرد جديد
        </button>
        <button onClick={() => setSessionView("history")}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${sessionView === "history" ? "bg-violet-500 text-white" : "bg-white/10 text-white/60 hover:text-white"}`}>
          سجل الجرد ({safeArray(sessions).length})
        </button>
      </div>

      {sessionView === "new" && (
        <div className="space-y-5">
          {/* ── إعدادات الجلسة ── */}
          <div className="bg-[#111827] border border-white/8 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white/70 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-violet-400" /> إعدادات جلسة الجرد
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* مخزن */}
              <div>
                <label className="block text-white/50 text-xs mb-1.5">المخزن <span className="text-red-400">*</span></label>
                <select value={selectedWarehouse} onChange={e => setSelectedWarehouse(Number(e.target.value))}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/50">
                  <option value={0} className="bg-[#1a1a2e]">— اختر مخزناً —</option>
                  {warehouses.map(w => <option key={w.id} value={w.id} className="bg-[#1a1a2e]">{w.name}</option>)}
                </select>
              </div>
              {/* تاريخ */}
              <div>
                <label className="block text-white/50 text-xs mb-1.5">تاريخ الجرد <span className="text-red-400">*</span></label>
                <input type="date" value={countDate} onChange={e => setCountDate(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/50" />
              </div>
              {/* وقت */}
              <div>
                <label className="block text-white/50 text-xs mb-1.5">وقت الجرد <span className="text-red-400">*</span></label>
                <input type="time" value={countTime} onChange={e => setCountTime(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/50" />
              </div>
              {/* ملاحظات */}
              <div>
                <label className="block text-white/50 text-xs mb-1.5">ملاحظات (اختياري)</label>
                <input type="text" value={sessionNotes} onChange={e => setSessionNotes(e.target.value)}
                  placeholder="مثال: جرد نهاية الشهر"
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-violet-400/50" />
              </div>
            </div>
            {/* نوع الجرد */}
            <div className="flex items-center gap-4 pt-1">
              <span className="text-white/50 text-xs">نوع الجرد:</span>
              <div className="flex gap-2">
                {([
                  { v: "full"    as const, label: "شامل — كل المنتجات" },
                  { v: "partial" as const, label: "جزئي — منتجات مُدخلة فقط" },
                ]).map(opt => (
                  <button key={opt.v} onClick={() => setCountMode(opt.v)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                      countMode === opt.v ? "bg-violet-500 text-white" : "bg-white/10 text-white/50 hover:text-white"
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── ملخص الفروق ── */}
          {diffEntries.length > 0 && (
            <div className={`rounded-2xl p-4 flex items-center justify-between ${itemsWithDiff.length > 0 ? "bg-amber-500/10 border border-amber-500/20" : "bg-emerald-500/10 border border-emerald-500/20"}`}>
              <div>
                <p className={`font-bold text-sm ${itemsWithDiff.length > 0 ? "text-amber-300" : "text-emerald-300"}`}>
                  {itemsWithDiff.length > 0
                    ? `${diffEntries.length} منتج مُسجَّل — ${itemsWithDiff.length} بفرق — فارق إجمالي: ${totalDiff.toFixed(2)} وحدة`
                    : `${diffEntries.length} منتج مُسجَّل — لا توجد فروق ✓`}
                </p>
                <p className="text-white/40 text-xs mt-0.5">
                  {!selectedWarehouse && "⚠ اختر مخزناً "}{!countDate && "⚠ التاريخ مطلوب "}{!countTime && "⚠ الوقت مطلوب"}
                </p>
              </div>
              <button
                onClick={() => createAndApplyMutation.mutate()}
                disabled={createAndApplyMutation.isPending || !canApply}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors whitespace-nowrap">
                {createAndApplyMutation.isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> جاري التطبيق...</>
                  : <><CheckCircle className="w-4 h-4" /> تطبيق الجرد</>}
              </button>
            </div>
          )}

          {/* ── جدول المنتجات ── */}
          {selectedWarehouse === 0 ? (
            <div className="text-center py-16 text-white/30">اختر مخزناً لعرض المنتجات</div>
          ) : loadingProducts ? (
            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full text-sm"><tbody><TableSkeleton cols={5} rows={6} /></tbody></table>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5">
                    <th className="p-3 text-right text-white/60 font-medium">المنتج</th>
                    <th className="p-3 text-right text-white/60 font-medium">كمية النظام</th>
                    <th className="p-3 text-right text-white/60 font-medium">الكمية الفعلية</th>
                    <th className="p-3 text-right text-white/60 font-medium w-28">الفرق</th>
                    <th className="p-3 text-right text-white/60 font-medium">سبب الفرق</th>
                  </tr>
                </thead>
                <tbody>
                  {(countMode === "full" ? allProducts : displayProducts).map(p => {
                    const rawPhys = physicalQtys[p.id];
                    const physQty = rawPhys !== undefined && rawPhys !== "" ? parseFloat(rawPhys) : null;
                    const diff    = physQty !== null ? physQty - p.actual_qty : null;
                    const hasDiff = diff !== null && Math.abs(diff) > 0.001;
                    return (
                      <tr key={p.id} className={`border-b border-white/5 erp-table-row ${hasDiff ? "bg-amber-500/5" : ""}`}>
                        <td className="p-3">
                          <div className="text-white font-medium">{p.name}</div>
                          {p.sku && <div className="text-white/40 text-xs">{p.sku}</div>}
                          {p.category && <div className="text-white/30 text-xs">{p.category}</div>}
                        </td>
                        <td className="p-3 font-mono text-white/70 font-bold">{p.actual_qty.toFixed(2)}</td>
                        <td className="p-3">
                          <input type="number" min="0" step="0.001"
                            value={physicalQtys[p.id] ?? ""}
                            onChange={e => setPhysicalQtys(prev => ({ ...prev, [p.id]: e.target.value }))}
                            placeholder="أدخل الكمية"
                            className="w-28 bg-white/10 border border-white/20 rounded-lg px-2 py-1.5 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-violet-400/50 text-sm font-mono" />
                        </td>
                        <td className="p-3 font-mono w-28">
                          {diff === null ? <span className="text-white/20">—</span> :
                            diff === 0 ? <span className="text-emerald-400 font-bold">✓ صفر</span> :
                            <span className={`font-bold ${diff > 0 ? "text-teal-400" : "text-red-400"}`}>
                              {diff > 0 ? `+${diff.toFixed(3)}` : diff.toFixed(3)}
                            </span>}
                        </td>
                        <td className="p-3">
                          {hasDiff && (
                            <input type="text" value={itemNotes[p.id] ?? ""}
                              onChange={e => setItemNotes(prev => ({ ...prev, [p.id]: e.target.value }))}
                              placeholder="سبب الفرق"
                              className="w-40 bg-white/10 border border-amber-500/30 rounded-lg px-2 py-1 text-white placeholder:text-white/30 focus:outline-none text-xs" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {(countMode === "full" ? allProducts : displayProducts).length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center text-white/40 py-12">
                        {countMode === "partial" ? "لم تُدخل كميات بعد" : "لا توجد منتجات في هذا المخزن"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── سجل الجلسات ── */}
      {sessionView === "history" && (
        <div className="space-y-3">
          {safeArray(sessions).length === 0 && (
            <p className="text-white/40 text-center py-12">لا توجد جلسات جرد سابقة</p>
          )}
          {safeArray(sessions).map(s => {
            const whName = warehouses.find(w => w.id === s.warehouse_id)?.name ?? `مخزن #${s.warehouse_id}`;
            return (
              <div key={s.id} className="bg-[#111827] border border-white/8 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-bold">جلسة #{s.id}</span>
                    <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${s.status === "applied" ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}>
                      {s.status === "applied" ? "مطبّق" : "مسودة"}
                    </span>
                  </div>
                  <div className="text-white/40 text-xs mt-1">
                    {whName} — {new Date(s.created_at).toLocaleDateString("ar-EG")}
                    {s.notes && ` — ${s.notes}`}
                  </div>
                  {s.applied_at && (
                    <div className="text-emerald-400/60 text-xs mt-0.5">
                      طُبِّق: {new Date(s.applied_at).toLocaleDateString("ar-EG")}
                    </div>
                  )}
                </div>
                {s.status === "draft" && (
                  <button
                    onClick={() => { setApplyingId(s.id); applyExistingMutation.mutate(s.id); }}
                    disabled={applyExistingMutation.isPending && applyingId === s.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded-xl text-xs font-bold transition-colors disabled:opacity-50">
                    {applyExistingMutation.isPending && applyingId === s.id
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <CheckCircle className="w-3 h-3" />}
                    تطبيق
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * TAB 3 — تحويل المخزون (Improved UI)
 * ═══════════════════════════════════════════════════════════════════════════ */
interface TransferLine { product_id: number; product_name: string; quantity: string }

function TransferTab({ warehouses, qc, toast }: {
  warehouses: { id: number; name: string }[];
  qc: ReturnType<typeof useQueryClient>;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const defaultFirst  = warehouses[0]?.id ?? 1;
  const defaultSecond = warehouses[1]?.id ?? 2;
  const [fromWH, setFromWH]           = useState<number>(defaultFirst);
  const [toWH, setToWH]               = useState<number>(defaultSecond);
  const [transferNotes, setTransferNotes] = useState("");
  const [lines, setLines]             = useState<TransferLine[]>([{ product_id: 0, product_name: "", quantity: "" }]);
  const [view, setView]               = useState<"new" | "history">("new");

  const { data: auditData } = useQuery<{ products: AuditProduct[]; summary: AuditSummary }>({
    queryKey: ["inventory-audit", null],
    queryFn: () => authFetch(api("/api/inventory/audit")).then(r => { if (!r.ok) throw new Error("خطأ"); return r.json(); }),
  });

  const { data: transfers, refetch: refetchTransfers } = useQuery<StockTransfer[]>({
    queryKey: ["inventory-transfers"],
    queryFn: () => authFetch(api("/api/inventory/transfers")).then(r => r.json()),
  });

  const allProducts = auditData?.products ?? [];

  const transferMutation = useMutation({
    mutationFn: () => {
      if (fromWH === toWH) throw new Error("لا يمكن التحويل من مخزن إلى نفسه");
      const validLines = lines.filter(l => l.product_id > 0 && parseFloat(l.quantity) > 0);
      if (validLines.length === 0) throw new Error("أضف منتجاً واحداً على الأقل مع كمية صحيحة");
      return authFetch(api("/api/inventory/transfers"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_warehouse_id: fromWH, to_warehouse_id: toWH,
          notes: transferNotes || undefined,
          items: validLines.map(l => ({ product_id: l.product_id, quantity: parseFloat(l.quantity) })),
        }),
      }).then(r => r.json().then(d => { if (!r.ok) throw new Error(d.error ?? "خطأ في التحويل"); return d; }));
    },
    onSuccess: (data) => {
      toast({ title: `✅ تم التحويل — ${data.from_warehouse} ← ${data.to_warehouse}` });
      setLines([{ product_id: 0, product_name: "", quantity: "" }]);
      setTransferNotes("");
      qc.invalidateQueries({ queryKey: ["inventory-audit"] });
      refetchTransfers();
    },
    onError: (e) => toast({ title: (e as Error).message, variant: "destructive" }),
  });

  function updateLine(idx: number, field: keyof TransferLine, value: string | number) {
    setLines(prev => {
      const updated = [...prev];
      if (field === "product_id") {
        const prod = allProducts.find(p => p.id === Number(value));
        updated[idx] = { ...updated[idx], product_id: Number(value), product_name: prod?.name ?? "" };
      } else {
        (updated[idx] as any)[field] = value;
      }
      return updated;
    });
  }

  const validLinesCount = lines.filter(l => l.product_id > 0 && parseFloat(l.quantity) > 0).length;

  return (
    <div className="space-y-6">
      {/* ── شريط التبديل ── */}
      <div className="flex gap-2">
        <button onClick={() => setView("new")}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${view === "new" ? "bg-violet-500 text-white" : "bg-white/10 text-white/60 hover:text-white"}`}>
          تحويل جديد
        </button>
        <button onClick={() => setView("history")}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${view === "history" ? "bg-violet-500 text-white" : "bg-white/10 text-white/60 hover:text-white"}`}>
          سجل التحويلات ({safeArray(transfers).length})
        </button>
      </div>

      {view === "new" && (
        <div className="space-y-5">
          {/* ── اتجاه التحويل ── */}
          <div className="bg-[#111827] border border-white/8 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white/70 flex items-center gap-2">
              <Truck className="w-4 h-4 text-violet-400" /> بيانات التحويل
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-end">
              <div>
                <label className="block text-white/50 text-xs mb-1.5">من مخزن <span className="text-red-400">*</span></label>
                <select value={fromWH} onChange={e => setFromWH(Number(e.target.value))}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/50">
                  {warehouses.map(w => <option key={w.id} value={w.id} className="bg-[#1a1a2e]">{w.name}</option>)}
                </select>
              </div>
              <div className="flex items-center justify-center pb-1">
                <div className="w-10 h-10 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                  <Truck className="w-4 h-4 text-violet-400" />
                </div>
              </div>
              <div>
                <label className="block text-white/50 text-xs mb-1.5">إلى مخزن <span className="text-red-400">*</span></label>
                <select value={toWH} onChange={e => setToWH(Number(e.target.value))}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/50">
                  {warehouses.map(w => <option key={w.id} value={w.id} className="bg-[#1a1a2e]">{w.name}</option>)}
                </select>
              </div>
            </div>
            {fromWH === toWH && (
              <p className="text-amber-400 text-xs bg-amber-500/10 px-3 py-2 rounded-xl border border-amber-500/20">
                ⚠ لا يمكن التحويل من مخزن إلى نفسه
              </p>
            )}
            <div>
              <label className="block text-white/50 text-xs mb-1.5">ملاحظات (اختياري)</label>
              <input type="text" value={transferNotes} onChange={e => setTransferNotes(e.target.value)}
                placeholder="مثال: تحويل لتغطية طلبات فرع ثاني"
                className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-violet-400/50" />
            </div>
          </div>

          {/* ── المنتجات المُحوَّلة ── */}
          <div className="bg-[#111827] border border-white/8 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white/70">المنتجات المُحوَّلة</h3>
              <button
                onClick={() => setLines(prev => [...prev, { product_id: 0, product_name: "", quantity: "" }])}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 rounded-xl text-xs font-bold transition-colors">
                <Plus className="w-3.5 h-3.5" /> إضافة منتج
              </button>
            </div>

            <div className="space-y-2">
              {lines.map((line, idx) => {
                const product      = allProducts.find(p => p.id === line.product_id);
                const available    = product ? product.actual_qty : 0;
                const reqQty       = parseFloat(line.quantity) || 0;
                const isInsufficient = line.product_id > 0 && reqQty > 0 && reqQty > available;
                return (
                  <div key={idx} className="flex gap-2 items-start">
                    <select value={line.product_id}
                      onChange={e => updateLine(idx, "product_id", e.target.value)}
                      className="flex-1 bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/50">
                      <option value={0} className="bg-[#1a1a2e]">— اختر منتجاً —</option>
                      {allProducts.map(p => (
                        <option key={p.id} value={p.id} className="bg-[#1a1a2e]">
                          {p.name} (متاح: {p.actual_qty.toFixed(1)})
                        </option>
                      ))}
                    </select>
                    <div className="flex flex-col gap-1">
                      <input type="number" min="0.001" step="0.001" value={line.quantity}
                        onChange={e => updateLine(idx, "quantity", e.target.value)}
                        placeholder="الكمية"
                        className={`w-28 bg-white/10 border rounded-xl px-3 py-2 text-white placeholder:text-white/30 focus:outline-none text-sm font-mono ${
                          isInsufficient ? "border-red-400/50 focus:ring-2 focus:ring-red-400/30" : "border-white/20 focus:ring-2 focus:ring-violet-400/50"
                        }`} />
                      {isInsufficient && <span className="text-red-400 text-xs">غير كافٍ ({available.toFixed(1)})</span>}
                    </div>
                    {lines.length > 1 && (
                      <button onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))}
                        className="p-2 text-white/30 hover:text-red-400 transition-colors mt-0.5">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => transferMutation.mutate()}
              disabled={transferMutation.isPending || fromWH === toWH || validLinesCount === 0}
              className="w-full py-3 bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-white rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2">
              {transferMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> جاري التحويل...</>
                : <><Truck className="w-4 h-4" /> تنفيذ التحويل ({validLinesCount > 0 ? `${validLinesCount} منتج` : ""})</>}
            </button>
          </div>
        </div>
      )}

      {/* ── سجل التحويلات ── */}
      {view === "history" && (
        <div className="space-y-3">
          {safeArray(transfers).length === 0 && (
            <p className="text-white/40 text-center py-12">لا توجد عمليات تحويل سابقة</p>
          )}
          {safeArray(transfers).map(t => {
            const fromName = warehouses.find(w => w.id === t.from_warehouse_id)?.name ?? `مخزن #${t.from_warehouse_id}`;
            const toName   = warehouses.find(w => w.id === t.to_warehouse_id)?.name   ?? `مخزن #${t.to_warehouse_id}`;
            return (
              <div key={t.id} className="bg-[#111827] border border-white/8 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-bold">تحويل #{t.id}</span>
                      <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-300">مكتمل</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-amber-300 font-medium">{fromName}</span>
                      <span className="text-white/30">←</span>
                      <span className="text-cyan-300 font-medium">{toName}</span>
                    </div>
                    {t.notes && <div className="text-white/40 text-xs mt-1">{t.notes}</div>}
                  </div>
                  <div className="text-white/40 text-xs text-left">
                    {new Date(t.created_at).toLocaleDateString("ar-EG")}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── بطاقة ملخص ─────────────────────────────────────────────────────────── */
function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
      <div className="text-white/50 text-xs mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
