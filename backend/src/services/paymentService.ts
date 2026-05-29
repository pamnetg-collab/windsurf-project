import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { config } from "../config";
import { BadRequest, NotFound } from "../lib/errors";
import { logger } from "../lib/logger";
import * as subscriptionService from "./subscriptionService";
import { syncUserKeysExpiry, revokeUserKeys } from "./accessGenerator";
import type { Payment, SubscriptionPlan } from "@prisma/client";

export interface PlanInfo {
  plan: SubscriptionPlan;
  title: string;
  description: string;
  amount: number; // minor units (Telegram Stars: whole stars)
  currency: string;
}

// Pricing catalog. Currency XTR = Telegram Stars.
export const PLANS: Record<Exclude<SubscriptionPlan, "trial">, PlanInfo> = {
  m1: {
    plan: "m1",
    title: "Подписка 1 месяц",
    description: "Доступ к VPN на 30 дней",
    amount: 150,
    currency: "XTR",
  },
  m3: {
    plan: "m3",
    title: "Подписка 3 месяца",
    description: "Доступ к VPN на 90 дней",
    amount: 400,
    currency: "XTR",
  },
};

export function getPlan(plan: string): PlanInfo {
  const p = PLANS[plan as Exclude<SubscriptionPlan, "trial">];
  if (!p) throw BadRequest("Unknown plan", "unknown_plan");
  return p;
}

/**
 * Create a pending payment record and return the invoice payload to be used
 * with Telegram's sendInvoice. The payload is the idempotency key.
 */
export async function createPayment(
  userId: string,
  plan: string
): Promise<{ payment: Payment; info: PlanInfo }> {
  const info = getPlan(plan);
  const payload = `pay_${userId}_${info.plan}_${crypto.randomBytes(6).toString("hex")}`;

  const payment = await prisma.payment.create({
    data: {
      userId,
      plan: info.plan,
      amount: info.amount,
      currency: info.currency,
      status: "pending",
      payload,
      provider: "telegram",
    },
  });

  return { payment, info };
}

/**
 * Create a Telegram Stars invoice LINK (for Mini App openInvoice). Creates a
 * pending payment and returns a deep link the Web App can open directly.
 */
export async function createStarsInvoiceLink(
  userId: string,
  plan: string
): Promise<{ link: string; payload: string }> {
  if (!config.telegram.botToken) throw BadRequest("Bot not configured", "bot_disabled");
  const { payment, info } = await createPayment(userId, plan);

  const res = await fetch(
    `https://api.telegram.org/bot${config.telegram.botToken}/createInvoiceLink`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: info.title,
        description: info.description,
        payload: payment.payload,
        provider_token: "", // Telegram Stars
        currency: "XTR",
        prices: [{ label: info.title, amount: info.amount }],
      }),
    }
  );
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    result?: string;
    description?: string;
  };
  if (!body.ok || !body.result) {
    logger.error("createInvoiceLink failed", { desc: body.description, status: res.status });
    throw BadRequest("Failed to create invoice", "invoice_failed");
  }
  return { link: body.result, payload: payment.payload };
}

/**
 * Confirm a successful payment (called from the Telegram successful_payment
 * handler or the webhook). Idempotent by payload + status check.
 * Activates / extends the user's subscription.
 */
export interface ConfirmOptions {
  paidAmount?: number; // amount actually charged (Telegram total_amount)
  paidCurrency?: string; // currency actually charged
}

export async function confirmPayment(
  payload: string,
  providerRef?: string,
  opts: ConfirmOptions = {}
): Promise<Payment> {
  const payment = await prisma.payment.findUnique({ where: { payload } });
  if (!payment) throw NotFound("Payment not found");
  if (payment.status === "paid") return payment; // idempotent

  // Verify the charged amount/currency matches what we invoiced.
  if (opts.paidAmount !== undefined && opts.paidAmount !== payment.amount) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "failed" } });
    logger.error("Payment amount mismatch", {
      payload,
      expected: payment.amount,
      got: opts.paidAmount,
    });
    throw BadRequest("Payment amount mismatch", "amount_mismatch");
  }
  if (opts.paidCurrency !== undefined && opts.paidCurrency !== payment.currency) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "failed" } });
    logger.error("Payment currency mismatch", {
      payload,
      expected: payment.currency,
      got: opts.paidCurrency,
    });
    throw BadRequest("Payment currency mismatch", "currency_mismatch");
  }

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "paid", providerRef },
  });

  await subscriptionService.activatePaidPlan(payment.userId, payment.plan);
  // Extend the expiry of any existing VPN keys on the panel to the new end date.
  try {
    await syncUserKeysExpiry(payment.userId);
  } catch (err) {
    logger.warn("Failed to sync key expiry after payment", { userId: payment.userId, err: String(err) });
  }
  return updated;
}

/**
 * Refund a paid Telegram Stars payment. Calls Telegram's refundStarPayment,
 * marks the payment refunded, expires the user's subscription and revokes keys.
 */
export async function refundPayment(paymentId: string): Promise<Payment> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { user: true },
  });
  if (!payment) throw NotFound("Payment not found");
  if (payment.status !== "paid") throw BadRequest("Only paid payments can be refunded", "not_paid");
  if (!payment.providerRef) throw BadRequest("Missing Telegram charge id", "no_charge_id");
  if (!config.telegram.botToken) throw BadRequest("Bot not configured", "bot_disabled");

  // telegram_payment_charge_id refund (Telegram Stars) via the Bot API.
  const res = await fetch(
    `https://api.telegram.org/bot${config.telegram.botToken}/refundStarPayment`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: Number(payment.user.telegramId),
        telegram_payment_charge_id: payment.providerRef,
      }),
    }
  );
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  if (!body.ok) {
    throw BadRequest(`Refund failed: ${body.description ?? res.status}`, "refund_failed");
  }

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "refunded" },
  });

  // Revoke access and downgrade.
  try {
    await subscriptionService.expireUser(payment.userId);
    await revokeUserKeys(payment.userId);
  } catch (err) {
    logger.warn("Refund post-actions failed", { userId: payment.userId, err: String(err) });
  }
  return updated;
}

export async function failPayment(payload: string): Promise<void> {
  const payment = await prisma.payment.findUnique({ where: { payload } });
  if (!payment || payment.status === "paid") return;
  await prisma.payment.update({ where: { id: payment.id }, data: { status: "failed" } });
}
