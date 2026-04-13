import { pgTable, serial, text, numeric, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { companiesTable } from "./companies";

export const receiptVouchersTable = pgTable("receipt_vouchers", {
  id: serial("id").primaryKey(),
  request_id: text("request_id"),
  voucher_no: text("voucher_no").notNull(),
  date: text("date").notNull(),
  customer_id: integer("customer_id"),
  customer_name: text("customer_name").notNull(),
  safe_id: integer("safe_id").notNull(),
  safe_name: text("safe_name").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  posting_status: text("posting_status").notNull().default("draft"),
  notes: text("notes"),
  company_id: integer("company_id").notNull().default(1).references(() => companiesTable.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("receipt_vouchers_customer_id_idx").on(t.customer_id),
  index("receipt_vouchers_safe_id_idx").on(t.safe_id),
  index("receipt_vouchers_date_idx").on(t.date),
  index("receipt_vouchers_created_at_idx").on(t.created_at),
  uniqueIndex("receipt_vouchers_request_id_uidx").on(t.request_id),
]);

export const depositVouchersTable = pgTable("deposit_vouchers", {
  id: serial("id").primaryKey(),
  request_id: text("request_id"),
  voucher_no: text("voucher_no").notNull(),
  date: text("date").notNull(),
  customer_id: integer("customer_id"),
  customer_name: text("customer_name"),
  safe_id: integer("safe_id").notNull(),
  safe_name: text("safe_name").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  posting_status: text("posting_status").notNull().default("draft"),
  source: text("source"),
  notes: text("notes"),
  company_id: integer("company_id").notNull().default(1).references(() => companiesTable.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("deposit_vouchers_customer_id_idx").on(t.customer_id),
  index("deposit_vouchers_safe_id_idx").on(t.safe_id),
  index("deposit_vouchers_date_idx").on(t.date),
  index("deposit_vouchers_created_at_idx").on(t.created_at),
  uniqueIndex("deposit_vouchers_request_id_uidx").on(t.request_id),
]);

export const paymentVouchersTable = pgTable("payment_vouchers", {
  id: serial("id").primaryKey(),
  request_id: text("request_id"),
  voucher_no: text("voucher_no").notNull(),
  date: text("date").notNull(),
  customer_id: integer("customer_id"),
  customer_name: text("customer_name").notNull(),
  safe_id: integer("safe_id").notNull(),
  safe_name: text("safe_name").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  posting_status: text("posting_status").notNull().default("draft"),
  notes: text("notes"),
  company_id: integer("company_id").notNull().default(1).references(() => companiesTable.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("payment_vouchers_customer_id_idx").on(t.customer_id),
  index("payment_vouchers_safe_id_idx").on(t.safe_id),
  index("payment_vouchers_date_idx").on(t.date),
  index("payment_vouchers_created_at_idx").on(t.created_at),
  uniqueIndex("payment_vouchers_request_id_uidx").on(t.request_id),
]);

export const insertReceiptVoucherSchema = createInsertSchema(receiptVouchersTable).omit({ id: true, created_at: true });
export const insertDepositVoucherSchema = createInsertSchema(depositVouchersTable).omit({ id: true, created_at: true });
export const insertPaymentVoucherSchema = createInsertSchema(paymentVouchersTable).omit({ id: true, created_at: true });
export type ReceiptVoucher = typeof receiptVouchersTable.$inferSelect;
export type DepositVoucher = typeof depositVouchersTable.$inferSelect;
export type PaymentVoucher = typeof paymentVouchersTable.$inferSelect;
