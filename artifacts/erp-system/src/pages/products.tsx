import { useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useAuth } from "@/contexts/auth";
import { hasPermission } from "@/lib/permissions";
import { useGetProducts, useCreateProduct, useDeleteProduct } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWarehouse } from "@/contexts/warehouse";
import { formatCurrency } from "@/lib/format";
import {
  Plus, Search, Trash2, AlertTriangle, Pencil, X, FileDown, Package,
  RefreshCw, ChevronDown, ChevronUp, Edit3, TrendingDown, ShieldX,
} from "lucide-react";
import { exportProductsExcel } from "@/lib/export-excel";
import { useToast } from "@/hooks/use-toast";
import { TableSkeleton } from "@/components/skeletons";
import { ConfirmModal } from "@/components/confirm-modal";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

const CATEGORIES = [
  "شاشات", "بطاريات", "هوسنجات", "فلاتر", "أجراس",
  "سماعات", "بورد تقطيع", "ضهور", "مبرمجات",
];

type ProductForm = {
  name: string; sku: string; category: string;
  quantity: number; cost_price: number; sale_price: number; low_stock_threshold: number;
};

const emptyForm: ProductForm = {
  name: "", sku: "", category: "", quantity: 0, cost_price: 0, sale_price: 0, low_stock_threshold: 5,
};

/* ─── Inventory interfaces ─── */
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

const movementTypeLabel: Record<string, { label: string; color: string; sign: "+" | "-" | "±" }> = {
  opening_balance: { label: "رصيد افتتاحي",  color: "bg-blue-500/20 text-blue-300",     sign: "+" },
  purchase:        { label: "مشتريات",         color: "bg-emerald-500/20 text-emerald-300", sign: "+" },
  sale:            { label: "مبيعات",          color: "bg-red-500/20 text-red-300",        sign: "-" },
  sale_return:     { label: "مرتجع مبيعات",    color: "bg-teal-500/20 text-teal-300",      sign: "+" },
  purchase_return: { label: "مرتجع مشتريات",   color: "bg-orange-500/20 text-orange-300",  sign: "-" },
  adjustment:      { label: "تسوية يدوية",     color: "bg-violet-500/20 text-violet-300",  sign: "±" },
};

