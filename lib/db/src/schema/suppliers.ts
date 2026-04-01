import { pgTable, serial, text, numeric, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const suppliersTable = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  supplier_code: integer("supplier_code"),
  normalized_name: text("normalized_name"),
  phone: text("phone"),
  balance: numeric("balance", { precision: 12, scale: 2 }).notNull().default("0"),
  linked_customer_id: integer("linked_customer_id"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("suppliers_supplier_code_unique").on(t.supplier_code),
]);

export const insertSupplierSchema = createInsertSchema(suppliersTable).omit({ id: true, created_at: true });
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type Supplier = typeof suppliersTable.$inferSelect;
