import { Router } from "express";
import { eq, desc, or, count, and, ne, inArray } from "drizzle-orm";
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
  stockMovementsTable,
  stockCountSessionsTable,
  stockTransfersTable,
} from "@workspace/db";
import { invalidateClosingDateCache } from "../lib/period-lock";
import { writeAuditLog } from "../lib/audit-log";
import { auditLogsTable } from "@workspace/db";

const router = Router();

// ─── USERS ────────────────────────────────────────────────────────────────────

router.get("/settings/users", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const companyId = req.user!.company_id;
    const users = await db.select().from(erpUsersTable)
      .where(
        companyId !== null
          ? and(eq(erpUsersTable.company_id, companyId), ne(erpUsersTable.role, "super_admin"))
          : ne(erpUsersTable.role, "super_admin")
      )
      .orderBy(erpUsersTable.id);
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
    const companyId = req.user!.company_id ?? undefined;

    /* Prevent creating super_admin via this route */
    if (role === "super_admin") {
      res.status(403).json({ error: "لا يمكن إنشاء حساب مسؤول عام من هنا" });
      return;
    }

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
      company_id: companyId,
    }).returning();
    /* Audit: record user creation */
    await writeAuditLog({
      action: "create",
      record_type: "user",
      record_id: user.id,
      new_value: { name: user.name, username: user.username, role: user.role },
      user: { id: req.user!.id, username: req.user!.username },
      company_id: companyId ?? 1,
    });
    res.json({ ...user, pin: "****" });
  } catch (e) {
    res.status(500).json({ error: "فشل إضافة المستخدم" });
  }
});

router.put("/settings/users/:id", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const requesterId = req.user!.id;
    const companyId = req.user!.company_id;
    const { name, username, pin, role, permissions, active, warehouse_id, safe_id } = req.body;

    /* Prevent editing super_admin via this route */
    if (role === "super_admin") {
      res.status(403).json({ error: "لا يمكن تعيين دور المسؤول العام من هنا" });
      return;
    }

    /* Verify target belongs to same company */
    const [target] = await db.select().from(erpUsersTable)
      .where(
        companyId !== null
          ? and(eq(erpUsersTable.id, id), eq(erpUsersTable.company_id, companyId))
          : eq(erpUsersTable.id, id)
      );
    if (!target) {
      res.status(404).json({ error: "المستخدم غير موجود" });
      return;
    }
    if (target.role === "super_admin") {
      res.status(403).json({ error: "لا يمكن تعديل حساب المسؤول العام من هنا" });
      return;
    }

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
    const companyId = req.user!.company_id;

    /* Prevent deleting yourself */
    if (req.user!.id === id) {
      res.status(403).json({ error: "لا يمكنك حذف حسابك الخاص" });
      return;
    }

    /* Verify target belongs to same company */
    const [target] = await db.select().from(erpUsersTable)
      .where(
        companyId !== null
          ? and(eq(erpUsersTable.id, id), eq(erpUsersTable.company_id, companyId))
          : eq(erpUsersTable.id, id)
      );
    if (!target) {
      res.status(404).json({ error: "المستخدم غير موجود" });
      return;
    }

    /* Protect super_admin accounts from deletion via this route */
    if (target.role === "super_admin") {
      res.status(403).json({ error: "لا يمكن حذف حساب المسؤول العام من هنا" });
      return;
    }

    await db.delete(erpUsersTable).where(eq(erpUsersTable.id, id));
    /* Audit: record user deletion */
    await writeAuditLog({
      action: "delete",
      record_type: "user",
      record_id: id,
      old_value: { name: target.name, username: target.username, role: target.role },
      user: { id: req.user!.id, username: req.user!.username },
      company_id: companyId ?? 1,
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "فشل حذف المستخدم" });
  }
});

// ─── SAFES ────────────────────────────────────────────────────────────────────

