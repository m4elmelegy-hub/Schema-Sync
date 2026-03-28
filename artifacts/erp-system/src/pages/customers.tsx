import { useState } from "react";
import { useGetCustomers, useCreateCustomer, useCreateCustomerReceipt, useGetSales, useGetPurchases } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Plus, Search, DollarSign, FileText, X, TrendingUp, TrendingDown, RotateCcw, ArrowUpFromLine, ArrowDownToLine } from "lucide-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

/* ─── أنواع البيانات ─── */
interface ReceiptVoucher { id: number; voucher_no: string; customer_id: number | null; amount: number; safe_name: string; date: string; notes: string | null; created_at: string; }
interface PaymentVoucher { id: number; voucher_no: string; customer_id: number | null; amount: number; safe_name: string; date: string; notes: string | null; created_at: string; }
interface SaleReturn { id: number; return_no: string; customer_id: number | null; customer_name: string | null; total_amount: number; refund_type: string | null; safe_name: string | null; date: string | null; reason: string | null; created_at: string; }

/* ─── كشف الحساب ─── */
function CustomerStatementModal({ customerId, customerName, customerBalance, onClose }: {
  customerId: number;
  customerName: string;
  customerBalance: number;
  onClose: () => void;
}) {
  const { data: allSales = [] } = useGetSales();
  const { data: allPurchases = [] } = useGetPurchases();
  const { data: receiptVouchers = [] } = useQuery<ReceiptVoucher[]>({
    queryKey: ["/api/receipt-vouchers"],
    queryFn: () => fetch(api("/api/receipt-vouchers")).then(r => r.json()),
  });
  const { data: paymentVouchers = [] } = useQuery<PaymentVoucher[]>({
    queryKey: ["/api/payment-vouchers"],
    queryFn: () => fetch(api("/api/payment-vouchers")).then(r => r.json()),
  });
  const { data: salesReturns = [] } = useQuery<SaleReturn[]>({
    queryKey: ["/api/sales-returns"],
    queryFn: () => fetch(api("/api/sales-returns")).then(r => r.json()),
  });

  /* ─── تجميع حركات العميل ─── */
  const sales = allSales.filter(s => s.customer_id === customerId || s.customer_name === customerName);
  const purchases = allPurchases.filter(p => p.customer_id === customerId || p.customer_name === customerName);
  const receipts = receiptVouchers.filter(v => v.customer_id === customerId);
  const payments = paymentVouchers.filter(v => v.customer_id === customerId);
  const returns_ = salesReturns.filter(r => r.customer_id === customerId);

  /* ─── ملخص ─── */
  const totalSales = sales.reduce((s, v) => s + Number(v.total_amount), 0);
  const totalPurchases = purchases.reduce((s, v) => s + Number(v.total_amount), 0);
  const totalReceipts = receipts.reduce((s, v) => s + Number(v.amount), 0);
  const totalPayments = payments.reduce((s, v) => s + Number(v.amount), 0);
  const totalReturnsCredit = returns_.filter(r => r.refund_type !== "cash").reduce((s, v) => s + Number(v.total_amount), 0);
  const totalReturnsCash = returns_.filter(r => r.refund_type === "cash").reduce((s, v) => s + Number(v.total_amount), 0);
  const totalReturns = totalReturnsCredit + totalReturnsCash;

  /* ─── الجدول الموحد مع رصيد جاري ─── */
  type TxRow = { date: string; type: string; label: string; ref: string; debit: number; credit: number; };
  const rows: TxRow[] = [];

  // مبيعات → debit (دين على العميل)
  sales.forEach(s => rows.push({
    date: s.created_at,
    type: "sale",
    label: "فاتورة مبيعات",
    ref: s.invoice_no,
    debit: Number(s.remaining_amount),  // المتبقي فقط (المدفوع لم يؤثر على الرصيد)
    credit: 0,
  }));

  // مشتريات → credit (علينا للعميل)
  purchases.forEach(p => rows.push({
    date: p.created_at,
    type: "purchase",
    label: "فاتورة مشتريات",
    ref: p.invoice_no ?? `P-${p.id}`,
    debit: 0,
    credit: Number(p.remaining_amount ?? p.total_amount),
  }));

  // سندات قبض → credit (العميل دفع لنا)
  receipts.forEach(v => rows.push({
    date: v.date ?? v.created_at,
    type: "receipt",
    label: "سند قبض",
    ref: v.voucher_no,
    debit: 0,
    credit: Number(v.amount),
  }));

  // سندات توريد → debit (دفعنا للعميل = رصيده ارتفع من سالب)
  payments.forEach(v => rows.push({
    date: v.date ?? v.created_at,
    type: "payment",
    label: "سند توريد",
    ref: v.voucher_no,
    debit: Number(v.amount),
    credit: 0,
  }));

  // مرتجعات خصم رصيد → credit (دين العميل قلّ)
  returns_.filter(r => r.refund_type !== "cash").forEach(r => rows.push({
    date: r.date ?? r.created_at,
    type: "return_credit",
    label: "مرتجع (خصم رصيد)",
    ref: r.return_no,
    debit: 0,
    credit: Number(r.total_amount),
  }));

  // مرتجعات نقدي → لا أثر على الرصيد (صرفنا نقداً)
  returns_.filter(r => r.refund_type === "cash").forEach(r => rows.push({
    date: r.date ?? r.created_at,
    type: "return_cash",
    label: "مرتجع (نقدي)",
    ref: r.return_no,
    debit: 0,
    credit: 0,  // لا أثر على رصيد العميل
  }));

  // ترتيب زمني
  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // رصيد جاري (موجب = العميل مدين لنا، سالب = نحن مدينون له)
  let running = 0;
  const rowsWithBalance = rows.map(r => {
    running += r.debit - r.credit;
    return { ...r, balance: running };
  });

  const typeConfig: Record<string, { color: string; bg: string; icon: string }> = {
    sale: { color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", icon: "↑" },
    purchase: { color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20", icon: "↓" },
    receipt: { color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", icon: "→" },
    payment: { color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20", icon: "←" },
    return_credit: { color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20", icon: "↩" },
    return_cash: { color: "text-pink-400", bg: "bg-pink-500/10 border-pink-500/20", icon: "↩" },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="glass-panel rounded-3xl p-0 w-full max-w-4xl border border-white/10 shadow-2xl max-h-[92vh] overflow-hidden flex flex-col">

        {/* ─── رأس الكشف ─── */}
        <div className="flex justify-between items-center p-6 border-b border-white/10 bg-white/5 flex-shrink-0">
          <div>
            <h3 className="text-2xl font-black text-white">كشف حساب</h3>
            <p className="text-amber-400 font-bold text-lg mt-0.5">{customerName}</p>
            <p className={`text-sm mt-1 font-semibold ${customerBalance > 0 ? 'text-yellow-400' : customerBalance < 0 ? 'text-orange-400' : 'text-white/40'}`}>
              الرصيد الحالي:{" "}
              {customerBalance > 0
                ? `${formatCurrency(customerBalance)} — العميل مدين`
                : customerBalance < 0
                  ? `${formatCurrency(Math.abs(customerBalance))} — علينا للعميل`
                  : "متسوّى"}
            </p>
          </div>
          <button onClick={onClose} className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
            <X className="w-5 h-5 text-white/70" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-6 flex-1">

          {/* ─── ملخص الأرقام ─── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3 text-center">
              <p className="text-amber-400 text-xs mb-1 flex items-center justify-center gap-1"><TrendingUp className="w-3 h-3" /> إجمالي المبيعات</p>
              <p className="text-white font-black">{formatCurrency(totalSales)}</p>
              <p className="text-white/40 text-xs">{sales.length} فاتورة</p>
            </div>
            {totalPurchases > 0 && (
              <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-3 text-center">
                <p className="text-purple-400 text-xs mb-1 flex items-center justify-center gap-1"><TrendingDown className="w-3 h-3" /> إجمالي مشترياتنا منه</p>
                <p className="text-white font-black">{formatCurrency(totalPurchases)}</p>
                <p className="text-white/40 text-xs">{purchases.length} فاتورة</p>
              </div>
            )}
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-3 text-center">
              <p className="text-emerald-400 text-xs mb-1 flex items-center justify-center gap-1"><ArrowDownToLine className="w-3 h-3" /> إجمالي القبض</p>
              <p className="text-white font-black">{formatCurrency(totalReceipts)}</p>
              <p className="text-white/40 text-xs">{receipts.length} سند</p>
            </div>
            {totalPayments > 0 && (
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-3 text-center">
                <p className="text-orange-400 text-xs mb-1 flex items-center justify-center gap-1"><ArrowUpFromLine className="w-3 h-3" /> إجمالي التوريد</p>
                <p className="text-white font-black">{formatCurrency(totalPayments)}</p>
                <p className="text-white/40 text-xs">{payments.length} سند</p>
              </div>
            )}
            {totalReturns > 0 && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-3 text-center">
                <p className="text-blue-400 text-xs mb-1 flex items-center justify-center gap-1"><RotateCcw className="w-3 h-3" /> إجمالي المرتجعات</p>
                <p className="text-white font-black">{formatCurrency(totalReturns)}</p>
                <p className="text-white/40 text-xs">{returns_.length} مرتجع</p>
              </div>
            )}
            <div className={`${customerBalance > 0 ? 'bg-red-500/10 border-red-500/20' : customerBalance < 0 ? 'bg-orange-500/10 border-orange-500/20' : 'bg-white/5 border-white/10'} border rounded-2xl p-3 text-center`}>
              <p className={`text-xs mb-1 ${customerBalance > 0 ? 'text-red-400' : customerBalance < 0 ? 'text-orange-400' : 'text-white/40'}`}>الرصيد الصافي</p>
              <p className={`font-black ${customerBalance > 0 ? 'text-red-400' : customerBalance < 0 ? 'text-orange-400' : 'text-white/40'}`}>{formatCurrency(Math.abs(customerBalance))}</p>
              <p className="text-white/40 text-xs">{customerBalance > 0 ? 'عليه' : customerBalance < 0 ? 'له' : 'متسوّى'}</p>
            </div>
          </div>

          {/* ─── دليل الرموز ─── */}
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(typeConfig).map(([key, cfg]) => (
              <span key={key} className={`px-2 py-0.5 rounded-lg border ${cfg.bg} ${cfg.color}`}>
                {cfg.icon} {key === "sale" ? "مبيعات" : key === "purchase" ? "مشتريات" : key === "receipt" ? "قبض" : key === "payment" ? "توريد" : key === "return_credit" ? "مرتجع رصيد" : "مرتجع نقدي"}
              </span>
            ))}
          </div>

          {/* ─── الجدول الموحد ─── */}
          {rowsWithBalance.length === 0 ? (
            <div className="text-center py-12 text-white/30">لا توجد حركات مسجلة لهذا العميل</div>
          ) : (
            <div className="rounded-2xl overflow-hidden border border-white/10">
              <table className="w-full text-right text-sm">
                <thead className="bg-white/5 border-b border-white/10">
                  <tr>
                    <th className="p-3 text-white/60 font-semibold">التاريخ</th>
                    <th className="p-3 text-white/60 font-semibold">البيان</th>
                    <th className="p-3 text-white/60 font-semibold">المرجع</th>
                    <th className="p-3 text-white/60 font-semibold text-center">مدين (علينا)</th>
                    <th className="p-3 text-white/60 font-semibold text-center">دائن (له)</th>
                    <th className="p-3 text-white/60 font-semibold text-center">الرصيد</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsWithBalance.map((r, i) => {
                    const cfg = typeConfig[r.type] || typeConfig["sale"];
                    return (
                      <tr key={i} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                        <td className="p-3 text-white/50 text-xs whitespace-nowrap">{r.date ? r.date.split("T")[0] : "—"}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${cfg.bg} ${cfg.color}`}>
                            {cfg.icon} {r.label}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-white/60 text-xs">{r.ref}</td>
                        <td className="p-3 text-center font-bold text-amber-400">{r.debit > 0 ? formatCurrency(r.debit) : "—"}</td>
                        <td className="p-3 text-center font-bold text-emerald-400">{r.credit > 0 ? formatCurrency(r.credit) : "—"}</td>
                        <td className="p-3 text-center font-black">
                          <span className={r.balance > 0 ? 'text-yellow-400' : r.balance < 0 ? 'text-orange-400' : 'text-white/40'}>
                            {r.balance !== 0 ? `${formatCurrency(Math.abs(r.balance))} ${r.balance > 0 ? '↑' : '↓'}` : 'صفر'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-white/5 border-t border-white/10">
                  <tr>
                    <td colSpan={3} className="p-3 text-white/60 font-bold text-right">الإجمالي</td>
                    <td className="p-3 text-center font-black text-amber-400">
                      {formatCurrency(rowsWithBalance.reduce((s, r) => s + r.debit, 0))}
                    </td>
                    <td className="p-3 text-center font-black text-emerald-400">
                      {formatCurrency(rowsWithBalance.reduce((s, r) => s + r.credit, 0))}
                    </td>
                    <td className="p-3 text-center font-black">
                      <span className={customerBalance > 0 ? 'text-yellow-400' : customerBalance < 0 ? 'text-orange-400' : 'text-white/40'}>
                        {formatCurrency(Math.abs(customerBalance))} {customerBalance > 0 ? 'عليه' : customerBalance < 0 ? 'له' : ''}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── الصفحة الرئيسية للعملاء ─── */
export default function Customers() {
  const { data: customers = [], isLoading } = useGetCustomers();
  const createMutation = useCreateCustomer();
  const receiptMutation = useCreateCustomerReceipt();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showReceipt, setShowReceipt] = useState<number | null>(null);
  const [showStatement, setShowStatement] = useState<{ id: number; name: string; balance: number } | null>(null);
  const [formData, setFormData] = useState({ name: "", phone: "", balance: 0 });
  const [receiptData, setReceiptData] = useState({ amount: 0, description: "" });

  const filtered = customers.filter(c => c.name.includes(search) || (c.phone && c.phone.includes(search)));

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ data: formData }, {
      onSuccess: () => {
        toast({ title: "✅ تم إضافة العميل بنجاح" });
        queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
        setShowAdd(false);
        setFormData({ name: "", phone: "", balance: 0 });
      }
    });
  };

  const handleReceipt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!showReceipt) return;
    receiptMutation.mutate({ id: showReceipt, data: receiptData }, {
      onSuccess: () => {
        toast({ title: "✅ تم تسجيل الدفعة بنجاح" });
        queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
        setShowReceipt(null);
        setReceiptData({ amount: 0, description: "" });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative w-full max-w-md">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
          <input type="text" placeholder="بحث عن عميل..." className="glass-input pl-4 pr-12 w-full"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2 whitespace-nowrap">
          <Plus className="w-5 h-5" /> إضافة عميل
        </button>
      </div>

      {/* كشف الحساب */}
      {showStatement && (
        <CustomerStatementModal
          customerId={showStatement.id}
          customerName={showStatement.name}
          customerBalance={showStatement.balance}
          onClose={() => setShowStatement(null)}
        />
      )}

      {/* إضافة عميل */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form onSubmit={handleAdd} className="glass-panel rounded-3xl p-8 w-full max-w-md border border-white/10">
            <h3 className="text-2xl font-bold text-white mb-6">عميل جديد</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-white/70 text-sm mb-1">اسم العميل *</label>
                <input required type="text" className="glass-input" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-1">رقم الهاتف</label>
                <input type="text" className="glass-input" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-1">رصيد ابتدائي (عليه)</label>
                <input type="number" step="0.01" min="0" className="glass-input" value={formData.balance || ''} onChange={e => setFormData({...formData, balance: parseFloat(e.target.value) || 0})} />
              </div>
            </div>
            <div className="flex gap-4 mt-8">
              <button type="submit" disabled={createMutation.isPending} className="flex-1 btn-primary py-3">حفظ</button>
              <button type="button" onClick={() => setShowAdd(false)} className="flex-1 btn-secondary py-3">إلغاء</button>
            </div>
          </form>
        </div>
      )}

      {/* سند قبض */}
      {showReceipt !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form onSubmit={handleReceipt} className="glass-panel rounded-3xl p-8 w-full max-w-md border border-white/10">
            <h3 className="text-2xl font-bold text-white mb-2">سند قبض</h3>
            <p className="text-white/50 text-sm mb-6">استلام دفعة من العميل</p>
            <div className="space-y-4">
              <div>
                <label className="block text-white/70 text-sm mb-1">المبلغ المستلم *</label>
                <input required type="number" step="0.01" min="0.01" className="glass-input" value={receiptData.amount || ''} onChange={e => setReceiptData({...receiptData, amount: parseFloat(e.target.value) || 0})} />
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-1">البيان</label>
                <input type="text" className="glass-input" placeholder="اختياري..." value={receiptData.description} onChange={e => setReceiptData({...receiptData, description: e.target.value})} />
              </div>
            </div>
            <div className="flex gap-4 mt-8">
              <button type="submit" disabled={receiptMutation.isPending} className="flex-1 bg-emerald-500 text-white py-3 rounded-xl font-bold hover:bg-emerald-600 transition-colors">تأكيد الاستلام</button>
              <button type="button" onClick={() => setShowReceipt(null)} className="flex-1 btn-secondary py-3">إلغاء</button>
            </div>
          </form>
        </div>
      )}

      {/* جدول العملاء */}
      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-white/80 whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-4 font-semibold text-white/60">العميل</th>
                <th className="p-4 font-semibold text-white/60">رقم الهاتف</th>
                <th className="p-4 font-semibold text-white/60">الرصيد</th>
                <th className="p-4 font-semibold text-white/60">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={4} className="p-12 text-center text-white/40">جاري التحميل...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} className="p-12 text-center text-white/40">لا يوجد عملاء</td></tr>
              ) : (
                filtered.map(customer => (
                  <tr key={customer.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                    <td className="p-4 font-bold text-white">{customer.name}</td>
                    <td className="p-4 text-white/60">{customer.phone || '-'}</td>
                    <td className="p-4 font-bold">
                      {Number(customer.balance) > 0 ? (
                        <span className="text-yellow-400">{formatCurrency(Number(customer.balance))} <span className="text-xs font-normal text-white/40">عليه</span></span>
                      ) : Number(customer.balance) < 0 ? (
                        <span className="text-orange-400">{formatCurrency(Math.abs(Number(customer.balance)))} <span className="text-xs font-normal text-white/40">له</span></span>
                      ) : (
                        <span className="text-white/30">متسوّى</span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setShowStatement({ id: customer.id, name: customer.name, balance: Number(customer.balance) })}
                          className="flex items-center gap-1.5 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors border border-blue-500/30"
                        >
                          <FileText className="w-3.5 h-3.5" /> كشف حساب
                        </button>
                        <button
                          onClick={() => setShowReceipt(customer.id)}
                          className="flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors border border-emerald-500/30"
                        >
                          <DollarSign className="w-3.5 h-3.5" /> قبض دفعة
                        </button>
                      </div>
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
