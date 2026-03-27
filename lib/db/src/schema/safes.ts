import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";

export const safesTable = pgTable("safes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  balance: numeric("balance", { precision: 12, scale: 2 }).default("0"),
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
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Safe = typeof safesTable.$inferSelect;
export type SafeTransfer = typeof safeTransfersTable.$inferSelect;
