import * as XLSX from "xlsx";
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

function downloadXlsx(data: Record<string, unknown>[], filename: string, sheetName: string) {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();

  const colWidths = Object.keys(data[0] ?? {}).map(() => ({ wch: 22 }));
  ws["!cols"] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportCustomersExcel(customers: Customer[]) {
  const rows = customers.map((c, i) => ({
    "#": i + 1,
    "الاسم": c.name,
    "الهاتف": c.phone ?? "",
    "الرصيد المستحق": fmtNum(c.balance),
    "تاريخ الإضافة": fmtDate(c.created_at),
  }));
  downloadXlsx(rows, "العملاء", "العملاء");
}

export function exportProductsExcel(products: Product[]) {
  const rows = products.map((p, i) => ({
    "#": i + 1,
    "المنتج": p.name,
    "التصنيف": p.category ?? "",
    "الكمية المتاحة": fmtNum(p.quantity),
    "سعر التكلفة": fmtNum(p.cost_price),
    "سعر البيع": fmtNum(p.sale_price),
    "قيمة المخزون (تكلفة)": fmtNum(p.quantity) * fmtNum(p.cost_price),
    "قيمة المخزون (بيع)": fmtNum(p.quantity) * fmtNum(p.sale_price),
    "حد التنبيه": p.low_stock_threshold ?? "",
    "الحالة": p.quantity === 0 ? "نافذ" : (p.low_stock_threshold && p.quantity <= p.low_stock_threshold ? "منخفض" : "جيد"),
  }));
  downloadXlsx(rows, "المنتجات", "المنتجات");
}

export function exportSalesExcel(sales: Sale[]) {
  const rows = sales.map((s, i) => ({
    "#": i + 1,
    "رقم الفاتورة": s.invoice_no,
    "العميل": s.customer_name ?? "عميل نقدي",
    "الإجمالي": fmtNum(s.total_amount),
    "المدفوع": fmtNum(s.paid_amount),
    "المتبقي": fmtNum(s.remaining_amount),
    "طريقة الدفع": payLabel(s.payment_type),
    "الحالة": statusLabel(s.status),
    "التاريخ": fmtDate(s.created_at),
  }));
  const totals: Record<string, unknown> = {
    "#": "",
    "رقم الفاتورة": "",
    "العميل": `الإجمالي (${sales.length} فاتورة)`,
    "الإجمالي": sales.reduce((s, v) => s + fmtNum(v.total_amount), 0),
    "المدفوع": sales.reduce((s, v) => s + fmtNum(v.paid_amount), 0),
    "المتبقي": sales.reduce((s, v) => s + fmtNum(v.remaining_amount), 0),
    "طريقة الدفع": "",
    "الحالة": "",
    "التاريخ": "",
  };
  downloadXlsx([...rows, totals], "المبيعات", "فواتير المبيعات");
}

export function exportPurchasesExcel(purchases: Purchase[]) {
  const rows = purchases.map((p, i) => ({
    "#": i + 1,
    "رقم الفاتورة": p.invoice_no,
    "المورد": p.supplier_name ?? "",
    "العميل": p.customer_name ?? "",
    "الإجمالي": fmtNum(p.total_amount),
    "المدفوع": fmtNum(p.paid_amount),
    "المتبقي": fmtNum(p.remaining_amount),
    "طريقة الدفع": payLabel(p.payment_type),
    "الحالة": statusLabel(p.status),
    "التاريخ": fmtDate(p.created_at),
  }));
  const totals: Record<string, unknown> = {
    "#": "",
    "رقم الفاتورة": "",
    "المورد": "",
    "العميل": `الإجمالي (${purchases.length} فاتورة)`,
    "الإجمالي": purchases.reduce((s, v) => s + fmtNum(v.total_amount), 0),
    "المدفوع": purchases.reduce((s, v) => s + fmtNum(v.paid_amount), 0),
    "المتبقي": purchases.reduce((s, v) => s + fmtNum(v.remaining_amount), 0),
    "طريقة الدفع": "",
    "الحالة": "",
    "التاريخ": "",
  };
  downloadXlsx([...rows, totals], "المشتريات", "فواتير المشتريات");
}
