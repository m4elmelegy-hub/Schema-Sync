import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, customersTable, transactionsTable, safesTable } from "@workspace/db";
import {
  GetCustomersResponse,
  CreateCustomerBody,
  UpdateCustomerParams,
  UpdateCustomerBody,
  UpdateCustomerResponse,
  DeleteCustomerParams,
  DeleteCustomerResponse,
  CreateCustomerReceiptParams,
  CreateCustomerReceiptBody,
  CreateCustomerReceiptResponse,
} from "@workspace/api-zod";
import { wrap, httpError } from "../lib/async-handler";

const router: IRouter = Router();

function formatCustomer(c: typeof customersTable.$inferSelect) {
  return {
    ...c,
    balance: Number(c.balance),
    is_supplier: c.is_supplier ?? false,
    created_at: c.created_at.toISOString(),
  };
}

router.get("/customers", wrap(async (_req, res) => {
  const customers = await db.select().from(customersTable).orderBy(customersTable.name);
  res.json(GetCustomersResponse.parse(customers.map(formatCustomer)));
}));

router.post("/customers", wrap(async (req, res) => {
  const parsed = CreateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [customer] = await db.insert(customersTable).values({
    name: parsed.data.name,
    phone: parsed.data.phone ?? null,
    balance: String(parsed.data.balance ?? 0),
    is_supplier: parsed.data.is_supplier ?? false,
  }).returning();
  res.status(201).json(formatCustomer(customer));
}));

router.put("/customers/:id", wrap(async (req, res) => {
  const params = UpdateCustomerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [customer] = await db.update(customersTable).set({
    name: parsed.data.name,
    phone: parsed.data.phone ?? null,
    balance: parsed.data.balance !== undefined ? String(parsed.data.balance) : undefined,
    is_supplier: parsed.data.is_supplier !== undefined ? parsed.data.is_supplier : undefined,
  }).where(eq(customersTable.id, params.data.id)).returning();
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  res.json(UpdateCustomerResponse.parse(formatCustomer(customer)));
}));

router.delete("/customers/:id", wrap(async (req, res) => {
  const params = DeleteCustomerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(customersTable).where(eq(customersTable.id, params.data.id));
  res.json(DeleteCustomerResponse.parse({ success: true, message: "Customer deleted" }));
}));

router.post("/customers/:id/receipt", wrap(async (req, res) => {
  const params = CreateCustomerReceiptParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateCustomerReceiptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, params.data.id));
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  const newBalance = Number(customer.balance) - parsed.data.amount;
  const [updated] = await db.update(customersTable).set({ balance: String(newBalance) })
    .where(eq(customersTable.id, params.data.id)).returning();

  await db.insert(transactionsTable).values({
    type: "receipt",
    amount: String(parsed.data.amount),
    description: parsed.data.description ?? `سند قبض - ${customer.name}`,
  });

  res.json(CreateCustomerReceiptResponse.parse(formatCustomer(updated)));
}));

router.post("/customers/:id/supplier-payment", wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) throw httpError(400, "معرّف غير صحيح");

  const { amount, safe_id, notes } = req.body;
  const amt = parseFloat(amount);
  if (!amt || amt <= 0) throw httpError(400, "أدخل مبلغاً صحيحاً");
  const safeId = parseInt(safe_id);
  if (isNaN(safeId)) throw httpError(400, "اختر الخزينة");

  let resultCustomer: typeof customersTable.$inferSelect | undefined;

  await db.transaction(async (tx) => {
    const [customer] = await tx.select().from(customersTable).where(eq(customersTable.id, id));
    if (!customer) throw httpError(404, "العميل غير موجود");
    if (!customer.is_supplier) throw httpError(400, "هذا العميل ليس مورداً");

    const [safe] = await tx.select().from(safesTable).where(eq(safesTable.id, safeId));
    if (!safe) throw httpError(404, "الخزينة غير موجودة");
    if (Number(safe.balance) < amt) throw httpError(400, "رصيد الخزينة غير كافٍ");

    await tx.update(safesTable)
      .set({ balance: String(Number(safe.balance) - amt) })
      .where(eq(safesTable.id, safe.id));

    const newBalance = Number(customer.balance) + amt;
    const [updated] = await tx.update(customersTable)
      .set({ balance: String(newBalance) })
      .where(eq(customersTable.id, id))
      .returning();

    await tx.insert(transactionsTable).values({
      type: "supplier_payment",
      direction: "out",
      customer_id: id,
      customer_name: customer.name,
      safe_id: safe.id,
      safe_name: safe.name,
      amount: String(amt),
      description: notes || `تسديد دفعة للمورد - ${customer.name}`,
      date: new Date().toISOString().split("T")[0],
    });

    resultCustomer = updated;
  });

  res.json({ success: true, customer: formatCustomer(resultCustomer!) });
}));

export default router;
