import { Router, type IRouter } from "express";
import { eq, and, gt, ne, not, inArray } from "drizzle-orm";
import { db, salesTable, saleItemsTable, productsTable, customersTable, transactionsTable, safesTable, warehousesTable, erpUsersTable, stockMovementsTable, accountsTable, salesReturnsTable, receiptVouchersTable, journalEntriesTable, journalEntryLinesTable, customerLedgerTable } from "@workspace/db";
import {
  GetSalesResponse,
  CreateSaleBody,
  GetSaleByIdParams,
  GetSaleByIdResponse,
} from "@workspace/api-zod";
import { wrap, httpError } from "../lib/async-handler";
import { triggerBackup } from "../lib/backup-service";
import { assertPeriodOpen } from "../lib/period-lock";
import { getCustomerLedgerBalance } from "../lib/ledger-balance";
import { runAllChecks } from "../lib/alert-service";
import {
  getOrCreateSalesRevenueAccount,
  getOrCreateSafeAccount,
  getOrCreateCustomerAccount,
  getOrCreateCOGSAccount,
  getOrCreateInventoryAccount,
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
    cost_price: item.cost_price != null ? Number(item.cost_price) : null,
    cost_total: item.cost_total != null ? Number(item.cost_total) : null,
    quantity_returned: item.quantity_returned != null ? Number(item.quantity_returned) : null,
  };
}

router.get("/sales", wrap(async (req, res) => {
  const role = req.user?.role ?? "cashier";
  const queryWarehouseId = req.query.warehouse_id ? parseInt(String(req.query.warehouse_id), 10) : null;
  const effectiveWarehouseId = (role === "admin" || role === "manager")
    ? queryWarehouseId
    : (req.user?.warehouse_id ?? null);
  if ((role === "cashier" || role === "salesperson") && effectiveWarehouseId === null) {
    res.status(403).json({ error: "المستخدم غير مرتبط بمخزن" }); return;
  }
  const sales = effectiveWarehouseId
    ? await db.select().from(salesTable).where(eq(salesTable.warehouse_id, effectiveWarehouseId)).orderBy(salesTable.created_at)
    : await db.select().from(salesTable).orderBy(salesTable.created_at);
  res.json(GetSalesResponse.parse(sales.map(formatSale)));
}));

