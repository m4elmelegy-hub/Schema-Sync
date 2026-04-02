import net from "net";
import app from "./app";
import { logger } from "./lib/logger";
import { startBackupScheduler, stopBackupScheduler } from "./lib/backup-scheduler";

const PORT = 8080;

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    tester.once("listening", () => {
      tester.close(() => resolve(false));
    });
    tester.listen(port, "0.0.0.0");
  });
}

async function main() {
  const inUse = await isPortInUse(PORT);
  if (inUse) {
    logger.warn({ port: PORT }, "Duplicate start prevented — port already in use");
    process.exit(0);
  }

  const server = app.listen(PORT, (err?: Error) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info(`Backend started on port ${PORT}`);
    startBackupScheduler();
  });

  function cleanup(signal: string) {
    logger.info({ signal }, "Shutdown signal received — closing server");
    stopBackupScheduler();
    server.close(() => {
      logger.info("Server closed cleanly");
      process.exit(0);
    });
    setTimeout(() => {
      logger.warn("Forced exit after timeout");
      process.exit(1);
    }, 10_000);
  }

  process.on("SIGTERM", () => cleanup("SIGTERM"));
  process.on("SIGINT",  () => cleanup("SIGINT"));
}

void main();
