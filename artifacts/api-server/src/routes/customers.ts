import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, customersTable, transactionsTable } from "@workspace/db";
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
import { wrap } from "../lib/async-handler";

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

export default router;
