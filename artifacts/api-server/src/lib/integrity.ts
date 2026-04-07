/**
 * integrity.ts
 *
 * مكتبة مركزية للتحقق من سلامة البيانات المحاسبية وإصلاح الانحرافات.
 * جميع دوال الفحص READ-ONLY؛ دوال الإصلاح تُعدِّل البيانات وتستلزم صلاحية admin.
 *
 * المبادئ:
 *   - السجل المرجعي (Source of Truth) لكل حقل موثق في التعليقات
 *   - الانحراف المقبول: 0.005 وحدة (< نصف هللة)
 *   - لا تُنشئ أو تحذف سجلات — تُصلح الأرصدة فقط
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const TOLERANCE = 0.005;
function r2(n: number) { return Math.round(n * 100) / 100; }

/* ───────────────────────────── Types ────────────────────────────────────── */

export interface DriftItem {
  id: number;
  name: string;
  code?: string;
  stored: number;
  computed: number;
  drift: number;
}

export interface IntegrityCheck {
  check: string;
  status: "OK" | "DRIFT";
  drift_count: number;
  items: DriftItem[];
  checked_at: string;
}

/* ── 1. توازن قيود اليومية ───────────────────────────────────────────────────
 * المصدر الأصيل: journal_entry_lines
 * يتحقق: هل كل قيد مرحَّل يحقق مجموع_مدين = مجموع_دائن ؟
 * يكشف أي قيد مُدخَل يدوياً أو من جيل سابق قبل تطبيق التحقق المركزي.
 * ─────────────────────────────────────────────────────────────────────────── */
export async function checkJournalEntryBalance(): Promise<IntegrityCheck> {
  const rows = await db.execute(sql.raw(`
    SELECT
      je.id,
      je.entry_no                            AS name,
      CAST(je.total_debit  AS FLOAT8)        AS hdr_debit,
      CAST(je.total_credit AS FLOAT8)        AS hdr_credit,
      COALESCE(SUM(CAST(jel.debit  AS FLOAT8)), 0) AS line_debit,
      COALESCE(SUM(CAST(jel.credit AS FLOAT8)), 0) AS line_credit
    FROM journal_entries je
    LEFT JOIN journal_entry_lines jel ON jel.entry_id = je.id
    WHERE je.status = 'posted'
    GROUP BY je.id, je.entry_no, je.total_debit, je.total_credit
    HAVING
      ABS(CAST(je.total_debit AS FLOAT8) - CAST(je.total_credit AS FLOAT8)) > ${TOLERANCE}
      OR ABS(
        CAST(je.total_debit AS FLOAT8) -
        COALESCE(SUM(CAST(jel.debit AS FLOAT8)), 0)
      ) > ${TOLERANCE}
  `));

  const items: DriftItem[] = (rows.rows as any[]).map(r => ({
    id:       r.id,
    name:     String(r.name),
    stored:   r2(Number(r.hdr_debit)),
    computed: r2(Number(r.line_debit)),
    drift:    r2(Number(r.hdr_debit) - Number(r.hdr_credit)),
  }));

  return {
    check:       "journal_entry_balance",
    status:      items.length === 0 ? "OK" : "DRIFT",
    drift_count: items.length,
    items,
    checked_at:  new Date().toISOString(),
  };
}

/* ── 2. انحراف أرصدة الحسابات ───────────────────────────────────────────────
 * المصدر الأصيل: journal_entry_lines (بعد ترحيل كل قيد)
 * الحقل المخزَّن: accounts.current_balance
 * الصيغة: current_balance = SUM(debit) - SUM(credit) على كل سطر لهذا الحساب
 *
 * الانحراف = current_balance - SUM(jel.debit - jel.credit)
 * إذا كان |انحراف| > TOLERANCE فالحساب مُنحرف.
 * ─────────────────────────────────────────────────────────────────────────── */
