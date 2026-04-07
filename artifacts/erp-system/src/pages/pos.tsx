// ✔ POS UX CLEANED — SINGLE ENTRY POINT
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { safeArray } from "@/lib/safe-data";
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
  Store, Vault, CheckCircle2, Printer, RotateCcw,
  RefreshCw, Settings,
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
  warehouseName?: string;
  safeName?: string;
  cashierName?: string;
}

interface ReturnSaleItem {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface ReturnSale {
  id: number;
  invoice_no: string;
  customer_id: number | null;
  customer_name: string | null;
  total_amount: number;
  payment_type: string;
  date: string | null;
  status: string;
  items: ReturnSaleItem[];
}

interface ReturnItem {
  id: number;
  product_id: number;
  product_name: string;
  max_qty: number;
  return_qty: number;
  unit_price: number;
}

/* ─────────────────────────────────────────────────────────────
   THERMAL RECEIPT PRINT
───────────────────────────────────────────────────────────── */
function printReceipt(invoice: SuccessInvoice) {
  const payLabel: Record<string, string> = { cash: "نقدي", credit: "آجل", partial: "جزئي" };
  const now = new Date();
  const dateStr = now.toLocaleDateString("ar-EG");
  const timeStr = now.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Courier New', monospace; font-size: 12px; width: 80mm; max-width: 80mm; padding: 4mm; color: #000; }
  .center { text-align:center; }
  .bold { font-weight:bold; }
  .title { font-size:14px; font-weight:900; margin-bottom:2px; }
  .sep { border-top: 1px dashed #000; margin: 4px 0; }
  .row { display:flex; justify-content:space-between; margin: 2px 0; }
  .total-row { font-size:14px; font-weight:900; border-top:2px solid #000; padding-top:4px; margin-top:4px; }
  .footer { text-align:center; margin-top:6px; font-size:10px; }
  table { width:100%; border-collapse:collapse; }
  td { padding: 1px 0; vertical-align:top; }
  td:last-child { text-align:left; white-space:nowrap; }
  @media print { @page { margin:0; size: 80mm auto; } }
</style>
</head>
<body>
<div class="center bold title">Halal Tech</div>
<div class="center" style="font-size:10px;">فاتورة مبيعات</div>
<div class="sep"></div>
<div class="row"><span>رقم الفاتورة:</span><span class="bold">${invoice.invoice_no}</span></div>
<div class="row"><span>التاريخ:</span><span>${dateStr} ${timeStr}</span></div>
${invoice.cashierName ? `<div class="row"><span>الكاشير:</span><span>${invoice.cashierName}</span></div>` : ""}
${invoice.warehouseName ? `<div class="row"><span>الفرع:</span><span>${invoice.warehouseName}</span></div>` : ""}
${invoice.safeName ? `<div class="row"><span>الخزينة:</span><span>${invoice.safeName}</span></div>` : ""}
${invoice.customer_name ? `<div class="row"><span>العميل:</span><span>${invoice.customer_name}</span></div>` : ""}
<div class="sep"></div>
<table>
  <tr><td class="bold">الصنف</td><td class="bold" style="text-align:center;">كمية</td><td class="bold">سعر</td><td class="bold">إجمالي</td></tr>
  ${invoice.items.map(i => `<tr><td>${i.product_name}</td><td style="text-align:center;">${i.quantity}</td><td>${i.unit_price.toFixed(2)}</td><td>${i.total_price.toFixed(2)}</td></tr>`).join("")}
</table>
<div class="sep"></div>
<div class="row total-row"><span>الإجمالي</span><span>${invoice.total_amount.toFixed(2)} ج.م</span></div>
<div class="row" style="margin-top:3px;"><span>طريقة الدفع:</span><span>${payLabel[invoice.payment_type] ?? invoice.payment_type}</span></div>
<div class="sep"></div>
<div class="footer">شكراً لتعاملكم معنا 🙏<br/>Halal Tech © ${now.getFullYear()}</div>
</body></html>`;

  const w = window.open("", "_blank", "width=340,height=600");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); w.close(); }, 250);
}

/* ─────────────────────────────────────────────────────────────
   SUCCESS MODAL
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
    <div className="erp-backdrop fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="erp-modal w-full max-w-sm text-center space-y-5">
        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
          style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.30)" }}>
          <CheckCircle2 className="w-10 h-10 text-emerald-400" />
        </div>
        <div>
          <h3 className="erp-title text-2xl">تم إصدار الفاتورة</h3>
          <p className="text-amber-500 font-bold text-xl mt-1">{invoice.invoice_no}</p>
          <p className="erp-text-muted text-sm mt-2">
            الإجمالي: <span className="erp-number text-lg">{formatCurrency(invoice.total_amount)}</span>
          </p>
          {invoice.customer_name && (
            <p className="erp-label mt-1">العميل: <span className="erp-text font-semibold">{invoice.customer_name}</span></p>
          )}
        </div>

        <div className="space-y-2.5">
          {/* Print receipt */}
          <button
            onClick={() => printReceipt(invoice)}
            className="erp-btn-secondary w-full py-3 rounded-2xl font-bold flex items-center justify-center gap-2">
            <Printer className="w-4 h-4" />
            طباعة الفاتورة
          </button>

          {/* WhatsApp */}
          {invoice.customer_phone && (
            <a href={waUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 w-full py-3 rounded-2xl font-bold transition-all"
              style={{ background: "rgba(37,211,102,0.12)", border: "1px solid rgba(37,211,102,0.30)", color: "#25D366" }}>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              إرسال واتساب
            </a>
          )}

          <button onClick={onClose} className="erp-btn-ghost w-full py-3 rounded-2xl font-bold">
            فاتورة جديدة (Enter / F9)
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
  const { data: warehousesRaw } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/settings/warehouses"],
    queryFn: () => authFetch(api("/api/settings/warehouses")).then(async r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      return safeArray(j);
    }),
  });
  const warehouses = safeArray(warehousesRaw);
  const { data: rawSafesData } = useGetSettingsSafes();
  const rawSafes = safeArray(rawSafesData);
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
    <div className="erp-page fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="erp-panel w-full max-w-md p-8 space-y-6">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto">
            <Store className="w-8 h-8 text-amber-400" />
          </div>
          <h2 className="erp-title text-xl">اختيار الفرع والخزينة</h2>
          <p className="erp-text-muted">وضع المدير — يُختار يدوياً ولا يُحفظ في الملف الشخصي</p>
        </div>

        {/* Warehouse */}
        <div className="space-y-1.5">
          <label className="erp-label flex items-center gap-1.5">
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
          <label className="erp-label flex items-center gap-1.5">
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
          className={`w-full h-11 text-base ${ready ? "erp-btn-primary" : "erp-btn-disabled"}`}
        >
          <Zap className="w-4 h-4" />
          بدء البيع
        </button>

        {ready && (
          <p className="text-center erp-text-muted">
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
        <div className="erp-page fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 p-8" dir="rtl">
          <div className="w-20 h-20 rounded-3xl bg-red-500/10 border border-red-500/30 flex items-center justify-center">
            <AlertTriangle className="w-10 h-10 text-red-400" />
          </div>
          <div className="text-center space-y-2 max-w-sm">
            <h2 className="erp-title text-2xl">وصول مرفوض</h2>
            <p className="text-red-400 font-bold text-lg">يجب ربط حسابك بمخزن وخزينة أولاً</p>
            <p className="erp-text-muted">تواصل مع المدير لإتمام إعداد حسابك قبل استخدام نقطة البيع</p>
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
    isAdmin={isAdmin}
    onResetSetup={() => setAdminSetup({ warehouseId: null, safeId: null })}
  />;
}

/* ─────────────────────────────────────────────────────────────
   POS BODY (after access check)
───────────────────────────────────────────────────────────── */
function POSBody({
  warehouseId, safeId,
  canEditPrice, canCash, canCredit, canPartial,
  isAdmin, onResetSetup,
}: {
  warehouseId: number;
  safeId: number;
  canEditPrice: boolean;
  canCash: boolean;
  canCredit: boolean;
  canPartial: boolean;
  isAdmin: boolean;
  onResetSetup: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  /* ── Data ── */
  const { data: products = [] } = useQuery<{ id: number; name: string; sku: string | null; quantity: number; sale_price: number; cost_price: number; barcode?: string | null }[]>({
    queryKey: ["/api/products"],
    queryFn: () => authFetch(api("/api/products")).then(async r => { if (!r.ok) throw new Error(`API Error: ${r.status}`); return r.json(); }),
    staleTime: 60_000,
  });
  const { data: customersRaw } = useGetCustomers();
  const customers = safeArray(customersRaw);
  const { data: safesBodyRaw } = useGetSettingsSafes();
  const safes = safeArray(safesBodyRaw);
  const { data: warehousesRaw } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/settings/warehouses"],
    queryFn: () => authFetch(api("/api/settings/warehouses")).then(async r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      return safeArray(j);
    }),
    staleTime: 5 * 60_000,
  });
  const warehouses = safeArray(warehousesRaw);

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
  const [cashierMode, setCashierMode]     = useState(false);

  /* ── Return mode ── */
  const [returnMode, setReturnMode]             = useState(false);
  const [returnInvoiceNo, setReturnInvoiceNo]   = useState("");
  const [debouncedReturnSearch, setDebouncedReturnSearch] = useState("");
  const [returnSearchResults, setReturnSearchResults] = useState<ReturnSale[]>([]);
  const [returnSearchFetching, setReturnSearchFetching] = useState(false);
  const [returnFetching, setReturnFetching]     = useState(false);
  const [returnSale, setReturnSale]             = useState<ReturnSale | null>(null);
  const [returnItems, setReturnItems]           = useState<ReturnItem[]>([]);
  const [returnRefundType, setReturnRefundType] = useState<"cash" | "credit">("cash");
  const [returnReason, setReturnReason]         = useState("");
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  /* ── Refs ── */
  const searchRef = useRef<HTMLInputElement>(null);
  const checkoutRef = useRef<() => void>(() => {});

  /* ── Auto-focus on mount ── */
  useEffect(() => { searchRef.current?.focus(); }, []);

  /* ── Filtered products ── */
  const filtered = useMemo(() =>
    products.filter(p => {
      const q = search.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
      );
    }),
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
        warehouseName: warehouses.find(w => w.id === warehouseId)?.name,
        safeName: safes.find(s => s.id === safeId)?.name,
        cashierName: user?.name ?? user?.username ?? undefined,
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

  /* ── Return: debounce search input (350ms) ── */
  useEffect(() => {
    if (!returnMode) return;
    const t = setTimeout(() => setDebouncedReturnSearch(returnInvoiceNo.trim()), 350);
    return () => clearTimeout(t);
  }, [returnInvoiceNo, returnMode]);

  /* ── Return: fetch search results when debounced term changes ── */
  useEffect(() => {
    if (!returnMode) return;
    if (!debouncedReturnSearch) { setReturnSearchResults([]); return; }
    setReturnSearchFetching(true);
    const url = debouncedReturnSearch
      ? `/api/sales?sort=desc&limit=100&q=${encodeURIComponent(debouncedReturnSearch)}`
      : `/api/sales?sort=desc&limit=40`;
    authFetch(api(url))
      .then(r => r.json())
      .then(data => {
        const list: ReturnSale[] = safeArray(Array.isArray(data) ? data : ((data as { data?: ReturnSale[] }).data ?? []));
        setReturnSearchResults(list.filter(s => s.status !== "cancelled"));
      })
      .catch(() => setReturnSearchResults([]))
      .finally(() => setReturnSearchFetching(false));
  }, [debouncedReturnSearch, returnMode]);

  /* ── Return: load full invoice when user selects a result ── */
  const selectReturnInvoice = useCallback(async (saleId: number) => {
    setReturnFetching(true);
    setReturnSale(null);
    setReturnItems([]);
    setReturnSearchResults([]);
    try {
      const r = await authFetch(api(`/api/sales/${saleId}`));
      const full: ReturnSale = await r.json();
      if (!r.ok) throw new Error("خطأ في تحميل الفاتورة");
      setReturnSale(full);
      setReturnInvoiceNo(full.invoice_no);
      setReturnItems(full.items.map((it: ReturnSaleItem, idx: number) => ({
        id: idx,
        product_id: it.product_id,
        product_name: it.product_name,
        max_qty: it.quantity,
        return_qty: it.quantity,
        unit_price: it.unit_price,
      })));
    } catch (e: unknown) {
      toast({ title: "❌ " + (e instanceof Error ? e.message : "خطأ"), variant: "destructive" });
    } finally {
      setReturnFetching(false);
    }
  }, [toast]);

  /* ── Return mutation ── */
  const returnMutation = useMutation({
    mutationFn: (body: object) =>
      authFetch(api("/api/sales-returns"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "خطأ"); return j; }),
    onSuccess: () => {
      toast({ title: "✅ تم تسجيل المرتجع بنجاح" });
      qc.invalidateQueries({ queryKey: ["/api/sales"] });
      qc.invalidateQueries({ queryKey: ["/api/products"] });
      qc.invalidateQueries({ queryKey: ["/api/settings/safes"] });
      setReturnMode(false);
      setReturnSale(null);
      setReturnItems([]);
      setReturnInvoiceNo("");
      setReturnReason("");
    },
    onError: (e: Error) => {
      toast({ title: "❌ فشل المرتجع", description: e.message, variant: "destructive" });
    },
  });

  const handleReturn = useCallback(() => {
    if (!returnSale) return;
    const activeItems = returnItems.filter(i => i.return_qty > 0);
    if (activeItems.length === 0) { toast({ title: "اختر صنفاً واحداً على الأقل", variant: "destructive" }); return; }
    const total = activeItems.reduce((s, i) => s + i.return_qty * i.unit_price, 0);
    returnMutation.mutate({
      sale_id:       returnSale.id,
      customer_id:   returnSale.customer_id,
      customer_name: returnSale.customer_name,
      items: activeItems.map(i => ({
        original_sale_item_id: i.id,
        product_id:    i.product_id,
        product_name:  i.product_name,
        quantity:      i.return_qty,
        unit_price:    i.unit_price,
        total_price:   i.return_qty * i.unit_price,
      })),
      reason:      returnReason,
      notes:       "",
      date:        new Date().toISOString().split("T")[0],
      refund_type: returnRefundType,
      safe_id:     safeId,
      total_amount: total,
    });
  }, [returnSale, returnItems, returnReason, returnRefundType, safeId, returnMutation, toast]);

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
      /* Ctrl+Backspace → clear cart */
      if ((e.ctrlKey || e.metaKey) && e.key === "Backspace") {
        e.preventDefault();
        setCart([]);
        return;
      }
      /* ESC — priority: modal → returnMode → cart confirm → navigate */
      if (e.key === "Escape") {
        if (successInvoice) { setSuccessInvoice(null); return; }
        if (showExitConfirm) { setShowExitConfirm(false); return; }
        if (returnMode) {
          setReturnMode(false);
          setReturnSale(null);
          setReturnItems([]);
          setReturnInvoiceNo("");
          return;
        }
        if (cart.length > 0) { setShowExitConfirm(true); return; }
        navigate("/sales");
        return;
      }
      /* Enter → barcode exact match first, then first result */
      if (e.key === "Enter" && document.activeElement === searchRef.current) {
        e.preventDefault();
        const trimmed = search.trim();
        if (trimmed && filtered.length > 0) {
          const barcodeMatch = products.find(
            p => p.barcode && p.barcode.toLowerCase() === trimmed.toLowerCase()
          );
          const target = barcodeMatch ?? filtered[0];
          addToCart(target);
          if (barcodeMatch) setSearch("");
        }
        return;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [filtered, addToCart, products, search, successInvoice, returnMode, cart, showExitConfirm, navigate]);

  /* ── Payment options ── */
  const payOptions = [
    { v: "cash"    as const, l: "نقدي",  icon: Banknote,    allow: canCash,    active: "bg-emerald-500 border-emerald-500 text-white" },
    { v: "credit"  as const, l: "آجل",   icon: Clock,       allow: canCredit,  active: "bg-blue-500 border-blue-500 text-white" },
    { v: "partial" as const, l: "جزئي",  icon: CreditCard,  allow: canPartial, active: "bg-amber-500 border-amber-500 text-black" },
  ].filter(o => o.allow);

  const needsCustomer = payType === "credit" || payType === "partial";

  /* ── Stock badge ── */
  const stockClass = (qty: number) =>
    qty <= 0 ? "erp-badge-danger" : qty <= 5 ? "erp-badge-warning" : "erp-badge-neutral";

  /* ── Derived sizes for cashier mode ── */
  const cm = cashierMode;

  return (
    <div className="erp-page fixed inset-0 flex flex-col overflow-hidden" dir="rtl">

      {/* ════════════════════ EXIT CONFIRM MODAL ════════════════ */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
          <div className="erp-card-soft rounded-2xl p-6 w-full max-w-xs text-center space-y-4 border border-white/10 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto">
              <span className="text-2xl">⚠️</span>
            </div>
            <div>
              <p className="erp-text font-bold text-base">فاتورة غير مكتملة</p>
              <p className="erp-label text-sm mt-1">السلة تحتوي على {cart.length} صنف. هل تريد الخروج بدون إتمام البيع؟</p>
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowExitConfirm(false)}
                className="flex-1 erp-btn-secondary rounded-xl py-2 text-sm font-bold"
              >
                إلغاء
              </button>
              <button
                onClick={() => { setCart([]); setShowExitConfirm(false); navigate("/sales"); }}
                className="flex-1 rounded-xl py-2 text-sm font-bold bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 hover:border-red-500/50 transition-colors"
              >
                خروج بدون حفظ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════ TOP STATUS BAR ════════════════════ */}
      <header
        className="flex items-center justify-between px-4 shrink-0"
        style={{ paddingTop: "0.5rem", paddingBottom: "0.5rem", background: "var(--erp-bg-soft)", borderBottom: "1px solid var(--erp-border)" }}
      >
        {/* Branch · Safe · User */}
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <Store className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <p className="erp-label text-[10px]">الفرع</p>
              <p className="erp-text font-bold text-sm leading-tight">{warehouseName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Vault className="w-4 h-4 text-violet-400 shrink-0" />
            <div>
              <p className="erp-label text-[10px]">الخزينة</p>
              <p className="erp-text font-bold text-sm leading-tight">{safeName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 text-black"
              style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)" }}>
              {(user?.name ?? "?").slice(0, 2)}
            </div>
            <p className="erp-text-muted text-sm font-medium">{user?.name}</p>
          </div>
        </div>

        {/* Keyboard hints + cashier toggle */}
        <div className="flex items-center gap-4">
          <div className="hidden lg:flex items-center gap-2">
            {[["F2","بحث"],["Enter","إضافة"],["F9","دفع"],["ESC","خروج"],["⌃⌫","مسح"]].map(([k,l]) => (
              <div key={k} className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded text-[10px] font-bold erp-label"
                  style={{ background: "var(--erp-bg-elevated)", border: "1px solid var(--erp-border-strong)" }}>{k}</kbd>
                <span className="erp-label text-[10px]">{l}</span>
              </div>
            ))}
          </div>
          {/* Return mode toggle */}
          <button
            onClick={() => { setReturnMode(v => !v); setReturnSale(null); setReturnItems([]); setReturnInvoiceNo(""); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              returnMode ? "bg-red-500 text-white" : "erp-btn-secondary"
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {returnMode ? "إلغاء المرتجع" : "مرتجع"}
          </button>

          {/* Cashier mode toggle */}
          <button
            onClick={() => setCashierMode(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              cashierMode ? "bg-amber-500 text-black" : "erp-btn-secondary"
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            {cashierMode ? "عادي" : "وضع الكاشير"}
          </button>

          {/* Admin: change branch/safe */}
          {isAdmin && (
            <button
              onClick={onResetSetup}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold erp-btn-ghost transition-all"
              title="تغيير الفرع والخزينة"
            >
              <Settings className="w-3.5 h-3.5" />
              تغيير
            </button>
          )}
        </div>
      </header>

      {/* ════════════════════ BODY ════════════════════ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ════ PRODUCTS PANEL (right in RTL) ════ */}
        <div className="flex flex-col flex-1 min-w-0" style={{ borderLeft: "1px solid var(--erp-border)" }}>

          {/* Search bar */}
          <div className="px-3 shrink-0"
            style={{ paddingTop: "0.625rem", paddingBottom: "0.625rem", background: "var(--erp-bg-soft)", borderBottom: "1px solid var(--erp-border)" }}>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 erp-text-muted" style={{ color: "var(--erp-text-3)" }} />
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="بحث عن صنف... (F2)"
                className="erp-input pr-10"
                style={{ fontSize: cm ? "1rem" : "0.875rem", paddingTop: cm ? "0.75rem" : "0.625rem", paddingBottom: cm ? "0.75rem" : "0.625rem" }}
              />
              {search && (
                <button
                  onClick={() => { setSearch(""); searchRef.current?.focus(); }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 erp-text-muted hover:opacity-100 opacity-50 transition-opacity"
                  style={{ color: "var(--erp-text-3)" }}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Products count */}
          {search && (
            <div className="px-3 py-1" style={{ background: "var(--erp-bg-soft)", borderBottom: "1px solid var(--erp-border)" }}>
              <span className="erp-label text-[11px]">{filtered.length} نتيجة</span>
            </div>
          )}

          {/* Products grid */}
          <div className="flex-1 overflow-y-auto p-3">
            {filtered.length === 0 ? (
              <div className="erp-empty h-full">
                <Search className="w-8 h-8" style={{ color: "var(--erp-text-4)" }} />
                <p>{search ? "لا توجد نتائج مطابقة" : "لا توجد منتجات"}</p>
              </div>
            ) : (
              <div className={`grid gap-2 ${cm
                ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4"
                : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"}`}>
                {filtered.map(p => {
                  const qty = Number(p.quantity);
                  const outOfStock = qty <= 0;
                  const isJustAdded = recentlyAdded === p.id;
                  const inCart = cart.find(i => i.product_id === p.id);

                  let cardStyle: React.CSSProperties = {
                    background: "var(--erp-bg-card)",
                    border: `1px solid var(--erp-border)`,
                    borderRadius: "0.875rem",
                    transition: "all 0.15s ease",
                  };
                  if (outOfStock)   { cardStyle = { ...cardStyle, opacity: 0.4, cursor: "not-allowed" }; }
                  else if (isJustAdded) { cardStyle = { ...cardStyle, border: "1px solid rgba(245,158,11,0.7)", background: "rgba(245,158,11,0.08)", transform: "scale(0.97)" }; }
                  else if (inCart)  { cardStyle = { ...cardStyle, border: "1px solid rgba(16,185,129,0.4)", background: "rgba(16,185,129,0.06)" }; }

                  return (
                    <button
                      key={p.id}
                      onClick={() => !outOfStock && addToCart(p)}
                      disabled={outOfStock}
                      className="relative flex flex-col text-right p-3 active:scale-[0.97]"
                      style={cardStyle}
                    >
                      {/* In-cart badge */}
                      {inCart && (
                        <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-[10px] font-black text-white">
                          {inCart.quantity}
                        </div>
                      )}
                      {/* Name */}
                      <p className="erp-text font-bold leading-snug line-clamp-2 mb-2 flex-1"
                        style={{ fontSize: cm ? "0.9375rem" : "0.8125rem" }}>
                        {p.name}
                      </p>
                      {/* Price + Stock */}
                      <div className="flex items-end justify-between gap-1 mt-auto">
                        <p className="text-amber-500 font-black"
                          style={{ fontSize: cm ? "1.125rem" : "0.9375rem" }}>
                          {formatCurrency(p.sale_price)}
                        </p>
                        <span className={`${stockClass(qty)} text-[10px]`}>
                          {qty > 0 ? qty : "نفد"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ════ RETURN PANEL ════ */}
        {returnMode && (
          <div className="flex flex-col shrink-0 overflow-hidden"
            style={{ width: cm ? "420px" : "380px", background: "var(--erp-bg-soft)", borderRight: "none", borderTop: "none", borderBottom: "none" }}>

            {/* Header */}
            <div className="px-4 py-3 flex items-center gap-2 shrink-0"
              style={{ borderBottom: "1px solid var(--erp-border)", background: "rgba(239,68,68,0.08)" }}>
              <RotateCcw className="w-4 h-4 text-red-400" />
              <span className="erp-subtitle text-red-400">وضع المرتجع</span>
            </div>

            {/* Invoice search */}
            <div className="px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--erp-border)" }}>
              <p className="erp-label text-xs mb-1.5">رقم الفاتورة / اسم العميل / رمز العميل</p>
              <div className="relative">
                <div className="flex items-center gap-2 erp-input pr-3 pl-2 py-2">
                  <Search className={`w-4 h-4 shrink-0 transition-colors ${returnSearchFetching || returnFetching ? "text-amber-500 animate-pulse" : "text-white/30"}`} style={{ color: returnSearchFetching || returnFetching ? undefined : "var(--erp-text-3)" }} />
                  <input
                    value={returnInvoiceNo}
                    onChange={e => { setReturnInvoiceNo(e.target.value); if (returnSale) { setReturnSale(null); setReturnItems([]); } }}
                    placeholder="رقم الفاتورة / اسم العميل / رمز العميل..."
                    className="flex-1 bg-transparent outline-none text-sm"
                    style={{ color: "var(--erp-text)" }}
                    dir="rtl"
                  />
                  {returnInvoiceNo && (
                    <button onClick={() => { setReturnInvoiceNo(""); setReturnSale(null); setReturnItems([]); setReturnSearchResults([]); }}
                      className="text-white/30 hover:text-white/60 shrink-0" style={{ color: "var(--erp-text-3)" }}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {/* Results dropdown */}
                {!returnSale && returnInvoiceNo && (
                  <div className="mt-1 rounded-xl overflow-hidden max-h-52 overflow-y-auto" style={{ background: "var(--erp-bg-elevated)", border: "1px solid var(--erp-border)" }}>
                    {returnSearchFetching ? (
                      <div className="px-4 py-3 text-xs" style={{ color: "var(--erp-text-3)" }}>جاري البحث…</div>
                    ) : returnSearchResults.length === 0 ? (
                      <div className="px-4 py-3 text-xs" style={{ color: "var(--erp-text-3)" }}>لا توجد نتائج</div>
                    ) : returnSearchResults.map(s => (
                      <button key={s.id} onClick={() => selectReturnInvoice(s.id)}
                        className="w-full text-right px-4 py-2.5 text-sm transition-colors hover:opacity-80 flex justify-between items-center gap-2 border-b last:border-0"
                        style={{ borderColor: "var(--erp-border)", background: "transparent", color: "var(--erp-text)" }}>
                        <div className="flex flex-col items-start gap-0.5 min-w-0 flex-1">
                          <span className="font-bold text-amber-500 text-xs" dir="ltr">{s.invoice_no}</span>
                          <span className="text-xs truncate" style={{ color: "var(--erp-text-2)" }}>{s.customer_name || "نقدي"}</span>
                        </div>
                        <div className="flex flex-col items-end gap-0.5 shrink-0">
                          <span className="text-xs font-bold" style={{ color: "var(--erp-text)" }}>{s.payment_type === "cash" ? "نقدي" : s.payment_type === "credit" ? "آجل" : "جزئي"}</span>
                          <span className="text-xs" style={{ color: "var(--erp-text-3)" }}>{s.date || "—"}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {!returnInvoiceNo && (
                <p className="text-xs mt-1.5" style={{ color: "var(--erp-text-3)" }}>ابحث بالرقم أو الاسم أو الرمز</p>
              )}
            </div>

            {/* Sale info + items */}
            {returnSale && (
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                <div className="rounded-xl p-3 space-y-1" style={{ background: "var(--erp-bg-elevated)", border: "1px solid var(--erp-border)" }}>
                  <div className="flex justify-between">
                    <span className="erp-label text-xs">الفاتورة</span>
                    <span className="erp-text font-bold text-sm" dir="ltr">{returnSale.invoice_no}</span>
                  </div>
                  {returnSale.customer_name && (
                    <div className="flex justify-between">
                      <span className="erp-label text-xs">العميل</span>
                      <span className="erp-text text-sm">{returnSale.customer_name}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="erp-label text-xs">الإجمالي</span>
                    <span className="text-amber-500 font-bold text-sm">{formatCurrency(returnSale.total_amount)}</span>
                  </div>
                </div>

                <p className="erp-label text-xs">الأصناف المرتجعة</p>
                {returnItems.map((item, idx) => (
                  <div key={idx} className="rounded-xl p-3" style={{ background: "var(--erp-bg-card)", border: "1px solid var(--erp-border)" }}>
                    <p className="erp-text text-sm font-bold mb-2">{item.product_name}</p>
                    <div className="flex items-center justify-between gap-2">
                      <span className="erp-label text-xs">الكمية (max {item.max_qty})</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setReturnItems(prev => prev.map((it, i) => i !== idx ? it : { ...it, return_qty: Math.max(0, it.return_qty - 1) }))}
                          className="w-7 h-7 rounded-lg flex items-center justify-center erp-btn-ghost text-lg font-bold"
                        >−</button>
                        <span className="erp-number w-6 text-center">{item.return_qty}</span>
                        <button
                          onClick={() => setReturnItems(prev => prev.map((it, i) => i !== idx ? it : { ...it, return_qty: Math.min(it.max_qty, it.return_qty + 1) }))}
                          className="w-7 h-7 rounded-lg flex items-center justify-center erp-btn-ghost text-lg font-bold"
                        >+</button>
                      </div>
                      <span className="erp-number text-sm">{formatCurrency(item.return_qty * item.unit_price)}</span>
                    </div>
                  </div>
                ))}

                {/* Reason */}
                <div>
                  <p className="erp-label text-xs mb-1.5">سبب المرتجع</p>
                  <input
                    value={returnReason}
                    onChange={e => setReturnReason(e.target.value)}
                    placeholder="اختياري..."
                    className="erp-input w-full text-sm"
                  />
                </div>

                {/* Refund type */}
                <div>
                  <p className="erp-label text-xs mb-1.5">طريقة الاسترداد</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([["cash","نقدي"],["credit","رصيد"]] as const).map(([v,l]) => (
                      <button key={v} onClick={() => setReturnRefundType(v)}
                        className={`py-2 rounded-xl text-sm font-bold transition-all ${
                          returnRefundType === v
                            ? v === "cash" ? "bg-emerald-500 text-white" : "bg-blue-500 text-white"
                            : "erp-btn-ghost"
                        }`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Total + submit */}
                <div className="rounded-xl p-3" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
                  <div className="flex justify-between items-center mb-3">
                    <span className="erp-label text-sm">إجمالي المرتجع</span>
                    <span className="text-red-400 font-black text-lg">
                      {formatCurrency(returnItems.filter(i => i.return_qty > 0).reduce((s, i) => s + i.return_qty * i.unit_price, 0))}
                    </span>
                  </div>
                  <button
                    onClick={handleReturn}
                    disabled={returnMutation.isPending}
                    className="w-full py-3 rounded-xl font-bold text-white transition-all"
                    style={{ background: returnMutation.isPending ? "rgba(239,68,68,0.4)" : "rgba(239,68,68,0.85)" }}>
                    {returnMutation.isPending ? "جارٍ التسجيل..." : "تأكيد المرتجع"}
                  </button>
                </div>
              </div>
            )}

            {!returnSale && !returnFetching && !returnInvoiceNo && (
              <div className="erp-empty flex-1">
                <RefreshCw className="w-10 h-10 mx-auto mb-3 opacity-20" style={{ color: "var(--erp-text-3)" }} />
                <p className="erp-text-muted text-sm">ابحث بالرقم أو الاسم أو رمز العميل</p>
              </div>
            )}
            {returnFetching && !returnSale && (
              <div className="erp-empty flex-1">
                <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin opacity-40" style={{ color: "var(--erp-text-3)" }} />
                <p className="erp-text-muted text-sm">جاري تحميل الفاتورة…</p>
              </div>
            )}
          </div>
        )}

        {/* ════ CART + PAYMENT PANEL ════ */}
        {!returnMode && <div className="flex flex-col shrink-0 erp-card-soft"
          style={{
            width: cm ? "420px" : "360px",
            background: "var(--erp-bg-soft)",
            borderRight: "none",
            borderTop: "none",
            borderBottom: "none",
          }}>

          {/* Cart header */}
          <div className="px-4 py-3 flex items-center justify-between shrink-0"
            style={{ borderBottom: "1px solid var(--erp-border)" }}>
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-amber-500" />
              <span className="erp-subtitle">السلة</span>
              {cart.length > 0 && (
                <span className="w-5 h-5 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center">
                  {cart.length}
                </span>
              )}
            </div>
            {cart.length > 0 && (
              <button onClick={() => setCart([])}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-bold transition-all bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 hover:border-red-500/40">
                <Trash2 className="w-3 h-3" /> مسح السلة
              </button>
            )}
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="erp-empty h-full">
                <ShoppingCart className="w-10 h-10" style={{ color: "var(--erp-text-4)" }} />
                <p className="erp-text-muted">السلة فارغة</p>
                <p className="erp-label text-[11px]">اضغط Enter لإضافة أول صنف</p>
              </div>
            ) : (
              <div className="p-2 space-y-1.5">
                {cart.map(item => (
                  <div key={item.product_id}
                    className="erp-card flex items-center gap-2 px-3 py-2.5"
                    style={{ borderRadius: "0.75rem" }}>
                    {/* Name + Price */}
                    <div className="flex-1 min-w-0">
                      <p className="erp-text text-xs font-bold leading-snug line-clamp-1">{item.product_name}</p>
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
                          className="erp-input text-xs mt-0.5 py-0.5 px-1.5"
                          style={{ borderColor: "rgba(245,158,11,0.5)" }}
                        />
                      ) : (
                        <p
                          className={`text-amber-500 text-xs mt-0.5 ${canEditPrice ? "cursor-pointer hover:underline" : ""}`}
                          onClick={() => {
                            if (!canEditPrice) return;
                            setEditingPriceId(item.product_id);
                            setEditingPriceVal(String(item.unit_price));
                          }}
                        >
                          {formatCurrency(item.unit_price)}
                          {canEditPrice && <span className="erp-label text-[10px] mr-1">✏</span>}
                        </p>
                      )}
                    </div>
                    {/* Qty controls */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => updateQty(item.product_id, -1)}
                        className="erp-btn-secondary w-7 h-7 p-0 rounded-lg">
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="erp-number w-7 text-center text-sm">{item.quantity}</span>
                      <button onClick={() => updateQty(item.product_id, 1)}
                        className="erp-btn-secondary w-7 h-7 p-0 rounded-lg">
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    {/* Line total */}
                    <p className="erp-number text-sm w-16 text-left shrink-0">{formatCurrency(item.total_price)}</p>
                    {/* Remove */}
                    <button onClick={() => removeItem(item.product_id)}
                      className="w-6 h-6 rounded-lg flex items-center justify-center transition-all shrink-0 erp-btn-danger p-0"
                      style={{ padding: 0 }}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ════ PAYMENT PANEL ════ */}
          <div className="erp-divider p-3 space-y-3 shrink-0"
            style={{ borderBottom: "none", borderLeft: "none", borderRight: "none", background: "var(--erp-bg-panel)" }}>

            {/* Discount */}
            <div className="flex items-center gap-2">
              <label className="erp-label shrink-0 text-xs">خصم %</label>
              <input
                type="number" min="0" max="100" step="0.5"
                value={discountPct}
                onChange={e => setDiscountPct(e.target.value)}
                placeholder="0"
                className="erp-input flex-1 text-center text-sm"
                style={{ padding: "0.375rem 0.5rem" }}
              />
              {discountAmt > 0 && (
                <span className="text-red-500 text-xs font-bold shrink-0">-{formatCurrency(discountAmt)}</span>
              )}
            </div>

            {/* Payment type */}
            {payOptions.length > 0 ? (
              <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${payOptions.length}, 1fr)` }}>
                {payOptions.map(o => {
                  const Icon = o.icon;
                  const isActive = payType === o.v;
                  return (
                    <button key={o.v} onClick={() => setPayType(o.v)}
                      className={`flex flex-col items-center justify-center gap-1 rounded-xl border font-bold transition-all
                        ${isActive ? o.active : "erp-btn-secondary"}
                      `}
                      style={{
                        paddingTop: cm ? "0.875rem" : "0.625rem",
                        paddingBottom: cm ? "0.875rem" : "0.625rem",
                        fontSize: cm ? "0.8125rem" : "0.75rem",
                        boxShadow: isActive ? `0 4px 12px color-mix(in srgb, currentColor 25%, transparent)` : undefined,
                      }}>
                      <Icon className={cm ? "w-5 h-5" : "w-4 h-4"} />
                      {o.l}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-2 rounded-xl text-xs"
                style={{ color: "#ef4444", background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.20)" }}>
                ⚠ لا توجد صلاحية لأي نوع دفع
              </div>
            )}

            {/* Customer select */}
            {needsCustomer && (
              <div className="erp-card flex items-center gap-2 px-3 py-1.5" style={{ borderRadius: "0.75rem" }}>
                <span className="erp-label shrink-0">العميل</span>
                <SearchableSelect
                  items={customerItems}
                  value={customerId}
                  onChange={setCustomerId}
                  placeholder="ابحث عن عميل..."
                  emptyLabel="-- اختر عميلاً --"
                  className="flex-1"
                />
              </div>
            )}

            {/* Partial amount */}
            {payType === "partial" && (
              <input
                type="number" step="0.01"
                placeholder="المبلغ المدفوع..."
                value={paidAmount}
                onChange={e => setPaidAmount(e.target.value)}
                className="erp-input text-center"
                style={{ borderColor: "rgba(245,158,11,0.4)", fontSize: cm ? "1rem" : "0.875rem" }}
              />
            )}

            {/* Totals */}
            <div className="space-y-1.5 pt-2 erp-divider" style={{ borderBottom: "none", borderLeft: "none", borderRight: "none" }}>
              {discountAmt > 0 && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="erp-label">المجموع قبل الخصم</span>
                    <span className="erp-text text-sm">{formatCurrency(cartSubtotal)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="erp-label text-red-500">خصم {discountPct}%</span>
                    <span className="text-red-500 text-sm font-bold">-{formatCurrency(discountAmt)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between items-center">
                <span className="erp-subtitle">الإجمالي</span>
                <span className="erp-number text-amber-500"
                  style={{ fontSize: cm ? "2rem" : "1.5rem" }}>
                  {formatCurrency(cartTotal)}
                </span>
              </div>
              {payType === "partial" && (
                <div className="flex justify-between items-center">
                  <span className="erp-label">المتبقي</span>
                  <span className="text-amber-500 font-bold text-sm">
                    {formatCurrency(Math.max(0, cartTotal - (parseFloat(paidAmount) || 0)))}
                  </span>
                </div>
              )}
            </div>

            {/* Error */}
            {checkoutError && (
              <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs"
                style={{ color: "#ef4444", background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.20)" }}>
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {checkoutError}
              </div>
            )}

            {/* CHECKOUT BUTTON */}
            <button
              onClick={handleCheckout}
              disabled={checkoutMutation.isPending || cart.length === 0 || payOptions.length === 0}
              className={`w-full rounded-2xl font-black flex items-center justify-center gap-3 transition-all ${
                checkoutMutation.isPending || cart.length === 0 || payOptions.length === 0
                  ? "erp-btn-disabled"
                  : "erp-btn-primary"
              }`}
              style={{
                paddingTop: cm ? "1.125rem" : "0.875rem",
                paddingBottom: cm ? "1.125rem" : "0.875rem",
                fontSize: cm ? "1.0625rem" : "0.9375rem",
                boxShadow: cart.length > 0 && !checkoutMutation.isPending
                  ? "0 4px 18px rgba(245,158,11,0.30)"
                  : undefined,
              }}
            >
              {checkoutMutation.isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin opacity-60" />
                  جارٍ التسجيل...
                </>
              ) : (
                <>
                  <Receipt className={cm ? "w-6 h-6" : "w-5 h-5"} />
                  إصدار الفاتورة
                  <kbd className="text-[11px] font-bold opacity-50 bg-black/10 px-1.5 py-0.5 rounded">F9</kbd>
                </>
              )}
            </button>
          </div>
        </div>}
      </div>

      {/* ════ SUCCESS MODAL ════ */}
      {successInvoice && (
        <SuccessModal invoice={successInvoice} onClose={() => {
          setSuccessInvoice(null);
          setTimeout(() => searchRef.current?.focus(), 100);
        }} />
      )}
    </div>
  );
}
