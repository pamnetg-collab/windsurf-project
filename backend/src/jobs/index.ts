import cron from "node-cron";
import { logger } from "../lib/logger";
import { expireDue } from "../services/subscriptionService";
import { runSubscriptionReminders } from "../services/notificationService";
import { healthCheck, reconcileServerLoads } from "../services/serverManager";
import { disableUserKeys, purgeExpiredKeys } from "../services/accessGenerator";

/**
 * Schedule background jobs:
 *  - daily 09:00 : subscription reminders (T-3, T-1, expired)
 *  - every 15min : expire due subscriptions
 *  - every 5min  : server health check
 */
export function startJobs() {
  // Daily reminders at 09:00 server time.
  cron.schedule("0 9 * * *", async () => {
    try {
      const r = await runSubscriptionReminders();
      logger.info("Subscription reminders sent", r);
    } catch (err) {
      logger.error("Reminder job failed", err);
    }
  });

  // Expire due subscriptions frequently. Keys are DISABLED (not deleted) so a
  // renewal within the grace period restores them instantly.
  cron.schedule("*/15 * * * *", async () => {
    try {
      const { count, downgradedUserIds } = await expireDue();
      if (count > 0) logger.info(`Expired ${count} subscriptions`);
      for (const userId of downgradedUserIds) {
        try {
          await disableUserKeys(userId);
        } catch (err) {
          logger.error("Failed to disable keys on expiry", { userId, err: String(err) });
        }
      }
    } catch (err) {
      logger.error("Expire job failed", err);
    }
  });

  // Purge keys that stayed expired past the grace period (daily 03:00).
  cron.schedule("0 3 * * *", async () => {
    try {
      const purged = await purgeExpiredKeys();
      if (purged > 0) logger.info(`Purged ${purged} expired keys after grace`);
    } catch (err) {
      logger.error("Purge job failed", err);
    }
  });

  // Reconcile server load counters with actual active keys (hourly).
  cron.schedule("7 * * * *", async () => {
    try {
      await reconcileServerLoads();
    } catch (err) {
      logger.error("Reconcile loads job failed", err);
    }
  });

  // Server health check.
  cron.schedule("*/5 * * * *", async () => {
    try {
      await healthCheck();
    } catch (err) {
      logger.error("Health check job failed", err);
    }
  });

  logger.info("Background jobs scheduled");
}
