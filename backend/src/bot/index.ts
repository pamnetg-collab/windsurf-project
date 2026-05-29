import { Telegraf, Markup } from "telegraf";
import type { Context } from "telegraf";
import crypto from "crypto";
import { config } from "../config";
import { logger } from "../lib/logger";
import { findOrCreateUser } from "../services/userService";
import { claimReferral, getReferralInfo, getStats } from "../services/referralService";
import * as subscriptionService from "../services/subscriptionService";
import * as accessGenerator from "../services/accessGenerator";
import { listSelectableServers } from "../services/loadBalancer";
import * as paymentService from "../services/paymentService";
import { bindDevice } from "../services/userService";
import { AppError } from "../lib/errors";

/**
 * Telegram bot implementing the main menu flow from the spec:
 *   Connect (AUTO) / Choose server / Subscribe / Referral / My status
 */

const PLAN_LABELS: Record<string, string> = {
  m1: "1 месяц",
  m3: "3 месяца",
};

function mainMenu() {
  return Markup.keyboard([
    ["Подключиться (AUTO)", "Выбрать сервер"],
    ["Подписка", "Рефералы"],
    ["Мой статус"],
  ]).resize();
}

/** Derive a stable device hash from the Telegram user id (single-device policy). */
function deviceHashFor(telegramId: number): string {
  return crypto.createHash("sha256").update(`tg:${telegramId}`).digest("hex");
}

async function ctxUser(ctx: Context) {
  const from = ctx.from!;
  const startPayload =
    "startPayload" in ctx && typeof (ctx as { startPayload?: string }).startPayload === "string"
      ? (ctx as { startPayload?: string }).startPayload
      : undefined;
  const { user, isNew } = await findOrCreateUser({
    telegramId: from.id,
    username: from.username,
    firstName: from.first_name,
    startParam: startPayload,
  });
  if (isNew && user.referredBy) {
    await claimReferral(user.id).catch(() => undefined);
  }
  return user;
}

