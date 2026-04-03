import { useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useAuth } from "@/contexts/auth";
import { useGetProducts, useCreateProduct, useDeleteProduct } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import { Plus, Search, Trash2, AlertTriangle, Pencil, X, FileDown, Package } from "lucide-react";
import { exportProductsExcel } from "@/lib/export-excel";
import { useQueryClient, useMutation } from "@tanstack/react-query";
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

/* ─── نافذة الإضافة / التعديل ─── */
function ProductModal({ title, initial, onSave, onClose, isPending }: {
  title: string;
  initial: ProductForm;
  onSave: (data: ProductForm) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<ProductForm>(initial);
  const set = (k: keyof ProductForm, v: string | number) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm modal-overlay">
      <form
        onSubmit={e => { e.preventDefault(); onSave(form); }}
        className="glass-panel rounded-3xl p-8 w-full max-w-md shadow-2xl border border-white/10"
      >
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
            <input required type="text" className="glass-input"
              placeholder="مثال: شاشة سامسونج 6.5"
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

/* ─── الصفحة الرئيسية ─── */
export default function Products() {
  const { data: products = [], isLoading } = useGetProducts();
  const { user } = useAuth();
  const isRestricted = user?.role === "cashier" || user?.role === "salesperson";
  const createMutation = useCreateProduct();
  const deleteMutation = useDeleteProduct();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editProduct, setEditProduct] = useState<(ProductForm & { id: number }) | null>(null);
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

  return (
    <div className="space-y-6">
      {/* Top bar */}
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
          <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2 whitespace-nowrap">
            <Plus className="w-5 h-5" /> إضافة منتج
          </button>
        </div>
      </div>

      {/* نافذة الإضافة */}
      {showAdd && (
        <ProductModal
          title="منتج جديد"
          initial={emptyForm}
          onSave={handleAdd}
          onClose={() => setShowAdd(false)}
          isPending={createMutation.isPending}
        />
      )}

      {confirmDeleteId !== null && (
        <ConfirmModal
          title="حذف المنتج"
          description="هل أنت متأكد؟ سيتم حذف المنتج نهائياً ولا يمكن التراجع."
          isPending={deleteMutation.isPending}
          onConfirm={() => handleDelete(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}

      {/* نافذة التعديل */}
      {editProduct && (
        <ProductModal
          title={`تعديل: ${editProduct.name}`}
          initial={editProduct}
          onSave={(data) => updateMutation.mutate({ id: editProduct.id, data })}
          onClose={() => setEditProduct(null)}
          isPending={updateMutation.isPending}
        />
      )}

      {/* الجدول */}
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
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                          {!isRestricted && (
                            <button
                              onClick={() => openEdit(product)}
                              title="تعديل المنتج"
                              style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 10px", borderRadius: "8px", background: "rgba(59,130,246,0.2)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.4)", fontSize: "12px", fontWeight: "bold", cursor: "pointer" }}
                            >
                              <Pencil style={{ width: "14px", height: "14px" }} />
                              تعديل
                            </button>
                          )}
                          {!isRestricted && (
                            <button
                              onClick={() => setConfirmDeleteId(product.id)}
                              title="حذف المنتج"
                              className="p-2 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-400/10 transition-colors"
                            >
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
