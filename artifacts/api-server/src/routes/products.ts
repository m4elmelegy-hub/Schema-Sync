import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, productsTable } from "@workspace/db";
import {
  GetProductsResponse,
  CreateProductBody,
  UpdateProductParams,
  UpdateProductBody,
  UpdateProductResponse,
  DeleteProductParams,
  DeleteProductResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/products", async (_req, res): Promise<void> => {
  const products = await db.select().from(productsTable).orderBy(productsTable.created_at);
  res.json(GetProductsResponse.parse(products.map(p => ({
    ...p,
    quantity: Number(p.quantity),
    cost_price: Number(p.cost_price),
    sale_price: Number(p.sale_price),
    created_at: p.created_at.toISOString(),
  }))));
});

router.post("/products", async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [product] = await db.insert(productsTable).values({
    name: parsed.data.name,
    sku: parsed.data.sku ?? null,
    category: parsed.data.category ?? null,
    quantity: String(parsed.data.quantity),
    cost_price: String(parsed.data.cost_price),
    sale_price: String(parsed.data.sale_price),
    low_stock_threshold: parsed.data.low_stock_threshold ?? null,
  }).returning();
  res.status(201).json({
    ...product,
    quantity: Number(product.quantity),
    cost_price: Number(product.cost_price),
    sale_price: Number(product.sale_price),
    created_at: product.created_at.toISOString(),
  });
});

router.put("/products/:id", async (req, res): Promise<void> => {
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
  res.json(UpdateProductResponse.parse({
    ...product,
    quantity: Number(product.quantity),
    cost_price: Number(product.cost_price),
    sale_price: Number(product.sale_price),
    created_at: product.created_at.toISOString(),
  }));
});

router.delete("/products/:id", async (req, res): Promise<void> => {
  const params = DeleteProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(productsTable).where(eq(productsTable.id, params.data.id));
  res.json(DeleteProductResponse.parse({ success: true, message: "Product deleted" }));
});

export default router;
