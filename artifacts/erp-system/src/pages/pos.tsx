import { useState, useMemo } from "react";
import { useGetProducts, useCreateSale, useGetCustomers } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import { Search, Plus, Minus, Trash2, ShoppingCart, User, Package } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface CartItem {
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export default function POS() {
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

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()))
  );

  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + item.total_price, 0), [cart]);

  const addToCart = (product: any) => {
    setCart(prev => {
      const existing = prev.find(item => item.product_id === product.id);
      if (existing) {
        return prev.map(item => 
          item.product_id === product.id 
            ? { ...item, quantity: item.quantity + 1, total_price: (item.quantity + 1) * item.unit_price }
            : item
        );
      }
      return [...prev, {
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        unit_price: product.sale_price,
        total_price: product.sale_price
      }];
    });
  };

  const updateQuantity = (productId: number, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.product_id === productId) {
        const newQ = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQ, total_price: newQ * item.unit_price };
      }
      return item;
    }));
  };

  const removeFromCart = (productId: number) => {
    setCart(prev => prev.filter(item => item.product_id !== productId));
  };

  const handleCheckout = () => {
    if (cart.length === 0) {
      toast({ title: "السلة فارغة", variant: "destructive" });
      return;
    }
    if ((paymentType === "credit" || paymentType === "partial") && !customerId) {
      toast({ title: "يجب اختيار عميل للآجل", variant: "destructive" });
      return;
    }

    let actualPaid = paymentType === "cash" ? cartTotal : 
                     paymentType === "credit" ? 0 : 
                     parseFloat(paidAmount) || 0;

    createSaleMutation.mutate({
      data: {
        payment_type: paymentType,
        total_amount: cartTotal,
        paid_amount: actualPaid,
        customer_id: customerId ? parseInt(customerId) : undefined,
        items: cart
      }
    }, {
      onSuccess: () => {
        toast({ title: "تم تسجيل البيع بنجاح" });
        setCart([]);
        setPaidAmount("");
        setCustomerId("");
        setPaymentType("cash");
        queryClient.invalidateQueries({ queryKey: ["/api/sales"] });
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      },
      onError: (err: any) => {
        toast({ title: "خطأ في تسجيل البيع", description: err.message, variant: "destructive" });
      }
    });
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-140px)]">
      {/* Products Section */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="glass-panel rounded-3xl p-4 mb-4 shrink-0 flex items-center gap-4">
          <Search className="w-5 h-5 text-white/50" />
          <input 
            type="text" 
            placeholder="ابحث عن منتج..." 
            className="bg-transparent border-none text-white outline-none w-full text-lg placeholder:text-white/30"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="flex-1 overflow-y-auto glass-panel rounded-3xl p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProducts.map(product => (
              <button 
                key={product.id}
                onClick={() => addToCart(product)}
                disabled={product.quantity <= 0}
                className={`glass-panel rounded-2xl p-4 text-right transition-all duration-200 hover:-translate-y-1 hover:shadow-primary/20 ${product.quantity <= 0 ? 'opacity-50 cursor-not-allowed grayscale' : 'hover:border-primary/50'}`}
              >
                <div className="h-20 bg-white/5 rounded-xl mb-4 flex items-center justify-center border border-white/5">
                  <Package className="w-8 h-8 text-white/40" />
                </div>
                <h4 className="font-bold text-white mb-1 truncate" title={product.name}>{product.name}</h4>
                <div className="flex justify-between items-end mt-4">
                  <span className="text-primary font-bold">{formatCurrency(product.sale_price)}</span>
                  <span className="text-xs text-white/50">{product.quantity} متوفر</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cart Section */}
      <div className="w-full lg:w-[400px] flex flex-col glass-panel rounded-3xl overflow-hidden shrink-0 h-full">
        <div className="p-4 border-b border-white/10 bg-white/5 flex justify-between items-center">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-primary" /> السلة
          </h3>
          <span className="bg-primary/20 text-primary px-3 py-1 rounded-full text-sm font-bold">
            {cart.length} عناصر
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-white/30 space-y-4">
              <ShoppingCart className="w-16 h-16 opacity-20" />
              <p>السلة فارغة</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.product_id} className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col gap-3">
                <div className="flex justify-between items-start">
                  <h4 className="font-bold text-white">{item.product_name}</h4>
                  <button onClick={() => removeFromCart(item.product_id)} className="text-red-400 hover:text-red-300 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3 bg-black/20 rounded-lg p-1 border border-white/5">
                    <button onClick={() => updateQuantity(item.product_id, 1)} className="p-1 hover:bg-white/10 rounded-md text-white transition-colors"><Plus className="w-4 h-4" /></button>
                    <span className="w-6 text-center font-medium text-white">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.product_id, -1)} className="p-1 hover:bg-white/10 rounded-md text-white transition-colors"><Minus className="w-4 h-4" /></button>
                  </div>
                  <span className="font-bold text-primary">{formatCurrency(item.total_price)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-white/10 bg-black/40 space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-white/70">الإجمالي</span>
            <span className="text-2xl font-black text-white">{formatCurrency(cartTotal)}</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(['cash', 'credit', 'partial'] as const).map(type => (
              <button 
                key={type}
                onClick={() => setPaymentType(type)}
                className={`py-2 px-1 rounded-xl text-sm font-bold border transition-all ${
                  paymentType === type 
                  ? 'bg-primary/20 border-primary text-primary shadow-[0_0_15px_rgba(16,185,129,0.2)]' 
                  : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                }`}
              >
                {type === 'cash' ? 'نقدي' : type === 'credit' ? 'آجل' : 'جزئي'}
              </button>
            ))}
          </div>

          {(paymentType === 'credit' || paymentType === 'partial') && (
            <div className="space-y-3 animate-in slide-in-from-bottom-2">
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2 focus-within:border-primary/50 transition-colors">
                <User className="w-4 h-4 text-white/40" />
                <select 
                  className="bg-transparent text-white outline-none w-full text-sm appearance-none"
                  value={customerId}
                  onChange={e => setCustomerId(e.target.value)}
                >
                  <option value="" className="bg-slate-900">اختر العميل...</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id} className="bg-slate-900">{c.name}</option>
                  ))}
                </select>
              </div>
              
              {paymentType === 'partial' && (
                <input 
                  type="number" 
                  placeholder="المبلغ المدفوع" 
                  className="glass-input text-sm"
                  value={paidAmount}
                  onChange={e => setPaidAmount(e.target.value)}
                />
              )}
            </div>
          )}

          <button 
            className="w-full py-4 rounded-xl bg-gradient-to-r from-primary to-emerald-500 text-white font-black text-lg shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleCheckout}
            disabled={cart.length === 0 || createSaleMutation.isPending}
          >
            {createSaleMutation.isPending ? "جاري التسجيل..." : "دفع وإصدار الفاتورة"}
          </button>
        </div>
      </div>
    </div>
  );
}
