import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { authenticate, requireRole } from "../middleware/auth";
import { hashPin } from "../lib/hash";
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
  systemSettingsTable,
} from "@workspace/db";
import { invalidateClosingDateCache } from "../lib/period-lock";
import { writeAuditLog } from "../lib/audit-log";
import { auditLogsTable } from "@workspace/db";

const router = Router();

// ─── USERS ────────────────────────────────────────────────────────────────────

router.get("/settings/users", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const users = await db.select().from(erpUsersTable).orderBy(erpUsersTable.id);
    /* Mask PIN in API responses — never expose raw PIN */
    const masked = users.map(({ pin, ...u }) => ({
      ...u,
      pin: pin ? "****" : null,
      pinLength: Math.min(Math.max(pin?.length ?? 4, 4), 6),
    }));
    res.json(masked);
  } catch (e) {
    res.status(500).json({ error: "فشل جلب المستخدمين" });
  }
});

router.post("/settings/users", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { name, username, pin, role, permissions, warehouse_id, safe_id, active } = req.body;
    const rawPin = pin || "0000";
    const hashedPin = await hashPin(String(rawPin));
    const [user] = await db.insert(erpUsersTable).values({
      name,
      username,
      pin: hashedPin,
      role: role || "cashier",
      permissions: permissions || "{}",
      warehouse_id: warehouse_id ? Number(warehouse_id) : null,
      safe_id: safe_id ? Number(safe_id) : null,
      active: active !== undefined ? Boolean(active) : true,
    }).returning();
    res.json({ ...user, pin: "****" });
  } catch (e) {
    res.status(500).json({ error: "فشل إضافة المستخدم" });
  }
});

router.put("/settings/users/:id", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const requesterId = req.user!.id;
    const { name, username, pin, role, permissions, active, warehouse_id, safe_id } = req.body;

    /* Self-escalation prevention: no one can change their own role */
    if (requesterId === id && role !== undefined && role !== req.user!.role) {
      res.status(403).json({ error: "لا يمكنك تغيير دورك الخاص" });
      return;
    }

    /* Hash PIN only when a new one is provided */
    let hashedPin: string | undefined = undefined;
    if (pin !== undefined && pin !== null && pin !== "" && pin !== "****") {
      hashedPin = await hashPin(String(pin));
    }

    const [user] = await db.update(erpUsersTable)
      .set({
        name, username,
        ...(hashedPin !== undefined ? { pin: hashedPin } : {}),
        role, permissions, active,
        warehouse_id: warehouse_id !== undefined ? (warehouse_id ? Number(warehouse_id) : null) : undefined,
        safe_id: safe_id !== undefined ? (safe_id ? Number(safe_id) : null) : undefined,
      })
      .where(eq(erpUsersTable.id, id))
      .returning();
    res.json({ ...user, pin: "****" });
  } catch (e) {
    res.status(500).json({ error: "فشل تعديل المستخدم" });
  }
});

router.delete("/settings/users/:id", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);

    /* Prevent deleting yourself */
    if (req.user!.id === id) {
      res.status(403).json({ error: "لا يمكنك حذف حسابك الخاص" });
      return;
    }

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

router.post("/settings/safes", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { name, balance } = req.body;
    const [safe] = await db.insert(safesTable).values({ name, balance: String(balance || 0) }).returning();
    res.json(safe);
  } catch (e) {
    res.status(500).json({ error: "فشل إضافة الخزنة" });
  }
});

router.put("/settings/safes/:id", authenticate, requireRole("admin"), async (req, res) => {
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

router.delete("/settings/safes/:id", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(safesTable).where(eq(safesTable.id, id));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "فشل حذف الخزنة" });
  }
});

