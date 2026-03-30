/**
 * GET /api/contacts/:id/full-statement?type=customer|supplier
 * كشف الحساب الموحد — يدمج معاملات العميل والمورد معاً
 */
import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import {
  db,
  customersTable,
  suppliersTable,
  transactionsTable,
  salesTable,
  salesReturnsTable,
  purchasesTable,
  purchaseReturnsTable,
} from "@workspace/db";
import { wrap } from "../lib/async-handler";

const router: IRouter = Router();

type StatRow = {
  date: string;
  type: string;
  description: string;
  debit: number;
  credit: number;
  reference_no?: string | null;
  balance?: number;
};

router.get("/contacts/:id/full-statement", wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  const typeParam = (req.query.type as string | undefined) ?? "customer";

  let customerId: number | null = null;
  let supplierId: number | null = null;
  let contactName = "";
  let contactPhone: string | null = null;
  let openingCredit = 0;
  let openingDebit = 0;

  if (typeParam === "customer") {
    const [c] = await db.select().from(customersTable).where(eq(customersTable.id, id));
    if (!c) { res.status(404).json({ error: "العميل غير موجود" }); return; }
    customerId = c.id;
    contactName = c.name;
    contactPhone = c.phone ?? null;

    const openings = await db.select().from(transactionsTable)
      .where(eq(transactionsTable.reference_type, "customer_opening"));
    const ob = openings.filter(o => o.reference_id === customerId);
    openingCredit = ob.reduce((s, o) => s + Number(o.amount), 0);

    if (c.is_supplier) supplierId = null; // is_supplier customers use customer_id in purchases
  } else {
    const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, id));
    if (!s) { res.status(404).json({ error: "المورد غير موجود" }); return; }
    supplierId = s.id;
    contactName = s.name;
    contactPhone = s.phone ?? null;

    const openings = await db.select().from(transactionsTable)
      .where(eq(transactionsTable.reference_type, "supplier_opening"));
    const ob = openings.filter(o => o.reference_id === supplierId);
    // مورد → رصيد أول مدة يعني علينا له = دائن (credit)
    openingCredit = ob.reduce((s, o) => s + Number(o.amount), 0);

    // linked_customer_id removed; suppliers are standalone
  }

  const rows: StatRow[] = [];

  if (openingCredit > 0 || openingDebit > 0) {
    rows.push({
      date: "2000-01-01",
      type: "opening_balance",
      description: "رصيد أول المدة",
      debit: openingDebit,
      credit: openingCredit,
    });
  }

  // ── مبيعات للعميل (دائن — عليه لنا) ───────────────────────────
  if (customerId) {
    const sales = await db.select().from(salesTable)
      .where(eq(salesTable.customer_id, customerId))
      .orderBy(desc(salesTable.created_at));
    for (const s of sales) {
      rows.push({ date: s.date ?? s.created_at.toISOString().split("T")[0], type: "sale", description: `فاتورة مبيعات ${s.invoice_no ?? ""}`, debit: 0, credit: Number(s.total_amount), reference_no: s.invoice_no });
    }

    // مرتجعات مبيعات
    const saleReturns = await db.select().from(salesReturnsTable)
      .where(eq(salesReturnsTable.customer_id, customerId))
      .orderBy(desc(salesReturnsTable.created_at));
    for (const r of saleReturns) {
      rows.push({ date: r.date ?? r.created_at.toISOString().split("T")[0], type: "sale_return", description: `مرتجع مبيعات ${r.return_no ?? ""}`, debit: Number(r.total_amount), credit: 0, reference_no: r.return_no });
    }

    // سندات قبض (تقلل ما عليه)
    const allTx = await db.select().from(transactionsTable)
      .where(eq(transactionsTable.reference_type, "receipt_voucher"))
      .orderBy(desc(transactionsTable.created_at));
    for (const v of allTx.filter(v => v.reference_id === customerId)) {
      rows.push({ date: v.date ?? v.created_at.toISOString().split("T")[0], type: "receipt_voucher", description: v.description ?? "سند قبض", debit: Number(v.amount), credit: 0 });
    }

    // سندات صرف للعميل (نحن ندفع له)
    const payTx = await db.select().from(transactionsTable)
      .where(eq(transactionsTable.reference_type, "payment_voucher"))
      .orderBy(desc(transactionsTable.created_at));
    for (const v of payTx.filter(v => v.reference_id === customerId)) {
      rows.push({ date: v.date ?? v.created_at.toISOString().split("T")[0], type: "payment_voucher", description: v.description ?? "سند صرف", debit: 0, credit: Number(v.amount) });
    }
  }

  // ── مشتريات من المورد (دائن — هو يستحق منا) ──────────────────
  if (supplierId) {
    const purchases = await db.select().from(purchasesTable)
      .where(eq(purchasesTable.supplier_id, supplierId))
      .orderBy(desc(purchasesTable.created_at));
    for (const p of purchases) {
      rows.push({ date: p.date ?? p.created_at.toISOString().split("T")[0], type: "purchase", description: `فاتورة شراء ${p.invoice_no ?? ""}`, debit: 0, credit: Number(p.total_amount), reference_no: p.invoice_no });
    }

    // مرتجعات مشتريات
    const purchaseReturns = await db.select().from(purchaseReturnsTable)
      .where(eq(purchaseReturnsTable.customer_id, supplierId))
      .orderBy(desc(purchaseReturnsTable.created_at));
    for (const r of purchaseReturns) {
      rows.push({ date: r.date ?? r.created_at.toISOString().split("T")[0], type: "purchase_return", description: `مرتجع مشتريات ${r.return_no}`, debit: Number(r.total_amount), credit: 0, reference_no: r.return_no });
    }

    // سداد الموردين (يقلل ما نحن مدينون به)
    const supplierPayTx = await db.select().from(transactionsTable)
      .where(eq(transactionsTable.reference_type, "supplier_payment"))
      .orderBy(desc(transactionsTable.created_at));
    for (const p of supplierPayTx.filter(p => p.reference_id === supplierId)) {
      rows.push({ date: p.date ?? p.created_at.toISOString().split("T")[0], type: "supplier_payment", description: p.description ?? "سداد للمورد", debit: Number(p.amount), credit: 0 });
    }
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));

  let runningBalance = 0;
  const statement = rows.map(row => {
    runningBalance = Math.round((runningBalance + row.credit - row.debit) * 100) / 100;
    return { ...row, balance: runningBalance };
  });

  const totalSales = statement.filter(r => r.type === "sale").reduce((s, r) => s + r.credit, 0);
  const totalPurchases = statement.filter(r => r.type === "purchase").reduce((s, r) => s + r.credit, 0);
  const totalReceipts = statement.filter(r => r.type === "receipt_voucher").reduce((s, r) => s + r.debit, 0);
  const totalPayments = statement.filter(r => r.type === "supplier_payment").reduce((s, r) => s + r.debit, 0);
  const totalSaleReturns = statement.filter(r => r.type === "sale_return").reduce((s, r) => s + r.debit, 0);
  const totalPurchaseReturns = statement.filter(r => r.type === "purchase_return").reduce((s, r) => s + r.debit, 0);

  res.json({
    contact: {
      id,
      name: contactName,
      phone: contactPhone,
      type: customerId && supplierId ? "both" : customerId ? "customer" : "supplier",
      customer_id: customerId,
      supplier_id: supplierId,
    },
    summary: {
      total_sales: totalSales,
      total_purchases: totalPurchases,
      total_receipts: totalReceipts,
      total_payments: totalPayments,
      total_sale_returns: totalSaleReturns,
      total_purchase_returns: totalPurchaseReturns,
      closing_balance: runningBalance,
    },
    statement,
  });
}));

export default router;
