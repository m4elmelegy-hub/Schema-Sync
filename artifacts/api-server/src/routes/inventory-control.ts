/**
 * inventory-control.ts — جرد المخزون وتحويل المخزون بين المخازن
 *
 * POST /api/inventory/count-sessions           — إنشاء جلسة جرد جديدة
 * GET  /api/inventory/count-sessions           — قائمة جلسات الجرد
 * GET  /api/inventory/count-sessions/:id       — تفاصيل جلسة
 * POST /api/inventory/count-sessions/:id/apply — تطبيق الجرد وإنشاء تسويات
 *
 * POST /api/inventory/transfers                — تحويل مخزون بين مخازن
 * GET  /api/inventory/transfers                — قائمة التحويلات
 */

import { Router, type IRouter } from "express";
import { eq, inArray, sql } from "drizzle-orm";
import {
  db,
  productsTable,
  stockMovementsTable,
  stockCountSessionsTable,
  stockCountItemsTable,
  stockTransfersTable,
  stockTransferItemsTable,
  warehousesTable,
} from "@workspace/db";
import { wrap } from "../lib/async-handler";
import { hasPermission } from "../lib/permissions";
import { writeAuditLog } from "../lib/audit-log";

const router: IRouter = Router();

/* ═══════════════════════════════════════════════════════════════════════════
 * SECTION A — جرد المخزون (Stock Count)
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * POST /api/inventory/count-sessions
 * ينشئ جلسة جرد جديدة ويُحمِّل كميات النظام الحالية لكل منتج
 *
 * Body: { warehouse_id, notes?, items: [{ product_id, physical_qty, notes? }] }
 */
router.post("/inventory/count-sessions", wrap(async (req, res) => {
  if (!hasPermission(req.user, "can_adjust_inventory")) {
    res.status(403).json({ error: "ليس لديك صلاحية إجراء جرد المخزون" }); return;
  }

  const { warehouse_id = 1, notes, items } = req.body as {
    warehouse_id?: number;
    notes?: string;
    items: Array<{ product_id: number; physical_qty: number; notes?: string }>;
  };

  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: "يجب تحديد منتج واحد على الأقل في الجرد" }); return;
  }

  const productIds = items.map(i => i.product_id);
  const products = await db.select().from(productsTable).where(inArray(productsTable.id, productIds));
  const productMap = new Map(products.map(p => [p.id, p]));

  const missing = productIds.filter(id => !productMap.has(id));
  if (missing.length > 0) {
    res.status(400).json({ error: `منتجات غير موجودة: ${missing.join(", ")}` }); return;
  }

  // احسب المخزون الفعلي لكل منتج في المخزن المحدد من حركات المخزون
  const whStockRows = await db.execute(sql`
    SELECT product_id::int, COALESCE(SUM(CAST(quantity AS FLOAT8)), 0) AS wh_qty
    FROM stock_movements
    WHERE warehouse_id = ${Number(warehouse_id)}
      AND product_id = ANY(${productIds}::int[])
    GROUP BY product_id
  `);
  const whStockMap = new Map((whStockRows.rows as any[]).map((r: any) => [Number(r.product_id), Number(r.wh_qty ?? 0)]));

  const session = await db.transaction(async (tx) => {
    const [sess] = await tx.insert(stockCountSessionsTable).values({
      warehouse_id,
      status: "draft",
      notes: notes ?? null,
      company_id: req.user?.company_id ?? 1,
      created_by: req.user?.id ?? null,
    }).returning();

    const countItems = items.map(item => ({
      session_id:   sess.id,
      product_id:   item.product_id,
      system_qty:   String(whStockMap.get(item.product_id) ?? 0),
      physical_qty: String(item.physical_qty),
      notes:        item.notes ?? null,
    }));

    const inserted = await tx.insert(stockCountItemsTable).values(countItems).returning();
    return { session: sess, items: inserted };
  });

  res.status(201).json({
    success:    true,
    session_id: session.session.id,
    status:     session.session.status,
    items_count: session.items.length,
    items:      session.items.map(i => ({
      ...i,
      system_qty:   Number(i.system_qty),
      physical_qty: Number(i.physical_qty),
      difference:   Number(i.physical_qty) - Number(i.system_qty),
    })),
  });
}));

/**
 * GET /api/inventory/count-sessions
 * قائمة جلسات الجرد لهذه الشركة
 */
