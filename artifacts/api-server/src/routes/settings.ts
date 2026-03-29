import { Router } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  erpUsersTable,
  safesTable,
  safeTransfersTable,
  warehousesTable,
  salesTable,
  saleItemsTable,
  purchasesTable,
  purchaseItemsTable,
  customersTable,
  suppliersTable,
  expensesTable,
  incomeTable,
  transactionsTable,
  productsTable,
  receiptVouchersTable,
  depositVouchersTable,
  paymentVouchersTable,
  salesReturnsTable,
  saleReturnItemsTable,
  purchaseReturnsTable,
  purchaseReturnItemsTable,
  treasuryVouchersTable,
  journalEntriesTable,
  journalEntryLinesTable,
  accountsTable,
} from "@workspace/db";

const router = Router();

// ─── USERS ────────────────────────────────────────────────────────────────────

router.get("/settings/users", async (req, res) => {
  try {
    const users = await db.select().from(erpUsersTable).orderBy(erpUsersTable.id);
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: "فشل جلب المستخدمين" });
  }
});

router.post("/settings/users", async (req, res) => {
  try {
    const { name, username, pin, role, permissions } = req.body;
    const [user] = await db.insert(erpUsersTable).values({
      name,
      username,
      pin: pin || "0000",
      role: role || "cashier",
      permissions: permissions || "{}",
    }).returning();
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: "فشل إضافة المستخدم" });
  }
});

router.put("/settings/users/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, username, pin, role, permissions, active } = req.body;
    const [user] = await db.update(erpUsersTable)
      .set({ name, username, pin, role, permissions, active })
      .where(eq(erpUsersTable.id, id))
      .returning();
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: "فشل تعديل المستخدم" });
  }
});

router.delete("/settings/users/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(erpUsersTable).where(eq(erpUsersTable.id, id));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "فشل حذف المستخدم" });
  }
});

// ─── SAFES ────────────────────────────────────────────────────────────────────

router.get("/settings/safes", async (req, res) => {
  try {
    const safes = await db.select().from(safesTable).orderBy(safesTable.id);
    res.json(safes);
  } catch (e) {
    res.status(500).json({ error: "فشل جلب الخزائن" });
  }
});

router.post("/settings/safes", async (req, res) => {
  try {
    const { name, balance } = req.body;
    const [safe] = await db.insert(safesTable).values({ name, balance: String(balance || 0) }).returning();
    res.json(safe);
  } catch (e) {
    res.status(500).json({ error: "فشل إضافة الخزنة" });
  }
});

router.put("/settings/safes/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, balance } = req.body;
    const [safe] = await db.update(safesTable)
      .set({ name, balance: String(balance) })
      .where(eq(safesTable.id, id))
      .returning();
    res.json(safe);
  } catch (e) {
    res.status(500).json({ error: "فشل تعديل الخزنة" });
  }
});

router.delete("/settings/safes/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(safesTable).where(eq(safesTable.id, id));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "فشل حذف الخزنة" });
  }
});

// ─── SAFE TRANSFERS ───────────────────────────────────────────────────────────

router.get("/settings/safe-transfers", async (req, res) => {
  try {
    const transfers = await db.select().from(safeTransfersTable).orderBy(desc(safeTransfersTable.created_at));
    res.json(transfers);
  } catch (e) {
    res.status(500).json({ error: "فشل جلب التحويلات" });
  }
});

router.post("/settings/safe-transfers", async (req, res) => {
  try {
    const { from_safe_id, to_safe_id, amount, notes } = req.body;
    const amt = Number(amount);
    if (!amt || amt <= 0) { res.status(400).json({ error: "مبلغ غير صحيح" }); return; }

    const [fromSafe] = await db.select().from(safesTable).where(eq(safesTable.id, Number(from_safe_id)));
    const [toSafe] = await db.select().from(safesTable).where(eq(safesTable.id, Number(to_safe_id)));

    if (!fromSafe || !toSafe) { res.status(404).json({ error: "خزنة غير موجودة" }); return; }
    if (Number(fromSafe.balance) < amt) { res.status(400).json({ error: "رصيد الخزنة غير كافٍ" }); return; }

    await db.update(safesTable)
      .set({ balance: String(Number(fromSafe.balance) - amt) })
      .where(eq(safesTable.id, Number(from_safe_id)));

    await db.update(safesTable)
      .set({ balance: String(Number(toSafe.balance) + amt) })
      .where(eq(safesTable.id, Number(to_safe_id)));

    const [transfer] = await db.insert(safeTransfersTable).values({
      from_safe_id: Number(from_safe_id),
      from_safe_name: fromSafe.name,
      to_safe_id: Number(to_safe_id),
      to_safe_name: toSafe.name,
      amount: String(amt),
      notes: notes || null,
    }).returning();

    res.json(transfer);
  } catch (e) {
    res.status(500).json({ error: "فشل التحويل" });
  }
});

