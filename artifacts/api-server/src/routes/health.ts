import { Router, type IRouter } from "express";
import { checkHealth } from "../lib/monitor";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  try {
    const health = await checkHealth();
    const code   = health.status === "unhealthy" ? 503 : 200;
    res.status(code).json(health);
  } catch {
    res.status(503).json({
      status:     "unhealthy",
      error:      "Health check failed",
      last_check: new Date().toISOString(),
    });
  }
});

export default router;
