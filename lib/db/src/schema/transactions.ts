import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── الجدول المركزي للحركات المالية ─────────────────────────────────────────
// كل عملية مالية في النظام تُسجَّل هنا بشكل إلزامي عبر DB transaction
export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),

  // نوع العملية
  // sale_cash | sale_credit | sale_partial | receipt_voucher | payment_voucher
  // deposit_voucher | transfer_in | transfer_out | expense | income
  type: text("type").notNull(),

  // المرجع: الجدول + المعرّف
  reference_type: text("reference_type"), // sale | receipt_voucher | payment_voucher | deposit_voucher | transfer | expense | income
  reference_id: integer("reference_id"),

  // الخزينة المرتبطة
  safe_id: integer("safe_id"),
  safe_name: text("safe_name"),

  // العميل المرتبط
  customer_id: integer("customer_id"),
  customer_name: text("customer_name"),

  // المبلغ والاتجاه
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  direction: text("direction").notNull().default("none"), // in | out | none

  description: text("description"),
  date: text("date"),

  // حقل قديم للتوافق
  related_id: integer("related_id"),

  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true, created_at: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
