/**
 * seedDefaults — runs once on server start.
 * Creates a default admin user if the users table is completely empty.
 */
import { db, erpUsersTable } from "@workspace/db";
import { logger } from "./logger";

const DEFAULT_USERNAME = "admin";
const DEFAULT_PIN      = "123456";
const DEFAULT_ROLE     = "admin";
const DEFAULT_NAME     = "المدير الافتراضي";

export async function seedDefaults(): Promise<void> {
  try {
    const existing = await db.select({ id: erpUsersTable.id }).from(erpUsersTable).limit(1);

    if (existing.length > 0) return; // users exist — do nothing

    await db.insert(erpUsersTable).values({
      name:     DEFAULT_NAME,
      username: DEFAULT_USERNAME,
      pin:      DEFAULT_PIN,
      role:     DEFAULT_ROLE,
      active:   true,
    });

    logger.info("Default admin created: admin / 123456");
    console.log("\n========================================");
    console.log("  Default admin created: admin / 123456");
    console.log("========================================\n");
  } catch (err) {
    logger.error({ err }, "seedDefaults failed — continuing without default user");
  }
}
