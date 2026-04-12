import ExcelJS from "exceljs";
import type { Customer, Product, Sale, Purchase } from "@workspace/api-client-react";

function fmtNum(v: number | null | undefined): number {
  return Number(v ?? 0);
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("ar-EG", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function payLabel(t: string): string {
  const m: Record<string, string> = { cash: "نقدي", credit: "آجل", partial: "جزئي" };
  return m[t] ?? t;
}

function statusLabel(s: string): string {
  const m: Record<string, string> = { paid: "مدفوع", partial: "جزئي", pending: "معلق", unpaid: "غير مدفوع" };
  return m[s] ?? s;
}

async function downloadXlsx(
  columns: { header: string; key: string; width?: number }[],
  rows: Record<string, unknown>[],
  filename: string,
  sheetName: string,
) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);

  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 22 }));

  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4F81BD" },
  };
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

  for (const row of rows) {
    ws.addRow(row);
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportCustomersExcel(customers: Customer[]) {
  const columns = [
    { header: "#", key: "num", width: 6 },
    { header: "الاسم", key: "name" },
    { header: "الهاتف", key: "phone" },
    { header: "الرصيد المستحق", key: "balance" },
    { header: "تاريخ الإضافة", key: "created_at" },
  ];
  const rows = customers.map((c, i) => ({
    num: i + 1,
    name: c.name,
    phone: c.phone ?? "",
    balance: fmtNum(c.balance),
    created_at: fmtDate(c.created_at),
  }));
  await downloadXlsx(columns, rows, "العملاء", "العملاء");
}

export async function exportProductsExcel(products: Product[]) {
  const columns = [
    { header: "#", key: "num", width: 6 },
    { header: "المنتج", key: "name" },
    { header: "التصنيف", key: "category" },
    { header: "الكمية المتاحة", key: "quantity" },
    { header: "سعر التكلفة", key: "cost_price" },
    { header: "سعر البيع", key: "sale_price" },
    { header: "قيمة المخزون (تكلفة)", key: "stock_cost" },
    { header: "قيمة المخزون (بيع)", key: "stock_sale" },
    { header: "حد التنبيه", key: "low_stock_threshold" },
    { header: "الحالة", key: "status" },
  ];
  const rows = products.map((p, i) => ({
    num: i + 1,
    name: p.name,
    category: p.category ?? "",
    quantity: fmtNum(p.quantity),
    cost_price: fmtNum(p.cost_price),
    sale_price: fmtNum(p.sale_price),
    stock_cost: fmtNum(p.quantity) * fmtNum(p.cost_price),
    stock_sale: fmtNum(p.quantity) * fmtNum(p.sale_price),
    low_stock_threshold: p.low_stock_threshold ?? "",
    status:
      p.quantity === 0
        ? "نافذ"
        : p.low_stock_threshold && p.quantity <= p.low_stock_threshold
          ? "منخفض"
          : "جيد",
  }));
  await downloadXlsx(columns, rows, "المنتجات", "المنتجات");
}

export async function exportSalesExcel(sales: Sale[]) {
  const columns = [
    { header: "#", key: "num", width: 6 },
    { header: "رقم الفاتورة", key: "invoice_no" },
    { header: "العميل", key: "customer" },
    { header: "الإجمالي", key: "total" },
    { header: "المدفوع", key: "paid" },
    { header: "المتبقي", key: "remaining" },
    { header: "طريقة الدفع", key: "payment_type" },
    { header: "الحالة", key: "status" },
    { header: "التاريخ", key: "date" },
  ];
  const rows = sales.map((s, i) => ({
    num: i + 1,
    invoice_no: s.invoice_no,
    customer: s.customer_name ?? "عميل نقدي",
    total: fmtNum(s.total_amount),
    paid: fmtNum(s.paid_amount),
    remaining: fmtNum(s.remaining_amount),
    payment_type: payLabel(s.payment_type),
    status: statusLabel(s.status),
    date: fmtDate(s.created_at),
  }));
  rows.push({
    num: 0,
    invoice_no: "",
    customer: `الإجمالي (${sales.length} فاتورة)`,
    total: sales.reduce((s, v) => s + fmtNum(v.total_amount), 0),
    paid: sales.reduce((s, v) => s + fmtNum(v.paid_amount), 0),
    remaining: sales.reduce((s, v) => s + fmtNum(v.remaining_amount), 0),
    payment_type: "",
    status: "",
    date: "",
  });
  await downloadXlsx(columns, rows, "المبيعات", "فواتير المبيعات");
}

export async function exportPurchasesExcel(purchases: Purchase[]) {
  const columns = [
    { header: "#", key: "num", width: 6 },
    { header: "رقم الفاتورة", key: "invoice_no" },
    { header: "المورد", key: "supplier" },
    { header: "العميل", key: "customer" },
    { header: "الإجمالي", key: "total" },
    { header: "المدفوع", key: "paid" },
    { header: "المتبقي", key: "remaining" },
    { header: "طريقة الدفع", key: "payment_type" },
    { header: "الحالة", key: "status" },
    { header: "التاريخ", key: "date" },
  ];
  const rows = purchases.map((p, i) => ({
    num: i + 1,
    invoice_no: p.invoice_no,
    supplier: p.supplier_name ?? "",
    customer: p.customer_name ?? "",
    total: fmtNum(p.total_amount),
    paid: fmtNum(p.paid_amount),
    remaining: fmtNum(p.remaining_amount),
    payment_type: payLabel(p.payment_type),
    status: statusLabel(p.status),
    date: fmtDate(p.created_at),
  }));
  rows.push({
    num: 0,
    invoice_no: "",
    supplier: "",
    customer: `الإجمالي (${purchases.length} فاتورة)`,
    total: purchases.reduce((s, v) => s + fmtNum(v.total_amount), 0),
    paid: purchases.reduce((s, v) => s + fmtNum(v.paid_amount), 0),
    remaining: purchases.reduce((s, v) => s + fmtNum(v.remaining_amount), 0),
    payment_type: "",
    status: "",
    date: "",
  });
  await downloadXlsx(columns, rows, "المشتريات", "فواتير المشتريات");
}
