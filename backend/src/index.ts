import express from "express";
import cors from "cors";
import { config } from "./config";
import { logger } from "./lib/logger";
import { apiRouter } from "./routes";
import { notFoundHandler, errorHandler } from "./middleware/error";
import { createBot } from "./bot";
import { startJobs } from "./jobs";
import { ensureBootstrapAdmin } from "./routes/admin";

async function main() {
  logger.info(`Starting in role: ${config.role}`);

  // ── API (role: all | api) ───────────────────────────────
  if (config.runApi) {
    const app = express();

    // Restrict CORS to configured origins in production; allow all in dev.
    app.use(
      cors(
        config.corsOrigins.length > 0
          ? { origin: config.corsOrigins }
          : undefined
      )
    );
    app.use(express.json());

    app.use("/api", apiRouter);

    app.use(notFoundHandler);
    app.use(errorHandler);

    // Ensure a bootstrap admin exists (idempotent).
    await ensureBootstrapAdmin().catch((err) =>
      logger.warn("Could not ensure bootstrap admin (DB not ready?)", String(err))
    );

    app.listen(config.port, () => {
      logger.info(`API listening on http://localhost:${config.port}`);
    });
  }

  // ── Worker: bot + cron (role: all | worker) ─────────────
  // IMPORTANT: run exactly ONE worker instance — Telegram long polling and
  // cron jobs must not be duplicated across processes.
  if (config.runWorker) {
    const bot = createBot();
    if (bot) {
      bot.launch().then(() => logger.info("Telegram bot started"));
      process.once("SIGINT", () => bot.stop("SIGINT"));
      process.once("SIGTERM", () => bot.stop("SIGTERM"));
    }
    startJobs();
  }
}

main().catch((err) => {
  logger.error("Fatal startup error", err);
  process.exit(1);
});
