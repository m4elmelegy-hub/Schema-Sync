import { Router, type IRouter } from "express";
import { eq, ne, max } from "drizzle-orm";
import { db, customersTable, transactionsTable, safesTable } from "@workspace/db";
import { writeAuditLog } from "../lib/audit-log";
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
import { getOrCreateCustomerAccount } from "../lib/auto-account";

const router: IRouter = Router();

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase()
    .replace(/أ|إ|آ/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

function formatCustomer(c: typeof customersTable.$inferSelect) {
  return {
    ...c,
    balance: Number(c.balance),
    is_supplier: c.is_supplier ?? false,
    created_at: c.created_at.toISOString(),
  };
}

async function getNextCustomerCode(): Promise<number> {
  const result = await db.select({ maxCode: max(customersTable.customer_code) }).from(customersTable);
  const currentMax = result[0]?.maxCode ?? 0;
  return Math.max(currentMax ?? 0, 1000) + 1;
}

router.get("/customers", wrap(async (_req, res) => {
  const customers = await db.select().from(customersTable).orderBy(customersTable.customer_code);
  res.json(GetCustomersResponse.parse(customers.map(formatCustomer)));
}));

router.post("/customers", wrap(async (req, res) => {
  const parsed = CreateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const normalized = normalizeName(parsed.data.name);

  // Duplicate name check
  const existing = await db.select({ id: customersTable.id, name: customersTable.name })
    .from(customersTable)
    .where(eq(customersTable.normalized_name, normalized));
  if (existing.length > 0) {
    res.status(400).json({ error: `يوجد عميل بنفس الاسم بالفعل: "${existing[0].name}"` });
    return;
  }

  const newCode = await getNextCustomerCode();

  const [customer] = await db.insert(customersTable).values({
    name: parsed.data.name.trim(),
    customer_code: newCode,
    normalized_name: normalized,
    phone: parsed.data.phone ?? null,
    balance: String(parsed.data.balance ?? 0),
    is_supplier: parsed.data.is_supplier ?? false,
  }).returning();

  const acct = await getOrCreateCustomerAccount(newCode, parsed.data.name.trim());
  const [updated] = await db.update(customersTable)
    .set({ account_id: acct.id })
    .where(eq(customersTable.id, customer.id))
    .returning();

  void writeAuditLog({
    action: "create",
    record_type: "customer",
    record_id: updated.id,
    new_value: formatCustomer(updated),
    user: req.user ? { id: req.user.id, username: req.user.username } : null,
  });

  res.status(201).json(formatCustomer(updated));
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

  const normalized = normalizeName(parsed.data.name);

  // Duplicate check excluding self
  const existing = await db.select({ id: customersTable.id, name: customersTable.name })
    .from(customersTable)
    .where(eq(customersTable.normalized_name, normalized));
  const conflict = existing.find(e => e.id !== params.data.id);
  if (conflict) {
    res.status(400).json({ error: `يوجد عميل بنفس الاسم بالفعل: "${conflict.name}"` });
    return;
  }

  const [before] = await db.select().from(customersTable).where(eq(customersTable.id, params.data.id));

  const [customer] = await db.update(customersTable).set({
    name: parsed.data.name.trim(),
    normalized_name: normalized,
    phone: parsed.data.phone ?? null,
    balance: parsed.data.balance !== undefined ? String(parsed.data.balance) : undefined,
    is_supplier: parsed.data.is_supplier !== undefined ? parsed.data.is_supplier : undefined,
  }).where(eq(customersTable.id, params.data.id)).returning();
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  void writeAuditLog({
    action: "update",
    record_type: "customer",
    record_id: customer.id,
    old_value: before ? formatCustomer(before) : null,
    new_value: formatCustomer(customer),
    user: req.user ? { id: req.user.id, username: req.user.username } : null,
  });

  res.json(UpdateCustomerResponse.parse(formatCustomer(customer)));
}));

router.delete("/customers/:id", wrap(async (req, res) => {
  const params = DeleteCustomerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [before] = await db.select().from(customersTable).where(eq(customersTable.id, params.data.id));
  await db.delete(customersTable).where(eq(customersTable.id, params.data.id));

  void writeAuditLog({
    action: "delete",
    record_type: "customer",
    record_id: params.data.id,
    old_value: before ? formatCustomer(before) : null,
    new_value: null,
    user: req.user ? { id: req.user.id, username: req.user.username } : null,
  });

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
