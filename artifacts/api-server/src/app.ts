import express, { type Express, type ErrorRequestHandler } from "express";
import compression from "compression";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

/* ── Trust proxy (Replit runs behind a reverse proxy) ───────── */
app.set("trust proxy", 1);

/* ── Security headers ──────────────────────────────────────── */
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true },
    frameguard: { action: "deny" },
    noSniff: true,
  }),
);

/* ── CORS — allow same-origin / configured domain only ────── */
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [];

app.use(
  cors({
    origin: (origin, cb) => {
      /* allow server-to-server (no Origin header) or whitelisted origins */
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        cb(null, false);
      }
    },
    credentials: true,
  }),
);

/* ── General rate limiter: 100 req/min per IP ─────────────── */
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "تجاوزت حد الطلبات، حاول مجدداً بعد دقيقة" },
});

/* ── Auth rate limiter: 10 req/min per IP ──────────────────── */
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "تجاوزت محاولات تسجيل الدخول، حاول مجدداً بعد دقيقة" },
});

/* ── Compression: gzip responses > 1kb ─────────────────────── */
app.use(compression({ level: 6, threshold: 1024 }));

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

/* Apply general limiter to all API routes */
app.use("/api", generalLimiter);

/* Apply stricter limiter to auth routes */
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/login/email", authLimiter);
app.use("/api/auth/refresh", authLimiter);

app.use("/api", router);

/* ── Production: serve React frontend static files ─────────── */
if (process.env.NODE_ENV === "production") {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const frontendDist =
    process.env.FRONTEND_DIST ||
    path.resolve(currentDir, "../../erp-system/dist/public");
  app.use(express.static(frontendDist, {
    maxAge: "7d",
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      }
    },
  }));
  /* SPA fallback: serve index.html for any non-API path */
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(frontendDist, "index.html"));
  });
  logger.info({ frontendDist }, "Serving frontend static files");
}

/* ── Global error handler — no stack traces in responses ───── */
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  logger.error({ err }, "Unhandled route error");

  /* Zod validation errors (thrown via schema.parse()) */
  if (err?.name === "ZodError") {
    res.status(400).json({
      error:   "بيانات غير صحيحة",
      details: (err.errors as Array<{ message: string }>).map((e) => e.message),
    });
    return;
  }

  /* JWT errors */
  if (err?.name === "JsonWebTokenError" || err?.name === "TokenExpiredError") {
    res.status(401).json({ error: "الجلسة منتهية، يرجى تسجيل الدخول مجدداً" });
    return;
  }

  /* PostgreSQL unique-constraint / FK violation */
  if (typeof err?.code === "string" && err.code.startsWith("23")) {
    res.status(409).json({ error: "البيانات موجودة مسبقاً أو يوجد تعارض في البيانات" });
    return;
  }

  /* Fallback: generic error — hide internals in production */
  const status: number =
    typeof (err as Record<string, unknown>).status === "number"
      ? ((err as Record<string, unknown>).status as number)
      : typeof (err as Record<string, unknown>).statusCode === "number"
        ? ((err as Record<string, unknown>).statusCode as number)
        : 500;
  const isDev = process.env.NODE_ENV !== "production";
  const message: string =
    status < 500 && err instanceof Error ? err.message : "خطأ داخلي في الخادم";
  res.status(status).json({
    error: message,
    ...(isDev && status >= 500 && err instanceof Error ? { details: err.message } : {}),
  });
};

app.use(errorHandler);

export default app;
