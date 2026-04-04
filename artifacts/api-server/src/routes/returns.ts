import { Router, type IRouter } from "express";
import { eq, desc, and, sql } from "drizzle-orm";
import {
  db, salesReturnsTable, saleReturnItemsTable,
  purchaseReturnsTable, purchaseReturnItemsTable,
  productsTable, customersTable, safesTable, transactionsTable, stockMovementsTable,
  saleItemsTable, purchaseItemsTable, customerLedgerTable,
} from "@workspace/db";

import { wrap, httpError } from "../lib/async-handler";
import { assertPeriodOpen } from "../lib/period-lock";
import { writeAuditLog } from "../lib/audit-log";
import { hasPermission } from "../lib/permissions";

const router: IRouter = Router();

// ══════════════════════════════════════════════════════════════════════════════
// مرتجعات المبيعات
// ══════════════════════════════════════════════════════════════════════════════

router.get("/sales-returns", wrap(async (_req, res) => {
  const items = await db.select().from(salesReturnsTable).orderBy(desc(salesReturnsTable.created_at));
  res.json(items.map(r => ({ ...r, total_amount: Number(r.total_amount), created_at: r.created_at.toISOString() })));
}));

router.get("/sales-returns/:id", wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }
  const [ret] = await db.select().from(salesReturnsTable).where(eq(salesReturnsTable.id, id));
  if (!ret) { res.status(404).json({ error: "غير موجود" }); return; }
  const items = await db.select().from(saleReturnItemsTable).where(eq(saleReturnItemsTable.return_id, id));
  res.json({
    ...ret,
    total_amount: Number(ret.total_amount),
    created_at: ret.created_at.toISOString(),
    items: items.map(i => ({
      ...i,
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
      total_price: Number(i.total_price),
      unit_cost_at_return: Number(i.unit_cost_at_return),
      total_cost_at_return: Number(i.total_cost_at_return),
    })),
  });
}));

/*
 * POST /sales-returns
 *
 * كل بند مرتجع يجب أن يحمل:
 *   original_sale_item_id  — معرّف البند الدقيق من sale_items (مطلوب عند وجود sale_id)
 *   product_id
 *   product_name
 *   quantity               — الكمية المُرتجَعة
 *   unit_price             — سعر البيع (للمبلغ المسترد)
 *   total_price
 *
 * الرابط بـ original_sale_item_id يحل مشكلة الغموض عندما يظهر نفس المنتج
 * في أكثر من بند بنفس الفاتورة وبتكاليف مختلفة.
 */
