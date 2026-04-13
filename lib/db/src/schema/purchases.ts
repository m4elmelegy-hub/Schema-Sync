import { pgTable, serial, text, numeric, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";
import { companiesTable } from "./companies";

export const purchasesTable = pgTable("purchases", {
  id: serial("id").primaryKey(),
  request_id: text("request_id"),
  invoice_no: text("invoice_no").notNull(),
  supplier_name: text("supplier_name"),
  customer_id: integer("customer_id"),
  customer_name: text("customer_name"),
  payment_type: text("payment_type").notNull(),
  total_amount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  paid_amount: numeric("paid_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  remaining_amount: numeric("remaining_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("paid"),
  posting_status: text("posting_status").notNull().default("draft"), // draft | posted | cancelled
  notes: text("notes"),
  date: text("date"),
  company_id: integer("company_id").notNull().default(1).references(() => companiesTable.id),
  branch_id:  integer("branch_id"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("purchases_customer_id_idx").on(t.customer_id),
  index("purchases_status_idx").on(t.status),
  index("purchases_created_at_idx").on(t.created_at),
  index("purchases_date_idx").on(t.date),
  uniqueIndex("purchases_request_id_uidx").on(t.request_id),
  index("purchases_company_date_idx").on(t.company_id, t.date),
  index("purchases_company_status_idx").on(t.company_id, t.posting_status),
]);

export const purchaseItemsTable = pgTable("purchase_items", {
  id: serial("id").primaryKey(),
  purchase_id: integer("purchase_id").notNull().references(() => purchasesTable.id),
  product_id: integer("product_id").notNull().references(() => productsTable.id),
  product_name: text("product_name").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  unit_price: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  total_price: numeric("total_price", { precision: 12, scale: 2 }).notNull(),
  // الكمية المُرتجَعة من هذا البند تحديداً (لمنع الإرجاع الزائد)
  quantity_returned: numeric("quantity_returned", { precision: 12, scale: 3 }).notNull().default("0"),
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
