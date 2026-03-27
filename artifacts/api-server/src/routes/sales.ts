import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, salesTable, saleItemsTable, productsTable, customersTable, transactionsTable } from "@workspace/db";
import {
  GetSalesResponse,
  CreateSaleBody,
  GetSaleByIdParams,
  GetSaleByIdResponse,
} from "@workspace/api-zod";

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
  };
}

router.get("/sales", async (_req, res): Promise<void> => {
  const sales = await db.select().from(salesTable).orderBy(salesTable.created_at);
  res.json(GetSalesResponse.parse(sales.map(formatSale)));
});

router.post("/sales", async (req, res): Promise<void> => {
  const parsed = CreateSaleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { payment_type, total_amount, paid_amount, items, customer_name, customer_id, notes } = parsed.data;
  const remaining = total_amount - paid_amount;

  let status = "paid";
  if (payment_type === "credit") status = "unpaid";
  else if (remaining > 0) status = "partial";

  const invoiceNo = `INV-${Date.now()}`;

  const [sale] = await db.insert(salesTable).values({
    invoice_no: invoiceNo,
    customer_name: customer_name ?? null,
    customer_id: customer_id ?? null,
    payment_type,
    total_amount: String(total_amount),
    paid_amount: String(paid_amount),
    remaining_amount: String(payment_type === "credit" ? total_amount : remaining),
    status,
    notes: notes ?? null,
  }).returning();

  for (const item of items) {
    await db.insert(saleItemsTable).values({
      sale_id: sale.id,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: String(item.quantity),
      unit_price: String(item.unit_price),
      total_price: String(item.total_price),
    });
    const [prod] = await db.select().from(productsTable).where(eq(productsTable.id, item.product_id));
    if (prod) {
      const newQty = Math.max(0, Number(prod.quantity) - item.quantity);
      await db.update(productsTable).set({ quantity: String(newQty) }).where(eq(productsTable.id, item.product_id));
    }
  }

  // Update customer balance if credit or partial
  const debtAmount = payment_type === "credit" ? total_amount : (remaining > 0 ? remaining : 0);
  if (debtAmount > 0 && customer_id) {
    const [cust] = await db.select().from(customersTable).where(eq(customersTable.id, customer_id));
    if (cust) {
      await db.update(customersTable).set({ balance: String(Number(cust.balance) + debtAmount) }).where(eq(customersTable.id, customer_id));
    }
  }

  // Record transaction
  await db.insert(transactionsTable).values({
    type: "sale",
    amount: String(total_amount),
    description: `فاتورة مبيعات ${invoiceNo}`,
    related_id: sale.id,
  });

  res.status(201).json(formatSale(sale));
});

router.get("/sales/:id", async (req, res): Promise<void> => {
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
});

export default router;
