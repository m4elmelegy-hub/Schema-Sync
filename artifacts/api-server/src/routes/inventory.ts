import { Router, type IRouter } from "express";
import { eq, sql, and } from "drizzle-orm";
import { db, stockMovementsTable, productsTable, warehousesTable } from "@workspace/db";
import { wrap } from "../lib/async-handler";
import { hasPermission } from "../lib/permissions";
import { writeAuditLog } from "../lib/audit-log";

interface AuditRow {
  id: unknown;
  name: unknown;
  sku: unknown;
  category: unknown;
  actual_qty: unknown;
  cost_price: unknown;
  sale_price: unknown;
  low_stock_threshold: unknown;
  opening_qty: unknown;
  purchased_qty: unknown;
  sold_qty: unknown;
  sale_return_qty: unknown;
  purchase_return_qty: unknown;
  adjustment_qty: unknown;
  calculated_qty: unknown;
}

const router: IRouter = Router();

function fmtMovement(m: typeof stockMovementsTable.$inferSelect) {
  return {
    ...m,
    quantity: Number(m.quantity),
    quantity_before: Number(m.quantity_before),
    quantity_after: Number(m.quantity_after),
    unit_cost: Number(m.unit_cost),
    created_at: m.created_at.toISOString(),
  };
}

// ── مراجعة المخزون الكاملة ─────────────────────────────────────────────────
router.get("/inventory/audit", wrap(async (req, res) => {
  if (!hasPermission(req.user, "can_view_inventory")) {
    res.status(403).json({ error: "ليس لديك صلاحية عرض المخزون" }); return;
  }
  const role = req.user?.role ?? "cashier";
  const queryWarehouseId = req.query.warehouse_id ? parseInt(String(req.query.warehouse_id), 10) : null;
  const effectiveWarehouseId = (role === "admin" || role === "manager")
    ? queryWarehouseId
    : (req.user?.warehouse_id ?? null);
  if ((role === "cashier" || role === "salesperson") && effectiveWarehouseId === null) {
    res.status(403).json({ error: "المستخدم غير مرتبط بمخزن" }); return;
  }

  const companyId = req.user?.company_id ?? null;
  const warehouseFilter = effectiveWarehouseId
    ? sql` AND sm.warehouse_id = ${effectiveWarehouseId}`
    : sql``;
  const companyWhere = companyId !== null
    ? sql` WHERE p.company_id = ${companyId}`
    : sql``;

  const rows = await db.execute(sql`
    SELECT
      p.id,
      p.name,
      p.sku,
      p.category,
      CAST(p.quantity      AS FLOAT8) AS actual_qty,
      CAST(p.cost_price    AS FLOAT8) AS cost_price,
      CAST(p.sale_price    AS FLOAT8) AS sale_price,
      p.low_stock_threshold,
      COALESCE(SUM(CASE WHEN sm.movement_type = 'opening_balance'  THEN ABS(CAST(sm.quantity AS FLOAT8)) ELSE 0 END), 0) AS opening_qty,
      COALESCE(SUM(CASE WHEN sm.movement_type = 'purchase'         THEN ABS(CAST(sm.quantity AS FLOAT8)) ELSE 0 END), 0) AS purchased_qty,
      COALESCE(SUM(CASE WHEN sm.movement_type = 'sale'             THEN ABS(CAST(sm.quantity AS FLOAT8)) ELSE 0 END), 0) AS sold_qty,
      COALESCE(SUM(CASE WHEN sm.movement_type = 'sale_return'      THEN ABS(CAST(sm.quantity AS FLOAT8)) ELSE 0 END), 0) AS sale_return_qty,
      COALESCE(SUM(CASE WHEN sm.movement_type = 'purchase_return'  THEN ABS(CAST(sm.quantity AS FLOAT8)) ELSE 0 END), 0) AS purchase_return_qty,
      COALESCE(SUM(CASE WHEN sm.movement_type = 'adjustment'       THEN CAST(sm.quantity AS FLOAT8) ELSE 0 END), 0)     AS adjustment_qty,
      COALESCE(SUM(CAST(sm.quantity AS FLOAT8)), 0)                                                                      AS calculated_qty
    FROM products p
    LEFT JOIN stock_movements sm ON sm.product_id = p.id${warehouseFilter}
    ${companyWhere}
    GROUP BY p.id, p.name, p.sku, p.category, p.quantity, p.cost_price, p.sale_price, p.low_stock_threshold
    ORDER BY p.name
  `);

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const TOLERANCE = 0.02;

  const products = (rows.rows as unknown as AuditRow[]).map(r => {
    const actual_qty    = Number(r.actual_qty);
    const cost_price    = Number(r.cost_price);
    const calculated_qty = Number(r.calculated_qty);
    const total_value   = r2(actual_qty * cost_price);
    const discrepancy   = r2(actual_qty - calculated_qty);

    // تحقق على مستوى المنتج: الكمية × السعر = القيمة، والكمية المحسوبة = الفعلية
    const checks: Array<{ name: string; expected: number; actual: number; ok: boolean }> = [
      {
        name: "الكمية × سعر التكلفة = قيمة المخزون",
        expected: r2(actual_qty * cost_price),
        actual:   total_value,
        ok: Math.abs(r2(actual_qty * cost_price) - total_value) <= TOLERANCE,
      },
      {
        name: "الكمية المحسوبة من الحركات = الكمية الفعلية",
        expected: r2(calculated_qty),
        actual:   r2(actual_qty),
        ok: Math.abs(discrepancy) <= TOLERANCE,
      },
    ];
    const productStatus = checks.every(c => c.ok) ? "OK" : "WARNING";

    return {
      id: Number(r.id),
      name: String(r.name),
      sku: r.sku ? String(r.sku) : null,
      category: r.category ? String(r.category) : null,
      actual_qty,
      cost_price,
      sale_price: Number(r.sale_price),
      low_stock_threshold: r.low_stock_threshold ? Number(r.low_stock_threshold) : null,
      opening_qty: Number(r.opening_qty),
      purchased_qty: Number(r.purchased_qty),
      sold_qty: Number(r.sold_qty),
      sale_return_qty: Number(r.sale_return_qty),
      purchase_return_qty: Number(r.purchase_return_qty),
      adjustment_qty: Number(r.adjustment_qty),
      calculated_qty,
      discrepancy,
      total_value,
      validation: { status: productStatus as "OK" | "WARNING", checks },
    };
  });

  const total_inventory_value = r2(products.reduce((s, p) => s + p.total_value, 0));
  const low_stock_count  = products.filter(p => p.low_stock_threshold !== null && p.actual_qty <= p.low_stock_threshold).length;
  const zero_stock_count = products.filter(p => p.actual_qty <= 0).length;
  const discrepancy_count = products.filter(p => p.validation.status === "WARNING").length;

  // تحقق على مستوى المستودع الكامل
  const summaryChecks = [
    {
      name: "مجموع قيم الأصناف = إجمالي قيمة المخزون",
      expected: r2(products.reduce((s, p) => s + p.total_value, 0)),
      actual:   total_inventory_value,
      ok: Math.abs(r2(products.reduce((s, p) => s + p.total_value, 0)) - total_inventory_value) <= TOLERANCE,
    },
    {
      name: "عدد الأصناف ذات الفارق = 0",
      expected: 0,
      actual:   discrepancy_count,
      ok: discrepancy_count === 0,
    },
  ];
  const summaryStatus = summaryChecks.every(c => c.ok) ? "OK" : "WARNING";
  const summaryValidation = {
    status: summaryStatus as "OK" | "WARNING",
    ...(summaryStatus === "WARNING" ? {
      validation_message: summaryChecks.filter(c => !c.ok).map(c =>
        `"${c.name}": متوقع ${c.expected}، فعلي ${c.actual}`
      ).join(" | "),
    } : {}),
    checks: summaryChecks,
  };

  res.json({
    products,
    summary: {
      total_products: products.length,
      total_inventory_value,
      low_stock_count,
      zero_stock_count,
      discrepancy_count,
    },
    validation: summaryValidation,
  });
}));

