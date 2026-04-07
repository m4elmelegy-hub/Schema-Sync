import { useState, useRef, useEffect } from "react";
import { X, Plus, RefreshCw, Tag, ChevronDown, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { useGetCategories, useCreateCategory } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { safeArray } from "@/lib/safe-data";

export type ProductFormData = {
  name: string;
  sku: string;
  category_id: number | null;
  category_name: string;
  quantity: number;
  cost_price: number;
  sale_price: number;
  low_stock_threshold: number;
};

export const emptyProductForm: ProductFormData = {
  name: "", sku: "", category_id: null, category_name: "",
  quantity: 0, cost_price: 0, sale_price: 0, low_stock_threshold: 5,
};

export function generateBarcode(): string {
  const ts = Date.now().toString().slice(-9);
  const rand = Math.floor(Math.random() * 100).toString().padStart(2, "0");
  return `HT${ts}${rand}`;
}

interface ProductFormModalProps {
  title?: string;
  initial?: Partial<ProductFormData>;
  onSave: (data: ProductFormData) => void;
  onClose: () => void;
  isPending: boolean;
}

export function ProductFormModal({
  title = "منتج جديد",
  initial,
  onSave,
  onClose,
  isPending,
}: ProductFormModalProps) {
  const queryClient = useQueryClient();
  const { data: catsRaw } = useGetCategories();
  const categories = safeArray(catsRaw);
  const createCategoryMutation = useCreateCategory();

  const [form, setForm] = useState<ProductFormData>({
    ...emptyProductForm,
    sku: generateBarcode(),
    ...initial,
  });

  const set = (k: keyof ProductFormData, v: string | number | null) =>
    setForm(f => ({ ...f, [k]: v }));

  const [catInput, setCatInput] = useState(initial?.category_name || "");
  const [catOpen, setCatOpen] = useState(false);
  const [catCreating, setCatCreating] = useState(false);
  const catRef = useRef<HTMLDivElement>(null);

  const filtered = catInput.trim()
    ? categories.filter(c => c.name.toLowerCase().includes(catInput.trim().toLowerCase()))
    : categories;

  const exactMatch = categories.some(
    c => c.name.toLowerCase() === catInput.trim().toLowerCase()
  );
  const canCreate = catInput.trim().length > 0 && !exactMatch;

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (catRef.current && !catRef.current.contains(e.target as Node)) {
        setCatOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selectCategory = (cat: { id: number; name: string }) => {
    set("category_id", cat.id);
    set("category_name", cat.name);
    setCatInput(cat.name);
    setCatOpen(false);
  };

  const handleCreateCategory = () => {
    const name = catInput.trim();
    if (!name) return;
    setCatCreating(true);
    createCategoryMutation.mutate({ data: { name } }, {
      onSuccess: (newCat) => {
        queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
        selectCategory({ id: newCat.id, name: newCat.name });
        setCatCreating(false);
      },
      onError: () => setCatCreating(false),
    });
  };

  const margin =
    form.cost_price > 0 && form.sale_price > 0
      ? ((form.sale_price - form.cost_price) / form.sale_price) * 100
      : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalSku = form.sku.trim() || generateBarcode();
    onSave({ ...form, sku: finalSku });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm modal-overlay">
      <form
        onSubmit={handleSubmit}
        className="glass-panel rounded-3xl p-8 w-full max-w-md shadow-2xl border border-white/10 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Plus className="w-5 h-5 text-amber-400" /> {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
          >
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-white/70 text-xs mb-1">اسم المنتج *</label>
            <input
              required
              type="text"
              className="glass-input"
              placeholder="مثال: شاشة سامسونج 6.5"
              value={form.name}
              onChange={e => set("name", e.target.value)}
            />
          </div>

          {/* Barcode */}
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-3">
            <label className="text-amber-400 text-xs font-bold mb-2 block">🔲 الباركود / SKU</label>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                className="glass-input flex-1 font-mono text-sm tracking-wider text-amber-300"
                value={form.sku}
                onChange={e => set("sku", e.target.value)}
                placeholder="تلقائي عند الحفظ"
              />
              <button
                type="button"
                onClick={() => set("sku", generateBarcode())}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 text-xs font-bold shrink-0 transition-all"
              >
                <RefreshCw className="w-3 h-3" /> توليد
              </button>
            </div>
            <p className="text-white/25 text-xs mt-1.5">إذا تُرك فارغاً سيُولَّد تلقائياً عند الحفظ</p>
          </div>

          {/* Category — combobox */}
          <div>
            <label className="flex items-center gap-1 text-white/70 text-xs mb-1">
              <Tag className="w-3 h-3 text-violet-400" /> التصنيف *
            </label>
            <div className="relative" ref={catRef}>
              <div className="flex gap-1">
                <div className="relative flex-1">
                  <input
                    type="text"
                    required={!form.category_id}
                    className="glass-input w-full pl-8"
                    placeholder="ابحث أو أنشئ تصنيفاً..."
                    value={catInput}
                    autoComplete="off"
                    onChange={e => {
                      setCatInput(e.target.value);
                      set("category_id", null);
                      set("category_name", "");
                      setCatOpen(true);
                    }}
                    onFocus={() => setCatOpen(true)}
                  />
                  <ChevronDown className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
                </div>
                {catCreating && (
                  <div className="px-3 flex items-center">
                    <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
                  </div>
                )}
              </div>

              {catOpen && (
                <div className="absolute top-full mt-1 w-full z-50 glass-panel rounded-xl border border-white/10 shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                  {filtered.length === 0 && !canCreate && (
                    <p className="px-3 py-2 text-white/40 text-xs text-center">لا توجد تصنيفات</p>
                  )}
                  {filtered.map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => selectCategory(cat)}
                      className={`w-full text-right px-3 py-2 text-sm hover:bg-white/10 transition-colors flex items-center justify-between ${
                        form.category_id === cat.id ? "text-violet-300 bg-violet-500/10" : "text-white/80"
                      }`}
                    >
                      <span>{cat.name}</span>
                      <span className="text-white/30 text-xs">{cat.product_count} منتج</span>
                    </button>
                  ))}
                  {canCreate && (
                    <button
                      type="button"
                      onClick={handleCreateCategory}
                      disabled={catCreating}
                      className="w-full text-right px-3 py-2 text-sm text-violet-400 hover:bg-violet-500/10 transition-colors border-t border-white/10 flex items-center gap-2"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      إنشاء «{catInput.trim()}»
                    </button>
                  )}
                </div>
              )}
            </div>
            {form.category_id && (
              <p className="text-violet-400/70 text-xs mt-1 flex items-center gap-1">
                ✓ تم اختيار: {form.category_name}
              </p>
            )}
          </div>

          {/* Prices */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-white/70 text-xs mb-1">سعر التكلفة *</label>
              <input
                required
                type="number"
                step="0.01"
                min="0"
                className="glass-input"
                placeholder="0.00"
                value={form.cost_price || ""}
                onChange={e => set("cost_price", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="block text-white/70 text-xs mb-1">سعر البيع *</label>
              <input
                required
                type="number"
                step="0.01"
                min="0"
                className="glass-input"
                placeholder="0.00"
                value={form.sale_price || ""}
                onChange={e => set("sale_price", parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* Margin preview */}
          {form.cost_price > 0 && form.sale_price > 0 && (
            <div
              className={`rounded-xl px-3 py-2 text-xs border ${
                margin >= 20
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                  : margin > 0
                  ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                  : "bg-red-500/10 border-red-500/20 text-red-400"
              }`}
            >
              هامش الربح: {margin.toFixed(1)}% | ربح الوحدة: {formatCurrency(form.sale_price - form.cost_price)}
            </div>
          )}

          {/* Quantity + threshold */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-white/70 text-xs mb-1">الكمية الافتتاحية</label>
              <input
                type="number"
                min="0"
                className="glass-input"
                value={form.quantity || ""}
                onChange={e => set("quantity", parseInt(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="block text-white/70 text-xs mb-1">حد التنبيه</label>
              <input
                type="number"
                min="0"
                className="glass-input"
                value={form.low_stock_threshold || ""}
                onChange={e => set("low_stock_threshold", parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button type="submit" disabled={isPending} className="flex-1 btn-primary py-3 font-bold">
            {isPending ? "جاري الحفظ..." : "حفظ المنتج"}
          </button>
          <button type="button" onClick={onClose} className="flex-1 btn-secondary py-3">
            إلغاء
          </button>
        </div>
      </form>
    </div>
  );
}
