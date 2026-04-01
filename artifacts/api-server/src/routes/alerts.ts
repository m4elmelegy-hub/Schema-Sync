import { Router } from "express";
import { eq, desc, isNull, sql, or } from "drizzle-orm";
import { db, alertsTable, systemSettingsTable } from "@workspace/db";
import { runDailyChecks, runAllChecks, resolveAlert } from "../lib/alert-service";

const router = Router();

/* ── Role-based visibility filter ──────────────────────────────
   Returns true if the alert is visible to the given role:
   - role_target IS NULL  → visible to all
   - role_target contains the user's role → visible          */
function isVisibleTo(roleTarget: string | null, userRole: string): boolean {
  if (!roleTarget) return true;
  return roleTarget.split(",").map(r => r.trim()).includes(userRole);
}

/* GET /alerts — role-filtered, resolved hidden by default ───── */
router.get("/alerts", async (req, res) => {
  try {
    const userRole = req.user?.role ?? "cashier";
    const includeResolved = req.query.include_resolved === "true";

    const rows = await db
      .select()
      .from(alertsTable)
      .orderBy(desc(alertsTable.created_at))
      .limit(200);

    const visible = rows.filter(a => {
      if (!isVisibleTo(a.role_target, userRole)) return false;
      if (!includeResolved && a.is_resolved) return false;
      return true;
    });

    res.json(visible);
  } catch (err) {
    console.error("alerts GET error:", err);
    res.status(500).json({ error: "فشل تحميل التنبيهات" });
  }
});

/* GET /alerts/settings */
router.get("/alerts/settings", async (_req, res) => {
  try {
    const rows = await db.select().from(systemSettingsTable)
      .where(sql`key IN ('enable_event_alerts','enable_daily_alerts')`);
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
    res.json({
      enable_event_alerts: map["enable_event_alerts"] !== "false",
      enable_daily_alerts: map["enable_daily_alerts"] !== "false",
    });
  } catch {
    res.json({ enable_event_alerts: true, enable_daily_alerts: true });
  }
});

/* POST /alerts/settings */
router.post("/alerts/settings", async (req, res) => {
  try {
    const body = req.body as Record<string, boolean>;

    async function upsertSetting(key: string, value: string) {
      const existing = await db.select({ key: systemSettingsTable.key })
        .from(systemSettingsTable).where(eq(systemSettingsTable.key, key)).limit(1);
      if (existing.length > 0) {
        await db.update(systemSettingsTable).set({ value, updated_at: new Date() }).where(eq(systemSettingsTable.key, key));
      } else {
        await db.insert(systemSettingsTable).values({ key, value });
      }
    }

    if (body.enable_event_alerts !== undefined) await upsertSetting("enable_event_alerts", String(body.enable_event_alerts));
    if (body.enable_daily_alerts !== undefined) await upsertSetting("enable_daily_alerts", String(body.enable_daily_alerts));
    res.json({ ok: true });
  } catch (err) {
    console.error("alerts settings error:", err);
    res.status(500).json({ error: "فشل حفظ الإعدادات" });
  }
});

/* POST /alerts/daily-check — once-per-day full scan */
router.post("/alerts/daily-check", async (_req, res) => {
  try {
    await runDailyChecks();
    res.json({ ok: true, message: "تم تشغيل الفحص اليومي" });
  } catch (err) {
    console.error("alerts daily-check error:", err);
    res.status(500).json({ error: "فشل الفحص اليومي" });
  }
});

/* POST /alerts/run-checks — manual full check (bypasses daily gate) */
router.post("/alerts/run-checks", async (_req, res) => {
  try {
    await runAllChecks();
    res.json({ ok: true, message: "تم تشغيل الفحوصات بنجاح" });
  } catch (err) {
    console.error("alerts run-checks error:", err);
    res.status(500).json({ error: "فشل تشغيل الفحوصات" });
  }
});

/* POST /alerts/resolve/:id — manual resolve */
router.post("/alerts/resolve/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const userId = req.user?.id ?? 0;
    await resolveAlert(id, userId);
    res.json({ ok: true });
  } catch (err) {
    console.error("alerts resolve error:", err);
    res.status(500).json({ error: "فشل حل التنبيه" });
  }
});

/* POST /alerts/mark-read/:id */
router.post("/alerts/mark-read/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.update(alertsTable).set({ is_read: true }).where(eq(alertsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error("alerts mark-read error:", err);
    res.status(500).json({ error: "فشل تحديث التنبيه" });
  }
});

/* POST /alerts/mark-all-read */
router.post("/alerts/mark-all-read", async (_req, res) => {
  try {
    await db.update(alertsTable)
      .set({ is_read: true })
      .where(eq(alertsTable.is_read, false));
    res.json({ ok: true });
  } catch (err) {
    console.error("alerts mark-all-read error:", err);
    res.status(500).json({ error: "فشل تحديث التنبيهات" });
  }
});

export default router;
