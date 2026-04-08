import { pgTable, serial, text, boolean, integer, timestamp, index } from "drizzle-orm/pg-core";

export const alertsTable = pgTable("alerts", {
  id:                   serial("id").primaryKey(),
  type:                 text("type").notNull(),       // low_stock | customer_debt | supplier_payable | cash_low | health
  severity:             text("severity").notNull(),   // WARNING | CRITICAL
  message:              text("message").notNull(),
  reference_id:         text("reference_id"),         // product_id / customer_id / etc.
  trigger_mode:         text("trigger_mode").notNull().default("event"), // event | daily
  last_triggered_date:  text("last_triggered_date"),  // YYYY-MM-DD — daily dedup guard
  role_target:          text("role_target"),           // comma-separated roles e.g. "admin,manager"
  user_id:              integer("user_id"),             // nullable — for per-user alerts (future use)
  is_read:              boolean("is_read").notNull().default(false),
  is_resolved:          boolean("is_resolved").notNull().default(false),
  resolved_at:          timestamp("resolved_at", { withTimezone: true }),
  resolved_by:          integer("resolved_by"),        // user id who resolved, null = auto-resolved
  company_id:           integer("company_id").notNull().default(1),
  created_at:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("alerts_type_ref_idx").on(t.type, t.reference_id),
  index("alerts_is_read_idx").on(t.is_read),
  index("alerts_is_resolved_idx").on(t.is_resolved),
  index("alerts_role_target_idx").on(t.role_target),
  index("alerts_created_at_idx").on(t.created_at),
]);

export type Alert = typeof alertsTable.$inferSelect;
