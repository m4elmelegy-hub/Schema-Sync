import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  productsTable,
  stockMovementsTable,
  safesTable,
  transactionsTable,
  customersTable,
} from "@workspace/db";
import { wrap, httpError } from "../lib/async-handler";

const router: IRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT OPENING BALANCE
// ─────────────────────────────────────────────────────────────────────────────

router.get("/opening-balance/product", wrap(async (req, res) => {
  const companyId: number = (req as any).user?.company_id ?? 1;
  const movements = await db
    .select()
    .from(stockMovementsTable)
    .where(and(
      eq(stockMovementsTable.movement_type, "opening_balance"),
      eq(stockMovementsTable.company_id, companyId),
    ));
  res.json(
    movements.map((m) => ({
      ...m,
      quantity: Number(m.quantity),
      quantity_before: Number(m.quantity_before),
      quantity_after: Number(m.quantity_after),
      unit_cost: Number(m.unit_cost),
      created_at: m.created_at.toISOString(),
    }))
  );
}));

router.post("/inventory/opening-balance", wrap(async (req, res) => {
  const { product_id, quantity, cost_price, date, notes } = req.body;

  if (product_id === undefined || quantity === undefined || cost_price === undefined) {
    res.status(400).json({ error: "بيانات غير مكتملة — المنتج والكمية والتكلفة مطلوبة" });
    return;
  }

  const qty = Number(quantity);
  const cost = Number(cost_price);
  const prodId = parseInt(product_id);

  if (isNaN(qty) || qty <= 0) {
    res.status(400).json({ error: "الكمية يجب أن تكون رقماً موجباً" });
    return;
  }
  if (isNaN(cost) || cost < 0) {
    res.status(400).json({ error: "سعر التكلفة غير صحيح" });
    return;
  }

  const role = req.user?.role ?? "cashier";
  const queryWarehouseId = req.query.warehouse_id ? parseInt(String(req.query.warehouse_id), 10) : null;
  const effectiveWarehouseId = (role === "admin" || role === "manager") ? queryWarehouseId : (req.user?.warehouse_id ?? null);

  const companyId: number = (req as any).user?.company_id ?? 1;

  const [product] = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.id, prodId), eq(productsTable.company_id, companyId)));
  if (!product) {
    res.status(404).json({ error: "المنتج غير موجود" });
    return;
  }

  // Block if opening balance already registered for this product
  const [existing] = await db
    .select()
    .from(stockMovementsTable)
    .where(
      and(
        eq(stockMovementsTable.product_id, prodId),
        eq(stockMovementsTable.movement_type, "opening_balance")
      )
    );
  if (existing) {
    res.status(409).json({ error: "رصيد أول المدة مسجل مسبقاً لهذا المنتج" });
    return;
  }

  const oldQty = Number(product.quantity);
  const oldCost = Number(product.cost_price);
  const newQty = oldQty + qty;
  // Weighted average cost
  const newCost = newQty > 0
    ? (oldQty * oldCost + qty * cost) / newQty
    : cost;

  await db.transaction(async (tx) => {
    await tx
      .update(productsTable)
      .set({
        quantity: String(newQty),
        cost_price: String(Math.round(newCost * 10000) / 10000),
      })
      .where(eq(productsTable.id, prodId));

    await tx.insert(stockMovementsTable).values({
      product_id: prodId,
      product_name: product.name,
      movement_type: "opening_balance",
      quantity: String(qty),
      quantity_before: String(oldQty),
      quantity_after: String(newQty),
      unit_cost: String(cost),
      reference_type: "opening_balance",
      reference_no: `OB-${Date.now()}`,
      notes: notes ?? "رصيد أول المدة",
      date: date ?? new Date().toISOString().split("T")[0],
      warehouse_id: effectiveWarehouseId ?? 1,
      company_id: companyId,
    });
  });

  res.status(201).json({
    success: true,
    product_id: prodId,
    product_name: product.name,
    old_qty: oldQty,
    new_qty: newQty,
    old_cost: oldCost,
    new_cost: Math.round(newCost * 10000) / 10000,
  });
}));

// ─────────────────────────────────────────────────────────────────────────────
// TREASURY (SAFE) OPENING BALANCE
// ─────────────────────────────────────────────────────────────────────────────

router.get("/opening-balance/treasury", wrap(async (req, res) => {
  const companyId: number = (req as any).user?.company_id ?? 1;
  const txns = await db
    .select()
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.reference_type, "treasury_opening"),
      eq(transactionsTable.company_id, companyId),
    ));
  res.json(
    txns.map((t) => ({
      ...t,
      amount: Number(t.amount),
      created_at: t.created_at.toISOString(),
    }))
  );
}));

