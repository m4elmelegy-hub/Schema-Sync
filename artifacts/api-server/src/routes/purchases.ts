import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, purchasesTable, purchaseItemsTable, productsTable, customersTable, suppliersTable, safesTable, transactionsTable, stockMovementsTable, accountsTable, purchaseReturnsTable } from "@workspace/db";
import {
  GetPurchasesResponse,
  CreatePurchaseBody,
  GetPurchaseByIdParams,
  GetPurchaseByIdResponse,
} from "@workspace/api-zod";
import { wrap, httpError } from "../lib/async-handler";
import { assertPeriodOpen } from "../lib/period-lock";
import {
  getOrCreateInventoryAccount,
  getOrCreateSafeAccount,
  getOrCreateSupplierAccount,
  createJournalEntry,
  type JournalLine,
} from "../lib/auto-account";

const router: IRouter = Router();

function formatPurchase(p: typeof purchasesTable.$inferSelect) {
  return {
    ...p,
    total_amount: Number(p.total_amount),
    paid_amount: Number(p.paid_amount),
    remaining_amount: Number(p.remaining_amount),
    created_at: p.created_at.toISOString(),
  };
}

function formatPurchaseItem(item: typeof purchaseItemsTable.$inferSelect) {
  return {
    ...item,
    quantity: Number(item.quantity),
    unit_price: Number(item.unit_price),
    total_price: Number(item.total_price),
  };
}

router.get("/purchases", wrap(async (_req, res) => {
  const purchases = await db.select().from(purchasesTable).orderBy(purchasesTable.created_at);
  res.json(GetPurchasesResponse.parse(purchases.map(formatPurchase)));
}));

router.post("/purchases", wrap(async (req, res) => {
  const parsed = CreatePurchaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const {
    payment_type,
    total_amount,
    paid_amount,
    items,
    supplier_name,
    supplier_id,
    customer_id,
    customer_name,
    safe_id,
    notes,
    date,
  } = parsed.data;

  const remaining = total_amount - paid_amount;

  await assertPeriodOpen(date, req);

  let status = "paid";
  if (payment_type === "credit") status = "unpaid";
  else if (remaining > 0) status = "partial";

  const invoiceNo = `PUR-${Date.now()}`;

  const today = date ?? new Date().toISOString().split("T")[0];

  const purchase = await db.transaction(async (tx) => {
    const [newPurchase] = await tx.insert(purchasesTable).values({
      invoice_no: invoiceNo,
      supplier_name: supplier_name ?? null,
      supplier_id: supplier_id ?? null,
      customer_id: customer_id ?? null,
      customer_name: customer_name ?? null,
      payment_type,
      total_amount: String(total_amount),
      paid_amount: String(paid_amount),
      remaining_amount: String(payment_type === "credit" ? total_amount : remaining),
      status,
      date: today,
      notes: notes ?? null,
    }).returning();

    for (const item of items) {
      await tx.insert(purchaseItemsTable).values({
        purchase_id: newPurchase.id,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: String(item.quantity),
        unit_price: String(item.unit_price),
        total_price: String(item.total_price),
      });

      const [prod] = await tx.select().from(productsTable).where(eq(productsTable.id, item.product_id));
      if (prod) {
        const oldQty = Number(prod.quantity);
        const oldCost = Number(prod.cost_price);
        const newItemQty = Number(item.quantity);
        const newItemCost = Number(item.unit_price);
        const newTotalQty = oldQty + newItemQty;
        const newAvgCost = newTotalQty > 0
          ? (oldQty * oldCost + newItemQty * newItemCost) / newTotalQty
          : newItemCost;

        await tx.update(productsTable)
          .set({
            quantity: String(newTotalQty),
            cost_price: String(newAvgCost.toFixed(4)),
          })
          .where(eq(productsTable.id, item.product_id));

        await tx.insert(stockMovementsTable).values({
          product_id: item.product_id,
          product_name: item.product_name,
          movement_type: "purchase",
          quantity: String(newItemQty),
          quantity_before: String(oldQty),
          quantity_after: String(newTotalQty),
          unit_cost: String(newItemCost),
          reference_type: "purchase",
          reference_id: newPurchase.id,
          reference_no: invoiceNo,
          notes: supplier_name ? `مشتريات من ${supplier_name}` : "فاتورة مشتريات",
          date: today,
        });
      }
    }

    const cashOut = payment_type === "cash" ? total_amount
      : payment_type === "partial" ? paid_amount
      : 0;

    const customerDebt = payment_type === "credit" ? total_amount
      : payment_type === "partial" ? remaining
      : 0;

    if (cashOut > 0 && safe_id) {
      const [safe] = await tx.select().from(safesTable).where(eq(safesTable.id, safe_id));
      if (safe) {
        await tx.update(safesTable)
          .set({ balance: String(Number(safe.balance) - cashOut) })
          .where(eq(safesTable.id, safe_id));
        await tx.insert(transactionsTable).values({
          type: "purchase_cash",
          reference_type: "purchase",
          reference_id: newPurchase.id,
          safe_id: safe.id,
          safe_name: safe.name,
          customer_id: customer_id ?? null,
          customer_name: customer_name ?? null,
          amount: String(cashOut),
          direction: "out",
          description: `دفع نقدي — فاتورة مشتريات ${invoiceNo}${customer_name ? ` (${customer_name})` : ""}`,
          date: today,
        });
      }
    }

    if (customerDebt > 0 && customer_id) {
      const [cust] = await tx.select().from(customersTable).where(eq(customersTable.id, customer_id));
      if (cust) {
        await tx.update(customersTable)
          .set({ balance: String(Number(cust.balance) - customerDebt) })
          .where(eq(customersTable.id, customer_id));
        await tx.insert(transactionsTable).values({
          type: "purchase_credit",
          reference_type: "purchase",
          reference_id: newPurchase.id,
          safe_id: null,
          safe_name: null,
          customer_id: customer_id,
          customer_name: customer_name ?? null,
          amount: String(customerDebt),
          direction: "out",
          description: `مشتريات آجل من ${customer_name ?? "عميل"} — فاتورة ${invoiceNo}`,
          date: today,
        });
      }
    }

    return newPurchase;
  });

  // القيد المحاسبي يُنشأ عند الترحيل (POST /purchases/:id/post) — ليس عند الإنشاء
  res.status(201).json(formatPurchase(purchase));
}));

