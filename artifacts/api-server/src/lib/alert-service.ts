/**
 * Alert Service — generates and upserts alerts for important business events.
 * All checks are fire-and-forget (never block the caller).
 */

import { eq, and, sql } from "drizzle-orm";
import { db, alertsTable, productsTable, safesTable, customersTable, suppliersTable } from "@workspace/db";
import { getCustomerLedgerBalance, getSupplierLedgerBalance } from "./ledger-balance";

const CUSTOMER_DEBT_LIMIT = 10_000;
const SUPPLIER_DEBT_LIMIT = 10_000;
const CASH_LOW_THRESHOLD  = 500;

/* ── Upsert: insert or update existing alert for same type+ref ── */
async function upsertAlert(type: string, referenceId: string | null, severity: string, message: string) {
  const where = referenceId
    ? and(eq(alertsTable.type, type), eq(alertsTable.reference_id, referenceId))
    : eq(alertsTable.type, type);

  const existing = await db.select({ id: alertsTable.id }).from(alertsTable).where(where).limit(1);

  if (existing.length > 0) {
    await db.update(alertsTable)
      .set({ severity, message, is_read: false, created_at: new Date() })
      .where(eq(alertsTable.id, existing[0].id));
  } else {
    await db.insert(alertsTable).values({ type, severity, message, reference_id: referenceId, is_read: false });
  }
}

/* ── Dismiss: remove alert when issue is resolved ──────────── */
async function dismissAlert(type: string, referenceId: string | null) {
  const where = referenceId
    ? and(eq(alertsTable.type, type), eq(alertsTable.reference_id, referenceId))
    : eq(alertsTable.type, type);
  await db.delete(alertsTable).where(where);
}

/* ══════════════════════════════════════════════════════════════ */
export async function checkLowStock(productId?: number) {
  const rows = productId
    ? await db.select().from(productsTable).where(eq(productsTable.id, productId))
    : await db.select().from(productsTable);

  for (const p of rows) {
    if (p.low_stock_threshold == null) continue;
    const qty = parseFloat(p.quantity ?? "0");
    if (qty <= p.low_stock_threshold) {
      await upsertAlert("low_stock", String(p.id), "WARNING",
        `المخزون منخفض للمنتج (${p.name}) — الكمية: ${qty}`);
    } else {
      await dismissAlert("low_stock", String(p.id));
    }
  }
}

export async function checkCustomerDebt(customerId?: number) {
  const rows = customerId
    ? await db.select().from(customersTable).where(eq(customersTable.id, customerId))
    : await db.select().from(customersTable);

  for (const c of rows) {
    const balance = await getCustomerLedgerBalance(c.id);
    if (balance > CUSTOMER_DEBT_LIMIT) {
      await upsertAlert("customer_debt", String(c.id), "WARNING",
        `رصيد العميل ${c.name} تجاوز الحد المسموح (${balance.toLocaleString("ar-EG")} ج.م)`);
    } else {
      await dismissAlert("customer_debt", String(c.id));
    }
  }
}

export async function checkSupplierPayable(supplierId?: number) {
  const rows = supplierId
    ? await db.select().from(suppliersTable).where(eq(suppliersTable.id, supplierId))
    : await db.select().from(suppliersTable);

  for (const s of rows) {
    const balance = await getSupplierLedgerBalance(s.id);
    if (balance > SUPPLIER_DEBT_LIMIT) {
      await upsertAlert("supplier_payable", String(s.id), "WARNING",
        `المستحقات للمورد ${s.name} تجاوزت الحد المسموح (${balance.toLocaleString("ar-EG")} ج.م)`);
    } else {
      await dismissAlert("supplier_payable", String(s.id));
    }
  }
}

export async function checkCashLow() {
  const res = await db.select({ total: sql<string>`coalesce(sum(balance),0)` }).from(safesTable);
  const total = parseFloat(res[0]?.total ?? "0");
  if (total < CASH_LOW_THRESHOLD) {
    await upsertAlert("cash_low", null, "CRITICAL",
      `رصيد الخزنة أقل من الحد الأدنى — الرصيد الحالي: ${total.toLocaleString("ar-EG")} ج.م`);
  } else {
    await dismissAlert("cash_low", null);
  }
}

export async function checkHealthCritical(hasCritical: boolean) {
  if (hasCritical) {
    await upsertAlert("health", null, "CRITICAL", "يوجد مشكلة حرجة في صحة النظام");
  } else {
    await dismissAlert("health", null);
  }
}

/* ── Run all checks (fire-and-forget safe) ─────────────────── */
export async function runAllChecks(opts: { customerId?: number; supplierId?: number; productId?: number } = {}) {
  await Promise.allSettled([
    checkLowStock(opts.productId),
    checkCustomerDebt(opts.customerId),
    checkSupplierPayable(opts.supplierId),
    checkCashLow(),
  ]);
}
