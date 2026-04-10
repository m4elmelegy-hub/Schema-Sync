/**
 * /api/super/* — Super-admin panel for managing all SaaS companies.
 * Only accessible to users with role = "super_admin".
 * Super-admin users have no company_id (null) so subscription checks are bypassed.
 */
import { Router } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, companiesTable, erpUsersTable } from "@workspace/db";
import { authenticate, requireRole, superAdminIPGuard } from "../middleware/auth";
import { wrap } from "../lib/async-handler";
import { hashPin } from "../lib/hash";
import { createCompanySchema, validate } from "../lib/schemas";
import { createDatabaseBackup, listBackups } from "../lib/db-backup";
import fs from "fs";

const router = Router();

/* Apply IP guard to all super-admin routes */
router.use(superAdminIPGuard);

const superOnly = [authenticate, requireRole("super_admin")];

function daysRemaining(endDate: string): number {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const end = new Date(endDate); end.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/* ── GET /super/companies — list all companies with stats ── */
router.get("/super/companies", ...superOnly, wrap(async (_req, res) => {
  const companies = await db
    .select()
    .from(companiesTable)
    .orderBy(desc(companiesTable.created_at));

  const result = await Promise.all(companies.map(async (co) => {
    const userCount = await db
      .select({ id: erpUsersTable.id })
      .from(erpUsersTable)
      .where(eq(erpUsersTable.company_id, co.id));

    const days = daysRemaining(co.end_date);
    const status =
      !co.is_active ? "suspended" :
      days < 0     ? "expired" :
      co.plan_type === "trial" ? "trial" : "active";

    return {
      ...co,
      daysRemaining: days,
      status,
      userCount: userCount.length,
    };
  }));

  res.json(result);
}));

/* ── GET /super/companies/:id — single company detail ── */
router.get("/super/companies/:id", ...superOnly, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const [co] = await db.select().from(companiesTable).where(eq(companiesTable.id, id));
  if (!co) { res.status(404).json({ error: "الشركة غير موجودة" }); return; }

  const users = await db
    .select({
      id: erpUsersTable.id,
      name: erpUsersTable.name,
      username: erpUsersTable.username,
      email: erpUsersTable.email,
      role: erpUsersTable.role,
      active: erpUsersTable.active,
    })
    .from(erpUsersTable)
    .where(eq(erpUsersTable.company_id, id));

  res.json({ ...co, daysRemaining: daysRemaining(co.end_date), users });
}));

/* ── PUT /super/companies/:id — update plan / expiry / active ── */
router.put("/super/companies/:id", ...superOnly, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { name, plan_type, end_date, is_active } = req.body as {
    name?: string; plan_type?: string; end_date?: string; is_active?: boolean;
  };

  const updates: Partial<typeof companiesTable.$inferInsert> = {};
  if (name      !== undefined) updates.name      = name.trim();
  if (plan_type !== undefined) updates.plan_type = plan_type;
  if (end_date  !== undefined) updates.end_date  = end_date;
  if (is_active !== undefined) updates.is_active = is_active;

  const [updated] = await db
    .update(companiesTable).set(updates)
    .where(eq(companiesTable.id, id)).returning();

  if (!updated) { res.status(404).json({ error: "الشركة غير موجودة" }); return; }
  res.json({ ...updated, daysRemaining: daysRemaining(updated.end_date) });
}));

/* ── POST /super/companies/:id/activate — activate a company ── */
router.post("/super/companies/:id/activate", ...superOnly, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const [updated] = await db
    .update(companiesTable)
    .set({ is_active: true })
    .where(eq(companiesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "الشركة غير موجودة" }); return; }
  res.json({ message: "تم تفعيل الشركة", company: updated });
}));

/* ── POST /super/companies/:id/suspend — suspend a company ── */
router.post("/super/companies/:id/suspend", ...superOnly, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const [updated] = await db
    .update(companiesTable)
    .set({ is_active: false })
    .where(eq(companiesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "الشركة غير موجودة" }); return; }
  res.json({ message: "تم إيقاف الشركة", company: updated });
}));

/* ── POST /super/companies/:id/extend — extend trial / subscription ── */
router.post("/super/companies/:id/extend", ...superOnly, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { days = 7, plan_type } = req.body as { days?: number; plan_type?: string };

  const [co] = await db.select().from(companiesTable).where(eq(companiesTable.id, id));
  if (!co) { res.status(404).json({ error: "الشركة غير موجودة" }); return; }

  const base = new Date(co.end_date) < new Date() ? new Date() : new Date(co.end_date);
  base.setDate(base.getDate() + Number(days));
  const newEndDate = base.toISOString().slice(0, 10);

  const updates: Partial<typeof companiesTable.$inferInsert> = { end_date: newEndDate, is_active: true };
  if (plan_type) updates.plan_type = plan_type;

  const [updated] = await db
    .update(companiesTable).set(updates)
    .where(eq(companiesTable.id, id)).returning();

  res.json({ message: `تم تمديد الاشتراك ${days} يوم`, company: { ...updated, daysRemaining: daysRemaining(newEndDate) } });
}));

