/**
 * seedDefaults — runs once on server start.
 * 1. Creates a default admin user if the users table is empty.
 * 2. Migrates any plain-text PINs to bcrypt hashes (one-time, idempotent).
 */
import { eq } from "drizzle-orm";
import { db, erpUsersTable } from "@workspace/db";
import { logger } from "./logger";
import { hashPin, isHashed } from "./hash";

const DEFAULT_USERNAME = "admin";
const DEFAULT_PIN      = "123456";
const DEFAULT_ROLE     = "admin";
const DEFAULT_NAME     = "المدير الافتراضي";

export async function seedDefaults(): Promise<void> {
  try {
    const existing = await db.select({ id: erpUsersTable.id }).from(erpUsersTable).limit(1);

    if (existing.length === 0) {
      const hashed = await hashPin(DEFAULT_PIN);
      await db.insert(erpUsersTable).values({
        name:     DEFAULT_NAME,
        username: DEFAULT_USERNAME,
        pin:      hashed,
        role:     DEFAULT_ROLE,
        active:   true,
      });
      logger.info("Default admin created: admin / 123456");
      console.log("\n========================================");
      console.log("  Default admin created: admin / 123456");
      console.log("========================================\n");
    }

    /* ── PIN Migration: hash any plain-text PINs remaining in DB ── */
    await migratePlainTextPins();

  } catch (err) {
    logger.error({ err }, "seedDefaults failed — continuing without default user");
  }
}

async function migratePlainTextPins(): Promise<void> {
  try {
    const users = await db
      .select({ id: erpUsersTable.id, pin: erpUsersTable.pin })
      .from(erpUsersTable);

    let migrated = 0;
    for (const user of users) {
      if (!user.pin) continue;
      if (isHashed(user.pin)) continue; // already hashed

      const hashed = await hashPin(user.pin);
      await db
        .update(erpUsersTable)
        .set({ pin: hashed })
        .where(eq(erpUsersTable.id, user.id));
      migrated++;
    }

    if (migrated > 0) {
      logger.info({ migrated }, "Migrated plain-text PINs to bcrypt hashes");
    }
  } catch (err) {
    logger.error({ err }, "PIN migration failed — server will continue but PINs may be unhashed");
  }
}
