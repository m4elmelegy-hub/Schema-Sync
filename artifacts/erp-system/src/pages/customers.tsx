import { useState } from "react";
import { useGetCustomers, useCreateCustomer, useGetSales, useGetPurchases, useGetSettingsSafes } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import {
  Plus, Search, DollarSign, FileText, X,
  TrendingUp, TrendingDown, RotateCcw, ArrowUpFromLine, ArrowDownToLine,
  Printer, MessageCircle, Vault, FileDown,
} from "lucide-react";
import { TableSkeleton } from "@/components/skeletons";
import { exportCustomersExcel } from "@/lib/export-excel";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

/* ─── أنواع البيانات ─── */
interface ReceiptVoucher { id: number; voucher_no: string; customer_id: number | null; amount: number; safe_name: string; date: string; notes: string | null; created_at: string; }
interface PaymentVoucher { id: number; voucher_no: string; customer_id: number | null; amount: number; safe_name: string; date: string; notes: string | null; created_at: string; }
interface SaleReturn { id: number; return_no: string; customer_id: number | null; customer_name: string | null; total_amount: number; refund_type: string | null; safe_name: string | null; date: string | null; reason: string | null; created_at: string; }

/* ─── دالة طباعة كشف الحساب كـ PDF ─── */
function printCustomerStatement(opts: {
  customerName: string;
  customerPhone: string;
  customerBalance: number;
  rows: { date: string; label: string; ref: string; debit: number; credit: number; balance: number }[];
  summaryCards: { label: string; value: number; count: number }[];
  companyName: string;
  companySlogan: string;
}) {
  const { customerName, customerPhone, customerBalance, rows, summaryCards, companyName, companySlogan } = opts;
  const today = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });

  const rowsHtml = rows.map((r, i) => `
    <tr class="${i % 2 === 0 ? 'even' : 'odd'}">
      <td>${r.date ? r.date.split("T")[0] : "—"}</td>
      <td>${r.label}</td>
      <td class="mono">${r.ref}</td>
      <td class="num ${r.debit > 0 ? 'debit' : ''}">${r.debit > 0 ? r.debit.toLocaleString("ar-EG", { minimumFractionDigits: 2 }) : "—"}</td>
      <td class="num ${r.credit > 0 ? 'credit' : ''}">${r.credit > 0 ? r.credit.toLocaleString("ar-EG", { minimumFractionDigits: 2 }) : "—"}</td>
      <td class="num bold ${r.balance > 0 ? 'debit' : r.balance < 0 ? 'credit-neg' : ''}">${
        r.balance !== 0
          ? `${Math.abs(r.balance).toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ${r.balance > 0 ? "عليه" : "له"}`
          : "صفر"
      }</td>
    </tr>
  `).join("");

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);

  const balanceLabel = customerBalance > 0 ? `${Math.abs(customerBalance).toLocaleString("ar-EG", { minimumFractionDigits: 2 })} — العميل مدين`
    : customerBalance < 0 ? `${Math.abs(customerBalance).toLocaleString("ar-EG", { minimumFractionDigits: 2 })} — دائن للعميل`
    : "متسوّى (صفر)";

  const cardsHtml = summaryCards.map(c => `
    <div class="card">
      <div class="card-label">${c.label}</div>
      <div class="card-value">${c.value.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}</div>
      <div class="card-count">${c.count} حركة</div>
    </div>
  `).join("");

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>كشف حساب — ${customerName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #fff; color: #1a1a1a; font-size: 13px; direction: rtl; }
    .page { max-width: 900px; margin: 0 auto; padding: 30px 40px; }
    /* شعار الشركة */
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #B8860B; padding-bottom: 16px; margin-bottom: 20px; }
    .company-name { font-size: 22px; font-weight: 900; color: #B8860B; }
    .company-slogan { font-size: 11px; color: #888; margin-top: 3px; }
    .doc-title { text-align: left; }
    .doc-title h2 { font-size: 18px; font-weight: 900; color: #222; }
    .doc-title .date { font-size: 11px; color: #888; margin-top: 4px; }
    /* بيانات العميل */
    .customer-box { background: #FFF8E1; border: 1px solid #B8860B40; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
    .customer-name { font-size: 17px; font-weight: 900; color: #222; }
    .customer-phone { font-size: 12px; color: #666; margin-top: 3px; }
    .balance-badge { font-size: 15px; font-weight: 900; padding: 6px 14px; border-radius: 6px; }
    .balance-debit { background: #FFF3E0; color: #E65100; border: 1px solid #FFCC80; }
    .balance-credit { background: #E8F5E9; color: #2E7D32; border: 1px solid #A5D6A7; }
    .balance-zero { background: #F5F5F5; color: #757575; border: 1px solid #E0E0E0; }
    /* بطاقات الملخص */
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-bottom: 20px; }
    .card { background: #F8F8F8; border: 1px solid #E0E0E0; border-radius: 8px; padding: 10px 12px; text-align: center; }
    .card-label { font-size: 10px; color: #888; margin-bottom: 4px; }
    .card-value { font-size: 13px; font-weight: 900; color: #222; }
    .card-count { font-size: 10px; color: #aaa; margin-top: 2px; }
    /* الجدول */
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
    thead tr { background: #B8860B; color: #fff; }
    thead th { padding: 10px 8px; font-weight: 700; text-align: center; }
    thead th:first-child, thead th:nth-child(2), thead th:nth-child(3) { text-align: right; }
    tbody tr.even { background: #fff; }
    tbody tr.odd { background: #FAFAFA; }
    tbody tr:hover { background: #FFF8E1; }
    td { padding: 8px 8px; border-bottom: 1px solid #F0F0F0; vertical-align: middle; }
    td.num { text-align: center; font-variant-numeric: tabular-nums; }
    td.mono { font-family: monospace; font-size: 11px; color: #666; }
    td.bold { font-weight: 900; }
    td.debit { color: #C62828; }
    td.credit { color: #2E7D32; }
    td.credit-neg { color: #1565C0; }
    tfoot tr { background: #333; color: #fff; font-weight: 900; }
    tfoot td { padding: 10px 8px; }
    tfoot td.num { text-align: center; }
    /* ختم */
    .footer { margin-top: 30px; display: flex; justify-content: space-between; border-top: 1px dashed #ccc; padding-top: 16px; }
    .seal { text-align: center; }
    .seal-line { width: 160px; border-bottom: 1px solid #333; margin: 0 auto 6px; }
    .seal-label { font-size: 11px; color: #888; }
    @media print {
      body { background: #fff !important; }
      .page { padding: 15px 20px; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        <div class="company-name">${companyName}</div>
        <div class="company-slogan">${companySlogan}</div>
      </div>
      <div class="doc-title">
        <h2>كشف حساب عميل</h2>
        <div class="date">تاريخ الطباعة: ${today}</div>
      </div>
    </div>

    <div class="customer-box">
      <div>
        <div class="customer-name">${customerName}</div>
        ${customerPhone ? `<div class="customer-phone">📞 ${customerPhone}</div>` : ""}
      </div>
      <div class="balance-badge ${customerBalance > 0 ? 'balance-debit' : customerBalance < 0 ? 'balance-credit' : 'balance-zero'}">
        الرصيد: ${balanceLabel}
      </div>
    </div>

    <div class="cards">${cardsHtml}</div>

    ${rows.length === 0 ? '<p style="text-align:center;color:#aaa;padding:30px">لا توجد حركات مسجلة</p>' : `
    <table>
      <thead>
        <tr>
          <th>التاريخ</th>
          <th>البيان</th>
          <th>المرجع</th>
          <th>مدين (علينا)</th>
          <th>دائن (له)</th>
          <th>الرصيد</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot>
        <tr>
          <td colspan="3">الإجمالي</td>
          <td class="num debit">${totalDebit.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}</td>
          <td class="num credit">${totalCredit.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}</td>
          <td class="num">${balanceLabel}</td>
        </tr>
      </tfoot>
    </table>`}

    <div class="footer">
      <div class="seal"><div class="seal-line"></div><div class="seal-label">المحاسب</div></div>
      <div class="seal"><div class="seal-line"></div><div class="seal-label">المدير</div></div>
      <div class="seal"><div class="seal-line"></div><div class="seal-label">العميل</div></div>
    </div>
  </div>
  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=1000,height=700");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

/* ─── دالة واتساب ─── */
function openWhatsApp(phone: string, customerName: string, balance: number, rowCount: number) {
  const balanceText = balance > 0 ? `${Math.abs(balance).toFixed(2)} ج.م مدين` : balance < 0 ? `${Math.abs(balance).toFixed(2)} ج.م دائن` : "متسوّى";
  const text = `مرحباً ${customerName}،\n\nكشف حسابك لدينا:\n• عدد الحركات: ${rowCount}\n• الرصيد الحالي: ${balanceText}\n\nللتواصل والاستفسار، يرجى التواصل معنا.\nشكراً لتعاملكم معنا 🌟`;
  const cleanPhone = phone.replace(/[^0-9]/g, "");
  const intlPhone = cleanPhone.startsWith("0") ? "2" + cleanPhone : cleanPhone;
  window.open(`https://wa.me/${intlPhone}?text=${encodeURIComponent(text)}`, "_blank");
}

/* ─── كشف الحساب ─── */
function CustomerStatementModal({ customerId, customerName, customerPhone, customerBalance, onClose }: {
  customerId: number;
  customerName: string;
  customerPhone: string;
  customerBalance: number;
  onClose: () => void;
}) {
  const { data: allSales = [] } = useGetSales();
  const { data: allPurchases = [] } = useGetPurchases();
  const { data: receiptVouchers = [] } = useQuery<ReceiptVoucher[]>({
    queryKey: ["/api/receipt-vouchers"],
    queryFn: () => fetch(api("/api/receipt-vouchers")).then(r => { if (!r.ok) throw new Error("خطأ في جلب البيانات"); return r.json(); }),
  });
  const { data: paymentVouchers = [] } = useQuery<PaymentVoucher[]>({
    queryKey: ["/api/payment-vouchers"],
    queryFn: () => fetch(api("/api/payment-vouchers")).then(r => { if (!r.ok) throw new Error("خطأ في جلب البيانات"); return r.json(); }),
  });
  const { data: salesReturns = [] } = useQuery<SaleReturn[]>({
    queryKey: ["/api/sales-returns"],
    queryFn: () => fetch(api("/api/sales-returns")).then(r => { if (!r.ok) throw new Error("خطأ في جلب البيانات"); return r.json(); }),
  });

  const sales = allSales.filter(s => s.customer_id === customerId || s.customer_name === customerName);
  const purchases = allPurchases.filter(p => p.customer_id === customerId || p.customer_name === customerName);
  const receipts = receiptVouchers.filter(v => v.customer_id === customerId);
  const payments = paymentVouchers.filter(v => v.customer_id === customerId);
  const returns_ = salesReturns.filter(r => r.customer_id === customerId);

  const totalSales = sales.reduce((s, v) => s + Number(v.total_amount), 0);
  const totalPurchases = purchases.reduce((s, v) => s + Number(v.total_amount), 0);
  const totalReceipts = receipts.reduce((s, v) => s + Number(v.amount), 0);
  const totalPayments = payments.reduce((s, v) => s + Number(v.amount), 0);
  const totalReturns = returns_.reduce((s, v) => s + Number(v.total_amount), 0);

  type TxRow = { date: string; type: string; label: string; ref: string; debit: number; credit: number; };
  const rows: TxRow[] = [];

  sales.forEach(s => rows.push({ date: s.created_at, type: "sale", label: "فاتورة مبيعات", ref: s.invoice_no, debit: Number(s.remaining_amount), credit: 0 }));
  purchases.forEach(p => rows.push({ date: p.created_at, type: "purchase", label: "فاتورة مشتريات", ref: p.invoice_no ?? `P-${p.id}`, debit: 0, credit: Number(p.remaining_amount ?? p.total_amount) }));
  receipts.forEach(v => rows.push({ date: v.date ?? v.created_at, type: "receipt", label: "سند قبض", ref: v.voucher_no, debit: 0, credit: Number(v.amount) }));
  payments.forEach(v => rows.push({ date: v.date ?? v.created_at, type: "payment", label: "سند توريد", ref: v.voucher_no, debit: Number(v.amount), credit: 0 }));
  returns_.filter(r => r.refund_type !== "cash").forEach(r => rows.push({ date: r.date ?? r.created_at, type: "return_credit", label: "مرتجع (خصم رصيد)", ref: r.return_no, debit: 0, credit: Number(r.total_amount) }));
  returns_.filter(r => r.refund_type === "cash").forEach(r => rows.push({ date: r.date ?? r.created_at, type: "return_cash", label: "مرتجع (نقدي)", ref: r.return_no, debit: 0, credit: 0 }));

  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let running = 0;
  const rowsWithBalance = rows.map(r => { running += r.debit - r.credit; return { ...r, balance: running }; });

  const typeConfig: Record<string, { color: string; bg: string; icon: string }> = {
    sale:          { color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20",   icon: "↑" },
    purchase:      { color: "text-purple-400",  bg: "bg-purple-500/10 border-purple-500/20", icon: "↓" },
    receipt:       { color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", icon: "→" },
    payment:       { color: "text-orange-400",  bg: "bg-orange-500/10 border-orange-500/20", icon: "←" },
    return_credit: { color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/20",     icon: "↩" },
    return_cash:   { color: "text-pink-400",    bg: "bg-pink-500/10 border-pink-500/20",     icon: "↩" },
  };

  const summaryCards = [
    { label: "المبيعات",  value: totalSales,     count: sales.length },
    { label: "القبض",     value: totalReceipts,  count: receipts.length },
    ...(totalPurchases > 0 ? [{ label: "المشتريات", value: totalPurchases, count: purchases.length }] : []),
    ...(totalPayments > 0  ? [{ label: "التوريد",   value: totalPayments,  count: payments.length  }] : []),
    ...(totalReturns > 0   ? [{ label: "المرتجعات", value: totalReturns,   count: returns_.length  }] : []),
  ];

  // قراءة اسم الشركة من الإعدادات المحلية
  const settings = JSON.parse(localStorage.getItem("halal_erp_settings") || "{}");
  const companyName = settings.companyName || "Halal Tech";
  const companySlogan = settings.companySlogan || "";

  const handlePrint = () => {
    printCustomerStatement({ customerName, customerPhone, customerBalance, rows: rowsWithBalance, summaryCards, companyName, companySlogan });
  };

  const handleWhatsApp = () => {
    if (!customerPhone) { alert("لا يوجد رقم هاتف لهذا العميل"); return; }
    openWhatsApp(customerPhone, customerName, customerBalance, rowsWithBalance.length);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm modal-overlay">
      <div className="glass-panel rounded-3xl p-0 w-full max-w-4xl border border-white/10 shadow-2xl max-h-[92vh] overflow-hidden flex flex-col">

        {/* ─── رأس الكشف ─── */}
        <div className="flex justify-between items-center p-6 border-b border-white/10 bg-white/5 flex-shrink-0">
          <div>
            <h3 className="text-2xl font-black text-white">كشف حساب</h3>
            <p className="text-amber-400 font-bold text-lg mt-0.5">{customerName}</p>
            {customerPhone && <p className="text-white/40 text-xs mt-0.5">📞 {customerPhone}</p>}
            <p className={`text-sm mt-1 font-semibold ${customerBalance > 0 ? 'text-yellow-400' : customerBalance < 0 ? 'text-orange-400' : 'text-white/40'}`}>
              الرصيد:{" "}
              {customerBalance > 0 ? `${formatCurrency(customerBalance)} — العميل مدين`
                : customerBalance < 0 ? `${formatCurrency(Math.abs(customerBalance))} — دائن للعميل`
                : "متسوّى"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* ─── زر واتساب ─── */}
            <button
              onClick={handleWhatsApp}
              title={customerPhone ? "إرسال ملخص الكشف على واتساب" : "لا يوجد رقم هاتف مسجل"}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border transition-all ${customerPhone ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30 border-green-500/30' : 'bg-white/5 text-white/20 border-white/10 cursor-not-allowed'}`}
            >
              <MessageCircle className="w-4 h-4" />
              واتساب
            </button>
            {/* ─── زر PDF ─── */}
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 px-3 py-2 rounded-xl text-sm font-bold border border-blue-500/30 transition-all"
            >
              <Printer className="w-4 h-4" />
              PDF / طباعة
            </button>
            <button onClick={onClose} className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
              <X className="w-5 h-5 text-white/70" />
            </button>
          </div>
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
                <p className="text-purple-400 text-xs mb-1 flex items-center justify-center gap-1"><TrendingDown className="w-3 h-3" /> مشترياتنا منه</p>
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
            <div className={`${customerBalance > 0 ? 'bg-red-500/10 border-red-500/20' : customerBalance < 0 ? 'bg-blue-500/10 border-blue-500/20' : 'bg-white/5 border-white/10'} border rounded-2xl p-3 text-center`}>
              <p className={`text-xs mb-1 ${customerBalance > 0 ? 'text-red-400' : customerBalance < 0 ? 'text-blue-400' : 'text-white/40'}`}>الرصيد الصافي</p>
              <p className={`font-black ${customerBalance > 0 ? 'text-red-400' : customerBalance < 0 ? 'text-blue-400' : 'text-white/40'}`}>{formatCurrency(Math.abs(customerBalance))}</p>
              <p className="text-white/40 text-xs">{customerBalance > 0 ? 'عليه' : customerBalance < 0 ? 'دائن له' : 'متسوّى'}</p>
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
                    <th className="p-3 text-white/60 font-semibold text-center">مدين</th>
                    <th className="p-3 text-white/60 font-semibold text-center">دائن</th>
                    <th className="p-3 text-white/60 font-semibold text-center">الرصيد</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsWithBalance.map((r, i) => {
                    const cfg = typeConfig[r.type] || typeConfig["sale"];
                    return (
                      <tr key={i} className="border-b border-white/5 erp-table-row">
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
                          <span className={r.balance > 0 ? 'text-yellow-400' : r.balance < 0 ? 'text-blue-400' : 'text-white/40'}>
                            {r.balance !== 0
                              ? `${formatCurrency(Math.abs(r.balance))} ${r.balance > 0 ? 'عليه ↑' : 'دائن ↓'}`
                              : 'صفر'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-white/5 border-t border-white/10">
                  <tr>
                    <td colSpan={3} className="p-3 text-white/60 font-bold text-right">الإجمالي</td>
                    <td className="p-3 text-center font-black text-amber-400">{formatCurrency(rowsWithBalance.reduce((s, r) => s + r.debit, 0))}</td>
                    <td className="p-3 text-center font-black text-emerald-400">{formatCurrency(rowsWithBalance.reduce((s, r) => s + r.credit, 0))}</td>
                    <td className="p-3 text-center font-black">
                      <span className={customerBalance > 0 ? 'text-yellow-400' : customerBalance < 0 ? 'text-blue-400' : 'text-white/40'}>
                        {formatCurrency(Math.abs(customerBalance))} {customerBalance > 0 ? 'عليه' : customerBalance < 0 ? 'دائن' : ''}
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
  const { data: safes = [] } = useGetSettingsSafes();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showReceipt, setShowReceipt] = useState<{ id: number; name: string; balance: number } | null>(null);
  const [showStatement, setShowStatement] = useState<{ id: number; name: string; phone: string; balance: number } | null>(null);
  const [formData, setFormData] = useState({ name: "", phone: "", balance: 0 });
  const [receiptData, setReceiptData] = useState({ amount: "", notes: "", safe_id: "" });

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

  // سند القبض يستخدم مسار receipt-vouchers المباشر
  const receiptMutation = useMutation({
    mutationFn: async (data: { customer_id: number; customer_name: string; safe_id: string; amount: string; notes: string }) => {
      const r = await fetch(api("/api/receipt-vouchers"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: data.customer_id,
          customer_name: data.customer_name,
          safe_id: parseInt(data.safe_id),
          amount: parseFloat(data.amount),
          notes: data.notes || null,
          date: new Date().toISOString().split("T")[0],
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "خطأ في سند القبض");
      return j;
    },
    onSuccess: () => {
      toast({ title: "✅ تم تسجيل سند القبض بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/receipt-vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/safes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setShowReceipt(null);
      setReceiptData({ amount: "", notes: "", safe_id: "" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleReceipt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!showReceipt) return;
    if (!receiptData.safe_id) { toast({ title: "اختر الخزينة", variant: "destructive" }); return; }
    const amt = parseFloat(receiptData.amount);
    if (!amt || amt <= 0) { toast({ title: "أدخل مبلغاً صحيحاً", variant: "destructive" }); return; }
    receiptMutation.mutate({
      customer_id: showReceipt.id,
      customer_name: showReceipt.name,
      safe_id: receiptData.safe_id,
      amount: receiptData.amount,
      notes: receiptData.notes,
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
        <div className="flex items-center gap-2">
          <button onClick={() => exportCustomersExcel(customers)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30 transition-all whitespace-nowrap">
            <FileDown className="w-4 h-4" /> Excel
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2 whitespace-nowrap">
            <Plus className="w-5 h-5" /> إضافة عميل
          </button>
        </div>
      </div>

      {/* كشف الحساب */}
      {showStatement && (
        <CustomerStatementModal
          customerId={showStatement.id}
          customerName={showStatement.name}
          customerPhone={showStatement.phone}
          customerBalance={showStatement.balance}
          onClose={() => setShowStatement(null)}
        />
      )}

      {/* إضافة عميل */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm modal-overlay">
          <form onSubmit={handleAdd} className="glass-panel rounded-3xl p-8 w-full max-w-md border border-white/10">
            <h3 className="text-2xl font-bold text-white mb-6">عميل جديد</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-white/70 text-sm mb-1">اسم العميل *</label>
                <input required type="text" className="glass-input" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-1">رقم الهاتف</label>
                <input type="text" className="glass-input" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="01xxxxxxxxx" />
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-1">رصيد ابتدائي (عليه)</label>
                <input type="number" step="0.01" className="glass-input" value={formData.balance || ''} onChange={e => setFormData({...formData, balance: parseFloat(e.target.value) || 0})} />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm modal-overlay">
          <form onSubmit={handleReceipt} className="glass-panel rounded-3xl p-8 w-full max-w-md border border-white/10 space-y-5">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-bold text-white">سند قبض</h3>
                <p className="text-white/50 text-sm mt-1">استلام مبلغ من <span className="text-amber-400 font-bold">{showReceipt.name}</span></p>
              </div>
              <button type="button" onClick={() => setShowReceipt(null)} className="p-2 rounded-xl bg-white/10 hover:bg-white/20">
                <X className="w-4 h-4 text-white/60" />
              </button>
            </div>

            {/* رصيد العميل الحالي */}
            <div className={`rounded-xl px-4 py-2.5 border text-sm font-bold flex items-center justify-between ${showReceipt.balance > 0 ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : showReceipt.balance < 0 ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-white/5 border-white/10 text-white/40'}`}>
              <span>الرصيد الحالي:</span>
              <span>
                {showReceipt.balance > 0 ? `${formatCurrency(showReceipt.balance)} عليه`
                  : showReceipt.balance < 0 ? `${formatCurrency(Math.abs(showReceipt.balance))} دائن له`
                  : "متسوّى"}
              </span>
            </div>

            {showReceipt.balance <= 0 && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2 text-xs text-blue-300">
                ℹ️ رصيد العميل صفر أو دائن — القبض سيجعل رصيده دائناً (سنكون مدينين له بهذا المبلغ)
              </div>
            )}

            <div>
              <label className="block text-white/70 text-sm mb-1">الخزينة المستلِمة *</label>
              <select required className="glass-input w-full appearance-none" value={receiptData.safe_id}
                onChange={e => setReceiptData(d => ({ ...d, safe_id: e.target.value }))}>
                <option value="" className="bg-gray-900">-- اختر خزينة --</option>
                {safes.map(s => (
                  <option key={s.id} value={s.id} className="bg-gray-900">
                    {s.name} ({formatCurrency(Number(s.balance))})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-white/70 text-sm mb-1">المبلغ المستلم *</label>
              <input required type="number" step="0.01" min="0.01" className="glass-input text-xl font-bold"
                value={receiptData.amount} onChange={e => setReceiptData(d => ({ ...d, amount: e.target.value }))}
                placeholder="0.00" />
              {receiptData.amount && (
                <p className="text-xs text-white/40 mt-1">
                  الرصيد بعد القبض:{" "}
                  <span className={showReceipt.balance - parseFloat(receiptData.amount) < 0 ? 'text-blue-400 font-bold' : 'text-amber-400 font-bold'}>
                    {formatCurrency(Math.abs(showReceipt.balance - parseFloat(receiptData.amount)))}
                    {showReceipt.balance - parseFloat(receiptData.amount) > 0 ? " عليه" : showReceipt.balance - parseFloat(receiptData.amount) < 0 ? " دائن له" : " متسوّى"}
                  </span>
                </p>
              )}
            </div>

            <div>
              <label className="block text-white/70 text-sm mb-1">بيان (اختياري)</label>
              <input type="text" className="glass-input" placeholder="دفعة على الحساب..."
                value={receiptData.notes} onChange={e => setReceiptData(d => ({ ...d, notes: e.target.value }))} />
            </div>

            <div className="flex gap-4">
              <button type="submit" disabled={receiptMutation.isPending}
                className="flex-1 bg-emerald-500 text-white py-3 rounded-xl font-bold hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2">
                <Vault className="w-4 h-4" />
                {receiptMutation.isPending ? "جاري الحفظ..." : "تأكيد القبض"}
              </button>
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
                <TableSkeleton cols={4} rows={5} />
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} className="p-12 text-center text-white/40">لا يوجد عملاء</td></tr>
              ) : (
                filtered.map(customer => (
                  <tr key={customer.id} className="border-b border-white/5 erp-table-row">
                    <td className="p-4 font-bold text-white">{customer.name}</td>
                    <td className="p-4 text-white/60">{customer.phone || '-'}</td>
                    <td className="p-4 font-bold">
                      {Number(customer.balance) > 0 ? (
                        <span className="text-yellow-400">
                          {formatCurrency(Number(customer.balance))}
                          <span className="text-xs font-normal text-white/40 mr-1">عليه</span>
                        </span>
                      ) : Number(customer.balance) < 0 ? (
                        <span className="text-blue-400">
                          {formatCurrency(Math.abs(Number(customer.balance)))}
                          <span className="text-xs font-normal text-white/40 mr-1">دائن له</span>
                        </span>
                      ) : (
                        <span className="text-white/30">متسوّى</span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setShowStatement({ id: customer.id, name: customer.name, phone: customer.phone || "", balance: Number(customer.balance) })}
                          className="flex items-center gap-1.5 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors border border-blue-500/30"
                        >
                          <FileText className="w-3.5 h-3.5" /> كشف حساب
                        </button>
                        <button
                          onClick={() => {
                            setReceiptData({ amount: "", notes: "", safe_id: "" });
                            setShowReceipt({ id: customer.id, name: customer.name, balance: Number(customer.balance) });
                          }}
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
