import { pgTable, serial, text, numeric, integer, timestamp, index } from "drizzle-orm/pg-core";

export const safesTable = pgTable("safes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  balance: numeric("balance", { precision: 12, scale: 2 }).default("0"),
  company_id: integer("company_id").notNull().default(1),
  branch_id:  integer("branch_id"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const safeTransfersTable = pgTable("safe_transfers", {
  id: serial("id").primaryKey(),
  from_safe_id: integer("from_safe_id"),
  from_safe_name: text("from_safe_name"),
  to_safe_id: integer("to_safe_id"),
  to_safe_name: text("to_safe_name"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  notes: text("notes"),
  company_id: integer("company_id").notNull().default(1),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("safe_transfers_from_safe_id_idx").on(t.from_safe_id),
  index("safe_transfers_to_safe_id_idx").on(t.to_safe_id),
  index("safe_transfers_created_at_idx").on(t.created_at),
]);

export type Safe = typeof safesTable.$inferSelect;
export type SafeTransfer = typeof safeTransfersTable.$inferSelect;