// ── كشف حركات منتج واحد ───────────────────────────────────────────────────
router.get("/inventory/product/:id", wrap(async (req, res) => {
  if (!hasPermission(req.user, "can_view_inventory")) {
    res.status(403).json({ error: "ليس لديك صلاحية عرض المخزون" }); return;
  }
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!product) { res.status(404).json({ error: "المنتج غير موجود" }); return; }

  const movements = await db
    .select()
    .from(stockMovementsTable)
    .where(eq(stockMovementsTable.product_id, id))
    .orderBy(stockMovementsTable.created_at);

  const calculated_qty = movements.reduce((s, m) => s + Number(m.quantity), 0);
  const actual_qty = Number(product.quantity);

  // مثال الحساب (لأول منتج لإظهار الصحة)
  const breakdown = {
    opening_qty: movements.filter(m => m.movement_type === "opening_balance").reduce((s, m) => s + Math.abs(Number(m.quantity)), 0),
    purchased_qty: movements.filter(m => m.movement_type === "purchase").reduce((s, m) => s + Math.abs(Number(m.quantity)), 0),
    sold_qty: movements.filter(m => m.movement_type === "sale").reduce((s, m) => s + Math.abs(Number(m.quantity)), 0),
    sale_return_qty: movements.filter(m => m.movement_type === "sale_return").reduce((s, m) => s + Math.abs(Number(m.quantity)), 0),
    purchase_return_qty: movements.filter(m => m.movement_type === "purchase_return").reduce((s, m) => s + Math.abs(Number(m.quantity)), 0),
    adjustment_qty: movements.filter(m => m.movement_type === "adjustment").reduce((s, m) => s + Number(m.quantity), 0),
  };

  res.json({
    product: {
      ...product,
      quantity: actual_qty,
      cost_price: Number(product.cost_price),
      sale_price: Number(product.sale_price),
      created_at: product.created_at.toISOString(),
    },
    movements: movements.map(fmtMovement),
    calculated_qty,
    actual_qty,
    discrepancy: actual_qty - calculated_qty,
    breakdown,
    formula: `${breakdown.opening_qty} + ${breakdown.purchased_qty} + ${breakdown.sale_return_qty} - ${breakdown.sold_qty} - ${breakdown.purchase_return_qty} + ${breakdown.adjustment_qty} = ${calculated_qty}`,
  });
}));