router.post("/sales-returns", wrap(async (req, res) => {
  const { sale_id, customer_id, customer_name, items, reason, notes, date, refund_type, safe_id } = req.body;
  if (!items?.length) { return res.status(400).json({ error: "أضف أصناف المرتجع" }); }

  const requestId = req.headers["x-request-id"]
    ? String(req.headers["x-request-id"])
    : null;

  if (requestId) {
    const [existing] = await db.select().from(salesReturnsTable)
      .where(eq(salesReturnsTable.request_id, requestId)).limit(1);
    if (existing) return res.json({ ...existing, total_amount: Number(existing.total_amount), created_at: existing.created_at.toISOString() });
  }

  const total: number = items.reduce((s: number, i: { total_price: number }) => s + Number(i.total_price), 0);
  const return_no = `SR-${Date.now()}`;
  const rtype: string = refund_type === "cash" ? "cash" : "credit";
  const txDate = date ?? new Date().toISOString().split("T")[0];

  await assertPeriodOpen(txDate, req);

  const role = req.user?.role ?? "cashier";
  const effectiveWarehouseId = (role === "admin" || role === "manager")
    ? (req.body.warehouse_id ? Number(req.body.warehouse_id) : null)
    : (req.user?.warehouse_id ?? null);

  const ret = await db.transaction(async (tx) => {
    let safeName: string | null = null;
    let safeIdInt: number | null = null;
    if (rtype === "cash" && safe_id) {
      const [safe] = await tx.select().from(safesTable).where(eq(safesTable.id, parseInt(safe_id)));
      if (!safe) throw httpError(400, "الخزينة غير موجودة");
      safeName = safe.name;
      safeIdInt = safe.id;
    }

    const [ret] = await tx.insert(salesReturnsTable).values({
      request_id: requestId,
      return_no,
      sale_id: sale_id ?? null,
      customer_id: customer_id ? parseInt(customer_id) : null,
      customer_name: customer_name ?? null,
      total_amount: String(total),   // سيُحدَّث بالقيمة المقفولة بعد الحلقة
      refund_type: rtype,
      safe_id: safeIdInt,
      safe_name: safeName,
      date: txDate,
      reason: reason ?? null,
      notes: notes ?? null,
      user_id: req.user?.id ?? null,
      warehouse_id: effectiveWarehouseId ?? null,
      company_id: req.user?.company_id ?? 1,
    }).returning();

    let actualTotal = 0;

    for (const item of items) {
      const retQty = Number(item.quantity);
      const origSaleItemId: number | null = item.original_sale_item_id
        ? parseInt(item.original_sale_item_id)
        : null;

      // ── التحقق من البند الأصلي وحساب التكلفة ──────────────────────────────
      // القاعدة 1: إن كان original_sale_item_id موجوداً نستخدمه مباشرة (الأدق)
      //   → سعر المرتجع يُقفل على سعر البيع الأصلي (لا override)
      // القاعدة 2: إن لم يوجد نبحث بـ sale_id + product_id (احتياطي)
      // القاعدة 3: إن لم يوجد نستخدم cost_price الحالي للمنتج
      let unitCostAtSale  = 0;
      let resolvedItemId: number | null = origSaleItemId;
      // السعر الفعلي للمرتجع — يُقفل على الأصل إن وُجد
      let lockedSalePrice = Number(item.unit_price);

      if (origSaleItemId) {
        const [origItem] = await tx
          .select()
          .from(saleItemsTable)
          .where(eq(saleItemsTable.id, origSaleItemId));

        if (!origItem) throw httpError(400, `بند البيع الأصلي ${origSaleItemId} غير موجود`);

        const alreadyReturned = Number(origItem.quantity_returned);
        const remaining       = Number(origItem.quantity) - alreadyReturned;

        if (retQty > remaining + 0.0001) {
          throw httpError(400,
            `الكمية المطلوب إرجاعها (${retQty}) تتجاوز الكمية المتاحة للإرجاع (${remaining.toFixed(3)}) للبند ${origItem.product_name}`
          );
        }

        // قفل السعر على سعر البيع الأصلي — لا يمكن تعديله من الواجهة
        lockedSalePrice = Number(origItem.unit_price);
        unitCostAtSale  = Number(origItem.cost_price);

        // تحديث quantity_returned على البند الأصلي
        await tx.update(saleItemsTable)
          .set({ quantity_returned: String((alreadyReturned + retQty).toFixed(3)) })
          .where(eq(saleItemsTable.id, origSaleItemId));

      } else if (sale_id) {
        // احتياطي — بحث بـ sale_id + product_id (قد يكون غامضاً)
        const origItems = await tx
          .select()
          .from(saleItemsTable)
          .where(and(
            eq(saleItemsTable.sale_id, parseInt(sale_id)),
            eq(saleItemsTable.product_id, item.product_id),
          ));

        if (origItems.length > 0) {
          // في حالة التعدد، نختار أول بند لا يزال لديه كمية متاحة
          const available = origItems.find(r =>
            (Number(r.quantity) - Number(r.quantity_returned)) >= retQty - 0.0001
          ) ?? origItems[0];

          unitCostAtSale  = Number(available.cost_price);
          resolvedItemId  = available.id;

          const alreadyReturned = Number(available.quantity_returned);
          await tx.update(saleItemsTable)
            .set({ quantity_returned: String((alreadyReturned + retQty).toFixed(3)) })
            .where(eq(saleItemsTable.id, available.id));
        }
      }

      if (unitCostAtSale === 0) {
        const [prod] = await tx.select({ cost_price: productsTable.cost_price })
          .from(productsTable).where(eq(productsTable.id, item.product_id));
        if (prod) unitCostAtSale = Number(prod.cost_price);
      }

      const totalCostAtReturn = unitCostAtSale * retQty;

      const lockedTotalPrice = lockedSalePrice * retQty;
      actualTotal += lockedTotalPrice;

      // ── إدراج بند المرتجع ─────────────────────────────────────────────────
      await tx.insert(saleReturnItemsTable).values({
        return_id:              ret.id,
        product_id:             item.product_id,
        product_name:           item.product_name,
        quantity:               String(retQty),
        unit_price:             String(lockedSalePrice),
        total_price:            String(lockedTotalPrice.toFixed(2)),
        original_sale_item_id:  resolvedItemId,
        unit_cost_at_return:    String(unitCostAtSale),
        total_cost_at_return:   String(totalCostAtReturn),
      });

      // ── إعادة المخزون بالتكلفة الأصلية + تحديث WAC ───────────────────────
      const [prodNow] = await tx.select().from(productsTable).where(eq(productsTable.id, item.product_id));
      if (prodNow) {
        const oldQty = Number(prodNow.quantity);
        const oldWAC = Number(prodNow.cost_price);
        const newQty = oldQty + retQty;
        const newWAC = newQty > 0
          ? ((oldQty * oldWAC) + (retQty * unitCostAtSale)) / newQty
          : unitCostAtSale;

        await tx.update(productsTable)
          .set({
            quantity:   String(newQty),
            cost_price: String(newWAC.toFixed(4)),
          })
          .where(eq(productsTable.id, item.product_id));

        await tx.insert(stockMovementsTable).values({
          product_id:      item.product_id,
          product_name:    item.product_name,
          movement_type:   "sale_return",
          quantity:        String(retQty),
          quantity_before: String(oldQty),
          quantity_after:  String(newQty),
          unit_cost:       String(unitCostAtSale),
          reference_type:  "sale_return",
          reference_id:    ret.id,
          reference_no:    return_no,
          notes: customer_name ? `مرتجع مبيعات من ${customer_name}` : "مرتجع مبيعات",
          date: txDate,
          warehouse_id: effectiveWarehouseId ?? 1,
        });
      }
    }

    // تحديث المبلغ بالقيمة المقفولة إن اختلفت
    if (Math.abs(actualTotal - total) > 0.001) {
      await tx.update(salesReturnsTable)
        .set({ total_amount: String(actualTotal.toFixed(2)) })
        .where(eq(salesReturnsTable.id, ret.id));
      ret.total_amount = String(actualTotal.toFixed(2));
    }

    const finalTotal = actualTotal > 0 ? actualTotal : total;

    // ── أثر الأرصدة ────────────────────────────────────────────────────────
    if (rtype === "credit") {
      if (customer_id) {
        const [cust] = await tx.select().from(customersTable).where(eq(customersTable.id, parseInt(customer_id)));
        if (cust) {
          await tx.update(customersTable)
            .set({ balance: String(Number(cust.balance) - finalTotal) })
            .where(eq(customersTable.id, cust.id));
        }
      }
    } else if (rtype === "cash" && safeIdInt) {
      const [safe] = await tx.select().from(safesTable).where(eq(safesTable.id, safeIdInt));
      if (safe) {
        await tx.update(safesTable)
          .set({ balance: String(Number(safe.balance) - finalTotal) })
          .where(eq(safesTable.id, safeIdInt));
      }
      await tx.insert(transactionsTable).values({
        type: "sale_return",
        reference_type: "sale_return",
        reference_id: ret.id,
        safe_id: safeIdInt,
        safe_name: safeName ?? "",
        customer_id: customer_id ? parseInt(customer_id) : null,
        customer_name: customer_name ?? null,
        amount: String(finalTotal.toFixed(2)),
        direction: "out",
        description: `مرتجع مبيعات نقدي ${return_no}${customer_name ? ` — ${customer_name}` : ""}`,
        date: txDate,
      });
    }

    // ── دفتر أستاذ العميل — تسجيل مرتجع المبيعات (يُقلّل الدين) ─────────
    if (customer_id) {
      await tx.insert(customerLedgerTable).values({
        customer_id: parseInt(customer_id),
        type: "sale_return",
        amount: String(-finalTotal),
        reference_type: "sale_return",
        reference_id: ret.id,
        reference_no: return_no,
        description: `مرتجع مبيعات ${return_no}${customer_name ? ` — ${customer_name}` : ""}`,
        date: txDate,
      });
    }

    return ret;
  });

  void writeAuditLog({
    action: "create",
    record_type: "sale_return",
    record_id: ret.id,
    new_value: { return_no, total, customer_id: customer_id ?? null, refund_type: rtype, date: txDate },
    user: { id: req.user?.id, username: req.user?.username },
  });

  return res.status(201).json({ ...ret, total_amount: Number(ret.total_amount), created_at: ret.created_at.toISOString() });
}));

