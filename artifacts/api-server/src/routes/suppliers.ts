import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, suppliersTable, transactionsTable } from "@workspace/db";
import {
  GetSuppliersResponse,
  CreateSupplierBody,
  UpdateSupplierParams,
  UpdateSupplierBody,
  UpdateSupplierResponse,
  DeleteSupplierParams,
  DeleteSupplierResponse,
  CreateSupplierPaymentParams,
  CreateSupplierPaymentBody,
  CreateSupplierPaymentResponse,
} from "@workspace/api-zod";
import { wrap } from "../lib/async-handler";

const router: IRouter = Router();

function formatSupplier(s: typeof suppliersTable.$inferSelect) {
  return {
    ...s,
    balance: Number(s.balance),
    created_at: s.created_at.toISOString(),
  };
}

router.get("/suppliers", wrap(async (_req, res) => {
  const suppliers = await db.select().from(suppliersTable).orderBy(suppliersTable.name);
  res.json(GetSuppliersResponse.parse(suppliers.map(formatSupplier)));
}));

router.post("/suppliers", wrap(async (req, res) => {
  const parsed = CreateSupplierBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [supplier] = await db.insert(suppliersTable).values({
    name: parsed.data.name,
    phone: parsed.data.phone ?? null,
    balance: String(parsed.data.balance ?? 0),
  }).returning();
  res.status(201).json(formatSupplier(supplier));
}));

router.put("/suppliers/:id", wrap(async (req, res) => {
  const params = UpdateSupplierParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateSupplierBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [supplier] = await db.update(suppliersTable).set({
    name: parsed.data.name,
    phone: parsed.data.phone ?? null,
    balance: parsed.data.balance !== undefined ? String(parsed.data.balance) : undefined,
  }).where(eq(suppliersTable.id, params.data.id)).returning();
  if (!supplier) {
    res.status(404).json({ error: "Supplier not found" });
    return;
  }
  res.json(UpdateSupplierResponse.parse(formatSupplier(supplier)));
}));

router.delete("/suppliers/:id", wrap(async (req, res) => {
  const params = DeleteSupplierParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(suppliersTable).where(eq(suppliersTable.id, params.data.id));
  res.json(DeleteSupplierResponse.parse({ success: true, message: "Supplier deleted" }));
}));

router.post("/suppliers/:id/payment", wrap(async (req, res) => {
  const params = CreateSupplierPaymentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateSupplierPaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, params.data.id));
  if (!supplier) {
    res.status(404).json({ error: "Supplier not found" });
    return;
  }

  const newBalance = Math.max(0, Number(supplier.balance) - parsed.data.amount);
  const [updated] = await db.update(suppliersTable).set({ balance: String(newBalance) })
    .where(eq(suppliersTable.id, params.data.id)).returning();

  await db.insert(transactionsTable).values({
    type: "payment",
    reference_type: "supplier_payment",
    reference_id: params.data.id,
    amount: String(parsed.data.amount),
    direction: "out",
    description: parsed.data.description ?? `سند صرف - ${supplier.name}`,
    date: new Date().toISOString().split("T")[0],
  });

  res.json(CreateSupplierPaymentResponse.parse(formatSupplier(updated)));
}));

export default router;
