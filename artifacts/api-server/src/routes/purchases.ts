import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, purchasesTable, purchaseItemsTable, productsTable, suppliersTable, transactionsTable } from "@workspace/db";
import {
  GetPurchasesResponse,
  CreatePurchaseBody,
  GetPurchaseByIdParams,
  GetPurchaseByIdResponse,
} from "@workspace/api-zod";

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
  };
}

router.get("/purchases", async (_req, res): Promise<void> => {
  const purchases = await db.select().from(purchasesTable).orderBy(purchasesTable.created_at);
  res.json(GetPurchasesResponse.parse(purchases.map(formatPurchase)));
});

router.post("/purchases", async (req, res): Promise<void> => {
  const parsed = CreatePurchaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { payment_type, total_amount, paid_amount, items, supplier_name, supplier_id, notes } = parsed.data;
  const remaining = total_amount - paid_amount;

  let status = "paid";
  if (payment_type === "credit") status = "unpaid";
  else if (remaining > 0) status = "partial";

  const invoiceNo = `PUR-${Date.now()}`;

  const [purchase] = await db.insert(purchasesTable).values({
    invoice_no: invoiceNo,
    supplier_name: supplier_name ?? null,
    supplier_id: supplier_id ?? null,
    payment_type,
    total_amount: String(total_amount),
    paid_amount: String(paid_amount),
    remaining_amount: String(payment_type === "credit" ? total_amount : remaining),
    status,
    notes: notes ?? null,
  }).returning();

  for (const item of items) {
    await db.insert(purchaseItemsTable).values({
      purchase_id: purchase.id,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: String(item.quantity),
      unit_price: String(item.unit_price),
      total_price: String(item.total_price),
    });
    // Increase product quantity
    const [prod] = await db.select().from(productsTable).where(eq(productsTable.id, item.product_id));
    if (prod) {
      const newQty = Number(prod.quantity) + item.quantity;
      await db.update(productsTable).set({ quantity: String(newQty) }).where(eq(productsTable.id, item.product_id));
    }
  }

  // Update supplier balance if credit or partial
  const debtAmount = payment_type === "credit" ? total_amount : (remaining > 0 ? remaining : 0);
  if (debtAmount > 0 && supplier_id) {
    const [supp] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, supplier_id));
    if (supp) {
      await db.update(suppliersTable).set({ balance: String(Number(supp.balance) + debtAmount) }).where(eq(suppliersTable.id, supplier_id));
    }
  }

  // Record transaction
  await db.insert(transactionsTable).values({
    type: "purchase",
    amount: String(total_amount),
    description: `فاتورة مشتريات ${invoiceNo}`,
    related_id: purchase.id,
  });

  res.status(201).json(formatPurchase(purchase));
});

router.get("/purchases/:id", async (req, res): Promise<void> => {
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
});

export default router;