export function createBot(): Telegraf | null {
  if (!config.telegram.botToken) {
    logger.warn("Bot disabled: TELEGRAM_BOT_TOKEN not set");
    return null;
  }

  const bot = new Telegraf(config.telegram.botToken);

  bot.start(async (ctx) => {
    const user = await ctxUser(ctx);
    // Auto-start trial on first contact if never used.
    let trialMsg = "";
    if (!user.trialUsed) {
      try {
        const sub = await subscriptionService.startTrial(user.id);
        trialMsg = `\n\nВам активирован пробный период на ${subscriptionService.PLAN_DAYS.trial} дней (до ${sub.endDate.toLocaleDateString("ru-RU")}).`;
      } catch {
        /* trial already used / active */
      }
    }
    await ctx.reply(
      `Добро пожаловать!${trialMsg}\n\nИспользуйте меню ниже, чтобы подключиться к VPN.`,
      mainMenu()
    );
    // Telegram requires HTTPS for Web App buttons.
    if (config.telegram.miniAppUrl.startsWith("https://")) {
      await ctx.reply(
        "Откройте удобное приложение со всеми функциями:",
        Markup.inlineKeyboard([
          [Markup.button.webApp("🌐 Открыть приложение", config.telegram.miniAppUrl)],
        ])
      );
    }
  });

  bot.hears("Подключиться (AUTO)", async (ctx) => {
    const user = await ctxUser(ctx);
    try {
      await bindDevice(user.id, deviceHashFor(ctx.from!.id));
      const result = await accessGenerator.generateAccess(user.id);
      await ctx.reply(
        `Сервер: <b>${result.server.name}</b> (${result.server.region})\n\nВаша конфигурация:\n<code>${result.accessKey.config}</code>`,
        { parse_mode: "HTML" }
      );
    } catch (err) {
      await replyError(ctx, err);
    }
  });

  bot.hears("Выбрать сервер", async (ctx) => {
    await ctxUser(ctx);
    const servers = await listSelectableServers();
    if (servers.length === 0) {
      await ctx.reply("Нет доступных серверов. Попробуйте позже.");
      return;
    }
    await ctx.reply(
      "Выберите сервер:",
      Markup.inlineKeyboard(
        servers.map((s) => [
          Markup.button.callback(
            `${s.region} · ${s.name} (${Math.round((s.currentUsers / s.capacity) * 100)}%)`,
            `srv:${s.id}`
          ),
        ])
      )
    );
  });

  bot.action(/^srv:(.+)$/, async (ctx) => {
    const serverId = ctx.match[1];
    const user = await ctxUser(ctx);
    try {
      await bindDevice(user.id, deviceHashFor(ctx.from!.id));
      const result = await accessGenerator.generateAccess(user.id, serverId);
      await ctx.editMessageText(
        `Сервер: <b>${result.server.name}</b> (${result.server.region})\n\n<code>${result.accessKey.config}</code>`,
        { parse_mode: "HTML" }
      );
    } catch (err) {
      await replyError(ctx, err);
    }
  });

  bot.hears("Подписка", async (ctx) => {
    await ctxUser(ctx);
    await ctx.reply(
      "Выберите тариф:",
      Markup.inlineKeyboard([
        [Markup.button.callback(`${PLAN_LABELS.m1} — ${paymentService.PLANS.m1.amount} ⭐`, "buy:m1")],
        [Markup.button.callback(`${PLAN_LABELS.m3} — ${paymentService.PLANS.m3.amount} ⭐`, "buy:m3")],
      ])
    );
  });

  bot.action(/^buy:(m1|m3)$/, async (ctx) => {
    const plan = ctx.match[1];
    const user = await ctxUser(ctx);
    try {
      await ctx.answerCbQuery();
      const { payment, info } = await paymentService.createPayment(user.id, plan);
      // Telegram Stars invoice: currency must be XTR and provider_token empty.
      await ctx.replyWithInvoice({
        title: info.title,
        description: info.description,
        payload: payment.payload,
        provider_token: "",
        currency: "XTR",
        prices: [{ label: info.title, amount: info.amount }],
      });
    } catch (err) {
      logger.error("Invoice send failed", { plan, user: user.id, err: String(err) });
      await replyError(ctx, err);
    }
  });

  // Required: approve the pre-checkout within 10s.
  bot.on("pre_checkout_query", async (ctx) => {
    await ctx.answerPreCheckoutQuery(true);
  });

  // Payment success -> confirm + activate subscription.
  bot.on("successful_payment", async (ctx) => {
    const sp = ctx.message.successful_payment;
    try {
      await paymentService.confirmPayment(sp.invoice_payload, sp.telegram_payment_charge_id, {
        paidAmount: sp.total_amount,
        paidCurrency: sp.currency,
      });
      const status = await subscriptionService.getStatus((await ctxUser(ctx)).id);
      await ctx.reply(
        `Оплата получена! Подписка активна до ${status.endDate?.toLocaleDateString("ru-RU")}.`,
        mainMenu()
      );
    } catch (err) {
      await replyError(ctx, err);
    }
  });

  bot.hears("Рефералы", async (ctx) => {
    const user = await ctxUser(ctx);
    const info = await getReferralInfo(user.id);
    const stats = await getStats(user.id);
    await ctx.reply(
      `Ваша реферальная ссылка:\n${info.link}\n\nПриглашено: ${stats.invited}\nНачислено дней: ${stats.daysEarned}\n\nЗа каждого приглашённого друга вы получаете +${config.rules.referralRewardDays} дней.`
    );
  });

  bot.hears("Мой статус", async (ctx) => {
    const user = await ctxUser(ctx);
    const status = await subscriptionService.getStatus(user.id);
    if (!status.active) {
      await ctx.reply("Подписка неактивна. Оформите её в разделе «Подписка».");
      return;
    }
    let trafficLine = "";
    try {
      const t = await accessGenerator.getUserTraffic(user.id);
      if (t.total > 0) trafficLine = `\nТрафик: ${formatBytes(t.total)}`;
    } catch {
      /* traffic optional */
    }
    await ctx.reply(
      `Статус: активна\nТариф: ${status.plan}\nДействует до: ${status.endDate?.toLocaleDateString("ru-RU")}\nОсталось дней: ${status.daysLeft}${trafficLine}`
    );
  });

  bot.catch((err, ctx) => {
    logger.error("Bot error", { err: String(err), update: ctx.updateType });
  });

  return bot;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(2)} ${units[i]}`;
}

async function replyError(ctx: Context, err: unknown) {
  const messages: Record<string, string> = {
    no_subscription: "У вас нет активной подписки. Оформите её в разделе «Подписка».",
    no_servers: "Сейчас нет свободных серверов. Попробуйте позже.",
    device_conflict: "К аккаунту уже привязано другое устройство.",
    server_unavailable: "Выбранный сервер недоступен.",
    provision_failed: "Не удалось создать ключ на сервере. Мы уже разбираемся, попробуйте позже.",
  };
  if (!(err instanceof AppError)) {
    logger.error("Bot handler error", { err: String(err) });
  }
  const code = err instanceof AppError ? err.code : "error";
  await ctx.reply(messages[code] ?? "Произошла ошибка. Попробуйте позже.");
}
