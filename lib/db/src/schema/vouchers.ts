import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";
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
  notes: text("notes"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
  source: text("source"), // مصدر المبلغ (عند عدم وجود عميل)
  notes: text("notes"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
  notes: text("notes"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReceiptVoucherSchema = createInsertSchema(receiptVouchersTable).omit({ id: true, created_at: true });
export const insertDepositVoucherSchema = createInsertSchema(depositVouchersTable).omit({ id: true, created_at: true });
export const insertPaymentVoucherSchema = createInsertSchema(paymentVouchersTable).omit({ id: true, created_at: true });
export type ReceiptVoucher = typeof receiptVouchersTable.$inferSelect;
export type DepositVoucher = typeof depositVouchersTable.$inferSelect;
export type PaymentVoucher = typeof paymentVouchersTable.$inferSelect;
