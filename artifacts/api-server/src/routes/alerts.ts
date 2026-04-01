import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, alertsTable, systemSettingsTable } from "@workspace/db";
import { runDailyChecks, runAllChecks } from "../lib/alert-service";

const router = Router();

/* GET /alerts — list all alerts, newest first */
router.get("/alerts", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(alertsTable)
      .orderBy(desc(alertsTable.created_at))
      .limit(100);
    res.json(rows);
  } catch (err) {
    console.error("alerts GET error:", err);
    res.status(500).json({ error: "فشل تحميل التنبيهات" });
  }
});

/* GET /alerts/settings — return enable_event_alerts / enable_daily_alerts */
router.get("/alerts/settings", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "enable_event_alerts"));
    const rows2 = await db
      .select()
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "enable_daily_alerts"));
    res.json({
      enable_event_alerts: rows[0]?.value !== "false",
      enable_daily_alerts: rows2[0]?.value !== "false",
    });
  } catch {
    res.json({ enable_event_alerts: true, enable_daily_alerts: true });
  }
});

/* POST /alerts/settings — update enable_event_alerts / enable_daily_alerts */
router.post("/alerts/settings", async (req, res) => {
  try {
    const { enable_event_alerts, enable_daily_alerts } = req.body as Record<string, boolean>;

    async function upsertSetting(key: string, value: string) {
      const existing = await db.select({ key: systemSettingsTable.key }).from(systemSettingsTable).where(eq(systemSettingsTable.key, key)).limit(1);
      if (existing.length > 0) {
        await db.update(systemSettingsTable).set({ value, updated_at: new Date() }).where(eq(systemSettingsTable.key, key));
      } else {
        await db.insert(systemSettingsTable).values({ key, value });
      }
    }

    if (enable_event_alerts !== undefined) await upsertSetting("enable_event_alerts", String(enable_event_alerts));
    if (enable_daily_alerts !== undefined) await upsertSetting("enable_daily_alerts", String(enable_daily_alerts));
    res.json({ ok: true });
  } catch (err) {
    console.error("alerts settings error:", err);
    res.status(500).json({ error: "فشل حفظ الإعدادات" });
  }
});

/* POST /alerts/daily-check — run full daily scan (called on login / first dashboard load).
   The alert service's upsertAlert handles deduplication internally using last_triggered_date. */
router.post("/alerts/daily-check", async (_req, res) => {
  try {
    await runDailyChecks();
    res.json({ ok: true, message: "تم تشغيل الفحص اليومي" });
  } catch (err) {
    console.error("alerts daily-check error:", err);
    res.status(500).json({ error: "فشل الفحص اليومي" });
  }
});

/* POST /alerts/run-checks — manual full check (bypasses daily gate, useful for admin) */
router.post("/alerts/run-checks", async (_req, res) => {
  try {
    await runAllChecks();
    res.json({ ok: true, message: "تم تشغيل الفحوصات بنجاح" });
  } catch (err) {
    console.error("alerts run-checks error:", err);
    res.status(500).json({ error: "فشل تشغيل الفحوصات" });
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
    await db.update(alertsTable).set({ is_read: true }).where(eq(alertsTable.is_read, false));
    res.json({ ok: true });
  } catch (err) {
    console.error("alerts mark-all-read error:", err);
    res.status(500).json({ error: "فشل تحديث التنبيهات" });
  }
});

export default router;
