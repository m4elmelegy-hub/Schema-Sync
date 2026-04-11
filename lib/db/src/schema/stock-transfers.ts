import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { productsTable } from "./products";
import { companiesTable } from "./companies";

export const stockTransfersTable = pgTable("stock_transfers", {
  id:                serial("id").primaryKey(),
  from_warehouse_id: integer("from_warehouse_id").notNull(),
  to_warehouse_id:   integer("to_warehouse_id").notNull(),
  status:            text("status").notNull().default("completed"),
  notes:             text("notes"),
  company_id:        integer("company_id").notNull().default(1).references(() => companiesTable.id),
  created_by:        integer("created_by"),
  created_at:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stockTransferItemsTable = pgTable("stock_transfer_items", {
  id:           serial("id").primaryKey(),
  transfer_id:  integer("transfer_id").notNull(),
  product_id:   integer("product_id").notNull().references(() => productsTable.id),
  product_name: text("product_name").notNull(),
  quantity:     numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  unit_cost:    numeric("unit_cost", { precision: 12, scale: 4 }).notNull().default("0"),
  created_at:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StockTransfer     = typeof stockTransfersTable.$inferSelect;
export type StockTransferItem = typeof stockTransferItemsTable.$inferSelect;