/* ── POST /super/companies — create company manually (super only) ── */
router.post("/super/companies", ...superOnly, wrap(async (req, res) => {
  const v = validate(createCompanySchema, req.body);
  if (!v.success) { res.status(400).json({ error: "بيانات غير صحيحة", details: v.errors }); return; }

  const { name, plan_type, duration_days, admin_email } = v.data;
  const today = new Date();
  const end   = new Date(today);
  end.setDate(end.getDate() + (duration_days ?? 30));

  const [co] = await db.insert(companiesTable).values({
    name:        name.trim(),
    plan_type,
    start_date:  today.toISOString().slice(0, 10),
    end_date:    end.toISOString().slice(0, 10),
    is_active:   true,
    admin_email: admin_email ?? null,
  }).returning();

  res.status(201).json(co);
}));

/* ── DELETE /super/companies/:id — delete a company ── */
/* Trial companies: users are deleted too (cascade in app layer).
   Paid/active companies with users require confirmation code + force=true.
   Request body: { confirm_code?: string, expected_code?: string, force?: boolean } */
router.delete("/super/companies/:id", ...superOnly, wrap(async (req, res) => {
  const id = Number(req.params.id);

  const [co] = await db.select().from(companiesTable).where(eq(companiesTable.id, id));
  if (!co) { res.status(404).json({ error: "الشركة غير موجودة" }); return; }

  const usersInCompany = await db
    .select({ id: erpUsersTable.id })
    .from(erpUsersTable)
    .where(eq(erpUsersTable.company_id, id));

  const { confirm_code, expected_code, force } = req.body as {
    confirm_code?: string; expected_code?: string; force?: boolean;
  };

  if (usersInCompany.length > 0) {
    const isTrial = co.plan_type === "trial";
    if (!force) {
      res.status(400).json({
        error: "يوجد مستخدمون مرتبطون بهذه الشركة",
        has_users: true,
        user_count: usersInCompany.length,
        is_trial: isTrial,
      });
      return;
    }
    if (!confirm_code || !expected_code || confirm_code.trim() !== expected_code.trim()) {
      res.status(400).json({ error: "كود التأكيد غير صحيح" });
      return;
    }
    await db.delete(erpUsersTable).where(eq(erpUsersTable.company_id, id));
  }

  await db.delete(companiesTable).where(eq(companiesTable.id, id));
  res.json({ message: "تم حذف الشركة وجميع مستخدميها بنجاح" });
}));

/* ── GET /super/stats — overall stats ── */
router.get("/super/stats", ...superOnly, wrap(async (_req, res) => {
  const companies = await db.select().from(companiesTable);
  const users = await db.select({ id: erpUsersTable.id }).from(erpUsersTable);

  const now = new Date().toISOString().slice(0, 10);
  const stats = {
    total: companies.length,
    active: companies.filter(c => c.is_active && c.end_date >= now).length,
    trial:  companies.filter(c => c.plan_type === "trial" && c.is_active && c.end_date >= now).length,
    expired: companies.filter(c => c.end_date < now).length,
    suspended: companies.filter(c => !c.is_active).length,
    totalUsers: users.length,
  };

  res.json(stats);
}));

/* ══════════════════════════════════════════════
   Super-Admin Manager Endpoints
   /api/super/managers — CRUD for super_admin users
   ══════════════════════════════════════════════ */

/* ── GET /super/managers — list all super_admin accounts ── */
router.get("/super/managers", ...superOnly, wrap(async (_req, res) => {
  const managers = await db
    .select({
      id: erpUsersTable.id,
      name: erpUsersTable.name,
      username: erpUsersTable.username,
      email: erpUsersTable.email,
      active: erpUsersTable.active,
      last_login: erpUsersTable.last_login,
      created_at: erpUsersTable.created_at,
    })
    .from(erpUsersTable)
    .where(eq(erpUsersTable.role, "super_admin"))
    .orderBy(desc(erpUsersTable.created_at));
  res.json(managers);
}));

