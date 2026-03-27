import { useState, useMemo } from "react";
import { useGetSales, useGetSaleById, useCreateSale, useGetProducts, useGetCustomers } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Search, Plus, Minus, Trash2, X, Printer, ShoppingCart, User, Package, Receipt } from "lucide-react";
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

function SaleDetailModal({ saleId, onClose }: { saleId: number; onClose: () => void }) {
  const { data: sale, isLoading } = useGetSaleById({ id: saleId });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="glass-panel rounded-3xl p-8 w-full max-w-2xl border border-white/10 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-bold text-white flex items-center gap-2">
            <Receipt className="w-6 h-6 text-amber-400" /> تفاصيل الفاتورة
          </h3>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 transition-colors"><Printer className="w-5 h-5" /></button>
            <button onClick={onClose} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 transition-colors"><X className="w-5 h-5" /></button>
          </div>
        </div>
        {isLoading ? (
          <div className="text-center py-12 text-white/40">جاري التحميل...</div>
        ) : !sale ? (
          <div className="text-center py-12 text-white/40">لم يتم العثور على الفاتورة</div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
              <div><p className="text-white/50 text-sm">رقم الفاتورة</p><p className="text-amber-400 font-bold text-lg">{sale.invoice_no}</p></div>
              <div><p className="text-white/50 text-sm">التاريخ</p><p className="text-white">{formatDate(sale.created_at)}</p></div>
              <div><p className="text-white/50 text-sm">العميل</p><p className="text-white font-semibold">{sale.customer_name || 'عميل نقدي'}</p></div>
              <div><p className="text-white/50 text-sm">طريقة الدفع</p><PaymentBadge type={sale.payment_type} /></div>
            </div>
            <div>
              <h4 className="text-white font-bold mb-3">أصناف الفاتورة</h4>
              <div className="rounded-2xl overflow-hidden border border-white/10">
                <table className="w-full text-right text-sm">
                  <thead className="bg-white/5 border-b border-white/10">
                    <tr>
                      <th className="p-3 text-white/60">الصنف</th>
                      <th className="p-3 text-white/60">الكمية</th>
                      <th className="p-3 text-white/60">سعر الوحدة</th>
                      <th className="p-3 text-white/60">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sale.items || []).map((item, i) => (
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
              <div className="flex justify-between"><span className="text-white/60">الإجمالي</span><span className="font-bold text-white text-lg">{formatCurrency(sale.total_amount)}</span></div>
              <div className="flex justify-between"><span className="text-white/60">المدفوع</span><span className="font-bold text-emerald-400">{formatCurrency(sale.paid_amount)}</span></div>
              {sale.remaining_amount > 0 && (
                <div className="flex justify-between border-t border-white/10 pt-3"><span className="text-white/60">المتبقي</span><span className="font-bold text-red-400 text-lg">{formatCurrency(sale.remaining_amount)}</span></div>
              )}
              <div className="flex justify-between border-t border-white/10 pt-3"><span className="text-white/60">الحالة</span><StatusBadge status={sale.status} /></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NewSalePanel({ onDone }: { onDone: () => void }) {
  const { data: products = [] } = useGetProducts();
  const { data: customers = [] } = useGetCustomers();
  const createSaleMutation = useCreateSale();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentType, setPaymentType] = useState<"cash" | "credit" | "partial">("cash");
  const [paidAmount, setPaidAmount] = useState<string>("");
  const [customerId, setCustomerId] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean)));

  const filteredProducts = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()));
    const matchCat = !categoryFilter || p.category === categoryFilter;
    return matchSearch && matchCat;
  });

  const cartTotal = useMemo(() => cart.reduce((s, i) => s + i.total_price, 0), [cart]);

  const addToCart = (product: typeof products[0]) => {
    setCart(prev => {
      const existing = prev.find(i => i.product_id === product.id);
      if (existing) return prev.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + 1, total_price: (i.quantity + 1) * i.unit_price } : i);
      return [...prev, { product_id: product.id, product_name: product.name, quantity: 1, unit_price: product.sale_price, total_price: product.sale_price }];
    });
  };

  const updateQty = (pid: number, delta: number) => setCart(prev => prev.map(i => {
    if (i.product_id !== pid) return i;
    const newQ = Math.max(1, i.quantity + delta);
    return { ...i, quantity: newQ, total_price: newQ * i.unit_price };
  }));

  const handleCheckout = () => {
    if (cart.length === 0) { toast({ title: "السلة فارغة", variant: "destructive" }); return; }
    if ((paymentType === "credit" || paymentType === "partial") && !customerId) {
      toast({ title: "يجب اختيار عميل للآجل أو الجزئي", variant: "destructive" }); return;
    }
    const actualPaid = paymentType === "cash" ? cartTotal : paymentType === "credit" ? 0 : parseFloat(paidAmount) || 0;
    const selectedCustomer = customers.find(c => c.id === parseInt(customerId));

    createSaleMutation.mutate({
      data: {
        payment_type: paymentType,
        total_amount: cartTotal,
        paid_amount: actualPaid,
        customer_id: selectedCustomer?.id ?? undefined,
        customer_name: selectedCustomer?.name ?? undefined,
        items: cart,
      }
    }, {
      onSuccess: () => {
        toast({ title: "✅ تم تسجيل الفاتورة بنجاح" + (selectedCustomer && paymentType !== 'cash' ? ` — تم تحديث رصيد ${selectedCustomer.name}` : '') });
        queryClient.invalidateQueries({ queryKey: ["/api/sales"] });
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
        setCart([]); setPaidAmount(""); setCustomerId(""); setPaymentType("cash");
        onDone();
      },
      onError: () => toast({ title: "حدث خطأ", variant: "destructive" })
    });
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-220px)]">
      {/* Products grid */}
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
              <button key={product.id} onClick={() => addToCart(product)} disabled={product.quantity <= 0}
                className={`glass-panel rounded-2xl p-3 text-right transition-all hover:-translate-y-0.5 ${product.quantity <= 0 ? 'opacity-40 cursor-not-allowed' : 'hover:border-amber-500/40'}`}>
                <div className="h-14 bg-white/5 rounded-xl mb-3 flex items-center justify-center border border-white/5">
                  <Package className="w-6 h-6 text-white/30" />
                </div>
                <p className="font-bold text-white text-sm truncate">{product.name}</p>
                {product.category && <p className="text-xs text-amber-400/70 mt-0.5">{product.category}</p>}
                <div className="flex justify-between items-center mt-2">
                  <span className="text-emerald-400 font-bold text-sm">{formatCurrency(product.sale_price)}</span>
                  <span className="text-xs text-white/40">{product.quantity}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cart */}
      <div className="w-full lg:w-[360px] flex flex-col glass-panel rounded-2xl overflow-hidden shrink-0">
        <div className="p-4 border-b border-white/10 bg-white/5 flex justify-between items-center">
          <h3 className="font-bold text-white flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-amber-400" /> السلة
          </h3>
          <span className="bg-amber-500/20 text-amber-400 px-3 py-1 rounded-full text-sm font-bold">{cart.length} صنف</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-white/20 gap-3 py-12">
              <ShoppingCart className="w-12 h-12 opacity-30" />
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
                <span className="font-bold text-emerald-400 text-sm">{formatCurrency(item.total_price)}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-white/10 bg-black/30 space-y-3">
          {/* Customer */}
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
            <User className="w-4 h-4 text-white/40" />
            <select className="bg-transparent text-white outline-none w-full text-sm appearance-none" value={customerId} onChange={e => setCustomerId(e.target.value)}>
              <option value="" className="bg-slate-900">عميل نقدي (بدون حساب)</option>
              {customers.map(c => <option key={c.id} value={c.id} className="bg-slate-900">{c.name} {c.balance > 0 ? `(رصيد: ${c.balance.toFixed(0)} ج.م)` : ''}</option>)}
            </select>
          </div>
          {/* Payment type */}
          <div className="grid grid-cols-3 gap-1">
            {[{ v: "cash", l: "نقدي" }, { v: "credit", l: "آجل" }, { v: "partial", l: "جزئي" }].map(opt => (
              <button key={opt.v} onClick={() => setPaymentType(opt.v as "cash" | "credit" | "partial")}
                className={`py-2 rounded-xl text-xs font-bold border transition-all ${paymentType === opt.v ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'}`}>
                {opt.l}
              </button>
            ))}
          </div>
          {paymentType === "partial" && (
            <input type="number" step="0.01" placeholder="المبلغ المدفوع" className="glass-input text-sm" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} />
          )}
          <div className="bg-white/5 rounded-xl p-3 border border-white/5 space-y-1.5">
            <div className="flex justify-between text-sm"><span className="text-white/60">الإجمالي</span><span className="font-bold text-white">{formatCurrency(cartTotal)}</span></div>
            {paymentType === "partial" && <div className="flex justify-between text-sm"><span className="text-white/60">المتبقي</span><span className="font-bold text-red-400">{formatCurrency(cartTotal - (parseFloat(paidAmount) || 0))}</span></div>}
            {paymentType === "credit" && customerId && <p className="text-xs text-yellow-400">⚠ سيُضاف على رصيد العميل</p>}
          </div>
          <button onClick={handleCheckout} disabled={createSaleMutation.isPending || cart.length === 0}
            className="w-full btn-primary py-3 disabled:opacity-50">
            {createSaleMutation.isPending ? "جاري التسجيل..." : "إصدار الفاتورة"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Sales() {
  const { data: sales = [], isLoading } = useGetSales();
  const [tab, setTab] = useState<"list" | "new">("list");
  const [search, setSearch] = useState("");
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null);

  const filtered = sales.filter(s =>
    s.invoice_no.includes(search) || (s.customer_name && s.customer_name.includes(search))
  );

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="flex bg-white/5 rounded-2xl p-1 border border-white/10">
          <button onClick={() => setTab("list")} className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${tab === "list" ? "bg-amber-500 text-black shadow" : "text-white/50 hover:text-white"}`}>
            📋 سجل الفواتير
          </button>
          <button onClick={() => setTab("new")} className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${tab === "new" ? "bg-amber-500 text-black shadow" : "text-white/50 hover:text-white"}`}>
            ➕ فاتورة بيع جديدة
          </button>
        </div>
        {tab === "list" && (
          <div className="relative flex-1 max-w-md">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input type="text" placeholder="بحث برقم الفاتورة أو العميل..." className="glass-input pr-10 text-sm w-full" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        )}
      </div>

      {selectedSaleId && <SaleDetailModal saleId={selectedSaleId} onClose={() => setSelectedSaleId(null)} />}

      {tab === "new" ? (
        <NewSalePanel onDone={() => setTab("list")} />
      ) : (
        <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-white/80 whitespace-nowrap">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  <th className="p-4 text-white/60 font-semibold">رقم الفاتورة</th>
                  <th className="p-4 text-white/60 font-semibold">العميل</th>
                  <th className="p-4 text-white/60 font-semibold">الإجمالي</th>
                  <th className="p-4 text-white/60 font-semibold">المدفوع</th>
                  <th className="p-4 text-white/60 font-semibold">المتبقي</th>
                  <th className="p-4 text-white/60 font-semibold">الدفع</th>
                  <th className="p-4 text-white/60 font-semibold">الحالة</th>
                  <th className="p-4 text-white/60 font-semibold">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={8} className="p-12 text-center text-white/40">جاري التحميل...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="p-12 text-center text-white/40">لا توجد فواتير</td></tr>
                ) : (
                  filtered.map(sale => (
                    <tr key={sale.id} className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer" onClick={() => setSelectedSaleId(sale.id)}>
                      <td className="p-4 font-bold text-amber-400">{sale.invoice_no}</td>
                      <td className="p-4">{sale.customer_name || 'عميل نقدي'}</td>
                      <td className="p-4 font-bold text-white">{formatCurrency(sale.total_amount)}</td>
                      <td className="p-4 text-emerald-400 font-bold">{formatCurrency(sale.paid_amount)}</td>
                      <td className="p-4 text-red-400 font-bold">{formatCurrency(sale.remaining_amount)}</td>
                      <td className="p-4"><PaymentBadge type={sale.payment_type} /></td>
                      <td className="p-4"><StatusBadge status={sale.status} /></td>
                      <td className="p-4 text-sm text-white/50">{formatDate(sale.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
