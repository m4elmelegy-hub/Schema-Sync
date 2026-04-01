/**
 * ledger-balance.ts
 * مصدر الحقيقة للأرصدة: دفتر الأستاذ (journal_entry_lines)
 *
 * AR (ذمم العملاء):  balance = SUM(debit) - SUM(credit)  على الحساب المرتبط
 * AP (ذمم الموردين): balance = SUM(credit) - SUM(debit)  على الحساب المرتبط
 *
 * جميع الدوال تأخذ فقط القيود المرحّلة (status = 'posted').
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

function r2(n: number) { return Math.round(n * 100) / 100; }

/* ── رصيد عميل واحد (AR) ──────────────────────────────────────────────────── */
export async function getCustomerLedgerBalance(accountId: number | null | undefined): Promise<number> {
  if (!accountId) return 0;
  const result = await db.execute(sql`
    SELECT
      COALESCE(SUM(CAST(jel.debit  AS FLOAT8)), 0)
    - COALESCE(SUM(CAST(jel.credit AS FLOAT8)), 0) AS balance
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.entry_id AND je.status = 'posted'
    WHERE jel.account_id = ${accountId}
  `);
  return r2(Number((result.rows[0] as any)?.balance ?? 0));
}

/* ── رصيد مورد واحد (AP) ──────────────────────────────────────────────────── */
export async function getSupplierLedgerBalance(accountId: number | null | undefined): Promise<number> {
  if (!accountId) return 0;
  const result = await db.execute(sql`
    SELECT
      COALESCE(SUM(CAST(jel.credit AS FLOAT8)), 0)
    - COALESCE(SUM(CAST(jel.debit  AS FLOAT8)), 0) AS balance
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.entry_id AND je.status = 'posted'
    WHERE jel.account_id = ${accountId}
  `);
  return r2(Number((result.rows[0] as any)?.balance ?? 0));
}

/* ── إجمالي ذمم جميع العملاء (AR) ───────────────────────────────────────── */
export async function getTotalCustomerLedgerBalance(): Promise<number> {
  const result = await db.execute(sql`
    SELECT
      COALESCE(SUM(CAST(jel.debit  AS FLOAT8)), 0)
    - COALESCE(SUM(CAST(jel.credit AS FLOAT8)), 0) AS total
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.entry_id AND je.status = 'posted'
    JOIN accounts a ON a.id = jel.account_id AND a.code LIKE 'AR-%'
  `);
  return r2(Number((result.rows[0] as any)?.total ?? 0));
}

/* ── إجمالي ذمم جميع الموردين (AP) ──────────────────────────────────────── */
export async function getTotalSupplierLedgerBalance(): Promise<number> {
  const result = await db.execute(sql`
    SELECT
      COALESCE(SUM(CAST(jel.credit AS FLOAT8)), 0)
    - COALESCE(SUM(CAST(jel.debit  AS FLOAT8)), 0) AS total
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.entry_id AND je.status = 'posted'
    JOIN accounts a ON a.id = jel.account_id AND a.code LIKE 'AP-%'
  `);
  return r2(Number((result.rows[0] as any)?.total ?? 0));
}
