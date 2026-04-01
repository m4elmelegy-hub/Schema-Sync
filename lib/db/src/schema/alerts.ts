import { pgTable, serial, text, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const alertsTable = pgTable("alerts", {
  id:           serial("id").primaryKey(),
  type:         text("type").notNull(),       // low_stock | customer_debt | supplier_payable | cash_low | health
  severity:     text("severity").notNull(),   // WARNING | CRITICAL
  message:      text("message").notNull(),
  reference_id: text("reference_id"),         // product_id / customer_id / supplier_id / null
  is_read:      boolean("is_read").notNull().default(false),
  created_at:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("alerts_type_ref_idx").on(t.type, t.reference_id),
  index("alerts_is_read_idx").on(t.is_read),
  index("alerts_created_at_idx").on(t.created_at),
]);

export type Alert = typeof alertsTable.$inferSelect;
