import { pgTable, serial, text, numeric, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const accountsTable = pgTable("accounts", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  type: text("type").notNull(), // asset, liability, equity, revenue, expense
  parent_id: integer("parent_id"),
  level: integer("level").notNull().default(1),
  is_posting: boolean("is_posting").notNull().default(true),
  opening_balance: numeric("opening_balance", { precision: 12, scale: 2 }).notNull().default("0"),
  current_balance: numeric("current_balance", { precision: 12, scale: 2 }).notNull().default("0"),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const journalEntriesTable = pgTable("journal_entries", {
  id: serial("id").primaryKey(),
  entry_no: text("entry_no").notNull(),
  date: text("date").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("draft"), // draft, posted
  reference: text("reference"),
  total_debit: numeric("total_debit", { precision: 12, scale: 2 }).notNull().default("0"),
  total_credit: numeric("total_credit", { precision: 12, scale: 2 }).notNull().default("0"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const journalEntryLinesTable = pgTable("journal_entry_lines", {
  id: serial("id").primaryKey(),
  entry_id: integer("entry_id").notNull(),
  account_id: integer("account_id").notNull(),
  account_name: text("account_name").notNull(),
  account_code: text("account_code").notNull(),
  debit: numeric("debit", { precision: 12, scale: 2 }).notNull().default("0"),
  credit: numeric("credit", { precision: 12, scale: 2 }).notNull().default("0"),
  description: text("description"),
});

export const insertAccountSchema = createInsertSchema(accountsTable).omit({ id: true, created_at: true });
export const insertJournalEntrySchema = createInsertSchema(journalEntriesTable).omit({ id: true, created_at: true });
export const insertJournalEntryLineSchema = createInsertSchema(journalEntryLinesTable).omit({ id: true });

export type Account = typeof accountsTable.$inferSelect;
export type JournalEntry = typeof journalEntriesTable.$inferSelect;
export type JournalEntryLine = typeof journalEntryLinesTable.$inferSelect;
