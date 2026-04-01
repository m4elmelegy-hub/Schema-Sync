/**
 * auto-account.ts
 *
 * ربط تلقائي: عند إنشاء عميل أو مورد يُنشئ النظام حساباً محاسبياً مرتبطاً
 * تلقائياً في شجرة الحسابات، ويعيد account_id.
 *
 * قواعد الترميز:
 *   عميل  → كود "AR-{customer_code}"   نوع: asset    (ذمم مدينة)
 *   مورد  → كود "AP-{supplier_code}"   نوع: liability (ذمم دائنة)
 *   خزينة → كود "SAFE-{safe_id}"       نوع: asset    (نقدية)
 */

import { eq, count, sql } from "drizzle-orm";
import { db, accountsTable, journalEntriesTable, journalEntryLinesTable } from "@workspace/db";

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

/** حساب ذمم دائنة للمورد (liability — ما ندين به للمورد) */
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

/**
 * Auto-creates a POSTED journal entry with two symmetric lines,
 * and updates current_balance on both accounts.
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
  const amtStr = String(amount);

  const [{ total }] = await db
    .select({ total: count() })
    .from(journalEntriesTable);

  const entryNo = `JE-${String(Number(total) + 1).padStart(5, "0")}`;

  const [entry] = await db
    .insert(journalEntriesTable)
    .values({
      entry_no: entryNo,
      date,
      description,
      status: "posted",
      reference,
      total_debit: amtStr,
      total_credit: amtStr,
    })
    .returning({ id: journalEntriesTable.id });

  await db.insert(journalEntryLinesTable).values([
    {
      entry_id: entry.id,
      account_id: debit.id,
      account_code: debit.code,
      account_name: debit.name,
      debit: amtStr,
      credit: "0",
    },
    {
      entry_id: entry.id,
      account_id: credit.id,
      account_code: credit.code,
      account_name: credit.name,
      debit: "0",
      credit: amtStr,
    },
  ]);

  await db
    .update(accountsTable)
    .set({ current_balance: sql`current_balance + ${amtStr}::numeric` })
    .where(eq(accountsTable.id, debit.id));

  await db
    .update(accountsTable)
    .set({ current_balance: sql`current_balance + ${amtStr}::numeric` })
    .where(eq(accountsTable.id, credit.id));
}
