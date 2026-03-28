import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const salesReturnsTable = pgTable("sales_returns", {
  id: serial("id").primaryKey(),
  return_no: text("return_no").notNull(),
  sale_id: integer("sale_id"),
  customer_id: integer("customer_id"),
  customer_name: text("customer_name"),
  total_amount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  // نوع الاسترداد:
  //   credit = خصم من رصيد العميل (customer.balance -= amount) — لفواتير آجل
  //   cash   = استرداد نقدي من الخزينة (safe.balance -= amount) — لفواتير نقدي
  refund_type: text("refund_type").default("credit"),
  safe_id: integer("safe_id"),
  safe_name: text("safe_name"),
  date: text("date"),
  reason: text("reason"),
  notes: text("notes"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const saleReturnItemsTable = pgTable("sale_return_items", {
  id: serial("id").primaryKey(),
  return_id: integer("return_id").notNull(),
  product_id: integer("product_id").notNull(),
  product_name: text("product_name").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  unit_price: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  total_price: numeric("total_price", { precision: 12, scale: 2 }).notNull(),
});

export const purchaseReturnsTable = pgTable("purchase_returns", {
  id: serial("id").primaryKey(),
  return_no: text("return_no").notNull(),
  purchase_id: integer("purchase_id"),
  customer_id: integer("customer_id"),
  customer_name: text("customer_name"),
  supplier_name: text("supplier_name"),
  total_amount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  date: text("date"),
  reason: text("reason"),
  notes: text("notes"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const purchaseReturnItemsTable = pgTable("purchase_return_items", {
  id: serial("id").primaryKey(),
  return_id: integer("return_id").notNull(),
  product_id: integer("product_id").notNull(),
  product_name: text("product_name").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  unit_price: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  total_price: numeric("total_price", { precision: 12, scale: 2 }).notNull(),
});

export const treasuryVouchersTable = pgTable("treasury_vouchers", {
  id: serial("id").primaryKey(),
  voucher_no: text("voucher_no").notNull(),
  type: text("type").notNull(),
  safe_id: integer("safe_id").notNull(),
  safe_name: text("safe_name").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  party_name: text("party_name"),
  description: text("description").notNull(),
  category: text("category"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSaleReturnSchema = createInsertSchema(salesReturnsTable).omit({ id: true, created_at: true });
export const insertPurchaseReturnSchema = createInsertSchema(purchaseReturnsTable).omit({ id: true, created_at: true });
export const insertTreasuryVoucherSchema = createInsertSchema(treasuryVouchersTable).omit({ id: true, created_at: true });

export type SaleReturn = typeof salesReturnsTable.$inferSelect;
export type PurchaseReturn = typeof purchaseReturnsTable.$inferSelect;
export type TreasuryVoucher = typeof treasuryVouchersTable.$inferSelect;
