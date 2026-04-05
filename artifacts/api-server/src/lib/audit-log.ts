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
  | "correction_created";

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
  | "treasury_voucher";

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
    });
  } catch (err) {
    console.error("[audit-log] failed to write log:", err);
  }
}
