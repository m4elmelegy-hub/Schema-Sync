import { pgTable, serial, text, numeric, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";

export const purchasesTable = pgTable("purchases", {
  id: serial("id").primaryKey(),
  invoice_no: text("invoice_no").notNull(),
  supplier_name: text("supplier_name"),
  supplier_id: integer("supplier_id"),
  // customer_id / customer_name: إذا كانت المشتريات على حساب عميل (pass-through)
  customer_id: integer("customer_id"),
  customer_name: text("customer_name"),
  // customer_payment_type REMOVED — كان نسخة مكررة من payment_type، لا يُقرأ في أي مكان
  payment_type: text("payment_type").notNull(),
  total_amount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  paid_amount: numeric("paid_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  remaining_amount: numeric("remaining_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("paid"),
  notes: text("notes"),
  date: text("date"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("purchases_supplier_id_idx").on(t.supplier_id),
  index("purchases_customer_id_idx").on(t.customer_id),
  index("purchases_status_idx").on(t.status),
  index("purchases_created_at_idx").on(t.created_at),
  index("purchases_date_idx").on(t.date),
]);

export const purchaseItemsTable = pgTable("purchase_items", {
  id: serial("id").primaryKey(),
  purchase_id: integer("purchase_id").notNull().references(() => purchasesTable.id),
  product_id: integer("product_id").notNull().references(() => productsTable.id),
  product_name: text("product_name").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  unit_price: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  total_price: numeric("total_price", { precision: 12, scale: 2 }).notNull(),
}, (t) => [
  index("purchase_items_purchase_id_idx").on(t.purchase_id),
  index("purchase_items_product_id_idx").on(t.product_id),
]);

export const insertPurchaseSchema = createInsertSchema(purchasesTable).omit({ id: true, created_at: true });
export const insertPurchaseItemSchema = createInsertSchema(purchaseItemsTable).omit({ id: true });
export type InsertPurchase = z.infer<typeof insertPurchaseSchema>;
export type InsertPurchaseItem = z.infer<typeof insertPurchaseItemSchema>;
export type Purchase = typeof purchasesTable.$inferSelect;
export type PurchaseItem = typeof purchaseItemsTable.$inferSelect;
