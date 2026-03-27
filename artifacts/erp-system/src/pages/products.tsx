import { useState } from "react";
import { useGetProducts, useCreateProduct, useDeleteProduct } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import { Plus, Search, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

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

  const filtered = products.filter(p => p.name.includes(search) || (p.sku && p.sku.includes(search)));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ data: formData }, {
      onSuccess: () => {
        toast({ title: "تم إضافة المنتج بنجاح" });
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        setShowAdd(false);
        setFormData({ name: "", sku: "", category: "", quantity: 0, cost_price: 0, sale_price: 0, low_stock_threshold: 5 });
      }
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
          className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-primary/20"
        >
          <Plus className="w-5 h-5" /> إضافة منتج
        </button>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="glass-panel rounded-3xl p-8 w-full max-w-md animate-in zoom-in-95">
            <h3 className="text-2xl font-bold text-white mb-6">منتج جديد</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-white/70 text-sm mb-1">اسم المنتج</label>
                <input required type="text" className="glass-input" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-white/70 text-sm mb-1">الرمز (SKU)</label>
                  <input type="text" className="glass-input" value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value})} />
                </div>
                <div>
                  <label className="block text-white/70 text-sm mb-1">التصنيف</label>
                  <input type="text" className="glass-input" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-white/70 text-sm mb-1">التكلفة</label>
                  <input required type="number" step="0.01" className="glass-input" value={formData.cost_price || ''} onChange={e => setFormData({...formData, cost_price: parseFloat(e.target.value)})} />
                </div>
                <div>
                  <label className="block text-white/70 text-sm mb-1">سعر البيع</label>
                  <input required type="number" step="0.01" className="glass-input" value={formData.sale_price || ''} onChange={e => setFormData({...formData, sale_price: parseFloat(e.target.value)})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-white/70 text-sm mb-1">الكمية الافتتاحية</label>
                  <input required type="number" className="glass-input" value={formData.quantity || ''} onChange={e => setFormData({...formData, quantity: parseInt(e.target.value)})} />
                </div>
                <div>
                  <label className="block text-white/70 text-sm mb-1">حد النواقص</label>
                  <input required type="number" className="glass-input" value={formData.low_stock_threshold || ''} onChange={e => setFormData({...formData, low_stock_threshold: parseInt(e.target.value)})} />
                </div>
              </div>
            </div>
            <div className="flex gap-4 mt-8">
              <button type="submit" disabled={createMutation.isPending} className="flex-1 bg-primary text-white py-3 rounded-xl font-bold hover:bg-primary/90 transition-colors">حفظ</button>
              <button type="button" onClick={() => setShowAdd(false)} className="flex-1 bg-white/10 text-white py-3 rounded-xl font-bold hover:bg-white/20 transition-colors">إلغاء</button>
            </div>
          </form>
        </div>
      )}

      <div className="glass-panel rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-white/80 whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-4 font-medium">المنتج</th>
                <th className="p-4 font-medium">الرمز</th>
                <th className="p-4 font-medium">التصنيف</th>
                <th className="p-4 font-medium">التكلفة</th>
                <th className="p-4 font-medium">سعر البيع</th>
                <th className="p-4 font-medium">الكمية المتوفرة</th>
                <th className="p-4 font-medium w-16"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="p-8 text-center text-white/50">جاري التحميل...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-white/50">لا توجد منتجات</td></tr>
              ) : (
                filtered.map(product => (
                  <tr key={product.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="p-4 font-bold text-white">{product.name}</td>
                    <td className="p-4">{product.sku || '-'}</td>
                    <td className="p-4">{product.category || '-'}</td>
                    <td className="p-4">{formatCurrency(product.cost_price)}</td>
                    <td className="p-4 text-primary font-bold">{formatCurrency(product.sale_price)}</td>
                    <td className="p-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        product.quantity <= (product.low_stock_threshold || 5) 
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}>
                        {product.quantity}
                      </span>
                    </td>
                    <td className="p-4">
                      <button onClick={() => handleDelete(product.id)} className="text-red-400 hover:text-red-300 transition-colors p-2 hover:bg-red-400/10 rounded-lg">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
