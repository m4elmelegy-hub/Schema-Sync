import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, salesTable, saleItemsTable, productsTable, customersTable, transactionsTable, safesTable, warehousesTable, erpUsersTable, stockMovementsTable, accountsTable } from "@workspace/db";
import {
  GetSalesResponse,
  CreateSaleBody,
  GetSaleByIdParams,
  GetSaleByIdResponse,
} from "@workspace/api-zod";
import { wrap, httpError } from "../lib/async-handler";
import {
  getOrCreateSalesRevenueAccount,
  getOrCreateSafeAccount,
  getOrCreateCustomerAccount,
  createJournalEntry,
  type JournalLine,
} from "../lib/auto-account";

const router: IRouter = Router();

function formatSale(s: typeof salesTable.$inferSelect) {
  return {
    ...s,
    total_amount: Number(s.total_amount),
    paid_amount: Number(s.paid_amount),
    remaining_amount: Number(s.remaining_amount),
    created_at: s.created_at.toISOString(),
  };
}

function formatSaleItem(item: typeof saleItemsTable.$inferSelect) {
  return {
    ...item,
    quantity: Number(item.quantity),
    unit_price: Number(item.unit_price),
    total_price: Number(item.total_price),
  };
}

router.get("/sales", wrap(async (_req, res) => {
  const sales = await db.select().from(salesTable).orderBy(salesTable.created_at);
  res.json(GetSalesResponse.parse(sales.map(formatSale)));
}));

router.post("/sales", wrap(async (req, res) => {
  const parsed = CreateSaleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const {
    payment_type, total_amount, paid_amount, items, customer_name, customer_id,
    notes, date, safe_id, warehouse_id, salesperson_id,
    discount_percent, discount_amount,
  } = parsed.data;
  const remaining = total_amount - paid_amount;

  if ((payment_type === "cash" || payment_type === "partial") && paid_amount > 0 && !safe_id) {
    res.status(400).json({ error: "يجب اختيار الخزينة للمبيعات النقدية" });
    return;
  }

  let status = "paid";
  if (payment_type === "credit") status = "unpaid";
  else if (remaining > 0) status = "partial";

  const invoiceNo = `INV-${Date.now()}`;

  const sale = await db.transaction(async (tx) => {
      // 1. جلب بيانات الخزينة
      let safe: typeof safesTable.$inferSelect | null = null;
      if (safe_id && paid_amount > 0) {
        const [s] = await tx.select().from(safesTable).where(eq(safesTable.id, safe_id));
        if (!s) throw httpError(400, "الخزينة غير موجودة");
        safe = s;
      }

      let warehouseName: string | null = null;
      if (warehouse_id) {
        const [w] = await tx.select().from(warehousesTable).where(eq(warehousesTable.id, warehouse_id));
        if (w) warehouseName = w.name;
      }
      let salespersonName: string | null = null;
      if (salesperson_id) {
        const [u] = await tx.select().from(erpUsersTable).where(eq(erpUsersTable.id, salesperson_id));
        if (u) salespersonName = u.name;
      }

      // 2. إنشاء الفاتورة
      const [newSale] = await tx.insert(salesTable).values({
        invoice_no: invoiceNo,
        customer_name: customer_name ?? null,
        customer_id: customer_id ?? null,
        payment_type,
        total_amount: String(total_amount),
        paid_amount: String(paid_amount),
        remaining_amount: String(payment_type === "credit" ? total_amount : remaining),
        status,
        safe_id: safe?.id ?? null,
        safe_name: safe?.name ?? null,
        warehouse_id: warehouse_id ?? null,
        warehouse_name: warehouseName,
        salesperson_id: salesperson_id ?? null,
        salesperson_name: salespersonName,
        discount_percent: String(discount_percent ?? 0),
        discount_amount: String(discount_amount ?? 0),
        notes: notes ?? null,
        date: date ?? new Date().toISOString().split("T")[0],
      }).returning();

      // 3. البنود: خصم المخزون + تسجيل التكلفة + حركة مخزون صادر
      for (const item of items) {
        const [prod] = await tx.select().from(productsTable).where(eq(productsTable.id, item.product_id));
        const costAtSale = prod ? Number(prod.cost_price) : 0;
        const costTotal = costAtSale * item.quantity;
        const oldQty = prod ? Number(prod.quantity) : 0;
        const newQty = Math.max(0, oldQty - item.quantity);

        await tx.insert(saleItemsTable).values({
          sale_id: newSale.id,
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: String(item.quantity),
          unit_price: String(item.unit_price),
          total_price: String(item.total_price),
          cost_price: String(costAtSale),
          cost_total: String(costTotal),
        });

        if (prod) {
          await tx.update(productsTable)
            .set({ quantity: String(newQty) })
            .where(eq(productsTable.id, item.product_id));

          // ── تسجيل حركة مخزون صادر (مبيعات) ────────────────
          await tx.insert(stockMovementsTable).values({
            product_id: item.product_id,
            product_name: item.product_name,
            movement_type: "sale",
            quantity: String(-item.quantity),      // سالب = صادر
            quantity_before: String(oldQty),
            quantity_after: String(newQty),
            unit_cost: String(costAtSale),
            reference_type: "sale",
            reference_id: newSale.id,
            reference_no: invoiceNo,
            notes: customer_name ? `مبيعات لـ ${customer_name}` : "فاتورة مبيعات",
            date: new Date().toISOString().split("T")[0],
          });
        }
      }

      // 4. تحديث رصيد العميل
      const debtAmount = payment_type === "credit" ? total_amount : (remaining > 0 ? remaining : 0);
      if (debtAmount > 0 && customer_id) {
        const [cust] = await tx.select().from(customersTable).where(eq(customersTable.id, customer_id));
        if (cust) {
          await tx.update(customersTable)
            .set({ balance: String(Number(cust.balance) + debtAmount) })
            .where(eq(customersTable.id, customer_id));
        }
      }

      // 5. تحديث رصيد الخزينة
      if (safe && paid_amount > 0) {
        const newBalance = Number(safe.balance) + paid_amount;
        await tx.update(safesTable)
          .set({ balance: String(newBalance) })
          .where(eq(safesTable.id, safe.id));
      }

      // 6. الحركة المالية المركزية
      const txType = payment_type === "credit" ? "sale_credit" : payment_type === "partial" ? "sale_partial" : "sale_cash";
      await tx.insert(transactionsTable).values({
        type: txType,
        reference_type: "sale",
        reference_id: newSale.id,
        safe_id: safe?.id ?? null,
        safe_name: safe?.name ?? null,
        customer_id: customer_id ?? null,
        customer_name: customer_name ?? null,
        amount: String(paid_amount > 0 ? paid_amount : total_amount),
        direction: paid_amount > 0 ? "in" : "none",
        description: `فاتورة مبيعات ${invoiceNo}`,
        date: new Date().toISOString().split("T")[0],
      });

      return newSale;
  });

  // القيد المحاسبي يُنشأ عند الترحيل (POST /sales/:id/post) — ليس عند الإنشاء
  res.status(201).json(formatSale(sale));
}));

