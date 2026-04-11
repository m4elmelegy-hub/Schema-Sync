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

/* الـ company_id المستخدم لإعدادات النسخ الاحتياطي — إعدادات النظام العامة */
const BACKUP_COMPANY_ID = 1;

/* أداة upsert صحيحة باستخدام compound unique (key, company_id) */
async function upsertBackupSetting(key: string, value: string) {
  await db.insert(systemSettingsTable)
    .values({ key, value, company_id: BACKUP_COMPANY_ID })
    .onConflictDoUpdate({
      target: [systemSettingsTable.key, systemSettingsTable.company_id],
      set: { value, updated_at: new Date() },
    });
}

async function getBackupSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, key));
  return row?.value ?? null;
}

/* ── GET /api/backups/settings ── ────────────────────────────── */
router.get("/backups/settings", authenticate, requireRole("admin"), wrap(async (_req, res) => {
  const [schedRow, destRow, lastRow, onLoginRow, onLogoutRow] = await Promise.all([
    db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, "backup_schedule")).then(r => r[0]),
    db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, "backup_destination")).then(r => r[0]),
    db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, "backup_last_scheduled")).then(r => r[0]),
    db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, "backup_on_login")).then(r => r[0]),
    db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, "backup_on_logout")).then(r => r[0]),
  ]);

  res.json({
    schedule:       schedRow?.value    ?? "none",
    destination:    destRow?.value     ?? "local",
    last_scheduled: lastRow?.value     ?? null,
    on_login:       onLoginRow?.value  === "true",
    on_logout:      onLogoutRow?.value === "true",
  });
}));

/* ── PUT /api/backups/settings ── ────────────────────────────── */
router.put("/backups/settings", authenticate, requireRole("admin"), wrap(async (req, res) => {
  const { schedule, destination, on_login, on_logout } = req.body as {
    schedule?:    string;
    destination?: string;
    on_login?:    boolean;
    on_logout?:   boolean;
  };

  const validSchedules    = ["none", "daily", "weekly", "monthly"];
  const validDestinations = ["local", "server"];

  if (schedule    !== undefined && !validSchedules.includes(schedule))       throw httpError(400, `جدول غير صالح: ${schedule}`);
  if (destination !== undefined && !validDestinations.includes(destination)) throw httpError(400, `وجهة غير صالحة: ${destination}`);

  await Promise.all([
    schedule    !== undefined ? upsertBackupSetting("backup_schedule",    schedule)              : Promise.resolve(),
    destination !== undefined ? upsertBackupSetting("backup_destination", destination)            : Promise.resolve(),
    on_login    !== undefined ? upsertBackupSetting("backup_on_login",    on_login  ? "true" : "false") : Promise.resolve(),
    on_logout   !== undefined ? upsertBackupSetting("backup_on_logout",   on_logout ? "true" : "false") : Promise.resolve(),
  ]);

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
  if (!record) { res.status(500).json({ error: "فشل إنشاء النسخة الاحتياطية" }); return; }
  res.status(201).json(record);
}));

/* ── GET /api/backups/:id/download ─────────────────────────────── */
router.get("/backups/:id/download", authenticate, requireRole("admin"), wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) throw httpError(400, "معرّف غير صحيح");

  const [record] = await db.select().from(backupsTable).where(eq(backupsTable.id, id));
  if (!record) throw httpError(404, "النسخة الاحتياطية غير موجودة");

  const filepath = path.join(BACKUP_DIR, record.filename);
  if (!fs.existsSync(filepath)) throw httpError(404, "الملف غير موجود على الخادم");

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

  const filepath = path.join(BACKUP_DIR, record.filename);
  if (fs.existsSync(filepath)) fs.unlinkSync(filepath);

  await db.delete(backupsTable).where(eq(backupsTable.id, id));
  res.json({ success: true, message: "تم حذف النسخة الاحتياطية" });
}));

/* ── مساعدة خارجية: فحص إعداد النسخ عند الدخول/الخروج ─────────── */
export async function isBackupOnLoginEnabled():  Promise<boolean> {
  const v = await getBackupSetting("backup_on_login");  return v === "true";
}
export async function isBackupOnLogoutEnabled(): Promise<boolean> {
  const v = await getBackupSetting("backup_on_logout"); return v === "true";
}

export default router;