export async function checkAccountBalanceDrift(): Promise<IntegrityCheck> {
  const rows = await db.execute(sql.raw(`
    SELECT
      a.id,
      a.name,
      a.code,
      CAST(a.current_balance AS FLOAT8) AS stored,
      COALESCE(
        SUM(CAST(jel.debit AS FLOAT8) - CAST(jel.credit AS FLOAT8)),
        0
      ) AS computed
    FROM accounts a
    LEFT JOIN journal_entry_lines jel ON jel.account_id = a.id
    LEFT JOIN journal_entries je
      ON je.id = jel.entry_id AND je.status = 'posted'
    WHERE a.is_posting = true AND a.is_active = true
    GROUP BY a.id, a.name, a.code, a.current_balance
    HAVING ABS(
      CAST(a.current_balance AS FLOAT8) -
      COALESCE(SUM(CAST(jel.debit AS FLOAT8) - CAST(jel.credit AS FLOAT8)), 0)
    ) > ${TOLERANCE}
  `));

  const items: DriftItem[] = (rows.rows as any[]).map(r => ({
    id:       r.id,
    name:     String(r.name),
    code:     String(r.code),
    stored:   r2(Number(r.stored)),
    computed: r2(Number(r.computed)),
    drift:    r2(Number(r.stored) - Number(r.computed)),
  }));

  return {
    check:       "account_balance_drift",
    status:      items.length === 0 ? "OK" : "DRIFT",
    drift_count: items.length,
    items,
    checked_at:  new Date().toISOString(),
  };
}

/* ── 3. انحراف أرصدة العملاء ────────────────────────────────────────────────
 * المصدر الأصيل: customer_ledger
 * الحقل المخزَّن: customers.balance  (قيمة مُخزَّنة — legacy cache)
 *
 * customers.balance = SUM(customer_ledger.amount) لكل عميل
 * موجب = العميل مدين لنا | سالب = نحن مدينون له
 *
 * ملاحظة: GET /customers يستخدم customer_ledger مباشرةً (مصدر الحقيقة)،
 * لذا الانحراف في customers.balance لا يؤثر على عرض الرصيد.
 * لكن بعض المسارات القديمة قد تقرأ customers.balance مباشرةً.
 * ─────────────────────────────────────────────────────────────────────────── */
export async function checkCustomerBalanceDrift(): Promise<IntegrityCheck> {
  const rows = await db.execute(sql.raw(`
    SELECT
      c.id,
      c.name,
      CAST(c.balance AS FLOAT8)              AS stored,
      COALESCE(SUM(CAST(cl.amount AS FLOAT8)), 0) AS computed
    FROM customers c
    LEFT JOIN customer_ledger cl ON cl.customer_id = c.id
    GROUP BY c.id, c.name, c.balance
    HAVING ABS(
      CAST(c.balance AS FLOAT8) -
      COALESCE(SUM(CAST(cl.amount AS FLOAT8)), 0)
    ) > ${TOLERANCE}
  `));

  const items: DriftItem[] = (rows.rows as any[]).map(r => ({
    id:       r.id,
    name:     String(r.name),
    stored:   r2(Number(r.stored)),
    computed: r2(Number(r.computed)),
    drift:    r2(Number(r.stored) - Number(r.computed)),
  }));

  return {
    check:       "customer_balance_drift",
    status:      items.length === 0 ? "OK" : "DRIFT",
    drift_count: items.length,
    items,
    checked_at:  new Date().toISOString(),
  };
}

/* ── 4. انحراف كميات المخزون ─────────────────────────────────────────────────
 * المصدر الأصيل: stock_movements (كل حركة موجبة أو سالبة)
 * الحقل المخزَّن: products.quantity
 *
 * products.quantity = SUM(stock_movements.quantity) لكل منتج
 * الكميات الموجبة: مشتريات، أرصدة افتتاحية، مرتجعات مبيعات
 * الكميات السالبة: مبيعات، مرتجعات مشتريات، تسويات سالبة
 * ─────────────────────────────────────────────────────────────────────────── */
export async function checkInventoryDrift(): Promise<IntegrityCheck> {
  const rows = await db.execute(sql.raw(`
    SELECT
      p.id,
      p.name,
      CAST(p.quantity AS FLOAT8)                  AS stored,
      COALESCE(SUM(CAST(sm.quantity AS FLOAT8)), 0) AS computed
    FROM products p
    LEFT JOIN stock_movements sm ON sm.product_id = p.id
    GROUP BY p.id, p.name, p.quantity
    HAVING ABS(
      CAST(p.quantity AS FLOAT8) -
      COALESCE(SUM(CAST(sm.quantity AS FLOAT8)), 0)
    ) > ${TOLERANCE}
  `));

  const items: DriftItem[] = (rows.rows as any[]).map(r => ({
    id:       r.id,
    name:     String(r.name),
    stored:   r2(Number(r.stored)),
    computed: r2(Number(r.computed)),
    drift:    r2(Number(r.stored) - Number(r.computed)),
  }));

  return {
    check:       "inventory_drift",
    status:      items.length === 0 ? "OK" : "DRIFT",
    drift_count: items.length,
    items,
    checked_at:  new Date().toISOString(),
  };
}