router.get("/inventory/count-sessions", wrap(async (req, res) => {
  if (!hasPermission(req.user, "can_view_inventory")) {
    res.status(403).json({ error: "ليس لديك صلاحية عرض الجرد" }); return;
  }

  const sessions = await db.select().from(stockCountSessionsTable)
    .orderBy(stockCountSessionsTable.created_at);

  res.json(sessions.map(s => ({
    ...s,
    applied_at: s.applied_at?.toISOString() ?? null,
    created_at: s.created_at.toISOString(),
  })));
}));

/**
 * GET /api/inventory/count-sessions/:id
 * تفاصيل جلسة جرد واحدة مع بنودها
 */
router.get("/inventory/count-sessions/:id", wrap(async (req, res) => {
  if (!hasPermission(req.user, "can_view_inventory")) {
    res.status(403).json({ error: "ليس لديك صلاحية عرض الجرد" }); return;
  }

  const sessionId = parseInt(req.params.id);
  const [session] = await db.select().from(stockCountSessionsTable)
    .where(eq(stockCountSessionsTable.id, sessionId));

  if (!session) { res.status(404).json({ error: "جلسة الجرد غير موجودة" }); return; }

  const items = await db
    .select({
      id:           stockCountItemsTable.id,
      session_id:   stockCountItemsTable.session_id,
      product_id:   stockCountItemsTable.product_id,
      product_name: productsTable.name,
      product_sku:  productsTable.sku,
      system_qty:   stockCountItemsTable.system_qty,
      physical_qty: stockCountItemsTable.physical_qty,
      notes:        stockCountItemsTable.notes,
    })
    .from(stockCountItemsTable)
    .innerJoin(productsTable, eq(stockCountItemsTable.product_id, productsTable.id))
    .where(eq(stockCountItemsTable.session_id, sessionId));

  res.json({
    session: {
      ...session,
      applied_at: session.applied_at?.toISOString() ?? null,
      created_at: session.created_at.toISOString(),
    },
    items: items.map(i => ({
      ...i,
      system_qty:   Number(i.system_qty),
      physical_qty: Number(i.physical_qty),
      difference:   Number(i.physical_qty) - Number(i.system_qty),
    })),
  });
}));

/**
 * POST /api/inventory/count-sessions/:id/apply
 * يطبّق الجرد:
 *   - لكل منتج يختلف فيه physical_qty عن system_qty يُنشئ stock_movement (adjustment)
 *   - يُحدِّث products.quantity
 *   - يغيّر حالة الجلسة إلى applied
 *   - يُسجِّل في audit_logs
 */
