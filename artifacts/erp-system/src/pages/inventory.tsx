import { useState, useEffect } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWarehouse } from "@/contexts/warehouse";
import { useAuth } from "@/contexts/auth";
import { hasPermission } from "@/lib/permissions";
import { formatCurrency } from "@/lib/format";
import {
  Package, AlertTriangle, TrendingDown, Search, X, RefreshCw,
  ChevronUp, ChevronDown, Edit3, ShieldX, ClipboardList, Truck,
  Plus, Trash2, CheckCircle, Warehouse, Loader2, Filter,
  BarChart3, ArrowLeft,
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
interface WarehouseSummaryItem {
  warehouse_id: number; warehouse_name: string;
  item_count: number; total_value: number; pct_of_total: number;
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

  const [showAddWH, setShowAddWH]           = useState(false);
  const [deleteWHTarget, setDeleteWHTarget] = useState<{ id: number; name: string } | null>(null);
  const [whForm, setWhForm]                 = useState({ name: "", address: "" });
  const invalidateWH = () => qc.invalidateQueries({ queryKey: ["/api/settings/warehouses"] });

  /* ── per-warehouse summary ── */
  const { data: whSummaryData } = useQuery<{ warehouses: WarehouseSummaryItem[]; grand_total: number }>({
    queryKey: ["inventory-warehouse-summary"],
    queryFn: () => authFetch(api("/api/inventory/warehouse-summary")).then(r => r.json()),
    staleTime: 30_000,
    enabled: canViewInventory,
  });
  const whSummaryMap = new Map((whSummaryData?.warehouses ?? []).map(s => [s.warehouse_id, s]));
  const grandTotal = whSummaryData?.grand_total ?? 0;

  /* ── global stats for header ── */
  const { data: globalAudit } = useQuery<{ summary: AuditSummary }>({
    queryKey: ["inventory-audit-global"],
    queryFn: () => authFetch(api("/api/inventory/audit")).then(r => r.json()),
    staleTime: 30_000,
    enabled: canViewInventory,
  });
  const gs = globalAudit?.summary;

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
    <div className="p-6 space-y-6 text-right" dir="rtl">

      {/* ══ إحصائيات الرأس ══════════════════════════════════════════════════ */}
      {gs && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="إجمالي المنتجات"
            value={String(gs.total_products)}
            icon={<Package className="w-5 h-5 text-violet-400" />}
            color="text-white"
            bg="bg-violet-500/10 border-violet-500/20"
          />
          <StatCard
            label="قيمة المخزون الكلية"
            value={formatCurrency(grandTotal || gs.total_inventory_value)}
            icon={<BarChart3 className="w-5 h-5 text-emerald-400" />}
            color="text-emerald-400"
            bg="bg-emerald-500/10 border-emerald-500/20"
          />
          <StatCard
            label="تحت حد الطلب"
            value={String(gs.low_stock_count)}
            icon={<AlertTriangle className="w-5 h-5 text-amber-400" />}
            color={gs.low_stock_count > 0 ? "text-amber-400" : "text-white/40"}
            bg={gs.low_stock_count > 0 ? "bg-amber-500/10 border-amber-500/20" : "bg-white/5 border-white/5"}
          />
          <StatCard
            label="نفد المخزون"
            value={String(gs.zero_stock_count)}
            icon={<TrendingDown className="w-5 h-5 text-red-400" />}
            color={gs.zero_stock_count > 0 ? "text-red-400" : "text-white/40"}
            bg={gs.zero_stock_count > 0 ? "bg-red-500/10 border-red-500/20" : "bg-white/5 border-white/5"}
          />
        </div>
      )}

      {/* ══ قسم إدارة المخازن ════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">المخازن</h2>
            <p className="text-white/40 text-sm mt-0.5">إدارة مواقع التخزين ومتابعة قيمة كل مخزن</p>
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
            {[1, 2].map(i => <div key={i} className="h-32 bg-white/5 border border-white/5 rounded-2xl animate-pulse" />)}
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
            {warehouses.map(w => {
              const ws = whSummaryMap.get(w.id);
              return (
                <div key={w.id}
                  className="group relative bg-[#111827] border border-white/5 hover:border-violet-500/20 rounded-2xl p-5 transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
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
                  <p className="text-white font-bold text-sm mb-1">{w.name}</p>
                  {w.address && <p className="text-white/40 text-xs truncate mb-2">{w.address}</p>}
                  {ws && (
                    <div className="space-y-1 pt-2 border-t border-white/5">
                      <div className="flex items-center justify-between">
                        <span className="text-white/40 text-xs">قيمة المخزون</span>
                        <span className="text-emerald-400 text-xs font-bold">{formatCurrency(ws.total_value)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-white/40 text-xs">عدد المنتجات</span>
                        <span className="text-white/70 text-xs font-bold">{ws.item_count}</span>
                      </div>
                      {grandTotal > 0 && (
                        <div className="mt-1.5">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-white/30 text-xs">من الإجمالي</span>
                            <span className="text-violet-300 text-xs font-bold">{ws.pct_of_total}%</span>
                          </div>
                          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-violet-400 rounded-full transition-all" style={{ width: `${ws.pct_of_total}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {currentWarehouseId === w.id && (
                    <span className="inline-block mt-2 px-2 py-0.5 rounded-lg text-xs bg-violet-500/20 text-violet-300 font-medium">
                      المخزن الحالي
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ══ تبويبات المخزون ══════════════════════════════════════════════════ */}
      <div>
        <div className="flex gap-2 border-b border-white/10 mb-6">
          <TabBtn id="review"   label="مراجعة المخزون" icon={<Package className="w-4 h-4" />}      active={activeTab} onClick={setActiveTab} />
          {canAdjustInventory && (
            <TabBtn id="count"    label="جرد المخزون"    icon={<ClipboardList className="w-4 h-4" />} active={activeTab} onClick={setActiveTab} />
          )}
          {canAdjustInventory && (
            <TabBtn id="transfer" label="تحويل مخزون"    icon={<Truck className="w-4 h-4" />}         active={activeTab} onClick={setActiveTab} />
          )}
        </div>

        {activeTab === "review"   && <ReviewTab currentWarehouseId={currentWarehouseId} canAdjustInventory={canAdjustInventory} qc={qc} toast={toast} />}
        {activeTab === "count"    && <CountTab  warehouses={warehouses} currentWarehouseId={currentWarehouseId} qc={qc} toast={toast} />}
        {activeTab === "transfer" && <TransferTab warehouses={warehouses} qc={qc} toast={toast} />}
      </div>

      {/* ── Modal: إضافة مخزن ── */}
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
                <label className="block text-white/60 text-xs mb-1.5">اسم المخزن <span className="text-red-400">*</span></label>
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
                    onSuccess: () => {
                      invalidateWH();
                      qc.invalidateQueries({ queryKey: ["inventory-warehouse-summary"] });
                      toast({ title: "✅ تم إضافة المخزن" });
                      setShowAddWH(false);
                    },
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

      {/* ── Modal: حذف مخزن ── */}
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
                  onSuccess: () => {
                    invalidateWH();
                    qc.invalidateQueries({ queryKey: ["inventory-warehouse-summary"] });
                    toast({ title: "تم حذف المخزن" });
                    setDeleteWHTarget(null);
                  },
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

/* ─── Helper Components ───────────────────────────────────────────────────── */
function TabBtn({ id, label, icon, active, onClick }: {
  id: Tab; label: string; icon: React.ReactNode; active: Tab; onClick: (t: Tab) => void;
}) {
  const isActive = id === active;
  return (
    <button onClick={() => onClick(id)}
      className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold border-b-2 transition-colors -mb-px ${
        isActive ? "border-violet-400 text-violet-300" : "border-transparent text-white/50 hover:text-white/80"
      }`}>
      {icon}{label}
    </button>
  );
}

function StatCard({ label, value, icon, color, bg }: {
  label: string; value: string; icon: React.ReactNode; color: string; bg: string;
}) {
  return (
    <div className={`rounded-2xl p-4 border ${bg} flex items-center gap-3`}>
      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-white/40 text-xs">{label}</p>
        <p className={`text-lg font-bold truncate ${color}`}>{value}</p>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white/5 border border-white/8 rounded-xl p-3 text-center">
      <p className="text-xs text-white/40 mb-1">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
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
      qc.invalidateQueries({ queryKey: ["inventory-warehouse-summary"] });
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
      {/* أسطورة الألوان + زر تحديث */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-wrap gap-1.5 text-xs">
          {[
            { c: "bg-blue-500/20 text-blue-300",      t: "↑ افتتاحي" },
            { c: "bg-emerald-500/20 text-emerald-300", t: "↑ مشتريات" },
            { c: "bg-teal-500/20 text-teal-300",       t: "↑ مرتجع مبيعات" },
            { c: "bg-red-500/20 text-red-300",         t: "↓ مبيعات" },
            { c: "bg-orange-500/20 text-orange-300",   t: "↓ مرتجع مشتريات" },
            { c: "bg-violet-500/20 text-violet-300",   t: "± تسوية" },
            { c: "bg-amber-500/20 text-amber-300",     t: "↓ خروج" },
            { c: "bg-cyan-500/20 text-cyan-300",       t: "↑ دخول" },
          ].map(b => <span key={b.t} className={`px-2 py-1 rounded-lg ${b.c}`}>{b.t}</span>)}
        </div>
        <button onClick={() => refetch()} className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-xl transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> تحديث
        </button>
      </div>

      {/* بطاقات الملخص */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard label="إجمالي المنتجات"  value={String(summary.total_products)}            color="text-white" />
          <SummaryCard label="قيمة المخزون"      value={formatCurrency(summary.total_inventory_value)} color="text-emerald-400" />
          <SummaryCard label="تحت حد الطلب"     value={String(summary.low_stock_count)}           color={summary.low_stock_count > 0  ? "text-amber-400"  : "text-white/40"} />
          <SummaryCard label="نفد المخزون"       value={String(summary.zero_stock_count)}          color={summary.zero_stock_count > 0 ? "text-red-400"    : "text-white/40"} />
        </div>
      )}

      {/* بحث */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث عن منتج..."
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 pe-10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20" />
        {search && <button onClick={() => setSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"><X className="w-4 h-4" /></button>}
      </div>

      {/* الجدول */}
      {isLoading ? (
        <div className="overflow-x-auto rounded-2xl border border-white/10"><table className="w-full text-sm min-w-[1100px]"><tbody><TableSkeleton cols={12} rows={7} /></tbody></table></div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                {([
                  { key: "name"                as const, label: "المنتج" },
                  { key: "opening_qty"         as const, label: "افتتاحي" },
                  { key: "purchased_qty"       as const, label: "وارد" },
                  { key: "sale_return_qty"     as const, label: "مرتجع مبيعات" },
                  { key: "sold_qty"            as const, label: "صادر" },
                  { key: "purchase_return_qty" as const, label: "مرتجع مشتريات" },
                  { key: "calculated_qty"      as const, label: "محسوب" },
                  { key: "actual_qty"          as const, label: "فعلي (إجمالي)" },
                  { key: "discrepancy"         as const, label: "فرق" },
                  { key: "cost_price"          as const, label: "تكلفة" },
                  { key: "total_value"         as const, label: "قيمة المخزون" },
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

      {/* Modal: تفاصيل حركات منتج */}
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

      {/* Modal: التسوية اليدوية */}
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
 * TAB 2 — جرد المخزون
 * ═══════════════════════════════════════════════════════════════════════════ */
function CountTab({ warehouses, currentWarehouseId, qc, toast }: {
  warehouses: { id: number; name: string }[];
  currentWarehouseId: number | null;
  qc: ReturnType<typeof useQueryClient>;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const defaultWH = warehouses.length > 0
    ? (warehouses.find(w => w.id === currentWarehouseId)?.id ?? warehouses[0].id)
    : 0;

  const [selectedWarehouse, setSelectedWarehouse] = useState<number>(defaultWH);
  const [countDate, setCountDate]     = useState(today());
  const [countTime, setCountTime]     = useState(nowTime());
  const [sessionNotes, setSessionNotes] = useState("");
  const [countMode, setCountMode]     = useState<"full" | "partial">("full");

  /* partial mode: product selector state */
  const [partialSearch, setPartialSearch]   = useState("");
  const [partialCategory, setPartialCategory] = useState("all");
  const [selectedProductIds, setSelectedProductIds] = useState<Set<number>>(new Set());

  const [physicalQtys, setPhysicalQtys] = useState<Record<number, string>>({});
  const [itemNotes, setItemNotes]       = useState<Record<number, string>>({});
  const [sessionView, setSessionView]   = useState<"new" | "history">("new");
  const [applyingId, setApplyingId]     = useState<number | null>(null);

  /* reset quantities when warehouse changes */
  useEffect(() => {
    setPhysicalQtys({});
    setItemNotes({});
    setSelectedProductIds(new Set());
  }, [selectedWarehouse]);

  const warehouseParam = selectedWarehouse ? `?warehouse_id=${selectedWarehouse}` : "";

  /* fetch per-warehouse audit to get calculated_qty (system stock for THIS warehouse) */
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

  /* categories for filter */
  const categories = Array.from(new Set(allProducts.map(p => p.category).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "ar"));

  /* products to show in the partial selector */
  const filteredForSelector = allProducts.filter(p => {
    const matchSearch = !partialSearch || p.name.toLowerCase().includes(partialSearch.toLowerCase()) || (p.sku ?? "").toLowerCase().includes(partialSearch.toLowerCase());
    const matchCat = partialCategory === "all" || p.category === partialCategory;
    return matchSearch && matchCat;
  });

  /* products shown in the count table */
  const countTableProducts = countMode === "full"
    ? allProducts
    : allProducts.filter(p => selectedProductIds.has(p.id));

  /* diff analytics */
  const enteredProducts = allProducts.filter(p => physicalQtys[p.id] !== undefined && physicalQtys[p.id] !== "");
  const itemsWithPosDiff = enteredProducts.filter(p => {
    const diff = parseFloat(physicalQtys[p.id] || "0") - p.calculated_qty;
    return diff > 0.001;
  });
  const itemsWithNegDiff = enteredProducts.filter(p => {
    const diff = parseFloat(physicalQtys[p.id] || "0") - p.calculated_qty;
    return diff < -0.001;
  });
  const itemsWithDiff = enteredProducts.filter(p => {
    const diff = parseFloat(physicalQtys[p.id] || "0") - p.calculated_qty;
    return Math.abs(diff) > 0.001;
  });
  const totalPosDiff = itemsWithPosDiff.reduce((acc, p) => acc + (parseFloat(physicalQtys[p.id] || "0") - p.calculated_qty), 0);
  const totalNegDiff = itemsWithNegDiff.reduce((acc, p) => acc + (parseFloat(physicalQtys[p.id] || "0") - p.calculated_qty), 0);

  const canApply = enteredProducts.length > 0 && selectedWarehouse > 0 && !!countDate && !!countTime;

  const createAndApplyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWarehouse) throw new Error("اختر مخزناً أولاً");
      if (!countDate) throw new Error("التاريخ مطلوب");
      if (!countTime) throw new Error("الوقت مطلوب");

      const items = allProducts
        .filter(p => physicalQtys[p.id] !== undefined && physicalQtys[p.id] !== "")
        .map(p => ({
          product_id:   p.id,
          physical_qty: parseFloat(physicalQtys[p.id] || "0"),
          notes:        itemNotes[p.id] ?? undefined,
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
      setSelectedProductIds(new Set());
      qc.invalidateQueries({ queryKey: ["inventory-audit"] });
      qc.invalidateQueries({ queryKey: ["count-sessions"] });
      qc.invalidateQueries({ queryKey: ["inventory-warehouse-summary"] });
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
      qc.invalidateQueries({ queryKey: ["inventory-warehouse-summary"] });
      setApplyingId(null);
    },
    onError: (e) => { toast({ title: String(e), variant: "destructive" }); setApplyingId(null); },
  });

  return (
    <div className="space-y-6">
      {/* شريط التبديل بين جرد جديد وسجل الجلسات */}
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
          {/* إعدادات جلسة الجرد */}
          <div className="bg-[#111827] border border-white/8 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white/70 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-violet-400" /> إعدادات جلسة الجرد
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-white/50 text-xs mb-1.5">المخزن <span className="text-red-400">*</span></label>
                <select value={selectedWarehouse} onChange={e => setSelectedWarehouse(Number(e.target.value))}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/50">
                  <option value={0} className="bg-[#1a1a2e]">— اختر مخزناً —</option>
                  {warehouses.map(w => <option key={w.id} value={w.id} className="bg-[#1a1a2e]">{w.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-white/50 text-xs mb-1.5">تاريخ الجرد <span className="text-red-400">*</span></label>
                <input type="date" value={countDate} onChange={e => setCountDate(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/50" />
              </div>
              <div>
                <label className="block text-white/50 text-xs mb-1.5">وقت الجرد <span className="text-red-400">*</span></label>
                <input type="time" value={countTime} onChange={e => setCountTime(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/50" />
              </div>
              <div>
                <label className="block text-white/50 text-xs mb-1.5">ملاحظات الجلسة (اختياري)</label>
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
                  { v: "partial" as const, label: "جزئي — منتجات محددة" },
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

          {/* محدد المنتجات — للجرد الجزئي فقط */}
          {countMode === "partial" && selectedWarehouse > 0 && (
            <div className="bg-[#111827] border border-violet-500/20 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-violet-300 flex items-center gap-2">
                  <Filter className="w-4 h-4" /> اختر المنتجات للجرد
                  {selectedProductIds.size > 0 && (
                    <span className="px-2 py-0.5 rounded-lg bg-violet-500/30 text-violet-200 text-xs font-bold">
                      {selectedProductIds.size} محدد
                    </span>
                  )}
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedProductIds(new Set(allProducts.map(p => p.id)))}
                    className="text-xs text-violet-400 hover:text-violet-200 transition-colors">
                    تحديد الكل
                  </button>
                  <span className="text-white/20">|</span>
                  <button
                    onClick={() => setSelectedProductIds(new Set())}
                    className="text-xs text-white/40 hover:text-white/70 transition-colors">
                    مسح الكل
                  </button>
                </div>
              </div>

              {/* بحث + تصفية */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                  <input value={partialSearch} onChange={e => setPartialSearch(e.target.value)}
                    placeholder="ابحث عن منتج..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 pe-9 text-white text-sm placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-violet-400/40" />
                  {partialSearch && <button onClick={() => setPartialSearch("")} className="absolute left-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"><X className="w-3.5 h-3.5" /></button>}
                </div>
                {categories.length > 0 && (
                  <select value={partialCategory} onChange={e => setPartialCategory(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-violet-400/40">
                    <option value="all" className="bg-[#1a1a2e]">جميع الفئات</option>
                    {categories.map(c => <option key={c} value={c} className="bg-[#1a1a2e]">{c}</option>)}
                  </select>
                )}
              </div>

              {/* قائمة المنتجات بصناديق الاختيار */}
              <div className="max-h-52 overflow-y-auto rounded-xl border border-white/8 divide-y divide-white/5">
                {loadingProducts ? (
                  <div className="p-4 text-center text-white/40 text-sm">جاري التحميل...</div>
                ) : filteredForSelector.length === 0 ? (
                  <div className="p-4 text-center text-white/30 text-sm">لا توجد منتجات</div>
                ) : filteredForSelector.map(p => {
                  const isChecked = selectedProductIds.has(p.id);
                  return (
                    <label key={p.id}
                      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${isChecked ? "bg-violet-500/10" : "hover:bg-white/5"}`}>
                      <input type="checkbox" checked={isChecked}
                        onChange={e => {
                          const next = new Set(selectedProductIds);
                          if (e.target.checked) next.add(p.id); else next.delete(p.id);
                          setSelectedProductIds(next);
                        }}
                        className="w-4 h-4 rounded border-white/20 accent-violet-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm font-medium ${isChecked ? "text-white" : "text-white/70"}`}>{p.name}</span>
                        {p.sku && <span className="text-white/30 text-xs ms-2">{p.sku}</span>}
                        {p.category && <span className="text-white/20 text-xs ms-2">({p.category})</span>}
                      </div>
                      <span className="text-white/40 text-xs font-mono shrink-0">
                        {p.calculated_qty.toFixed(2)} في المخزن
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* ملخص الفروق */}
          {enteredProducts.length > 0 && (
            <div className={`rounded-2xl p-4 border ${itemsWithDiff.length > 0 ? "bg-amber-500/10 border-amber-500/20" : "bg-emerald-500/10 border-emerald-500/20"}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <p className={`font-bold text-sm ${itemsWithDiff.length > 0 ? "text-amber-300" : "text-emerald-300"}`}>
                    {enteredProducts.length} منتج مُسجَّل
                    {itemsWithDiff.length > 0
                      ? ` — ${itemsWithDiff.length} بفرق`
                      : " — لا توجد فروق ✓"}
                  </p>
                  {itemsWithDiff.length > 0 && (
                    <div className="flex gap-4 text-xs">
                      {itemsWithPosDiff.length > 0 && (
                        <span className="text-emerald-400">
                          ↑ زيادة: +{totalPosDiff.toFixed(2)} وحدة ({itemsWithPosDiff.length} صنف)
                        </span>
                      )}
                      {itemsWithNegDiff.length > 0 && (
                        <span className="text-red-400">
                          ↓ نقص: {totalNegDiff.toFixed(2)} وحدة ({itemsWithNegDiff.length} صنف)
                        </span>
                      )}
                    </div>
                  )}
                  {(!selectedWarehouse || !countDate || !countTime) && (
                    <p className="text-amber-400/70 text-xs">
                      {!selectedWarehouse && "⚠ اختر مخزناً  "}
                      {!countDate && "⚠ التاريخ مطلوب  "}
                      {!countTime && "⚠ الوقت مطلوب"}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => createAndApplyMutation.mutate()}
                  disabled={createAndApplyMutation.isPending || !canApply}
                  className="shrink-0 flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors whitespace-nowrap">
                  {createAndApplyMutation.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> جاري التطبيق...</>
                    : <><CheckCircle className="w-4 h-4" /> تطبيق الجرد ({enteredProducts.length})</>}
                </button>
              </div>
            </div>
          )}

          {/* جدول الجرد */}
          {selectedWarehouse === 0 ? (
            <div className="text-center py-16 text-white/30">اختر مخزناً لعرض المنتجات</div>
          ) : countMode === "partial" && selectedProductIds.size === 0 ? (
            <div className="text-center py-16 text-white/30">
              <Filter className="w-8 h-8 text-white/10 mx-auto mb-3" />
              <p>حدد المنتجات من القائمة أعلاه</p>
            </div>
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
                    <th className="p-3 text-right text-white/60 font-medium">
                      <span title="الكمية في هذا المخزن من حركات المخزون">كمية المخزن (نظام)</span>
                    </th>
                    <th className="p-3 text-right text-white/60 font-medium">الكمية الفعلية (يُدخلها المستخدم)</th>
                    <th className="p-3 text-center text-white/60 font-medium w-28">الفرق</th>
                    <th className="p-3 text-right text-white/60 font-medium">سبب الفرق</th>
                  </tr>
                </thead>
                <tbody>
                  {countTableProducts.map(p => {
                    const rawPhys = physicalQtys[p.id];
                    const physQty = rawPhys !== undefined && rawPhys !== "" ? parseFloat(rawPhys) : null;
                    /* use calculated_qty (per-warehouse stock) as baseline */
                    const sysQty  = p.calculated_qty;
                    const diff    = physQty !== null ? physQty - sysQty : null;
                    const hasDiff = diff !== null && Math.abs(diff) > 0.001;
                    return (
                      <tr key={p.id} className={`border-b border-white/5 erp-table-row ${hasDiff ? "bg-amber-500/5" : ""}`}>
                        <td className="p-3">
                          <div className="text-white font-medium">{p.name}</div>
                          {p.sku && <div className="text-white/40 text-xs">{p.sku}</div>}
                          {p.category && <div className="text-white/30 text-xs">{p.category}</div>}
                        </td>
                        {/* كمية النظام في هذا المخزن */}
                        <td className="p-3">
                          <span className="font-mono text-white/80 font-bold text-sm">{sysQty.toFixed(2)}</span>
                          <span className="text-white/30 text-xs ms-1">وحدة</span>
                        </td>
                        {/* إدخال الكمية الفعلية */}
                        <td className="p-3">
                          <input type="number" min="0" step="0.001"
                            value={physicalQtys[p.id] ?? ""}
                            onChange={e => setPhysicalQtys(prev => ({ ...prev, [p.id]: e.target.value }))}
                            placeholder="أدخل الكمية"
                            className="w-32 bg-white/10 border border-white/20 rounded-lg px-2 py-1.5 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-violet-400/50 text-sm font-mono" />
                        </td>
                        {/* الفرق مع ألوان واضحة */}
                        <td className="p-3 text-center font-mono w-28">
                          {diff === null
                            ? <span className="text-white/20">—</span>
                            : diff === 0
                              ? <span className="text-emerald-400 font-bold text-sm">✓ صفر</span>
                              : diff > 0
                                ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 font-bold text-sm">
                                    +{diff.toFixed(3)}
                                  </span>
                                : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-500/20 text-red-400 font-bold text-sm">
                                    {diff.toFixed(3)}
                                  </span>}
                        </td>
                        {/* سبب الفرق — مطلوب فقط عند وجود فرق */}
                        <td className="p-3">
                          {hasDiff && (
                            <input type="text" value={itemNotes[p.id] ?? ""}
                              onChange={e => setItemNotes(prev => ({ ...prev, [p.id]: e.target.value }))}
                              placeholder="سبب الفرق (مطلوب)"
                              className="w-44 bg-white/10 border border-amber-500/30 rounded-lg px-2 py-1 text-white placeholder:text-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-400/40 text-xs" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {countTableProducts.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center text-white/40 py-12">
                        {countMode === "partial" ? "لم تُحدَّد منتجات للجرد الجزئي" : "لا توجد منتجات في هذا المخزن"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* سجل الجلسات */}
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
 * TAB 3 — تحويل المخزون
 * ═══════════════════════════════════════════════════════════════════════════ */
interface TransferLine { product_id: number; product_name: string; quantity: string }

function TransferTab({ warehouses, qc, toast }: {
  warehouses: { id: number; name: string }[];
  qc: ReturnType<typeof useQueryClient>;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const defaultFirst  = warehouses[0]?.id ?? 1;
  const defaultSecond = warehouses[1]?.id ?? 2;
  const [fromWH, setFromWH]         = useState<number>(defaultFirst);
  const [toWH, setToWH]             = useState<number>(defaultSecond);
  const [transferNotes, setTransferNotes] = useState("");
  const [lines, setLines]           = useState<TransferLine[]>([{ product_id: 0, product_name: "", quantity: "" }]);
  const [view, setView]             = useState<"new" | "history">("new");

  /* fetch global product list for names */
  const { data: auditData } = useQuery<{ products: AuditProduct[] }>({
    queryKey: ["inventory-audit", null],
    queryFn: () => authFetch(api("/api/inventory/audit")).then(r => r.json()),
  });

  /* fetch from-warehouse per-product stock */
  const { data: fromWhAudit, isLoading: loadingFromWh } = useQuery<{ products: AuditProduct[] }>({
    queryKey: ["inventory-audit", fromWH],
    queryFn: () => authFetch(api(`/api/inventory/audit?warehouse_id=${fromWH}`)).then(r => r.json()),
    enabled: fromWH > 0,
    staleTime: 15_000,
  });

  const { data: transfers, refetch: refetchTransfers } = useQuery<StockTransfer[]>({
    queryKey: ["inventory-transfers"],
    queryFn: () => authFetch(api("/api/inventory/transfers")).then(r => r.json()),
  });

  const allProducts  = auditData?.products ?? [];
  const fromWhStock  = new Map((fromWhAudit?.products ?? []).map(p => [p.id, p.calculated_qty]));

  /* reset lines when from-warehouse changes */
  useEffect(() => {
    setLines([{ product_id: 0, product_name: "", quantity: "" }]);
  }, [fromWH]);

  function getAvailableQty(productId: number): number {
    if (!productId) return 0;
    return fromWhStock.get(productId) ?? 0;
  }

  function lineHasInsufficientQty(line: TransferLine): boolean {
    if (!line.product_id || !line.quantity) return false;
    const qty = parseFloat(line.quantity);
    return qty > 0 && qty > getAvailableQty(line.product_id);
  }

  const hasAnyInsufficientQty = lines.some(lineHasInsufficientQty);

  const transferMutation = useMutation({
    mutationFn: () => {
      if (fromWH === toWH) throw new Error("لا يمكن التحويل من مخزن إلى نفسه");
      const validLines = lines.filter(l => l.product_id > 0 && parseFloat(l.quantity) > 0);
      if (validLines.length === 0) throw new Error("أضف منتجاً واحداً على الأقل مع كمية صحيحة");
      if (hasAnyInsufficientQty) throw new Error("كمية غير كافية في مخزن المصدر لبعض المنتجات");
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
      qc.invalidateQueries({ queryKey: ["inventory-warehouse-summary"] });
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
          {/* بيانات التحويل */}
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
                  <ArrowLeft className="w-4 h-4 text-violet-400" />
                </div>
              </div>
              <div>
                <label className="block text-white/50 text-xs mb-1.5">إلى مخزن <span className="text-red-400">*</span></label>
                <select value={toWH} onChange={e => setToWH(Number(e.target.value))}
                  className={`w-full bg-white/10 border rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/50 ${
                    fromWH === toWH ? "border-red-500/40" : "border-white/20"
                  }`}>
                  {warehouses.map(w => <option key={w.id} value={w.id} className="bg-[#1a1a2e]">{w.name}</option>)}
                </select>
                {fromWH === toWH && <p className="text-red-400 text-xs mt-1">يجب اختيار مخزن مختلف</p>}
              </div>
            </div>
            <div>
              <label className="block text-white/50 text-xs mb-1.5">ملاحظات (اختياري)</label>
              <input type="text" value={transferNotes} onChange={e => setTransferNotes(e.target.value)}
                placeholder="سبب التحويل..."
                className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-violet-400/50" />
            </div>
          </div>

          {/* جدول المنتجات */}
          <div className="bg-[#111827] border border-white/8 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white/70">المنتجات المحوَّلة</h3>
            <div className="space-y-3">
              {lines.map((line, idx) => {
                const availableQty = getAvailableQty(line.product_id);
                const insufficient = lineHasInsufficientQty(line);
                const requestedQty = parseFloat(line.quantity) || 0;
                return (
                  <div key={idx} className={`border rounded-xl p-4 space-y-3 transition-colors ${insufficient ? "border-red-500/30 bg-red-500/5" : "border-white/8 bg-white/3"}`}>
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-start">
                      {/* اختيار المنتج */}
                      <div>
                        <label className="block text-white/50 text-xs mb-1.5">المنتج</label>
                        <select value={line.product_id} onChange={e => updateLine(idx, "product_id", e.target.value)}
                          className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/50">
                          <option value={0} className="bg-[#1a1a2e]">— اختر منتجاً —</option>
                          {allProducts.map(p => (
                            <option key={p.id} value={p.id} className="bg-[#1a1a2e]">{p.name}</option>
                          ))}
                        </select>
                        {/* عرض الكمية المتاحة في مخزن المصدر */}
                        {line.product_id > 0 && (
                          <div className={`mt-1 text-xs flex items-center gap-1 ${availableQty > 0 ? "text-white/40" : "text-red-400/70"}`}>
                            <span>متاح في {warehouses.find(w => w.id === fromWH)?.name ?? "المصدر"}:</span>
                            <span className={`font-bold font-mono ${availableQty <= 0 ? "text-red-400" : availableQty < 5 ? "text-amber-400" : "text-emerald-400"}`}>
                              {loadingFromWh ? "..." : availableQty.toFixed(2)}
                            </span>
                            <span>وحدة</span>
                          </div>
                        )}
                      </div>
                      {/* الكمية */}
                      <div className="md:w-36">
                        <label className="block text-white/50 text-xs mb-1.5">الكمية</label>
                        <input type="number" min="0.001" step="0.001"
                          value={line.quantity}
                          onChange={e => updateLine(idx, "quantity", e.target.value)}
                          placeholder="0"
                          className={`w-full bg-white/10 border rounded-xl px-3 py-2 text-white text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 font-mono ${
                            insufficient ? "border-red-500/40 focus:ring-red-400/40" : "border-white/20 focus:ring-violet-400/50"
                          }`} />
                      </div>
                      {/* حذف السطر */}
                      <div className="flex items-end">
                        <button onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))}
                          disabled={lines.length === 1}
                          className="p-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {/* تحذير الكمية غير الكافية */}
                    {insufficient && (
                      <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        الكمية المطلوبة ({requestedQty.toFixed(2)}) تتجاوز المتاح ({availableQty.toFixed(2)} وحدة)
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => setLines(prev => [...prev, { product_id: 0, product_name: "", quantity: "" }])}
              className="flex items-center gap-2 text-sm text-violet-400 hover:text-violet-200 transition-colors">
              <Plus className="w-4 h-4" /> إضافة منتج
            </button>
          </div>

          {/* زر التنفيذ */}
          <button
            onClick={() => transferMutation.mutate()}
            disabled={transferMutation.isPending || validLinesCount === 0 || fromWH === toWH || hasAnyInsufficientQty}
            className="w-full py-3 rounded-xl bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2">
            {transferMutation.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> جاري التحويل...</>
              : <><Truck className="w-4 h-4" /> تنفيذ التحويل ({validLinesCount} منتج)</>}
          </button>
          {hasAnyInsufficientQty && (
            <p className="text-red-400 text-xs text-center">بعض الكميات تتجاوز المتاح في مخزن المصدر</p>
          )}
        </div>
      )}

      {/* سجل التحويلات */}
      {view === "history" && (
        <div className="space-y-3">
          {safeArray(transfers).length === 0 && (
            <p className="text-white/40 text-center py-12">لا توجد تحويلات سابقة</p>
          )}
          {safeArray(transfers).map(t => {
            const fromName = warehouses.find(w => w.id === t.from_warehouse_id)?.name ?? `#${t.from_warehouse_id}`;
            const toName   = warehouses.find(w => w.id === t.to_warehouse_id)?.name   ?? `#${t.to_warehouse_id}`;
            return (
              <div key={t.id} className="bg-[#111827] border border-white/8 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-white font-bold">تحويل #{t.id}</span>
                    <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-300">
                      {t.status === "completed" ? "مكتمل" : t.status}
                    </span>
                  </div>
                  <span className="text-white/30 text-xs">{new Date(t.created_at).toLocaleDateString("ar-EG")}</span>
                </div>
                <div className="flex items-center gap-2 mt-2 text-sm">
                  <span className="text-amber-300 font-medium">{fromName}</span>
                  <ArrowLeft className="w-4 h-4 text-white/30" />
                  <span className="text-emerald-300 font-medium">{toName}</span>
                </div>
                {t.notes && <p className="text-white/30 text-xs mt-1">{t.notes}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
