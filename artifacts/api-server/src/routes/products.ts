import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, productsTable, stockMovementsTable } from "@workspace/db";
import {
  GetProductsResponse,
  CreateProductBody,
  UpdateProductParams,
  UpdateProductBody,
  UpdateProductResponse,
  DeleteProductParams,
  DeleteProductResponse,
} from "@workspace/api-zod";
import { wrap } from "../lib/async-handler";

const router: IRouter = Router();

function formatProduct(p: typeof productsTable.$inferSelect) {
  return {
    ...p,
    quantity: Number(p.quantity),
    cost_price: Number(p.cost_price),
    sale_price: Number(p.sale_price),
    created_at: p.created_at.toISOString(),
  };
}

router.get("/products", wrap(async (req, res) => {
  const companyId = req.user?.company_id ?? null;
  const products = await db.select().from(productsTable)
    .where(companyId !== null ? eq(productsTable.company_id, companyId) : undefined)
    .orderBy(productsTable.created_at);
  res.json(GetProductsResponse.parse(products.map(formatProduct)));
}));

router.post("/products", wrap(async (req, res) => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const role = req.user?.role ?? "cashier";
  const queryWarehouseId = req.query.warehouse_id ? parseInt(String(req.query.warehouse_id), 10) : null;
  const effectiveWarehouseId = (role === "admin" || role === "manager") ? queryWarehouseId : (req.user?.warehouse_id ?? null);

  const [product] = await db.insert(productsTable).values({
    name: parsed.data.name,
    sku: parsed.data.sku ?? null,
    category: parsed.data.category ?? null,
    quantity: String(parsed.data.quantity),
    cost_price: String(parsed.data.cost_price),
    sale_price: String(parsed.data.sale_price),
    low_stock_threshold: parsed.data.low_stock_threshold ?? null,
    company_id: req.user?.company_id ?? undefined,
  }).returning();

  // ── تسجيل الرصيد الافتتاحي في جدول حركات المخزون ──
  if (parsed.data.quantity > 0) {
    await db.insert(stockMovementsTable).values({
      product_id: product.id,
      product_name: product.name,
      movement_type: "opening_balance",
      quantity: String(parsed.data.quantity),
      quantity_before: "0",
      quantity_after: String(parsed.data.quantity),
      unit_cost: String(parsed.data.cost_price),
      reference_type: "opening_balance",
      reference_no: `OB-${product.id}`,
      notes: "رصيد افتتاحي",
      date: new Date().toISOString().split("T")[0],
      warehouse_id: effectiveWarehouseId ?? 1,
    });
  }

  res.status(201).json(formatProduct(product));
}));

router.put("/products/:id", wrap(async (req, res) => {
  const role = req.user?.role ?? "cashier";
  if (role === "cashier" || role === "salesperson") {
    res.status(403).json({ error: "غير مصرح بتعديل المنتجات" }); return;
  }
  const params = UpdateProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [product] = await db.update(productsTable).set({
    name: parsed.data.name,
    sku: parsed.data.sku ?? null,
    category: parsed.data.category ?? null,
    quantity: parsed.data.quantity !== undefined ? String(parsed.data.quantity) : undefined,
    cost_price: parsed.data.cost_price !== undefined ? String(parsed.data.cost_price) : undefined,
    sale_price: parsed.data.sale_price !== undefined ? String(parsed.data.sale_price) : undefined,
    low_stock_threshold: parsed.data.low_stock_threshold ?? null,
  }).where(eq(productsTable.id, params.data.id)).returning();
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  res.json(UpdateProductResponse.parse(formatProduct(product)));
}));

router.delete("/products/:id", wrap(async (req, res) => {
  const role = req.user?.role ?? "cashier";
  if (role === "cashier" || role === "salesperson") {
    res.status(403).json({ error: "غير مصرح بحذف المنتجات" }); return;
  }
  const params = DeleteProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(productsTable).where(eq(productsTable.id, params.data.id));
  res.json(DeleteProductResponse.parse({ success: true, message: "Product deleted" }));
}));

export default router;