router.delete("/sales-returns/:id", wrap(async (req, res) => {
  if (!hasPermission(req.user, "can_cancel_sale")) {
    res.status(403).json({ error: "غير مصرح بحذف المرتجعات" }); return;
  }
  const id = parseInt(req.params.id as string);
  const [preCheck] = await db.select({ date: salesReturnsTable.date })
    .from(salesReturnsTable).where(eq(salesReturnsTable.id, id));
  if (!preCheck) throw httpError(404, "المرتجع غير موجود");
  await assertPeriodOpen(preCheck.date, req);

  const effectiveWarehouseId = req.user?.warehouse_id ?? null;

  await db.transaction(async (tx) => {
    const [ret] = await tx.select().from(salesReturnsTable).where(eq(salesReturnsTable.id, id));
    if (!ret) throw httpError(400, "المرتجع غير موجود");

    const retItems = await tx.select().from(saleReturnItemsTable).where(eq(saleReturnItemsTable.return_id, id));
    const total = Number(ret.total_amount);

    for (const item of retItems) {
      const retQty = Number(item.quantity);

      // ── إرجاع quantity_returned على البند الأصلي ─────────────────────────
      if (item.original_sale_item_id) {
        const [origItem] = await tx.select().from(saleItemsTable)
          .where(eq(saleItemsTable.id, item.original_sale_item_id));
        if (origItem) {
          const newReturned = Math.max(0, Number(origItem.quantity_returned) - retQty);
          await tx.update(saleItemsTable)
            .set({ quantity_returned: String(newReturned.toFixed(3)) })
            .where(eq(saleItemsTable.id, origItem.id));
        }
      }

      // ── عكس المخزون (البضاعة تخرج مرة أخرى) ─────────────────────────────
      const unitCost = Number(item.unit_cost_at_return) || Number(item.unit_price);
      const [prod] = await tx.select().from(productsTable).where(eq(productsTable.id, item.product_id));
      if (prod) {
        const oldQty = Number(prod.quantity);
        const newQty = Math.max(0, oldQty - retQty);

        // تعديل WAC عند إزالة الكمية المُرتجَعة (عكس الإضافة)
        const oldWAC = Number(prod.cost_price);
        let newWAC   = oldWAC;
        if (newQty > 0) {
          const currentValue = oldQty * oldWAC;
          const removedValue = retQty * unitCost;
          newWAC = Math.max(0, (currentValue - removedValue) / newQty);
        }

        await tx.update(productsTable)
          .set({ quantity: String(newQty), cost_price: String(newWAC.toFixed(4)) })
          .where(eq(productsTable.id, item.product_id));

        await tx.insert(stockMovementsTable).values({
          product_id:      item.product_id,
          product_name:    item.product_name,
          movement_type:   "adjustment",
          quantity:        String(-retQty),
          quantity_before: String(oldQty),
          quantity_after:  String(newQty),
          unit_cost:       String(unitCost),
          reference_type:  "sale_return_cancel",
          reference_id:    ret.id,
          reference_no:    ret.return_no,
          notes:           `إلغاء مرتجع مبيعات ${ret.return_no}`,
          date:            new Date().toISOString().split("T")[0],
          warehouse_id:    effectiveWarehouseId ?? 1,
        });
      }
    }

    // ── عكس الأرصدة ─────────────────────────────────────────────────────────
    if (ret.refund_type === "credit" && ret.customer_id) {
      const [cust] = await tx.select().from(customersTable).where(eq(customersTable.id, ret.customer_id));
      if (cust) {
        await tx.update(customersTable)
          .set({ balance: String(Number(cust.balance) + total) })
          .where(eq(customersTable.id, cust.id));
      }
    } else if (ret.refund_type === "cash" && ret.safe_id) {
      const [safe] = await tx.select().from(safesTable).where(eq(safesTable.id, ret.safe_id));
      if (safe) {
        await tx.update(safesTable)
          .set({ balance: String(Number(safe.balance) + total) })
          .where(eq(safesTable.id, ret.safe_id));
      }
      await tx.insert(transactionsTable).values({
        type: "sale_return_cancel",
        reference_type: "sale_return_cancel",
        reference_id: ret.id,
        safe_id: ret.safe_id,
        safe_name: ret.safe_name ?? "",
        customer_id: ret.customer_id ?? null,
        customer_name: ret.customer_name ?? null,
        amount: String(total),
        direction: "in",
        description: `إلغاء مرتجع مبيعات نقدي ${ret.return_no}`,
        date: new Date().toISOString().split("T")[0],
      });
    }

    await tx.delete(saleReturnItemsTable).where(eq(saleReturnItemsTable.return_id, id));
    await tx.delete(salesReturnsTable).where(eq(salesReturnsTable.id, id));
  });

  void writeAuditLog({
    action: "delete",
    record_type: "sale_return",
    record_id: id,
    user: { id: req.user?.id, username: req.user?.username },
  });

  res.json({ success: true });
}));

