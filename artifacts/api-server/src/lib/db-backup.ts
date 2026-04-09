/**
 * db-backup.ts — pg_dump → gzip database backup utility.
 * Creates daily compressed SQL backups in BACKUP_DIR.
 */
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { logger } from "./logger";

const execAsync = promisify(exec);

const BACKUP_DIR  = process.env.BACKUP_DIR ?? "/root/db-backups";
const MAX_BACKUPS = 30;

export async function createDatabaseBackup(): Promise<string> {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename  = `backup-${timestamp}.sql.gz`;
  const filepath  = path.join(BACKUP_DIR, filename);

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");

  const url = new URL(dbUrl);

  const command = [
    `PGPASSWORD="${url.password}"`,
    "pg_dump",
    `-h ${url.hostname}`,
    `-p ${url.port || 5432}`,
    `-U ${url.username}`,
    `-d ${url.pathname.slice(1)}`,
    "--no-owner",
    "--no-acl",
    `| gzip > "${filepath}"`,
  ].join(" ");

  await execAsync(command);
  const size = fs.statSync(filepath).size;
  logger.info({ filepath, size }, "Database backup created");

  await cleanOldBackups();
  return filepath;
}

async function cleanOldBackups(): Promise<void> {
  if (!fs.existsSync(BACKUP_DIR)) return;
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith("backup-") && f.endsWith(".sql.gz"))
    .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime() }))
    .sort((a, b) => b.time - a.time);

  for (const file of files.slice(MAX_BACKUPS)) {
    fs.unlinkSync(path.join(BACKUP_DIR, file.name));
    logger.info({ file: file.name }, "Old backup deleted");
  }
}

export function listBackups(): Array<{ filename: string; size_mb: string; created_at: string }> {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith("backup-") && f.endsWith(".sql.gz"))
    .map(f => {
      const stats = fs.statSync(path.join(BACKUP_DIR, f));
      return {
        filename:   f,
        size_mb:    (stats.size / 1024 / 1024).toFixed(2),
        created_at: stats.mtime.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function startDbBackupScheduler(): void {
  const scheduleNext = () => {
    const now    = new Date();
    const next3am = new Date();
    next3am.setHours(3, 0, 0, 0);
    if (next3am <= now) next3am.setDate(next3am.getDate() + 1);

    const ms = next3am.getTime() - now.getTime();
    setTimeout(async () => {
      try {
        await createDatabaseBackup();
        logger.info("Scheduled database backup completed");
      } catch (err) {
        logger.error({ err }, "Scheduled database backup failed");
      }
      scheduleNext();
    }, ms);

    logger.info({ nextBackup: next3am.toISOString() }, "Next database backup scheduled");
  };

  scheduleNext();
  logger.info("Database backup scheduler started");
}
