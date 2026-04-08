/**
 * /api/super/* — Super-admin panel for managing all SaaS companies.
 * Only accessible to users with role = "super_admin".
 * Super-admin users have no company_id (null) so subscription checks are bypassed.
 */
import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, companiesTable, erpUsersTable } from "@workspace/db";
import { authenticate, requireRole } from "../middleware/auth";
import { wrap } from "../lib/async-handler";

const router = Router();

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
  const { name, plan_type = "trial", days = 7 } = req.body as {
    name?: string; plan_type?: string; days?: number;
  };
  if (!name?.trim()) { res.status(400).json({ error: "اسم الشركة مطلوب" }); return; }

  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + Number(days));

  const [co] = await db.insert(companiesTable).values({
    name: name.trim(),
    plan_type,
    start_date: today.toISOString().slice(0, 10),
    end_date: end.toISOString().slice(0, 10),
    is_active: true,
  }).returning();

  res.status(201).json(co);
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

export default router;