router.get("/purchases/:id", wrap(async (req, res) => {
  const params = GetPurchaseByIdParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [purchase] = await db.select().from(purchasesTable).where(eq(purchasesTable.id, params.data.id));
  if (!purchase) {
    res.status(404).json({ error: "Purchase not found" });
    return;
  }

  const items = await db.select().from(purchaseItemsTable).where(eq(purchaseItemsTable.purchase_id, purchase.id));

  res.json(GetPurchaseByIdResponse.parse({
    ...formatPurchase(purchase),
    items: items.map(formatPurchaseItem),
  }));
}));

/* ── بناء قيود المشتريات ────────────────────────────────────────────────── */
// القيد الصحيح للمشتريات التي تدخل المخزون:
//   مدين:  حساب المخزون (ASSET-INVENTORY) ← تزيد قيمة الأصول
//   دائن:  خزينة (SAFE) أو ذمم مورد (AP)  ← نقص السيولة أو زيادة الالتزامات
async function buildPurchaseJournalLines(purchase: typeof purchasesTable.$inferSelect): Promise<JournalLine[]> {
  const total       = Number(purchase.total_amount);
  const paid        = Number(purchase.paid_amount);
  const supplierDebt = total - paid;
  const lines: JournalLine[] = [];

  const inventoryAcct = await getOrCreateInventoryAccount();
  lines.push({ account: inventoryAcct, debit: total, credit: 0 });

  // استرجاع الخزينة من جدول الحركات (safe_id غير مخزّن مباشرةً في purchasesTable)
  if (paid > 0) {
    const [txRow] = await db.select({ safe_id: transactionsTable.safe_id, safe_name: transactionsTable.safe_name })
      .from(transactionsTable)
      .where(and(
        eq(transactionsTable.reference_type, "purchase"),
        eq(transactionsTable.reference_id, purchase.id),
      ))
      .limit(1);

    if (txRow?.safe_id && txRow.safe_name) {
      const safeAcct = await getOrCreateSafeAccount(txRow.safe_id, txRow.safe_name);
      lines.push({ account: safeAcct, debit: 0, credit: paid });
    }
  }

  if (supplierDebt > 0 && purchase.supplier_id) {
    const [supp] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, purchase.supplier_id));
    if (supp?.account_id) {
      const [acctRow] = await db.select({ id: accountsTable.id, code: accountsTable.code, name: accountsTable.name })
        .from(accountsTable).where(eq(accountsTable.id, supp.account_id));
      if (acctRow) lines.push({ account: acctRow, debit: 0, credit: supplierDebt });
    } else if (supp?.supplier_code) {
      const suppAcct = await getOrCreateSupplierAccount(supp.supplier_code, supp.name);
      lines.push({ account: suppAcct, debit: 0, credit: supplierDebt });
    }
  }

  return lines;
}