// ── تسوية يدوية ────────────────────────────────────────────────────────────
router.post("/inventory/adjustment", wrap(async (req, res) => {
  if (!hasPermission(req.user, "can_adjust_inventory")) {
    res.status(403).json({ error: "ليس لديك صلاحية تسوية المخزون" }); return;
  }
  const { product_id, new_quantity, notes } = req.body;
  if (product_id === undefined || new_quantity === undefined) {
    res.status(400).json({ error: "يجب تحديد المنتج والكمية الجديدة" }); return;
  }
  const prodId = parseInt(product_id);
  const newQty = Number(new_quantity);
  if (isNaN(prodId) || isNaN(newQty) || newQty < 0) {
    res.status(400).json({ error: "بيانات غير صالحة" }); return;
  }

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, prodId));
  if (!product) { res.status(404).json({ error: "المنتج غير موجود" }); return; }

  const oldQty = Number(product.quantity);
  const diff = newQty - oldQty;

  await db.transaction(async (tx) => {
    await tx.update(productsTable)
      .set({ quantity: String(newQty) })
      .where(eq(productsTable.id, prodId));

    await tx.insert(stockMovementsTable).values({
      product_id: prodId,
      product_name: product.name,
      movement_type: "adjustment",
      quantity: String(diff),
      quantity_before: String(oldQty),
      quantity_after: String(newQty),
      unit_cost: product.cost_price,
      reference_type: "adjustment",
      reference_no: `ADJ-${Date.now()}`,
      notes: notes ?? "تسوية يدوية",
      date: new Date().toISOString().split("T")[0],
      company_id: req.user?.company_id ?? undefined,
    });
  });

  void writeAuditLog({
    action:      "INVENTORY_ADJUSTMENT",
    record_type: "product",
    record_id:   prodId,
    old_value:   { quantity: oldQty, product_name: product.name, sku: product.sku },
    new_value:   { quantity: newQty, diff, notes: notes ?? "تسوية يدوية" },
    user:        { id: req.user?.id, username: req.user?.username },
  });

  res.json({
    success: true,
    product_id: prodId,
    old_qty: oldQty,
    new_qty: newQty,
    diff,
  });
}));

