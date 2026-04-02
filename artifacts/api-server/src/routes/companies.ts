/**
 * /api/companies — SaaS company / subscription management.
 * Admin-only CRUD + a public subscription-status endpoint for the frontend banner.
 */
import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, companiesTable, erpUsersTable } from "@workspace/db";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();

const adminOnly = [authenticate, requireRole("admin")];

/* ─── helpers ─────────────────────────────────────────────── */
function daysRemaining(endDate: string): number {
  const now  = new Date();
  now.setHours(0, 0, 0, 0);
  const end  = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function subscriptionStatus(company: { end_date: string; is_active: boolean }) {
  if (!company.is_active) return { valid: false, reason: "الاشتراك معطل من قِبَل المدير" };
  const days = daysRemaining(company.end_date);
  if (days < 0) return { valid: false, reason: "انتهت صلاحية الاشتراك" };
  return { valid: true, daysRemaining: days };
}

const PLAN_LABELS: Record<string, string> = {
  trial: "تجريبي",
  basic: "أساسي",
  pro:   "احترافي",
};

/* ═══════════════════════════════════════════════════════════
   PUBLIC — subscription status for the logged-in user's company
═══════════════════════════════════════════════════════════ */
router.get("/subscription/status", authenticate, async (req, res) => {
  try {
    const [user] = await db
      .select()
      .from(erpUsersTable)
      .where(eq(erpUsersTable.id, req.user!.id));

    if (!user?.company_id) {
      res.json({ hasSubscription: false });
      return;
    }

    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, user.company_id));

    if (!company) {
      res.json({ hasSubscription: false });
      return;
    }

    const status = subscriptionStatus(company);

    res.json({
      hasSubscription: true,
      companyName: company.name,
      planType: company.plan_type,
      planLabel: PLAN_LABELS[company.plan_type] ?? company.plan_type,
      endDate: company.end_date,
      daysRemaining: daysRemaining(company.end_date),
      isActive: company.is_active,
      valid: status.valid,
      reason: !status.valid ? status.reason : undefined,
    });
  } catch {
    res.status(500).json({ error: "فشل جلب حالة الاشتراك" });
  }
});

/* ═══════════════════════════════════════════════════════════
   ADMIN — List all companies
═══════════════════════════════════════════════════════════ */
router.get("/companies", ...adminOnly, async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(companiesTable)
      .orderBy(companiesTable.id);

    res.json(rows.map((c) => ({
      ...c,
      daysRemaining: daysRemaining(c.end_date),
      status: subscriptionStatus(c),
    })));
  } catch {
    res.status(500).json({ error: "فشل جلب الشركات" });
  }
});

/* ═══════════════════════════════════════════════════════════
   ADMIN — Get single company
═══════════════════════════════════════════════════════════ */
router.get("/companies/:id", ...adminOnly, async (req, res) => {
  try {
    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, Number(req.params.id)));

    if (!company) { res.status(404).json({ error: "الشركة غير موجودة" }); return; }

    res.json({
      ...company,
      daysRemaining: daysRemaining(company.end_date),
      status: subscriptionStatus(company),
    });
  } catch {
    res.status(500).json({ error: "فشل جلب الشركة" });
  }
});

/* ═══════════════════════════════════════════════════════════
   ADMIN — Create company
═══════════════════════════════════════════════════════════ */
router.post("/companies", ...adminOnly, async (req, res) => {
  try {
    const { name, plan_type = "trial", start_date, end_date, is_active = true } = req.body as {
      name?: string;
      plan_type?: string;
      start_date?: string;
      end_date?: string;
      is_active?: boolean;
    };

    if (!name?.trim())   { res.status(400).json({ error: "اسم الشركة مطلوب" }); return; }
    if (!start_date)     { res.status(400).json({ error: "تاريخ البداية مطلوب" }); return; }
    if (!end_date)       { res.status(400).json({ error: "تاريخ الانتهاء مطلوب" }); return; }
    if (!["trial","basic","pro"].includes(plan_type)) {
      res.status(400).json({ error: "نوع الخطة يجب أن يكون: trial أو basic أو pro" });
      return;
    }

    const [created] = await db
      .insert(companiesTable)
      .values({ name: name.trim(), plan_type, start_date, end_date, is_active })
      .returning();

    res.status(201).json(created);
  } catch {
    res.status(500).json({ error: "فشل إنشاء الشركة" });
  }
});

/* ═══════════════════════════════════════════════════════════
   ADMIN — Update company (plan / expiry / active)
═══════════════════════════════════════════════════════════ */
router.put("/companies/:id", ...adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, plan_type, end_date, is_active } = req.body as {
      name?: string;
      plan_type?: string;
      end_date?: string;
      is_active?: boolean;
    };

    const updates: Partial<typeof companiesTable.$inferInsert> = {};
    if (name      !== undefined) updates.name      = name.trim();
    if (plan_type !== undefined) updates.plan_type = plan_type;
    if (end_date  !== undefined) updates.end_date  = end_date;
    if (is_active !== undefined) updates.is_active = is_active;

    const [updated] = await db
      .update(companiesTable)
      .set(updates)
      .where(eq(companiesTable.id, id))
      .returning();

    if (!updated) { res.status(404).json({ error: "الشركة غير موجودة" }); return; }
    res.json(updated);
  } catch {
    res.status(500).json({ error: "فشل تحديث الشركة" });
  }
});

/* ═══════════════════════════════════════════════════════════
   ADMIN — Assign user to company
═══════════════════════════════════════════════════════════ */
router.put("/companies/:id/assign-user/:userId", ...adminOnly, async (req, res) => {
  try {
    const companyId = Number(req.params.id);
    const userId    = Number(req.params.userId);

    const [updated] = await db
      .update(erpUsersTable)
      .set({ company_id: companyId })
      .where(eq(erpUsersTable.id, userId))
      .returning({ id: erpUsersTable.id, name: erpUsersTable.name, company_id: erpUsersTable.company_id });

    if (!updated) { res.status(404).json({ error: "المستخدم غير موجود" }); return; }
    res.json(updated);
  } catch {
    res.status(500).json({ error: "فشل تعيين المستخدم" });
  }
});

/* ═══════════════════════════════════════════════════════════
   ADMIN — Remove company (soft: deactivate)
═══════════════════════════════════════════════════════════ */
router.delete("/companies/:id", ...adminOnly, async (req, res) => {
  try {
    const [deactivated] = await db
      .update(companiesTable)
      .set({ is_active: false })
      .where(eq(companiesTable.id, Number(req.params.id)))
      .returning();

    if (!deactivated) { res.status(404).json({ error: "الشركة غير موجودة" }); return; }
    res.json({ message: "تم تعطيل الشركة", company: deactivated });
  } catch {
    res.status(500).json({ error: "فشل تعطيل الشركة" });
  }
});

export default router;