router.post("/opening-balance/treasury", wrap(async (req, res) => {
  const { safe_id, amount, date, notes } = req.body;
  const companyId: number = (req as any).user?.company_id ?? 1;

  if (!safe_id || amount === undefined) {
    res.status(400).json({ error: "الخزينة والمبلغ مطلوبان" });
    return;
  }

  const amt = Number(amount);
  if (isNaN(amt) || amt <= 0) {
    res.status(400).json({ error: "المبلغ يجب أن يكون رقماً موجباً" });
    return;
  }

  const [safe] = await db
    .select()
    .from(safesTable)
    .where(and(eq(safesTable.id, parseInt(safe_id)), eq(safesTable.company_id, companyId)));
  if (!safe) {
    res.status(404).json({ error: "الخزينة غير موجودة" });
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(safesTable)
      .set({ balance: String(Number(safe.balance) + amt) })
      .where(eq(safesTable.id, safe.id));

    await tx.insert(transactionsTable).values({
      type: "opening_balance",
      reference_type: "treasury_opening",
      reference_id: safe.id,
      safe_id: safe.id,
      safe_name: safe.name,
      amount: String(amt),
      direction: "in",
      description: notes ?? `رصيد أول المدة — ${safe.name}`,
      date: date ?? new Date().toISOString().split("T")[0],
      company_id: companyId,
    });
  });

  res.status(201).json({ success: true, safe_id: safe.id, safe_name: safe.name, amount: amt });
}));

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER OPENING BALANCE
// ─────────────────────────────────────────────────────────────────────────────

router.get("/opening-balance/customer", wrap(async (req, res) => {
  const companyId: number = (req as any).user?.company_id ?? 1;
  const txns = await db
    .select()
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.reference_type, "customer_opening"),
      eq(transactionsTable.company_id, companyId),
    ));
  res.json(
    txns.map((t) => ({
      ...t,
      amount: Number(t.amount),
      created_at: t.created_at.toISOString(),
    }))
  );
}));

router.post("/opening-balance/customer", wrap(async (req, res) => {
  const { customer_id, amount, date, notes } = req.body;
  const companyId: number = (req as any).user?.company_id ?? 1;

  if (!customer_id || amount === undefined) {
    res.status(400).json({ error: "العميل والمبلغ مطلوبان" });
    return;
  }

  const amt = Number(amount);
  if (isNaN(amt) || amt <= 0) {
    res.status(400).json({ error: "المبلغ يجب أن يكون رقماً موجباً" });
    return;
  }

  const custId = parseInt(customer_id);
  const [customer] = await db
    .select()
    .from(customersTable)
    .where(and(eq(customersTable.id, custId), eq(customersTable.company_id, companyId)));
  if (!customer) {
    res.status(404).json({ error: "العميل غير موجود" });
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(customersTable)
      .set({ balance: String(Number(customer.balance) + amt) })
      .where(eq(customersTable.id, custId));

    await tx.insert(transactionsTable).values({
      type: "opening_balance",
      reference_type: "customer_opening",
      reference_id: custId,
      customer_id: custId,
      customer_name: customer.name,
      amount: String(amt),
      direction: "none",
      description: notes ?? `رصيد أول المدة — ${customer.name}`,
      date: date ?? new Date().toISOString().split("T")[0],
      company_id: companyId,
    });
  });

  res.status(201).json({ success: true, customer_id: custId, customer_name: customer.name, amount: amt });
}));

// ─────────────────────────────────────────────────────────────────────────────
// SUPPLIER OPENING BALANCE (uses customers with is_supplier = true)
// ─────────────────────────────────────────────────────────────────────────────

router.get("/opening-balance/supplier", wrap(async (req, res) => {
  const companyId: number = (req as any).user?.company_id ?? 1;
  const txns = await db
    .select()
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.reference_type, "customer_opening"),
      eq(transactionsTable.company_id, companyId),
    ));
  res.json(
    txns.map((t) => ({
      ...t,
      amount: Number(t.amount),
      created_at: t.created_at.toISOString(),
    }))
  );
}));

router.post("/opening-balance/supplier", wrap(async (req, res) => {
  const { supplier_id, customer_id: qCustId, amount, date, notes } = req.body;
  const rawId = supplier_id ?? qCustId;
  const companyId: number = (req as any).user?.company_id ?? 1;

  if (!rawId || amount === undefined) {
    res.status(400).json({ error: "المورد والمبلغ مطلوبان" });
    return;
  }

  const amt = Number(amount);
  if (isNaN(amt) || amt <= 0) {
    res.status(400).json({ error: "المبلغ يجب أن يكون رقماً موجباً" });
    return;
  }

  const custId = parseInt(rawId);
  const [customer] = await db
    .select()
    .from(customersTable)
    .where(and(eq(customersTable.id, custId), eq(customersTable.company_id, companyId)));
  if (!customer) {
    res.status(404).json({ error: "المورد غير موجود" });
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(customersTable)
      .set({ balance: String(Number(customer.balance) + amt) })
      .where(eq(customersTable.id, custId));

    await tx.insert(transactionsTable).values({
      type: "opening_balance",
      reference_type: "customer_opening",
      reference_id: custId,
      customer_id: custId,
      customer_name: customer.name,
      amount: String(amt),
      direction: "none",
      description: notes ?? `رصيد أول المدة — ${customer.name}`,
      date: date ?? new Date().toISOString().split("T")[0],
      company_id: companyId,
    });
  });

  res.status(201).json({ success: true, supplier_id: custId, supplier_name: customer.name, amount: amt });
}));

export default router;