/* ── 5. إصلاح: إعادة حساب current_balance من journal_entry_lines ─────────────
 * WRITE OPERATION — admin only
 * يُعدِّل accounts.current_balance للحسابات ذات الانحراف فقط.
 * لا يمس الحسابات التي رصيدها صحيح.
 * ─────────────────────────────────────────────────────────────────────────── */
export async function repairAccountBalances(): Promise<{ repaired: number }> {
  const result = await db.execute(sql.raw(`
    UPDATE accounts a
    SET current_balance = subq.correct_balance
    FROM (
      SELECT
        a2.id,
        COALESCE(
          SUM(CAST(jel.debit AS FLOAT8) - CAST(jel.credit AS FLOAT8)),
          0
        )::numeric AS correct_balance
      FROM accounts a2
      LEFT JOIN journal_entry_lines jel ON jel.account_id = a2.id
      LEFT JOIN journal_entries je
        ON je.id = jel.entry_id AND je.status = 'posted'
      WHERE a2.is_posting = true AND a2.is_active = true
      GROUP BY a2.id, a2.current_balance
      HAVING ABS(
        CAST(a2.current_balance AS FLOAT8) -
        COALESCE(SUM(CAST(jel.debit AS FLOAT8) - CAST(jel.credit AS FLOAT8)), 0)
      ) > ${TOLERANCE}
    ) subq
    WHERE a.id = subq.id
    RETURNING a.id
  `));

  return { repaired: result.rows.length };
}

/* ── 6. إصلاح: إعادة حساب customers.balance من customer_ledger ───────────────
 * WRITE OPERATION — admin only
 * يُعدِّل customers.balance للعملاء ذوي الانحراف فقط.
 * ─────────────────────────────────────────────────────────────────────────── */
export async function repairCustomerBalances(): Promise<{ repaired: number }> {
  const result = await db.execute(sql.raw(`
    UPDATE customers c
    SET balance = subq.correct_balance::numeric
    FROM (
      SELECT
        c2.id,
        COALESCE(SUM(CAST(cl.amount AS FLOAT8)), 0) AS correct_balance
      FROM customers c2
      LEFT JOIN customer_ledger cl ON cl.customer_id = c2.id
      GROUP BY c2.id, c2.balance
      HAVING ABS(
        CAST(c2.balance AS FLOAT8) -
        COALESCE(SUM(CAST(cl.amount AS FLOAT8)), 0)
      ) > ${TOLERANCE}
    ) subq
    WHERE c.id = subq.id
    RETURNING c.id
  `));

  return { repaired: result.rows.length };
}

/* ── 7. تشغيل جميع الفحوصات دفعةً واحدة ────────────────────────────────────── */
export async function runAllIntegrityChecks(): Promise<{
  overall_status: "OK" | "DRIFT_DETECTED";
  checks: Record<string, IntegrityCheck>;
  generated_at: string;
}> {
  const [jeBalance, accountDrift, customerDrift, inventoryDrift] =
    await Promise.all([
      checkJournalEntryBalance(),
      checkAccountBalanceDrift(),
      checkCustomerBalanceDrift(),
      checkInventoryDrift(),
    ]);

  const allOk =
    jeBalance.status === "OK" &&
    accountDrift.status === "OK" &&
    customerDrift.status === "OK" &&
    inventoryDrift.status === "OK";

  return {
    overall_status: allOk ? "OK" : "DRIFT_DETECTED",
    checks: {
      journal_entry_balance: jeBalance,
      account_balance:       accountDrift,
      customer_balance:      customerDrift,
      inventory:             inventoryDrift,
    },
    generated_at: new Date().toISOString(),
  };
}
