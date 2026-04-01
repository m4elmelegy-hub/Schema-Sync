import { pgTable, serial, text, numeric, boolean, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const customersTable = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  customer_code: integer("customer_code"),
  normalized_name: text("normalized_name"),
  phone: text("phone"),
  balance: numeric("balance", { precision: 12, scale: 2 }).notNull().default("0"),
  is_supplier: boolean("is_supplier").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("customers_customer_code_unique").on(t.customer_code),
]);

export const insertCustomerSchema = createInsertSchema(customersTable).omit({ id: true, created_at: true });
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customersTable.$inferSelect;
