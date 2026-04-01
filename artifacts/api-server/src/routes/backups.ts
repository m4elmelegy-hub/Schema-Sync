/**
 * /api/backups  — list, download, delete server-side backups
 */

import { Router, type IRouter } from "express";
import fs from "node:fs";
import path from "node:path";
import { db, backupsTable, systemSettingsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { authenticate, requireRole } from "../middleware/auth";
import { wrap, httpError } from "../lib/async-handler";
import { triggerBackup, isBackupInProgress, BACKUP_DIR } from "../lib/backup-service";

const router: IRouter = Router();

/* ── GET /api/backups/settings ── get schedule + destination ──── */
router.get("/backups/settings", authenticate, requireRole("admin"), wrap(async (_req, res) => {
  const [schedRow] = await db.select().from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, "backup_schedule"));
  const [destRow] = await db.select().from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, "backup_destination"));
  const [lastRow] = await db.select().from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, "backup_last_scheduled"));

  res.json({
    schedule:       schedRow?.value ?? "none",
    destination:    destRow?.value  ?? "local",
    last_scheduled: lastRow?.value  ?? null,
  });
}));

/* ── PUT /api/backups/settings ── save schedule + destination ─── */
router.put("/backups/settings", authenticate, requireRole("admin"), wrap(async (req, res) => {
  const { schedule, destination } = req.body as { schedule?: string; destination?: string };

  const validSchedules    = ["none", "daily", "weekly", "monthly"];
  const validDestinations = ["local", "server"];

  if (schedule !== undefined && !validSchedules.includes(schedule)) {
    throw httpError(400, `جدول غير صالح: ${schedule}`);
  }
  if (destination !== undefined && !validDestinations.includes(destination)) {
    throw httpError(400, `وجهة غير صالحة: ${destination}`);
  }

  const upsert = async (key: string, value: string) => {
    await db.insert(systemSettingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value, updated_at: new Date() } });
  };

  if (schedule    !== undefined) await upsert("backup_schedule",    schedule);
  if (destination !== undefined) await upsert("backup_destination", destination);

  res.json({ success: true });
}));

/* ── GET /api/backups ── list all ─────────────────────────────── */
router.get("/backups", authenticate, requireRole("admin"), wrap(async (_req, res) => {
  const list = await db.select().from(backupsTable).orderBy(desc(backupsTable.created_at));
  res.json(list);
}));

/* ── POST /api/backups ── trigger manual server backup ─────────── */
router.post("/backups", authenticate, requireRole("admin"), wrap(async (_req, res) => {
  if (isBackupInProgress()) {
    res.status(409).json({ error: "جارٍ تنفيذ نسخة احتياطية حالياً، انتظر قليلاً" });
    return;
  }
  const record = await triggerBackup("manual");
  if (!record) {
    res.status(500).json({ error: "فشل إنشاء النسخة الاحتياطية" });
    return;
  }
  res.status(201).json(record);
}));

/* ── GET /api/backups/:id/download ─────────────────────────────── */
router.get("/backups/:id/download", authenticate, requireRole("admin"), wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) throw httpError(400, "معرّف غير صحيح");

  const [record] = await db.select().from(backupsTable).where(eq(backupsTable.id, id));
  if (!record) throw httpError(404, "النسخة الاحتياطية غير موجودة");

  const filepath = path.join(BACKUP_DIR, record.filename);
  if (!fs.existsSync(filepath)) {
    throw httpError(404, "الملف غير موجود على الخادم");
  }

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${record.filename}"`);
  res.sendFile(filepath);
}));

/* ── DELETE /api/backups/:id ─────────────────────────────────── */
router.delete("/backups/:id", authenticate, requireRole("admin"), wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) throw httpError(400, "معرّف غير صحيح");

  const [record] = await db.select().from(backupsTable).where(eq(backupsTable.id, id));
  if (!record) throw httpError(404, "النسخة الاحتياطية غير موجودة");

  /* Delete file if it exists */
  const filepath = path.join(BACKUP_DIR, record.filename);
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
  }

  await db.delete(backupsTable).where(eq(backupsTable.id, id));

  res.json({ success: true, message: "تم حذف النسخة الاحتياطية" });
}));

export default router;
