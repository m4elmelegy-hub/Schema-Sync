/**
 * auto-account.ts
 *
 * ربط تلقائي: عند إنشاء عميل أو مورد يُنشئ النظام حساباً محاسبياً مرتبطاً
 * تلقائياً في شجرة الحسابات، ويعيد account_id.
 *
 * قواعد الترميز:
 *   عميل          → كود "AR-{customer_code}"   نوع: asset     (ذمم مدينة)
 *   مورد          → كود "AP-{supplier_code}"   نوع: liability  (ذمم دائنة)
 *   خزينة         → كود "SAFE-{safe_id}"       نوع: asset     (نقدية)
 *   مخزون بضاعة  → كود "ASSET-INVENTORY"      نوع: asset     (بضاعة — يُدان عند الشراء، يُقيَّد دائناً عند البيع)
 *   إيرادات       → كود "REV-SALES"            نوع: revenue   (مبيعات)
 *   تكلفة البضاعة → كود "EXP-COGS"            نوع: expense   (تكلفة البضاعة المباعة — يُدان عند البيع)
 *
 * ملاحظة: حساب "EXP-PURCHASES" (القديم) أُبقي للتوافق العكسي مع القيود القديمة
 * لكن لا يُستخدم في القيود الجديدة.
 */

import { eq, count, sql } from "drizzle-orm";
import { db, accountsTable, journalEntriesTable, journalEntryLinesTable } from "@workspace/db";

/** نوع مشترك يقبل `db` أو `tx` داخل transaction */
type DbOrTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

interface AccountSpec {
  code: string;
  name: string;
  type: AccountType;
}

export interface AccountRef {
  id: number;
  code: string;
  name: string;
}

export interface JournalLine {
  account: AccountRef;
  debit: number;
  credit: number;
}

/**
 * Returns existing account by code, or creates it if not found.
 * Never creates a duplicate.
 */
export async function getOrCreateAccount(spec: AccountSpec): Promise<AccountRef> {
  const [existing] = await db
    .select({ id: accountsTable.id, code: accountsTable.code, name: accountsTable.name })
    .from(accountsTable)
    .where(eq(accountsTable.code, spec.code));

  if (existing) return existing;

  const [created] = await db
    .insert(accountsTable)
    .values({
      code: spec.code,
      name: spec.name,
      type: spec.type,
      is_posting: true,
      is_active: true,
      opening_balance: "0",
      current_balance: "0",
      level: 2,
    })
    .returning({ id: accountsTable.id, code: accountsTable.code, name: accountsTable.name });

  return created;
}

/** حساب ذمم مدينة للعميل (asset — ما يدين به العميل لنا) */
export async function getOrCreateCustomerAccount(
  customerCode: number,
  customerName: string,
): Promise<AccountRef> {
  return getOrCreateAccount({
    code: `AR-${customerCode}`,
    name: `عميل - ${customerName}`,
    type: "asset",
  });
}

/** حساب ذمم دائنة للعميل-المورد (liability — ما ندين به للعميل كمورد) */
export async function getOrCreateCustomerPayableAccount(
  customerCode: number,
  customerName: string,
): Promise<AccountRef> {
  return getOrCreateAccount({
    code: `AP-C-${customerCode}`,
    name: `مورد - ${customerName}`,
    type: "liability",
  });
}

/** @deprecated Use getOrCreateCustomerPayableAccount. Kept for backward-compat with old journal entries. */
export async function getOrCreateSupplierAccount(
  supplierCode: number,
  supplierName: string,
): Promise<AccountRef> {
  return getOrCreateAccount({
    code: `AP-${supplierCode}`,
    name: `مورد - ${supplierName}`,
    type: "liability",
  });
}

/** حساب نقدية للخزينة */
export async function getOrCreateSafeAccount(
  safeId: number,
  safeName: string,
): Promise<AccountRef> {
  return getOrCreateAccount({
    code: `SAFE-${safeId}`,
    name: `خزينة - ${safeName}`,
    type: "asset",
  });
}