// ══════════════════════════════════════════════════════════════════════════════
// مرتجعات المشتريات
// ══════════════════════════════════════════════════════════════════════════════

router.get("/purchase-returns", wrap(async (_req, res) => {
  const items = await db.select().from(purchaseReturnsTable).orderBy(desc(purchaseReturnsTable.created_at));
  res.json(items.map(r => ({ ...r, total_amount: Number(r.total_amount), created_at: r.created_at.toISOString() })));
}));

router.get("/purchase-returns/:id", wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }
  const [ret] = await db.select().from(purchaseReturnsTable).where(eq(purchaseReturnsTable.id, id));
  if (!ret) { res.status(404).json({ error: "غير موجود" }); return; }
  const items = await db.select().from(purchaseReturnItemsTable).where(eq(purchaseReturnItemsTable.return_id, id));
  res.json({
    ...ret,
    total_amount: Number(ret.total_amount),
    created_at: ret.created_at.toISOString(),
    items: items.map(i => ({
      ...i,
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
      total_price: Number(i.total_price),
      unit_cost_at_return: Number(i.unit_cost_at_return),
      total_cost_at_return: Number(i.total_cost_at_return),
    })),
  });
}));

/*
 * POST /purchase-returns
 *
 * كل بند مرتجع يجب أن يحمل (اختياري عند وجود purchase_id):
 *   original_purchase_item_id — معرّف البند الدقيق من purchase_items
 *   product_id / product_name / quantity / unit_price / total_price
 *
 * التكلفة المستخدمة في WAC = unit_price من البند الأصلي (وليس من نموذج الإدخال)
 * لأن التكلفة الأصلية مخزّنة في purchase_items.unit_price.
 */
