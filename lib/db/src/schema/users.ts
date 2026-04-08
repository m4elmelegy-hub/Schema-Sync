import { pgTable, serial, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";

export const erpUsersTable = pgTable("erp_users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  username: text("username").notNull(),
  email: text("email"),
  pin: text("pin").default("0000"),
  role: text("role").notNull().default("cashier"),
  permissions: text("permissions").default("{}"),
  active: boolean("active").default(true),
  company_id:      integer("company_id"),
  warehouse_id:    integer("warehouse_id"),
  safe_id:         integer("safe_id"),
  login_attempts:  integer("login_attempts").notNull().default(0),
  last_login:      timestamp("last_login", { withTimezone: true }),
  created_at:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ErpUser = typeof erpUsersTable.$inferSelect;