/* ── إقفال الخزينة (اليومي) — POST /settings/safes/:id/close ────────────────
   يُسجّل رصيد الإقفال ويُظهر ملخص حركات الخزينة في الفترة المحددة.
   إذا أُرسل actual_balance → يُسجَّل الفرق كتسوية عجز/زيادة.
──────────────────────────────────────────────────────────────────────────── */
router.post("/settings/safes/:id/close", authenticate, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { date, actual_balance, notes } = req.body;
    const closeDate = date ?? new Date().toISOString().split("T")[0];

    const [safe] = await db.select().from(safesTable).where(eq(safesTable.id, id));
    if (!safe) { res.status(404).json({ error: "الخزينة غير موجودة" }); return; }

    const systemBalance = Number(safe.balance);
    const closing_no = `CLO-${id}-${Date.now()}`;

    // جلب كل حركات هذا اليوم
    const todayTx = await db.select().from(transactionsTable)
      .where(eq(transactionsTable.safe_id, id))
      .orderBy(desc(transactionsTable.created_at));

    const dayTx = todayTx.filter(t => (t.date ?? "") === closeDate);
    const totalIn  = dayTx.filter(t => t.direction === "in").reduce((s, t) => s + Number(t.amount), 0);
    const totalOut = dayTx.filter(t => t.direction === "out").reduce((s, t) => s + Number(t.amount), 0);

    // تسوية الفرق إذا وُجد رصيد فعلي مختلف
    let difference = 0;
    let adjustmentNote = null;
    if (actual_balance !== undefined && actual_balance !== null) {
      const actualBal = Number(actual_balance);
      difference = actualBal - systemBalance;
      if (Math.abs(difference) > 0.001) {
        adjustmentNote = difference > 0
          ? `زيادة خزينة ${difference.toFixed(2)} — تم التسجيل في إقفال ${closing_no}`
          : `عجز خزينة ${Math.abs(difference).toFixed(2)} — تم التسجيل في إقفال ${closing_no}`;

        // تسجيل حركة التسوية
        await db.insert(transactionsTable).values({
          type: "safe_adjustment",
          reference_type: "safe_closing",
          safe_id: id,
          safe_name: safe.name,
          amount: String(Math.abs(difference)),
          direction: difference > 0 ? "in" : "out",
          description: adjustmentNote,
          date: closeDate,
        });

        // تحديث رصيد الخزينة
        await db.update(safesTable)
          .set({ balance: String(actualBal) })
          .where(eq(safesTable.id, id));
      }
    }

    // تسجيل حركة الإقفال
    await db.insert(transactionsTable).values({
      type: "safe_closing",
      reference_type: "safe_closing",
      safe_id: id,
      safe_name: safe.name,
      amount: String(actual_balance !== undefined ? Number(actual_balance) : systemBalance),
      direction: "in",
      description: notes ? `${notes} — إقفال ${closing_no}` : `إقفال خزينة ${safe.name} — ${closeDate}`,
      date: closeDate,
    });

    res.json({
      success: true,
      closing_no,
      safe_id: id,
      safe_name: safe.name,
      date: closeDate,
      system_balance: systemBalance,
      actual_balance: actual_balance !== undefined ? Number(actual_balance) : systemBalance,
      difference: Math.round(difference * 100) / 100,
      adjustment_note: adjustmentNote,
      summary: {
        total_in: Math.round(totalIn * 100) / 100,
        total_out: Math.round(totalOut * 100) / 100,
        net: Math.round((totalIn - totalOut) * 100) / 100,
        transaction_count: dayTx.length,
      },
    });
  } catch (e) {
    console.error("Safe close error:", e);
    res.status(500).json({ error: "فشل إقفال الخزينة" });
  }
});

