import { pgTable, serial, text, numeric, integer, timestamp, index } from "drizzle-orm/pg-core";
import { productsTable } from "./products";

export const stockMovementsTable = pgTable("stock_movements", {
  id: serial("id").primaryKey(),
  product_id: integer("product_id").notNull().references(() => productsTable.id),
  product_name: text("product_name").notNull(),
  movement_type: text("movement_type").notNull(),
  // positive = وارد (IN), negative = صادر (OUT)
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  quantity_before: numeric("quantity_before", { precision: 12, scale: 3 }).notNull().default("0"),
  quantity_after: numeric("quantity_after", { precision: 12, scale: 3 }).notNull().default("0"),
  unit_cost: numeric("unit_cost", { precision: 12, scale: 4 }).notNull().default("0"),
  reference_type: text("reference_type"),
  reference_id: integer("reference_id"),
  reference_no: text("reference_no"),
  notes: text("notes"),
  date: text("date"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("stock_movements_product_id_idx").on(t.product_id),
  index("stock_movements_movement_type_idx").on(t.movement_type),
  index("stock_movements_reference_type_idx").on(t.reference_type),
  index("stock_movements_date_idx").on(t.date),
  index("stock_movements_created_at_idx").on(t.created_at),
]);

export type StockMovement = typeof stockMovementsTable.$inferSelect;