router.get("/settings/safes", async (req, res) => {
  try {
    const companyId = req.user?.company_id ?? null;
    const safes = await db.select().from(safesTable)
      .where(companyId !== null ? eq(safesTable.company_id, companyId) : undefined)
      .orderBy(safesTable.id);
    res.json(safes);
  } catch (e) {
    res.status(500).json({ error: "فشل جلب الخزائن" });
  }
});

router.post("/settings/safes", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { name, balance } = req.body;
    const companyId = req.user?.company_id ?? undefined;
    const [safe] = await db.insert(safesTable).values({ name, balance: String(balance || 0), company_id: companyId }).returning();
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

    const [safe] = await db.select().from(safesTable).where(eq(safesTable.id, id));
    if (!safe) { res.status(404).json({ error: "الخزينة غير موجودة" }); return; }

    if (Number(safe.balance) !== 0) {
      res.status(409).json({ error: "لا يمكن حذف خزينة تحتوي على رصيد — يجب أن يكون الرصيد صفراً أولاً" });
      return;
    }

    const [[expenses], [income], [receipts], [payments], [deposits], [transfers], [sales], [txn]] = await Promise.all([
      db.select({ n: count() }).from(expensesTable).where(eq(expensesTable.safe_id, id)),
      db.select({ n: count() }).from(incomeTable).where(eq(incomeTable.safe_id, id)),
      db.select({ n: count() }).from(receiptVouchersTable).where(eq(receiptVouchersTable.safe_id, id)),
      db.select({ n: count() }).from(paymentVouchersTable).where(eq(paymentVouchersTable.safe_id, id)),
      db.select({ n: count() }).from(depositVouchersTable).where(eq(depositVouchersTable.safe_id, id)),
      db.select({ n: count() }).from(safeTransfersTable).where(or(eq(safeTransfersTable.from_safe_id, id), eq(safeTransfersTable.to_safe_id, id))),
      db.select({ n: count() }).from(salesTable).where(eq(salesTable.safe_id, id)),
      db.select({ n: count() }).from(transactionsTable).where(eq(transactionsTable.safe_id, id)),
    ]);

    const hasMovements =
      Number(expenses.n) > 0 || Number(income.n) > 0 ||
      Number(receipts.n) > 0 || Number(payments.n) > 0 || Number(deposits.n) > 0 ||
      Number(transfers.n) > 0 || Number(sales.n) > 0 || Number(txn.n) > 0;

    if (hasMovements) {
      res.status(409).json({ error: "لا يمكن حذف خزينة لها حركات مالية مسجّلة" });
      return;
    }

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
    const companyId = req.user?.company_id ?? null;
    const warehouses = await db.select().from(warehousesTable)
      .where(companyId !== null ? eq(warehousesTable.company_id, companyId) : undefined)
      .orderBy(warehousesTable.id);
    res.json(warehouses);
  } catch (e) {
    res.status(500).json({ error: "فشل جلب المخازن" });
  }
});

router.post("/settings/warehouses", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { name, address } = req.body;
    const companyId = req.user?.company_id ?? undefined;
    const [warehouse] = await db.insert(warehousesTable).values({ name, address: address || null, company_id: companyId }).returning();
    res.json(warehouse);
  } catch (e) {
    res.status(500).json({ error: "فشل إضافة المخزن" });
  }
});

router.delete("/settings/warehouses/:id", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [wh] = await db.select().from(warehousesTable).where(eq(warehousesTable.id, id));
    if (!wh) { res.status(404).json({ error: "المخزن غير موجود" }); return; }

    const [[movements], [sessions], [transfers]] = await Promise.all([
      db.select({ n: count() }).from(stockMovementsTable).where(eq(stockMovementsTable.warehouse_id, id)),
      db.select({ n: count() }).from(stockCountSessionsTable).where(eq(stockCountSessionsTable.warehouse_id, id)),
      db.select({ n: count() }).from(stockTransfersTable).where(
        or(eq(stockTransfersTable.from_warehouse_id, id), eq(stockTransfersTable.to_warehouse_id, id))
      ),
    ]);

    if (Number(movements.n) > 0) {
      res.status(409).json({ error: "لا يمكن حذف مخزن له حركات مخزونية مسجّلة" }); return;
    }
    if (Number(sessions.n) > 0) {
      res.status(409).json({ error: "لا يمكن حذف مخزن له جلسات جرد مسجّلة" }); return;
    }
    if (Number(transfers.n) > 0) {
      res.status(409).json({ error: "لا يمكن حذف مخزن له عمليات تحويل مسجّلة" }); return;
    }

    await db.delete(warehousesTable).where(eq(warehousesTable.id, id));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "فشل حذف المخزن" });
  }
});

