import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sku: text("sku"),
  category: text("category"),
  category_id: integer("category_id"),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull().default("0"),
  cost_price: numeric("cost_price", { precision: 12, scale: 2 }).notNull().default("0"),
  sale_price: numeric("sale_price", { precision: 12, scale: 2 }).notNull().default("0"),
  low_stock_threshold: integer("low_stock_threshold"),
  company_id: integer("company_id").notNull().default(1),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, created_at: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
