import { pgTable, serial, text, numeric, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";

export const salesReturnsTable = pgTable("sales_returns", {
  id: serial("id").primaryKey(),
  request_id: text("request_id"),
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
  user_id: integer("user_id"),
  warehouse_id: integer("warehouse_id"),
  company_id: integer("company_id").notNull().default(1),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("sales_returns_customer_id_idx").on(t.customer_id),
  index("sales_returns_sale_id_idx").on(t.sale_id),
  index("sales_returns_warehouse_id_idx").on(t.warehouse_id),
  index("sales_returns_created_at_idx").on(t.created_at),
  uniqueIndex("sales_returns_request_id_uidx").on(t.request_id),
]);

export const saleReturnItemsTable = pgTable("sale_return_items", {
  id: serial("id").primaryKey(),
  return_id: integer("return_id").notNull().references(() => salesReturnsTable.id),
  product_id: integer("product_id").notNull().references(() => productsTable.id),
  product_name: text("product_name").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  unit_price: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  total_price: numeric("total_price", { precision: 12, scale: 2 }).notNull(),
  // ربط مباشر ببند الفاتورة الأصلي — لتجنب الغموض عند تكرار نفس المنتج في الفاتورة
  original_sale_item_id: integer("original_sale_item_id"),
  // تكلفة الوحدة وقت البيع الأصلي — لحساب COGS الصحيح عند المرتجع
  unit_cost_at_return: numeric("unit_cost_at_return", { precision: 12, scale: 4 }).notNull().default("0"),
  total_cost_at_return: numeric("total_cost_at_return", { precision: 12, scale: 4 }).notNull().default("0"),
}, (t) => [
  index("sale_return_items_return_id_idx").on(t.return_id),
  index("sale_return_items_product_id_idx").on(t.product_id),
]);

export const purchaseReturnsTable = pgTable("purchase_returns", {
  id: serial("id").primaryKey(),
  request_id: text("request_id"),
  return_no: text("return_no").notNull(),
  purchase_id: integer("purchase_id"),
  customer_id: integer("customer_id"),
  customer_name: text("customer_name"),
  total_amount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  refund_type: text("refund_type").default("balance_credit"),
  safe_id: integer("safe_id"),
  safe_name: text("safe_name"),
  date: text("date"),
  reason: text("reason"),
  notes: text("notes"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("purchase_returns_purchase_id_idx").on(t.purchase_id),
  index("purchase_returns_customer_id_idx").on(t.customer_id),
  index("purchase_returns_created_at_idx").on(t.created_at),
  uniqueIndex("purchase_returns_request_id_uidx").on(t.request_id),
]);

export const purchaseReturnItemsTable = pgTable("purchase_return_items", {
  id: serial("id").primaryKey(),
  return_id: integer("return_id").notNull().references(() => purchaseReturnsTable.id),
  product_id: integer("product_id").notNull().references(() => productsTable.id),
  product_name: text("product_name").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  unit_price: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  total_price: numeric("total_price", { precision: 12, scale: 2 }).notNull(),
  // ربط مباشر ببند فاتورة الشراء الأصلية (لاستخدام تكلفة الشراء التاريخية)
  original_purchase_item_id: integer("original_purchase_item_id"),
  // تكلفة الشراء الأصلية المحفوظة وقت إنشاء المرتجع
  unit_cost_at_return: numeric("unit_cost_at_return", { precision: 12, scale: 4 }).notNull().default("0"),
  total_cost_at_return: numeric("total_cost_at_return", { precision: 12, scale: 4 }).notNull().default("0"),
}, (t) => [
  index("purchase_return_items_return_id_idx").on(t.return_id),
  index("purchase_return_items_product_id_idx").on(t.product_id),
]);

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
}, (t) => [
  index("treasury_vouchers_safe_id_idx").on(t.safe_id),
  index("treasury_vouchers_type_idx").on(t.type),
  index("treasury_vouchers_created_at_idx").on(t.created_at),
]);

export const insertSaleReturnSchema = createInsertSchema(salesReturnsTable).omit({ id: true, created_at: true });
export const insertPurchaseReturnSchema = createInsertSchema(purchaseReturnsTable).omit({ id: true, created_at: true });
export const insertTreasuryVoucherSchema = createInsertSchema(treasuryVouchersTable).omit({ id: true, created_at: true });

export type SaleReturn = typeof salesReturnsTable.$inferSelect;
export type PurchaseReturn = typeof purchaseReturnsTable.$inferSelect;
export type TreasuryVoucher = typeof treasuryVouchersTable.$inferSelect;
