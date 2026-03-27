import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const warehousesTable = pgTable("warehouses", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Warehouse = typeof warehousesTable.$inferSelect;
