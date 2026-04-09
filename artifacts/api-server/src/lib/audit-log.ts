/**
 * audit-log.ts
 *
 * Thin fire-and-forget helper for writing audit log entries.
 * Never throws — a logging failure must never break the main request.
 */

import { db, auditLogsTable } from "@workspace/db";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "cancel"
  | "price_override"
  | "lock_period"
  | "unlock_period"
  | "lock_blocked"
  | "reversal_created"
  | "correction_created"
  // ── ERP critical events ────────────────────────────────────────────────────
  | "INTEGRITY_REPAIR"          // إصلاح انحراف محاسبي (أرصدة حسابات أو عملاء)
  | "INVENTORY_ADJUSTMENT"      // تسوية يدوية للمخزون
  | "INVENTORY_COUNT_APPLIED"   // تطبيق جلسة جرد مخزون
  | "INVENTORY_TRANSFER"        // تحويل مخزون بين مخازن
  | "PERIOD_OVERRIDE";          // تجاوز مدير للقفل المالي

export type AuditRecordType =
  | "customer"
  | "supplier"
  | "sale"
  | "sale_return"
  | "purchase_return"
  | "product"
  | "financial_lock"
  | "expense"
  | "safe_transfer"
  | "receipt_voucher"
  | "payment_voucher"
  | "deposit_voucher"
  | "treasury_voucher"
  | "user"
  // ── ERP critical types ─────────────────────────────────────────────────────
  | "account_balances"        // إصلاح أرصدة الحسابات المحاسبية
  | "customer_balances";      // إصلاح أرصدة العملاء

interface AuditUser {
  id?: number;
  username?: string;
}

export async function writeAuditLog(opts: {
  action: AuditAction;
  record_type: AuditRecordType;
  record_id: number;
  old_value?: object | null;
  new_value?: object | null;
  user?: AuditUser | null;
  company_id?: number | null;
  note?: string;
}): Promise<void> {
  try {
    await db.insert(auditLogsTable).values({
      action: opts.action,
      record_type: opts.record_type,
      record_id: opts.record_id,
      old_value: opts.old_value ?? null,
      new_value: opts.new_value ?? null,
      user_id: opts.user?.id ?? null,
      username: opts.user?.username ?? null,
      company_id: opts.company_id ?? 1,
    });
  } catch (err) {
    console.error("[audit-log] failed to write log:", err);
  }
}