router.post("/purchase-returns", wrap(async (req, res) => {
  const {
    purchase_id, customer_id, customer_name, supplier_name,
    items, reason, notes, date,
    refund_type, safe_id,
  } = req.body;

  if (!items?.length) { return res.status(400).json({ error: "أضف أصناف المرتجع" }); }

  const requestId = req.headers["x-request-id"]
    ? String(req.headers["x-request-id"])
    : null;

  if (requestId) {
    const [existing] = await db.select().from(purchaseReturnsTable)
      .where(eq(purchaseReturnsTable.request_id, requestId)).limit(1);
    if (existing) return res.json({ ...existing, total_amount: Number(existing.total_amount), created_at: existing.created_at.toISOString() });
  }

  const total: number = items.reduce((s: number, i: { total_price: number }) => s + Number(i.total_price), 0);
  const return_no = `PR-${Date.now()}`;
  const txDate = date ?? new Date().toISOString().split("T")[0];
  const rtype: string = refund_type === "cash" ? "cash" : "balance_credit";

  await assertPeriodOpen(txDate, req);

  const effectiveWarehouseId = req.user?.warehouse_id ?? null;

  const ret = await db.transaction(async (tx) => {
    // ── الاسترداد النقدي: إضافة للخزينة ─────────────────────────────────────
    let safeIdInt: number | null = null;
    let safeNameStr: string | null = null;
    if (rtype === "cash") {
      if (!safe_id) throw httpError(400, "يجب اختيار الخزينة للاسترداد النقدي");
      const [safe] = await tx.select().from(safesTable).where(eq(safesTable.id, parseInt(safe_id)));
      if (!safe) throw httpError(400, "الخزينة غير موجودة");
      safeIdInt   = safe.id;
      safeNameStr = safe.name;

      await tx.update(safesTable)
        .set({ balance: String(Number(safe.balance) + total) })
        .where(eq(safesTable.id, safe.id));

      await tx.insert(transactionsTable).values({
        type: "purchase_return",
        reference_type: "purchase_return",
        safe_id: safe.id,
        safe_name: safe.name,
        amount: String(total),
        direction: "in",
        description: `مرتجع مشتريات نقدي ${return_no}${supplier_name ? ` — ${supplier_name}` : ""}`,
        date: txDate,
      });
    } else {
      // ── خصم من رصيد العميل-المورد في دفتر الأستاذ ─────────────────────────
      if (customer_id) {
        const custId = parseInt(customer_id);
        const [cust] = await tx.select().from(customersTable).where(eq(customersTable.id, custId));
        if (cust) {
          await tx.update(customersTable)
            .set({ balance: String(Number(cust.balance) + total) })
            .where(eq(customersTable.id, custId));
        }
        await tx.insert(customerLedgerTable).values({
          customer_id: custId,
          type: "purchase_return",
          amount: String(total),
          reference_type: "purchase_return",
          reference_id: 0,
          reference_no: return_no,
          description: `مرتجع مشتريات ${return_no}${customer_name ? ` — ${customer_name}` : ""}`,
          date: txDate,
        });
      }
    }

    // ── إنشاء سجل المرتجع ─────────────────────────────────────────────────
    const [ret] = await tx.insert(purchaseReturnsTable).values({
      request_id: requestId,
      return_no,
      purchase_id: purchase_id ?? null,
      customer_id: customer_id ? parseInt(customer_id) : null,
      customer_name: customer_name ?? supplier_name ?? null,
      total_amount: String(total),
      refund_type: rtype,
      safe_id: safeIdInt,
      safe_name: safeNameStr,
      date: txDate,
      reason: reason ?? null,
      notes: notes ?? null,
    }).returning();

    // ── بنود المرتجع: التحقق + المخزون + WAC ────────────────────────────────
    for (const item of items) {
      const retQty    = Number(item.quantity);
      const origPurchaseItemId: number | null = item.original_purchase_item_id
        ? parseInt(item.original_purchase_item_id)
        : null;

      // ── تحديد التكلفة التاريخية من بند الشراء الأصلي ─────────────────────
      // القاعدة 1: original_purchase_item_id (الأدق)
      // القاعدة 2: purchase_id + product_id (احتياطي)
      // القاعدة 3: unit_price من نموذج الإدخال (آخر احتياط)
      let historicalUnitCost: number = Number(item.unit_price); // fallback
      let resolvedPurchItemId: number | null = origPurchaseItemId;

      if (origPurchaseItemId) {
        const [origItem] = await tx.select().from(purchaseItemsTable)
          .where(eq(purchaseItemsTable.id, origPurchaseItemId));

        if (!origItem) throw httpError(400, `بند الشراء الأصلي ${origPurchaseItemId} غير موجود`);

        const alreadyReturned = Number(origItem.quantity_returned);
        const remaining       = Number(origItem.quantity) - alreadyReturned;

        if (retQty > remaining + 0.0001) {
          throw httpError(400,
            `الكمية المطلوب إرجاعها (${retQty}) تتجاوز الكمية المتاحة للإرجاع (${remaining.toFixed(3)}) للبند ${origItem.product_name}`
          );
        }

        historicalUnitCost = Number(origItem.unit_price);

        await tx.update(purchaseItemsTable)
          .set({ quantity_returned: String((alreadyReturned + retQty).toFixed(3)) })
          .where(eq(purchaseItemsTable.id, origPurchaseItemId));

      } else if (purchase_id) {
        // احتياطي — بحث بـ purchase_id + product_id
        const origItems = await tx.select().from(purchaseItemsTable)
          .where(and(
            eq(purchaseItemsTable.purchase_id, parseInt(purchase_id)),
            eq(purchaseItemsTable.product_id, item.product_id),
          ));

        if (origItems.length > 0) {
          const available = origItems.find(r =>
            (Number(r.quantity) - Number(r.quantity_returned)) >= retQty - 0.0001
          ) ?? origItems[0];

          historicalUnitCost = Number(available.unit_price);
          resolvedPurchItemId = available.id;

          const alreadyReturned = Number(available.quantity_returned);
          await tx.update(purchaseItemsTable)
            .set({ quantity_returned: String((alreadyReturned + retQty).toFixed(3)) })
            .where(eq(purchaseItemsTable.id, available.id));
        }
      }

      const totalCostAtReturn = historicalUnitCost * retQty;

      // ── إدراج بند المرتجع ─────────────────────────────────────────────────
      await tx.insert(purchaseReturnItemsTable).values({
        return_id:                  ret.id,
        product_id:                 item.product_id,
        product_name:               item.product_name,
        quantity:                   String(retQty),
        unit_price:                 String(item.unit_price),
        total_price:                String(item.total_price),
        original_purchase_item_id:  resolvedPurchItemId,
        unit_cost_at_return:        String(historicalUnitCost),
        total_cost_at_return:       String(totalCostAtReturn),
      });

      // ── خصم المخزون + إعادة حساب WAC ────────────────────────────────────
      //
      // عكس المشتريات: نُخرج الوحدات بتكلفة الشراء الأصلية (historicalUnitCost)
      // حتى يبقى رصيد المخزون صحيحاً.
      //
      // NewWAC = (currentQty × currentWAC − returnedQty × historicalUnitCost)
      //          / (currentQty − returnedQty)
      //
      const [prod] = await tx.select().from(productsTable).where(eq(productsTable.id, item.product_id));
      if (prod) {
        const oldQty  = Number(prod.quantity);
        const oldWAC  = Number(prod.cost_price);
        const newQty  = Math.max(0, oldQty - retQty);
        let   newWAC  = oldWAC;

        if (newQty > 0) {
          const oldTotalValue   = oldQty * oldWAC;
          const returnedValue   = retQty * historicalUnitCost;
          newWAC = Math.max(0, (oldTotalValue - returnedValue) / newQty);
        }

        await tx.update(productsTable)
          .set({ quantity: String(newQty), cost_price: String(newWAC.toFixed(4)) })
          .where(eq(productsTable.id, item.product_id));

        await tx.insert(stockMovementsTable).values({
          product_id:      item.product_id,
          product_name:    item.product_name,
          movement_type:   "purchase_return",
          quantity:        String(-retQty),
          quantity_before: String(oldQty),
          quantity_after:  String(newQty),
          unit_cost:       String(historicalUnitCost),
          reference_type:  "purchase_return",
          reference_id:    ret.id,
          reference_no:    return_no,
          notes: supplier_name ? `مرتجع مشتريات لـ ${supplier_name}` : "مرتجع مشتريات",
          date: txDate,
          warehouse_id: effectiveWarehouseId ?? 1,
        });
      }
    }

    return ret;
  });

  void writeAuditLog({
    action: "create",
    record_type: "purchase_return",
    record_id: ret.id,
    new_value: { return_no: ret.return_no, total: Number(ret.total_amount) },
    user: { id: req.user?.id, username: req.user?.username },
  });

  return res.status(201).json({ ...ret, total_amount: Number(ret.total_amount), created_at: ret.created_at.toISOString() });
}));

