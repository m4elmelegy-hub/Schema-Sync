import { useState } from "react";
import { useGetProducts, useGetCustomers, useGetSales, useGetPurchases, useGetTransactions, useGetDashboardStats, useGetCustomerStatement } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { AlertTriangle, TrendingUp, TrendingDown, Package, Users, FileText, DollarSign, X, ChevronDown, ChevronUp, ShoppingBag, ShoppingCart, Search, FileDown, Printer } from "lucide-react";
import { exportSalesExcel, exportPurchasesExcel } from "@/lib/export-excel";
import { printSalesReport, printPurchasesReport, printCustomerStatement } from "@/lib/export-pdf";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

function PaymentBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    cash:    { label: "نقدي",  cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
    credit:  { label: "آجل",   cls: "bg-red-500/20 text-red-400 border-red-500/30" },
    partial: { label: "جزئي",  cls: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  };
  const d = map[type] || { label: type, cls: "bg-white/10 text-white/50 border-white/10" };
  return <span className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${d.cls}`}>{d.label}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    paid:    { label: "مدفوع",   cls: "text-emerald-400" },
    partial: { label: "جزئي",   cls: "text-yellow-400" },
    pending: { label: "معلق",   cls: "text-red-400" },
    unpaid:  { label: "غير مدفوع", cls: "text-red-400" },
  };
  const d = map[status] || { label: status, cls: "text-white/50" };
  return <span className={`text-xs font-bold ${d.cls}`}>{d.label}</span>;
}

/* ─── Sales Invoices ─── */
function SalesInvoicesReport() {
  const { data: sales = [], isLoading } = useGetSales();
  const [search, setSearch] = useState("");
  const [payFilter, setPayFilter] = useState("");

  const filtered = sales.filter(s => {
    const matchS = !search || s.invoice_no.includes(search) || (s.customer_name && s.customer_name.includes(search));
    const matchP = !payFilter || s.payment_type === payFilter;
    return matchS && matchP;
  });

  const totalSales = filtered.reduce((s, v) => s + v.total_amount, 0);
  const totalPaid  = filtered.reduce((s, v) => s + v.paid_amount, 0);
  const totalDebt  = filtered.reduce((s, v) => s + v.remaining_amount, 0);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-panel rounded-2xl p-4 border border-emerald-500/10">
          <p className="text-emerald-400 text-xs mb-1">إجمالي المبيعات</p>
          <p className="text-2xl font-black text-white">{formatCurrency(totalSales)}</p>
          <p className="text-white/30 text-xs">{filtered.length} فاتورة</p>
        </div>
        <div className="glass-panel rounded-2xl p-4 border border-blue-500/10">
          <p className="text-blue-400 text-xs mb-1">المحصَّل</p>
          <p className="text-2xl font-black text-white">{formatCurrency(totalPaid)}</p>
        </div>
        <div className="glass-panel rounded-2xl p-4 border border-red-500/10">
          <p className="text-red-400 text-xs mb-1">الديون المتبقية</p>
          <p className="text-2xl font-black text-white">{formatCurrency(totalDebt)}</p>
        </div>
      </div>

      {/* Filters + Export */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input className="glass-input w-full pr-9 text-sm" placeholder="بحث برقم الفاتورة أو العميل..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {[{ v: "", l: "الكل" }, { v: "cash", l: "نقدي" }, { v: "credit", l: "آجل" }, { v: "partial", l: "جزئي" }].map(opt => (
            <button key={opt.v} onClick={() => setPayFilter(opt.v)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${payFilter === opt.v ? "bg-amber-500/20 border-amber-500/40 text-amber-400" : "glass-panel border-white/10 text-white/50 hover:text-white"}`}>
              {opt.l}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mr-auto">
          <button onClick={() => exportSalesExcel(filtered)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30 transition-all">
            <FileDown className="w-3.5 h-3.5" /> Excel
          </button>
          <button onClick={() => printSalesReport(filtered)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-500/20 border border-blue-500/40 text-blue-400 hover:bg-blue-500/30 transition-all">
            <Printer className="w-3.5 h-3.5" /> PDF
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-3 text-white/50">رقم الفاتورة</th>
                <th className="p-3 text-white/50">العميل</th>
                <th className="p-3 text-white/50">الإجمالي</th>
                <th className="p-3 text-white/50">المدفوع</th>
                <th className="p-3 text-white/50">المتبقي</th>
                <th className="p-3 text-white/50">الدفع</th>
                <th className="p-3 text-white/50">الحالة</th>
                <th className="p-3 text-white/50">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td colSpan={8} className="p-12 text-center text-white/40">جاري التحميل...</td></tr>
                : filtered.length === 0 ? <tr><td colSpan={8} className="p-12 text-center text-white/40">لا توجد فواتير</td></tr>
                : filtered.map(s => (
                  <tr key={s.id} className="border-b border-white/5 hover:bg-white/3">
                    <td className="p-3 font-bold text-amber-400">{s.invoice_no}</td>
                    <td className="p-3 text-white">{s.customer_name || "عميل نقدي"}</td>
                    <td className="p-3 font-bold text-white">{formatCurrency(s.total_amount)}</td>
                    <td className="p-3 text-emerald-400 font-bold">{formatCurrency(s.paid_amount)}</td>
                    <td className="p-3 text-red-400 font-bold">{s.remaining_amount > 0 ? formatCurrency(s.remaining_amount) : "—"}</td>
                    <td className="p-3"><PaymentBadge type={s.payment_type} /></td>
                    <td className="p-3"><StatusBadge status={s.status} /></td>
                    <td className="p-3 text-white/40 text-xs">{formatDate(s.created_at)}</td>
                  </tr>
                ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="bg-white/5 border-t border-white/10">
                <tr>
                  <td colSpan={2} className="p-3 text-white/50 font-bold">الإجمالي ({filtered.length} فاتورة)</td>
                  <td className="p-3 font-black text-white">{formatCurrency(totalSales)}</td>
                  <td className="p-3 font-black text-emerald-400">{formatCurrency(totalPaid)}</td>
                  <td className="p-3 font-black text-red-400">{formatCurrency(totalDebt)}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── Purchases Invoices ─── */
function PurchasesInvoicesReport() {
  const { data: purchases = [], isLoading } = useGetPurchases();
  const [search, setSearch] = useState("");
  const [payFilter, setPayFilter] = useState("");

  const filtered = purchases.filter(p => {
    const matchS = !search || p.invoice_no.includes(search) || (p.customer_name && p.customer_name.includes(search));
    const matchP = !payFilter || p.payment_type === payFilter;
    return matchS && matchP;
  });

  const totalPurchases = filtered.reduce((s, v) => s + v.total_amount, 0);
  const totalPaid      = filtered.reduce((s, v) => s + v.paid_amount, 0);
  const totalRemaining = filtered.reduce((s, v) => s + v.remaining_amount, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-panel rounded-2xl p-4 border border-red-500/10">
          <p className="text-red-400 text-xs mb-1">إجمالي المشتريات</p>
          <p className="text-2xl font-black text-white">{formatCurrency(totalPurchases)}</p>
          <p className="text-white/30 text-xs">{filtered.length} فاتورة</p>
        </div>
        <div className="glass-panel rounded-2xl p-4 border border-emerald-500/10">
          <p className="text-emerald-400 text-xs mb-1">المدفوع</p>
          <p className="text-2xl font-black text-white">{formatCurrency(totalPaid)}</p>
        </div>
        <div className="glass-panel rounded-2xl p-4 border border-amber-500/10">
          <p className="text-amber-400 text-xs mb-1">المتبقي</p>
          <p className="text-2xl font-black text-white">{formatCurrency(totalRemaining)}</p>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input className="glass-input w-full pr-9 text-sm" placeholder="بحث برقم الفاتورة أو العميل..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {[{ v: "", l: "الكل" }, { v: "cash", l: "نقدي" }, { v: "credit", l: "آجل" }, { v: "partial", l: "جزئي" }].map(opt => (
            <button key={opt.v} onClick={() => setPayFilter(opt.v)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${payFilter === opt.v ? "bg-amber-500/20 border-amber-500/40 text-amber-400" : "glass-panel border-white/10 text-white/50 hover:text-white"}`}>
              {opt.l}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mr-auto">
          <button onClick={() => exportPurchasesExcel(filtered)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30 transition-all">
            <FileDown className="w-3.5 h-3.5" /> Excel
          </button>
          <button onClick={() => printPurchasesReport(filtered)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-500/20 border border-blue-500/40 text-blue-400 hover:bg-blue-500/30 transition-all">
            <Printer className="w-3.5 h-3.5" /> PDF
          </button>
        </div>
      </div>

      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-3 text-white/50">رقم الفاتورة</th>
                <th className="p-3 text-white/50">العميل</th>
                <th className="p-3 text-white/50">الإجمالي</th>
                <th className="p-3 text-white/50">المدفوع</th>
                <th className="p-3 text-white/50">المتبقي</th>
                <th className="p-3 text-white/50">الدفع</th>
                <th className="p-3 text-white/50">الحالة</th>
                <th className="p-3 text-white/50">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td colSpan={8} className="p-12 text-center text-white/40">جاري التحميل...</td></tr>
                : filtered.length === 0 ? <tr><td colSpan={8} className="p-12 text-center text-white/40">لا توجد مشتريات</td></tr>
                : filtered.map(p => (
                  <tr key={p.id} className="border-b border-white/5 hover:bg-white/3">
                    <td className="p-3 font-bold text-amber-400">{p.invoice_no}</td>
                    <td className="p-3 text-white">{p.customer_name || "—"}</td>
                    <td className="p-3 font-bold text-white">{formatCurrency(p.total_amount)}</td>
                    <td className="p-3 text-emerald-400 font-bold">{formatCurrency(p.paid_amount)}</td>
                    <td className="p-3 text-red-400 font-bold">{p.remaining_amount > 0 ? formatCurrency(p.remaining_amount) : "—"}</td>
                    <td className="p-3"><PaymentBadge type={p.payment_type} /></td>
                    <td className="p-3"><StatusBadge status={p.status} /></td>
                    <td className="p-3 text-white/40 text-xs">{formatDate(p.created_at)}</td>
                  </tr>
                ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="bg-white/5 border-t border-white/10">
                <tr>
                  <td colSpan={2} className="p-3 text-white/50 font-bold">الإجمالي ({filtered.length} فاتورة)</td>
                  <td className="p-3 font-black text-white">{formatCurrency(totalPurchases)}</td>
                  <td className="p-3 font-black text-emerald-400">{formatCurrency(totalPaid)}</td>
                  <td className="p-3 font-black text-red-400">{formatCurrency(totalRemaining)}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── Inventory ─── */
function InventoryReport() {
  const { data: products = [], isLoading } = useGetProducts();
  const [catFilter, setCatFilter] = useState("");

  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean)));
  const filtered = catFilter ? products.filter(p => p.category === catFilter) : products;

  const totalStockValue = filtered.reduce((s, p) => s + p.quantity * p.cost_price, 0);
  const totalSaleValue = filtered.reduce((s, p) => s + p.quantity * p.sale_price, 0);
  const potentialProfit = totalSaleValue - totalStockValue;
  const lowStockItems = filtered.filter(p => p.low_stock_threshold !== null && p.quantity <= (p.low_stock_threshold ?? 5));
  const outOfStock = filtered.filter(p => p.quantity === 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel rounded-2xl p-5 border border-white/5">
          <p className="text-white/50 text-sm mb-1">إجمالي المنتجات</p>
          <p className="text-3xl font-black text-white">{filtered.length}</p>
          <p className="text-xs text-white/30 mt-1">صنف</p>
        </div>
        <div className="glass-panel rounded-2xl p-5 border border-blue-500/10">
          <p className="text-blue-400 text-sm mb-1">قيمة المخزون (التكلفة)</p>
          <p className="text-2xl font-black text-white">{formatCurrency(totalStockValue)}</p>
        </div>
        <div className="glass-panel rounded-2xl p-5 border border-emerald-500/10">
          <p className="text-emerald-400 text-sm mb-1">قيمة المخزون (البيع)</p>
          <p className="text-2xl font-black text-white">{formatCurrency(totalSaleValue)}</p>
        </div>
        <div className="glass-panel rounded-2xl p-5 border border-amber-500/10">
          <p className="text-amber-400 text-sm mb-1">الربح المتوقع</p>
          <p className="text-2xl font-black text-white">{formatCurrency(potentialProfit)}</p>
        </div>
      </div>

      {(lowStockItems.length > 0 || outOfStock.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {outOfStock.length > 0 && (
            <div className="glass-panel rounded-2xl p-4 border border-red-500/20 bg-red-500/5">
              <h4 className="font-bold text-red-400 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> نفاذ المخزون ({outOfStock.length} صنف)
              </h4>
              <div className="space-y-1">
                {outOfStock.map(p => (
                  <div key={p.id} className="flex justify-between text-sm py-1 border-b border-white/5">
                    <span className="text-white">{p.name}</span>
                    <span className="text-red-400 font-bold">0 قطعة</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {lowStockItems.length > 0 && (
            <div className="glass-panel rounded-2xl p-4 border border-yellow-500/20 bg-yellow-500/5">
              <h4 className="font-bold text-yellow-400 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> مخزون منخفض ({lowStockItems.length} صنف)
              </h4>
              <div className="space-y-1">
                {lowStockItems.map(p => (
                  <div key={p.id} className="flex justify-between text-sm py-1 border-b border-white/5">
                    <span className="text-white">{p.name}</span>
                    <span className="text-yellow-400 font-bold">{p.quantity} قطع متبقية</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <span className="text-white/50 text-sm">تصفية:</span>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setCatFilter("")} className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${!catFilter ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'}`}>الكل</button>
          {categories.map(cat => (
            <button key={cat} onClick={() => setCatFilter(cat!)} className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${catFilter === cat ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'}`}>{cat}</button>
          ))}
        </div>
      </div>

      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-4 text-white/60 font-semibold">المنتج</th>
                <th className="p-4 text-white/60 font-semibold">التصنيف</th>
                <th className="p-4 text-white/60 font-semibold">الكمية</th>
                <th className="p-4 text-white/60 font-semibold">سعر التكلفة</th>
                <th className="p-4 text-white/60 font-semibold">سعر البيع</th>
                <th className="p-4 text-white/60 font-semibold">قيمة المخزون</th>
                <th className="p-4 text-white/60 font-semibold">الربح المتوقع</th>
                <th className="p-4 text-white/60 font-semibold">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="p-12 text-center text-white/40">جاري التحميل...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="p-12 text-center text-white/40">لا توجد منتجات</td></tr>
              ) : (
                filtered.map(product => {
                  const stockValue = product.quantity * product.cost_price;
                  const totalProfit = product.quantity * (product.sale_price - product.cost_price);
                  const isLow = product.low_stock_threshold !== null && product.quantity <= (product.low_stock_threshold ?? 5);
                  const isOut = product.quantity === 0;
                  return (
                    <tr key={product.id} className={`border-b border-white/5 hover:bg-white/3 transition-colors ${isOut ? 'bg-red-500/5' : isLow ? 'bg-yellow-500/5' : ''}`}>
                      <td className="p-4 font-bold text-white">{product.name}</td>
                      <td className="p-4">{product.category ? <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20">{product.category}</span> : '-'}</td>
                      <td className="p-4"><span className={`px-3 py-1 rounded-full text-xs font-bold border ${isOut ? 'bg-red-500/20 text-red-400 border-red-500/30' : isLow ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'}`}>{isOut ? '⚠ نافذ' : product.quantity}</span></td>
                      <td className="p-4 text-white/60">{formatCurrency(product.cost_price)}</td>
                      <td className="p-4 text-emerald-400">{formatCurrency(product.sale_price)}</td>
                      <td className="p-4 font-bold text-blue-400">{formatCurrency(stockValue)}</td>
                      <td className="p-4 font-bold text-amber-400">{formatCurrency(totalProfit)}</td>
                      <td className="p-4"><span className={`text-xs font-bold ${isOut ? 'text-red-400' : isLow ? 'text-yellow-400' : 'text-emerald-400'}`}>{isOut ? 'نافذ' : isLow ? 'منخفض' : 'جيد'}</span></td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot className="bg-white/5 border-t border-white/10">
              <tr>
                <td colSpan={5} className="p-4 font-bold text-white/60">الإجمالي</td>
                <td className="p-4 font-black text-blue-400">{formatCurrency(totalStockValue)}</td>
                <td className="p-4 font-black text-amber-400">{formatCurrency(potentialProfit)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── Customer Statement Modal ─── */
function CustomerStatementModal({ customerId, onClose }: { customerId: number; onClose: () => void }) {
  const { data, isLoading } = useGetCustomerStatement(customerId);
  const [expandedSaleId, setExpandedSaleId] = useState<number | null>(null);
  const [expandedPurchaseId, setExpandedPurchaseId] = useState<number | null>(null);

  if (isLoading) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="glass-panel rounded-3xl p-8 text-white/60">جاري تحميل كشف الحساب...</div>
    </div>
  );
  if (!data) return null;

  const { customer, sales, linked_purchases, sales_returns = [], receipt_vouchers = [], deposit_vouchers = [], payment_vouchers = [] } = data;
  const totalSold = sales.reduce((s, v) => s + Number(v.total_amount), 0);
  const totalPaid = sales.reduce((s, v) => s + Number(v.paid_amount), 0);

  const handlePdfExport = () => {
    printCustomerStatement(
      { name: customer.name, phone: customer.phone, balance: Number(customer.balance) },
      sales.map(s => ({ invoice_no: s.invoice_no, total_amount: Number(s.total_amount), paid_amount: Number(s.paid_amount), remaining_amount: Number(s.remaining_amount), payment_type: s.payment_type, status: s.status, created_at: s.created_at })),
      sales_returns.map(r => ({ return_no: r.return_no, total_amount: Number(r.total_amount), refund_type: r.refund_type, reason: r.reason, created_at: r.created_at })),
      receipt_vouchers.map(v => ({ voucher_no: v.voucher_no, amount: Number(v.amount), safe_name: v.safe_name, notes: v.notes, date: v.date })),
      deposit_vouchers.map(v => ({ voucher_no: v.voucher_no, amount: Number(v.amount), safe_name: v.safe_name, notes: v.notes, date: v.date })),
      payment_vouchers.map(v => ({ voucher_no: v.voucher_no, amount: Number(v.amount), safe_name: v.safe_name, notes: v.notes, date: v.date })),
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="glass-panel rounded-3xl p-0 w-full max-w-4xl border border-white/10 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-white/10 bg-white/5">
          <div>
            <h3 className="text-2xl font-bold text-white">كشف حساب تفصيلي</h3>
            <p className="text-amber-400 font-semibold mt-1">{customer.name}</p>
            {customer.phone && <p className="text-white/40 text-sm">{customer.phone}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePdfExport}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-blue-500/20 border border-blue-500/40 text-blue-400 hover:bg-blue-500/30 transition-colors">
              <Printer className="w-3.5 h-3.5" /> طباعة PDF
            </button>
            <button onClick={onClose} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"><X className="w-5 h-5 text-white/70" /></button>
          </div>
        </div>

        <div className="overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 text-center">
              <p className="text-blue-400 text-xs mb-1">إجمالي المبيعات</p>
              <p className="text-white font-black">{formatCurrency(totalSold)}</p>
              <p className="text-white/30 text-xs">{sales.length} فاتورة</p>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 text-center">
              <p className="text-emerald-400 text-xs mb-1">المدفوع</p>
              <p className="text-white font-black">{formatCurrency(totalPaid)}</p>
            </div>
            <div className={`border rounded-2xl p-4 text-center ${Number(customer.balance) > 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-white/5 border-white/10'}`}>
              <p className={`text-xs mb-1 ${Number(customer.balance) > 0 ? 'text-red-400' : 'text-white/50'}`}>الرصيد المستحق</p>
              <p className={`font-black ${Number(customer.balance) > 0 ? 'text-red-400' : 'text-white/40'}`}>{formatCurrency(Number(customer.balance))}</p>
            </div>
          </div>

          {sales.length > 0 && (
            <div>
              <h4 className="text-white font-bold mb-3 flex items-center gap-2"><ShoppingBag className="w-4 h-4 text-amber-400" /> فواتير المبيعات ({sales.length})</h4>
              <div className="space-y-2">
                {sales.map(s => (
                  <div key={s.id} className="border border-white/10 rounded-2xl overflow-hidden">
                    <button onClick={() => setExpandedSaleId(expandedSaleId === s.id ? null : s.id)}
                      className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-amber-400 font-bold">{s.invoice_no}</span>
                        <PaymentBadge type={s.payment_type} />
                        <span className="text-white/50">{formatDate(s.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-white font-bold text-sm">{formatCurrency(Number(s.total_amount))}</span>
                        {Number(s.remaining_amount) > 0 && <span className="text-red-400 text-xs font-bold">متبقي: {formatCurrency(Number(s.remaining_amount))}</span>}
                        {expandedSaleId === s.id ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
                      </div>
                    </button>
                    {expandedSaleId === s.id && s.items.length > 0 && (
                      <div className="border-t border-white/10 bg-white/3">
                        <table className="w-full text-right text-xs">
                          <thead className="bg-white/5"><tr>
                            <th className="p-2 text-white/50">الصنف</th>
                            <th className="p-2 text-white/50">الكمية</th>
                            <th className="p-2 text-white/50">سعر الوحدة</th>
                            <th className="p-2 text-white/50">الإجمالي</th>
                          </tr></thead>
                          <tbody>
                            {s.items.map(item => (
                              <tr key={item.id} className="border-t border-white/5">
                                <td className="p-2 text-white">{item.product_name}</td>
                                <td className="p-2 text-white/70">{Number(item.quantity)}</td>
                                <td className="p-2 text-white/70">{formatCurrency(Number(item.unit_price))}</td>
                                <td className="p-2 text-amber-400 font-bold">{formatCurrency(Number(item.total_price))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {linked_purchases.length > 0 && (
            <div>
              <h4 className="text-white font-bold mb-3 flex items-center gap-2"><ShoppingCart className="w-4 h-4 text-blue-400" /> مشتريات مُحمَّلة ({linked_purchases.length})</h4>
              <div className="space-y-2">
                {linked_purchases.map(p => (
                  <div key={p.id} className="border border-white/10 rounded-2xl overflow-hidden">
                    <button onClick={() => setExpandedPurchaseId(expandedPurchaseId === p.id ? null : p.id)}
                      className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-blue-400 font-bold">{p.invoice_no}</span>
                        {p.customer_payment_type && <PaymentBadge type={p.customer_payment_type} />}
                        <span className="text-white/50">{formatDate(p.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-white font-bold text-sm">{formatCurrency(Number(p.total_amount))}</span>
                        {expandedPurchaseId === p.id ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
                      </div>
                    </button>
                    {expandedPurchaseId === p.id && p.items.length > 0 && (
                      <div className="border-t border-white/10 bg-white/3">
                        <table className="w-full text-right text-xs">
                          <thead className="bg-white/5"><tr>
                            <th className="p-2 text-white/50">الصنف</th>
                            <th className="p-2 text-white/50">الكمية</th>
                            <th className="p-2 text-white/50">سعر الوحدة</th>
                            <th className="p-2 text-white/50">الإجمالي</th>
                          </tr></thead>
                          <tbody>
                            {p.items.map(item => (
                              <tr key={item.id} className="border-t border-white/5">
                                <td className="p-2 text-white">{item.product_name}</td>
                                <td className="p-2 text-white/70">{Number(item.quantity)}</td>
                                <td className="p-2 text-white/70">{formatCurrency(Number(item.unit_price))}</td>
                                <td className="p-2 text-blue-400 font-bold">{formatCurrency(Number(item.total_price))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {sales_returns.length > 0 && (
            <div>
              <h4 className="text-white font-bold mb-3 flex items-center gap-2"><FileText className="w-4 h-4 text-red-400" /> المرتجعات ({sales_returns.length})</h4>
              <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
                <table className="w-full text-right text-sm">
                  <thead className="bg-white/5 border-b border-white/10">
                    <tr>
                      <th className="p-3 text-white/50">رقم المرتجع</th>
                      <th className="p-3 text-white/50">المبلغ</th>
                      <th className="p-3 text-white/50">نوع الاسترداد</th>
                      <th className="p-3 text-white/50">السبب</th>
                      <th className="p-3 text-white/50">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales_returns.map(r => (
                      <tr key={r.id} className="border-b border-white/5">
                        <td className="p-3 font-bold text-red-400">{r.return_no}</td>
                        <td className="p-3 font-bold text-red-400">{formatCurrency(Number(r.total_amount))}</td>
                        <td className="p-3 text-white/70">{r.refund_type === "cash" ? "نقدي" : "رصيد"}</td>
                        <td className="p-3 text-white/50 text-xs">{r.reason ?? "—"}</td>
                        <td className="p-3 text-white/40 text-xs">{formatDate(r.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-white/5 border-t border-white/10">
                    <tr>
                      <td className="p-3 font-bold text-white/50">الإجمالي</td>
                      <td className="p-3 font-black text-red-400">{formatCurrency(sales_returns.reduce((s, r) => s + Number(r.total_amount), 0))}</td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {receipt_vouchers.length > 0 && (
            <div>
              <h4 className="text-white font-bold mb-3 flex items-center gap-2"><DollarSign className="w-4 h-4 text-emerald-400" /> سندات القبض — مدفوعات العميل ({receipt_vouchers.length})</h4>
              <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
                <table className="w-full text-right text-sm">
                  <thead className="bg-white/5 border-b border-white/10">
                    <tr>
                      <th className="p-3 text-white/50">رقم السند</th>
                      <th className="p-3 text-white/50">المبلغ</th>
                      <th className="p-3 text-white/50">الخزينة</th>
                      <th className="p-3 text-white/50">بيان</th>
                      <th className="p-3 text-white/50">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipt_vouchers.map(v => (
                      <tr key={v.id} className="border-b border-white/5">
                        <td className="p-3 font-bold text-emerald-400">{v.voucher_no}</td>
                        <td className="p-3 font-bold text-emerald-400">{formatCurrency(Number(v.amount))}</td>
                        <td className="p-3 text-white/70">{v.safe_name}</td>
                        <td className="p-3 text-white/50 text-xs">{v.notes ?? "—"}</td>
                        <td className="p-3 text-white/40 text-xs">{formatDate(v.date)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-white/5 border-t border-white/10">
                    <tr>
                      <td className="p-3 font-bold text-white/50">الإجمالي</td>
                      <td className="p-3 font-black text-emerald-400">{formatCurrency(receipt_vouchers.reduce((s, v) => s + Number(v.amount), 0))}</td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {deposit_vouchers.length > 0 && (
            <div>
              <h4 className="text-white font-bold mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-blue-400" /> سندات الإيداع ({deposit_vouchers.length})</h4>
              <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
                <table className="w-full text-right text-sm">
                  <thead className="bg-white/5 border-b border-white/10">
                    <tr>
                      <th className="p-3 text-white/50">رقم السند</th>
                      <th className="p-3 text-white/50">المبلغ</th>
                      <th className="p-3 text-white/50">الخزينة</th>
                      <th className="p-3 text-white/50">بيان</th>
                      <th className="p-3 text-white/50">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deposit_vouchers.map(v => (
                      <tr key={v.id} className="border-b border-white/5">
                        <td className="p-3 font-bold text-blue-400">{v.voucher_no}</td>
                        <td className="p-3 font-bold text-blue-400">{formatCurrency(Number(v.amount))}</td>
                        <td className="p-3 text-white/70">{v.safe_name}</td>
                        <td className="p-3 text-white/50 text-xs">{v.notes ?? "—"}</td>
                        <td className="p-3 text-white/40 text-xs">{formatDate(v.date)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-white/5 border-t border-white/10">
                    <tr>
                      <td className="p-3 font-bold text-white/50">الإجمالي</td>
                      <td className="p-3 font-black text-blue-400">{formatCurrency(deposit_vouchers.reduce((s, v) => s + Number(v.amount), 0))}</td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {payment_vouchers.length > 0 && (
            <div>
              <h4 className="text-white font-bold mb-3 flex items-center gap-2"><TrendingDown className="w-4 h-4 text-purple-400" /> سندات الصرف — مردودات للعميل ({payment_vouchers.length})</h4>
              <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
                <table className="w-full text-right text-sm">
                  <thead className="bg-white/5 border-b border-white/10">
                    <tr>
                      <th className="p-3 text-white/50">رقم السند</th>
                      <th className="p-3 text-white/50">المبلغ</th>
                      <th className="p-3 text-white/50">الخزينة</th>
                      <th className="p-3 text-white/50">بيان</th>
                      <th className="p-3 text-white/50">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payment_vouchers.map(v => (
                      <tr key={v.id} className="border-b border-white/5">
                        <td className="p-3 font-bold text-purple-400">{v.voucher_no}</td>
                        <td className="p-3 font-bold text-purple-400">{formatCurrency(Number(v.amount))}</td>
                        <td className="p-3 text-white/70">{v.safe_name}</td>
                        <td className="p-3 text-white/50 text-xs">{v.notes ?? "—"}</td>
                        <td className="p-3 text-white/40 text-xs">{formatDate(v.date)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-white/5 border-t border-white/10">
                    <tr>
                      <td className="p-3 font-bold text-white/50">الإجمالي</td>
                      <td className="p-3 font-black text-purple-400">{formatCurrency(payment_vouchers.reduce((s, v) => s + Number(v.amount), 0))}</td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {sales.length === 0 && linked_purchases.length === 0 && sales_returns.length === 0 && receipt_vouchers.length === 0 && deposit_vouchers.length === 0 && payment_vouchers.length === 0 && (
            <div className="text-center py-8 text-white/40">لا توجد حركات لهذا العميل</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Customer Accounts ─── */
function CustomerAccountsReport() {
  const { data: customers = [], isLoading: custLoading } = useGetCustomers();
  const { data: allSales = [] } = useGetSales();
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const customerData = customers.map(c => {
    const sales = allSales.filter(s => s.customer_id === c.id || s.customer_name === c.name);
    const totalSold = sales.reduce((s, v) => s + v.total_amount, 0);
    const totalPaid = sales.reduce((s, v) => s + v.paid_amount, 0);
    return { ...c, totalSold, totalPaid, salesCount: sales.length };
  });

  const filtered = customerData.filter(c => !search || c.name.includes(search) || (c.phone && c.phone.includes(search)));
  const totalOwed = customerData.reduce((s, c) => s + c.balance, 0);
  const activeCust = customerData.filter(c => c.salesCount > 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel rounded-2xl p-5 border border-white/5">
          <p className="text-white/50 text-sm mb-1">إجمالي العملاء</p>
          <p className="text-3xl font-black text-white">{customers.length}</p>
        </div>
        <div className="glass-panel rounded-2xl p-5 border border-blue-500/10">
          <p className="text-blue-400 text-sm mb-1">عملاء نشطون</p>
          <p className="text-3xl font-black text-white">{activeCust.length}</p>
        </div>
        <div className="glass-panel rounded-2xl p-5 border border-emerald-500/10">
          <p className="text-emerald-400 text-sm mb-1">إجمالي المبيعات</p>
          <p className="text-2xl font-black text-white">{formatCurrency(customerData.reduce((s, c) => s + c.totalSold, 0))}</p>
        </div>
        <div className="glass-panel rounded-2xl p-5 border border-red-500/10">
          <p className="text-red-400 text-sm mb-1">إجمالي الديون</p>
          <p className="text-2xl font-black text-white">{formatCurrency(totalOwed)}</p>
        </div>
      </div>

      {selectedCustomerId && <CustomerStatementModal customerId={selectedCustomerId} onClose={() => setSelectedCustomerId(null)} />}

      <div className="relative max-w-xs">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <input className="glass-input w-full pr-9 text-sm" placeholder="بحث باسم العميل أو الهاتف..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-4 text-white/60 font-semibold">العميل</th>
                <th className="p-4 text-white/60 font-semibold">الهاتف</th>
                <th className="p-4 text-white/60 font-semibold">عدد الفواتير</th>
                <th className="p-4 text-white/60 font-semibold">إجمالي المبيعات</th>
                <th className="p-4 text-white/60 font-semibold">المدفوع</th>
                <th className="p-4 text-white/60 font-semibold">الرصيد المستحق</th>
                <th className="p-4 text-white/60 font-semibold">الكشف</th>
              </tr>
            </thead>
            <tbody>
              {custLoading ? <tr><td colSpan={7} className="p-12 text-center text-white/40">جاري التحميل...</td></tr>
                : filtered.length === 0 ? <tr><td colSpan={7} className="p-12 text-center text-white/40">لا يوجد عملاء</td></tr>
                : filtered.map(c => (
                  <tr key={c.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                    <td className="p-4 font-bold text-white">{c.name}</td>
                    <td className="p-4 text-white/50">{c.phone || '—'}</td>
                    <td className="p-4 text-white/70">{c.salesCount}</td>
                    <td className="p-4 font-bold text-white">{formatCurrency(c.totalSold)}</td>
                    <td className="p-4 text-emerald-400 font-bold">{formatCurrency(c.totalPaid)}</td>
                    <td className="p-4">
                      <span className={`font-bold ${c.balance > 0 ? 'text-red-400' : 'text-white/40'}`}>{c.balance > 0 ? formatCurrency(c.balance) : '—'}</span>
                    </td>
                    <td className="p-4">
                      <button onClick={() => setSelectedCustomerId(c.id)}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 transition-colors">
                        كشف الحساب
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── Financial Summary ─── */
function FinancialSummary() {
  const { data: stats } = useGetDashboardStats();
  const { data: transactions = [] } = useGetTransactions();

  const salesTxns = transactions.filter(t => t.type === 'sale');
  const purchaseTxns = transactions.filter(t => t.type === 'purchase');
  const expenseTxns = transactions.filter(t => t.type === 'expense');
  const incomeTxns = transactions.filter(t => t.type === 'income');

  const totalSales = salesTxns.reduce((s, t) => s + t.amount, 0);
  const totalPurchases = purchaseTxns.reduce((s, t) => s + t.amount, 0);
  const totalExpenses = expenseTxns.reduce((s, t) => s + t.amount, 0);
  const totalIncome = incomeTxns.reduce((s, t) => s + t.amount, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel rounded-2xl p-5 border border-emerald-500/10">
          <div className="flex items-center gap-2 mb-2"><TrendingUp className="w-4 h-4 text-emerald-400" /><p className="text-emerald-400 text-sm">إجمالي المبيعات</p></div>
          <p className="text-2xl font-black text-white">{formatCurrency(totalSales)}</p>
          <p className="text-xs text-white/30 mt-1">{salesTxns.length} حركة</p>
        </div>
        <div className="glass-panel rounded-2xl p-5 border border-red-500/10">
          <div className="flex items-center gap-2 mb-2"><TrendingDown className="w-4 h-4 text-red-400" /><p className="text-red-400 text-sm">إجمالي المشتريات</p></div>
          <p className="text-2xl font-black text-white">{formatCurrency(totalPurchases)}</p>
          <p className="text-xs text-white/30 mt-1">{purchaseTxns.length} حركة</p>
        </div>
        <div className="glass-panel rounded-2xl p-5 border border-yellow-500/10">
          <div className="flex items-center gap-2 mb-2"><DollarSign className="w-4 h-4 text-yellow-400" /><p className="text-yellow-400 text-sm">إجمالي المصروفات</p></div>
          <p className="text-2xl font-black text-white">{formatCurrency(totalExpenses)}</p>
        </div>
        <div className="glass-panel rounded-2xl p-5 border border-amber-500/10">
          <div className="flex items-center gap-2 mb-2"><TrendingUp className="w-4 h-4 text-amber-400" /><p className="text-amber-400 text-sm">صافي الربح</p></div>
          <p className="text-2xl font-black text-white">{formatCurrency(totalSales + totalIncome - totalPurchases - totalExpenses)}</p>
        </div>
      </div>

      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="p-4 border-b border-white/10">
          <h3 className="font-bold text-white">سجل الحركات المالية</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-4 text-white/60">النوع</th>
                <th className="p-4 text-white/60">المبلغ</th>
                <th className="p-4 text-white/60">البيان</th>
                <th className="p-4 text-white/60">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr><td colSpan={4} className="p-12 text-center text-white/40">لا توجد حركات</td></tr>
              ) : (
                [...transactions].reverse().map(tx => {
                  const isIn = tx.type === 'sale' || tx.type === 'receipt' || tx.type === 'income';
                  const labels: Record<string, string> = { sale: 'مبيعات', purchase: 'مشتريات', expense: 'مصروف', income: 'إيراد', receipt: 'سند قبض', payment: 'سند توريد' };
                  const colors: Record<string, string> = { sale: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', purchase: 'bg-red-500/20 text-red-400 border-red-500/30', expense: 'bg-orange-500/20 text-orange-400 border-orange-500/30', income: 'bg-blue-500/20 text-blue-400 border-blue-500/30', receipt: 'bg-teal-500/20 text-teal-400 border-teal-500/30', payment: 'bg-purple-500/20 text-purple-400 border-purple-500/30' };
                  return (
                    <tr key={tx.id} className="border-b border-white/5 hover:bg-white/3">
                      <td className="p-4"><span className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${colors[tx.type] || ''}`}>{labels[tx.type] || tx.type}</span></td>
                      <td className={`p-4 font-bold ${isIn ? 'text-emerald-400' : 'text-red-400'}`}>{isIn ? '+' : '-'} {formatCurrency(tx.amount)}</td>
                      <td className="p-4 text-white/70">{tx.description || '-'}</td>
                      <td className="p-4 text-white/50 text-xs">{formatDate(tx.created_at)}</td>
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

/* ─── Main Page ─── */
export default function Reports() {
  const [tab, setTab] = useState<"sales-invoices" | "purchases-invoices" | "inventory" | "customers" | "financial">("sales-invoices");

  const tabs = [
    { id: "sales-invoices",     label: "🧾 فواتير المبيعات" },
    { id: "purchases-invoices", label: "📦 فواتير المشتريات" },
    { id: "inventory",          label: "🏪 تقرير المخزن" },
    { id: "customers",          label: "👥 حسابات العملاء" },
    { id: "financial",          label: "💰 الملخص المالي" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex bg-white/5 rounded-2xl p-1 border border-white/10 flex-wrap gap-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as typeof tab)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex-1 min-w-fit ${tab === t.id ? "bg-amber-500 text-black shadow" : "text-white/50 hover:text-white"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "sales-invoices"     && <SalesInvoicesReport />}
      {tab === "purchases-invoices" && <PurchasesInvoicesReport />}
      {tab === "inventory"          && <InventoryReport />}
      {tab === "customers"          && <CustomerAccountsReport />}
      {tab === "financial"          && <FinancialSummary />}
    </div>
  );
}