router.post("/inventory/count-sessions/:id/apply", wrap(async (req, res) => {
  if (!hasPermission(req.user, "can_adjust_inventory")) {
    res.status(403).json({ error: "ليس لديك صلاحية تطبيق الجرد" }); return;
  }

  const sessionId = parseInt(req.params.id);
  const [session] = await db.select().from(stockCountSessionsTable)
    .where(eq(stockCountSessionsTable.id, sessionId));

  if (!session) { res.status(404).json({ error: "جلسة الجرد غير موجودة" }); return; }
  if (session.status === "applied") {
    res.status(409).json({ error: "تم تطبيق هذه الجلسة بالفعل" }); return;
  }

  const items = await db
    .select({
      id:           stockCountItemsTable.id,
      product_id:   stockCountItemsTable.product_id,
      system_qty:   stockCountItemsTable.system_qty,
      physical_qty: stockCountItemsTable.physical_qty,
      notes:        stockCountItemsTable.notes,
    })
    .from(stockCountItemsTable)
    .where(eq(stockCountItemsTable.session_id, sessionId));

  if (items.length === 0) {
    res.status(400).json({ error: "الجلسة لا تحتوي على بنود" }); return;
  }

  const productIds = items.map(i => i.product_id);
  const products = await db.select().from(productsTable).where(inArray(productsTable.id, productIds));
  const productMap = new Map(products.map(p => [p.id, p]));

  const adjustments: Array<{ product_id: number; diff: number; oldQty: number; newQty: number }> = [];

  await db.transaction(async (tx) => {
    for (const item of items) {
      const sysQty  = Number(item.system_qty);
      const physQty = Number(item.physical_qty);
      const diff    = physQty - sysQty;

      if (Math.abs(diff) < 0.001) continue; // لا فرق — تجاوز

      const product = productMap.get(item.product_id)!;
      const oldQty  = Number(product.quantity);
      const newQty  = oldQty + diff; // قد يختلف عن sysQty إذا وجدت حركات بعد بدء الجرد

      // تحديث كمية المنتج
      await tx.update(productsTable)
        .set({ quantity: String(newQty) })
        .where(eq(productsTable.id, item.product_id));

      // تسجيل حركة المخزون
      const refNo = `CNT-${session.id}-${item.product_id}`;
      await tx.insert(stockMovementsTable).values({
        product_id:     item.product_id,
        product_name:   product.name,
        movement_type:  "adjustment",
        quantity:       String(diff),
        quantity_before: String(oldQty),
        quantity_after:  String(newQty),
        unit_cost:      product.cost_price,
        reference_type: "stock_count",
        reference_id:   session.id,
        reference_no:   refNo,
        notes: item.notes ?? `جرد مخزون — جلسة #${session.id}`,
        date:  new Date().toISOString().split("T")[0],
        warehouse_id:  session.warehouse_id,
        company_id:    session.company_id,
      });

      adjustments.push({ product_id: item.product_id, diff, oldQty, newQty });
    }

    // تحديث حالة الجلسة
    await tx.update(stockCountSessionsTable)
      .set({ status: "applied", applied_at: new Date() })
      .where(eq(stockCountSessionsTable.id, sessionId));
  });

  // سجل audit
  void writeAuditLog({
    action:      "INVENTORY_COUNT_APPLIED",
    record_type: "product",
    record_id:   sessionId,
    old_value:   { session_id: sessionId, warehouse_id: session.warehouse_id, status: "draft" },
    new_value:   {
      status:           "applied",
      adjustments_count: adjustments.length,
      adjustments:      adjustments.slice(0, 20), // أقصى 20 لتجنب overflow
    },
    user: { id: req.user?.id, username: req.user?.username },
  });

  res.json({
    success:           true,
    session_id:        sessionId,
    adjustments_applied: adjustments.length,
    adjustments,
  });
}));

/* ═══════════════════════════════════════════════════════════════════════════
 * SECTION B — تحويل المخزون بين المخازن (Stock Transfer)
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * POST /api/inventory/transfers
 * ينفّذ تحويل مخزون من مخزن إلى آخر في transaction واحدة
 *
 * Body: {
 *   from_warehouse_id, to_warehouse_id,
 *   notes?,
 *   items: [{ product_id, quantity }]
 * }
 */
