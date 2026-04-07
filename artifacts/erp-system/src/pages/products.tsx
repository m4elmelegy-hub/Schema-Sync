import { useState, useRef, useEffect } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useAuth } from "@/contexts/auth";
import { hasPermission } from "@/lib/permissions";
import { useGetProducts, useCreateProduct, useDeleteProduct, useGetCategories, useUpdateCategory, useDeleteCategory, useCreateCategory } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/format";
import {
  Plus, Search, Trash2, AlertTriangle, Pencil, FileDown, Package, ShieldX, Check, X, Tag,
} from "lucide-react";
import { exportProductsExcel } from "@/lib/export-excel";
import { useToast } from "@/hooks/use-toast";
import { TableSkeleton } from "@/components/skeletons";
import { ConfirmModal } from "@/components/confirm-modal";
import { ProductFormModal, ProductFormData, emptyProductForm } from "@/components/product-form-modal";
import { safeArray } from "@/lib/safe-data";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

function AccessDenied({ msg }: { msg: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <ShieldX className="w-14 h-14 text-red-400/40 mb-4" />
      <p className="text-white/60 font-bold text-lg">غير مصرح</p>
      <p className="text-white/30 text-sm mt-1">{msg}</p>
    </div>
  );
}

function ProductsTab() {
  const { data: productsRaw = [], isLoading } = useGetProducts();
  const products = safeArray(productsRaw);
  const { data: categoriesRaw } = useGetCategories();
  const categories = safeArray(categoriesRaw);
  const { user } = useAuth();
  const canViewProducts   = hasPermission(user, "can_view_products")   === true;
  const canManageProducts = hasPermission(user, "can_manage_products") === true;
  const createMutation = useCreateProduct();
  const deleteMutation = useDeleteProduct();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch]               = useState("");
  const [catFilter, setCatFilter]         = useState("");
  const [showAdd, setShowAdd]             = useState(false);
  const [editProduct, setEditProduct]     = useState<(ProductFormData & { id: number }) | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: ProductFormData }) => {
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
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      setEditProduct(null);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const filtered = products.filter(p => {
    const matchSearch =
      p.name.includes(search) ||
      (p.sku && p.sku.includes(search)) ||
      (p.category_name && p.category_name.includes(search)) ||
      (p.category && p.category.includes(search));
    const matchCat = !catFilter || p.category_name === catFilter || p.category === catFilter;
    return matchSearch && matchCat;
  });

  const handleAdd = (data: ProductFormData) => {
    createMutation.mutate({ data }, {
      onSuccess: () => {
        toast({ title: "✅ تم إضافة المنتج بنجاح" });
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
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
        queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
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
      category_id: product.category_id ?? null,
      category_name: product.category_name || product.category || "",
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
        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
            <input
              type="text"
              placeholder="بحث عن منتج..."
              className="glass-input pl-4 pr-12 w-64"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {categories.length > 0 && (
            <select
              className="glass-input appearance-none w-44 cursor-pointer"
              value={catFilter}
              onChange={e => setCatFilter(e.target.value)}
            >
              <option value="">كل الأصناف</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.name} className="bg-gray-900">
                  {cat.name} ({cat.product_count})
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportProductsExcel(products)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30 transition-all whitespace-nowrap"
          >
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
        <ProductFormModal
          title="منتج جديد"
          initial={emptyProductForm}
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
      {editProduct && (
        <ProductFormModal
          title={`تعديل: ${editProduct.name}`}
          initial={editProduct}
          onSave={(data) => updateMutation.mutate({ id: editProduct.id, data })}
          onClose={() => setEditProduct(null)}
          isPending={updateMutation.isPending}
        />
      )}

      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-white/80 whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-4 font-semibold text-white/60">المنتج</th>
                <th className="p-4 font-semibold text-white/60">الباركود</th>
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
                    <p className="text-white/40 font-bold">لا توجد منتجات</p>
                    <p className="text-white/20 text-sm mt-1">
                      {search || catFilter ? "جرب كلمة بحث أو تصنيف مختلف" : "اضغط «إضافة منتج» لإضافة أول منتج"}
                    </p>
                    {canManageProducts && !search && !catFilter && (
                      <button
                        onClick={() => setShowAdd(true)}
                        className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:bg-amber-500/30 transition-all"
                      >
                        <Plus className="w-4 h-4" /> إضافة أول منتج
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map(product => {
                  const displayCat = product.category_name || product.category;
                  const isLow = product.low_stock_threshold !== null && product.quantity <= (product.low_stock_threshold ?? 5);
                  const margin = Number(product.sale_price) > 0
                    ? ((Number(product.sale_price) - Number(product.cost_price)) / Number(product.sale_price)) * 100
                    : 0;
                  return (
                    <tr key={product.id} className="border-b border-white/5 erp-table-row">
                      <td className="p-4 font-bold text-white">{product.name}</td>
                      <td className="p-4 text-amber-300/70 font-mono text-xs">{product.sku || '—'}</td>
                      <td className="p-4">
                        {displayCat ? (
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20">
                            {displayCat}
                          </span>
                        ) : '—'}
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
                          isLow
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        }`}>
                          {isLow && <AlertTriangle className="w-3 h-3" />}
                          {product.quantity}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-center gap-2">
                          {canManageProducts && (
                            <button
                              onClick={() => openEdit(product)}
                              title="تعديل المنتج"
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-blue-400 text-xs font-bold cursor-pointer border border-blue-400/40 bg-blue-500/20 hover:bg-blue-500/30 transition-colors"
                            >
                              <Pencil style={{ width: "14px", height: "14px" }} /> تعديل
                            </button>
                          )}
                          {canManageProducts && (
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

function CategoriesTab() {
  const { user } = useAuth();
  const canManage = hasPermission(user, "can_manage_products") === true;
  const { data: categoriesRaw, isLoading } = useGetCategories();
  const categories = safeArray(categoriesRaw);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const updateMutation = useUpdateCategory();
  const deleteMutation = useDeleteCategory();
  const createMutation = useCreateCategory();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [newName, setNewName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId !== null) inputRef.current?.focus();
  }, [editingId]);

  const startEdit = (id: number, name: string) => {
    setEditingId(id);
    setEditName(name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };

  const extractErr = (e: unknown, fallback: string) => {
    const anyE = e as { data?: { error?: string }; message?: string } | null;
    return anyE?.data?.error ?? anyE?.message ?? fallback;
  };

  const saveEdit = (id: number) => {
    const trimmed = editName.trim();
    if (!trimmed) { cancelEdit(); return; }
    updateMutation.mutate({ id, data: { name: trimmed } }, {
      onSuccess: () => {
        toast({ title: "✅ تم تعديل اسم التصنيف" });
        queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        cancelEdit();
      },
      onError: (e: unknown) => {
        toast({ title: extractErr(e, "خطأ في التعديل"), variant: "destructive" });
        cancelEdit();
      },
    });
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "✅ تم حذف التصنيف" });
        queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
        setConfirmDeleteId(null);
      },
      onError: (e: unknown) => {
        toast({ title: extractErr(e, "خطأ في الحذف"), variant: "destructive" });
        setConfirmDeleteId(null);
      },
    });
  };

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    createMutation.mutate({ data: { name: trimmed } }, {
      onSuccess: () => {
        toast({ title: "✅ تم إنشاء التصنيف" });
        queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
        setNewName("");
      },
      onError: (e: unknown) => {
        toast({ title: extractErr(e, "خطأ في الإنشاء"), variant: "destructive" });
      },
    });
  };

  const confirmTarget = confirmDeleteId !== null
    ? categories.find(c => c.id === confirmDeleteId)
    : null;

  return (
    <div className="space-y-6 max-w-2xl">
      {canManage && (
        <div className="glass-panel rounded-2xl p-4 border border-white/5 flex gap-3 items-center">
          <Tag className="w-5 h-5 text-amber-400 shrink-0" />
          <input
            type="text"
            placeholder="اسم التصنيف الجديد..."
            className="glass-input flex-1"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleCreate(); }}
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || createMutation.isPending}
            className="btn-primary flex items-center gap-2 whitespace-nowrap disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> إضافة
          </button>
        </div>
      )}

      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        {isLoading ? (
          <div className="p-8 text-center text-white/40">جاري التحميل...</div>
        ) : categories.length === 0 ? (
          <div className="p-14 text-center">
            <Tag className="w-10 h-10 text-white/20 mx-auto mb-3" />
            <p className="text-white/40 font-bold">لا توجد تصنيفات</p>
            <p className="text-white/20 text-sm mt-1">أضف أول تصنيف من الحقل أعلاه</p>
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {categories.map(cat => (
              <li key={cat.id} className="flex items-center gap-3 px-5 py-4 hover:bg-white/[0.02] transition-colors">
                <Tag className="w-4 h-4 text-amber-400/60 shrink-0" />

                {editingId === cat.id ? (
                  <input
                    ref={inputRef}
                    className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-amber-400/60"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") saveEdit(cat.id);
                      if (e.key === "Escape") cancelEdit();
                    }}
                  />
                ) : (
                  <span className="flex-1 text-white font-semibold text-sm">{cat.name}</span>
                )}

                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                  (cat.product_count ?? 0) > 0
                    ? "bg-amber-500/15 text-amber-400 border-amber-500/20"
                    : "bg-white/5 text-white/30 border-white/10"
                }`}>
                  {cat.product_count ?? 0} منتج
                </span>

                {canManage && (
                  <div className="flex items-center gap-1 shrink-0">
                    {editingId === cat.id ? (
                      <>
                        <button
                          onClick={() => saveEdit(cat.id)}
                          disabled={updateMutation.isPending}
                          className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-400/10 transition-colors disabled:opacity-50"
                          title="حفظ"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="p-1.5 rounded-lg text-white/40 hover:bg-white/5 transition-colors"
                          title="إلغاء"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(cat.id, cat.name)}
                          className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-400/10 transition-colors"
                          title="تعديل الاسم"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(cat.id)}
                          disabled={(cat.product_count ?? 0) > 0}
                          className="p-1.5 rounded-lg text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title={(cat.product_count ?? 0) > 0 ? "لا يمكن الحذف — مرتبط بمنتجات" : "حذف التصنيف"}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {confirmTarget && (
        <ConfirmModal
          title="حذف التصنيف"
          description={`هل أنت متأكد من حذف «${confirmTarget.name}»؟ لا يمكن التراجع.`}
          isPending={deleteMutation.isPending}
          onConfirm={() => handleDelete(confirmTarget.id)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}

export default function Products() {
  const [activeTab, setActiveTab] = useState<"products" | "categories">("products");

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b border-white/10 pb-0">
        <button
          onClick={() => setActiveTab("products")}
          className={`px-5 py-2.5 text-sm font-bold rounded-t-xl transition-all ${
            activeTab === "products"
              ? "bg-white/10 text-white border border-white/10 border-b-transparent"
              : "text-white/40 hover:text-white/70"
          }`}
        >
          <span className="flex items-center gap-2"><Package className="w-4 h-4" /> المنتجات</span>
        </button>
        <button
          onClick={() => setActiveTab("categories")}
          className={`px-5 py-2.5 text-sm font-bold rounded-t-xl transition-all ${
            activeTab === "categories"
              ? "bg-white/10 text-white border border-white/10 border-b-transparent"
              : "text-white/40 hover:text-white/70"
          }`}
        >
          <span className="flex items-center gap-2"><Tag className="w-4 h-4" /> التصنيفات</span>
        </button>
      </div>

      {activeTab === "products" ? <ProductsTab /> : <CategoriesTab />}
    </div>
  );
}
