import { pgTable, serial, text, numeric, integer, timestamp, index } from "drizzle-orm/pg-core";
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

  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("transactions_safe_id_idx").on(t.safe_id),
  index("transactions_customer_id_idx").on(t.customer_id),
  index("transactions_reference_type_idx").on(t.reference_type),
  index("transactions_direction_idx").on(t.direction),
  index("transactions_type_idx").on(t.type),
  index("transactions_date_idx").on(t.date),
  index("transactions_created_at_idx").on(t.created_at),
]);

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true, created_at: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