/**
 * GET /api/inventory/warehouse-summary
 * إجمالي المخزون لكل مخزن: عدد المنتجات، القيمة الكلية، نسبة من الإجمالي
 */
router.get("/inventory/warehouse-summary", wrap(async (req, res) => {
  if (!hasPermission(req.user, "can_view_inventory")) {
    res.status(403).json({ error: "ليس لديك صلاحية عرض المخزون" }); return;
  }

  const rows = await db.execute(sql`
    SELECT
      w.id   AS warehouse_id,
      w.name AS warehouse_name,
      COALESCE(
        (SELECT COUNT(DISTINCT pp.product_id)::int
         FROM (
           SELECT product_id, SUM(CAST(quantity AS FLOAT8)) AS wh_qty
           FROM stock_movements sm2 WHERE sm2.warehouse_id = w.id
           GROUP BY product_id
         ) pp WHERE pp.wh_qty > 0
        ), 0)::int AS item_count,
      COALESCE(
        (SELECT SUM(pp.wh_qty * CAST(p.cost_price AS FLOAT8))
         FROM (
           SELECT product_id, SUM(CAST(quantity AS FLOAT8)) AS wh_qty
           FROM stock_movements sm3 WHERE sm3.warehouse_id = w.id
           GROUP BY product_id
         ) pp
         JOIN products p ON p.id = pp.product_id
         WHERE pp.wh_qty > 0
        ), 0) AS total_value
    FROM warehouses w
    ORDER BY w.id
  `);

  const data = (rows.rows as any[]).map(r => ({
    warehouse_id:   Number(r.warehouse_id),
    warehouse_name: String(r.warehouse_name),
    item_count:     Number(r.item_count ?? 0),
    total_value:    Math.round(Number(r.total_value ?? 0) * 100) / 100,
  }));

  const grand_total = Math.round(data.reduce((s, r) => s + r.total_value, 0) * 100) / 100;

  res.json({
    warehouses: data.map(r => ({
      ...r,
      pct_of_total: grand_total > 0 ? Math.round((r.total_value / grand_total) * 1000) / 10 : 0,
    })),
    grand_total,
  });
}));

/**
 * GET /api/inventory/low-stock
 * Per-warehouse low stock alerts: products where calculated_qty <= low_stock_threshold
 * Includes cross-warehouse availability for transfer suggestions.
 */