/* ── ترحيل فاتورة المشتريات (draft → posted) ───────────────────────────── */
router.post("/purchases/:id/post", wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) throw httpError(400, "معرّف غير صحيح");

  const [purchase] = await db.select().from(purchasesTable).where(eq(purchasesTable.id, id));
  if (!purchase) throw httpError(404, "الفاتورة غير موجودة");
  if (purchase.posting_status === "posted")    throw httpError(400, "الفاتورة مرحَّلة بالفعل");
  if (purchase.posting_status === "cancelled") throw httpError(400, "لا يمكن ترحيل فاتورة ملغاة");

  await assertPeriodOpen(purchase.date, req);

  const lines = await buildPurchaseJournalLines(purchase);
  if (lines.length >= 2) {
    await createJournalEntry({
      date: purchase.date ?? new Date().toISOString().split("T")[0],
      description: `فاتورة مشتريات ${purchase.invoice_no}${purchase.supplier_name ? ` — ${purchase.supplier_name}` : ""}`,
      reference: purchase.invoice_no,
      lines,
    });
  }

  const [updated] = await db.update(purchasesTable)
    .set({ posting_status: "posted" })
    .where(eq(purchasesTable.id, id))
    .returning();

  res.json(formatPurchase(updated));
}));

/* ── إلغاء فاتورة المشتريات → عكس كامل (مخزون + أرصدة + قيد محاسبي) ─── */
router.post("/purchases/:id/cancel", wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) throw httpError(400, "معرّف غير صحيح");

  const [purchase] = await db.select().from(purchasesTable).where(eq(purchasesTable.id, id));
  if (!purchase) throw httpError(404, "الفاتورة غير موجودة");
  if (purchase.posting_status === "cancelled") throw httpError(400, "الفاتورة ملغاة بالفعل");

  // ── التحقق: لا يمكن إلغاء فاتورة بها مرتجعات ────────────────────────────
  const existingReturns = await db.select({ id: purchaseReturnsTable.id })
    .from(purchaseReturnsTable)
    .where(eq(purchaseReturnsTable.purchase_id, id));
  if (existingReturns.length > 0) {
    throw httpError(400, "لا يمكن إلغاء فاتورة مرتبطة بمرتجعات — يجب حذف المرتجعات أولاً");
  }

  await assertPeriodOpen(purchase.date, req);

  const today = new Date().toISOString().split("T")[0];

  await db.transaction(async (tx) => {
    // ── 1. عكس القيد المحاسبي (للفواتير المرحَّلة فقط) ──────────────────
    if (purchase.posting_status === "posted") {
      const lines = await buildPurchaseJournalLines(purchase);
      if (lines.length >= 2) {
        const reversed = lines.map(l => ({ account: l.account, debit: l.credit, credit: l.debit }));
        await createJournalEntry({
          date: today,
          description: `إلغاء فاتورة مشتريات ${purchase.invoice_no}${purchase.supplier_name ? ` — ${purchase.supplier_name}` : ""}`,
          reference: `REV-${purchase.invoice_no}`,
          lines: reversed,
        });
      }
    }

    // ── 2. إزالة بنود الشراء من المخزون + تعديل WAC ───────────────────────
    // نستخدم unit_price المحفوظ في purchase_items (= تكلفة الشراء الأصلية)
    const purchaseItems = await tx.select().from(purchaseItemsTable)
      .where(eq(purchaseItemsTable.purchase_id, purchase.id));

    for (const item of purchaseItems) {
      const qty            = Number(item.quantity);
      const purchaseUnitCost = Number(item.unit_price);

      const [prod] = await tx.select().from(productsTable).where(eq(productsTable.id, item.product_id));
      if (prod) {
        const oldQty = Number(prod.quantity);
        const oldWAC = Number(prod.cost_price);
        const newQty = Math.max(0, oldQty - qty);

        // عند إزالة مشتريات: NewWAC = (oldValue - removedValue) / newQty
        let newWAC = oldWAC;
        if (newQty > 0) {
          const oldValue     = oldQty * oldWAC;
          const removedValue = qty * purchaseUnitCost;
          newWAC = Math.max(0, (oldValue - removedValue) / newQty);
        }

        await tx.update(productsTable)
          .set({ quantity: String(newQty), cost_price: String(newWAC.toFixed(4)) })
          .where(eq(productsTable.id, item.product_id));

        await tx.insert(stockMovementsTable).values({
          product_id:      item.product_id,
          product_name:    item.product_name,
          movement_type:   "adjustment",
          quantity:        String(-qty),
          quantity_before: String(oldQty),
          quantity_after:  String(newQty),
          unit_cost:       String(purchaseUnitCost),
          reference_type:  "purchase_cancel",
          reference_id:    purchase.id,
          reference_no:    purchase.invoice_no,
          notes:           `إلغاء فاتورة مشتريات ${purchase.invoice_no}`,
          date:            today,
        });
      }
    }

    // ── 3. عكس رصيد المورد (الآجل / الجزئي) ─────────────────────────────
    const remainingAmt = Number(purchase.remaining_amount);
    if (remainingAmt > 0 && purchase.supplier_id) {
      const [supp] = await tx.select().from(suppliersTable).where(eq(suppliersTable.id, purchase.supplier_id));
      if (supp) {
        const newBal = Math.max(0, Number(supp.balance) - remainingAmt);
        await tx.update(suppliersTable)
          .set({ balance: String(newBal) })
          .where(eq(suppliersTable.id, supp.id));
      }
    }

    // ── 4. عكس رصيد الخزينة (النقدي / الجزئي) ────────────────────────────
    // نستخدم paid_amount المخزون في سجل الشراء
    const paidAmt = Number(purchase.paid_amount);
    if (paidAmt > 0) {
      // نجلب الخزينة من جدول الحركات (safe_id غير مخزّن في purchasesTable)
      const [txRow] = await db.select({ safe_id: transactionsTable.safe_id, safe_name: transactionsTable.safe_name })
        .from(transactionsTable)
        .where(and(
          eq(transactionsTable.reference_type, "purchase"),
          eq(transactionsTable.reference_id, purchase.id),
        ))
        .limit(1);

      if (txRow?.safe_id) {
        const [safe] = await tx.select().from(safesTable).where(eq(safesTable.id, txRow.safe_id));
        if (safe) {
          await tx.update(safesTable)
            .set({ balance: String(Number(safe.balance) + paidAmt) })
            .where(eq(safesTable.id, safe.id));
        }
        await tx.insert(transactionsTable).values({
          type:           "purchase_cancel",
          reference_type: "purchase_cancel",
          reference_id:   purchase.id,
          safe_id:        txRow.safe_id,
          safe_name:      txRow.safe_name ?? "",
          amount:         String(paidAmt),
          direction:      "in",
          description:    `إلغاء فاتورة مشتريات ${purchase.invoice_no}`,
          date:           today,
        });
      }
    }

    // ── 5. تحديث حالة الفاتورة ────────────────────────────────────────────
    await tx.update(purchasesTable)
      .set({ posting_status: "cancelled" })
      .where(eq(purchasesTable.id, id));
  });

  const [updated] = await db.select().from(purchasesTable).where(eq(purchasesTable.id, id));
  res.json(formatPurchase(updated));
}));

export default router;
