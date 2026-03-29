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