/* ── كشف حساب الخزينة — GET /settings/safes/:id/statement ───────────────── */
router.get("/settings/safes/:id/statement", authenticate, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { date_from, date_to } = req.query as { date_from?: string; date_to?: string };

    const [safe] = await db.select().from(safesTable).where(eq(safesTable.id, id));
    if (!safe) { res.status(404).json({ error: "الخزينة غير موجودة" }); return; }

    let txList = await db.select().from(transactionsTable)
      .where(eq(transactionsTable.safe_id, id))
      .orderBy(transactionsTable.date, transactionsTable.created_at);

    if (date_from) txList = txList.filter(t => (t.date ?? "") >= date_from);
    if (date_to)   txList = txList.filter(t => (t.date ?? "") <= date_to);

    let running = 0;
    const rows = txList.map(t => {
      const amt = Number(t.amount);
      running += t.direction === "in" ? amt : -amt;
      return {
        id: t.id,
        type: t.type,
        direction: t.direction,
        amount: amt,
        balance_after: Math.round(running * 100) / 100,
        description: t.description,
        date: t.date,
        created_at: t.created_at?.toISOString(),
      };
    });

    const totalIn  = txList.filter(t => t.direction === "in").reduce((s, t) => s + Number(t.amount), 0);
    const totalOut = txList.filter(t => t.direction === "out").reduce((s, t) => s + Number(t.amount), 0);

    res.json({
      safe_id: id,
      safe_name: safe.name,
      current_balance: Number(safe.balance),
      total_in: Math.round(totalIn * 100) / 100,
      total_out: Math.round(totalOut * 100) / 100,
      net: Math.round((totalIn - totalOut) * 100) / 100,
      rows,
    });
  } catch (e) {
    res.status(500).json({ error: "فشل جلب كشف حساب الخزينة" });
  }
});

// ─── SAFE TRANSFERS (REMOVED — use /api/safe-transfers instead) ──────────────

// ─── WAREHOUSES ───────────────────────────────────────────────────────────────

router.get("/settings/warehouses", async (req, res) => {
  try {
    const warehouses = await db.select().from(warehousesTable).orderBy(warehousesTable.id);
    res.json(warehouses);
  } catch (e) {
    res.status(500).json({ error: "فشل جلب المخازن" });
  }
});

router.post("/settings/warehouses", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { name, address } = req.body;
    const [warehouse] = await db.insert(warehousesTable).values({ name, address: address || null }).returning();
    res.json(warehouse);
  } catch (e) {
    res.status(500).json({ error: "فشل إضافة المخزن" });
  }
});

router.delete("/settings/warehouses/:id", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(warehousesTable).where(eq(warehousesTable.id, id));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "فشل حذف المخزن" });
  }
});

// ─── PERIOD LOCK (closing_date + metadata) ────────────────────────────────────

/** Helper: upsert a single system_settings key */
async function upsertSetting(key: string, value: string | null) {
  if (value === null) {
    await db.delete(systemSettingsTable).where(eq(systemSettingsTable.key, key));
  } else {
    await db.insert(systemSettingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value, updated_at: new Date() } });
  }
}

/** Helper: read multiple settings keys at once */
async function readSettings(keys: string[]): Promise<Record<string, string | null>> {
  const rows = await db.select().from(systemSettingsTable);
  const map: Record<string, string | null> = {};
  for (const k of keys) map[k] = null;
  for (const r of rows) if (keys.includes(r.key)) map[r.key] = r.value ?? null;
  return map;
}

/**
 * GET /settings/period
 * يُعيد حالة الإغلاق الكاملة مع البيانات الوصفية.
 */
router.get("/settings/period", async (_req, res) => {
  try {
    const s = await readSettings(["closing_date", "lock_locked_by", "lock_locked_at", "lock_mode"]);
    res.json({
      closing_date:   s["closing_date"],
      locked_by:      s["lock_locked_by"],
      locked_at:      s["lock_locked_at"],
      lock_mode:      s["lock_mode"] ?? "manual",
      is_locked:      !!s["closing_date"],
    });
  } catch (e) {
    res.status(500).json({ error: "فشل جلب إعداد الفترة" });
  }
});

/**
 * PUT /settings/period
 * تفعيل الإغلاق أو إلغاؤه (أدمن فقط).
 * Body for lock:   { closing_date: "YYYY-MM-DD", lock_mode?: "manual" }
 * Body for unlock: { closing_date: null, unlock_reason: string }
 */
