import { Router, type IRouter } from "express";
import { eq, and, inArray, sql } from "drizzle-orm";
import { db, productsTable, stockMovementsTable, categoriesTable } from "@workspace/db";
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
import { hasPermission } from "../lib/permissions";

const router: IRouter = Router();

function formatProduct(p: any & { category_name?: string | null }) {
  return {
    id: p.id,
    name: p.name,
    sku: p.sku ?? null,
    category: p.category ?? null,
    category_id: p.category_id ?? null,
    category_name: p.category_name ?? p.category ?? null,
    quantity: Number(p.quantity),
    cost_price: Number(p.cost_price),
    sale_price: Number(p.sale_price),
    low_stock_threshold: p.low_stock_threshold ?? null,
    company_id: p.company_id,
    created_at: p.created_at instanceof Date ? p.created_at.toISOString() : String(p.created_at),
  };
}

router.get("/products", wrap(async (req, res) => {
  if (!hasPermission(req.user, "can_view_products")) {
    res.status(403).json({ error: "غير مصرح بعرض الأصناف" }); return;
  }
  const companyId = req.user?.company_id ?? null;
  const warehouseIdParam = req.query.warehouse_id ? parseInt(String(req.query.warehouse_id), 10) : null;

  if (warehouseIdParam && !isNaN(warehouseIdParam)) {
    const warehouseStock = await db
      .select({
        product_id: stockMovementsTable.product_id,
        current_qty: sql<string>`MAX(${stockMovementsTable.quantity_after})`,
      })
      .from(stockMovementsTable)
      .where(eq(stockMovementsTable.warehouse_id, warehouseIdParam))
      .groupBy(stockMovementsTable.product_id);

    if (warehouseStock.length === 0) { res.json([]); return; }

    const productIds = warehouseStock.map(r => r.product_id).filter(Boolean) as number[];
    const qtyMap = new Map(warehouseStock.map(r => [r.product_id, r.current_qty]));

    const rows = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        sku: productsTable.sku,
        category: productsTable.category,
        category_id: productsTable.category_id,
        category_name: categoriesTable.name,
        quantity: productsTable.quantity,
        cost_price: productsTable.cost_price,
        sale_price: productsTable.sale_price,
        low_stock_threshold: productsTable.low_stock_threshold,
        company_id: productsTable.company_id,
        created_at: productsTable.created_at,
      })
      .from(productsTable)
      .leftJoin(categoriesTable, eq(categoriesTable.id, productsTable.category_id))
      .where(
        and(
          inArray(productsTable.id, productIds),
          companyId !== null ? eq(productsTable.company_id, companyId) : undefined,
        )
      )
      .orderBy(productsTable.name);

    const enriched = rows.map(p => ({
      ...formatProduct(p),
      quantity: Number(qtyMap.get(p.id) ?? p.quantity),
    }));

    res.json(GetProductsResponse.parse(enriched)); return;
  }

  const rawLimitP = parseInt(String(req.query.limit ?? "1000"), 10);
  const limitP = Math.min(Math.max(isNaN(rawLimitP) ? 1000 : rawLimitP, 1), 2000);

  const rows = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      sku: productsTable.sku,
      category: productsTable.category,
      category_id: productsTable.category_id,
      category_name: categoriesTable.name,
      quantity: productsTable.quantity,
      cost_price: productsTable.cost_price,
      sale_price: productsTable.sale_price,
      low_stock_threshold: productsTable.low_stock_threshold,
      company_id: productsTable.company_id,
      created_at: productsTable.created_at,
    })
    .from(productsTable)
    .leftJoin(categoriesTable, eq(categoriesTable.id, productsTable.category_id))
    .where(companyId !== null ? eq(productsTable.company_id, companyId) : undefined)
    .orderBy(productsTable.created_at)
    .limit(limitP);

  res.json(GetProductsResponse.parse(rows.map(formatProduct)));
}));

async function resolveCategoryId(
  categoryId: number | null | undefined,
  categoryName: string | null | undefined,
  companyId: number,
): Promise<number | null> {
  if (categoryId) return categoryId;
  if (!categoryName?.trim()) return null;

  const name = categoryName.trim();
  const [existing] = await db
    .select()
    .from(categoriesTable)
    .where(and(eq(categoriesTable.name, name), eq(categoriesTable.company_id, companyId)));

  if (existing) return existing.id;

  const [created] = await db
    .insert(categoriesTable)
    .values({ name, company_id: companyId })
    .returning();

  return created?.id ?? null;
}

router.post("/products", wrap(async (req, res) => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const role = req.user?.role ?? "cashier";
  const queryWarehouseId = req.query.warehouse_id ? parseInt(String(req.query.warehouse_id), 10) : null;
  const effectiveWarehouseId = (role === "admin" || role === "manager") ? queryWarehouseId : (req.user?.warehouse_id ?? null);
  const companyId = req.user?.company_id ?? 1;

  const resolvedCategoryId = await resolveCategoryId(
    (parsed.data as any).category_id,
    parsed.data.category,
    companyId,
  );

  const [product] = await db.insert(productsTable).values({
    name: parsed.data.name,
    sku: parsed.data.sku ?? null,
    category: parsed.data.category ?? null,
    category_id: resolvedCategoryId,
    quantity: String(parsed.data.quantity),
    cost_price: String(parsed.data.cost_price),
    sale_price: String(parsed.data.sale_price),
    low_stock_threshold: parsed.data.low_stock_threshold ?? null,
    company_id: companyId,
  }).returning();

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

  let categoryName: string | null = null;
  if (resolvedCategoryId) {
    const [cat] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, resolvedCategoryId));
    categoryName = cat?.name ?? null;
  }

  res.status(201).json(formatProduct({ ...product, category_name: categoryName }));
}));

router.put("/products/:id", wrap(async (req, res) => {
  if (!hasPermission(req.user, "can_manage_products")) {
    res.status(403).json({ error: "غير مصرح بتعديل المنتجات" }); return;
  }
  const params = UpdateProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const companyId = req.user?.company_id ?? 1;
  const resolvedCategoryId = await resolveCategoryId(
    (parsed.data as any).category_id,
    parsed.data.category,
    companyId,
  );

  const [product] = await db.update(productsTable).set({
    name: parsed.data.name,
    sku: parsed.data.sku ?? null,
    category: parsed.data.category ?? null,
    category_id: resolvedCategoryId,
    quantity: parsed.data.quantity !== undefined ? String(parsed.data.quantity) : undefined,
    cost_price: parsed.data.cost_price !== undefined ? String(parsed.data.cost_price) : undefined,
    sale_price: parsed.data.sale_price !== undefined ? String(parsed.data.sale_price) : undefined,
    low_stock_threshold: parsed.data.low_stock_threshold ?? null,
  }).where(eq(productsTable.id, params.data.id)).returning();

  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  let categoryName: string | null = null;
  if (resolvedCategoryId) {
    const [cat] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, resolvedCategoryId));
    categoryName = cat?.name ?? null;
  }

  res.json(UpdateProductResponse.parse(formatProduct({ ...product, category_name: categoryName })));
}));

router.delete("/products/:id", wrap(async (req, res) => {
  if (!hasPermission(req.user, "can_manage_products")) {
    res.status(403).json({ error: "غير مصرح بحذف المنتجات" }); return;
  }
  const params = DeleteProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(productsTable).where(eq(productsTable.id, params.data.id));
  res.json(DeleteProductResponse.parse({ success: true, message: "Product deleted" }));
}));

export default router;
