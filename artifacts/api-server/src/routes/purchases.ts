import { Router, type IRouter } from "express";
import { eq, and, gt, not, inArray } from "drizzle-orm";
import { db, purchasesTable, purchaseItemsTable, productsTable, customersTable, safesTable, transactionsTable, stockMovementsTable, accountsTable, purchaseReturnsTable, journalEntriesTable, journalEntryLinesTable, customerLedgerTable } from "@workspace/db";
import {
  GetPurchasesResponse,
  CreatePurchaseBody,
  GetPurchaseByIdParams,
  GetPurchaseByIdResponse,
} from "@workspace/api-zod";
import { wrap, httpError } from "../lib/async-handler";
import { triggerBackup } from "../lib/backup-service";
import { assertPeriodOpen } from "../lib/period-lock";
import { runAllChecks } from "../lib/alert-service";
import {
  getOrCreateInventoryAccount,
  getOrCreateSafeAccount,
  getOrCreateCustomerPayableAccount,
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
    quantity_returned: item.quantity_returned != null ? Number(item.quantity_returned) : null,
  };
}

router.get("/purchases", wrap(async (_req, res) => {
  const purchases = await db.select().from(purchasesTable).orderBy(purchasesTable.created_at);
  res.json(GetPurchasesResponse.parse(purchases.map(formatPurchase)));
}));

router.post("/purchases", wrap(async (req, res) => {
  const parsed = CreatePurchaseBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }

  const requestId = req.headers["x-request-id"]
    ? String(req.headers["x-request-id"])
    : null;

  if (requestId) {
    const [existing] = await db.select().from(purchasesTable)
      .where(eq(purchasesTable.request_id, requestId)).limit(1);
    if (existing) return res.json(formatPurchase(existing));
  }

  const {
    payment_type,
    total_amount,
    paid_amount,
    items,
    supplier_name,
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
  const displayName = customer_name ?? supplier_name ?? null;

  if (paid_amount > 0 && !safe_id) {
    return res.status(400).json({ error: "يجب اختيار الخزينة للمدفوعات النقدية أو الجزئية" });
  }

  const purchase = await db.transaction(async (tx) => {
    const [newPurchase] = await tx.insert(purchasesTable).values({
      request_id: requestId,
      invoice_no: invoiceNo,
      supplier_name: displayName,
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
          notes: displayName ? `مشتريات من ${displayName}` : "فاتورة مشتريات",
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
          customer_name: displayName,
          amount: String(cashOut),
          direction: "out",
          description: `دفع نقدي — فاتورة مشتريات ${invoiceNo}${displayName ? ` (${displayName})` : ""}`,
          date: today,
        });
      }
    }

    // آجل أو جزئي: رصيد العميل-المورد يصبح سالباً (نحن مدينون له)
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
          customer_name: displayName,
          amount: String(customerDebt),
          direction: "out",
          description: `مشتريات آجل من ${displayName ?? "مورد"} — فاتورة ${invoiceNo}`,
          date: today,
        });

        await tx.insert(customerLedgerTable).values({
          customer_id: customer_id,
          type: "purchase",
          amount: String(-customerDebt),
          reference_type: "purchase",
          reference_id: newPurchase.id,
          reference_no: invoiceNo,
          description: `مشتريات آجل ${invoiceNo} — ${displayName ?? "مورد"}`,
          date: today,
        });
      }
    }

    return newPurchase;
  });

  return res.status(201).json(formatPurchase(purchase));
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
async function buildPurchaseJournalLines(purchase: typeof purchasesTable.$inferSelect): Promise<JournalLine[]> {
  const total       = Number(purchase.total_amount);
  const paid        = Number(purchase.paid_amount);
  const supplierDebt = total - paid;
  const lines: JournalLine[] = [];

  const inventoryAcct = await getOrCreateInventoryAccount();
  lines.push({ account: inventoryAcct, debit: total, credit: 0 });

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

  // الجزء الآجل: حساب ذمم مورد (AP) مرتبط بالعميل-المورد
  if (supplierDebt > 0 && purchase.customer_id) {
    const [cust] = await db.select({ customer_code: customersTable.customer_code, name: customersTable.name, account_id: customersTable.account_id })
      .from(customersTable)
      .where(eq(customersTable.id, purchase.customer_id));

    if (cust) {
      let apAcct: { id: number; code: string; name: string } | undefined;
      if (cust.account_id) {
        const [a] = await db.select({ id: accountsTable.id, code: accountsTable.code, name: accountsTable.name })
          .from(accountsTable).where(eq(accountsTable.id, cust.account_id));
        // نبحث عن حساب AP خاص بالعميل-المورد
        const [apRow] = await db.select({ id: accountsTable.id, code: accountsTable.code, name: accountsTable.name })
          .from(accountsTable).where(eq(accountsTable.code, `AP-C-${cust.customer_code ?? purchase.customer_id}`));
        apAcct = apRow ?? (cust.customer_code ? undefined : a);
      }
      if (!apAcct) {
        apAcct = await getOrCreateCustomerPayableAccount(
          cust.customer_code ?? purchase.customer_id,
          cust.name,
        );
      }
      lines.push({ account: apAcct, debit: 0, credit: supplierDebt });
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

  const updated = await db.transaction(async (tx) => {
    if (lines.length >= 2) {
      await createJournalEntry({
        date: purchase.date ?? new Date().toISOString().split("T")[0],
        description: `فاتورة مشتريات ${purchase.invoice_no}${purchase.supplier_name ? ` — ${purchase.supplier_name}` : ""}`,
        reference: purchase.invoice_no,
        lines,
      }, tx);
    }
    const [row] = await tx.update(purchasesTable)
      .set({ posting_status: "posted" })
      .where(eq(purchasesTable.id, id))
      .returning();
    return row;
  });

  const purchaseItems = await db.select({ product_id: purchaseItemsTable.product_id })
    .from(purchaseItemsTable).where(eq(purchaseItemsTable.purchase_id, id));
  void runAllChecks({});
  for (const item of purchaseItems) {
    if (item.product_id) void runAllChecks({ productId: item.product_id });
  }

  void triggerBackup("purchase_post");

  res.json(formatPurchase(updated));
}));

