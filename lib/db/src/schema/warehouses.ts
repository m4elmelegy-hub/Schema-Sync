import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const warehousesTable = pgTable("warehouses", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  company_id: integer("company_id").notNull().default(1),
  branch_id:  integer("branch_id"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Warehouse = typeof warehousesTable.$inferSelect;
