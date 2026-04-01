import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const backupsTable = pgTable("backups", {
  id:         serial("id").primaryKey(),
  filename:   text("filename").notNull(),
  size:       integer("size").notNull().default(0),
  trigger:    text("trigger").notNull().default("manual"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Backup = typeof backupsTable.$inferSelect;
