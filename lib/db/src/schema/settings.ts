import { pgTable, serial, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * إعدادات النظام — key/value per company
 * unique on (key, company_id) — صف لكل مفتاح لكل شركة
 */
export const systemSettingsTable = pgTable("system_settings", {
  id:         serial("id").primaryKey(),
  key:        text("key").notNull(),
  company_id: integer("company_id").notNull().default(1),
  value:      text("value"),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("system_settings_key_company_uidx").on(t.key, t.company_id),
]);

export type SystemSetting = typeof systemSettingsTable.$inferSelect;
