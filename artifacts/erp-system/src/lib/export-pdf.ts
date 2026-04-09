function getSettings(): { companyName: string; phone: string; address: string } {
  try {
    const raw = localStorage.getItem("halal_erp_settings");
    if (raw) {
      const p = JSON.parse(raw);
      return { companyName: p.companyName ?? "هالال تك", phone: p.phone ?? "", address: p.address ?? "" };
    }
  } catch {}
  return { companyName: "هالال تك", phone: "", address: "" };
}

function getCurrencySymbol(): string {
  try {
    const raw = localStorage.getItem("halal_erp_settings");
    if (raw) {
      const p = JSON.parse(raw);
      const map: Record<string, string> = { EGP: "ج.م", SAR: "ر.س", AED: "د.إ", USD: "$", KWD: "د.ك", BHD: "د.ب" };
      return map[p.currency] ?? "ج.م";
    }
  } catch {}
  return "ج.م";
}

function fmtMoney(n: number | null | undefined): string {
  const sym = getCurrencySymbol();
  return `${Number(n ?? 0).toFixed(2)} ${sym}`;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });
}

function payLabel(t: string): string {
  return ({ cash: "نقدي", credit: "آجل", partial: "جزئي" })[t] ?? t;
}

function statusLabel(s: string): string {
  return ({ paid: "مدفوع", partial: "جزئي", pending: "معلق", unpaid: "غير مدفوع" })[s] ?? s;
}

