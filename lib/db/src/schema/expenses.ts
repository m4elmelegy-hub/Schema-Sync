import { pgTable, serial, text, numeric, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const expensesTable = pgTable("expenses", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  description: text("description"),
  // الخزينة التي صُرف منها هذا المصروف
  safe_id: integer("safe_id"),
  safe_name: text("safe_name"),
  company_id: integer("company_id").notNull().default(1).references(() => companiesTable.id),
  branch_id:  integer("branch_id"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("expenses_safe_id_idx").on(t.safe_id),
  index("expenses_category_idx").on(t.category),
  index("expenses_created_at_idx").on(t.created_at),
  index("expenses_company_created_at_idx").on(t.company_id, t.created_at),
]);

export const insertExpenseSchema = createInsertSchema(expensesTable).omit({ id: true, created_at: true });
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expensesTable.$inferSelect;
