import { useState, useMemo } from "react";
import { useGetPurchases, useCreatePurchase, useGetProducts, useGetSuppliers, useGetPurchaseById } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Search, Plus, Minus, Trash2, X, ShoppingBag, Printer } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface CartItem {
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    partial: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    unpaid: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  const labels: Record<string, string> = { paid: "مدفوع", partial: "جزئي", unpaid: "غير مدفوع" };
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${map[status] || map.unpaid}`}>
      {labels[status] || status}
    </span>
  );
}

function PaymentBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    cash: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    credit: "bg-red-500/20 text-red-400 border-red-500/30",
    partial: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  };
  const labels: Record<string, string> = { cash: "نقدي", credit: "آجل", partial: "جزئي" };
  return (
    <span className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${map[type] || ''}`}>
      {labels[type] || type}
    </span>
  );
}

function PurchaseDetailModal({ purchaseId, onClose }: { purchaseId: number; onClose: () => void }) {
  const { data: purchase, isLoading } = useGetPurchaseById({ id: purchaseId });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="glass-panel rounded-3xl p-8 w-full max-w-2xl border border-white/10 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-bold text-white">تفاصيل فاتورة الشراء</h3>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 transition-colors">
              <Printer className="w-5 h-5" />
            </button>
            <button onClick={onClose} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        {isLoading ? (
          <div className="text-center py-12 text-white/40">جاري التحميل...</div>
        ) : !purchase ? (
          <div className="text-center py-12 text-white/40">لم يتم العثور على الفاتورة</div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
              <div>
                <p className="text-white/50 text-sm">رقم الفاتورة</p>
                <p className="text-white font-bold text-lg">{purchase.invoice_no}</p>
              </div>
              <div>
                <p className="text-white/50 text-sm">التاريخ</p>
                <p className="text-white">{formatDate(purchase.created_at)}</p>
              </div>
              <div>
                <p className="text-white/50 text-sm">المورد</p>
                <p className="text-white font-semibold">{purchase.supplier_name || 'مورد نقدي'}</p>
              </div>
              <div>
                <p className="text-white/50 text-sm">طريقة الدفع</p>
                <PaymentBadge type={purchase.payment_type} />
              </div>
            </div>
            <div>
              <h4 className="text-white font-bold mb-3">أصناف الفاتورة</h4>
              <div className="rounded-2xl overflow-hidden border border-white/10">
                <table className="w-full text-right text-sm">
                  <thead className="bg-white/5 border-b border-white/10">
                    <tr>
                      <th className="p-3 font-semibold text-white/60">الصنف</th>
                      <th className="p-3 font-semibold text-white/60">الكمية</th>
                      <th className="p-3 font-semibold text-white/60">سعر الوحدة</th>
                      <th className="p-3 font-semibold text-white/60">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(purchase.items || []).map((item, i) => (
                      <tr key={i} className="border-b border-white/5">
                        <td className="p-3 font-bold text-white">{item.product_name}</td>
                        <td className="p-3 text-white/70">{item.quantity}</td>
                        <td className="p-3 text-white/70">{formatCurrency(item.unit_price)}</td>
                        <td className="p-3 font-bold text-emerald-400">{formatCurrency(item.total_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="p-5 bg-white/5 rounded-2xl border border-white/5 space-y-3">
              <div className="flex justify-between">
                <span className="text-white/60">إجمالي الفاتورة</span>
                <span className="font-bold text-white text-lg">{formatCurrency(purchase.total_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">المدفوع</span>
                <span className="font-bold text-emerald-400">{formatCurrency(purchase.paid_amount)}</span>
              </div>
              {purchase.remaining_amount > 0 && (
                <div className="flex justify-between border-t border-white/10 pt-3">
                  <span className="text-white/60">المتبقي</span>
                  <span className="font-bold text-red-400 text-lg">{formatCurrency(purchase.remaining_amount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-white/10 pt-3">
                <span className="text-white/60">الحالة</span>
                <StatusBadge status={purchase.status} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NewPurchaseModal({ onClose }: { onClose: () => void }) {
  const { data: products = [] } = useGetProducts();
  const { data: suppliers = [] } = useGetSuppliers();
  const createMutation = useCreatePurchase();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentType, setPaymentType] = useState<"cash" | "credit" | "partial">("cash");
  const [paidAmount, setPaidAmount] = useState<string>("");
  const [supplierId, setSupplierId] = useState<string>("");
  const [supplierName, setSupplierName] = useState<string>("");

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()))
  );

  const cartTotal = useMemo(() => cart.reduce((s, i) => s + i.total_price, 0), [cart]);

  const addToCart = (product: typeof products[0]) => {
    setCart(prev => {
      const existing = prev.find(i => i.product_id === product.id);
      if (existing) {
        return prev.map(i => i.product_id === product.id
          ? { ...i, quantity: i.quantity + 1, total_price: (i.quantity + 1) * i.unit_price }
          : i
        );
      }
      return [...prev, {
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        unit_price: product.cost_price,
        total_price: product.cost_price,
      }];
    });
  };

  const updateQty = (productId: number, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.product_id !== productId) return i;
      const newQ = Math.max(1, i.quantity + delta);
      return { ...i, quantity: newQ, total_price: newQ * i.unit_price };
    }));
  };

  const updatePrice = (productId: number, price: number) => {
    setCart(prev => prev.map(i => {
      if (i.product_id !== productId) return i;
      return { ...i, unit_price: price, total_price: i.quantity * price };
    }));
  };

  const handleSubmit = () => {
    if (cart.length === 0) {
      toast({ title: "أضف منتجات أولاً", variant: "destructive" });
      return;
    }
    let actualPaid = paymentType === "cash" ? cartTotal :
      paymentType === "credit" ? 0 :
      parseFloat(paidAmount) || 0;

    const selectedSupplier = supplierId ? suppliers.find(s => s.id === parseInt(supplierId)) : null;

    createMutation.mutate({
      data: {
        supplier_id: selectedSupplier?.id ?? null,
        supplier_name: selectedSupplier?.name ?? (supplierName || null),
        payment_type: paymentType,
        total_amount: cartTotal,
        paid_amount: actualPaid,
        items: cart,
      }
    }, {
      onSuccess: () => {
        toast({ title: "✅ تم تسجيل فاتورة الشراء بنجاح" });
        queryClient.invalidateQueries({ queryKey: ["/api/purchases"] });
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
        onClose();
      },
      onError: () => toast({ title: "حدث خطأ", variant: "destructive" })
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="glass-panel rounded-3xl w-full max-w-5xl border border-white/10 shadow-2xl max-h-[95vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-white/10">
          <h3 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-amber-400" /> فاتورة شراء جديدة
          </h3>
          <button onClick={onClose} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
            <X className="w-5 h-5 text-white/70" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Products */}
          <div className="flex-1 p-6 overflow-y-auto border-l border-white/10">
            <div className="relative mb-4">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type="text"
                placeholder="ابحث عن منتج..."
                className="glass-input pr-10 w-full text-sm"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {filteredProducts.map(product => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className="text-right p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-amber-500/30 transition-all"
                >
                  <p className="font-bold text-white text-sm truncate">{product.name}</p>
                  <p className="text-xs text-amber-400">{formatCurrency(product.cost_price)}</p>
                  <p className="text-xs text-white/40">متوفر: {product.quantity}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Cart */}
          <div className="w-80 p-6 flex flex-col gap-4 overflow-y-auto">
            <h4 className="font-bold text-white">الأصناف المختارة ({cart.length})</h4>

            {cart.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-white/30 text-sm">
                اختر منتجات من القائمة
              </div>
            ) : (
              <div className="space-y-2 flex-1">
                {cart.map(item => (
                  <div key={item.product_id} className="p-3 bg-white/5 rounded-xl border border-white/5">
                    <div className="flex justify-between items-start mb-2">
                      <p className="text-white font-bold text-sm flex-1 ml-2 truncate">{item.product_name}</p>
                      <button onClick={() => setCart(prev => prev.filter(i => i.product_id !== item.product_id))}
                        className="text-red-400 hover:text-red-300 p-1">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <button onClick={() => updateQty(item.product_id, -1)} className="w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center">
                        <Minus className="w-3 h-3 text-white" />
                      </button>
                      <span className="text-white font-bold text-sm w-6 text-center">{item.quantity}</span>
                      <button onClick={() => updateQty(item.product_id, 1)} className="w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center">
                        <Plus className="w-3 h-3 text-white" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-white/50 text-xs">سعر الوحدة:</span>
                      <input
                        type="number"
                        step="0.01"
                        value={item.unit_price}
                        onChange={e => updatePrice(item.product_id, parseFloat(e.target.value) || 0)}
                        className="flex-1 bg-white/10 text-white text-xs rounded-lg px-2 py-1 text-right"
                      />
                    </div>
                    <p className="text-amber-400 font-bold text-sm mt-1">{formatCurrency(item.total_price)}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Supplier */}
            <div className="border-t border-white/10 pt-4 space-y-3">
              <div>
                <label className="block text-white/60 text-xs mb-1">المورد</label>
                <select
                  className="glass-input text-sm appearance-none"
                  value={supplierId}
                  onChange={e => { setSupplierId(e.target.value); setSupplierName(""); }}
                >
                  <option value="" className="bg-gray-900">بدون مورد محدد</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id} className="bg-gray-900">{s.name}</option>
                  ))}
                </select>
              </div>
              {!supplierId && (
                <input
                  type="text"
                  placeholder="أو اكتب اسم المورد..."
                  className="glass-input text-sm"
                  value={supplierName}
                  onChange={e => setSupplierName(e.target.value)}
                />
              )}

              {/* Payment */}
              <div>
                <label className="block text-white/60 text-xs mb-1">طريقة الدفع</label>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { value: "cash", label: "نقدي" },
                    { value: "credit", label: "آجل" },
                    { value: "partial", label: "جزئي" },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPaymentType(opt.value as "cash" | "credit" | "partial")}
                      className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                        paymentType === opt.value
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                          : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {paymentType === "partial" && (
                <div>
                  <label className="block text-white/60 text-xs mb-1">المبلغ المدفوع</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    className="glass-input text-sm"
                    value={paidAmount}
                    onChange={e => setPaidAmount(e.target.value)}
                  />
                </div>
              )}

              <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-white/60">الإجمالي</span>
                  <span className="font-bold text-white">{formatCurrency(cartTotal)}</span>
                </div>
                {paymentType === "partial" && (
                  <div className="flex justify-between text-sm">
                    <span className="text-white/60">المتبقي</span>
                    <span className="font-bold text-red-400">{formatCurrency(cartTotal - (parseFloat(paidAmount) || 0))}</span>
                  </div>
                )}
              </div>

              <button
                onClick={handleSubmit}
                disabled={createMutation.isPending || cart.length === 0}
                className="w-full btn-primary py-3 text-sm disabled:opacity-50"
              >
                {createMutation.isPending ? 'جاري الحفظ...' : 'تسجيل فاتورة الشراء'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Purchases() {
  const { data: purchases = [], isLoading } = useGetPurchases();
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const filtered = purchases.filter(p =>
    p.invoice_no.includes(search) ||
    (p.supplier_name && p.supplier_name.includes(search))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative w-full max-w-md">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
          <input
            type="text"
            placeholder="بحث برقم الفاتورة أو المورد..."
            className="glass-input pl-4 pr-12 w-full"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2 whitespace-nowrap">
          <Plus className="w-5 h-5" /> فاتورة شراء جديدة
        </button>
      </div>

      {showNew && <NewPurchaseModal onClose={() => setShowNew(false)} />}
      {selectedId && <PurchaseDetailModal purchaseId={selectedId} onClose={() => setSelectedId(null)} />}

      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-white/80 whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-4 font-semibold text-white/60">رقم الفاتورة</th>
                <th className="p-4 font-semibold text-white/60">المورد</th>
                <th className="p-4 font-semibold text-white/60">الإجمالي</th>
                <th className="p-4 font-semibold text-white/60">المدفوع</th>
                <th className="p-4 font-semibold text-white/60">المتبقي</th>
                <th className="p-4 font-semibold text-white/60">الدفع</th>
                <th className="p-4 font-semibold text-white/60">الحالة</th>
                <th className="p-4 font-semibold text-white/60">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="p-12 text-center text-white/40">جاري التحميل...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="p-12 text-center text-white/40">لا توجد مشتريات</td></tr>
              ) : (
                filtered.map(purchase => (
                  <tr
                    key={purchase.id}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                    onClick={() => setSelectedId(purchase.id)}
                  >
                    <td className="p-4 font-bold text-amber-400">{purchase.invoice_no}</td>
                    <td className="p-4">{purchase.supplier_name || 'مورد نقدي'}</td>
                    <td className="p-4 font-bold text-white">{formatCurrency(purchase.total_amount)}</td>
                    <td className="p-4 text-emerald-400 font-bold">{formatCurrency(purchase.paid_amount)}</td>
                    <td className="p-4 text-red-400 font-bold">{formatCurrency(purchase.remaining_amount)}</td>
                    <td className="p-4"><PaymentBadge type={purchase.payment_type} /></td>
                    <td className="p-4"><StatusBadge status={purchase.status} /></td>
                    <td className="p-4 text-sm text-white/50">{formatDate(purchase.created_at)}</td>
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