/* ── POST /super/managers — create new super_admin ── */
router.post("/super/managers", ...superOnly, wrap(async (req, res) => {
  const { name, username, pin } = req.body as { name?: string; username?: string; pin?: string };

  if (!name?.trim())     { res.status(400).json({ error: "الاسم الكامل مطلوب" }); return; }
  if (!username?.trim()) { res.status(400).json({ error: "اسم المستخدم مطلوب" }); return; }
  if (/\s/.test(username)) { res.status(400).json({ error: "اسم المستخدم لا يجب أن يحتوي على مسافات" }); return; }
  if (!pin || pin.length < 4) { res.status(400).json({ error: "الرقم السري يجب أن يكون 4 أحرف على الأقل" }); return; }

  const [existing] = await db
    .select({ id: erpUsersTable.id })
    .from(erpUsersTable)
    .where(sql`LOWER(${erpUsersTable.username}) = ${username.trim().toLowerCase()}`);
  if (existing) { res.status(400).json({ error: "اسم المستخدم مستخدم بالفعل" }); return; }

  const hashedPin = await hashPin(pin);
  const [created] = await db.insert(erpUsersTable).values({
    name: name.trim(),
    username: username.trim().toLowerCase(),
    pin: hashedPin,
    role: "super_admin",
    active: true,
    company_id: null,
  }).returning({
    id: erpUsersTable.id, name: erpUsersTable.name,
    username: erpUsersTable.username, active: erpUsersTable.active,
    last_login: erpUsersTable.last_login, created_at: erpUsersTable.created_at,
  });
  res.status(201).json(created);
}));

/* ── PATCH /super/managers/:id — update name/username/pin ── */
router.patch("/super/managers/:id", ...superOnly, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { name, username, pin } = req.body as { name?: string; username?: string; pin?: string };

  const [manager] = await db.select().from(erpUsersTable).where(eq(erpUsersTable.id, id));
  if (!manager || manager.role !== "super_admin") { res.status(404).json({ error: "المدير غير موجود" }); return; }

  if (username?.trim() && /\s/.test(username)) {
    res.status(400).json({ error: "اسم المستخدم لا يجب أن يحتوي على مسافات" }); return;
  }
  if (username?.trim() && username.trim().toLowerCase() !== manager.username.toLowerCase()) {
    const [dup] = await db.select({ id: erpUsersTable.id }).from(erpUsersTable)
      .where(sql`LOWER(${erpUsersTable.username}) = ${username.trim().toLowerCase()}`);
    if (dup) { res.status(400).json({ error: "اسم المستخدم مستخدم بالفعل" }); return; }
  }

  const updates: Partial<typeof erpUsersTable.$inferInsert> = {};
  if (name?.trim())       updates.name     = name.trim();
  if (username?.trim())   updates.username = username.trim().toLowerCase();
  if (pin && pin.length >= 4) updates.pin  = await hashPin(pin);

  const [updated] = await db.update(erpUsersTable).set(updates)
    .where(eq(erpUsersTable.id, id)).returning({
      id: erpUsersTable.id, name: erpUsersTable.name,
      username: erpUsersTable.username, active: erpUsersTable.active,
      last_login: erpUsersTable.last_login, created_at: erpUsersTable.created_at,
    });
  res.json(updated);
}));

/* ── PATCH /super/managers/:id/toggle — toggle active status ── */
router.patch("/super/managers/:id/toggle", ...superOnly, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user!.id) { res.status(400).json({ error: "لا يمكن إيقاف حسابك الحالي" }); return; }

  const [manager] = await db.select().from(erpUsersTable).where(eq(erpUsersTable.id, id));
  if (!manager || manager.role !== "super_admin") { res.status(404).json({ error: "المدير غير موجود" }); return; }

  const [updated] = await db.update(erpUsersTable)
    .set({ active: !manager.active })
    .where(eq(erpUsersTable.id, id))
    .returning({ id: erpUsersTable.id, active: erpUsersTable.active });
  res.json(updated);
}));

/* ── DELETE /super/managers/:id — remove a super_admin ── */
router.delete("/super/managers/:id", ...superOnly, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user!.id) { res.status(400).json({ error: "لا يمكن حذف حسابك الحالي" }); return; }

  const allManagers = await db
    .select({ id: erpUsersTable.id })
    .from(erpUsersTable)
    .where(eq(erpUsersTable.role, "super_admin"));
  if (allManagers.length <= 1) {
    res.status(400).json({ error: "يجب أن يكون هناك مدير عام واحد على الأقل" }); return;
  }

  const [manager] = await db.select({ id: erpUsersTable.id })
    .from(erpUsersTable).where(eq(erpUsersTable.id, id));
  if (!manager) { res.status(404).json({ error: "المدير غير موجود" }); return; }

  await db.delete(erpUsersTable).where(eq(erpUsersTable.id, id));
  res.json({ message: "تم حذف المدير بنجاح" });
}));

/* ── POST /super/backup/create — trigger pg_dump backup ── */
router.post("/super/backup/create", ...superOnly, wrap(async (_req, res) => {
  const filepath = await createDatabaseBackup();
  const stats    = fs.statSync(filepath);
  res.json({
    success:    true,
    message:    "تم إنشاء النسخة الاحتياطية بنجاح",
    filename:   filepath.split("/").pop(),
    size_mb:    (stats.size / 1024 / 1024).toFixed(2),
    created_at: new Date().toISOString(),
  });
}));

/* ── GET /super/backup/list — list available backups ── */
router.get("/super/backup/list", ...superOnly, wrap(async (_req, res) => {
  const backups = listBackups();
  res.json({ backups, total: backups.length });
}));

export default router;
