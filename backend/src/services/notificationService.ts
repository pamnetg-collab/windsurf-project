import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { telegram } from "../lib/telegramClient";

export async function notifyUser(telegramId: bigint | number, text: string): Promise<void> {
  if (!telegram) {
    logger.warn("notifyUser skipped: TELEGRAM_BOT_TOKEN not set", { telegramId, text });
    return;
  }
  try {
    await telegram.sendMessage(Number(telegramId), text, { parse_mode: "HTML" });
  } catch (err) {
    logger.error("Failed to send Telegram notification", { telegramId, err: String(err) });
  }
}

/**
 * Subscription reminder triggers (per spec): T-3 days, T-1 day, expired.
 * Designed to be idempotent enough for a daily cron run: it targets
 * subscriptions whose endDate falls within a specific day window.
 */
export async function runSubscriptionReminders(): Promise<{
  threeDay: number;
  oneDay: number;
  expired: number;
}> {
  const now = new Date();

  const windowFor = (daysFromNow: number) => {
    const start = new Date(now);
    start.setDate(start.getDate() + daysFromNow);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { gte: start, lte: end };
  };

  const sendForWindow = async (daysFromNow: number, message: string) => {
    const subs = await prisma.subscription.findMany({
      where: { status: "active", endDate: windowFor(daysFromNow) },
      include: { user: true },
    });
    for (const s of subs) {
      await notifyUser(s.user.telegramId, message);
    }
    return subs.length;
  };

  const threeDay = await sendForWindow(
    3,
    "Ваша подписка истекает через <b>3 дня</b>. Продлите доступ, чтобы не потерять подключение."
  );
  const oneDay = await sendForWindow(
    1,
    "Ваша подписка истекает <b>завтра</b>. Продлите, чтобы остаться на связи."
  );

  // Expired today (endDate in the past 24h window) and now inactive.
  const expiredSince = new Date(now.getTime() - 86400000);
  const expiredSubs = await prisma.subscription.findMany({
    where: { status: "expired", endDate: { gte: expiredSince, lte: now } },
    include: { user: true },
  });
  for (const s of expiredSubs) {
    await notifyUser(
      s.user.telegramId,
      "Ваша подписка <b>истекла</b>. Оформите новую, чтобы восстановить доступ."
    );
  }

  return { threeDay, oneDay, expired: expiredSubs.length };
}
