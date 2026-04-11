import { pgTable, serial, text, boolean, integer, timestamp, index } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export const alertsTable = pgTable("alerts", {
  id:                   serial("id").primaryKey(),
  type:                 text("type").notNull(),
  severity:             text("severity").notNull(),
  message:              text("message").notNull(),
  reference_id:         text("reference_id"),
  trigger_mode:         text("trigger_mode").notNull().default("event"),
  last_triggered_date:  text("last_triggered_date"),
  role_target:          text("role_target"),
  user_id:              integer("user_id"),
  is_read:              boolean("is_read").notNull().default(false),
  is_resolved:          boolean("is_resolved").notNull().default(false),
  resolved_at:          timestamp("resolved_at", { withTimezone: true }),
  resolved_by:          integer("resolved_by"),
  company_id:           integer("company_id").notNull().default(1).references(() => companiesTable.id),
  created_at:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("alerts_type_ref_idx").on(t.type, t.reference_id),
  index("alerts_is_read_idx").on(t.is_read),
  index("alerts_is_resolved_idx").on(t.is_resolved),
  index("alerts_role_target_idx").on(t.role_target),
  index("alerts_created_at_idx").on(t.created_at),
]);

export type Alert = typeof alertsTable.$inferSelect;
