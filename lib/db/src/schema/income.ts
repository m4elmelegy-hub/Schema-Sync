import { pgTable, serial, text, numeric, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const incomeTable = pgTable("income", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  description: text("description"),
  safe_id: integer("safe_id"),
  safe_name: text("safe_name"),
  company_id: integer("company_id").notNull().default(1).references(() => companiesTable.id),
  branch_id:  integer("branch_id"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("income_safe_id_idx").on(t.safe_id),
  index("income_source_idx").on(t.source),
  index("income_created_at_idx").on(t.created_at),
]);

export const insertIncomeSchema = createInsertSchema(incomeTable).omit({ id: true, created_at: true });
export type InsertIncome = z.infer<typeof insertIncomeSchema>;
export type Income = typeof incomeTable.$inferSelect;
