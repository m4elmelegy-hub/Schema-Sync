import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const salesTable = pgTable("sales", {
  id: serial("id").primaryKey(),
  invoice_no: text("invoice_no").notNull(),
  customer_name: text("customer_name"),
  customer_id: integer("customer_id"),
  payment_type: text("payment_type").notNull(), // cash, credit, partial
  total_amount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  paid_amount: numeric("paid_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  remaining_amount: numeric("remaining_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("paid"), // paid, partial, unpaid
  safe_id: integer("safe_id"),
  safe_name: text("safe_name"),
  warehouse_id: integer("warehouse_id"),
  warehouse_name: text("warehouse_name"),
  salesperson_id: integer("salesperson_id"),
  salesperson_name: text("salesperson_name"),
  discount_percent: numeric("discount_percent", { precision: 5, scale: 2 }).default("0"),
  discount_amount: numeric("discount_amount", { precision: 12, scale: 2 }).default("0"),
  notes: text("notes"),
  // تاريخ الفاتورة (يختاره المستخدم أو يُستخدم created_at)
  date: text("date"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const saleItemsTable = pgTable("sale_items", {
  id: serial("id").primaryKey(),
  sale_id: integer("sale_id").notNull(),
  product_id: integer("product_id").notNull(),
  product_name: text("product_name").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  unit_price: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  total_price: numeric("total_price", { precision: 12, scale: 2 }).notNull(),
  // تكلفة الوحدة وقت البيع (متوسط مرجّح — لحساب الربح الدقيق)
  cost_price: numeric("cost_price", { precision: 12, scale: 4 }).notNull().default("0"),
  cost_total: numeric("cost_total", { precision: 12, scale: 4 }).notNull().default("0"),
});

export const insertSaleSchema = createInsertSchema(salesTable).omit({ id: true, created_at: true });
export const insertSaleItemSchema = createInsertSchema(saleItemsTable).omit({ id: true });
export type InsertSale = z.infer<typeof insertSaleSchema>;
export type InsertSaleItem = z.infer<typeof insertSaleItemSchema>;
export type Sale = typeof salesTable.$inferSelect;
export type SaleItem = typeof saleItemsTable.$inferSelect;
