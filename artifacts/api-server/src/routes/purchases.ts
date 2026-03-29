import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, purchasesTable, purchaseItemsTable, productsTable, customersTable, safesTable, transactionsTable, stockMovementsTable } from "@workspace/db";
import {
  GetPurchasesResponse,
  CreatePurchaseBody,
  GetPurchaseByIdParams,
  GetPurchaseByIdResponse,
} from "@workspace/api-zod";
import { wrap } from "../lib/async-handler";

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

router.get("/purchases", wrap(async (_req, res) => {
  const purchases = await db.select().from(purchasesTable).orderBy(purchasesTable.created_at);
  res.json(GetPurchasesResponse.parse(purchases.map(formatPurchase)));
}));

router.post("/purchases", wrap(async (req, res) => {
  const parsed = CreatePurchaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const {
    payment_type,
    total_amount,
    paid_amount,
    items,
    supplier_name,
    supplier_id,
    customer_id,
    customer_name,
    safe_id,
    notes,
  } = parsed.data;

  const remaining = total_amount - paid_amount;

  let status = "paid";
  if (payment_type === "credit") status = "unpaid";
  else if (remaining > 0) status = "partial";

  const invoiceNo = `PUR-${Date.now()}`;

  const today = new Date().toISOString().split("T")[0];

  const purchase = await db.transaction(async (tx) => {
    const [newPurchase] = await tx.insert(purchasesTable).values({
      invoice_no: invoiceNo,
      supplier_name: supplier_name ?? null,
      supplier_id: supplier_id ?? null,
      customer_id: customer_id ?? null,
      customer_name: customer_name ?? null,
      customer_payment_type: payment_type,
      payment_type,
      total_amount: String(total_amount),
      paid_amount: String(paid_amount),
      remaining_amount: String(payment_type === "credit" ? total_amount : remaining),
      status,
      notes: notes ?? null,
    }).returning();

    for (const item of items) {
      await tx.insert(purchaseItemsTable).values({
        purchase_id: newPurchase.id,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: String(item.quantity),
        unit_price: String(item.unit_price),
        total_price: String(item.total_price),
      });

      const [prod] = await tx.select().from(productsTable).where(eq(productsTable.id, item.product_id));
      if (prod) {
        const oldQty = Number(prod.quantity);
        const oldCost = Number(prod.cost_price);
        const newItemQty = Number(item.quantity);
        const newItemCost = Number(item.unit_price);
        const newTotalQty = oldQty + newItemQty;
        const newAvgCost = newTotalQty > 0
          ? (oldQty * oldCost + newItemQty * newItemCost) / newTotalQty
          : newItemCost;

        await tx.update(productsTable)
          .set({
            quantity: String(newTotalQty),
            cost_price: String(newAvgCost.toFixed(4)),
          })
          .where(eq(productsTable.id, item.product_id));

        await tx.insert(stockMovementsTable).values({
          product_id: item.product_id,
          product_name: item.product_name,
          movement_type: "purchase",
          quantity: String(newItemQty),
          quantity_before: String(oldQty),
          quantity_after: String(newTotalQty),
          unit_cost: String(newItemCost),
          reference_type: "purchase",
          reference_id: newPurchase.id,
          reference_no: invoiceNo,
          notes: supplier_name ? `مشتريات من ${supplier_name}` : "فاتورة مشتريات",
          date: today,
        });
      }
    }

    const cashOut = payment_type === "cash" ? total_amount
      : payment_type === "partial" ? paid_amount
      : 0;

    const customerDebt = payment_type === "credit" ? total_amount
      : payment_type === "partial" ? remaining
      : 0;

    if (cashOut > 0 && safe_id) {
      const [safe] = await tx.select().from(safesTable).where(eq(safesTable.id, safe_id));
      if (safe) {
        await tx.update(safesTable)
          .set({ balance: String(Number(safe.balance) - cashOut) })
          .where(eq(safesTable.id, safe_id));
        await tx.insert(transactionsTable).values({
          type: "purchase_cash",
          reference_type: "purchase",
          reference_id: newPurchase.id,
          safe_id: safe.id,
          safe_name: safe.name,
          customer_id: customer_id ?? null,
          customer_name: customer_name ?? null,
          amount: String(cashOut),
          direction: "out",
          description: `دفع نقدي — فاتورة مشتريات ${invoiceNo}${customer_name ? ` (${customer_name})` : ""}`,
          date: today,
          related_id: newPurchase.id,
        });
      }
    }

    if (customerDebt > 0 && customer_id) {
      const [cust] = await tx.select().from(customersTable).where(eq(customersTable.id, customer_id));
      if (cust) {
        await tx.update(customersTable)
          .set({ balance: String(Number(cust.balance) - customerDebt) })
          .where(eq(customersTable.id, customer_id));
        await tx.insert(transactionsTable).values({
          type: "purchase_credit",
          reference_type: "purchase",
          reference_id: newPurchase.id,
          safe_id: null,
          safe_name: null,
          customer_id: customer_id,
          customer_name: customer_name ?? null,
          amount: String(customerDebt),
          direction: "out",
          description: `مشتريات آجل من ${customer_name ?? "عميل"} — فاتورة ${invoiceNo}`,
          date: today,
          related_id: newPurchase.id,
        });
      }
    }

    await tx.insert(transactionsTable).values({
      type: "purchase",
      reference_type: "purchase",
      reference_id: newPurchase.id,
      safe_id: safe_id ?? null,
      safe_name: null,
      customer_id: customer_id ?? null,
      customer_name: customer_name ?? null,
      amount: String(total_amount),
      direction: "out",
      description: `فاتورة مشتريات ${invoiceNo}${customer_name ? ` — ${customer_name}` : ""}`,
      date: today,
      related_id: newPurchase.id,
    });

    return newPurchase;
  });

  res.status(201).json(formatPurchase(purchase));
}));

router.get("/purchases/:id", wrap(async (req, res) => {
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
}));

export default router;
