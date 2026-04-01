import { Router, type IRouter } from "express";
import { db,
  productsTable, customersTable, suppliersTable,
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
import { authenticate, requireRole } from "../middleware/auth";
import { wrap } from "../lib/async-handler";

const router: IRouter = Router();

/* ══════════════════════════════════════════════════════════════════════════
   POST /api/system/backup
   Returns a full JSON dump of every table — sent as a downloadable file.
   ══════════════════════════════════════════════════════════════════════════ */
router.post("/system/backup", authenticate, requireRole("admin"), wrap(async (_req, res) => {
  const [
    products, customers, suppliers,
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
    db.select().from(suppliersTable),
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

  const backup = {
    version: "2.0",
    app: "Halal Tech ERP",
    created_at: new Date().toISOString(),
    data: {
      products, customers, suppliers,
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

  const json = JSON.stringify(backup, null, 2);
  const dt   = new Date().toISOString().replace("T", "_").replace(/:/g, "-").slice(0, 19);
  const filename = `halal-tech-backup_${dt}.json`;

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(json);
}));

/* ══════════════════════════════════════════════════════════════════════════
   POST /api/system/restore
   Body: the full backup JSON object.
   Clears all business data then re-inserts everything inside a transaction.
   ══════════════════════════════════════════════════════════════════════════ */
router.post("/system/restore", authenticate, requireRole("admin"), wrap(async (req, res) => {
  const body = req.body as Record<string, unknown>;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    res.status(400).json({ error: "ملف النسخة الاحتياطية غير صالح — يجب أن يكون JSON object" });
    return;
  }

  /*
   * Format resolution (newest → oldest):
   *   v2.0+  : { version, created_at, app, data: { ... } }   ← current format
   *   legacy : { version, created_at, app, tables: { ... } } ← previous key name
   *   raw    : { customers: [...], products: [...], ... }     ← no wrapper at all
   *
   * If the file has a version field but no data/tables → reject clearly.
   * If the file has no version at all → treat as raw legacy and attempt restore.
   */
  const hasVersion = "version" in body;
  const hasData    = body.data    !== undefined;
  const hasTables  = body.tables  !== undefined;

  if (hasVersion && !hasData && !hasTables) {
    res.status(400).json({
      error: `ملف غير مكتمل — الإصدار "${body.version}" موجود لكن مفتاح "data" مفقود`,
    });
    return;
  }

  /* Resolve the data section */
  let tables: Record<string, unknown[]>;
  let isLegacy = false;

  if (hasData && typeof body.data === "object" && body.data !== null) {
    tables = body.data as Record<string, unknown[]>;
  } else if (hasTables && typeof body.tables === "object" && body.tables !== null) {
    tables = body.tables as Record<string, unknown[]>;
    isLegacy = true;
  } else {
    /* Raw legacy — the root object IS the data map */
    tables = body as unknown as Record<string, unknown[]>;
    isLegacy = true;
  }

  const required = ["products", "customers", "suppliers", "sales"];
  const missing  = required.filter(k => !Array.isArray(tables[k]));
  if (missing.length > 0) {
    res.status(400).json({ error: `ملف غير مكتمل — مفاتيح مفقودة: ${missing.join(", ")}` });
    return;
  }

  const fileVersion  = hasVersion ? String(body.version) : "legacy";
  const fileDate     = typeof body.created_at === "string" ? body.created_at : null;

  const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

  const parseDates = (rows: Record<string, unknown>[]): Record<string, unknown>[] =>
    rows.map(row =>
      Object.fromEntries(
        Object.entries(row).map(([k, v]) => [
          k,
          typeof v === "string" && ISO_RE.test(v) ? new Date(v) : v,
        ])
      )
    );

  const get = (key: string): Record<string, unknown>[] => {
    const rows = Array.isArray(tables[key]) ? (tables[key] as Record<string, unknown>[]) : [];
    return parseDates(rows);
  };

  await db.transaction(async (tx) => {
    /* ── 1. Clear in FK-safe order (children first) ── */
    await tx.delete(journalEntryLinesTable);
    await tx.delete(journalEntriesTable);
    await tx.delete(saleReturnItemsTable);
    await tx.delete(salesReturnsTable);
    await tx.delete(purchaseReturnItemsTable);
    await tx.delete(purchaseReturnsTable);
    await tx.delete(saleItemsTable);
    await tx.delete(salesTable);
    await tx.delete(purchaseItemsTable);
    await tx.delete(purchasesTable);
    await tx.delete(expensesTable);
    await tx.delete(incomeTable);
    await tx.delete(receiptVouchersTable);
    await tx.delete(depositVouchersTable);
    await tx.delete(paymentVouchersTable);
    await tx.delete(treasuryVouchersTable);
    await tx.delete(safeTransfersTable);
    await tx.delete(transactionsTable);
    await tx.delete(stockMovementsTable);
    await tx.delete(alertsTable);
    await tx.delete(auditLogsTable);
    await tx.delete(accountsTable);
    await tx.delete(productsTable);
    await tx.delete(customersTable);
    await tx.delete(suppliersTable);
    await tx.delete(safesTable);
    await tx.delete(warehousesTable);

    /* ── 2. Re-insert in FK-safe order (parents first) ── */
    const ins = async <T>(tbl: Parameters<typeof tx.insert>[0], rows: T[]) => {
      if (rows.length > 0) await tx.insert(tbl).values(rows as any);
    };

    await ins(safesTable,                get("safes"));
    await ins(warehousesTable,           get("warehouses"));
    await ins(productsTable,             get("products"));
    await ins(customersTable,            get("customers"));
    await ins(suppliersTable,            get("suppliers"));
    await ins(accountsTable,             get("accounts"));
    await ins(salesTable,                get("sales"));
    await ins(saleItemsTable,            get("sale_items"));
    await ins(purchasesTable,            get("purchases"));
    await ins(purchaseItemsTable,        get("purchase_items"));
    await ins(salesReturnsTable,         get("sales_returns"));
    await ins(saleReturnItemsTable,      get("sale_return_items"));
    await ins(purchaseReturnsTable,      get("purchase_returns"));
    await ins(purchaseReturnItemsTable,  get("purchase_return_items"));
    await ins(expensesTable,             get("expenses"));
    await ins(incomeTable,               get("income"));
    await ins(transactionsTable,         get("transactions"));
    await ins(receiptVouchersTable,      get("receipt_vouchers"));
    await ins(depositVouchersTable,      get("deposit_vouchers"));
    await ins(paymentVouchersTable,      get("payment_vouchers"));
    await ins(treasuryVouchersTable,     get("treasury_vouchers"));
    await ins(safeTransfersTable,        get("safe_transfers"));
    await ins(stockMovementsTable,       get("stock_movements"));
    await ins(journalEntriesTable,       get("journal_entries"));
    await ins(journalEntryLinesTable,    get("journal_entry_lines"));
    await ins(alertsTable,               get("alerts"));
    await ins(auditLogsTable,            get("audit_logs"));
  });

  const counts = Object.fromEntries(
    Object.entries(tables).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])
  );

  res.json({
    success: true,
    message: "تمت الاستعادة بنجاح",
    meta: {
      file_version: fileVersion,
      file_date:    fileDate,
      is_legacy:    isLegacy,
    },
    counts,
  });
}));

export default router;