router.post("/inventory/transfers", wrap(async (req, res) => {
  if (!hasPermission(req.user, "can_adjust_inventory")) {
    res.status(403).json({ error: "ليس لديك صلاحية تحويل المخزون" }); return;
  }

  const { from_warehouse_id, to_warehouse_id, notes, items } = req.body as {
    from_warehouse_id: number;
    to_warehouse_id:   number;
    notes?:            string;
    items: Array<{ product_id: number; quantity: number }>;
  };

  // التحقق من عدم التحويل لنفس المخزن
  if (Number(from_warehouse_id) === Number(to_warehouse_id)) {
    res.status(400).json({ error: "لا يمكن التحويل من مخزن إلى نفس المخزن" }); return;
  }

  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: "يجب تحديد منتج واحد على الأقل" }); return;
  }

  // التحقق من أن المخازن موجودة
  const [fromWH] = await db.select().from(warehousesTable).where(eq(warehousesTable.id, Number(from_warehouse_id)));
  const [toWH]   = await db.select().from(warehousesTable).where(eq(warehousesTable.id, Number(to_warehouse_id)));
  if (!fromWH) { res.status(404).json({ error: `مخزن المصدر غير موجود: ${from_warehouse_id}` }); return; }
  if (!toWH)   { res.status(404).json({ error: `مخزن الهدف غير موجود: ${to_warehouse_id}` }); return; }

  // جلب المنتجات وتحقق الكميات
  const productIds = items.map(i => i.product_id);
  const products   = await db.select().from(productsTable).where(inArray(productsTable.id, productIds));
  const productMap = new Map(products.map(p => [p.id, p]));

  for (const item of items) {
    const product = productMap.get(item.product_id);
    if (!product) {
      res.status(404).json({ error: `المنتج غير موجود: ${item.product_id}` }); return;
    }
    if (item.quantity <= 0) {
      res.status(400).json({ error: `الكمية يجب أن تكون موجبة للمنتج: ${product.name}` }); return;
    }
    if (Number(product.quantity) < item.quantity) {
      res.status(400).json({
        error: `الكمية غير كافية للمنتج "${product.name}": المتاح ${product.quantity}، المطلوب ${item.quantity}`,
      }); return;
    }
  }

  const transferId = await db.transaction(async (tx) => {
    // إنشاء سجل التحويل
    const [transfer] = await tx.insert(stockTransfersTable).values({
      from_warehouse_id: Number(from_warehouse_id),
      to_warehouse_id:   Number(to_warehouse_id),
      status:    "completed",
      notes:     notes ?? null,
      company_id: req.user?.company_id ?? 1,
      created_by: req.user?.id ?? null,
    }).returning();

    const transferItems = [];
    const today = new Date().toISOString().split("T")[0];

    for (const item of items) {
      const product = productMap.get(item.product_id)!;
      const qty     = Number(item.quantity);
      const oldQty  = Number(product.quantity);
      const newQty  = oldQty; // الإجمالي لا يتغير — يتحرك بين المخازن فقط

      const refNo = `TRF-${transfer.id}-${item.product_id}`;

      // بند تحويل المخزون في الجدول
      transferItems.push({
        transfer_id:  transfer.id,
        product_id:   item.product_id,
        product_name: product.name,
        quantity:     String(qty),
        unit_cost:    product.cost_price,
      });

      // حركة خروج من المخزن المصدر (سالبة)
      await tx.insert(stockMovementsTable).values({
        product_id:      item.product_id,
        product_name:    product.name,
        movement_type:   "transfer_out",
        quantity:        String(-qty),
        quantity_before: String(oldQty),
        quantity_after:  String(newQty),
        unit_cost:       product.cost_price,
        reference_type:  "stock_transfer",
        reference_id:    transfer.id,
        reference_no:    refNo,
        notes: `تحويل خروج → ${toWH.name}`,
        date:  today,
        warehouse_id:  Number(from_warehouse_id),
        company_id:    req.user?.company_id ?? 1,
      });

      // حركة دخول إلى المخزن الهدف (موجبة)
      await tx.insert(stockMovementsTable).values({
        product_id:      item.product_id,
        product_name:    product.name,
        movement_type:   "transfer_in",
        quantity:        String(qty),
        quantity_before: String(oldQty),
        quantity_after:  String(newQty),
        unit_cost:       product.cost_price,
        reference_type:  "stock_transfer",
        reference_id:    transfer.id,
        reference_no:    refNo,
        notes: `تحويل دخول ← ${fromWH.name}`,
        date:  today,
        warehouse_id:  Number(to_warehouse_id),
        company_id:    req.user?.company_id ?? 1,
      });
    }

    await tx.insert(stockTransferItemsTable).values(transferItems);
    return transfer.id;
  });

  void writeAuditLog({
    action:      "INVENTORY_TRANSFER",
    record_type: "product",
    record_id:   transferId,
    old_value:   { from_warehouse: fromWH.name, from_warehouse_id },
    new_value:   {
      to_warehouse: toWH.name, to_warehouse_id,
      items_count: items.length,
      items: items.map(i => ({
        product_id:   i.product_id,
        product_name: productMap.get(i.product_id)?.name,
        quantity:     i.quantity,
      })),
    },
    user: { id: req.user?.id, username: req.user?.username },
  });

  res.status(201).json({
    success:     true,
    transfer_id: transferId,
    from_warehouse: fromWH.name,
    to_warehouse:   toWH.name,
    items_count: items.length,
  });
}));

/**
 * GET /api/inventory/transfers
 * قائمة عمليات التحويل
 */
router.get("/inventory/transfers", wrap(async (req, res) => {
  if (!hasPermission(req.user, "can_view_inventory")) {
    res.status(403).json({ error: "ليس لديك صلاحية عرض التحويلات" }); return;
  }

  const transfers = await db.select().from(stockTransfersTable)
    .orderBy(stockTransfersTable.created_at);

  res.json(transfers.map(t => ({
    ...t,
    created_at: t.created_at.toISOString(),
  })));
}));

export default router;