router.put("/settings/period", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { closing_date, unlock_reason, lock_mode } = req.body;
    const username = (req as any).user?.username ?? "مجهول";
    const userId   = (req as any).user?.id ?? null;

    if (closing_date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(closing_date)) {
        res.status(400).json({ error: "تنسيق التاريخ غير صحيح — استخدم YYYY-MM-DD" });
        return;
      }
      // حفظ التاريخ والبيانات الوصفية
      await upsertSetting("closing_date",   closing_date);
      await upsertSetting("lock_locked_by", username);
      await upsertSetting("lock_locked_at", new Date().toISOString());
      await upsertSetting("lock_mode",      lock_mode ?? "manual");

      // سجل المراجعة
      await writeAuditLog({
        action: "lock_period",
        record_type: "financial_lock",
        record_id: 0,
        new_value: { closing_date, locked_by: username, lock_mode: lock_mode ?? "manual" },
        user: { id: userId, username },
      });
    } else {
      // إلغاء الإغلاق — يتطلب سبباً
      if (!unlock_reason || String(unlock_reason).trim().length < 3) {
        res.status(400).json({ error: "يجب إدخال سبب فتح الفترة (3 أحرف على الأقل)" });
        return;
      }
      const prev = await readSettings(["closing_date", "lock_locked_by"]);
      await upsertSetting("closing_date",   null);
      await upsertSetting("lock_locked_by", null);
      await upsertSetting("lock_locked_at", null);
      await upsertSetting("lock_mode",      null);

      // سجل المراجعة
      await writeAuditLog({
        action: "unlock_period",
        record_type: "financial_lock",
        record_id: 0,
        old_value: { closing_date: prev["closing_date"], locked_by: prev["lock_locked_by"] },
        new_value: { unlock_reason, unlocked_by: username },
        user: { id: userId, username },
      });
    }

    invalidateClosingDateCache();
    const updated = await readSettings(["closing_date", "lock_locked_by", "lock_locked_at", "lock_mode"]);
    res.json({
      closing_date: updated["closing_date"],
      locked_by:    updated["lock_locked_by"],
      locked_at:    updated["lock_locked_at"],
      lock_mode:    updated["lock_mode"] ?? "manual",
      is_locked:    !!updated["closing_date"],
    });
  } catch (e) {
    res.status(500).json({ error: "فشل تحديث إعداد الفترة" });
  }
});

/**
 * GET /settings/audit-logs
 * عرض سجل المراجعة الكامل (أدمن فقط)، مرتب من الأحدث للأقدم.
 * Query params: ?limit=100&record_type=financial_lock
 */
router.get("/settings/audit-logs", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const limit  = Math.min(parseInt(String(req.query.limit  ?? "200")), 500);
    const rows   = await db.select().from(auditLogsTable).orderBy(desc(auditLogsTable.created_at)).limit(limit);
    const record_type = req.query.record_type as string | undefined;
    const filtered = record_type ? rows.filter(r => r.record_type === record_type) : rows;
    res.json(filtered.map(r => ({ ...r, created_at: r.created_at.toISOString() })));
  } catch (e) {
    res.status(500).json({ error: "فشل جلب سجل المراجعة" });
  }
});

// ─── RESET DATABASE ───────────────────────────────────────────────────────────

router.post("/settings/reset", authenticate, requireRole("admin"), async (req, res) => {
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
    const customerId = Number(req.params.id as string);

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

    const salesReturns = await db.select().from(salesReturnsTable)
      .where(eq(salesReturnsTable.customer_id, customerId))
      .orderBy(desc(salesReturnsTable.created_at));

    const receiptVouchers = await db.select().from(receiptVouchersTable)
      .where(eq(receiptVouchersTable.customer_id, customerId))
      .orderBy(desc(receiptVouchersTable.created_at));

    const depositVouchers = await db.select().from(depositVouchersTable)
      .where(eq(depositVouchersTable.customer_id, customerId))
      .orderBy(desc(depositVouchersTable.created_at));

    const paymentVouchers = await db.select().from(paymentVouchersTable)
      .where(eq(paymentVouchersTable.customer_id, customerId))
      .orderBy(desc(paymentVouchersTable.created_at));

    res.json({
      customer,
      sales: salesWithItems,
      linked_purchases: purchasesWithItems,
      sales_returns: salesReturns,
      receipt_vouchers: receiptVouchers,
      deposit_vouchers: depositVouchers,
      payment_vouchers: paymentVouchers,
    });
  } catch (e) {
    res.status(500).json({ error: "فشل جلب كشف الحساب" });
  }
});

export default router;
