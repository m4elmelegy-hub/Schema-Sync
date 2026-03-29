import express, { type Express, type ErrorRequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

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
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  logger.error({ err }, "Unhandled route error");
  const status: number =
    typeof (err as Record<string, unknown>).status === "number"
      ? ((err as Record<string, unknown>).status as number)
      : typeof (err as Record<string, unknown>).statusCode === "number"
        ? ((err as Record<string, unknown>).statusCode as number)
        : 500;
  const message: string =
    err instanceof Error ? err.message : "خطأ داخلي في الخادم";
  res.status(status).json({ error: message });
};

app.use(errorHandler);

export default app;