// ─── WAREHOUSES ───────────────────────────────────────────────────────────────

router.get("/settings/warehouses", async (req, res) => {
  try {
    const warehouses = await db.select().from(warehousesTable).orderBy(warehousesTable.id);
    res.json(warehouses);
  } catch (e) {
    res.status(500).json({ error: "فشل جلب المخازن" });
  }
});

router.post("/settings/warehouses", async (req, res) => {
  try {
    const { name, address } = req.body;
    const [warehouse] = await db.insert(warehousesTable).values({ name, address: address || null }).returning();
    res.json(warehouse);
  } catch (e) {
    res.status(500).json({ error: "فشل إضافة المخزن" });
  }
});

router.delete("/settings/warehouses/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(warehousesTable).where(eq(warehousesTable.id, id));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "فشل حذف المخزن" });
  }
});

// ─── RESET DATABASE ───────────────────────────────────────────────────────────

router.post("/settings/reset", async (req, res) => {
  try {
    const { confirm } = req.body;
    if (confirm !== "تأكيد الحذف") {
      res.status(400).json({ error: "يجب كتابة عبارة التأكيد بشكل صحيح" });
      return;
    }

    // حذف البنود أولاً (foreign keys)
    await db.delete(journalEntryLinesTable);
    await db.delete(journalEntriesTable);
    await db.delete(saleReturnItemsTable);
    await db.delete(salesReturnsTable);
    await db.delete(purchaseReturnItemsTable);
    await db.delete(purchaseReturnsTable);
    await db.delete(saleItemsTable);
    await db.delete(salesTable);
    await db.delete(purchaseItemsTable);
    await db.delete(purchasesTable);
    await db.delete(expensesTable);
    await db.delete(incomeTable);
    await db.delete(receiptVouchersTable);
    await db.delete(depositVouchersTable);
    await db.delete(paymentVouchersTable);
    await db.delete(treasuryVouchersTable);
    await db.delete(safeTransfersTable);
    await db.delete(transactionsTable);
    await db.delete(accountsTable);

    // تصفير الأرصدة
    await db.update(customersTable).set({ balance: "0" });
    await db.update(suppliersTable).set({ balance: "0" });
    await db.update(productsTable).set({ quantity: "0" });
    await db.update(safesTable).set({ balance: "0" });

    res.json({ success: true, message: "تم تصفير قاعدة البيانات بنجاح" });
  } catch (e: unknown) {
    res.status(500).json({ error: "فشل التصفير: " + (e instanceof Error ? e.message : String(e)) });
  }
});

// ─── CUSTOMER STATEMENT ───────────────────────────────────────────────────────

router.get("/customers/:id/statement", async (req, res) => {
  try {
    const customerId = Number(req.params.id);

    const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, customerId));
    if (!customer) { res.status(404).json({ error: "العميل غير موجود" }); return; }

    const sales = await db.select().from(salesTable)
      .where(eq(salesTable.customer_id, customerId))
      .orderBy(desc(salesTable.created_at));

    const salesWithItems = await Promise.all(sales.map(async (sale) => {
      const items = await db.select().from(saleItemsTable).where(eq(saleItemsTable.sale_id, sale.id));
      return { ...sale, items };
    }));

    const linkedPurchases = await db.select().from(purchasesTable)
      .where(eq(purchasesTable.customer_id, customerId))
      .orderBy(desc(purchasesTable.created_at));

    const purchasesWithItems = await Promise.all(linkedPurchases.map(async (pur) => {
      const items = await db.select().from(purchaseItemsTable).where(eq(purchaseItemsTable.purchase_id, pur.id));
      return { ...pur, items };
    }));

    res.json({
      customer,
      sales: salesWithItems,
      linked_purchases: purchasesWithItems,
    });
  } catch (e) {
    res.status(500).json({ error: "فشل جلب كشف الحساب" });
  }
});

export default router;