// ─── PERIOD LOCK (closing_date + metadata) ────────────────────────────────────

/** Helper: upsert a single system_settings key for a given company */
async function upsertSetting(key: string, value: string | null, companyId: number = 1) {
  if (value === null) {
    await db.delete(systemSettingsTable)
      .where(and(eq(systemSettingsTable.key, key), eq(systemSettingsTable.company_id, companyId)));
  } else {
    await db.insert(systemSettingsTable)
      .values({ key, company_id: companyId, value })
      .onConflictDoUpdate({
        target: [systemSettingsTable.key, systemSettingsTable.company_id],
        set:    { value, updated_at: new Date() },
      });
  }
}

/** Helper: read multiple settings keys at once for a given company */
async function readSettings(keys: string[], companyId: number = 1): Promise<Record<string, string | null>> {
  const rows = await db.select().from(systemSettingsTable)
    .where(eq(systemSettingsTable.company_id, companyId));
  const map: Record<string, string | null> = {};
  for (const k of keys) map[k] = null;
  for (const r of rows) if (keys.includes(r.key)) map[r.key] = r.value ?? null;
  return map;
}

/**
 * GET /settings/period
 * يُعيد حالة الإغلاق الكاملة مع البيانات الوصفية.
 */
router.get("/settings/period", async (req, res) => {
  try {
    const companyId = req.user?.company_id ?? 1;
    const s = await readSettings(["closing_date", "lock_locked_by", "lock_locked_at", "lock_mode"], companyId);
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
    const username  = (req as any).user?.username  ?? "مجهول";
    const userId    = (req as any).user?.id        ?? null;
    const companyId = (req as any).user?.company_id ?? 1;

    if (closing_date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(closing_date)) {
        res.status(400).json({ error: "تنسيق التاريخ غير صحيح — استخدم YYYY-MM-DD" });
        return;
      }
      // حفظ التاريخ والبيانات الوصفية
      await upsertSetting("closing_date",   closing_date,                companyId);
      await upsertSetting("lock_locked_by", username,                    companyId);
      await upsertSetting("lock_locked_at", new Date().toISOString(),    companyId);
      await upsertSetting("lock_mode",      lock_mode ?? "manual",       companyId);

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
      const prev = await readSettings(["closing_date", "lock_locked_by"], companyId);
      await upsertSetting("closing_date",   null, companyId);
      await upsertSetting("lock_locked_by", null, companyId);
      await upsertSetting("lock_locked_at", null, companyId);
      await upsertSetting("lock_mode",      null, companyId);

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

    invalidateClosingDateCache(companyId);
    const updated = await readSettings(["closing_date", "lock_locked_by", "lock_locked_at", "lock_mode"], companyId);
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
    const companyId = req.user!.company_id;
    const limit  = Math.min(parseInt(String(req.query.limit  ?? "200")), 500);
    const rows   = await db.select().from(auditLogsTable)
      .where(companyId !== null ? eq(auditLogsTable.company_id, companyId) : undefined)
      .orderBy(desc(auditLogsTable.created_at))
      .limit(limit);
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

    const companyId = req.user!.company_id ?? 1;

    /* Helper: fetch IDs of parent rows for this company */
    const saleIds    = (await db.select({ id: salesTable.id }).from(salesTable).where(eq(salesTable.company_id, companyId))).map(r => r.id);
    const purIds     = (await db.select({ id: purchasesTable.id }).from(purchasesTable).where(eq(purchasesTable.company_id, companyId))).map(r => r.id);
    const sRetIds    = (await db.select({ id: salesReturnsTable.id }).from(salesReturnsTable).where(eq(salesReturnsTable.company_id, companyId))).map(r => r.id);
    const pRetIds    = (await db.select({ id: purchaseReturnsTable.id }).from(purchaseReturnsTable).where(eq(purchaseReturnsTable.company_id, companyId))).map(r => r.id);
    const jrnIds     = (await db.select({ id: journalEntriesTable.id }).from(journalEntriesTable).where(eq(journalEntriesTable.company_id, companyId))).map(r => r.id);

    // حذف البنود أولاً (foreign keys)
    if (jrnIds.length > 0)  await db.delete(journalEntryLinesTable).where(inArray(journalEntryLinesTable.entry_id, jrnIds));
    await db.delete(journalEntriesTable).where(eq(journalEntriesTable.company_id, companyId));
    if (sRetIds.length > 0) await db.delete(saleReturnItemsTable).where(inArray(saleReturnItemsTable.return_id, sRetIds));
    await db.delete(salesReturnsTable).where(eq(salesReturnsTable.company_id, companyId));
    if (pRetIds.length > 0) await db.delete(purchaseReturnItemsTable).where(inArray(purchaseReturnItemsTable.return_id, pRetIds));
    await db.delete(purchaseReturnsTable).where(eq(purchaseReturnsTable.company_id, companyId));
    if (saleIds.length > 0) await db.delete(saleItemsTable).where(inArray(saleItemsTable.sale_id, saleIds));
    await db.delete(salesTable).where(eq(salesTable.company_id, companyId));
    if (purIds.length > 0)  await db.delete(purchaseItemsTable).where(inArray(purchaseItemsTable.purchase_id, purIds));
    await db.delete(purchasesTable).where(eq(purchasesTable.company_id, companyId));
    await db.delete(expensesTable).where(eq(expensesTable.company_id, companyId));
    await db.delete(incomeTable).where(eq(incomeTable.company_id, companyId));
    await db.delete(receiptVouchersTable).where(eq(receiptVouchersTable.company_id, companyId));
    await db.delete(depositVouchersTable).where(eq(depositVouchersTable.company_id, companyId));
    await db.delete(paymentVouchersTable).where(eq(paymentVouchersTable.company_id, companyId));
    await db.delete(treasuryVouchersTable).where(eq(treasuryVouchersTable.company_id, companyId));
    await db.delete(safeTransfersTable).where(eq(safeTransfersTable.company_id, companyId));
    await db.delete(transactionsTable).where(eq(transactionsTable.company_id, companyId));
    await db.delete(accountsTable).where(eq(accountsTable.company_id, companyId));
    await db.delete(stockMovementsTable).where(eq(stockMovementsTable.company_id, companyId));

    // تصفير الأرصدة للشركة فقط
    await db.update(customersTable).set({ balance: "0" }).where(eq(customersTable.company_id, companyId));
    await db.update(productsTable).set({ quantity: "0" }).where(eq(productsTable.company_id, companyId));
    await db.update(safesTable).set({ balance: "0" }).where(eq(safesTable.company_id, companyId));

    res.json({ success: true, message: "تم تصفير قاعدة البيانات بنجاح" });
  } catch (e: unknown) {
    res.status(500).json({ error: "فشل التصفير: " + (e instanceof Error ? e.message : String(e)) });
  }
});

// ─── CUSTOMER STATEMENT ───────────────────────────────────────────────────────

router.get("/customers/:id/statement", authenticate, async (req, res) => {
  try {
    const customerId = Number(req.params.id as string);
    const companyId = req.user?.company_id ?? null;

    const [customer] = await db.select().from(customersTable).where(
      companyId !== null
        ? and(eq(customersTable.id, customerId), eq(customersTable.company_id, companyId))
        : eq(customersTable.id, customerId)
    );
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
