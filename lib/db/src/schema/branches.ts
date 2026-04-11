import { pgTable, serial, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export const branchesTable = pgTable("branches", {
  id:         serial("id").primaryKey(),
  company_id: integer("company_id").notNull().default(1).references(() => companiesTable.id),
  name:       text("name").notNull(),
  address:    text("address"),
  phone:      text("phone"),
  is_active:  boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("branches_company_id_idx").on(t.company_id),
]);

export type Branch    = typeof branchesTable.$inferSelect;
export type NewBranch = typeof branchesTable.$inferInsert;