router.get("/sales/:id", wrap(async (req, res) => {
  const params = GetSaleByIdParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [sale] = await db.select().from(salesTable).where(eq(salesTable.id, params.data.id));
  if (!sale) {
    res.status(404).json({ error: "Sale not found" });
    return;
  }

  const items = await db.select().from(saleItemsTable).where(eq(saleItemsTable.sale_id, sale.id));

  res.json(GetSaleByIdResponse.parse({
    ...formatSale(sale),
    items: items.map(formatSaleItem),
  }));
}));

/* ── بناء قيود المبيعات ─────────────────────────────────────────────────── */
async function buildSaleJournalLines(sale: typeof salesTable.$inferSelect): Promise<JournalLine[]> {
  const total  = Number(sale.total_amount);
  const paid   = Number(sale.paid_amount);
  const debt   = total - paid;
  const lines: JournalLine[] = [];

  const revenueAcct = await getOrCreateSalesRevenueAccount();
  lines.push({ account: revenueAcct, debit: 0, credit: total });

  if (paid > 0 && sale.safe_id && sale.safe_name) {
    const safeAcct = await getOrCreateSafeAccount(sale.safe_id, sale.safe_name);
    lines.push({ account: safeAcct, debit: paid, credit: 0 });
  }

  if (debt > 0 && sale.customer_id) {
    const [cust] = await db.select().from(customersTable).where(eq(customersTable.id, sale.customer_id));
    if (cust?.account_id) {
      const [acctRow] = await db.select({ id: accountsTable.id, code: accountsTable.code, name: accountsTable.name })
        .from(accountsTable).where(eq(accountsTable.id, cust.account_id));
      if (acctRow) lines.push({ account: acctRow, debit: debt, credit: 0 });
    } else if (cust?.customer_code) {
      const custAcct = await getOrCreateCustomerAccount(cust.customer_code, cust.name);
      lines.push({ account: custAcct, debit: debt, credit: 0 });
    }
  }

  return lines;
}

/* ── ترحيل الفاتورة (draft → posted) ───────────────────────────────────── */
router.post("/sales/:id/post", wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) throw httpError(400, "معرّف غير صحيح");

  const [sale] = await db.select().from(salesTable).where(eq(salesTable.id, id));
  if (!sale) throw httpError(404, "الفاتورة غير موجودة");
  if (sale.posting_status === "posted")    throw httpError(400, "الفاتورة مرحَّلة بالفعل");
  if (sale.posting_status === "cancelled") throw httpError(400, "لا يمكن ترحيل فاتورة ملغاة");

  const lines = await buildSaleJournalLines(sale);
  if (lines.length >= 2) {
    await createJournalEntry({
      date: sale.date ?? new Date().toISOString().split("T")[0],
      description: `فاتورة مبيعات ${sale.invoice_no}${sale.customer_name ? ` — ${sale.customer_name}` : ""}`,
      reference: sale.invoice_no,
      lines,
    });
  }

  const [updated] = await db.update(salesTable)
    .set({ posting_status: "posted" })
    .where(eq(salesTable.id, id))
    .returning();

  res.json(formatSale(updated));
}));

/* ── إلغاء الفاتورة → قيد عكسي ────────────────────────────────────────── */
router.post("/sales/:id/cancel", wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) throw httpError(400, "معرّف غير صحيح");

  const [sale] = await db.select().from(salesTable).where(eq(salesTable.id, id));
  if (!sale) throw httpError(404, "الفاتورة غير موجودة");
  if (sale.posting_status === "cancelled") throw httpError(400, "الفاتورة ملغاة بالفعل");

  if (sale.posting_status === "posted") {
    const lines = await buildSaleJournalLines(sale);
    if (lines.length >= 2) {
      const reversed = lines.map(l => ({ account: l.account, debit: l.credit, credit: l.debit }));
      await createJournalEntry({
        date: new Date().toISOString().split("T")[0],
        description: `إلغاء فاتورة مبيعات ${sale.invoice_no}${sale.customer_name ? ` — ${sale.customer_name}` : ""}`,
        reference: `REV-${sale.invoice_no}`,
        lines: reversed,
      });
    }
  }

  const [updated] = await db.update(salesTable)
    .set({ posting_status: "cancelled" })
    .where(eq(salesTable.id, id))
    .returning();

  res.json(formatSale(updated));
}));

export default router;
