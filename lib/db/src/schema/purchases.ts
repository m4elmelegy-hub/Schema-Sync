import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const purchasesTable = pgTable("purchases", {
  id: serial("id").primaryKey(),
  invoice_no: text("invoice_no").notNull(),
  supplier_name: text("supplier_name"),
  supplier_id: integer("supplier_id"),
  payment_type: text("payment_type").notNull(), // cash, credit, partial
  total_amount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  paid_amount: numeric("paid_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  remaining_amount: numeric("remaining_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("paid"), // paid, partial, unpaid
  notes: text("notes"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const purchaseItemsTable = pgTable("purchase_items", {
  id: serial("id").primaryKey(),
  purchase_id: integer("purchase_id").notNull(),
  product_id: integer("product_id").notNull(),
  product_name: text("product_name").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  unit_price: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  total_price: numeric("total_price", { precision: 12, scale: 2 }).notNull(),
});

export const insertPurchaseSchema = createInsertSchema(purchasesTable).omit({ id: true, created_at: true });
export const insertPurchaseItemSchema = createInsertSchema(purchaseItemsTable).omit({ id: true });
export type InsertPurchase = z.infer<typeof insertPurchaseSchema>;
export type InsertPurchaseItem = z.infer<typeof insertPurchaseItemSchema>;
export type Purchase = typeof purchasesTable.$inferSelect;
export type PurchaseItem = typeof purchaseItemsTable.$inferSelect;