/** حساب إيرادات المبيعات (مشترك لجميع الفواتير) */
export async function getOrCreateSalesRevenueAccount(): Promise<AccountRef> {
  return getOrCreateAccount({
    code: "REV-SALES",
    name: "إيرادات المبيعات",
    type: "revenue",
  });
}

/**
 * حساب مخزون البضاعة (أصل — يُدان عند الشراء، يُقيَّد دائناً عند بيع البضاعة)
 * يستخدم كحساب مقابل لـ EXP-COGS
 */
export async function getOrCreateInventoryAccount(): Promise<AccountRef> {
  return getOrCreateAccount({
    code: "ASSET-INVENTORY",
    name: "بضاعة المخزون",
    type: "asset",
  });
}

/**
 * حساب تكلفة البضاعة المباعة — COGS
 * يُدان عند ترحيل فاتورة البيع (DR COGS / CR Inventory)
 * يُعكس عند الإلغاء أو مرتجع المبيعات
 */
export async function getOrCreateCOGSAccount(): Promise<AccountRef> {
  return getOrCreateAccount({
    code: "EXP-COGS",
    name: "تكلفة البضاعة المباعة",
    type: "expense",
  });
}

/**
 * @deprecated استخدم getOrCreateInventoryAccount بدلاً منه للمشتريات الجديدة.
 * أُبقي للتوافق العكسي مع القيود المحاسبية القديمة فقط.
 */
export async function getOrCreatePurchasesCostAccount(): Promise<AccountRef> {
  return getOrCreateAccount({
    code: "EXP-PURCHASES",
    name: "تكلفة المشتريات (قديم)",
    type: "expense",
  });
}

/**
 * Creates a POSTED multi-line journal entry and updates current_balance
 * for every account referenced in the lines.
 *
 * All lines must balance (total debits === total credits) — caller is responsible.
 */
export async function createJournalEntry(
  opts: {
    date: string;
    description: string;
    reference: string;
    lines: JournalLine[];
  },
  tx?: DbOrTx,
): Promise<void> {
  const runner: DbOrTx = tx ?? (db as unknown as DbOrTx);
  const { date, description, reference, lines } = opts;

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new Error(`Journal entry imbalance: debit ${totalDebit} ≠ credit ${totalCredit}`);
  }
  if (totalDebit === 0) return;

  const [{ total }] = await runner
    .select({ total: count() })
    .from(journalEntriesTable);

  const entryNo = `JE-${String(Number(total) + 1).padStart(5, "0")}`;

  const [entry] = await runner
    .insert(journalEntriesTable)
    .values({
      entry_no: entryNo,
      date,
      description,
      status: "posted",
      reference,
      total_debit: String(totalDebit),
      total_credit: String(totalCredit),
    })
    .returning({ id: journalEntriesTable.id });

  await runner.insert(journalEntryLinesTable).values(
    lines.map((l) => ({
      entry_id: entry.id,
      account_id: l.account.id,
      account_code: l.account.code,
      account_name: l.account.name,
      debit: String(l.debit),
      credit: String(l.credit),
    })),
  );

  for (const l of lines) {
    const delta = l.debit - l.credit;
    if (delta === 0) continue;
    await runner
      .update(accountsTable)
      .set({ current_balance: sql`current_balance + ${String(delta)}::numeric` })
      .where(eq(accountsTable.id, l.account.id));
  }
}

/**
 * Convenience wrapper: two-line symmetric entry (one debit, one credit).
 * Kept for backward-compatibility with receipt/payment voucher code.
 */
export async function createAutoJournalEntry(opts: {
  date: string;
  description: string;
  reference: string;
  debit: AccountRef;
  credit: AccountRef;
  amount: number;
}): Promise<void> {
  const { date, description, reference, debit, credit, amount } = opts;
  await createJournalEntry({
    date,
    description,
    reference,
    lines: [
      { account: debit, debit: amount, credit: 0 },
      { account: credit, debit: 0, credit: amount },
    ],
  });
}
