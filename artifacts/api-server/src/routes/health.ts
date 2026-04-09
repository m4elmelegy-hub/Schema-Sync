import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    const dbLatency = Date.now() - start;
    const mem = process.memoryUsage();
    res.json({
      status:    "healthy",
      timestamp: new Date().toISOString(),
      uptime:    Math.floor(process.uptime()),
      database: {
        status:     "connected",
        latency_ms: dbLatency,
      },
      memory: {
        used_mb:  Math.round(mem.heapUsed  / 1024 / 1024),
        total_mb: Math.round(mem.heapTotal / 1024 / 1024),
        rss_mb:   Math.round(mem.rss       / 1024 / 1024),
      },
      version: process.env.npm_package_version ?? "1.0.0",
    });
  } catch {
    res.status(503).json({
      status:    "unhealthy",
      timestamp: new Date().toISOString(),
      database:  { status: "disconnected" },
      error:     "Database connection failed",
    });
  }
});

export default router;