/* ── إلغاء فاتورة المشتريات ─────────────────────────────────────────────── */
router.post("/purchases/:id/cancel", wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) throw httpError(400, "معرّف غير صحيح");

  const [purchase] = await db.select().from(purchasesTable).where(eq(purchasesTable.id, id));
  if (!purchase) throw httpError(404, "الفاتورة غير موجودة");
  if (purchase.posting_status === "cancelled") throw httpError(400, "الفاتورة ملغاة بالفعل");

  const existingReturns = await db.select({ id: purchaseReturnsTable.id })
    .from(purchaseReturnsTable)
    .where(eq(purchaseReturnsTable.purchase_id, id));
  if (existingReturns.length > 0) {
    throw httpError(400, "لا يمكن إلغاء فاتورة مرتبطة بمرتجعات — يجب حذف المرتجعات أولاً");
  }

  // فحص: المخزون سيصبح سالباً
  {
    const itemsToCheck = await db
      .select({ product_id: purchaseItemsTable.product_id, product_name: purchaseItemsTable.product_name, quantity: purchaseItemsTable.quantity })
      .from(purchaseItemsTable)
      .where(eq(purchaseItemsTable.purchase_id, id));

    for (const item of itemsToCheck) {
      const cancelQty = Number(item.quantity);
      const [prod] = await db.select({ quantity: productsTable.quantity }).from(productsTable).where(eq(productsTable.id, item.product_id));
      if (prod && Number(prod.quantity) < cancelQty - 0.001) {
        throw httpError(400,
          `لا يمكن الإلغاء: المخزون الحالي لـ "${item.product_name}" (${Number(prod.quantity).toFixed(3)}) أقل من كمية الشراء المُراد عكسها (${cancelQty.toFixed(3)}) — الإلغاء سيجعل الكمية سالبة`
        );
      }
    }
  }

  // فحص: قيود محاسبية لاحقة
  if (purchase.posting_status === "posted") {
    const [purchJE] = await db.select({ id: journalEntriesTable.id })
      .from(journalEntriesTable)
      .where(eq(journalEntriesTable.reference, purchase.invoice_no));

    if (purchJE) {
      const jeLines = await db.select({ account_id: journalEntryLinesTable.account_id })
        .from(journalEntryLinesTable)
        .where(eq(journalEntryLinesTable.entry_id, purchJE.id));

      const accountIds = [...new Set(jeLines.map(l => l.account_id))];
      if (accountIds.length > 0) {
        const laterLines = await db.select({ entry_id: journalEntryLinesTable.entry_id })
          .from(journalEntryLinesTable)
          .innerJoin(journalEntriesTable, eq(journalEntryLinesTable.entry_id, journalEntriesTable.id))
          .where(and(
            inArray(journalEntryLinesTable.account_id, accountIds),
            gt(journalEntriesTable.date, purchase.date ?? ""),
            not(eq(journalEntriesTable.id, purchJE.id)),
          ))
          .limit(1);

        if (laterLines.length > 0) {
          throw httpError(400,
            "لا يمكن العكس: توجد قيود محاسبية لاحقة مبنية على نفس حسابات هذه الفاتورة"
          );
        }
      }
    }
  }

  await assertPeriodOpen(purchase.date, req);

  const today = new Date().toISOString().split("T")[0];

  await db.transaction(async (tx) => {
    // 1. عكس القيد المحاسبي
    if (purchase.posting_status === "posted") {
      const lines = await buildPurchaseJournalLines(purchase);
      if (lines.length >= 2) {
        const reversed = lines.map(l => ({ account: l.account, debit: l.credit, credit: l.debit }));
        await createJournalEntry({
          date: today,
          description: `إلغاء فاتورة مشتريات ${purchase.invoice_no}${purchase.supplier_name ? ` — ${purchase.supplier_name}` : ""}`,
          reference: `REV-${purchase.invoice_no}`,
          lines: reversed,
        }, tx);
      }
    }

    // 2. إزالة بنود الشراء من المخزون
    const purchaseItems = await tx.select().from(purchaseItemsTable).where(eq(purchaseItemsTable.purchase_id, purchase.id));
    for (const item of purchaseItems) {
      const qty = Number(item.quantity);
      const purchaseUnitCost = Number(item.unit_price);
      const [prod] = await tx.select().from(productsTable).where(eq(productsTable.id, item.product_id));
      if (prod) {
        const oldQty = Number(prod.quantity);
        const oldWAC = Number(prod.cost_price);
        const newQty = Math.max(0, oldQty - qty);
        let newWAC = oldWAC;
        if (newQty > 0) {
          newWAC = Math.max(0, (oldQty * oldWAC - qty * purchaseUnitCost) / newQty);
        }
        await tx.update(productsTable)
          .set({ quantity: String(newQty), cost_price: String(newWAC.toFixed(4)) })
          .where(eq(productsTable.id, item.product_id));

        await tx.insert(stockMovementsTable).values({
          product_id: item.product_id,
          product_name: item.product_name,
          movement_type: "adjustment",
          quantity: String(-qty),
          quantity_before: String(oldQty),
          quantity_after: String(newQty),
          unit_cost: String(purchaseUnitCost),
          reference_type: "purchase_cancel",
          reference_id: purchase.id,
          reference_no: purchase.invoice_no,
          notes: `إلغاء فاتورة مشتريات ${purchase.invoice_no}`,
          date: today,
        });
      }
    }

    // 3. عكس رصيد العميل-المورد (الآجل)
    const remainingAmt = Number(purchase.remaining_amount);
    if (remainingAmt > 0 && purchase.customer_id) {
      const [cust] = await tx.select().from(customersTable).where(eq(customersTable.id, purchase.customer_id));
      if (cust) {
        await tx.update(customersTable)
          .set({ balance: String(Number(cust.balance) + remainingAmt) })
          .where(eq(customersTable.id, cust.id));

        await tx.insert(customerLedgerTable).values({
          customer_id: purchase.customer_id,
          type: "purchase_cancel",
          amount: String(remainingAmt),
          reference_type: "purchase_cancel",
          reference_id: purchase.id,
          reference_no: purchase.invoice_no,
          description: `إلغاء فاتورة مشتريات ${purchase.invoice_no}`,
          date: today,
        });
      }
    }

    // 4. عكس رصيد الخزينة (النقدي)
    const paidAmt = Number(purchase.paid_amount);
    if (paidAmt > 0) {
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
          type: "purchase_cancel",
          reference_type: "purchase_cancel",
          reference_id: purchase.id,
          safe_id: txRow.safe_id,
          safe_name: txRow.safe_name ?? "",
          amount: String(paidAmt),
          direction: "in",
          description: `إلغاء فاتورة مشتريات ${purchase.invoice_no}`,
          date: today,
        });
      }
    }

    // 5. تحديث حالة الفاتورة
    await tx.update(purchasesTable)
      .set({ posting_status: "cancelled" })
      .where(eq(purchasesTable.id, id));
  });

  const [updated] = await db.select().from(purchasesTable).where(eq(purchasesTable.id, id));
  res.json(formatPurchase(updated));
}));

export default router;
