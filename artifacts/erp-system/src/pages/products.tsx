import { useState } from "react";
import { useGetProducts, useCreateProduct, useDeleteProduct } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import { Plus, Search, Trash2, AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const CATEGORIES = [
  "شاشات",
  "بطاريات",
  "هوسنجات",
  "فلاتر",
  "أجراس",
  "سماعات",
  "بورد تقطيع",
  "ضهور",
  "مبرمجات",
];

export default function Products() {
  const { data: products = [], isLoading } = useGetProducts();
  const createMutation = useCreateProduct();
  const deleteMutation = useDeleteProduct();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [formData, setFormData] = useState({
    name: "", sku: "", category: "", quantity: 0, cost_price: 0, sale_price: 0, low_stock_threshold: 5
  });

  const filtered = products.filter(p => 
    p.name.includes(search) || 
    (p.sku && p.sku.includes(search)) ||
    (p.category && p.category.includes(search))
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ data: formData }, {
      onSuccess: () => {
        toast({ title: "✅ تم إضافة المنتج بنجاح" });
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        setShowAdd(false);
        setFormData({ name: "", sku: "", category: "", quantity: 0, cost_price: 0, sale_price: 0, low_stock_threshold: 5 });
      },
      onError: () => toast({ title: "حدث خطأ", variant: "destructive" })
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("هل أنت متأكد من حذف المنتج؟")) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => {
          toast({ title: "تم الحذف بنجاح" });
          queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        }
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative w-full max-w-md">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
          <input 
            type="text" 
            placeholder="بحث عن منتج..." 
            className="glass-input pl-4 pr-12 w-full"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button 
          onClick={() => setShowAdd(true)}
          className="btn-primary flex items-center gap-2 whitespace-nowrap"
        >
          <Plus className="w-5 h-5" /> إضافة منتج
        </button>
      </div>

      {/* Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="glass-panel rounded-3xl p-8 w-full max-w-md shadow-2xl border border-white/10">
            <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
              <Plus className="w-6 h-6 text-amber-400" /> منتج جديد
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-white/70 text-sm mb-1">اسم المنتج *</label>
                <input required type="text" className="glass-input" placeholder="مثال: شاشة سامسونج 6.5" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-white/70 text-sm mb-1">الرمز (SKU)</label>
                  <input type="text" className="glass-input" placeholder="اختياري" value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value})} />
                </div>
                <div>
                  <label className="block text-white/70 text-sm mb-1">التصنيف *</label>
                  <select 
                    required
                    className="glass-input appearance-none cursor-pointer"
                    value={formData.category}
                    onChange={e => setFormData({...formData, category: e.target.value})}
                  >
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
                  <input required type="number" step="0.01" min="0" className="glass-input" placeholder="0.00" value={formData.cost_price || ''} onChange={e => setFormData({...formData, cost_price: parseFloat(e.target.value) || 0})} />
                </div>
                <div>
                  <label className="block text-white/70 text-sm mb-1">سعر البيع *</label>
                  <input required type="number" step="0.01" min="0" className="glass-input" placeholder="0.00" value={formData.sale_price || ''} onChange={e => setFormData({...formData, sale_price: parseFloat(e.target.value) || 0})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-white/70 text-sm mb-1">الكمية الابتدائية</label>
                  <input type="number" min="0" className="glass-input" value={formData.quantity || ''} onChange={e => setFormData({...formData, quantity: parseInt(e.target.value) || 0})} />
                </div>
                <div>
                  <label className="block text-white/70 text-sm mb-1">حد التنبيه (نواقص)</label>
                  <input type="number" min="0" className="glass-input" value={formData.low_stock_threshold || ''} onChange={e => setFormData({...formData, low_stock_threshold: parseInt(e.target.value) || 0})} />
                </div>
              </div>
            </div>
            <div className="flex gap-4 mt-8">
              <button type="submit" disabled={createMutation.isPending} className="flex-1 btn-primary py-3">
                {createMutation.isPending ? 'جاري الحفظ...' : 'حفظ المنتج'}
              </button>
              <button type="button" onClick={() => setShowAdd(false)} className="flex-1 btn-secondary py-3">إلغاء</button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
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
                <th className="p-4 font-semibold text-white/60">الكمية</th>
                <th className="p-4 font-semibold text-white/60 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="p-12 text-center text-white/40">جاري التحميل...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="p-12 text-center text-white/40">لا توجد منتجات</td></tr>
              ) : (
                filtered.map(product => {
                  const isLow = product.low_stock_threshold !== null && product.quantity <= (product.low_stock_threshold ?? 5);
                  return (
                    <tr key={product.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                      <td className="p-4 font-bold text-white">{product.name}</td>
                      <td className="p-4 text-white/50">{product.sku || '-'}</td>
                      <td className="p-4">
                        {product.category ? (
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20">
                            {product.category}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="p-4 text-white/70">{formatCurrency(product.cost_price)}</td>
                      <td className="p-4 font-bold text-emerald-400">{formatCurrency(product.sale_price)}</td>
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
                        <button onClick={() => handleDelete(product.id)} className="text-red-400 hover:text-red-300 p-2 hover:bg-red-400/10 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
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