const PRINT_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Cairo', 'Arial', sans-serif; direction: rtl; background: white; color: #111827; font-size: 13px; }
  .page { padding: 28px 32px; max-width: 960px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #d97706; }
  .company-name { font-size: 20px; font-weight: 900; color: #1a1a1a; }
  .company-info { font-size: 11px; color: #6b7280; margin-top: 3px; }
  .report-info { text-align: left; }
  .report-title { font-size: 17px; font-weight: 900; color: #d97706; }
  .report-date { font-size: 11px; color: #6b7280; margin-top: 3px; }
  .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 20px; }
  .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 14px; background: #fafafa; }
  .card-label { font-size: 10px; color: #6b7280; margin-bottom: 3px; }
  .card-value { font-size: 15px; font-weight: 900; color: #111827; }
  .card-value.green { color: #059669; }
  .card-value.red { color: #dc2626; }
  .card-value.amber { color: #d97706; }
  .section-title { font-size: 13px; font-weight: 700; margin: 18px 0 8px; padding: 5px 10px; background: #fef3c7; border-right: 3px solid #d97706; color: #92400e; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 12px; }
  thead th { background: #f3f4f6; padding: 8px 12px; text-align: right; font-weight: 700; color: #374151; border-bottom: 1px solid #e5e7eb; }
  tbody td { padding: 7px 12px; text-align: right; border-bottom: 1px solid #f3f4f6; color: #374151; }
  tbody tr:nth-child(even) { background: #fafafa; }
  tfoot td { padding: 8px 12px; text-align: right; font-weight: 700; background: #f3f4f6; border-top: 2px solid #e5e7eb; color: #111827; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; }
  .badge-green { background: #d1fae5; color: #065f46; }
  .badge-red { background: #fee2e2; color: #991b1b; }
  .badge-yellow { background: #fef3c7; color: #92400e; }
  .badge-blue { background: #dbeafe; color: #1e40af; }
  .customer-info { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 18px; margin-bottom: 18px; background: #fafafa; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .info-item label { font-size: 10px; color: #6b7280; display: block; margin-bottom: 2px; }
  .info-item span { font-size: 13px; font-weight: 700; color: #111827; }
  .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 10px; color: #9ca3af; }
  .no-data { text-align: center; padding: 12px; color: #9ca3af; font-size: 12px; background: #f9fafb; border-radius: 6px; margin-bottom: 10px; }
  @media print {
    body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    @page { margin: 12mm 15mm; size: A4; }
  }
`;

function buildWindow(title: string, bodyHtml: string): void {
  const s = getSettings();
  const now = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

  const html = `<!DOCTYPE html><html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
  <style>${PRINT_STYLES}</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="company-name">${s.companyName}</div>
      ${s.phone ? `<div class="company-info">📞 ${s.phone}</div>` : ""}
      ${s.address ? `<div class="company-info">📍 ${s.address}</div>` : ""}
    </div>
    <div class="report-info">
      <div class="report-title">${title}</div>
      <div class="report-date">تاريخ الطباعة: ${now}</div>
    </div>
  </div>
  ${bodyHtml}
  <div class="footer">نظام هالال تك ERP &bull; ${now}</div>
</div>
<script>
  document.fonts.ready.then(function() { setTimeout(function() { window.print(); }, 600); });
</script>
</body></html>`;

  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) { alert("يرجى السماح بالنوافذ المنبثقة في المتصفح ثم أعد المحاولة"); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

/* ─── Sales PDF ───────────────────────────────────────────── */
export interface SaleForPdf {
  invoice_no: string;
  customer_name?: string | null;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  payment_type: string;
  status: string;
  created_at: string;
}

export function printSalesReport(sales: SaleForPdf[]) {
  const total = sales.reduce((s, v) => s + Number(v.total_amount), 0);
  const paid = sales.reduce((s, v) => s + Number(v.paid_amount), 0);
  const remaining = sales.reduce((s, v) => s + Number(v.remaining_amount), 0);

  const rows = sales.map(s => `
    <tr>
      <td><strong>${s.invoice_no}</strong></td>
      <td>${s.customer_name ?? "عميل نقدي"}</td>
      <td><strong>${fmtMoney(Number(s.total_amount))}</strong></td>
      <td style="color:#059669;font-weight:700">${fmtMoney(Number(s.paid_amount))}</td>
      <td style="color:${Number(s.remaining_amount) > 0 ? "#dc2626" : "#9ca3af"};font-weight:700">${Number(s.remaining_amount) > 0 ? fmtMoney(Number(s.remaining_amount)) : "—"}</td>
      <td><span class="badge badge-${s.payment_type === "cash" ? "green" : s.payment_type === "credit" ? "red" : "yellow"}">${payLabel(s.payment_type)}</span></td>
      <td><span class="badge badge-${s.status === "paid" ? "green" : s.status === "partial" ? "yellow" : "red"}">${statusLabel(s.status)}</span></td>
      <td style="color:#6b7280;font-size:11px">${fmtDate(s.created_at)}</td>
    </tr>`).join("");

  const body = `
    <div class="summary">
      <div class="card"><div class="card-label">إجمالي المبيعات</div><div class="card-value">${fmtMoney(total)}</div></div>
      <div class="card"><div class="card-label">المحصَّل</div><div class="card-value green">${fmtMoney(paid)}</div></div>
      <div class="card"><div class="card-label">الديون المتبقية</div><div class="card-value red">${fmtMoney(remaining)}</div></div>
      <div class="card"><div class="card-label">عدد الفواتير</div><div class="card-value">${sales.length}</div></div>
    </div>
    <table>
      <thead><tr>
        <th>رقم الفاتورة</th><th>العميل</th><th>الإجمالي</th><th>المدفوع</th>
        <th>المتبقي</th><th>طريقة الدفع</th><th>الحالة</th><th>التاريخ</th>
      </tr></thead>
      <tbody>${rows.length ? rows : '<tr><td colspan="8" class="no-data">لا توجد فواتير</td></tr>'}</tbody>
      <tfoot><tr>
        <td colspan="2">الإجمالي (${sales.length} فاتورة)</td>
        <td>${fmtMoney(total)}</td>
        <td style="color:#059669">${fmtMoney(paid)}</td>
        <td style="color:#dc2626">${fmtMoney(remaining)}</td>
        <td colspan="3"></td>
      </tr></tfoot>
    </table>`;

  buildWindow("تقرير المبيعات", body);
}

/* ─── Purchases PDF ───────────────────────────────────────── */
export interface PurchaseForPdf {
  invoice_no: string;
  supplier_name?: string | null;
  customer_name?: string | null;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  payment_type: string;
  status: string;
  created_at: string;
}

export function printPurchasesReport(purchases: PurchaseForPdf[]) {
  const total = purchases.reduce((s, v) => s + Number(v.total_amount), 0);
  const paid = purchases.reduce((s, v) => s + Number(v.paid_amount), 0);
  const remaining = purchases.reduce((s, v) => s + Number(v.remaining_amount), 0);

  const rows = purchases.map(p => `
    <tr>
      <td><strong>${p.invoice_no}</strong></td>
      <td>${p.supplier_name ?? "—"}</td>
      <td>${p.customer_name ?? "—"}</td>
      <td><strong>${fmtMoney(Number(p.total_amount))}</strong></td>
      <td style="color:#059669;font-weight:700">${fmtMoney(Number(p.paid_amount))}</td>
      <td style="color:${Number(p.remaining_amount) > 0 ? "#dc2626" : "#9ca3af"};font-weight:700">${Number(p.remaining_amount) > 0 ? fmtMoney(Number(p.remaining_amount)) : "—"}</td>
      <td><span class="badge badge-${p.payment_type === "cash" ? "green" : p.payment_type === "credit" ? "red" : "yellow"}">${payLabel(p.payment_type)}</span></td>
      <td style="color:#6b7280;font-size:11px">${fmtDate(p.created_at)}</td>
    </tr>`).join("");

  const body = `
    <div class="summary">
      <div class="card"><div class="card-label">إجمالي المشتريات</div><div class="card-value">${fmtMoney(total)}</div></div>
      <div class="card"><div class="card-label">المدفوع</div><div class="card-value green">${fmtMoney(paid)}</div></div>
      <div class="card"><div class="card-label">المتبقي</div><div class="card-value amber">${fmtMoney(remaining)}</div></div>
      <div class="card"><div class="card-label">عدد الفواتير</div><div class="card-value">${purchases.length}</div></div>
    </div>
    <table>
      <thead><tr>
        <th>رقم الفاتورة</th><th>المورد</th><th>العميل</th><th>الإجمالي</th>
        <th>المدفوع</th><th>المتبقي</th><th>طريقة الدفع</th><th>التاريخ</th>
      </tr></thead>
      <tbody>${rows.length ? rows : '<tr><td colspan="8" class="no-data">لا توجد مشتريات</td></tr>'}</tbody>
      <tfoot><tr>
        <td colspan="3">الإجمالي (${purchases.length} فاتورة)</td>
        <td>${fmtMoney(total)}</td>
        <td style="color:#059669">${fmtMoney(paid)}</td>
        <td style="color:#dc2626">${fmtMoney(remaining)}</td>
        <td colspan="2"></td>
      </tr></tfoot>
    </table>`;

  buildWindow("تقرير المشتريات", body);
}

/* ─── Customer Statement PDF ──────────────────────────────── */
export interface CustomerForPdf {
  name: string;
  phone?: string | null;
  address?: string | null;
  balance: number;
}

export interface StatementSale {
  invoice_no: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  payment_type: string;
  status: string;
  created_at: string;
  items?: Array<{ product_name: string; quantity: number; unit_price: number; total_price: number }>;
}

export interface StatementReturn {
  return_no: string;
  total_amount: number;
  refund_type?: string | null;
  reason?: string | null;
  created_at: string;
}

export interface StatementVoucher {
  voucher_no: string;
  amount: number;
  safe_name: string;
  notes?: string | null;
  date: string;
}

export function printCustomerStatement(
  customer: CustomerForPdf,
  sales: StatementSale[],
  salesReturns: StatementReturn[],
  receiptVouchers: StatementVoucher[],
  depositVouchers: StatementVoucher[],
  paymentVouchers: StatementVoucher[],
) {
  const totalSales = sales.reduce((s, v) => s + Number(v.total_amount), 0);
  const totalPaid = sales.reduce((s, v) => s + Number(v.paid_amount), 0);
  const totalReturns = salesReturns.reduce((s, v) => s + Number(v.total_amount), 0);
  const totalReceipts = receiptVouchers.reduce((s, v) => s + Number(v.amount), 0);
  const totalDeposits = depositVouchers.reduce((s, v) => s + Number(v.amount), 0);
  const totalPayments = paymentVouchers.reduce((s, v) => s + Number(v.amount), 0);

  const salesRows = sales.map(s => `
    <tr>
      <td><strong style="color:#d97706">${s.invoice_no}</strong></td>
      <td>${fmtMoney(Number(s.total_amount))}</td>
      <td style="color:#059669;font-weight:700">${fmtMoney(Number(s.paid_amount))}</td>
      <td style="color:${Number(s.remaining_amount) > 0 ? "#dc2626" : "#9ca3af"};font-weight:700">${Number(s.remaining_amount) > 0 ? fmtMoney(Number(s.remaining_amount)) : "—"}</td>
      <td><span class="badge badge-${s.payment_type === "cash" ? "green" : s.payment_type === "credit" ? "red" : "yellow"}">${payLabel(s.payment_type)}</span></td>
      <td style="color:#6b7280;font-size:11px">${fmtDate(s.created_at)}</td>
    </tr>`).join("");

  const returnRows = salesReturns.map(r => `
    <tr>
      <td><strong style="color:#dc2626">${r.return_no}</strong></td>
      <td style="color:#dc2626;font-weight:700">${fmtMoney(Number(r.total_amount))}</td>
      <td>${r.refund_type === "cash" ? "نقدي" : "رصيد"}</td>
      <td style="color:#6b7280">${r.reason ?? "—"}</td>
      <td style="color:#6b7280;font-size:11px">${fmtDate(r.created_at)}</td>
    </tr>`).join("");

  const receiptRows = receiptVouchers.map(v => `
    <tr>
      <td><strong style="color:#059669">${v.voucher_no}</strong></td>
      <td style="color:#059669;font-weight:700">${fmtMoney(Number(v.amount))}</td>
      <td>${v.safe_name}</td>
      <td style="color:#6b7280">${v.notes ?? "—"}</td>
      <td style="color:#6b7280;font-size:11px">${fmtDate(v.date)}</td>
    </tr>`).join("");

  const depositRows = depositVouchers.map(v => `
    <tr>
      <td><strong style="color:#2563eb">${v.voucher_no}</strong></td>
      <td style="color:#2563eb;font-weight:700">${fmtMoney(Number(v.amount))}</td>
      <td>${v.safe_name}</td>
      <td style="color:#6b7280">${v.notes ?? "—"}</td>
      <td style="color:#6b7280;font-size:11px">${fmtDate(v.date)}</td>
    </tr>`).join("");

  const paymentRows = paymentVouchers.map(v => `
    <tr>
      <td><strong style="color:#7c3aed">${v.voucher_no}</strong></td>
      <td style="color:#7c3aed;font-weight:700">${fmtMoney(Number(v.amount))}</td>
      <td>${v.safe_name}</td>
      <td style="color:#6b7280">${v.notes ?? "—"}</td>
      <td style="color:#6b7280;font-size:11px">${fmtDate(v.date)}</td>
    </tr>`).join("");

  const body = `
    <div class="customer-info">
      <div class="info-item"><label>اسم العميل</label><span>${customer.name}</span></div>
      <div class="info-item"><label>الهاتف</label><span>${customer.phone ?? "—"}</span></div>
      <div class="info-item"><label>الرصيد المستحق</label><span style="color:${Number(customer.balance) > 0 ? "#dc2626" : "#059669"}">${fmtMoney(Number(customer.balance))}</span></div>
    </div>

    <div class="summary">
      <div class="card"><div class="card-label">إجمالي المبيعات</div><div class="card-value">${fmtMoney(totalSales)}</div></div>
      <div class="card"><div class="card-label">المحصَّل (فواتير)</div><div class="card-value green">${fmtMoney(totalPaid)}</div></div>
      ${totalReturns > 0 ? `<div class="card"><div class="card-label">المرتجعات</div><div class="card-value red">${fmtMoney(totalReturns)}</div></div>` : ""}
      ${totalReceipts > 0 ? `<div class="card"><div class="card-label">سندات القبض</div><div class="card-value green">${fmtMoney(totalReceipts)}</div></div>` : ""}
      ${totalDeposits > 0 ? `<div class="card"><div class="card-label">سندات الإيداع</div><div class="card-value">${fmtMoney(totalDeposits)}</div></div>` : ""}
      ${totalPayments > 0 ? `<div class="card"><div class="card-label">سندات الصرف</div><div class="card-value red">${fmtMoney(totalPayments)}</div></div>` : ""}
      <div class="card"><div class="card-label">الرصيد المستحق</div><div class="card-value ${Number(customer.balance) > 0 ? "red" : "green"}">${fmtMoney(Number(customer.balance))}</div></div>
    </div>

    ${sales.length > 0 ? `
      <div class="section-title">فواتير المبيعات (${sales.length})</div>
      <table>
        <thead><tr><th>رقم الفاتورة</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>طريقة الدفع</th><th>التاريخ</th></tr></thead>
        <tbody>${salesRows}</tbody>
        <tfoot><tr>
          <td>الإجمالي</td>
          <td>${fmtMoney(totalSales)}</td>
          <td style="color:#059669">${fmtMoney(totalPaid)}</td>
          <td style="color:#dc2626">${fmtMoney(totalSales - totalPaid)}</td>
          <td colspan="2"></td>
        </tr></tfoot>
      </table>` : ""}

    ${salesReturns.length > 0 ? `
      <div class="section-title">المرتجعات (${salesReturns.length})</div>
      <table>
        <thead><tr><th>رقم المرتجع</th><th>المبلغ</th><th>نوع الاسترداد</th><th>السبب</th><th>التاريخ</th></tr></thead>
        <tbody>${returnRows}</tbody>
        <tfoot><tr>
          <td>الإجمالي</td>
          <td style="color:#dc2626">${fmtMoney(totalReturns)}</td>
          <td colspan="3"></td>
        </tr></tfoot>
      </table>` : ""}

    ${receiptVouchers.length > 0 ? `
      <div class="section-title">سندات القبض — مدفوعات العميل (${receiptVouchers.length})</div>
      <table>
        <thead><tr><th>رقم السند</th><th>المبلغ</th><th>الخزينة</th><th>بيان</th><th>التاريخ</th></tr></thead>
        <tbody>${receiptRows}</tbody>
        <tfoot><tr>
          <td>الإجمالي</td>
          <td style="color:#059669">${fmtMoney(totalReceipts)}</td>
          <td colspan="3"></td>
        </tr></tfoot>
      </table>` : ""}

    ${depositVouchers.length > 0 ? `
      <div class="section-title">سندات الإيداع (${depositVouchers.length})</div>
      <table>
        <thead><tr><th>رقم السند</th><th>المبلغ</th><th>الخزينة</th><th>بيان</th><th>التاريخ</th></tr></thead>
        <tbody>${depositRows}</tbody>
        <tfoot><tr>
          <td>الإجمالي</td>
          <td style="color:#2563eb">${fmtMoney(totalDeposits)}</td>
          <td colspan="3"></td>
        </tr></tfoot>
      </table>` : ""}

    ${paymentVouchers.length > 0 ? `
      <div class="section-title">سندات الصرف — مردودات للعميل (${paymentVouchers.length})</div>
      <table>
        <thead><tr><th>رقم السند</th><th>المبلغ</th><th>الخزينة</th><th>بيان</th><th>التاريخ</th></tr></thead>
        <tbody>${paymentRows}</tbody>
        <tfoot><tr>
          <td>الإجمالي</td>
          <td style="color:#7c3aed">${fmtMoney(totalPayments)}</td>
          <td colspan="3"></td>
        </tr></tfoot>
      </table>` : ""}

    ${sales.length === 0 && salesReturns.length === 0 && receiptVouchers.length === 0 && depositVouchers.length === 0 && paymentVouchers.length === 0
      ? '<div class="no-data">لا توجد حركات مالية لهذا العميل</div>'
      : ""}
  `;

  buildWindow(`كشف حساب — ${customer.name}`, body);
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  INVOICE PDF — shared styles
 * ───────────────────────────────────────────────────────────────────────────── */

const INVOICE_STYLES = `
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Cairo','Arial',sans-serif; direction:rtl; background:#fff; color:#111827; font-size:13px; }
  .inv { max-width:820px; margin:0 auto; padding:30px 36px; }
  .inv-head { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; }
  .co-name { font-size:22px; font-weight:900; color:#111; }
  .co-sub { font-size:11px; color:#6b7280; margin-top:3px; }
  .inv-meta { text-align:left; }
  .inv-title { font-size:18px; font-weight:900; color:#d97706; }
  .inv-no { font-size:14px; font-weight:700; color:#374151; margin-top:3px; }
  .inv-date { font-size:11px; color:#6b7280; margin-top:2px; }
  hr.gold { border:none; border-top:2px solid #d97706; margin:14px 0; }
  .party-box { background:#fafafa; border:1px solid #e5e7eb; border-radius:8px; padding:12px 16px; margin-bottom:16px; }
  .party-title { font-size:11px; color:#6b7280; font-weight:700; margin-bottom:6px; text-transform:uppercase; }
  .party-name { font-size:14px; font-weight:900; color:#111; }
  .party-phone { font-size:12px; color:#6b7280; margin-top:2px; }
  table.items { width:100%; border-collapse:collapse; margin:14px 0; }
  table.items thead th { background:#1f2937; color:#fff; padding:9px 12px; text-align:right; font-size:12px; font-weight:700; }
  table.items tbody td { padding:9px 12px; text-align:right; border-bottom:1px solid #f3f4f6; font-size:13px; }
  table.items tbody tr:nth-child(even) { background:#fafafa; }
  table.items tfoot td { background:#f9fafb; padding:10px 12px; font-weight:700; border-top:2px solid #e5e7eb; font-size:13px; }
  .totals { display:flex; justify-content:flex-start; margin-top:14px; }
  .totals-inner { min-width:260px; border:1px solid #e5e7eb; border-radius:10px; overflow:hidden; }
  .t-row { display:flex; justify-content:space-between; align-items:center; padding:8px 14px; border-bottom:1px solid #f3f4f6; font-size:13px; }
  .t-row.grand { background:#fef3c7; font-size:15px; font-weight:900; border-bottom:none; }
  .t-row.paid { color:#059669; font-weight:700; border-bottom:none; }
  .t-row.remaining { color:#dc2626; font-weight:700; }
  .foot-row { display:flex; justify-content:space-between; margin-top:18px; padding-top:14px; border-top:1px solid #e5e7eb; font-size:12px; color:#374151; }
  .badge { display:inline-block; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:700; }
  .badge-cash { background:#d1fae5; color:#065f46; }
  .badge-credit { background:#fee2e2; color:#991b1b; }
  .badge-partial { background:#fef3c7; color:#92400e; }
  .thank { text-align:center; margin-top:20px; padding:12px; font-size:13px; color:#6b7280; border-top:1px dashed #e5e7eb; }
  @media print {
    body { -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; }
    @page { margin:10mm 12mm; size:A4; }
  }
`;

function invoiceWindow(title: string, body: string): void {
  const win = window.open("", "_blank", "width=900,height=750");
  if (!win) { alert("يرجى السماح بالنوافذ المنبثقة في المتصفح"); return; }
  win.document.open();
  win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
<style>${INVOICE_STYLES}</style>
</head><body>${body}
<script>document.fonts.ready.then(function(){setTimeout(function(){window.print();},700);});<\/script>
</body></html>`);
  win.document.close();
}

/* ─── Sale Invoice ──────────────────────────────────────────────────────────── */

export interface FullSaleItem {
  id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface FullSaleData {
  invoice_no: string;
  customer_name: string | null;
  phone?: string | null;
  date: string | null;
  created_at: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  payment_type: string;
  status?: string;
  safe_name?: string | null;
  notes?: string | null;
  items: FullSaleItem[];
}

export function printSaleInvoice(sale: FullSaleData): void {
  const s  = getSettings();
  const sym = getCurrencySymbol();
  const dateStr = sale.date
    ? new Date(sale.date + "T12:00:00").toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })
    : fmtDate(sale.created_at);

  const rows = sale.items.map((it, i) => `<tr>
    <td>${i + 1}</td>
    <td style="font-weight:700">${it.product_name}</td>
    <td>${Number(it.quantity)}</td>
    <td>${Number(it.unit_price).toFixed(2)} ${sym}</td>
    <td style="font-weight:700;color:#d97706">${Number(it.total_price).toFixed(2)} ${sym}</td>
  </tr>`).join("");

  const subtotal = sale.items.reduce((s, i) => s + Number(i.total_price), 0);

  const body = `<div class="inv">
  <div class="inv-head">
    <div>
      <div class="co-name">${s.companyName}</div>
      ${s.phone ? `<div class="co-sub">📞 ${s.phone}</div>` : ""}
      ${s.address ? `<div class="co-sub">📍 ${s.address}</div>` : ""}
    </div>
    <div class="inv-meta">
      <div class="inv-title">فاتورة مبيعات</div>
      <div class="inv-no">رقم: ${sale.invoice_no}</div>
      <div class="inv-date">التاريخ: ${dateStr}</div>
    </div>
  </div>
  <hr class="gold">
  ${sale.customer_name ? `<div class="party-box">
    <div class="party-title">بيانات العميل</div>
    <div class="party-name">${sale.customer_name}</div>
    ${sale.phone ? `<div class="party-phone">📞 ${sale.phone}</div>` : ""}
  </div>` : ""}
  <table class="items">
    <thead><tr><th>#</th><th>المنتج</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr>
      <td colspan="4" style="text-align:right;color:#6b7280">الإجمالي الفرعي (${sale.items.length} صنف)</td>
      <td style="color:#d97706">${subtotal.toFixed(2)} ${sym}</td>
    </tr></tfoot>
  </table>
  <div class="totals">
    <div class="totals-inner">
      <div class="t-row grand"><span>الإجمالي الكلي</span><span>${Number(sale.total_amount).toFixed(2)} ${sym}</span></div>
      <div class="t-row paid"><span>المدفوع ✓</span><span>${Number(sale.paid_amount).toFixed(2)} ${sym}</span></div>
      ${Number(sale.remaining_amount) > 0 ? `<div class="t-row remaining"><span>المتبقي ⚠</span><span>${Number(sale.remaining_amount).toFixed(2)} ${sym}</span></div>` : ""}
    </div>
  </div>
  <div class="foot-row">
    <div>
      <div><strong>طريقة الدفع:</strong> <span class="badge badge-${sale.payment_type}">${payLabel(sale.payment_type)}</span></div>
      ${sale.safe_name ? `<div style="margin-top:4px"><strong>الخزينة:</strong> ${sale.safe_name}</div>` : ""}
      ${sale.notes ? `<div style="margin-top:4px"><strong>ملاحظات:</strong> ${sale.notes}</div>` : ""}
    </div>
    <div style="text-align:left;color:#9ca3af;font-size:11px">
      ${s.companyName}<br>تم الإنشاء: ${fmtDate(sale.created_at)}
    </div>
  </div>
  <div class="thank">🙏 شكراً لتعاملكم معنا — ${s.companyName}</div>
</div>`;

  invoiceWindow(sale.invoice_no, body);
}

/* ─── Purchase Invoice ──────────────────────────────────────────────────────── */

export interface FullPurchaseItem {
  id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface FullPurchaseData {
  invoice_no: string;
  supplier_name?: string | null;
  customer_name?: string | null;
  date?: string | null;
  created_at: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  payment_type: string;
  safe_name?: string | null;
  notes?: string | null;
  items: FullPurchaseItem[];
}

export function printPurchaseInvoice(purchase: FullPurchaseData): void {
  const s   = getSettings();
  const sym  = getCurrencySymbol();
  const party = purchase.supplier_name ?? purchase.customer_name ?? "—";
  const dateStr = purchase.date
    ? new Date(purchase.date + "T12:00:00").toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })
    : fmtDate(purchase.created_at);

  const rows = purchase.items.map((it, i) => `<tr>
    <td>${i + 1}</td>
    <td style="font-weight:700">${it.product_name}</td>
    <td>${Number(it.quantity)}</td>
    <td>${Number(it.unit_price).toFixed(2)} ${sym}</td>
    <td style="font-weight:700;color:#2563eb">${Number(it.total_price).toFixed(2)} ${sym}</td>
  </tr>`).join("");

  const subtotal = purchase.items.reduce((s, i) => s + Number(i.total_price), 0);

  const body = `<div class="inv">
  <div class="inv-head">
    <div>
      <div class="co-name">${s.companyName}</div>
      ${s.phone ? `<div class="co-sub">📞 ${s.phone}</div>` : ""}
      ${s.address ? `<div class="co-sub">📍 ${s.address}</div>` : ""}
    </div>
    <div class="inv-meta">
      <div class="inv-title" style="color:#2563eb">فاتورة مشتريات</div>
      <div class="inv-no">رقم: ${purchase.invoice_no}</div>
      <div class="inv-date">التاريخ: ${dateStr}</div>
    </div>
  </div>
  <hr style="border:none;border-top:2px solid #2563eb;margin:14px 0">
  ${party !== "—" ? `<div class="party-box">
    <div class="party-title">بيانات المورد</div>
    <div class="party-name">${party}</div>
  </div>` : ""}
  <table class="items">
    <thead><tr><th>#</th><th>المنتج</th><th>الكمية</th><th>سعر الشراء</th><th>الإجمالي</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr>
      <td colspan="4" style="text-align:right;color:#6b7280">إجمالي المشتريات (${purchase.items.length} صنف)</td>
      <td style="color:#2563eb">${subtotal.toFixed(2)} ${sym}</td>
    </tr></tfoot>
  </table>
  <div class="totals">
    <div class="totals-inner">
      <div class="t-row grand" style="background:#dbeafe"><span>إجمالي قيمة المشتريات</span><span>${Number(purchase.total_amount).toFixed(2)} ${sym}</span></div>
      <div class="t-row" style="color:#059669;font-weight:700"><span>المبلغ المدفوع ✓</span><span>${Number(purchase.paid_amount).toFixed(2)} ${sym}</span></div>
      ${Number(purchase.remaining_amount) > 0 ? `<div class="t-row remaining"><span>المتبقي للمورد ⚠</span><span>${Number(purchase.remaining_amount).toFixed(2)} ${sym}</span></div>` : ""}
    </div>
  </div>
  <div class="foot-row">
    <div>
      <div><strong>طريقة الدفع:</strong> <span class="badge badge-${purchase.payment_type}">${payLabel(purchase.payment_type)}</span></div>
      ${purchase.safe_name ? `<div style="margin-top:4px"><strong>الخزينة:</strong> ${purchase.safe_name}</div>` : ""}
      ${purchase.notes ? `<div style="margin-top:4px"><strong>ملاحظات:</strong> ${purchase.notes}</div>` : ""}
    </div>
    <div style="text-align:left;color:#9ca3af;font-size:11px">
      ${s.companyName}<br>تم التسجيل: ${fmtDate(purchase.created_at)}
    </div>
  </div>
  <div class="thank">📦 تم استلام البضاعة بنجاح — ${s.companyName}</div>
</div>`;

  invoiceWindow(purchase.invoice_no, body);
}

/* ─── P&L Report PDF ────────────────────────────────────────────────────────── */

export interface PLReportData {
  dateFrom: string;
  dateTo: string;
  total_revenue: number;
  total_cost: number;
  gross_profit: number;
  profit_margin: number;
  net_profit: number;
  total_expenses: number;
  invoice_count: number;
  item_count?: number;
  cash_sales?: number;
  credit_sales?: number;
  partial_sales?: number;
  return_amount?: number;
  by_product: Array<{ product_name: string; qty_sold: number; revenue: number; cost: number; profit: number }>;
  by_warehouse?: Array<{ warehouse_name: string; revenue: number; cost: number; gross_profit: number; invoice_count: number }>;
  by_expense_category?: Array<{ category: string; total: number }>;
}

const PL_STYLES = `
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Cairo','Arial',sans-serif; direction:rtl; background:#fff; color:#111827; font-size:13px; line-height:1.6; }
  .page { padding:28px 32px; max-width:900px; margin:0 auto; }

  /* ── Header ── */
  .pl-header { display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:14px; border-bottom:3px solid #111827; margin-bottom:22px; }
  .pl-company { font-size:20px; font-weight:900; color:#111827; }
  .pl-company-sub { font-size:11px; color:#6b7280; margin-top:3px; }
  .pl-title-block { text-align:left; }
  .pl-title { font-size:18px; font-weight:900; color:#111827; }
  .pl-subtitle { font-size:11px; color:#6b7280; margin-top:3px; }

  /* ── KPI boxes (3 only) ── */
  .kpi-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:24px; }
  .kpi-box  { border:1.5px solid #e5e7eb; border-radius:6px; padding:14px 16px; }
  .kpi-box.profit { border-color:#059669; background:#f0fdf4; }
  .kpi-box.loss   { border-color:#dc2626; background:#fef2f2; }
  .kpi-label { font-size:10px; color:#6b7280; font-weight:700; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.04em; }
  .kpi-value { font-size:18px; font-weight:900; }
  .kpi-value.green  { color:#059669; }
  .kpi-value.red    { color:#dc2626; }
  .kpi-value.dark   { color:#111827; }
  .kpi-sub { font-size:10px; color:#9ca3af; margin-top:3px; }

  /* ── Accounting Statement ── */
  .stmt { width:100%; border-collapse:collapse; margin-bottom:24px; }
  .stmt td { padding:10px 16px; border-bottom:1px solid #f3f4f6; font-size:13px; color:#374151; }
  .stmt .sec-hd td { background:#1f2937; color:#fff; font-size:11px; font-weight:700; padding:7px 16px; letter-spacing:0.04em; border-bottom:none; }
  .stmt .sub td:first-child { padding-right:34px; color:#6b7280; font-size:12px; }
  .stmt .total td { font-weight:800; font-size:14px; background:#f8fafc; border-top:2px solid #e5e7eb; border-bottom:2px solid #e5e7eb; }
  .stmt .gross td { font-weight:800; font-size:14px; background:#fef9ec; border-top:2px solid #e5e7eb; border-bottom:2px solid #e5e7eb; }
  .stmt .net-pos td { font-weight:900; font-size:15px; background:#f0fdf4; color:#059669; border-top:2px solid #059669; padding-top:13px; padding-bottom:13px; }
  .stmt .net-neg td { font-weight:900; font-size:15px; background:#fef2f2; color:#dc2626; border-top:2px solid #dc2626; padding-top:13px; padding-bottom:13px; }
  .num { text-align:left; font-variant-numeric:tabular-nums; font-weight:700; }
  .num.green  { color:#059669; }
  .num.red    { color:#dc2626; }
  .num.amber  { color:#d97706; }

  /* ── Branch table ── */
  .sec-hd-bar { font-size:12px; font-weight:800; padding:7px 12px; background:#f3f4f6; border-right:3px solid #374151; color:#111827; margin:18px 0 8px; }
  table.data { width:100%; border-collapse:collapse; font-size:12px; margin-bottom:14px; }
  table.data thead th { background:#374151; color:#fff; padding:8px 12px; text-align:right; font-weight:700; }
  table.data tbody td { padding:7px 12px; text-align:right; border-bottom:1px solid #f3f4f6; color:#374151; }
  table.data tbody tr:nth-child(even) { background:#fafafa; }
  table.data tfoot td { padding:8px 12px; font-weight:900; background:#f3f4f6; border-top:2px solid #e5e7eb; }

  /* ── Footer ── */
  .pl-footer { margin-top:24px; padding-top:10px; border-top:1px solid #e5e7eb; display:flex; justify-content:space-between; font-size:10px; color:#9ca3af; }

  @media print {
    body { -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; }
    @page { margin:12mm 14mm; size:A4; }
  }
`;

export function printPLReport(data: PLReportData): void {
  const s   = getSettings();
  const sym  = getCurrencySymbol();
  const m    = (n: number | null | undefined) => `${Number(n ?? 0).toFixed(2)} ${sym}`;
  const pct  = (n: number) => `${n.toFixed(1)}%`;
  const now  = new Date().toLocaleDateString("ar-EG", { year:"numeric", month:"long", day:"numeric", hour:"2-digit", minute:"2-digit" });

  const isProfit = data.net_profit >= 0;
  const grossMargin = data.total_revenue > 0 ? (data.gross_profit / data.total_revenue) * 100 : 0;
  const netMargin   = data.total_revenue > 0 ? (data.net_profit   / data.total_revenue) * 100 : 0;

  /* ── Top products ── */
  const topProducts = [...data.by_product].sort((a, b) => b.profit - a.profit).slice(0, 10);
  const _productRows = topProducts.map((p, i) => {
    const margin = p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0;
    const barW   = Math.max(0, Math.min(100, margin));
    return `<tr>
      <td>${i + 1}</td>
      <td style="font-weight:700">${p.product_name}</td>
      <td>${p.qty_sold}</td>
      <td class="num green">${m(p.revenue)}</td>
      <td class="num red">${m(p.cost)}</td>
      <td class="num ${p.profit >= 0 ? "green" : "red"}" style="font-weight:900">${m(p.profit)}</td>
      <td>
        <div style="font-size:11px;font-weight:700;color:${margin>=30?"#059669":margin>=15?"#d97706":"#dc2626"}">${pct(margin)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${barW}%;background:${margin>=30?"#059669":margin>=15?"#d97706":"#dc2626"}"></div></div>
      </td>
    </tr>`;
  }).join("");

  /* ── Branch table ── */
  const branches = (data.by_warehouse ?? []).filter(w => w.revenue > 0);
  const maxRev   = Math.max(...branches.map(b => b.revenue), 1);
  const _branchRows = branches.map(w => {
    const mg  = w.revenue > 0 ? (w.gross_profit / w.revenue) * 100 : 0;
    const barW = Math.round((w.revenue / maxRev) * 100);
    return `<tr>
      <td style="font-weight:700">${w.warehouse_name}</td>
      <td class="num">${m(w.revenue)}</td>
      <td class="num red">${m(w.cost)}</td>
      <td class="num ${w.gross_profit>=0?"green":"red"}" style="font-weight:900">${m(w.gross_profit)}</td>
      <td style="font-weight:700;color:${mg>=30?"#059669":mg>=15?"#d97706":"#dc2626"}">${pct(mg)}</td>
      <td>${w.invoice_count}</td>
      <td class="bar-cell"><div class="bar-track"><div class="bar-fill" style="width:${barW}%"></div></div></td>
    </tr>`;
  }).join("");

  /* ── Expense table ── */
  const expenses = data.by_expense_category ?? [];
  const _expRows  = expenses.map(e => {
    const pctE = data.total_expenses > 0 ? (e.total / data.total_expenses) * 100 : 0;
    return `<tr><td style="font-weight:600">${e.category}</td><td class="num">${m(e.total)}</td><td style="color:#6b7280">${pctE.toFixed(1)}%</td></tr>`;
  }).join("");

  /* ── Payment breakdown ── */
  const cashS    = data.cash_sales    ?? 0;
  const creditS  = data.credit_sales  ?? 0;
  const partialS = data.partial_sales ?? 0;
  const retAmt   = data.return_amount ?? 0;
  const _hasPayBreakdown = cashS + creditS + partialS + retAmt > 0;

  /* ── Build expense lines for statement ── */
  const expLines = expenses.slice(0, 8).map(e =>
    `<tr class="sub"><td>(−) ${e.category}</td><td class="num red">(${m(e.total)})</td></tr>`
  ).join("");
  const otherExpAmt = expenses.slice(8).reduce((s,e)=>s+e.total, 0);

  const html = `
<div class="page">

  <!-- Header -->
  <div class="pl-header">
    <div>
      <div class="pl-company">${s.companyName}</div>
      ${s.phone    ? `<div class="pl-company-sub">📞 ${s.phone}</div>` : ""}
      ${s.address  ? `<div class="pl-company-sub">📍 ${s.address}</div>` : ""}
    </div>
    <div class="pl-title-block">
      <div class="pl-title">قائمة الأرباح والخسائر</div>
      <div class="pl-subtitle">الفترة: ${data.dateFrom} — ${data.dateTo}</div>
    </div>
  </div>

  <!-- KPI Summary (3 only) -->
  <div class="kpi-grid">
    <div class="kpi-box">
      <div class="kpi-label">إجمالي المبيعات</div>
      <div class="kpi-value dark">${m(data.total_revenue)}</div>
      <div class="kpi-sub">${data.invoice_count} فاتورة</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">إجمالي المصروفات</div>
      <div class="kpi-value red">${m(data.total_expenses)}</div>
    </div>
    <div class="kpi-box ${isProfit?"profit":"loss"}">
      <div class="kpi-label">صافي الربح</div>
      <div class="kpi-value ${isProfit?"green":"red"}">${m(data.net_profit)}</div>
      <div class="kpi-sub">${pct(netMargin)}</div>
    </div>
  </div>

  <!-- Accounting Statement -->
  <table class="stmt">
    <!-- الإيرادات -->
    <tr class="sec-hd"><td colspan="2">الإيرادات</td></tr>
    <tr><td>إجمالي المبيعات</td><td class="num green">${m(data.total_revenue)}</td></tr>
    ${retAmt > 0 ? `<tr class="sub"><td>(−) مرتجعات المبيعات</td><td class="num red">(${m(retAmt)})</td></tr>
    <tr class="total"><td>صافي الإيرادات</td><td class="num">${m(data.total_revenue - retAmt)}</td></tr>` : ""}

    <!-- تكلفة البضاعة -->
    <tr class="sec-hd"><td colspan="2">تكلفة البضاعة المباعة</td></tr>
    <tr class="sub"><td>(−) تكلفة البضاعة المباعة</td><td class="num red">(${m(data.total_cost)})</td></tr>
    <tr class="gross">
      <td>= مجمل الربح</td>
      <td class="num ${data.gross_profit>=0?"amber":"red"}">${m(data.gross_profit)} <span style="font-size:11px;opacity:0.65">${pct(grossMargin)}</span></td>
    </tr>

    <!-- المصروفات -->
    <tr class="sec-hd"><td colspan="2">المصروفات التشغيلية</td></tr>
    ${expLines || (data.total_expenses > 0 ? `<tr class="sub"><td>(−) مصروفات تشغيلية</td><td class="num red">(${m(data.total_expenses)})</td></tr>` : `<tr><td colspan="2" style="color:#9ca3af;text-align:center;font-style:italic">لا توجد مصروفات</td></tr>`)}
    ${otherExpAmt > 0 ? `<tr class="sub"><td>(−) مصروفات أخرى</td><td class="num red">(${m(otherExpAmt)})</td></tr>` : ""}
    ${expenses.length > 0 ? `<tr class="total"><td>إجمالي المصروفات</td><td class="num red">(${m(data.total_expenses)})</td></tr>` : ""}

    <!-- صافي الربح -->
    <tr class="${isProfit?"net-pos":"net-neg"}">
      <td>= صافي الربح / الخسارة</td>
      <td class="num" style="font-size:16px">${m(data.net_profit)} <span style="font-size:11px;opacity:0.7">${pct(netMargin)}</span></td>
    </tr>
  </table>

  ${branches.length > 1 ? `
  <!-- Branch Comparison -->
  <div class="sec-hd-bar">مقارنة الفروع · ${branches.length} فروع</div>
  <table class="data">
    <thead><tr><th>الفرع</th><th>المبيعات</th><th>التكلفة</th><th>مجمل الربح</th><th>الهامش</th><th>الفواتير</th></tr></thead>
    <tbody>${branches.map(w => {
      const mg = w.revenue > 0 ? (w.gross_profit / w.revenue) * 100 : 0;
      return `<tr>
        <td style="font-weight:700">${w.warehouse_name}</td>
        <td>${m(w.revenue)}</td>
        <td style="color:#dc2626">${m(w.cost)}</td>
        <td style="font-weight:700;color:${w.gross_profit>=0?"#059669":"#dc2626"}">${m(w.gross_profit)}</td>
        <td>${mg.toFixed(1)}%</td>
        <td>${w.invoice_count}</td>
      </tr>`;
    }).join("")}</tbody>
    <tfoot><tr>
      <td>الإجمالي</td>
      <td>${m(branches.reduce((s,b)=>s+b.revenue,0))}</td>
      <td>${m(branches.reduce((s,b)=>s+b.cost,0))}</td>
      <td style="color:${branches.reduce((s,b)=>s+b.gross_profit,0)>=0?"#059669":"#dc2626"}">${m(branches.reduce((s,b)=>s+b.gross_profit,0))}</td>
      <td colspan="2"></td>
    </tr></tfoot>
  </table>` : ""}

  <!-- Footer -->
  <div class="pl-footer">
    <span>طُبع: ${now}</span>
    <span>عدد الفواتير: ${data.invoice_count}${data.item_count ? ` · ${data.item_count} صنف` : ""}</span>
    <span>نظام هالال تك ERP</span>
  </div>

</div>`;

  const win = window.open("", "_blank", "width=960,height=750");
  if (!win) { alert("يرجى السماح بالنوافذ المنبثقة ثم أعد المحاولة"); return; }
  win.document.open();
  win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8"><title>قائمة الأرباح والخسائر — ${s.companyName}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
  <style>${PL_STYLES}</style>
</head>
<body>${html}
<script>document.fonts.ready.then(()=>setTimeout(()=>window.print(),700));<\/script>
</body></html>`);
  win.document.close();
}

/* ── Balance Sheet PDF ─────────────────────────────────────────────────── */
export interface BalanceSheetPrintData {
  assets:      { cash: number; receivables: number; inventory: number; total: number };
  liabilities: { payables: number; total: number };
  equity:      { opening_capital: number; retained_earnings: number; total: number };
  total_liabilities_equity: number;
  balanced: boolean;
  as_of: string;
}

export function printBalanceSheet(data: BalanceSheetPrintData): void {
  const s   = getSettings();
  const sym = getCurrencySymbol();
  const m   = (n: number) => `${Number(n ?? 0).toFixed(2)} ${sym}`;
  const now = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const asOf = new Date(data.as_of).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });

  const retainedIsPos = data.equity.retained_earnings >= 0;
  const eqIsPos       = data.equity.total >= 0;
  const eqColor       = eqIsPos ? "#059669" : "#dc2626";
  const eqBg          = eqIsPos ? "#f0fdf4"  : "#fef2f2";
  const eqBdr         = eqIsPos ? "#059669"  : "#dc2626";

  const html = `
<div class="page">
  <div class="pl-header">
    <div>
      <div class="pl-company">${s.companyName}</div>
      ${s.phone   ? `<div class="pl-company-sub">📞 ${s.phone}</div>` : ""}
      ${s.address ? `<div class="pl-company-sub">📍 ${s.address}</div>` : ""}
    </div>
    <div class="pl-title-block">
      <div class="pl-title">الميزانية العمومية</div>
      <div class="pl-subtitle">المركز المالي في: ${asOf}</div>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi-box" style="border-color:#d97706;background:#fffbeb">
      <div class="kpi-label">إجمالي الأصول</div>
      <div class="kpi-value amber">${m(data.assets.total)}</div>
      <div class="kpi-sub">النقدية + الذمم + المخزون</div>
    </div>
    <div class="kpi-box" style="border-color:#dc2626;background:#fef2f2">
      <div class="kpi-label">إجمالي الخصوم</div>
      <div class="kpi-value red">${m(data.liabilities.total)}</div>
      <div class="kpi-sub">ذمم الموردين الدائنة</div>
    </div>
    <div class="kpi-box ${eqIsPos ? "profit" : "loss"}">
      <div class="kpi-label">حقوق الملكية</div>
      <div class="kpi-value ${eqIsPos ? "green" : "red"}">${m(data.equity.total)}</div>
      <div class="kpi-sub">رأس المال + الأرباح المحتجزة</div>
    </div>
  </div>

  <table class="stmt">

    <!-- ══ الأصول ══ -->
    <tr class="sec-hd"><td colspan="2">الأصول</td></tr>

    <!-- الأصول المتداولة -->
    <tr style="background:#f3f4f6"><td colspan="2" style="padding:5px 16px;font-size:10px;font-weight:700;color:#6b7280;letter-spacing:0.05em">الأصول المتداولة</td></tr>
    <tr class="sub"><td>النقدية — أرصدة الخزن الحالية</td><td class="num">${m(data.assets.cash)}</td></tr>
    <tr class="sub"><td>ذمم العملاء المدينة</td><td class="num">${m(data.assets.receivables)}</td></tr>
    <tr class="sub"><td>المخزون — الكمية × سعر التكلفة</td><td class="num">${m(data.assets.inventory)}</td></tr>
    <tr class="total"><td>= إجمالي الأصول المتداولة</td><td class="num amber">${m(data.assets.total)}</td></tr>

    <!-- الأصول غير المتداولة -->
    <tr style="background:#f3f4f6"><td colspan="2" style="padding:5px 16px;font-size:10px;font-weight:700;color:#6b7280;letter-spacing:0.05em">الأصول غير المتداولة</td></tr>
    <tr class="sub" style="color:#9ca3af"><td style="color:#9ca3af;font-style:italic">أصول ثابتة — لا توجد حالياً</td><td class="num" style="color:#9ca3af">—</td></tr>
    <tr class="total" style="color:#9ca3af"><td style="color:#9ca3af">= إجمالي الأصول غير المتداولة</td><td class="num" style="color:#9ca3af">0.00</td></tr>

    <tr class="total" style="background:#1e293b08;border-top:2px solid #1e293b30;border-bottom:2px solid #1e293b30">
      <td style="color:#1e293b;font-size:14px">= إجمالي الأصول</td>
      <td class="num amber" style="font-size:14px">${m(data.assets.total)}</td>
    </tr>

    <tr><td colspan="2" style="height:8px;background:#f9fafb"></td></tr>

    <!-- ══ الخصوم ══ -->
    <tr class="sec-hd"><td colspan="2">الخصوم</td></tr>

    <!-- الخصوم المتداولة -->
    <tr style="background:#f3f4f6"><td colspan="2" style="padding:5px 16px;font-size:10px;font-weight:700;color:#6b7280;letter-spacing:0.05em">الخصوم المتداولة</td></tr>
    <tr class="sub"><td>ذمم الموردين الدائنة</td><td class="num">${m(data.liabilities.payables)}</td></tr>
    <tr class="total" style="color:#6b7280"><td style="color:#6b7280">= إجمالي الخصوم المتداولة</td><td class="num" style="color:#6b7280">${m(data.liabilities.payables)}</td></tr>

    <!-- الخصوم طويلة الأجل -->
    <tr style="background:#f3f4f6"><td colspan="2" style="padding:5px 16px;font-size:10px;font-weight:700;color:#6b7280;letter-spacing:0.05em">الخصوم طويلة الأجل</td></tr>
    <tr class="sub" style="color:#9ca3af"><td style="color:#9ca3af;font-style:italic">التزامات طويلة الأجل — لا توجد حالياً</td><td class="num" style="color:#9ca3af">—</td></tr>
    <tr class="total" style="color:#9ca3af"><td style="color:#9ca3af">= إجمالي الخصوم طويلة الأجل</td><td class="num" style="color:#9ca3af">0.00</td></tr>

    <tr class="total"><td style="color:#4b5563">= إجمالي الخصوم</td><td class="num" style="color:#4b5563">${m(data.liabilities.total)}</td></tr>

    <tr><td colspan="2" style="height:8px;background:#f9fafb"></td></tr>

    <!-- ══ حقوق الملكية ══ -->
    <tr class="sec-hd"><td colspan="2">حقوق الملكية</td></tr>
    <tr class="sub"><td>رأس المال المفتوح — الأرصدة الافتتاحية</td><td class="num">${m(data.equity.opening_capital)}</td></tr>
    <tr class="sub"><td>الأرباح المحتجزة — صافي الربح الكلي</td><td class="num ${retainedIsPos ? "green" : "red"}">${m(data.equity.retained_earnings)}</td></tr>
    <tr class="total" style="background:${eqBg};border-top-color:${eqBdr};border-bottom-color:${eqBdr}">
      <td style="color:${eqColor}">= إجمالي حقوق الملكية</td>
      <td class="num" style="color:${eqColor}">${m(data.equity.total)}</td>
    </tr>

    <tr><td colspan="2" style="height:4px;background:#f9fafb"></td></tr>

    <!-- ══ معادلة التوازن ══ -->
    <tr class="${data.balanced ? "net-pos" : "net-neg"}">
      <td style="font-size:15px">= إجمالي الخصوم + حقوق الملكية &nbsp;${data.balanced ? "✓" : "⚠"}</td>
      <td class="num" style="font-size:15px">${m(data.total_liabilities_equity)}</td>
    </tr>
    ${!data.balanced ? `
    <tr style="background:#fef2f2"><td colspan="2" style="padding:8px 16px;font-size:11px;color:#dc2626;font-weight:700">
      ⚠️ يوجد فرق: ${m(Math.abs(data.assets.total - data.total_liabilities_equity))} — الأصول (${m(data.assets.total)}) ≠ الخصوم + الملكية (${m(data.total_liabilities_equity)})
    </td></tr>` : ""}

  </table>

  <div class="pl-footer">
    <span>تاريخ الطباعة: ${now}</span>
    <span>Halal Tech ERP v2.0</span>
  </div>
</div>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head>
  <meta charset="UTF-8"><title>الميزانية العمومية — ${s.companyName}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
  <style>${PL_STYLES}</style>
</head>
<body>${html}
<script>document.fonts.ready.then(()=>setTimeout(()=>window.print(),700));<\/script>
</body></html>`);
  win.document.close();
}

export interface CashFlowPrintData {
  total_in: number; total_out: number; net_cash_flow: number;
  customer_receipts: number; receipts_in: number; cash_sales: number;
  deposits_in: number; payments_out: number; expenses_out: number;
  dateFrom: string; dateTo: string;
  closingBalance?: number;
}

export function printCashFlow(data: CashFlowPrintData): void {
  const s   = getSettings();
  const sym = getCurrencySymbol();
  const m   = (n: number) => `${Number(n ?? 0).toFixed(2)} ${sym}`;
  const now = new Date().toLocaleDateString("ar-EG", { year:"numeric", month:"long", day:"numeric", hour:"2-digit", minute:"2-digit" });

  const operatingNet   = data.customer_receipts - data.payments_out - data.expenses_out;
  const hasInvesting   = data.deposits_in > 0;
  const showSub        = data.receipts_in > 0 && data.cash_sales > 0;
  const isPos          = data.net_cash_flow >= 0;
  const closingBal     = data.closingBalance ?? null;
  const openingBal     = closingBal !== null ? closingBal - data.net_cash_flow : null;
  const fmtN = (n: number) => { const a = Math.abs(n).toFixed(2); return n < 0 ? `(${a})` : a; };

  const investingSection = hasInvesting ? `
    <tr class="sec-hd"><td colspan="2">التدفقات الاستثمارية</td></tr>
    <tr class="sub"><td>إيداعات</td><td class="num" style="color:#4b5563">${m(data.deposits_in)}</td></tr>
    <tr class="total"><td>= صافي التدفقات الاستثمارية</td><td class="num" style="color:#4b5563">${m(data.deposits_in)}</td></tr>` : "";

  const html = `
<div class="page">
  <div class="pl-header">
    <div>
      <div class="pl-company">${s.companyName}</div>
      ${s.phone   ? `<div class="pl-company-sub">📞 ${s.phone}</div>` : ""}
      ${s.address ? `<div class="pl-company-sub">📍 ${s.address}</div>` : ""}
    </div>
    <div class="pl-title-block">
      <div class="pl-title">قائمة التدفقات النقدية</div>
      <div class="pl-subtitle">الفترة: ${data.dateFrom} — ${data.dateTo}</div>
      <div class="pl-subtitle" style="font-size:10px;margin-top:2px">التحويلات بين الخزن مستثناة</div>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi-box">
      <div class="kpi-label">إجمالي الداخل النقدي</div>
      <div class="kpi-value green">${m(data.total_in)}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">إجمالي الخارج النقدي</div>
      <div class="kpi-value red">${m(data.total_out)}</div>
    </div>
    <div class="kpi-box ${isPos ? "profit" : "loss"}">
      <div class="kpi-label">صافي التدفق النقدي</div>
      <div class="kpi-value ${isPos ? "green" : "red"}">${m(data.net_cash_flow)}</div>
    </div>
  </div>

  <table class="stmt">
    ${openingBal !== null ? `
    <tr style="background:#f9fafb"><td style="color:#6b7280;font-style:italic;padding:10px 16px;border-bottom:1px solid #f3f4f6;font-size:12px">رصيد أول الفترة (الخزينة)</td><td class="num" style="color:#6b7280;font-style:italic;font-size:12px;padding:10px 16px;border-bottom:1px solid #f3f4f6">${m(openingBal)}</td></tr>` : ""}
    <tr class="sec-hd"><td colspan="2">التدفقات التشغيلية</td></tr>
    <tr><td style="font-weight:600">مقبوضات من العملاء</td><td class="num green">${m(data.customer_receipts)}</td></tr>
    ${showSub ? `
    <tr class="sub"><td>· سندات القبض المرحّلة</td><td class="num">${m(data.receipts_in)}</td></tr>
    <tr class="sub"><td>· مبيعات نقدية مباشرة</td><td class="num">${m(data.cash_sales)}</td></tr>` : ""}
    <tr class="sub"><td>(−) مدفوعات للموردين</td><td class="num red">${data.payments_out > 0 ? `(${m(data.payments_out)})` : "—"}</td></tr>
    <tr class="sub"><td>(−) مصروفات تشغيلية</td><td class="num red">${data.expenses_out > 0 ? `(${m(data.expenses_out)})` : "—"}</td></tr>
    <tr class="total"><td>= صافي التدفق التشغيلي</td><td class="num ${operatingNet >= 0 ? "green" : "red"}">${fmtN(operatingNet)}</td></tr>
    ${investingSection}
    <tr class="${isPos ? "net-pos" : "net-neg"}">
      <td style="font-size:17px">= صافي التدفق النقدي</td>
      <td class="num" style="font-size:17px">${fmtN(data.net_cash_flow)}</td>
    </tr>
    ${closingBal !== null ? `
    <tr style="background:#f8fafc;border-top:1px solid #e5e7eb"><td style="font-weight:700;padding:12px 16px;border-bottom:none">= رصيد آخر الفترة (الخزينة)</td><td class="num" style="padding:12px 16px;border-bottom:none;font-weight:700">${m(closingBal)}</td></tr>` : ""}
  </table>

  <div class="pl-footer">
    <span>تاريخ الطباعة: ${now}</span>
    <span>Halal Tech ERP v2.0</span>
  </div>
</div>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head>
  <meta charset="UTF-8"><title>قائمة التدفقات النقدية — ${s.companyName}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
  <style>${PL_STYLES}</style>
</head>
<body>${html}
<script>document.fonts.ready.then(()=>setTimeout(()=>window.print(),700));<\/script>
</body></html>`);
  win.document.close();
}