/* ─── نافذة الإضافة / التعديل ─── */
function ProductModal({ title, initial, onSave, onClose, isPending }: {
  title: string; initial: ProductForm; onSave: (data: ProductForm) => void;
  onClose: () => void; isPending: boolean;
}) {
  const [form, setForm] = useState<ProductForm>(initial);
  const set = (k: keyof ProductForm, v: string | number) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm modal-overlay">
      <form onSubmit={e => { e.preventDefault(); onSave(form); }}
        className="glass-panel rounded-3xl p-8 w-full max-w-md shadow-2xl border border-white/10">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-bold text-white flex items-center gap-2">
            <Plus className="w-6 h-6 text-amber-400" /> {title}
          </h3>
          <button type="button" onClick={onClose} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-white/70 text-sm mb-1">اسم المنتج *</label>
            <input required type="text" className="glass-input" placeholder="مثال: شاشة سامسونج 6.5"
              value={form.name} onChange={e => set("name", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-white/70 text-sm mb-1">الرمز (SKU)</label>
              <input type="text" className="glass-input" placeholder="اختياري"
                value={form.sku} onChange={e => set("sku", e.target.value)} />
            </div>
            <div>
              <label className="block text-white/70 text-sm mb-1">التصنيف *</label>
              <select required className="glass-input appearance-none cursor-pointer"
                value={form.category} onChange={e => set("category", e.target.value)}>
                <option value="" disabled>اختر التصنيف</option>
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat} className="bg-gray-900 text-white">{cat}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-white/70 text-sm mb-1">سعر التكلفة *</label>
              <input required type="number" step="0.01" min="0" className="glass-input"
                placeholder="0.00" value={form.cost_price || ""}
                onChange={e => set("cost_price", parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <label className="block text-white/70 text-sm mb-1">سعر البيع *</label>
              <input required type="number" step="0.01" min="0" className="glass-input"
                placeholder="0.00" value={form.sale_price || ""}
                onChange={e => set("sale_price", parseFloat(e.target.value) || 0)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-white/70 text-sm mb-1">الكمية</label>
              <input type="number" min="0" className="glass-input"
                value={form.quantity || ""}
                onChange={e => set("quantity", parseInt(e.target.value) || 0)} />
            </div>
            <div>
              <label className="block text-white/70 text-sm mb-1">حد التنبيه (نواقص)</label>
              <input type="number" min="0" className="glass-input"
                value={form.low_stock_threshold || ""}
                onChange={e => set("low_stock_threshold", parseInt(e.target.value) || 0)} />
            </div>
          </div>
          {form.cost_price > 0 && form.sale_price > 0 && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2 text-xs text-emerald-400">
              هامش الربح المتوقع: {(((form.sale_price - form.cost_price) / form.sale_price) * 100).toFixed(1)}% |{" "}
              ربح الوحدة: {formatCurrency(form.sale_price - form.cost_price)}
            </div>
          )}
        </div>
        <div className="flex gap-4 mt-8">
          <button type="submit" disabled={isPending} className="flex-1 btn-primary py-3">
            {isPending ? "جاري الحفظ..." : "حفظ"}
          </button>
          <button type="button" onClick={onClose} className="flex-1 btn-secondary py-3">إلغاء</button>
        </div>
      </form>
    </div>
  );
}

/* ─── No Permission ─── */
function AccessDenied({ msg }: { msg: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <ShieldX className="w-14 h-14 text-red-400/40 mb-4" />
      <p className="text-white/60 font-bold text-lg">غير مصرح</p>
      <p className="text-white/30 text-sm mt-1">{msg}</p>
    </div>
  );
}

/* ─── تاب المنتجات ─── */
function ProductsTab() {
  const { data: products = [], isLoading } = useGetProducts();
  const { user } = useAuth();
  const canViewProducts   = hasPermission(user, "can_view_products")   === true;
  const canManageProducts = hasPermission(user, "can_manage_products") === true;
  const createMutation = useCreateProduct();
  const deleteMutation = useDeleteProduct();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch]               = useState("");
  const [showAdd, setShowAdd]             = useState(false);
  const [editProduct, setEditProduct]     = useState<(ProductForm & { id: number }) | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: ProductForm }) => {
      const r = await authFetch(api(`/api/products/${id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "خطأ في التحديث");
      return j;
    },
    onSuccess: () => {
      toast({ title: "✅ تم تعديل المنتج بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setEditProduct(null);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const filtered = products.filter(p =>
    p.name.includes(search) ||
    (p.sku && p.sku.includes(search)) ||
    (p.category && p.category.includes(search))
  );

  const handleAdd = (data: ProductForm) => {
    createMutation.mutate({ data }, {
      onSuccess: () => {
        toast({ title: "✅ تم إضافة المنتج بنجاح" });
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        setShowAdd(false);
      },
      onError: () => toast({ title: "حدث خطأ", variant: "destructive" }),
    });
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "تم حذف المنتج بنجاح" });
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        setConfirmDeleteId(null);
      },
      onError: (e: Error) => {
        toast({ title: e.message, variant: "destructive" });
        setConfirmDeleteId(null);
      },
    });
  };

  const openEdit = (product: typeof products[0]) => {
    setEditProduct({
      id: product.id,
      name: product.name,
      sku: product.sku || "",
      category: product.category || "",
      quantity: Number(product.quantity),
      cost_price: Number(product.cost_price),
      sale_price: Number(product.sale_price),
      low_stock_threshold: product.low_stock_threshold ?? 5,
    });
  };

  if (!canViewProducts) return <AccessDenied msg="غير مصرح لك بالوصول إلى المنتجات — تواصل مع المدير لتفعيل الصلاحية" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative w-full max-w-md">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
          <input type="text" placeholder="بحث عن منتج..." className="glass-input pl-4 pr-12 w-full"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => exportProductsExcel(products)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30 transition-all whitespace-nowrap">
            <FileDown className="w-4 h-4" /> Excel
          </button>
          {canManageProducts && (
            <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2 whitespace-nowrap">
              <Plus className="w-5 h-5" /> إضافة منتج
            </button>
          )}
        </div>
      </div>

      {showAdd && (
        <ProductModal title="منتج جديد" initial={emptyForm} onSave={handleAdd}
          onClose={() => setShowAdd(false)} isPending={createMutation.isPending} />
      )}
      {confirmDeleteId !== null && (
        <ConfirmModal title="حذف المنتج" description="هل أنت متأكد؟ سيتم حذف المنتج نهائياً ولا يمكن التراجع."
          isPending={deleteMutation.isPending} onConfirm={() => handleDelete(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)} />
      )}
      {editProduct && (
        <ProductModal title={`تعديل: ${editProduct.name}`} initial={editProduct}
          onSave={(data) => updateMutation.mutate({ id: editProduct.id, data })}
          onClose={() => setEditProduct(null)} isPending={updateMutation.isPending} />
      )}

      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-white/80 whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-4 font-semibold text-white/60">المنتج</th>
                <th className="p-4 font-semibold text-white/60">الرمز</th>
                <th className="p-4 font-semibold text-white/60">التصنيف</th>
                <th className="p-4 font-semibold text-white/60">التكلفة</th>
                <th className="p-4 font-semibold text-white/60">سعر البيع</th>
                <th className="p-4 font-semibold text-white/60">الهامش</th>
                <th className="p-4 font-semibold text-white/60">الكمية</th>
                <th className="p-4 font-semibold text-white/60 w-24 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeleton cols={8} rows={6} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-14 text-center">
                    <Package className="w-10 h-10 text-white/20 mx-auto mb-3" />
                    <p className="text-white/40 font-bold">لا توجد منتجات بعد</p>
                    <p className="text-white/20 text-sm mt-1">{search ? "جرب كلمة بحث مختلفة" : "اضغط «إضافة منتج» لإضافة أول منتج"}</p>
                  </td>
                </tr>
              ) : (
                filtered.map(product => {
                  const isLow = product.low_stock_threshold !== null && product.quantity <= (product.low_stock_threshold ?? 5);
                  const margin = Number(product.sale_price) > 0
                    ? ((Number(product.sale_price) - Number(product.cost_price)) / Number(product.sale_price)) * 100
                    : 0;
                  return (
                    <tr key={product.id} className="border-b border-white/5 erp-table-row">
                      <td className="p-4 font-bold text-white">{product.name}</td>
                      <td className="p-4 text-white/50 font-mono text-xs">{product.sku || '-'}</td>
                      <td className="p-4">
                        {product.category ? (
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20">
                            {product.category}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="p-4 text-white/70">{formatCurrency(Number(product.cost_price))}</td>
                      <td className="p-4 font-bold text-emerald-400">{formatCurrency(Number(product.sale_price))}</td>
                      <td className="p-4 text-center">
                        <span className={`text-xs font-bold ${margin >= 30 ? 'text-emerald-400' : margin >= 15 ? 'text-yellow-400' : 'text-orange-400'}`}>
                          {margin.toFixed(1)}%
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit ${
                          isLow ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        }`}>
                          {isLow && <AlertTriangle className="w-3 h-3" />}
                          {product.quantity}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-center gap-2">
                          {canManageProducts && (
                            <button onClick={() => openEdit(product)} title="تعديل المنتج"
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-blue-400 text-xs font-bold cursor-pointer border border-blue-400/40 bg-blue-500/20 hover:bg-blue-500/30 transition-colors">
                              <Pencil style={{ width: "14px", height: "14px" }} /> تعديل
                            </button>
                          )}
                          {canManageProducts && (
                            <button onClick={() => setConfirmDeleteId(product.id)} title="حذف المنتج"
                              className="p-2 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-400/10 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── تاب المخزون ─── */
function InventoryTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { currentWarehouseId } = useWarehouse();
  const canViewInventory   = hasPermission(user, "can_view_inventory")   === true;
  const canAdjustInventory = hasPermission(user, "can_adjust_inventory") === true;

  const [search, setSearch]                   = useState("");
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  const [sortKey, setSortKey]                 = useState<keyof AuditProduct>("name");
  const [sortAsc, setSortAsc]                 = useState(true);
  const [showAdjust, setShowAdjust]           = useState<number | null>(null);
  const [adjustQty, setAdjustQty]             = useState("");
  const [adjustNotes, setAdjustNotes]         = useState("");

  const warehouseParam = currentWarehouseId ? `?warehouse_id=${currentWarehouseId}` : "";

  const { data: auditData, isLoading, refetch } = useQuery<{ products: AuditProduct[]; summary: AuditSummary }>({
    queryKey: ["inventory-audit", currentWarehouseId],
    queryFn: () => authFetch(api(`/api/inventory/audit${warehouseParam}`)).then(r => {
      if (!r.ok) throw new Error("خطأ في جلب البيانات"); return r.json();
    }),
  });

  const { data: productDetail } = useQuery<ProductDetail>({
    queryKey: ["inventory-product", selectedProduct],
    queryFn: () => authFetch(api(`/api/inventory/product/${selectedProduct}`)).then(r => {
      if (!r.ok) throw new Error("خطأ في جلب البيانات"); return r.json();
    }),
    enabled: selectedProduct !== null,
  });

  const adjustMutation = useMutation({
    mutationFn: ({ product_id, new_quantity, notes }: { product_id: number; new_quantity: number; notes: string }) =>
      authFetch(api("/api/inventory/adjustment"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  const SortIcon = ({ k }: { k: keyof AuditProduct }) => sortKey === k
    ? (sortAsc ? <ChevronUp className="w-3 h-3 inline ms-1" /> : <ChevronDown className="w-3 h-3 inline ms-1" />)
    : null;

  if (!canViewInventory) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center" dir="rtl">
        <ShieldX className="w-16 h-16 text-red-400/50 mb-4" />
        <h2 className="text-xl font-bold text-white/80 mb-2">غير مصرح بالوصول</h2>
        <p className="text-white/40 text-sm">ليس لديك صلاحية لعرض مراجعة المخزون</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* زر تحديث */}
      <div className="flex justify-end">
        <button onClick={() => refetch()}
          className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors text-sm">
          <RefreshCw className="w-4 h-4" /> تحديث
        </button>
      </div>

      {/* بطاقات الملخص */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="text-white/50 text-xs mb-1">إجمالي المنتجات</div>
            <div className="text-2xl font-bold text-white">{summary.total_products}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="text-white/50 text-xs mb-1">قيمة المخزون الكلية</div>
            <div className="text-2xl font-bold text-emerald-400">{formatCurrency(summary.total_inventory_value)}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="text-white/50 text-xs mb-1">تحت حد الطلب</div>
            <div className={`text-2xl font-bold ${summary.low_stock_count > 0 ? "text-amber-400" : "text-white/40"}`}>
              {summary.low_stock_count}
            </div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="text-white/50 text-xs mb-1">نفد المخزون</div>
            <div className={`text-2xl font-bold ${summary.zero_stock_count > 0 ? "text-red-400" : "text-white/40"}`}>
              {summary.zero_stock_count}
            </div>
          </div>
        </div>
      )}

      {/* مفتاح الألوان */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="px-2 py-1 rounded-lg bg-blue-500/20 text-blue-300">↑ رصيد افتتاحي</span>
        <span className="px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-300">↑ مشتريات</span>
        <span className="px-2 py-1 rounded-lg bg-teal-500/20 text-teal-300">↑ مرتجع مبيعات</span>
        <span className="px-2 py-1 rounded-lg bg-red-500/20 text-red-300">↓ مبيعات</span>
        <span className="px-2 py-1 rounded-lg bg-orange-500/20 text-orange-300">↓ مرتجع مشتريات</span>
        <span className="px-2 py-1 rounded-lg bg-violet-500/20 text-violet-300">± تسوية</span>
      </div>

      {/* بحث */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث عن منتج..."
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 pe-10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20" />
        {search && (
          <button onClick={() => setSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* جدول المخزون */}
      {isLoading ? (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-sm min-w-[1100px]"><tbody><TableSkeleton cols={13} rows={7} /></tbody></table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                {[
                  { key: "name" as const, label: "المنتج" },
                  { key: "opening_qty" as const, label: "افتتاحي" },
                  { key: "purchased_qty" as const, label: "وارد مشتريات" },
                  { key: "sale_return_qty" as const, label: "مرتجع مبيعات" },
                  { key: "sold_qty" as const, label: "صادر مبيعات" },
                  { key: "purchase_return_qty" as const, label: "مرتجع مشتريات" },
                  { key: "calculated_qty" as const, label: "محسوب" },
                  { key: "actual_qty" as const, label: "فعلي" },
                  { key: "discrepancy" as const, label: "فرق" },
                  { key: "cost_price" as const, label: "تكلفة" },
                  { key: "total_value" as const, label: "قيمة المخزون" },
                ].map(col => (
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
                          isLow  ? <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" /> :
                          <Package className="w-4 h-4 text-white/30 shrink-0" />}
                        <div>
                          <div className="text-white font-medium">{p.name}</div>
                          {p.sku      && <div className="text-white/40 text-xs">{p.sku}</div>}
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
                      {hasDisc ? (
                        <span className="text-red-400 font-bold">{p.discrepancy > 0 ? `+${p.discrepancy.toFixed(2)}` : p.discrepancy.toFixed(2)}</span>
                      ) : (
                        <span className="text-emerald-400">✓</span>
                      )}
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
                <tr>
                  <td colSpan={12} className="text-center text-white/40 py-12">لا توجد منتجات</td>
                </tr>
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t border-white/20 bg-white/5">
                  <td className="p-3 text-white/60 font-bold" colSpan={10}>المجموع</td>
                  <td className="p-3 text-white font-bold">
                    {formatCurrency(filtered.reduce((s, p) => s + p.total_value, 0))}
                  </td>
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
              <button onClick={() => setSelectedProduct(null)} className="text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <div className="text-xs text-white/40">كمية محسوبة</div>
                <div className="text-xl font-bold text-white">{productDetail.calculated_qty.toFixed(2)}</div>
              </div>
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <div className="text-xs text-white/40">كمية فعلية</div>
                <div className={`text-xl font-bold ${productDetail.actual_qty <= 0 ? "text-red-400" : "text-emerald-400"}`}>
                  {productDetail.actual_qty.toFixed(2)}
                </div>
              </div>
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <div className="text-xs text-white/40">فرق</div>
                <div className={`text-xl font-bold ${Math.abs(productDetail.discrepancy) > 0.001 ? "text-red-400" : "text-emerald-400"}`}>
                  {Math.abs(productDetail.discrepancy) > 0.001 ? productDetail.discrepancy.toFixed(2) : "✓ صفر"}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-white/60 mb-2">سجل الحركات ({productDetail.movements.length})</h3>
              {productDetail.movements.length === 0 && (
                <p className="text-white/30 text-sm text-center py-4">لا توجد حركات مسجّلة</p>
              )}
              {productDetail.movements.map(m => {
                const mt = movementTypeLabel[m.movement_type] ?? { label: m.movement_type, color: "bg-white/10 text-white/60", sign: "±" as const };
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
                      <input type="number" value={adjustQty} onChange={e => setAdjustQty(e.target.value)}
                        min="0" step="0.001"
                        className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-400/50" />
                    </div>
                    <div>
                      <label className="text-xs text-white/50 mb-1 block">سبب التسوية</label>
                      <input type="text" value={adjustNotes} onChange={e => setAdjustNotes(e.target.value)}
                        placeholder="مثال: جرد دوري، تلف..."
                        className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-violet-400/50" />
                    </div>
                  </div>
                  <div className="flex gap-3 mt-5">
                    <button
                      onClick={() => adjustMutation.mutate({ product_id: showAdjust, new_quantity: parseFloat(adjustQty) || 0, notes: adjustNotes })}
                      disabled={adjustMutation.isPending}
                      className="flex-1 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-bold transition-colors disabled:opacity-50">
                      {adjustMutation.isPending ? "جاري الحفظ..." : "تأكيد التسوية"}
                    </button>
                    <button onClick={() => setShowAdjust(null)}
                      className="flex-1 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-colors">
                      إلغاء
                    </button>
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

/* ─── الصفحة الرئيسية ─── */
export default function Products() {
  const [activeTab, setActiveTab] = useState<"products" | "inventory">("products");

  return (
    <div className="space-y-6">
      {/* Tab switcher */}
      <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl p-1 w-fit">
        <button
          onClick={() => setActiveTab("products")}
          className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all ${
            activeTab === "products"
              ? "bg-amber-500 text-black shadow-lg"
              : "text-white/50 hover:text-white"
          }`}
        >
          <Package className="w-4 h-4" />
          المنتجات
        </button>
        <button
          onClick={() => setActiveTab("inventory")}
          className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all ${
            activeTab === "inventory"
              ? "bg-amber-500 text-black shadow-lg"
              : "text-white/50 hover:text-white"
          }`}
        >
          <TrendingDown className="w-4 h-4" />
          مراجعة المخزون
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "products"   && <ProductsTab />}
      {activeTab === "inventory"  && <InventoryTab />}
    </div>
  );
}
