import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),           // "create" | "update" | "delete"
  record_type: text("record_type").notNull(), // "customer" | "supplier"
  record_id: integer("record_id").notNull(),
  old_value: jsonb("old_value"),              // snapshot before change (null for create)
  new_value: jsonb("new_value"),              // snapshot after change  (null for delete)
  user_id: integer("user_id"),
  username: text("username"),
  company_id: integer("company_id").notNull().default(1),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AuditLog = typeof auditLogsTable.$inferSelect;
