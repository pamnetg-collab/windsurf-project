import { Telegram } from "telegraf";
import { config } from "../config";

/**
 * Shared Telegram client for outbound API calls (notifications, refunds).
 * Null when no bot token is configured.
 */
export const telegram = config.telegram.botToken
  ? new Telegram(config.telegram.botToken)
  : null;
