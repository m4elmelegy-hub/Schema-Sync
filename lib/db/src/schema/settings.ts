import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * إعدادات النظام — key/value بسيطة
 * مثال: closing_date → "2024-12-31"
 */
export const systemSettingsTable = pgTable("system_settings", {
  key:        text("key").primaryKey(),
  value:      text("value"),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SystemSetting = typeof systemSettingsTable.$inferSelect;
