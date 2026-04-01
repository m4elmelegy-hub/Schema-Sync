import { pgTable, serial, text, numeric, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── سندات القبض (Receipt Vouchers) ─────────────────────────────────────────
// العميل يدفع دَيْنه → رصيد العميل ينزل، الخزينة ترتفع
export const receiptVouchersTable = pgTable("receipt_vouchers", {
  id: serial("id").primaryKey(),
  voucher_no: text("voucher_no").notNull(),
  date: text("date").notNull(),
  customer_id: integer("customer_id"),
  customer_name: text("customer_name").notNull(),
  safe_id: integer("safe_id").notNull(),
  safe_name: text("safe_name").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  posting_status: text("posting_status").notNull().default("draft"), // draft | posted | cancelled
  notes: text("notes"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("receipt_vouchers_customer_id_idx").on(t.customer_id),
  index("receipt_vouchers_safe_id_idx").on(t.safe_id),
  index("receipt_vouchers_date_idx").on(t.date),
  index("receipt_vouchers_created_at_idx").on(t.created_at),
]);

// ── سندات التوريد / الإيداع (Deposit Vouchers) ─────────────────────────────
// إيداع نقود في الخزينة من عميل أو مصدر خارجي → الخزينة ترتفع، رصيد العميل ينزل
export const depositVouchersTable = pgTable("deposit_vouchers", {
  id: serial("id").primaryKey(),
  voucher_no: text("voucher_no").notNull(),
  date: text("date").notNull(),
  customer_id: integer("customer_id"),
  customer_name: text("customer_name"),
  safe_id: integer("safe_id").notNull(),
  safe_name: text("safe_name").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  posting_status: text("posting_status").notNull().default("draft"), // draft | posted | cancelled
  source: text("source"), // مصدر المبلغ (عند عدم وجود عميل)
  notes: text("notes"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("deposit_vouchers_customer_id_idx").on(t.customer_id),
  index("deposit_vouchers_safe_id_idx").on(t.safe_id),
  index("deposit_vouchers_date_idx").on(t.date),
  index("deposit_vouchers_created_at_idx").on(t.created_at),
]);

// ── سندات الصرف (Payment Vouchers) ──────────────────────────────────────────
// الشركة تصرف نقداً لعميل (استرداد، دفعة عكسية...) → الخزينة تنزل
export const paymentVouchersTable = pgTable("payment_vouchers", {
  id: serial("id").primaryKey(),
  voucher_no: text("voucher_no").notNull(),
  date: text("date").notNull(),
  customer_id: integer("customer_id"),
  customer_name: text("customer_name").notNull(),
  safe_id: integer("safe_id").notNull(),
  safe_name: text("safe_name").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  posting_status: text("posting_status").notNull().default("draft"), // draft | posted | cancelled
  notes: text("notes"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("payment_vouchers_customer_id_idx").on(t.customer_id),
  index("payment_vouchers_safe_id_idx").on(t.safe_id),
  index("payment_vouchers_date_idx").on(t.date),
  index("payment_vouchers_created_at_idx").on(t.created_at),
]);

export const insertReceiptVoucherSchema = createInsertSchema(receiptVouchersTable).omit({ id: true, created_at: true });
export const insertDepositVoucherSchema = createInsertSchema(depositVouchersTable).omit({ id: true, created_at: true });
export const insertPaymentVoucherSchema = createInsertSchema(paymentVouchersTable).omit({ id: true, created_at: true });
export type ReceiptVoucher = typeof receiptVouchersTable.$inferSelect;
export type DepositVoucher = typeof depositVouchersTable.$inferSelect;
export type PaymentVoucher = typeof paymentVouchersTable.$inferSelect;
