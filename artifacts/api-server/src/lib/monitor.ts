/**
 * monitor.ts — lightweight health monitoring with state-change logging.
 * Runs a DB ping every 60 seconds; logs on status transitions.
 */
import { logger } from "./logger";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export interface HealthStatus {
  status:       "healthy" | "degraded" | "unhealthy";
  db:           boolean;
  memory_mb:    number;
  uptime_hours: number;
  last_check:   string;
}

let lastStatus: HealthStatus | null = null;

export async function checkHealth(): Promise<HealthStatus> {
  const mem         = process.memoryUsage();
  const memUsed     = Math.round(mem.heapUsed / 1024 / 1024);
  const uptimeHours = Math.round(process.uptime() / 3600 * 10) / 10;

  let dbOk = false;
  try {
    await db.execute(sql`SELECT 1`);
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const overallStatus: HealthStatus["status"] =
    !dbOk        ? "unhealthy" :
    memUsed > 400 ? "degraded"  :
                    "healthy";

  const status: HealthStatus = {
    status:       overallStatus,
    db:           dbOk,
    memory_mb:    memUsed,
    uptime_hours: uptimeHours,
    last_check:   new Date().toISOString(),
  };

  /* Log on state transition only */
  if (!lastStatus || lastStatus.status !== status.status) {
    if (status.status !== "healthy") {
      logger.error({ status }, "HEALTH CHECK DEGRADED/UNHEALTHY");
    } else if (lastStatus?.status && lastStatus.status !== "healthy") {
      logger.info({ status }, "Service recovered to healthy state");
    }
  }

  lastStatus = status;
  return status;
}

export function startMonitoring(): void {
  setInterval(async () => {
    try {
      await checkHealth();
    } catch (err) {
      logger.error({ err }, "Monitor check error");
    }
  }, 60_000);

  logger.info("Health monitoring started (every 60s)");
}
