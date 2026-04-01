import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, alertsTable } from "@workspace/db";
import { runAllChecks } from "../lib/alert-service";

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

/* GET /alerts/unread-count */
router.get("/alerts/unread-count", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(alertsTable)
      .where(eq(alertsTable.is_read, false));
    res.json({ count: rows.length });
  } catch {
    res.json({ count: 0 });
  }
});

/* POST /alerts/run-checks — trigger all checks on demand */
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
