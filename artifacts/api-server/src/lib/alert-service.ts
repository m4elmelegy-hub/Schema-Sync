/**
 * Alert Service — smart, event-driven, no spam.
 *
 * trigger_mode:
 *   "event"  → fired immediately after a business action; always upserts
 *   "daily"  → fired once per day via runDailyChecks(); skips if already ran today
 *
 * Deduplication: one row per (type + reference_id). Updates in place, never duplicates.
 */

import { eq, and, sql } from "drizzle-orm";
import {
  db, alertsTable, productsTable, safesTable,
  customersTable, suppliersTable, systemSettingsTable,
} from "@workspace/db";
import { getCustomerLedgerBalance, getSupplierLedgerBalance } from "./ledger-balance";

/* ── Thresholds (could be moved to system settings later) ─── */
const CUSTOMER_DEBT_LIMIT = 10_000;
const SUPPLIER_DEBT_LIMIT = 10_000;
const CASH_LOW_THRESHOLD  = 500;

/* ── Today's date string YYYY-MM-DD ────────────────────────── */
function today(): string {
  return new Date().toISOString().split("T")[0];
}

/* ── Read a system setting, returns null if missing ─────────── */
async function getSetting(key: string): Promise<string | null> {
  const rows = await db
    .select({ value: systemSettingsTable.value })
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, key))
    .limit(1);
  return rows[0]?.value ?? null;
}

/* ── Upsert: insert or update existing alert for same type+ref ─
   For "daily" alerts: skip entirely if last_triggered_date = today ── */
async function upsertAlert(
  type: string,
  referenceId: string | null,
  severity: string,
  message: string,
  triggerMode: "event" | "daily" = "event",
) {
  const where = referenceId
    ? and(eq(alertsTable.type, type), eq(alertsTable.reference_id, referenceId))
    : eq(alertsTable.type, type);

  const existing = await db
    .select({ id: alertsTable.id, last_triggered_date: alertsTable.last_triggered_date })
    .from(alertsTable)
    .where(where)
    .limit(1);

  if (existing.length > 0) {
    const row = existing[0];
    // Daily: skip if already triggered today
    if (triggerMode === "daily" && row.last_triggered_date === today()) return;

    await db.update(alertsTable)
      .set({ severity, message, is_read: false, created_at: new Date(), last_triggered_date: today(), trigger_mode: triggerMode })
      .where(eq(alertsTable.id, row.id));
  } else {
    await db.insert(alertsTable).values({
      type, severity, message,
      reference_id: referenceId,
      trigger_mode: triggerMode,
      last_triggered_date: today(),
      is_read: false,
    });
  }
}

/* ── Dismiss: remove alert when issue is resolved ───────────── */
async function dismissAlert(type: string, referenceId: string | null) {
  const where = referenceId
    ? and(eq(alertsTable.type, type), eq(alertsTable.reference_id, referenceId))
    : eq(alertsTable.type, type);
  await db.delete(alertsTable).where(where);
}

/* ══════════════════════════════════════════════════════════════
   INDIVIDUAL CHECK FUNCTIONS
   ══════════════════════════════════════════════════════════════ */

export async function checkLowStock(productId?: number, mode: "event" | "daily" = "event") {
  const rows = productId
    ? await db.select().from(productsTable).where(eq(productsTable.id, productId))
    : await db.select().from(productsTable);

  for (const p of rows) {
    if (p.low_stock_threshold == null) continue;
    const qty = parseFloat(p.quantity ?? "0");
    if (qty <= p.low_stock_threshold) {
      await upsertAlert("low_stock", String(p.id), "WARNING",
        `المخزون منخفض للمنتج (${p.name}) — الكمية: ${qty}`, mode);
    } else {
      await dismissAlert("low_stock", String(p.id));
    }
  }
}

export async function checkCustomerDebt(customerId?: number, mode: "event" | "daily" = "event") {
  const rows = customerId
    ? await db.select().from(customersTable).where(eq(customersTable.id, customerId))
    : await db.select().from(customersTable);

  for (const c of rows) {
    const balance = await getCustomerLedgerBalance(c.id);
    if (balance > CUSTOMER_DEBT_LIMIT) {
      await upsertAlert("customer_debt", String(c.id), "WARNING",
        `رصيد العميل ${c.name} تجاوز الحد المسموح (${balance.toLocaleString("ar-EG")} ج.م)`, mode);
    } else {
      await dismissAlert("customer_debt", String(c.id));
    }
  }
}

export async function checkSupplierPayable(supplierId?: number, mode: "event" | "daily" = "event") {
  const rows = supplierId
    ? await db.select().from(suppliersTable).where(eq(suppliersTable.id, supplierId))
    : await db.select().from(suppliersTable);

  for (const s of rows) {
    const balance = await getSupplierLedgerBalance(s.id);
    if (balance > SUPPLIER_DEBT_LIMIT) {
      await upsertAlert("supplier_payable", String(s.id), "WARNING",
        `المستحقات للمورد ${s.name} تجاوزت الحد المسموح (${balance.toLocaleString("ar-EG")} ج.م)`, mode);
    } else {
      await dismissAlert("supplier_payable", String(s.id));
    }
  }
}

export async function checkCashLow(mode: "event" | "daily" = "daily") {
  const res = await db.select({ total: sql<string>`coalesce(sum(balance),0)` }).from(safesTable);
  const total = parseFloat(res[0]?.total ?? "0");
  if (total < CASH_LOW_THRESHOLD) {
    await upsertAlert("cash_low", null, "CRITICAL",
      `رصيد الخزنة أقل من الحد الأدنى — الرصيد الحالي: ${total.toLocaleString("ar-EG")} ج.م`, mode);
  } else {
    await dismissAlert("cash_low", null);
  }
}

export async function checkHealthCritical(hasCritical: boolean) {
  if (hasCritical) {
    await upsertAlert("health", null, "CRITICAL", "يوجد مشكلة حرجة في صحة النظام", "daily");
  } else {
    await dismissAlert("health", null);
  }
}

/* ══════════════════════════════════════════════════════════════
   EVENT-BASED: triggered after sales / purchases / stock changes.
   Scoped to the specific entity — fast, no full-table scan.
   ══════════════════════════════════════════════════════════════ */
export async function runEventChecks(opts: {
  customerId?: number;
  supplierId?: number;
  productId?: number;
} = {}) {
  const enabled = await getSetting("enable_event_alerts");
  if (enabled === "false") return;

  await Promise.allSettled([
    opts.customerId  ? checkCustomerDebt(opts.customerId, "event")   : Promise.resolve(),
    opts.supplierId  ? checkSupplierPayable(opts.supplierId, "event") : Promise.resolve(),
    opts.productId   ? checkLowStock(opts.productId, "event")        : Promise.resolve(),
    checkCashLow("event"),
  ]);
}

/* ══════════════════════════════════════════════════════════════
   DAILY CHECK: runs once per day (called from POST /alerts/daily-check).
   Each individual alert has its own last_triggered_date guard — so
   even if the endpoint is called twice, no duplicates are created.
   ══════════════════════════════════════════════════════════════ */
export async function runDailyChecks() {
  const enabled = await getSetting("enable_daily_alerts");
  if (enabled === "false") return;

  await Promise.allSettled([
    checkLowStock(undefined, "daily"),
    checkCustomerDebt(undefined, "daily"),
    checkSupplierPayable(undefined, "daily"),
    checkCashLow("daily"),
  ]);
}

/* ── Legacy alias so existing hooks keep working ─────────────── */
export { runEventChecks as runAllChecks };
