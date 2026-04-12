/**
 * seedDefaults — runs once on server start.
 * 1. Creates the default company if the companies table is empty.
 * 2. Creates a super_admin user if none exists.
 * 3. Creates a default company_admin user for company 1 if none exists.
 * 4. Migrates any plain-text PINs to bcrypt hashes (one-time, idempotent).
 */
import { eq } from "drizzle-orm";
import { db, erpUsersTable, companiesTable } from "@workspace/db";
import { logger } from "./logger";
import { hashPin, isHashed } from "./hash";

export async function seedDefaults(): Promise<void> {
  try {
    /* ── 1. Ensure default company exists ──────────────────────── */
    const companies = await db.select({ id: companiesTable.id }).from(companiesTable).limit(1);
    if (companies.length === 0) {
      await db.insert(companiesTable).values({
        name:       "الشركة الافتراضية",
        plan_type:  "professional",
        is_active:  true,
        start_date: new Date().toISOString().split("T")[0],
        end_date:   new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      });
      logger.info("Default company created");
    }

    /* ── 2. Ensure super_admin user exists ─────────────────────── */
    const [superAdmin] = await db
      .select({ id: erpUsersTable.id })
      .from(erpUsersTable)
      .where(eq(erpUsersTable.role, "super_admin"))
      .limit(1);

    const superAdminPin = process.env.SUPER_ADMIN_PIN ?? "000000";

    if (!superAdmin) {
      const hashed = await hashPin(superAdminPin);
      await db.insert(erpUsersTable).values({
        name:       "Super Admin",
        username:   "superadmin",
        pin:        hashed,
        role:       "super_admin",
        company_id: null,
        active:     true,
      });
      logger.info(`Super admin created — username: superadmin, PIN: ${superAdminPin}`);
    } else if (process.env.SUPER_ADMIN_PIN) {
      /* If SUPER_ADMIN_PIN env var is explicitly set, update the PIN on startup */
      const hashed = await hashPin(superAdminPin);
      await db
        .update(erpUsersTable)
        .set({ pin: hashed, active: true })
        .where(eq(erpUsersTable.role, "super_admin"));
      logger.info(`Super admin PIN updated from SUPER_ADMIN_PIN env var`);
    }

    /* ── 3. Ensure default company_admin exists (company_id = 1) ── */
    const [companyUsers] = await db
      .select({ id: erpUsersTable.id })
      .from(erpUsersTable)
      .where(eq(erpUsersTable.company_id, 1))
      .limit(1);

    if (!companyUsers) {
      const defaultAdminPin = process.env.DEFAULT_ADMIN_PIN ?? "123456";
      const hashed = await hashPin(defaultAdminPin);
      await db.insert(erpUsersTable).values({
        name:       "المدير الافتراضي",
        username:   "admin",
        pin:        hashed,
        role:       "admin",
        company_id: 1,
        active:     true,
      });
      logger.info(`Default company admin created — username: admin, PIN: ${defaultAdminPin}`);
    } else if (process.env.DEFAULT_ADMIN_PIN) {
      /* If DEFAULT_ADMIN_PIN env var is explicitly set, update the PIN on startup */
      const hashed = await hashPin(process.env.DEFAULT_ADMIN_PIN);
      const [firstCompanyAdmin] = await db
        .select({ id: erpUsersTable.id })
        .from(erpUsersTable)
        .where(eq(erpUsersTable.company_id, 1))
        .limit(1);
      if (firstCompanyAdmin) {
        await db
          .update(erpUsersTable)
          .set({ pin: hashed })
          .where(eq(erpUsersTable.id, firstCompanyAdmin.id));
        logger.info("Default admin PIN updated from DEFAULT_ADMIN_PIN env var");
      }
    }

    /* ── 4. Migrate plain-text PINs to bcrypt hashes ───────────── */
    await migratePlainTextPins();

  } catch (err) {
    logger.error({ err }, "seedDefaults failed — continuing without defaults");
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
      if (isHashed(user.pin)) continue;

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
