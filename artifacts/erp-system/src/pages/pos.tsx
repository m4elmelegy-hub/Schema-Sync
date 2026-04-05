import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/auth";
import { hasPermission } from "@/lib/permissions";
import { authFetch } from "@/lib/auth-fetch";
import { useGetCustomers, useGetSettingsSafes } from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { SearchableSelect } from "@/components/searchable-select";
import {
  ShoppingCart, Search, Plus, Minus, Trash2, Receipt,
  AlertTriangle, Zap, X, CreditCard, Banknote, Clock,
  Store, Vault, CheckCircle2, Keyboard, Printer, Tag,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api  = (p: string) => `${BASE}${p}`;

/* ─────────────────────────────────────────────────────────────
   TYPES
───────────────────────────────────────────────────────────── */
interface CartItem {
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  stock: number;
}

interface SuccessInvoice {
  invoice_no: string;
  total_amount: number;
  customer_name: string | null;
  customer_phone: string | null;
  payment_type: string;
  items: CartItem[];
}

/* ─────────────────────────────────────────────────────────────
   WHATSAPP SUCCESS MODAL
───────────────────────────────────────────────────────────── */
function SuccessModal({ invoice, onClose }: { invoice: SuccessInvoice; onClose: () => void }) {
  const payLabel: Record<string, string> = { cash: "نقدي", credit: "آجل", partial: "جزئي" };

  const waMsg = () => {
    const lines = [
      `🧾 *فاتورة مبيعات - Halal Tech*`,
      `رقم الفاتورة: ${invoice.invoice_no}`,
      ``,
      `*الأصناف:*`,
      ...invoice.items.map(i => `• ${i.product_name} × ${i.quantity} = ${i.total_price.toFixed(2)} ج.م`),
      ``,
      `*الإجمالي: ${invoice.total_amount.toFixed(2)} ج.م*`,
      `طريقة الدفع: ${payLabel[invoice.payment_type] || invoice.payment_type}`,
      ``,
      `شكراً لتعاملكم معنا 🙏`,
    ];
    return encodeURIComponent(lines.join("\n"));
  };

  const phoneRaw = invoice.customer_phone?.replace(/\D/g, "") ?? "";
  const phone    = phoneRaw.startsWith("0") ? "2" + phoneRaw : phoneRaw.startsWith("2") ? phoneRaw : "2" + phoneRaw;
  const waUrl    = `https://wa.me/${phone}?text=${waMsg()}`;

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "F9" || e.key === "Enter") { e.preventDefault(); onClose(); } };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="rounded-3xl p-8 w-full max-w-sm border border-emerald-500/40 shadow-2xl text-center space-y-5"
        style={{ background: "rgba(10,18,32,0.97)" }}>
        <div className="w-20 h-20 bg-emerald-500/15 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30">
          <CheckCircle2 className="w-10 h-10 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-2xl font-black text-white">تم إصدار الفاتورة ✅</h3>
          <p className="text-amber-400 font-bold text-xl mt-1">{invoice.invoice_no}</p>
          <p className="text-white/60 text-sm mt-2">
            الإجمالي: <span className="text-white font-black text-lg">{formatCurrency(invoice.total_amount)}</span>
          </p>
          {invoice.customer_name && (
            <p className="text-white/50 text-sm mt-1">العميل: <span className="text-white font-semibold">{invoice.customer_name}</span></p>
          )}
        </div>
        <div className="space-y-3">
          {invoice.customer_phone && (
            <a href={waUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 w-full py-3.5 rounded-2xl font-bold transition-all"
              style={{ background: "rgba(37,211,102,0.15)", border: "1px solid rgba(37,211,102,0.35)", color: "#25D366" }}>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              إرسال واتساب
            </a>
          )}
          <button onClick={onClose}
            className="w-full py-3.5 rounded-2xl font-bold text-white/70 border border-white/10 hover:border-white/25 hover:text-white transition-all"
            style={{ background: "rgba(255,255,255,0.04)" }}>
            إغلاق (ESC / F9)
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   ADMIN POS SETUP — اختيار الفرع والخزينة للمدير
───────────────────────────────────────────────────────────── */
function AdminPOSSetup({ onStart }: { onStart: (w: number, s: number) => void }) {
  const { data: warehouses = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/settings/warehouses"],
    queryFn: () => authFetch(api("/api/settings/warehouses")).then(r => r.json()),
  });
  const { data: rawSafes = [] } = useGetSettingsSafes();
  const safes = rawSafes as { id: number; name: string }[];

  const [wId, setWId] = useState<string>(
    () => localStorage.getItem("pos:lastWarehouse") ?? ""
  );
  const [sId, setSId] = useState<string>(
    () => localStorage.getItem("pos:lastSafe") ?? ""
  );

  const warehouseItems = useMemo(() =>
    warehouses.map(w => ({ value: String(w.id), label: w.name, searchKeys: [w.name] })),
    [warehouses]
  );
  const safeItems = useMemo(() =>
    safes.map(s => ({ value: String(s.id), label: s.name, searchKeys: [s.name] })),
    [safes]
  );

  const ready = !!wId && !!sId;

  function handleStart() {
    if (!ready) return;
    localStorage.setItem("pos:lastWarehouse", wId);
    localStorage.setItem("pos:lastSafe",      sId);
    onStart(Number(wId), Number(sId));
  }

  return (
    <div className="pos-page fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="rpt-panel w-full max-w-md p-8 space-y-6">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto">
            <Store className="w-8 h-8 text-amber-400" />
          </div>
          <h2 className="text-xl font-black rpt-strong">اختيار الفرع والخزينة</h2>
          <p className="rpt-muted">وضع المدير — يُختار يدوياً ولا يُحفظ في الملف الشخصي</p>
        </div>

        {/* Warehouse */}
        <div className="space-y-1.5">
          <label className="rpt-label flex items-center gap-1.5">
            <Vault className="w-3.5 h-3.5" />
            الفرع / المخزن
          </label>
          <SearchableSelect
            items={warehouseItems}
            value={wId}
            onChange={setWId}
            placeholder="ابحث باسم الفرع..."
            emptyLabel="— اختر الفرع —"
            clearable={false}
          />
        </div>

        {/* Safe */}
        <div className="space-y-1.5">
          <label className="rpt-label flex items-center gap-1.5">
            <Vault className="w-3.5 h-3.5" />
            الخزينة
          </label>
          <SearchableSelect
            items={safeItems}
            value={sId}
            onChange={setSId}
            placeholder="ابحث باسم الخزينة..."
            emptyLabel="— اختر الخزينة —"
            clearable={false}
          />
        </div>

        {/* Start button */}
        <button
          onClick={handleStart}
          className={`w-full h-11 text-base ${ready ? "rpt-btn-primary" : "rpt-btn-disabled"}`}
        >
          <Zap className="w-4 h-4" />
          بدء البيع
        </button>

        {ready && (
          <p className="text-center rpt-muted">
            {warehouseItems.find(w => w.value === wId)?.label} ·{" "}
            {safeItems.find(s => s.value === sId)?.label}
          </p>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   MAIN POS PAGE
───────────────────────────────────────────────────────────── */
export default function POSPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  /* ── Permissions ── */
  const canEditPrice   = hasPermission(user, "can_edit_price") === true;
  const canCash        = hasPermission(user, "can_cash_sale") === true;
  const canCredit      = hasPermission(user, "can_credit_sale") === true;
  const canPartial     = hasPermission(user, "can_partial_sale") === true;

  /* ── Role detection ── */
  const isAdmin = user?.role === "admin";

  /* ── User-bound IDs (never from body for cashier) ── */
  const profileWarehouse = user?.warehouse_id ?? null;
  const profileSafe      = user?.safe_id ?? null;

  /* ── Admin manual selection (session-only, not saved to DB) ── */
  const [adminSetup, setAdminSetup] = useState<{ warehouseId: number | null; safeId: number | null }>({
    warehouseId: null,
    safeId:      null,
  });

  /* ── Resolve final IDs ── */
  const warehouseId = profileWarehouse ?? adminSetup.warehouseId;
  const safeId      = profileSafe      ?? adminSetup.safeId;

  /* ── Block: non-admin without warehouse/safe ── */
  if (!warehouseId || !safeId) {
    if (!isAdmin) {
      return (
        <div className="pos-page fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 p-8" dir="rtl">
          <div className="w-20 h-20 rounded-3xl bg-red-500/10 border border-red-500/30 flex items-center justify-center">
            <AlertTriangle className="w-10 h-10 text-red-400" />
          </div>
          <div className="text-center space-y-2 max-w-sm">
            <h2 className="text-2xl font-black rpt-strong">وصول مرفوض</h2>
            <p className="text-red-400 font-bold text-lg">يجب ربط حسابك بمخزن وخزينة أولاً</p>
            <p className="rpt-muted">تواصل مع المدير لإتمام إعداد حسابك قبل استخدام نقطة البيع</p>
          </div>
        </div>
      );
    }

    /* ── Admin: show branch/safe picker ── */
    return (
      <AdminPOSSetup
        onStart={(w, s) => setAdminSetup({ warehouseId: w, safeId: s })}
      />
    );
  }

  return <POSBody
    warehouseId={warehouseId}
    safeId={safeId}
    canEditPrice={canEditPrice}
    canCash={canCash}
    canCredit={canCredit}
    canPartial={canPartial}
  />;
}

/* ─────────────────────────────────────────────────────────────
   POS BODY (after access check)
───────────────────────────────────────────────────────────── */
function POSBody({
  warehouseId, safeId,
  canEditPrice, canCash, canCredit, canPartial,
}: {
  warehouseId: number;
  safeId: number;
  canEditPrice: boolean;
  canCash: boolean;
  canCredit: boolean;
  canPartial: boolean;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  /* ── Data ── */
  const { data: products = [] } = useQuery<{ id: number; name: string; sku: string | null; quantity: number; sale_price: number; cost_price: number; barcode?: string | null }[]>({
    queryKey: ["/api/products"],
    queryFn: () => authFetch(api("/api/products")).then(r => r.json()),
    staleTime: 60_000,
  });
  const { data: customers = [] } = useGetCustomers();
  const { data: safes    = [] } = useGetSettingsSafes();
  const { data: warehouses = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/settings/warehouses"],
    queryFn: () => authFetch(api("/api/settings/warehouses")).then(r => r.json()),
    staleTime: 5 * 60_000,
  });

  /* ── Display names ── */
  const warehouseName = warehouses.find(w => w.id === warehouseId)?.name ?? `فرع ${warehouseId}`;
  const safeName      = safes.find(s => s.id === safeId)?.name ?? `خزينة ${safeId}`;

  /* ── State ── */
  const [search, setSearch]             = useState("");
  const [cart, setCart]                 = useState<CartItem[]>([]);
  const [payType, setPayType]           = useState<"cash" | "credit" | "partial">(() =>
    canCash ? "cash" : canCredit ? "credit" : "partial"
  );
  const [customerId, setCustomerId]     = useState("");
  const [paidAmount, setPaidAmount]     = useState("");
  const [discountPct, setDiscountPct]   = useState("");
  const [editingPriceId, setEditingPriceId] = useState<number | null>(null);
  const [editingPriceVal, setEditingPriceVal] = useState("");
  const [successInvoice, setSuccessInvoice] = useState<SuccessInvoice | null>(null);
  const [recentlyAdded, setRecentlyAdded] = useState<number | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  /* ── Refs ── */
  const searchRef = useRef<HTMLInputElement>(null);
  const checkoutRef = useRef<() => void>(() => {});

  /* ── Auto-focus on mount ── */
  useEffect(() => { searchRef.current?.focus(); }, []);

  /* ── Filtered products ── */
  const filtered = useMemo(() =>
    products.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()))
    ),
    [products, search]
  );

  /* ── Cart calculations ── */
  const cartSubtotal = useMemo(() => cart.reduce((s, i) => s + i.total_price, 0), [cart]);
  const discountAmt  = useMemo(() => cartSubtotal * (parseFloat(discountPct) || 0) / 100, [cartSubtotal, discountPct]);
  const cartTotal    = useMemo(() => cartSubtotal - discountAmt, [cartSubtotal, discountAmt]);

  /* ── Customer list for select ── */
  const customerItems = useMemo(() =>
    customers.map(c => ({
      value: String(c.id),
      label: `${c.customer_code ? `[${c.customer_code}] ` : ""}${c.name}${Number(c.balance) > 0 ? ` (دين: ${Number(c.balance).toFixed(0)} ج.م)` : ""}`,
      searchKeys: [String(c.customer_code ?? ""), c.name],
    })),
    [customers]
  );

  const selectedCustomer = customers.find(c => c.id === parseInt(customerId));

  /* ── Add to cart ── */
  const addToCart = useCallback((product: typeof products[0]) => {
    if (Number(product.quantity) <= 0) {
      toast({ title: `⚠ "${product.name}" نفد من المخزون`, variant: "destructive" });
      return;
    }
    setCart(prev => {
      const ex = prev.find(i => i.product_id === product.id);
      if (ex) {
        if (ex.quantity >= Number(product.quantity)) {
          toast({ title: `⚠ الكمية المتاحة: ${Number(product.quantity)}`, variant: "destructive" });
          return prev;
        }
        return prev.map(i => i.product_id === product.id
          ? { ...i, quantity: i.quantity + 1, total_price: (i.quantity + 1) * i.unit_price }
          : i
        );
      }
      return [...prev, {
        product_id:   product.id,
        product_name: product.name,
        quantity:     1,
        unit_price:   product.sale_price,
        total_price:  product.sale_price,
        stock:        Number(product.quantity),
      }];
    });
    setRecentlyAdded(product.id);
    setTimeout(() => setRecentlyAdded(null), 500);
  }, [products, toast]);

  /* ── Update quantity ── */
  const updateQty = (pid: number, delta: number) => {
    setCart(prev => {
      return prev.map(i => {
        if (i.product_id !== pid) return i;
        const newQ = Math.max(1, i.quantity + delta);
        if (newQ > i.stock) {
          toast({ title: `⚠ الكمية المتاحة: ${i.stock}`, variant: "destructive" });
          return i;
        }
        return { ...i, quantity: newQ, total_price: newQ * i.unit_price };
      });
    });
  };

  const removeItem = (pid: number) => setCart(prev => prev.filter(i => i.product_id !== pid));

  /* ── Update price (if allowed) ── */
  const commitPrice = (pid: number, val: string) => {
    const newPrice = parseFloat(val);
    if (isNaN(newPrice) || newPrice < 0) { setEditingPriceId(null); return; }
    const prod = products.find(p => p.id === pid);
    const cost = prod ? Number(prod.cost_price) : 0;
    if (cost > 0 && newPrice < cost - 0.001) {
      toast({ title: `⚠ السعر أقل من التكلفة (${formatCurrency(cost)})`, variant: "destructive" });
    }
    setCart(prev => prev.map(i => i.product_id !== pid ? i
      : { ...i, unit_price: newPrice, total_price: newPrice * i.quantity }
    ));
    setEditingPriceId(null);
  };

  /* ── Checkout mutation ── */
  const checkoutMutation = useMutation({
    mutationFn: (data: object) =>
      authFetch(api("/api/sales"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-request-id": `pos-${Date.now()}-${Math.random()}` },
        body: JSON.stringify(data),
      }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "خطأ"); return j; }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/sales"] });
      qc.invalidateQueries({ queryKey: ["/api/products"] });
      qc.invalidateQueries({ queryKey: ["/api/customers"] });
      qc.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/settings/safes"] });
      /* fire-and-forget backup after each sale */
      authFetch(api("/api/system/backup"), { method: "POST" }).catch(() => {});
      setCheckoutError(null);
      setSuccessInvoice({
        invoice_no:    data.invoice_no,
        total_amount:  data.total_amount,
        customer_name: selectedCustomer?.name ?? null,
        customer_phone: selectedCustomer?.phone ?? null,
        payment_type:  payType,
        items: [...cart],
      });
      /* Reset */
      setCart([]);
      setPaidAmount("");
      setCustomerId("");
      setDiscountPct("");
      setPayType(canCash ? "cash" : canCredit ? "credit" : "partial");
      setTimeout(() => searchRef.current?.focus(), 100);
    },
    onError: (e: Error) => {
      setCheckoutError(e.message);
      toast({ title: "❌ فشل التسجيل", description: e.message, variant: "destructive" });
    },
  });

  /* ── handleCheckout ── */
  const handleCheckout = useCallback(() => {
    if (cart.length === 0) { toast({ title: "السلة فارغة", variant: "destructive" }); return; }
    if ((payType === "credit" || payType === "partial") && !customerId) {
      toast({ title: "يجب اختيار عميل للآجل أو الجزئي", variant: "destructive" }); return;
    }
    const actualPaid = payType === "cash" ? cartTotal
      : payType === "credit" ? 0
      : parseFloat(paidAmount) || 0;

    checkoutMutation.mutate({
      payment_type:     payType,
      total_amount:     cartTotal,
      paid_amount:      actualPaid,
      customer_id:      selectedCustomer?.id ?? null,
      customer_name:    selectedCustomer?.name ?? null,
      safe_id:          safeId,
      warehouse_id:     warehouseId,
      salesperson_id:   user?.id ?? null,
      discount_percent: parseFloat(discountPct) || 0,
      discount_amount:  discountAmt,
      items: cart.map(i => ({
        product_id:   i.product_id,
        product_name: i.product_name,
        quantity:     i.quantity,
        unit_price:   i.unit_price,
        total_price:  i.total_price,
      })),
    });
  }, [cart, payType, customerId, cartTotal, paidAmount, selectedCustomer, safeId, warehouseId, user, discountPct, discountAmt, checkoutMutation, toast]);

  /* keep ref current */
  checkoutRef.current = handleCheckout;

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      /* F9 → checkout */
      if (e.key === "F9") { e.preventDefault(); checkoutRef.current(); return; }
      /* F2 → focus search */
      if (e.key === "F2") { e.preventDefault(); searchRef.current?.focus(); return; }
      /* ESC → clear search */
      if (e.key === "Escape") {
        setSearch(prev => {
          if (prev) { setTimeout(() => searchRef.current?.focus(), 0); return ""; }
          return prev;
        });
        return;
      }
      /* Enter → add first product */
      if (e.key === "Enter" && document.activeElement === searchRef.current && filtered.length > 0) {
        e.preventDefault();
        addToCart(filtered[0]);
        return;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [filtered, addToCart]);

  /* ── Payment options ── */
  const payOptions = [
    { v: "cash"    as const, l: "نقدي",  icon: Banknote,    allow: canCash,    color: "emerald" },
    { v: "credit"  as const, l: "آجل",   icon: Clock,       allow: canCredit,  color: "blue" },
    { v: "partial" as const, l: "جزئي",  icon: CreditCard,  allow: canPartial, color: "amber" },
  ].filter(o => o.allow);

  const needsCustomer = payType === "credit" || payType === "partial";

  /* ── Stock color ── */
  const stockColor = (qty: number) =>
    qty <= 0 ? "text-red-400" : qty <= 5 ? "text-amber-400" : "text-white/40";

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden"
      style={{ background: "hsl(225,28%,4%)", fontFamily: "'Inter', sans-serif" }}
      dir="rtl"
    >
      {/* ═══════════════════════════════════ TOP BAR ══════════════════════════════════ */}
      <header className="flex items-center justify-between px-4 py-2.5 shrink-0 border-b border-white/6"
        style={{ background: "rgba(0,0,0,0.35)" }}>
        <div className="flex items-center gap-5">
          {/* Branch */}
          <div className="flex items-center gap-2">
            <Store className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <p className="text-white/35 text-[10px] leading-none">الفرع</p>
              <p className="text-white font-bold text-sm leading-tight">{warehouseName}</p>
            </div>
          </div>
          {/* Safe */}
          <div className="flex items-center gap-2">
            <Vault className="w-4 h-4 text-violet-400 shrink-0" />
            <div>
              <p className="text-white/35 text-[10px] leading-none">الخزينة</p>
              <p className="text-white font-bold text-sm leading-tight">{safeName}</p>
            </div>
          </div>
          {/* User */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0"
              style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#000" }}>
              {(user?.name ?? "?").slice(0, 2)}
            </div>
            <p className="text-white/60 text-sm font-medium">{user?.name}</p>
          </div>
        </div>
        {/* Keyboard hints */}
        <div className="hidden lg:flex items-center gap-3">
          {[["F2", "بحث"], ["Enter", "إضافة"], ["F9", "دفع"], ["ESC", "مسح"]].map(([k, l]) => (
            <div key={k} className="flex items-center gap-1.5">
              <kbd className="px-2 py-0.5 rounded-md text-[10px] font-bold text-white/50 border border-white/12"
                style={{ background: "rgba(255,255,255,0.06)" }}>{k}</kbd>
              <span className="text-white/25 text-[10px]">{l}</span>
            </div>
          ))}
          <Keyboard className="w-3.5 h-3.5 text-white/20 mr-1" />
        </div>
      </header>

      {/* ═══════════════════════════════════ BODY ═════════════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ═══ LEFT: PRODUCTS ═══ */}
        <div className="flex flex-col flex-1 min-w-0 border-l border-white/6">

          {/* Search bar */}
          <div className="px-3 py-2.5 border-b border-white/6 shrink-0"
            style={{ background: "rgba(0,0,0,0.2)" }}>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="بحث عن صنف... (F2)"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 pr-10 text-sm text-white placeholder:text-white/25 outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/15 transition-all"
              />
              {search && (
                <button onClick={() => { setSearch(""); searchRef.current?.focus(); }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Products grid */}
          <div className="flex-1 overflow-y-auto p-3">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-white/25">
                <Search className="w-8 h-8" />
                <p className="text-sm">لا توجد نتائج</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                {filtered.map(p => {
                  const qty = Number(p.quantity);
                  const outOfStock = qty <= 0;
                  const isJustAdded = recentlyAdded === p.id;
                  const inCart = cart.find(i => i.product_id === p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => !outOfStock && addToCart(p)}
                      disabled={outOfStock}
                      className={`relative flex flex-col text-right rounded-2xl p-3 border transition-all duration-150 text-start
                        ${outOfStock
                          ? "opacity-35 cursor-not-allowed border-white/6 bg-white/2"
                          : isJustAdded
                            ? "border-amber-500/70 bg-amber-500/12 scale-[0.97]"
                            : inCart
                              ? "border-emerald-500/40 bg-emerald-500/8 hover:border-emerald-500/60"
                              : "border-white/8 bg-white/3 hover:border-white/20 hover:bg-white/6 active:scale-[0.97]"
                        }`}
                    >
                      {inCart && (
                        <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-[10px] font-black text-white">
                          {inCart.quantity}
                        </div>
                      )}
                      <p className="text-white font-bold text-sm leading-tight line-clamp-2 mb-2 flex-1">{p.name}</p>
                      <div className="flex items-end justify-between mt-auto gap-1">
                        <p className="text-amber-400 font-black text-base">{formatCurrency(p.sale_price)}</p>
                        <p className={`text-xs font-semibold ${stockColor(qty)}`}>{qty > 0 ? qty : "نفد"}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ═══ RIGHT: CART + PAYMENT ═══ */}
        <div className="flex flex-col w-[340px] lg:w-[400px] shrink-0" style={{ background: "rgba(0,0,0,0.25)" }}>

          {/* Cart header */}
          <div className="px-4 py-3 border-b border-white/6 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-amber-400" />
              <span className="text-white font-bold text-sm">السلة</span>
              {cart.length > 0 && (
                <span className="w-5 h-5 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center">
                  {cart.length}
                </span>
              )}
            </div>
            {cart.length > 0 && (
              <button onClick={() => setCart([])}
                className="flex items-center gap-1 text-red-400/60 hover:text-red-400 text-xs transition-all">
                <Trash2 className="w-3 h-3" /> مسح الكل
              </button>
            )}
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-white/20">
                <ShoppingCart className="w-10 h-10" />
                <p className="text-sm">السلة فارغة</p>
                <p className="text-xs">اضغط Enter لإضافة أول صنف</p>
              </div>
            ) : (
              <div className="p-2 space-y-1.5">
                {cart.map(item => (
                  <div key={item.product_id}
                    className="flex items-center gap-2 rounded-xl px-3 py-2.5 border border-white/8"
                    style={{ background: "rgba(255,255,255,0.04)" }}>
                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs font-bold leading-snug line-clamp-1">{item.product_name}</p>
                      {/* Price — editable if allowed */}
                      {canEditPrice && editingPriceId === item.product_id ? (
                        <input
                          autoFocus
                          type="number"
                          step="0.01"
                          value={editingPriceVal}
                          onChange={e => setEditingPriceVal(e.target.value)}
                          onBlur={() => commitPrice(item.product_id, editingPriceVal)}
                          onKeyDown={e => {
                            if (e.key === "Enter") commitPrice(item.product_id, editingPriceVal);
                            if (e.key === "Escape") setEditingPriceId(null);
                          }}
                          className="w-full bg-amber-500/10 border border-amber-500/40 rounded px-1.5 py-0.5 text-xs text-amber-300 outline-none mt-0.5"
                        />
                      ) : (
                        <p
                          className={`text-amber-400/70 text-xs mt-0.5 ${canEditPrice ? "cursor-pointer hover:text-amber-400 hover:underline" : ""}`}
                          onClick={() => {
                            if (!canEditPrice) return;
                            setEditingPriceId(item.product_id);
                            setEditingPriceVal(String(item.unit_price));
                          }}
                        >
                          {formatCurrency(item.unit_price)}
                          {canEditPrice && <span className="text-white/20 text-[10px] mr-1">✏</span>}
                        </p>
                      )}
                    </div>
                    {/* Qty controls */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => updateQty(item.product_id, -1)}
                        className="w-7 h-7 rounded-lg bg-white/8 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition-all">
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-7 text-center text-white font-bold text-sm">{item.quantity}</span>
                      <button onClick={() => updateQty(item.product_id, 1)}
                        className="w-7 h-7 rounded-lg bg-white/8 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition-all">
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    {/* Total */}
                    <p className="text-white font-black text-sm w-16 text-left shrink-0">{formatCurrency(item.total_price)}</p>
                    {/* Remove */}
                    <button onClick={() => removeItem(item.product_id)}
                      className="w-6 h-6 rounded-lg flex items-center justify-center text-red-400/40 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── PAYMENT PANEL ── */}
          <div className="border-t border-white/8 p-3 space-y-3 shrink-0"
            style={{ background: "rgba(0,0,0,0.3)" }}>

            {/* Discount */}
            <div className="flex items-center gap-2">
              <label className="text-white/40 text-xs shrink-0">خصم %</label>
              <input
                type="number" min="0" max="100" step="0.5"
                value={discountPct}
                onChange={e => setDiscountPct(e.target.value)}
                placeholder="0"
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white text-center outline-none focus:border-amber-500/50 transition-all"
              />
              {discountAmt > 0 && (
                <span className="text-red-400 text-xs font-bold shrink-0">-{formatCurrency(discountAmt)}</span>
              )}
            </div>

            {/* Payment type buttons */}
            {payOptions.length > 0 ? (
              <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${payOptions.length}, 1fr)` }}>
                {payOptions.map(o => {
                  const Icon = o.icon;
                  const active = payType === o.v;
                  return (
                    <button key={o.v} onClick={() => setPayType(o.v)}
                      className={`flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl border transition-all font-bold text-xs
                        ${active
                          ? o.color === "emerald" ? "bg-emerald-500 border-emerald-400 text-white shadow-lg shadow-emerald-500/20"
                            : o.color === "blue"    ? "bg-blue-500 border-blue-400 text-white shadow-lg shadow-blue-500/20"
                                                   : "bg-amber-500 border-amber-400 text-black shadow-lg shadow-amber-500/20"
                          : "bg-white/5 border-white/10 text-white/50 hover:border-white/25 hover:text-white/80"
                        }`}>
                      <Icon className="w-4 h-4" />
                      {o.l}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-center text-red-400 text-xs py-2 border border-red-500/20 rounded-xl bg-red-500/5">
                ⚠ لا توجد صلاحية لأي نوع دفع
              </div>
            )}

            {/* Customer select (credit / partial) */}
            {needsCustomer && (
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5">
                <span className="text-white/40 text-xs shrink-0">العميل</span>
                <SearchableSelect
                  items={customerItems}
                  value={customerId}
                  onChange={setCustomerId}
                  placeholder="ابحث..."
                  emptyLabel="-- اختر عميلاً --"
                  className="flex-1 text-xs"
                />
              </div>
            )}

            {/* Partial paid amount */}
            {payType === "partial" && (
              <input
                type="number" step="0.01"
                placeholder="المبلغ المدفوع جزئياً..."
                value={paidAmount}
                onChange={e => setPaidAmount(e.target.value)}
                className="w-full bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500/60 transition-all text-center"
              />
            )}

            {/* Totals */}
            <div className="space-y-1 py-1 border-t border-white/8">
              {discountAmt > 0 && (
                <div className="flex justify-between text-xs text-white/40">
                  <span>المجموع</span><span>{formatCurrency(cartSubtotal)}</span>
                </div>
              )}
              {discountAmt > 0 && (
                <div className="flex justify-between text-xs text-red-400">
                  <span>خصم {discountPct}%</span><span>-{formatCurrency(discountAmt)}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-white/60 text-sm font-semibold">الإجمالي</span>
                <span className="text-white font-black text-2xl">{formatCurrency(cartTotal)}</span>
              </div>
              {payType === "partial" && (
                <div className="flex justify-between text-xs text-amber-400">
                  <span>المتبقي</span>
                  <span>{formatCurrency(cartTotal - (parseFloat(paidAmount) || 0))}</span>
                </div>
              )}
            </div>

            {/* Error */}
            {checkoutError && (
              <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/8 border border-red-500/20 rounded-xl px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {checkoutError}
              </div>
            )}

            {/* CHECKOUT BUTTON */}
            <button
              onClick={handleCheckout}
              disabled={checkoutMutation.isPending || cart.length === 0 || payOptions.length === 0}
              className={`w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-3 transition-all
                ${checkoutMutation.isPending || cart.length === 0 || payOptions.length === 0
                  ? "opacity-40 cursor-not-allowed bg-white/5 border border-white/10 text-white/30"
                  : "bg-gradient-to-l from-amber-500 to-amber-400 text-black hover:from-amber-400 hover:to-amber-300 shadow-lg shadow-amber-500/25 active:scale-[0.98]"
                }`}
            >
              {checkoutMutation.isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  جارٍ التسجيل...
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5" />
                  إصدار الفاتورة
                  <kbd className="text-xs font-bold opacity-60 bg-black/15 px-1.5 py-0.5 rounded">F9</kbd>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ═══ SUCCESS MODAL ═══ */}
      {successInvoice && (
        <SuccessModal invoice={successInvoice} onClose={() => {
          setSuccessInvoice(null);
          setTimeout(() => searchRef.current?.focus(), 100);
        }} />
      )}
    </div>
  );
}
