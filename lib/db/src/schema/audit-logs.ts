import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  record_type: text("record_type").notNull(),
  record_id: integer("record_id").notNull(),
  old_value: jsonb("old_value"),
  new_value: jsonb("new_value"),
  user_id: integer("user_id"),
  username: text("username"),
  company_id: integer("company_id").notNull().default(1).references(() => companiesTable.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AuditLog = typeof auditLogsTable.$inferSelect;
