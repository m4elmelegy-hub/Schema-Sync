import { pgTable, serial, text, boolean, timestamp, date } from "drizzle-orm/pg-core";

export const companiesTable = pgTable("companies", {
  id:         serial("id").primaryKey(),
  name:       text("name").notNull(),
  plan_type:  text("plan_type").notNull().default("trial"), // trial | basic | pro
  start_date: date("start_date").notNull(),
  end_date:   date("end_date").notNull(),
  is_active:  boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Company = typeof companiesTable.$inferSelect;
export type NewCompany = typeof companiesTable.$inferInsert;
