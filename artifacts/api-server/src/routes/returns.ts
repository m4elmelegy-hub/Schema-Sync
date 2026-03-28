import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, salesReturnsTable, saleReturnItemsTable, purchaseReturnsTable, purchaseReturnItemsTable, productsTable, customersTable } from "@workspace/db";

const router: IRouter = Router();

// ── مرتجعات المبيعات ───────────────────────────────────────
router.get("/sales-returns", async (_req, res): Promise<void> => {
  const returns_ = await db.select().from(salesReturnsTable).orderBy(salesReturnsTable.created_at);
  res.json(returns_.map(r => ({ ...r, total_amount: Number(r.total_amount), created_at: r.created_at.toISOString() })).reverse());
});

router.get("/sales-returns/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [ret] = await db.select().from(salesReturnsTable).where(eq(salesReturnsTable.id, id));
  if (!ret) { res.status(404).json({ error: "غير موجود" }); return; }
  const items = await db.select().from(saleReturnItemsTable).where(eq(saleReturnItemsTable.return_id, id));
  res.json({
    ...ret,
    total_amount: Number(ret.total_amount),
    created_at: ret.created_at.toISOString(),
    items: items.map(i => ({ ...i, quantity: Number(i.quantity), unit_price: Number(i.unit_price), total_price: Number(i.total_price) })),
  });
});

router.post("/sales-returns", async (req, res): Promise<void> => {
  const { sale_id, customer_id, customer_name, items, reason, notes } = req.body;
  if (!items?.length) { res.status(400).json({ error: "أضف أصناف المرتجع" }); return; }
  const total = items.reduce((s: number, i: { total_price: number }) => s + i.total_price, 0);
  const return_no = `SR-${Date.now()}`;

  try {
    const ret = await db.transaction(async (tx) => {
      const [ret] = await tx.insert(salesReturnsTable).values({
        return_no, sale_id: sale_id ?? null, customer_id: customer_id ?? null,
        customer_name: customer_name ?? null, total_amount: String(total),
        reason: reason ?? null, notes: notes ?? null,
      }).returning();

      for (const item of items) {
        await tx.insert(saleReturnItemsTable).values({
          return_id: ret.id,
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: String(item.quantity),
          unit_price: String(item.unit_price),
          total_price: String(item.total_price),
        });
        // أعِد الكمية للمخزون (العميل يُرجع البضاعة → المخزون يرتفع)
        const [prod] = await tx.select().from(productsTable).where(eq(productsTable.id, item.product_id));
        if (prod) {
          await tx.update(productsTable)
            .set({ quantity: String(Number(prod.quantity) + item.quantity) })
            .where(eq(productsTable.id, item.product_id));
        }
      }

      // خصم المرتجع من رصيد العميل (كان دَيْناً → ينقص)
      if (customer_id) {
        const [cust] = await tx.select().from(customersTable).where(eq(customersTable.id, parseInt(customer_id)));
        if (cust) {
          await tx.update(customersTable)
            .set({ balance: String(Math.max(0, Number(cust.balance) - total)) })
            .where(eq(customersTable.id, cust.id));
        }
      }
      return ret;
    });

    res.status(201).json({ ...ret, total_amount: Number(ret.total_amount), created_at: ret.created_at.toISOString() });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "خطأ في حفظ المرتجع" });
  }
});

router.delete("/sales-returns/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  await db.delete(saleReturnItemsTable).where(eq(saleReturnItemsTable.return_id, id));
  await db.delete(salesReturnsTable).where(eq(salesReturnsTable.id, id));
  res.json({ success: true });
});

// ── مرتجعات المشتريات ──────────────────────────────────────
router.get("/purchase-returns", async (_req, res): Promise<void> => {
  const returns_ = await db.select().from(purchaseReturnsTable).orderBy(purchaseReturnsTable.created_at);
  res.json(returns_.map(r => ({ ...r, total_amount: Number(r.total_amount), created_at: r.created_at.toISOString() })).reverse());
});

router.get("/purchase-returns/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [ret] = await db.select().from(purchaseReturnsTable).where(eq(purchaseReturnsTable.id, id));
  if (!ret) { res.status(404).json({ error: "غير موجود" }); return; }
  const items = await db.select().from(purchaseReturnItemsTable).where(eq(purchaseReturnItemsTable.return_id, id));
  res.json({
    ...ret,
    total_amount: Number(ret.total_amount),
    created_at: ret.created_at.toISOString(),
    items: items.map(i => ({ ...i, quantity: Number(i.quantity), unit_price: Number(i.unit_price), total_price: Number(i.total_price) })),
  });
});

router.post("/purchase-returns", async (req, res): Promise<void> => {
  const { purchase_id, supplier_name, items, reason, notes } = req.body;
  if (!items?.length) { res.status(400).json({ error: "أضف أصناف المرتجع" }); return; }
  const total = items.reduce((s: number, i: { total_price: number }) => s + i.total_price, 0);
  const return_no = `PR-${Date.now()}`;
  const [ret] = await db.insert(purchaseReturnsTable).values({
    return_no, purchase_id: purchase_id ?? null,
    supplier_name: supplier_name ?? null, total_amount: String(total),
    reason: reason ?? null, notes: notes ?? null,
  }).returning();
  for (const item of items) {
    await db.insert(purchaseReturnItemsTable).values({
      return_id: ret.id,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: String(item.quantity),
      unit_price: String(item.unit_price),
      total_price: String(item.total_price),
    });
    // خصم الكمية من المخزون
    const [prod] = await db.select().from(productsTable).where(eq(productsTable.id, item.product_id));
    if (prod) {
      await db.update(productsTable).set({ quantity: Math.max(0, prod.quantity - item.quantity) }).where(eq(productsTable.id, item.product_id));
    }
  }
  res.status(201).json({ ...ret, total_amount: Number(ret.total_amount), created_at: ret.created_at.toISOString() });
});

router.delete("/purchase-returns/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  await db.delete(purchaseReturnItemsTable).where(eq(purchaseReturnItemsTable.return_id, id));
  await db.delete(purchaseReturnsTable).where(eq(purchaseReturnsTable.id, id));
  res.json({ success: true });
});

export default router;