router.delete("/purchase-returns/:id", wrap(async (req, res) => {
  if (!hasPermission(req.user, "can_cancel_sale")) {
    res.status(403).json({ error: "غير مصرح بحذف مرتجعات المشتريات" }); return;
  }
  const id = parseInt(req.params.id as string);
  const [preCheck] = await db.select({ date: purchaseReturnsTable.date })
    .from(purchaseReturnsTable).where(eq(purchaseReturnsTable.id, id));
  if (!preCheck) throw httpError(404, "غير موجود");
  await assertPeriodOpen(preCheck.date, req);

  const effectiveWarehouseId = req.user?.warehouse_id ?? null;

  await db.transaction(async (tx) => {
    const [ret] = await tx.select().from(purchaseReturnsTable).where(eq(purchaseReturnsTable.id, id));
    if (!ret) throw httpError(400, "غير موجود");

    const retItems = await tx.select().from(purchaseReturnItemsTable)
      .where(eq(purchaseReturnItemsTable.return_id, id));

    for (const item of retItems) {
      const retQty       = Number(item.quantity);
      const unitCostUsed = Number(item.unit_cost_at_return) || Number(item.unit_price);

      // ── استعادة quantity_returned على البند الأصلي ───────────────────────
      if (item.original_purchase_item_id) {
        const [origItem] = await tx.select().from(purchaseItemsTable)
          .where(eq(purchaseItemsTable.id, item.original_purchase_item_id));
        if (origItem) {
          const newReturned = Math.max(0, Number(origItem.quantity_returned) - retQty);
          await tx.update(purchaseItemsTable)
            .set({ quantity_returned: String(newReturned.toFixed(3)) })
            .where(eq(purchaseItemsTable.id, origItem.id));
        }
      }

      // ── إعادة المخزون + تعديل WAC ────────────────────────────────────────
      const [prod] = await tx.select().from(productsTable).where(eq(productsTable.id, item.product_id));
      if (prod) {
        const oldQty = Number(prod.quantity);
        const oldWAC = Number(prod.cost_price);
        const newQty = oldQty + retQty;
        const newWAC = newQty > 0
          ? ((oldQty * oldWAC) + (retQty * unitCostUsed)) / newQty
          : unitCostUsed;

        await tx.update(productsTable)
          .set({ quantity: String(newQty), cost_price: String(newWAC.toFixed(4)) })
          .where(eq(productsTable.id, item.product_id));

        await tx.insert(stockMovementsTable).values({
          product_id:      item.product_id,
          product_name:    item.product_name,
          movement_type:   "adjustment",
          quantity:        String(retQty),
          quantity_before: String(oldQty),
          quantity_after:  String(newQty),
          unit_cost:       String(unitCostUsed),
          reference_type:  "purchase_return_cancel",
          reference_id:    ret.id,
          reference_no:    ret.return_no,
          notes:           `إلغاء مرتجع مشتريات ${ret.return_no}`,
          date:            new Date().toISOString().split("T")[0],
          warehouse_id:    effectiveWarehouseId ?? 1,
        });
      }
    }

    const total = Number(ret.total_amount);

    if (ret.refund_type === "cash" && ret.safe_id) {
      const [safe] = await tx.select().from(safesTable).where(eq(safesTable.id, ret.safe_id));
      if (safe) {
        await tx.update(safesTable)
          .set({ balance: String(Number(safe.balance) - total) })
          .where(eq(safesTable.id, ret.safe_id));
      }
    } else if (ret.refund_type === "balance_credit" || !ret.refund_type) {
      // عكس: المرتجع كان يُضاف لرصيد العميل-المورد → نخصمه الآن
      if (ret.customer_id) {
        const [cust] = await tx.select().from(customersTable).where(eq(customersTable.id, ret.customer_id));
        if (cust) {
          await tx.update(customersTable)
            .set({ balance: String(Number(cust.balance) - total) })
            .where(eq(customersTable.id, ret.customer_id));
        }
        await tx.insert(customerLedgerTable).values({
          customer_id: ret.customer_id,
          type: "purchase_return_cancel",
          amount: String(-total),
          reference_type: "purchase_return_cancel",
          reference_id: ret.id,
          reference_no: ret.return_no,
          description: `إلغاء مرتجع مشتريات ${ret.return_no}`,
          date: new Date().toISOString().split("T")[0],
        });
      }
    }

    await tx.delete(purchaseReturnItemsTable).where(eq(purchaseReturnItemsTable.return_id, id));
    await tx.delete(purchaseReturnsTable).where(eq(purchaseReturnsTable.id, id));
  });

  void writeAuditLog({
    action: "delete",
    record_type: "purchase_return",
    record_id: id,
    user: { id: req.user?.id, username: req.user?.username },
  });

  res.json({ success: true });
}));

export default router;
