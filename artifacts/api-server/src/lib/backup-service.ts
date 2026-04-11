/**
 * backup-service.ts
 * Shared backup logic: build snapshot, save to disk, record in DB.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  db,
  backupsTable,
  productsTable, customersTable,
  salesTable, saleItemsTable,
  purchasesTable, purchaseItemsTable,
  salesReturnsTable, saleReturnItemsTable,
  purchaseReturnsTable, purchaseReturnItemsTable,
  expensesTable, incomeTable, transactionsTable,
  accountsTable, journalEntriesTable, journalEntryLinesTable,
  receiptVouchersTable, depositVouchersTable,
  paymentVouchersTable, treasuryVouchersTable,
  safeTransfersTable, stockMovementsTable,
  safesTable, warehousesTable,
  erpUsersTable, systemSettingsTable,
  alertsTable, auditLogsTable,
} from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import { logger } from "./logger";

/* ── Backup folder ─────────────────────────────────────────────── */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BACKUP_DIR = path.resolve(__dirname, "../backups");

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

/* ── Concurrency guard ─────────────────────────────────────────── */
let isBackingUp = false;

/* ── Max backups to keep ───────────────────────────────────────── */
const MAX_BACKUPS = 20;

/* ── Build the backup JSON object (same structure as system.ts) ── */
export async function buildBackupPayload() {
  const [
    products, customers,
    sales, saleItems,
    purchases, purchaseItems,
    salesReturns, saleReturnItems,
    purchaseReturns, purchaseReturnItems,
    expenses, income, transactions,
    accounts, journalEntries, journalEntryLines,
    receiptVouchers, depositVouchers,
    paymentVouchers, treasuryVouchers,
    safeTransfers, stockMovements,
    safes, warehouses,
    users, settings,
    alerts, auditLogs,
  ] = await Promise.all([
    db.select().from(productsTable),
    db.select().from(customersTable),
    db.select().from(salesTable),
    db.select().from(saleItemsTable),
    db.select().from(purchasesTable),
    db.select().from(purchaseItemsTable),
    db.select().from(salesReturnsTable),
    db.select().from(saleReturnItemsTable),
    db.select().from(purchaseReturnsTable),
    db.select().from(purchaseReturnItemsTable),
    db.select().from(expensesTable),
    db.select().from(incomeTable),
    db.select().from(transactionsTable),
    db.select().from(accountsTable),
    db.select().from(journalEntriesTable),
    db.select().from(journalEntryLinesTable),
    db.select().from(receiptVouchersTable),
    db.select().from(depositVouchersTable),
    db.select().from(paymentVouchersTable),
    db.select().from(treasuryVouchersTable),
    db.select().from(safeTransfersTable),
    db.select().from(stockMovementsTable),
    db.select().from(safesTable),
    db.select().from(warehousesTable),
    db.select().from(erpUsersTable),
    db.select().from(systemSettingsTable),
    db.select().from(alertsTable),
    db.select().from(auditLogsTable),
  ]);

  return {
    version: "2.0",
    app: "Halal Tech ERP",
    created_at: new Date().toISOString(),
    data: {
      products, customers,
      sales, sale_items: saleItems,
      purchases, purchase_items: purchaseItems,
      sales_returns: salesReturns, sale_return_items: saleReturnItems,
      purchase_returns: purchaseReturns, purchase_return_items: purchaseReturnItems,
      expenses, income, transactions,
      accounts, journal_entries: journalEntries, journal_entry_lines: journalEntryLines,
      receipt_vouchers: receiptVouchers, deposit_vouchers: depositVouchers,
      payment_vouchers: paymentVouchers, treasury_vouchers: treasuryVouchers,
      safe_transfers: safeTransfers, stock_movements: stockMovements,
      safes, warehouses, users, settings, alerts, audit_logs: auditLogs,
    },
  };
}

/**
 * Trigger a backup.
 * - trigger: "login" | "logout" | "sale_post" | "purchase_post" | "scheduled" | "manual"
 * - Returns the DB record, or null if a backup is already in progress.
 */
export async function triggerBackup(trigger: string): Promise<typeof backupsTable.$inferSelect | null> {
  if (isBackingUp) {
    logger.warn({ trigger }, "Backup already in progress — skipping");
    return null;
  }

  isBackingUp = true;
  try {
    ensureBackupDir();

    const payload = await buildBackupPayload();
    const json = JSON.stringify(payload, null, 2);
    const dt = new Date().toISOString().replace("T", "_").replace(/:/g, "-").slice(0, 19);
    const filename = `halal-tech-${trigger}_${dt}.json`;
    const filepath = path.join(BACKUP_DIR, filename);

    fs.writeFileSync(filepath, json, "utf8");
    const size = Buffer.byteLength(json, "utf8");

    /* Insert into DB */
    const [record] = await db.insert(backupsTable).values({
      filename,
      size,
      trigger,
    }).returning();

    /* Enforce MAX_BACKUPS — delete oldest beyond limit */
    const all = await db.select().from(backupsTable).orderBy(asc(backupsTable.created_at));
    if (all.length > MAX_BACKUPS) {
      const toDelete = all.slice(0, all.length - MAX_BACKUPS);
      for (const old of toDelete) {
        try {
          const oldPath = path.join(BACKUP_DIR, old.filename);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          await db.delete(backupsTable).where(eq(backupsTable.id, old.id));
        } catch (e) {
          logger.warn({ id: old.id, err: e }, "Failed to delete old backup");
        }
      }
    }

    logger.info({ trigger, filename, size }, "Backup completed");
    return record!;
  } catch (err) {
    logger.error({ trigger, err }, "Backup failed");
    return null;
  } finally {
    isBackingUp = false;
  }
}

/** Returns true if a backup is currently running */
export function isBackupInProgress() {
  return isBackingUp;
}

/** Check a boolean backup trigger setting */
export async function isBackupTriggerEnabled(key: "backup_on_login" | "backup_on_logout"): Promise<boolean> {
  const [row] = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, key));
  return row?.value === "true";
}

/** Fire-and-forget backup triggered on login or logout (reads setting first) */
export function maybeBackupAsync(trigger: "login" | "logout") {
  const settingKey = trigger === "login" ? "backup_on_login" : "backup_on_logout";
  void isBackupTriggerEnabled(settingKey).then((enabled) => {
    if (enabled) void triggerBackup(trigger);
  });
}
