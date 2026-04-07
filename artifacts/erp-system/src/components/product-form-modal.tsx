import { useState } from "react";
import { X, Plus, RefreshCw, Tag } from "lucide-react";
import { formatCurrency } from "@/lib/format";

export type ProductFormData = {
  name: string;
  sku: string;
  category: string;
  quantity: number;
  cost_price: number;
  sale_price: number;
  low_stock_threshold: number;
};

export const emptyProductForm: ProductFormData = {
  name: "", sku: "", category: "", quantity: 0,
  cost_price: 0, sale_price: 0, low_stock_threshold: 5,
};

export function generateBarcode(): string {
  const ts = Date.now().toString().slice(-9);
  const rand = Math.floor(Math.random() * 100).toString().padStart(2, "0");
  return `HT${ts}${rand}`;
}

interface ProductFormModalProps {
  title?: string;
  initial?: Partial<ProductFormData>;
  existingCategories: string[];
  onSave: (data: ProductFormData) => void;
  onClose: () => void;
  isPending: boolean;
}

export function ProductFormModal({
  title = "منتج جديد",
  initial,
  existingCategories,
  onSave,
  onClose,
  isPending,
}: ProductFormModalProps) {
  const [form, setForm] = useState<ProductFormData>({
    ...emptyProductForm,
    sku: generateBarcode(),
    ...initial,
  });
  const [newCatInput, setNewCatInput] = useState("");
  const [showNewCat, setShowNewCat] = useState(false);

  const set = (k: keyof ProductFormData, v: string | number) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleAddCategory = () => {
    const trimmed = newCatInput.trim();
    if (!trimmed) return;
    set("category", trimmed);
    setNewCatInput("");
    setShowNewCat(false);
  };

  const allCategories = Array.from(
    new Set([...existingCategories, form.category].filter(Boolean))
  );

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

          {/* Category */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-white/70 text-xs">التصنيف *</label>
              <button
                type="button"
                onClick={() => setShowNewCat(v => !v)}
                className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
              >
                <Tag className="w-3 h-3" />
                {showNewCat ? "إلغاء" : "➕ إضافة تصنيف جديد"}
              </button>
            </div>
            {showNewCat ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  autoFocus
                  className="glass-input flex-1 text-sm"
                  placeholder="اسم التصنيف الجديد..."
                  value={newCatInput}
                  onChange={e => setNewCatInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") { e.preventDefault(); handleAddCategory(); }
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddCategory}
                  className="px-3 py-2 rounded-xl bg-violet-500/20 text-violet-400 border border-violet-500/30 text-xs font-bold hover:bg-violet-500/30 transition-all whitespace-nowrap"
                >
                  إضافة
                </button>
              </div>
            ) : (
              <select
                required
                className="glass-input appearance-none w-full cursor-pointer"
                value={form.category}
                onChange={e => set("category", e.target.value)}
              >
                <option value="" disabled>اختر التصنيف</option>
                {allCategories.map(cat => (
                  <option key={cat} value={cat} className="bg-gray-900 text-white">{cat}</option>
                ))}
              </select>
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
