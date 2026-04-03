import { pgTable, serial, text, numeric, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";

export const salesTable = pgTable("sales", {
  id: serial("id").primaryKey(),
  request_id: text("request_id"),
  invoice_no: text("invoice_no").notNull(),
  customer_name: text("customer_name"),
  customer_id: integer("customer_id"),
  payment_type: text("payment_type").notNull(), // cash, credit, partial
  total_amount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  paid_amount: numeric("paid_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  remaining_amount: numeric("remaining_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("paid"),           // paid, partial, unpaid
  posting_status: text("posting_status").notNull().default("draft"), // draft | posted | cancelled
  safe_id: integer("safe_id"),
  safe_name: text("safe_name"),
  warehouse_id: integer("warehouse_id"),
  warehouse_name: text("warehouse_name"),
  salesperson_id: integer("salesperson_id"),
  salesperson_name: text("salesperson_name"),
  discount_percent: numeric("discount_percent", { precision: 5, scale: 2 }).default("0"),
  discount_amount: numeric("discount_amount", { precision: 12, scale: 2 }).default("0"),
  notes: text("notes"),
  date: text("date"),
  company_id: integer("company_id").notNull().default(1),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("sales_customer_id_idx").on(t.customer_id),
  index("sales_safe_id_idx").on(t.safe_id),
  index("sales_warehouse_id_idx").on(t.warehouse_id),
  index("sales_status_idx").on(t.status),
  index("sales_created_at_idx").on(t.created_at),
  index("sales_date_idx").on(t.date),
]);

export const saleItemsTable = pgTable("sale_items", {
  id: serial("id").primaryKey(),
  sale_id: integer("sale_id").notNull().references(() => salesTable.id),
  product_id: integer("product_id").notNull().references(() => productsTable.id),
  product_name: text("product_name").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  unit_price: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  total_price: numeric("total_price", { precision: 12, scale: 2 }).notNull(),
  // تكلفة الوحدة وقت البيع (متوسط مرجّح — لحساب الربح الدقيق)
  cost_price: numeric("cost_price", { precision: 12, scale: 4 }).notNull().default("0"),
  cost_total: numeric("cost_total", { precision: 12, scale: 4 }).notNull().default("0"),
  // الكمية المُرتجَعة من هذا البند تحديداً (لمنع الإرجاع الزائد)
  quantity_returned: numeric("quantity_returned", { precision: 12, scale: 3 }).notNull().default("0"),
}, (t) => [
  index("sale_items_sale_id_idx").on(t.sale_id),
  index("sale_items_product_id_idx").on(t.product_id),
]);

export const insertSaleSchema = createInsertSchema(salesTable).omit({ id: true, created_at: true });
export const insertSaleItemSchema = createInsertSchema(saleItemsTable).omit({ id: true });
export type InsertSale = z.infer<typeof insertSaleSchema>;
export type InsertSaleItem = z.infer<typeof insertSaleItemSchema>;
export type Sale = typeof salesTable.$inferSelect;
export type SaleItem = typeof saleItemsTable.$inferSelect;