router.get("/inventory/low-stock", wrap(async (req, res) => {
  if (!hasPermission(req.user, "can_view_inventory")) {
    res.status(403).json({ error: "ليس لديك صلاحية عرض المخزون" }); return;
  }

  /* ── 1. Fetch all (product, warehouse) pairs with per-warehouse qty ─────── */
  const lowRows = await db.execute(sql`
    SELECT
      p.id                          AS product_id,
      p.name                        AS product_name,
      p.sku,
      p.category,
      CAST(p.cost_price AS FLOAT8)  AS cost_price,
      p.low_stock_threshold         AS min_stock,
      w.id                          AS warehouse_id,
      w.name                        AS warehouse_name,
      COALESCE(SUM(CAST(sm.quantity AS FLOAT8)), 0) AS current_qty
    FROM products p
    JOIN (
      SELECT DISTINCT product_id, warehouse_id FROM stock_movements
    ) pair ON pair.product_id = p.id
    JOIN warehouses w ON w.id = pair.warehouse_id
    LEFT JOIN stock_movements sm
      ON sm.product_id = p.id AND sm.warehouse_id = w.id
    WHERE p.low_stock_threshold IS NOT NULL
    GROUP BY p.id, p.name, p.sku, p.category, p.cost_price, p.low_stock_threshold, w.id, w.name
    HAVING COALESCE(SUM(CAST(sm.quantity AS FLOAT8)), 0) <= p.low_stock_threshold
    ORDER BY w.name, p.name
  `);

  const lowItems = (lowRows.rows as any[]).map(r => ({
    product_id:    Number(r.product_id),
    product_name:  String(r.product_name),
    sku:           r.sku   ? String(r.sku)      : null,
    category:      r.category ? String(r.category) : null,
    cost_price:    Number(r.cost_price ?? 0),
    min_stock:     Number(r.min_stock),
    warehouse_id:  Number(r.warehouse_id),
    warehouse_name: String(r.warehouse_name),
    current_qty:   Number(r.current_qty),
  }));

  if (lowItems.length === 0) {
    res.json({ items: [], zero_count: 0, low_count: 0 }); return;
  }

  /* ── 2. Fetch all warehouse stock for the affected products ─────────────── */
  const productIds = [...new Set(lowItems.map(r => r.product_id))];

  const whRows = await db.execute(sql`
    SELECT
      sm.product_id::int            AS product_id,
      sm.warehouse_id::int          AS warehouse_id,
      w.name                        AS warehouse_name,
      SUM(CAST(sm.quantity AS FLOAT8)) AS wh_qty
    FROM stock_movements sm
    JOIN warehouses w ON w.id = sm.warehouse_id
    WHERE sm.product_id = ANY(${productIds}::int[])
    GROUP BY sm.product_id, sm.warehouse_id, w.name
    HAVING SUM(CAST(sm.quantity AS FLOAT8)) > 0
  `);

  /* Map product_id → [{warehouse_id, warehouse_name, qty}] */
  const byProduct = new Map<number, { warehouse_id: number; warehouse_name: string; qty: number }[]>();
  for (const r of whRows.rows as any[]) {
    const pid = Number(r.product_id);
    if (!byProduct.has(pid)) byProduct.set(pid, []);
    byProduct.get(pid)!.push({
      warehouse_id:   Number(r.warehouse_id),
      warehouse_name: String(r.warehouse_name),
      qty:            Number(r.wh_qty),
    });
  }

  /* ── 3. Enrich with shortage, suggested qty, cross-warehouse ──────────── */
  const enriched = lowItems.map(item => {
    const shortage      = Math.max(item.min_stock - item.current_qty, 0);
    const suggested_qty = Math.max(item.min_stock * 2 - item.current_qty, 1);
    const all           = byProduct.get(item.product_id) ?? [];
    const available_elsewhere = all
      .filter(w => w.warehouse_id !== item.warehouse_id && w.qty > item.min_stock)
      .sort((a, b) => b.qty - a.qty);

    return {
      ...item,
      shortage,
      suggested_qty,
      available_elsewhere,
      is_zero: item.current_qty <= 0,
    };
  });

  const zero_count = enriched.filter(r => r.is_zero).length;
  const low_count  = enriched.filter(r => !r.is_zero).length;

  res.json({ items: enriched, zero_count, low_count });
}));

export default router;
