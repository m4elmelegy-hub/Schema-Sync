import { useState, useMemo } from "react";
import { useGetPurchases, useCreatePurchase, useGetProducts, useGetSuppliers, useGetCustomers, useGetPurchaseById, useCreateProduct, useDeleteProduct } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Search, Plus, Minus, Trash2, X, ShoppingBag, Printer, AlertTriangle, User, Package } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const CATEGORIES = ["شاشات", "بطاريات", "هوسنجات", "فلاتر", "أجراس", "سماعات", "بورد تقطيع", "ضهور", "مبرمجات"];

interface CartItem {
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = { paid: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", partial: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", unpaid: "bg-red-500/20 text-red-400 border-red-500/30" };
  const labels: Record<string, string> = { paid: "مدفوع", partial: "جزئي", unpaid: "غير مدفوع" };
  return <span className={`px-3 py-1 rounded-full text-xs font-bold border ${map[status] || map.unpaid}`}>{labels[status] || status}</span>;
}

function PaymentBadge({ type }: { type: string }) {
  const map: Record<string, string> = { cash: "bg-blue-500/20 text-blue-400 border-blue-500/30", credit: "bg-red-500/20 text-red-400 border-red-500/30", partial: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" };
  const labels: Record<string, string> = { cash: "نقدي", credit: "آجل", partial: "جزئي" };
  return <span className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${map[type] || ''}`}>{labels[type] || type}</span>;
}

function PurchaseDetailModal({ purchaseId, onClose }: { purchaseId: number; onClose: () => void }) {
  const { data: purchase, isLoading } = useGetPurchaseById({ id: purchaseId });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="glass-panel rounded-3xl p-8 w-full max-w-2xl border border-white/10 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-bold text-white flex items-center gap-2"><ShoppingBag className="w-6 h-6 text-amber-400" /> تفاصيل فاتورة الشراء</h3>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 transition-colors"><Printer className="w-5 h-5" /></button>
            <button onClick={onClose} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 transition-colors"><X className="w-5 h-5" /></button>
          </div>
        </div>
        {isLoading ? <div className="text-center py-12 text-white/40">جاري التحميل...</div> : !purchase ? <div className="text-center py-12 text-white/40">غير موجود</div> : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
              <div><p className="text-white/50 text-sm">رقم الفاتورة</p><p className="text-amber-400 font-bold text-lg">{purchase.invoice_no}</p></div>
              <div><p className="text-white/50 text-sm">التاريخ</p><p className="text-white">{formatDate(purchase.created_at)}</p></div>
              <div><p className="text-white/50 text-sm">المورد</p><p className="text-white font-semibold">{purchase.supplier_name || 'بدون مورد'}</p></div>
              <div><p className="text-white/50 text-sm">دفع الشركة</p><PaymentBadge type={purchase.payment_type} /></div>
              {purchase.customer_name && (
                <>
                  <div className="col-span-2 border-t border-white/10 pt-3">
                    <p className="text-amber-400 text-xs font-bold mb-2">مُحمَّل على عميل</p>
                    <div className="flex justify-between items-center">
                      <span className="text-white font-semibold">{purchase.customer_name}</span>
                      {purchase.customer_payment_type && (
                        <span className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${
                          purchase.customer_payment_type === 'cash' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                          purchase.customer_payment_type === 'credit' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                          'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                        }`}>
                          {purchase.customer_payment_type === 'cash' ? 'دفع نقداً' : purchase.customer_payment_type === 'credit' ? 'آجل (دين عليه)' : 'جزئي'}
                        </span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="rounded-2xl overflow-hidden border border-white/10">
              <table className="w-full text-right text-sm">
                <thead className="bg-white/5 border-b border-white/10">
                  <tr>
                    <th className="p-3 text-white/60">الصنف</th><th className="p-3 text-white/60">الكمية</th><th className="p-3 text-white/60">سعر الوحدة</th><th className="p-3 text-white/60">الإجمالي</th>
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
            <div className="p-5 bg-white/5 rounded-2xl border border-white/5 space-y-3">
              <div className="flex justify-between"><span className="text-white/60">الإجمالي</span><span className="font-bold text-white text-lg">{formatCurrency(purchase.total_amount)}</span></div>
              <div className="flex justify-between"><span className="text-white/60">المدفوع</span><span className="font-bold text-emerald-400">{formatCurrency(purchase.paid_amount)}</span></div>
              {purchase.remaining_amount > 0 && <div className="flex justify-between border-t border-white/10 pt-3"><span className="text-white/60">المتبقي</span><span className="font-bold text-red-400 text-lg">{formatCurrency(purchase.remaining_amount)}</span></div>}
              <div className="flex justify-between border-t border-white/10 pt-3"><span className="text-white/60">الحالة</span><StatusBadge status={purchase.status} /></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NewPurchasePanel({ onDone }: { onDone: () => void }) {
  const { data: products = [] } = useGetProducts();
  const { data: suppliers = [] } = useGetSuppliers();
  const { data: customers = [] } = useGetCustomers();
  const createMutation = useCreatePurchase();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentType, setPaymentType] = useState<"cash" | "credit" | "partial">("cash");
  const [paidAmount, setPaidAmount] = useState<string>("");
  const [supplierId, setSupplierId] = useState<string>("");
  const [supplierName, setSupplierName] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [customerId, setCustomerId] = useState<string>("");
  const [customerPaymentType, setCustomerPaymentType] = useState<"cash" | "credit" | "partial">("credit");
  const [customerPaidAmount, setCustomerPaidAmount] = useState<string>("");

  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean)));
  const filteredProducts = products.filter(p => {
    const matchS = p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()));
    const matchC = !categoryFilter || p.category === categoryFilter;
    return matchS && matchC;
  });

  const cartTotal = useMemo(() => cart.reduce((s, i) => s + i.total_price, 0), [cart]);
  const selectedCustomer = customerId ? customers.find(c => c.id === parseInt(customerId)) : null;

  const customerBalanceImpact = useMemo(() => {
    if (!customerId) return 0;
    if (customerPaymentType === "cash") return 0;
    if (customerPaymentType === "credit") return cartTotal;
    return cartTotal - (parseFloat(customerPaidAmount) || 0);
  }, [customerId, customerPaymentType, customerPaidAmount, cartTotal]);

  const addToCart = (product: typeof products[0]) => {
    setCart(prev => {
      const ex = prev.find(i => i.product_id === product.id);
      if (ex) return prev.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + 1, total_price: (i.quantity + 1) * i.unit_price } : i);
      return [...prev, { product_id: product.id, product_name: product.name, quantity: 1, unit_price: product.cost_price, total_price: product.cost_price }];
    });
  };

  const updateQty = (pid: number, delta: number) => setCart(prev => prev.map(i => {
    if (i.product_id !== pid) return i;
    const newQ = Math.max(1, i.quantity + delta);
    return { ...i, quantity: newQ, total_price: newQ * i.unit_price };
  }));

  const updatePrice = (pid: number, price: number) => setCart(prev => prev.map(i => i.product_id !== pid ? i : { ...i, unit_price: price, total_price: i.quantity * price }));

  const handleSubmit = () => {
    if (cart.length === 0) { toast({ title: "أضف منتجات أولاً", variant: "destructive" }); return; }
    const actualPaid = paymentType === "cash" ? cartTotal : paymentType === "credit" ? 0 : parseFloat(paidAmount) || 0;
    const selectedSupplier = supplierId ? suppliers.find(s => s.id === parseInt(supplierId)) : null;

    createMutation.mutate({
      data: {
        supplier_id: selectedSupplier?.id ?? null,
        supplier_name: selectedSupplier?.name ?? (supplierName || null),
        customer_id: selectedCustomer?.id ?? null,
        customer_name: selectedCustomer?.name ?? null,
        customer_payment_type: customerId ? customerPaymentType : null,
        customer_paid_amount: customerPaymentType === "partial" ? (parseFloat(customerPaidAmount) || 0) : null,
        payment_type: paymentType,
        total_amount: cartTotal,
        paid_amount: actualPaid,
        items: cart,
      }
    }, {
      onSuccess: () => {
        let msg = "✅ تم تسجيل فاتورة الشراء — تم تحديث المخزن";
        if (selectedCustomer) {
          if (customerBalanceImpact > 0) msg += ` — رصيد ${selectedCustomer.name} زاد بـ ${customerBalanceImpact.toFixed(2)} ج.م`;
          else msg += ` — تم تسجيل دفع العميل`;
        }
        toast({ title: msg });
        queryClient.invalidateQueries({ queryKey: ["/api/purchases"] });
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
        queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
        onDone();
      },
      onError: () => toast({ title: "حدث خطأ", variant: "destructive" })
    });
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-220px)]">
      {/* شبكة المنتجات */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="glass-panel rounded-2xl p-3 mb-3 shrink-0 flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Search className="w-4 h-4 text-white/40 shrink-0" />
            <input type="text" placeholder="ابحث عن منتج..." className="bg-transparent text-white outline-none text-sm w-full placeholder:text-white/30" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="bg-black/30 text-white/70 border border-white/10 rounded-xl px-3 py-1.5 text-sm outline-none appearance-none" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="">كل الأصناف</option>
            {categories.map(cat => <option key={cat} value={cat!} className="bg-gray-900">{cat}</option>)}
          </select>
        </div>
        <div className="flex-1 overflow-y-auto glass-panel rounded-2xl p-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredProducts.map(product => (
              <button key={product.id} onClick={() => addToCart(product)}
                className="glass-panel rounded-2xl p-3 text-right transition-all hover:-translate-y-0.5 hover:border-amber-500/40">
                <div className="h-14 bg-white/5 rounded-xl mb-3 flex items-center justify-center border border-white/5">
                  <Package className="w-6 h-6 text-white/30" />
                </div>
                <p className="font-bold text-white text-sm truncate">{product.name}</p>
                {product.category && <p className="text-xs text-amber-400/70 mt-0.5">{product.category}</p>}
                <div className="flex justify-between items-center mt-2">
                  <span className="text-blue-400 font-bold text-sm">{formatCurrency(product.cost_price)}</span>
                  <span className="text-xs text-white/40">{product.quantity}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* سلة الشراء */}
      <div className="w-full lg:w-[360px] flex flex-col glass-panel rounded-2xl overflow-hidden shrink-0">
        <div className="p-4 border-b border-white/10 bg-white/5 flex justify-between items-center">
          <h3 className="font-bold text-white flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-amber-400" /> سلة الشراء
          </h3>
          <span className="bg-amber-500/20 text-amber-400 px-3 py-1 rounded-full text-sm font-bold">{cart.length} صنف</span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-white/20 gap-3 py-12">
              <ShoppingBag className="w-12 h-12 opacity-30" />
              <p className="text-sm">السلة فارغة</p>
            </div>
          ) : cart.map(item => (
            <div key={item.product_id} className="bg-white/5 border border-white/10 rounded-xl p-3">
              <div className="flex justify-between items-start mb-2">
                <p className="font-bold text-white text-sm flex-1 ml-2 truncate">{item.product_name}</p>
                <button onClick={() => setCart(prev => prev.filter(i => i.product_id !== item.product_id))} className="text-red-400 p-1"><Trash2 className="w-3 h-3" /></button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button onClick={() => updateQty(item.product_id, -1)} className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center"><Minus className="w-3 h-3 text-white" /></button>
                  <span className="text-white font-bold text-sm w-5 text-center">{item.quantity}</span>
                  <button onClick={() => updateQty(item.product_id, 1)} className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center"><Plus className="w-3 h-3 text-white" /></button>
                </div>
                <div className="flex items-center gap-1.5">
                  <input type="number" step="0.01" value={item.unit_price} onChange={e => updatePrice(item.product_id, parseFloat(e.target.value) || 0)} className="w-20 bg-white/10 text-white text-xs rounded-lg px-2 py-1 text-right outline-none border border-white/10" />
                  <span className="font-bold text-blue-400 text-sm">{formatCurrency(item.total_price)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-white/10 bg-black/30 space-y-3">
          {/* المورد */}
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
            <Package className="w-4 h-4 text-white/40" />
            <select className="bg-transparent text-white outline-none w-full text-sm appearance-none" value={supplierId} onChange={e => { setSupplierId(e.target.value); setSupplierName(""); }}>
              <option value="" className="bg-slate-900">بدون مورد</option>
              {suppliers.map(s => <option key={s.id} value={s.id} className="bg-slate-900">{s.name}</option>)}
            </select>
          </div>
          {!supplierId && (
            <input type="text" placeholder="أو اكتب اسم المورد..." className="glass-input text-sm" value={supplierName} onChange={e => setSupplierName(e.target.value)} />
          )}

          {/* دفع الشركة */}
          <div className="grid grid-cols-3 gap-1">
            {[{ v: "cash", l: "نقدي" }, { v: "credit", l: "آجل" }, { v: "partial", l: "جزئي" }].map(opt => (
              <button key={opt.v} onClick={() => setPaymentType(opt.v as "cash" | "credit" | "partial")}
                className={`py-2 rounded-xl text-xs font-bold border transition-all ${paymentType === opt.v ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'}`}>
                {opt.l}
              </button>
            ))}
          </div>
          {paymentType === "partial" && (
            <input type="number" step="0.01" placeholder="دفعت الشركة..." className="glass-input text-sm" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} />
          )}

          {/* تحميل على عميل */}
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
            <User className="w-4 h-4 text-white/40" />
            <select className="bg-transparent text-white outline-none w-full text-sm appearance-none" value={customerId} onChange={e => setCustomerId(e.target.value)}>
              <option value="" className="bg-slate-900">بدون عميل (تكلفة داخلية)</option>
              {customers.map(c => <option key={c.id} value={c.id} className="bg-slate-900">{c.name}{c.balance > 0 ? ` • دين: ${Number(c.balance).toFixed(0)} ج.م` : ''}</option>)}
            </select>
          </div>

          {customerId && (
            <div className="space-y-2 animate-in slide-in-from-top-2">
              <div className="grid grid-cols-3 gap-1">
                {[{ v: "credit", l: "آجل" }, { v: "partial", l: "جزئي" }, { v: "cash", l: "نقدي" }].map(opt => (
                  <button key={opt.v} onClick={() => setCustomerPaymentType(opt.v as "cash" | "credit" | "partial")}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all ${customerPaymentType === opt.v ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'}`}>
                    {opt.l}
                  </button>
                ))}
              </div>
              {customerPaymentType === "partial" && (
                <input type="number" step="0.01" placeholder="دفع العميل مقدماً..." className="glass-input text-sm" value={customerPaidAmount} onChange={e => setCustomerPaidAmount(e.target.value)} />
              )}
              <div className={`p-2 rounded-xl border text-xs font-bold ${customerBalanceImpact > 0 ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}>
                {customerBalanceImpact > 0
                  ? `⬆ دين على ${selectedCustomer?.name}: +${formatCurrency(customerBalanceImpact)}`
                  : `✅ دفع العميل بالكامل`}
              </div>
            </div>
          )}

          {/* الإجمالي */}
          <div className="bg-white/5 rounded-xl p-3 border border-white/5 space-y-1.5">
            <div className="flex justify-between text-sm"><span className="text-white/60">الإجمالي</span><span className="font-bold text-white">{formatCurrency(cartTotal)}</span></div>
            {paymentType === "partial" && <div className="flex justify-between text-sm"><span className="text-white/60">متبقي للمورد</span><span className="font-bold text-red-400">{formatCurrency(cartTotal - (parseFloat(paidAmount) || 0))}</span></div>}
            {customerId && customerBalanceImpact > 0 && <div className="flex justify-between text-sm border-t border-white/10 pt-1.5"><span className="text-yellow-400/70">دين العميل</span><span className="font-bold text-yellow-400">{formatCurrency(customerBalanceImpact)}</span></div>}
          </div>

          <button onClick={handleSubmit} disabled={createMutation.isPending || cart.length === 0} className="w-full btn-primary py-3 disabled:opacity-50">
            {createMutation.isPending ? "جاري التسجيل..." : "تسجيل فاتورة الشراء"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductsPanel() {
  const { data: products = [], isLoading } = useGetProducts();
  const createMutation = useCreateProduct();
  const deleteMutation = useDeleteProduct();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [formData, setFormData] = useState({ name: "", sku: "", category: "", quantity: 0, cost_price: 0, sale_price: 0, low_stock_threshold: 5 });

  const generateBarcode = () => {
    const ts = Date.now().toString().slice(-9);
    const rand = Math.floor(Math.random() * 100).toString().padStart(2, "0");
    return `HT${ts}${rand}`;
  };

  const filtered = products.filter(p => {
    const matchS = p.name.includes(search) || (p.sku && p.sku.includes(search));
    const matchC = !catFilter || p.category === catFilter;
    return matchS && matchC;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ data: formData }, {
      onSuccess: () => {
        toast({ title: "✅ تم إضافة المنتج" });
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        setShowAdd(false);
        setFormData({ name: "", sku: "", category: "", quantity: 0, cost_price: 0, sale_price: 0, low_stock_threshold: 5 });
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input type="text" placeholder="بحث..." className="glass-input pr-9 text-sm w-48" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="glass-input text-sm appearance-none w-40" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
            <option value="">كل الأصناف</option>
            {CATEGORIES.map(c => <option key={c} value={c} className="bg-gray-900">{c}</option>)}
          </select>
        </div>
        <button onClick={() => { setFormData({ name: "", sku: generateBarcode(), category: "", quantity: 0, cost_price: 0, sale_price: 0, low_stock_threshold: 5 }); setShowAdd(true); }} className="btn-primary flex items-center gap-2 text-sm"><Plus className="w-4 h-4" /> منتج جديد</button>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="glass-panel rounded-3xl p-8 w-full max-w-md border border-white/10">
            <h3 className="text-xl font-bold text-white mb-5">إضافة منتج جديد</h3>
            <div className="space-y-3">
              <div><label className="text-white/60 text-xs mb-1 block">اسم المنتج *</label><input required type="text" className="glass-input" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} /></div>
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-3 mb-1">
                <label className="text-amber-400 text-xs font-bold mb-2 block flex items-center gap-1.5">🔲 الباركود (تلقائي)</label>
                <div className="flex gap-2 items-center">
                  <input type="text" className="glass-input flex-1 font-mono text-sm tracking-wider text-amber-300" value={formData.sku} onChange={e => setFormData({ ...formData, sku: e.target.value })} placeholder="سيتم توليده تلقائياً" />
                  <button type="button" onClick={() => setFormData(f => ({ ...f, sku: generateBarcode() }))} className="px-3 py-2 rounded-xl bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 text-xs font-bold transition-colors shrink-0">تجديد</button>
                </div>
                <p className="text-white/30 text-xs mt-1">يمكنك تعديل الباركود أو تجديده</p>
              </div>
              <div>
                <label className="text-white/60 text-xs mb-1 block">التصنيف *</label>
                <select required className="glass-input appearance-none w-full" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                  <option value="" disabled>اختر التصنيف</option>
                  {CATEGORIES.map(c => <option key={c} value={c} className="bg-gray-900">{c}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-white/60 text-xs mb-1 block">سعر التكلفة</label><input required type="number" step="0.01" min="0" className="glass-input" value={formData.cost_price || ''} onChange={e => setFormData({ ...formData, cost_price: parseFloat(e.target.value) || 0 })} /></div>
                <div><label className="text-white/60 text-xs mb-1 block">سعر البيع</label><input required type="number" step="0.01" min="0" className="glass-input" value={formData.sale_price || ''} onChange={e => setFormData({ ...formData, sale_price: parseFloat(e.target.value) || 0 })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-white/60 text-xs mb-1 block">الكمية الأولية</label><input type="number" min="0" className="glass-input" value={formData.quantity || ''} onChange={e => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })} /></div>
                <div><label className="text-white/60 text-xs mb-1 block">حد التنبيه</label><input type="number" min="0" className="glass-input" value={formData.low_stock_threshold || ''} onChange={e => setFormData({ ...formData, low_stock_threshold: parseInt(e.target.value) || 0 })} /></div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button type="submit" disabled={createMutation.isPending} className="flex-1 btn-primary py-3">{createMutation.isPending ? '...' : 'حفظ'}</button>
              <button type="button" onClick={() => setShowAdd(false)} className="flex-1 btn-secondary py-3">إلغاء</button>
            </div>
          </form>
        </div>
      )}

      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-3 text-white/60 font-semibold">المنتج</th>
                <th className="p-3 text-white/60 font-semibold">التصنيف</th>
                <th className="p-3 text-white/60 font-semibold">التكلفة</th>
                <th className="p-3 text-white/60 font-semibold">البيع</th>
                <th className="p-3 text-white/60 font-semibold">الكمية</th>
                <th className="p-3 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td colSpan={6} className="p-8 text-center text-white/40">جاري التحميل...</td></tr>
                : filtered.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-white/40">لا توجد منتجات</td></tr>
                  : filtered.map(product => {
                    const isLow = product.low_stock_threshold !== null && product.quantity <= (product.low_stock_threshold ?? 5);
                    return (
                      <tr key={product.id} className="border-b border-white/5 hover:bg-white/3">
                        <td className="p-3 font-bold text-white">{product.name}</td>
                        <td className="p-3">{product.category ? <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20">{product.category}</span> : '-'}</td>
                        <td className="p-3 text-white/60">{formatCurrency(product.cost_price)}</td>
                        <td className="p-3 font-bold text-emerald-400">{formatCurrency(product.sale_price)}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold flex items-center gap-1 w-fit ${isLow ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
                            {isLow && <AlertTriangle className="w-3 h-3" />}{product.quantity}
                          </span>
                        </td>
                        <td className="p-3">
                          <button onClick={() => { if (confirm('حذف؟')) deleteMutation.mutate({ id: product.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/products"] }) }); }} className="text-red-400 hover:text-red-300 p-1">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function Purchases() {
  const { data: purchases = [], isLoading } = useGetPurchases();
  const [tab, setTab] = useState<"list" | "new" | "products">("list");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const filtered = purchases.filter(p => p.invoice_no.includes(search) || (p.supplier_name && p.supplier_name.includes(search)));

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center flex-wrap">
        <div className="flex bg-white/5 rounded-2xl p-1 border border-white/10">
          <button onClick={() => setTab("list")} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${tab === "list" ? "bg-amber-500 text-black shadow" : "text-white/50 hover:text-white"}`}>📋 سجل الفواتير</button>
          <button onClick={() => setTab("new")} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${tab === "new" ? "bg-amber-500 text-black shadow" : "text-white/50 hover:text-white"}`}>➕ فاتورة شراء</button>
          <button onClick={() => setTab("products")} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${tab === "products" ? "bg-amber-500 text-black shadow" : "text-white/50 hover:text-white"}`}>📦 المنتجات</button>
        </div>
        {tab === "list" && (
          <div className="relative flex-1 max-w-md">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input type="text" placeholder="بحث برقم الفاتورة أو المورد..." className="glass-input pr-10 text-sm w-full" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        )}
      </div>

      {selectedId && <PurchaseDetailModal purchaseId={selectedId} onClose={() => setSelectedId(null)} />}

      {tab === "new" ? (
        <NewPurchasePanel onDone={() => setTab("list")} />
      ) : tab === "products" ? (
        <ProductsPanel />
      ) : (
        <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-white/80 whitespace-nowrap">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  <th className="p-4 text-white/60 font-semibold">رقم الفاتورة</th>
                  <th className="p-4 text-white/60 font-semibold">المورد</th>
                  <th className="p-4 text-white/60 font-semibold">الإجمالي</th>
                  <th className="p-4 text-white/60 font-semibold">المدفوع</th>
                  <th className="p-4 text-white/60 font-semibold">المتبقي</th>
                  <th className="p-4 text-white/60 font-semibold">الدفع</th>
                  <th className="p-4 text-white/60 font-semibold">الحالة</th>
                  <th className="p-4 text-white/60 font-semibold">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? <tr><td colSpan={8} className="p-12 text-center text-white/40">جاري التحميل...</td></tr>
                  : filtered.length === 0 ? <tr><td colSpan={8} className="p-12 text-center text-white/40">لا توجد مشتريات</td></tr>
                    : filtered.map(purchase => (
                      <tr key={purchase.id} className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer" onClick={() => setSelectedId(purchase.id)}>
                        <td className="p-4 font-bold text-amber-400">{purchase.invoice_no}</td>
                        <td className="p-4">{purchase.supplier_name || 'بدون مورد'}</td>
                        <td className="p-4 font-bold text-white">{formatCurrency(purchase.total_amount)}</td>
                        <td className="p-4 text-emerald-400 font-bold">{formatCurrency(purchase.paid_amount)}</td>
                        <td className="p-4 text-red-400 font-bold">{formatCurrency(purchase.remaining_amount)}</td>
                        <td className="p-4"><PaymentBadge type={purchase.payment_type} /></td>
                        <td className="p-4"><StatusBadge status={purchase.status} /></td>
                        <td className="p-4 text-sm text-white/50">{formatDate(purchase.created_at)}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
