import { pgTable, serial, text, numeric, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * دفتر أستاذ العملاء
 * كل عملية مالية لكل عميل تُسجَّل هنا فوراً بصرف النظر عن حالة الترحيل
 *
 * قاعدة الرصيد:
 *   amount > 0  → دين على العميل (مبيعات / معاملات تزيد الذمة)
 *   amount < 0  → دفعة من العميل أو رصيد دائن له (قبض / مرتجعات)
 *
 * balance = SUM(amount) per customer
 *   balance > 0 → العميل مدين لنا
 *   balance < 0 → العميل دائن له (أَوفى أكثر مما عليه)
 */
export const customerLedgerTable = pgTable("customer_ledger", {
  id: serial("id").primaryKey(),

  customer_id: integer("customer_id").notNull(),

  // نوع الحركة
  // sale | sale_return | receipt_voucher | payment | adjustment | opening_balance
  type: text("type").notNull(),

  // المبلغ
  // موجب = دين على العميل ← يزيد الرصيد
  // سالب = سداد / رصيد دائن ← يقلّل الرصيد
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),

  // المرجع
  reference_type: text("reference_type"),
  reference_id: integer("reference_id"),
  reference_no: text("reference_no"),

  description: text("description"),
  date: text("date"),

  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("customer_ledger_customer_id_idx").on(t.customer_id),
  index("customer_ledger_type_idx").on(t.type),
  index("customer_ledger_date_idx").on(t.date),
  index("customer_ledger_reference_idx").on(t.reference_type, t.reference_id),
]);

export const insertCustomerLedgerSchema = createInsertSchema(customerLedgerTable).omit({ id: true, created_at: true });
export type InsertCustomerLedger = z.infer<typeof insertCustomerLedgerSchema>;
export type CustomerLedgerEntry = typeof customerLedgerTable.$inferSelect;