router.post("/sales", wrap(async (req, res) => {
  const parsed = CreateSaleBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  const requestId = req.headers["x-request-id"]
    ? String(req.headers["x-request-id"])
    : null;

  if (requestId) {
    const existing = await db
      .select()
      .from(salesTable)
      .where(eq(salesTable.request_id, String(requestId)))
      .limit(1);

    if (existing.length > 0) {
      return res.json(existing[0]);
    }
  }
  const {
    payment_type, total_amount, paid_amount, items, customer_name, customer_id,
    notes, date, safe_id, warehouse_id, salesperson_id,
    discount_percent, discount_amount,
  } = parsed.data;
  const remaining = total_amount - paid_amount;

  if ((payment_type === "cash" || payment_type === "partial") && paid_amount > 0 && !safe_id) {
    return res.status(400).json({ error: "يجب اختيار الخزينة للمبيعات النقدية" });
  }

  await assertPeriodOpen(date, req);

  const role = req.user?.role ?? "cashier";
  const queryWarehouseId = req.query.warehouse_id ? parseInt(String(req.query.warehouse_id), 10) : null;
  const effectiveWarehouseId = (role === "admin" || role === "manager") ? queryWarehouseId : (req.user?.warehouse_id ?? null);

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
        request_id: requestId,
      }).returning();

      // 3. البنود: خصم المخزون + تسجيل التكلفة + حركة مخزون صادر
      for (const item of items) {
        const [prod] = await tx.select().from(productsTable).where(eq(productsTable.id, item.product_id));
        const costAtSale = prod ? Number(prod.cost_price) : 0;
        const costTotal = costAtSale * item.quantity;
        const oldQty = prod ? Number(prod.quantity) : 0;

        if (oldQty < item.quantity - 0.001) {
          throw httpError(
            400,
            `كمية "${item.product_name}" في المخزون (${oldQty.toFixed(3)}) أقل من الكمية المطلوبة (${item.quantity}) — لا يمكن البيع بكميات تتجاوز المخزون المتاح`,
          );
        }

        const newQty = oldQty - item.quantity;

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
            warehouse_id: warehouse_id ?? effectiveWarehouseId ?? 1,
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

      // 6. دفتر أستاذ العميل — تسجيل فوري بصرف النظر عن الترحيل
      if (customer_id) {
        // أ. الدين المتبقي على العميل (إجمالي البيع أو المتبقي)
        if (total_amount > 0) {
          await tx.insert(customerLedgerTable).values({
            customer_id,
            type: "sale",
            amount: String(total_amount),
            reference_type: "sale",
            reference_id: newSale.id,
            reference_no: invoiceNo,
            description: `فاتورة مبيعات ${invoiceNo}`,
            date: date ?? new Date().toISOString().split("T")[0],
          });
        }
        // ب. الدفعة الفورية (نقدي / جزئي) → تُقلّل الدين
        if (paid_amount > 0) {
          await tx.insert(customerLedgerTable).values({
            customer_id,
            type: "payment",
            amount: String(-paid_amount),
            reference_type: "sale",
            reference_id: newSale.id,
            reference_no: invoiceNo,
            description: `دفعة فورية على فاتورة ${invoiceNo}`,
            date: date ?? new Date().toISOString().split("T")[0],
          });
        }
      }

      // 7. الحركة المالية المركزية
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
  return res.status(201).json(formatSale(sale));
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
//
// قيد الإيراد (Revenue Entry):
//   مدين:  خزينة (SAFE) بمبلغ المحصّل — أو ذمم عميل (AR) بالمتبقي
//   دائن:  إيرادات المبيعات (REV-SALES) بالإجمالي
//
// قيد تكلفة البضاعة المباعة (COGS Entry):
//   مدين:  تكلفة البضاعة المباعة (EXP-COGS) بإجمالي تكلفة الأصناف
//   دائن:  مخزون البضاعة (ASSET-INVENTORY) بنفس المبلغ
//
// هذا يضمن:
//   - ظهور الإيرادات وتكلفة البضاعة بشكل صحيح في قائمة الدخل
//   - انخفاض قيمة المخزون في الميزانية العمومية عند البيع
//   - الربح = الإيرادات - COGS (وليس مجرد الفارق بين سعر البيع وتكلفة المنتج الحالية)
//
async function buildSaleJournalLines(sale: typeof salesTable.$inferSelect): Promise<JournalLine[]> {
  const total  = Number(sale.total_amount);
  const paid   = Number(sale.paid_amount);
  const debt   = total - paid;
  const lines: JournalLine[] = [];

  // ── قيد الإيراد ─────────────────────────────────────────────────────────
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

  // ── قيد تكلفة البضاعة المباعة (COGS) ────────────────────────────────────
  // نحسب إجمالي التكلفة من بنود الفاتورة (cost_total مخزّن وقت البيع = متوسط مرجّح تاريخي)
  const saleItems = await db.select({ cost_total: saleItemsTable.cost_total })
    .from(saleItemsTable)
    .where(eq(saleItemsTable.sale_id, sale.id));

  const totalCOGS = saleItems.reduce((sum, item) => sum + Number(item.cost_total), 0);

  if (totalCOGS > 0) {
    const cogsAcct      = await getOrCreateCOGSAccount();
    const inventoryAcct = await getOrCreateInventoryAccount();
    lines.push({ account: cogsAcct,      debit: totalCOGS, credit: 0 });
    lines.push({ account: inventoryAcct, debit: 0, credit: totalCOGS });
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

  await assertPeriodOpen(sale.date, req);

  const lines = await buildSaleJournalLines(sale);

  const updated = await db.transaction(async (tx) => {
    if (lines.length >= 2) {
      await createJournalEntry({
        date: sale.date ?? new Date().toISOString().split("T")[0],
        description: `فاتورة مبيعات ${sale.invoice_no}${sale.customer_name ? ` — ${sale.customer_name}` : ""}`,
        reference: sale.invoice_no,
        lines,
      }, tx);
    }
    const [row] = await tx.update(salesTable)
      .set({ posting_status: "posted" })
      .where(eq(salesTable.id, id))
      .returning();
    return row;
  });

  // Fire-and-forget alert checks after posting
  const saleItems = await db.select({ product_id: saleItemsTable.product_id })
    .from(saleItemsTable).where(eq(saleItemsTable.sale_id, id));
  const customerIdForAlert = updated.customer_id ?? undefined;
  void runAllChecks({ customerId: customerIdForAlert });
  for (const item of saleItems) {
    if (item.product_id) void runAllChecks({ productId: item.product_id });
  }

  // Fire-and-forget backup after sale post
  void triggerBackup("sale_post");

  res.json(formatSale(updated));
}));

/* ── إلغاء الفاتورة → عكس كامل (مخزون + أرصدة + قيد محاسبي) ─────────── */
router.post("/sales/:id/cancel", wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) throw httpError(400, "معرّف غير صحيح");

  const [sale] = await db.select().from(salesTable).where(eq(salesTable.id, id));
  if (!sale) throw httpError(404, "الفاتورة غير موجودة");
  if (sale.posting_status === "cancelled") throw httpError(400, "الفاتورة ملغاة بالفعل");

  // ── التحقق: لا يمكن إلغاء فاتورة بها مرتجعات ────────────────────────────
  const existingReturns = await db.select({ id: salesReturnsTable.id })
    .from(salesReturnsTable)
    .where(eq(salesReturnsTable.sale_id, id));
  if (existingReturns.length > 0) {
    throw httpError(400, "لا يمكن إلغاء فاتورة مرتبطة بمرتجعات — يجب حذف المرتجعات أولاً");
  }

  // ── فحص 1: سندات قبض لاحقة مقيّدة على نفس العميل ───────────────────────
  // إذا وجدت سندات قبض غير ملغاة بعد تاريخ الفاتورة → توقف
  // (الإلغاء يرد ذمة العميل ؛ لكن تلك الذمة ربما سُدِّدت جزئياً بهذه السندات)
  if (sale.customer_id && Number(sale.remaining_amount) > 0) {
    const laterRVs = await db
      .select({ id: receiptVouchersTable.id, voucher_no: receiptVouchersTable.voucher_no })
      .from(receiptVouchersTable)
      .where(and(
        eq(receiptVouchersTable.customer_id, sale.customer_id),
        gt(receiptVouchersTable.date, sale.date ?? ""),
        ne(receiptVouchersTable.posting_status, "cancelled"),
      ));
    if (laterRVs.length > 0) {
      const nos = laterRVs.map(v => v.voucher_no).join("، ");
      throw httpError(400,
        `لا يمكن الإلغاء: توجد ${laterRVs.length} سند(ات) قبض مُسجَّلة على هذا العميل بعد تاريخ الفاتورة (${nos}) — قد تكون مقيّدة على هذه الذمة`
      );
    }
  }

  // ── فحص 2: الإلغاء سيجعل رصيد العميل المحاسبي سالباً (مرحَّلة فقط) ────────
  // لا نفحص المسوّدات لأنها لم تُرحَّل بعد (لا قيود محاسبية بعد)
  if (sale.posting_status === "posted" && sale.customer_id && Number(sale.remaining_amount) > 0.001) {
    const [custRow] = await db
      .select({ account_id: customersTable.account_id, name: customersTable.name })
      .from(customersTable)
      .where(eq(customersTable.id, sale.customer_id));
    if (custRow) {
      const ledgerBal = await getCustomerLedgerBalance(custRow.account_id);
      if (ledgerBal < Number(sale.remaining_amount) - 0.001) {
        throw httpError(400,
          `لا يمكن الإلغاء: رصيد دفتر الأستاذ للعميل (${ledgerBal.toFixed(2)}) أقل من الذمة المُراد عكسها (${Number(sale.remaining_amount).toFixed(2)}) — الإلغاء سيجعل الرصيد سالباً`
        );
      }
    }
  }

  // ── فحص 3: قيود محاسبية لاحقة على نفس الحسابات ─────────────────────────
  // نجد القيد المرتبط بهذه الفاتورة ثم نتحقق من وجود قيود أحدث على نفس الحسابات
  if (sale.posting_status === "posted") {
    const [saleJE] = await db
      .select({ id: journalEntriesTable.id })
      .from(journalEntriesTable)
      .where(eq(journalEntriesTable.reference, sale.invoice_no));

    if (saleJE) {
      const jeLines = await db
        .select({ account_id: journalEntryLinesTable.account_id })
        .from(journalEntryLinesTable)
        .where(eq(journalEntryLinesTable.entry_id, saleJE.id));

      const accountIds = [...new Set(jeLines.map(l => l.account_id))];
      if (accountIds.length > 0) {
        const laterLines = await db
          .select({ entry_id: journalEntryLinesTable.entry_id })
          .from(journalEntryLinesTable)
          .innerJoin(journalEntriesTable, eq(journalEntryLinesTable.entry_id, journalEntriesTable.id))
          .where(and(
            inArray(journalEntryLinesTable.account_id, accountIds),
            gt(journalEntriesTable.date, sale.date ?? ""),
            not(eq(journalEntriesTable.id, saleJE.id)),
          ))
          .limit(1);

        if (laterLines.length > 0) {
          throw httpError(400,
            "لا يمكن العكس: توجد قيود محاسبية لاحقة مبنية على نفس حسابات هذه الفاتورة — راجع دفتر الأستاذ قبل الإلغاء"
          );
        }
      }
    }
  }

  await assertPeriodOpen(sale.date, req);

  const role = req.user?.role ?? "cashier";
  const queryWarehouseId = req.query.warehouse_id ? parseInt(String(req.query.warehouse_id), 10) : null;
  const effectiveWarehouseId = (role === "admin" || role === "manager") ? queryWarehouseId : (req.user?.warehouse_id ?? null);

  const today = new Date().toISOString().split("T")[0];

  await db.transaction(async (tx) => {
    // ── 1. عكس القيد المحاسبي (للفواتير المرحَّلة فقط) ──────────────────
    if (sale.posting_status === "posted") {
      const lines = await buildSaleJournalLines(sale);
      if (lines.length >= 2) {
        const reversed = lines.map(l => ({ account: l.account, debit: l.credit, credit: l.debit }));
        await createJournalEntry({
          date: today,
          description: `إلغاء فاتورة مبيعات ${sale.invoice_no}${sale.customer_name ? ` — ${sale.customer_name}` : ""}`,
          reference: `REV-${sale.invoice_no}`,
          lines: reversed,
        }, tx);
      }
    }

    // ── 2. إعادة المخزون لكل بند + تعديل WAC ─────────────────────────────
    // نستخدم cost_price المحفوظ في sale_items (= WAC التاريخي وقت البيع)
    const saleItems = await tx.select().from(saleItemsTable)
      .where(eq(saleItemsTable.sale_id, sale.id));

    for (const item of saleItems) {
      const qty          = Number(item.quantity);
      const costAtSale   = Number(item.cost_price);

      const [prod] = await tx.select().from(productsTable).where(eq(productsTable.id, item.product_id));
      if (prod) {
        const oldQty = Number(prod.quantity);
        const oldWAC = Number(prod.cost_price);
        const newQty = oldQty + qty;
        const newWAC = newQty > 0
          ? ((oldQty * oldWAC) + (qty * costAtSale)) / newQty
          : costAtSale;

        await tx.update(productsTable)
          .set({ quantity: String(newQty), cost_price: String(newWAC.toFixed(4)) })
          .where(eq(productsTable.id, item.product_id));

        await tx.insert(stockMovementsTable).values({
          product_id:      item.product_id,
          product_name:    item.product_name,
          movement_type:   "adjustment",
          quantity:        String(qty),
          quantity_before: String(oldQty),
          quantity_after:  String(newQty),
          unit_cost:       String(costAtSale),
          reference_type:  "sale_cancel",
          reference_id:    sale.id,
          reference_no:    sale.invoice_no,
          notes:           `إلغاء فاتورة مبيعات ${sale.invoice_no}`,
          date:            today,
          warehouse_id:    sale.warehouse_id ?? effectiveWarehouseId ?? 1,
        });
      }
    }

    // ── 3. عكس رصيد العميل (الآجل / الجزئي) ─────────────────────────────
    const remainingAmt = Number(sale.remaining_amount);
    if (remainingAmt > 0 && sale.customer_id) {
      const [cust] = await tx.select().from(customersTable).where(eq(customersTable.id, sale.customer_id));
      if (cust) {
        await tx.update(customersTable)
          .set({ balance: String(Number(cust.balance) - remainingAmt) })
          .where(eq(customersTable.id, cust.id));
      }
    }

    // ── 4. عكس رصيد الخزينة (النقدي / الجزئي) ────────────────────────────
    const paidAmt = Number(sale.paid_amount);
    if (paidAmt > 0 && sale.safe_id) {
      const [safe] = await tx.select().from(safesTable).where(eq(safesTable.id, sale.safe_id));
      if (safe) {
        await tx.update(safesTable)
          .set({ balance: String(Number(safe.balance) - paidAmt) })
          .where(eq(safesTable.id, sale.safe_id));
      }
      await tx.insert(transactionsTable).values({
        type:           "sale_cancel",
        reference_type: "sale_cancel",
        reference_id:   sale.id,
        safe_id:        sale.safe_id,
        safe_name:      sale.safe_name ?? "",
        customer_id:    sale.customer_id ?? null,
        customer_name:  sale.customer_name ?? null,
        amount:         String(paidAmt),
        direction:      "out",
        description:    `إلغاء فاتورة مبيعات ${sale.invoice_no}`,
        date:           today,
      });
    }

    // ── 5. عكس قيود دفتر الأستاذ (مصدر الحقيقة الوحيد) ──────────────────
    // بدلاً من حذف القيود القديمة، نُدرج قيوداً عكسية للشفافية
    if (sale.customer_id) {
      const totalAmt = Number(sale.total_amount);
      if (totalAmt > 0) {
        await tx.insert(customerLedgerTable).values({
          customer_id: sale.customer_id,
          type: "sale_cancel",
          amount: String(-totalAmt),
          reference_type: "sale",
          reference_id: sale.id,
          reference_no: sale.invoice_no,
          description: `إلغاء فاتورة مبيعات ${sale.invoice_no}`,
          date: today,
        });
      }
      if (paidAmt > 0) {
        await tx.insert(customerLedgerTable).values({
          customer_id: sale.customer_id,
          type: "sale_cancel",
          amount: String(paidAmt),
          reference_type: "sale",
          reference_id: sale.id,
          reference_no: sale.invoice_no,
          description: `إلغاء دفعة فاتورة ${sale.invoice_no}`,
          date: today,
        });
      }
    }

    // ── 6. تحديث حالة الفاتورة ────────────────────────────────────────────
    await tx.update(salesTable)
      .set({ posting_status: "cancelled" })
      .where(eq(salesTable.id, id));
  });

  const [updated] = await db.select().from(salesTable).where(eq(salesTable.id, id));
  res.json(formatSale(updated));
}));

export default router;
