import { useState, useMemo, useEffect } from "react";
import { useCreatePurchase, useGetProducts, useGetCustomers, useCreateProduct, useDeleteProduct, useGetSettingsSafes, useGetSettingsWarehouses } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import { Search, Plus, Minus, Trash2, ShoppingBag, Package, User, Vault, AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { TableSkeleton } from "@/components/skeletons";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const CATEGORIES = ["شاشات", "بطاريات", "هوسنجات", "فلاتر", "أجراس", "سماعات", "بورد تقطيع", "ضهور", "مبرمجات"];

interface CartItem {
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

/* ─── فاتورة شراء جديدة ─── */
function NewPurchasePanel({ onDone }: { onDone: () => void }) {
  const { data: products = [] } = useGetProducts();
  const { data: customers = [] } = useGetCustomers();
  const { data: safes = [] } = useGetSettingsSafes();
  const { data: warehouses = [] } = useGetSettingsWarehouses();
  const createMutation = useCreatePurchase();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentType, setPaymentType] = useState<"cash" | "credit" | "partial">("cash");
  const [paidAmount, setPaidAmount] = useState<string>("");
  const [customerId, setCustomerId] = useState<string>("");
  const [safeId, setSafeId] = useState<string>("");
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  useEffect(() => {
    if (warehouses.length > 0 && !warehouseId) setWarehouseId(String(warehouses[0].id));
  }, [warehouses, warehouseId]);

  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean)));
  const filteredProducts = products.filter(p => {
    const matchS = p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()));
    const matchC = !categoryFilter || p.category === categoryFilter;
    return matchS && matchC;
  });

  const cartTotal = useMemo(() => cart.reduce((s, i) => s + i.total_price, 0), [cart]);
  const selectedCustomer = customers.find(c => c.id === parseInt(customerId));

  // أثر على حساب العميل: نقدي=صفر، آجل=كامل المبلغ علينا، جزئي=المتبقي علينا
  const customerImpact = useMemo(() => {
    if (!customerId) return 0;
    if (paymentType === "cash") return 0;
    if (paymentType === "credit") return -cartTotal;
    return -(cartTotal - (parseFloat(paidAmount) || 0));
  }, [customerId, paymentType, paidAmount, cartTotal]);

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

  const updatePrice = (pid: number, price: number) => setCart(prev => prev.map(i =>
    i.product_id !== pid ? i : { ...i, unit_price: price, total_price: i.quantity * price }
  ));

  const handleCheckout = () => {
    if (cart.length === 0) { toast({ title: "السلة فارغة", variant: "destructive" }); return; }
    if ((paymentType === "credit" || paymentType === "partial") && !customerId) {
      toast({ title: "يجب اختيار عميل للآجل أو الجزئي", variant: "destructive" }); return;
    }
    if ((paymentType === "cash" || paymentType === "partial") && !safeId) {
      toast({ title: "يجب اختيار الخزينة للدفع النقدي", variant: "destructive" }); return;
    }
    const actualPaid = paymentType === "cash" ? cartTotal : paymentType === "credit" ? 0 : parseFloat(paidAmount) || 0;

    createMutation.mutate({
      data: {
        supplier_id: null,
        supplier_name: null,
        customer_id: selectedCustomer?.id ?? null,
        customer_name: selectedCustomer?.name ?? null,
        safe_id: safeId ? parseInt(safeId) : null,
        payment_type: paymentType,
        total_amount: cartTotal,
        paid_amount: actualPaid,
        items: cart,
      }
    }, {
      onSuccess: () => {
        toast({ title: "✅ تم تسجيل فاتورة الشراء — تم تحديث المخزن والخزينة" });
        queryClient.invalidateQueries({ queryKey: ["/api/purchases"] });
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
        queryClient.invalidateQueries({ queryKey: ["/api/settings/safes"] });
        setCart([]); setPaidAmount(""); setCustomerId(""); setSafeId(""); setPaymentType("cash");
        onDone();
      },
      onError: (e: Error) => toast({ title: e.message, variant: "destructive" })
    });
  };

  const selectRow = (label: string, icon: React.ReactNode, children: React.ReactNode) => (
    <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
      <span className="text-white/40 shrink-0">{icon}</span>
      <span className="text-white/40 text-xs w-14 shrink-0">{label}</span>
      {children}
    </div>
  );

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
      <div className="w-full lg:w-[400px] flex flex-col glass-panel rounded-2xl overflow-hidden shrink-0">
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/10 bg-white/5">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-white flex items-center gap-2 text-base">
              <ShoppingBag className="w-5 h-5 text-amber-400" /> فاتورة مشتريات
            </h3>
            <span className="bg-amber-500/20 text-amber-400 px-3 py-1 rounded-full text-xs font-bold">{cart.length} صنف</span>
          </div>
          <div className="grid grid-cols-1 gap-1.5 text-xs">
            {selectRow("المخزن", <Vault className="w-3.5 h-3.5" />,
              <select className="bg-transparent text-white outline-none w-full appearance-none text-xs" value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
                <option value="" className="bg-slate-900">-- مخزن --</option>
                {warehouses.map(w => <option key={w.id} value={w.id} className="bg-slate-900">{w.name}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* عناصر السلة — السعر قابل للتعديل */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-white/20 gap-3 py-10">
              <ShoppingBag className="w-12 h-12 opacity-30" />
              <p className="text-sm">اضغط على منتج لإضافته</p>
            </div>
          ) : cart.map(item => (
            <div key={item.product_id} className="bg-white/5 border border-white/10 rounded-xl p-3">
              <div className="flex justify-between items-start mb-2">
                <p className="font-bold text-white text-sm flex-1 ml-2 truncate">{item.product_name}</p>
                <button onClick={() => setCart(prev => prev.filter(i => i.product_id !== item.product_id))} className="text-red-400/70 hover:text-red-400 p-0.5"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => updateQty(item.product_id, -1)} className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20"><Minus className="w-3 h-3 text-white" /></button>
                  <span className="text-white font-bold text-sm w-5 text-center">{item.quantity}</span>
                  <button onClick={() => updateQty(item.product_id, 1)} className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20"><Plus className="w-3 h-3 text-white" /></button>
                </div>
                {/* السعر قابل للتعديل — مشتريات يتفاوت */}
                <div className="flex items-center gap-1 flex-1 min-w-0">
                  <span className="text-white/30 text-xs shrink-0">×</span>
                  <input
                    type="number" step="0.01" min="0"
                    value={item.unit_price}
                    onChange={e => updatePrice(item.product_id, parseFloat(e.target.value) || 0)}
                    className="bg-white/10 border border-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none w-full text-right"
                  />
                </div>
                <span className="font-bold text-blue-400 text-sm shrink-0">{formatCurrency(item.total_price)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-white/10 bg-black/40 space-y-2">
          {/* العميل والخزينة */}
          <div className="grid grid-cols-1 gap-1.5">
            {selectRow("العميل", <User className="w-3.5 h-3.5" />,
              <select className="bg-transparent text-white outline-none w-full appearance-none text-xs" value={customerId} onChange={e => setCustomerId(e.target.value)}>
                <option value="" className="bg-slate-900">-- بدون عميل --</option>
                {customers.map(c => {
                  const bal = Number(c.balance);
                  const balText = bal > 0 ? ` (يدين لنا: ${bal.toFixed(0)})`
                    : bal < 0 ? ` (نديّن له: ${Math.abs(bal).toFixed(0)})`
                    : '';
                  return <option key={c.id} value={c.id} className="bg-slate-900">{c.name}{balText}</option>;
                })}
              </select>
            )}
            {(paymentType === "cash" || paymentType === "partial") && (
              selectRow("الخزينة", <Vault className="w-3.5 h-3.5 text-amber-400/70" />,
                <select className="bg-transparent text-white outline-none w-full appearance-none text-xs" value={safeId} onChange={e => setSafeId(e.target.value)}>
                  <option value="" className="bg-slate-900">-- اختر الخزينة --</option>
                  {safes.map(s => <option key={s.id} value={s.id} className="bg-slate-900">{s.name} ({formatCurrency(Number(s.balance))})</option>)}
                </select>
              )
            )}
          </div>

          {/* طريقة الدفع */}
          <div className="flex gap-1">
            {[{ v: "cash", l: "نقدي", hint: "يُخصم من الخزينة" }, { v: "credit", l: "آجل", hint: "على حساب العميل" }, { v: "partial", l: "جزئي", hint: "جزء نقدي + آجل" }].map(opt => (
              <button key={opt.v} onClick={() => setPaymentType(opt.v as "cash" | "credit" | "partial")}
                className={`flex-1 py-1.5 rounded-xl text-xs font-bold border transition-all ${paymentType === opt.v ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'}`}>
                {opt.l}
              </button>
            ))}
          </div>

          {paymentType === "partial" && (
            <input type="number" step="0.01" placeholder="المبلغ المدفوع نقداً الآن..." className="glass-input text-xs py-2" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} />
          )}

          {/* ملخص */}
          <div className="bg-white/5 rounded-xl p-3 border border-white/10 space-y-1.5">
            <div className="flex justify-between">
              <span className="text-white/70 text-sm font-semibold">إجمالي الفاتورة</span>
              <span className="font-black text-white text-lg">{formatCurrency(cartTotal)}</span>
            </div>
            {paymentType === "cash" && (
              <div className="flex justify-between text-xs border-t border-white/10 pt-1.5">
                <span className="text-white/60">يُخصم من الخزينة</span>
                <span className="text-red-400 font-bold">− {formatCurrency(cartTotal)}</span>
              </div>
            )}
            {paymentType === "partial" && paidAmount && (
              <>
                <div className="flex justify-between text-xs border-t border-white/10 pt-1.5">
                  <span className="text-white/60">نقدي من الخزينة</span>
                  <span className="text-red-400 font-bold">− {formatCurrency(parseFloat(paidAmount) || 0)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/60">على حساب العميل</span>
                  <span className="text-orange-400 font-bold">− {formatCurrency(cartTotal - (parseFloat(paidAmount) || 0))}</span>
                </div>
              </>
            )}
            {customerId && customerImpact !== 0 && (
              <div className="flex justify-between text-xs border-t border-white/10 pt-1.5">
                <span className="text-white/60">رصيد {selectedCustomer?.name}</span>
                <span className="text-orange-400 font-bold">{formatCurrency(customerImpact)} (علينا)</span>
              </div>
            )}
            {paymentType === "credit" && customerId && (
              <p className="text-xs text-orange-400/80 bg-orange-500/5 border border-orange-500/20 rounded-lg px-2 py-1.5">
                ⚠ الفاتورة ستُرحَّل على حساب العميل — نحن المدينون
              </p>
            )}
          </div>

          <button onClick={handleCheckout} disabled={createMutation.isPending || cart.length === 0}
            className="w-full btn-primary py-3 text-sm disabled:opacity-50 font-bold">
            {createMutation.isPending ? "جاري التسجيل..." : "✦ تسجيل فاتورة الشراء"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── إدارة المنتجات ─── */
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
        <button onClick={() => { setFormData({ name: "", sku: generateBarcode(), category: "", quantity: 0, cost_price: 0, sale_price: 0, low_stock_threshold: 5 }); setShowAdd(true); }} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> منتج جديد
        </button>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm modal-overlay">
          <form onSubmit={handleSubmit} className="glass-panel rounded-3xl p-8 w-full max-w-md border border-white/10">
            <h3 className="text-xl font-bold text-white mb-5">إضافة منتج جديد</h3>
            <div className="space-y-3">
              <div><label className="text-white/60 text-xs mb-1 block">اسم المنتج *</label><input required type="text" className="glass-input" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} /></div>
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-3">
                <label className="text-amber-400 text-xs font-bold mb-2 block">🔲 الباركود</label>
                <div className="flex gap-2 items-center">
                  <input type="text" className="glass-input flex-1 font-mono text-sm tracking-wider text-amber-300" value={formData.sku} onChange={e => setFormData({ ...formData, sku: e.target.value })} placeholder="تلقائي" />
                  <button type="button" onClick={() => setFormData(f => ({ ...f, sku: generateBarcode() }))} className="px-3 py-2 rounded-xl bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 text-xs font-bold shrink-0">تجديد</button>
                </div>
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
              {isLoading ? <TableSkeleton cols={6} rows={5} />
                : filtered.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-white/40">لا توجد منتجات</td></tr>
                  : filtered.map(product => {
                    const isLow = product.low_stock_threshold !== null && product.quantity <= (product.low_stock_threshold ?? 5);
                    return (
                      <tr key={product.id} className="border-b border-white/5 erp-table-row">
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

/* ─── الصفحة الرئيسية ─── */
export default function Purchases() {
  const [tab, setTab] = useState<"new" | "products">("new");

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <div className="flex bg-white/5 rounded-2xl p-1 border border-white/10">
          <button onClick={() => setTab("new")} className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${tab === "new" ? "bg-amber-500 text-black shadow" : "text-white/50 hover:text-white"}`}>
            فاتورة شراء
          </button>
          <button onClick={() => setTab("products")} className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${tab === "products" ? "bg-amber-500 text-black shadow" : "text-white/50 hover:text-white"}`}>
            المنتجات
          </button>
        </div>
      </div>

      {tab === "new" ? <NewPurchasePanel onDone={() => {}} /> : <ProductsPanel />}
    </div>
  );
}
