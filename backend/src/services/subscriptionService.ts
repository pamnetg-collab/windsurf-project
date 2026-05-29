import { prisma } from "../lib/prisma";
import { config } from "../config";
import { BadRequest, NotFound } from "../lib/errors";
import type { Subscription, SubscriptionPlan } from "@prisma/client";

export const PLAN_DAYS: Record<SubscriptionPlan, number> = {
  trial: config.rules.trialDays,
  m1: 30,
  m3: 90,
};

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Currently active (non-expired) subscription for a user, if any. */
export async function getActiveSubscription(userId: string): Promise<Subscription | null> {
  return prisma.subscription.findFirst({
    where: { userId, status: "active", endDate: { gt: new Date() } },
    orderBy: { endDate: "desc" },
  });
}

export interface SubStatus {
  active: boolean;
  plan: SubscriptionPlan | null;
  endDate: Date | null;
  daysLeft: number;
}

export async function getStatus(userId: string): Promise<SubStatus> {
  const sub = await getActiveSubscription(userId);
  if (!sub) return { active: false, plan: null, endDate: null, daysLeft: 0 };
  const daysLeft = Math.max(
    0,
    Math.ceil((sub.endDate.getTime() - Date.now()) / 86400000)
  );
  return { active: true, plan: sub.plan, endDate: sub.endDate, daysLeft };
}

/** Start a 14-day trial. Only allowed once per user. */
export async function startTrial(userId: string): Promise<Subscription> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw NotFound("User not found");
  if (user.trialUsed) throw BadRequest("Trial already used", "trial_used");

  const existingActive = await getActiveSubscription(userId);
  if (existingActive) throw BadRequest("Subscription already active", "already_active");

  const now = new Date();
  const [sub] = await prisma.$transaction([
    prisma.subscription.create({
      data: {
        userId,
        plan: "trial",
        startDate: now,
        endDate: addDays(now, PLAN_DAYS.trial),
        status: "active",
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { trialUsed: true, status: "trial" },
    }),
  ]);
  return sub;
}

/**
 * Create or extend a paid subscription. If an active subscription exists, the
 * new period is appended to its end date (stacking), otherwise it starts now.
 */
export async function activatePaidPlan(
  userId: string,
  plan: SubscriptionPlan
): Promise<Subscription> {
  if (plan === "trial") throw BadRequest("Use startTrial for trial plan");
  const days = PLAN_DAYS[plan];
  const now = new Date();
  const current = await getActiveSubscription(userId);
  const base = current && current.endDate > now ? current.endDate : now;
  const endDate = addDays(base, days);

  const [sub] = await prisma.$transaction([
    prisma.subscription.create({
      data: { userId, plan, startDate: now, endDate, status: "active" },
    }),
    prisma.user.update({ where: { id: userId }, data: { status: "active" } }),
  ]);
  // Mark prior subscriptions as cancelled to keep a single active record.
  if (current) {
    await prisma.subscription.update({
      where: { id: current.id },
      data: { status: "cancelled" },
    });
  }
  return sub;
}

/** Extend the active subscription by N days (used by referral rewards / admin). */
export async function extendByDays(userId: string, days: number): Promise<Subscription> {
  const now = new Date();
  const current = await getActiveSubscription(userId);
  if (current) {
    const updated = await prisma.subscription.update({
      where: { id: current.id },
      data: { endDate: addDays(current.endDate, days) },
    });
    await prisma.user.update({ where: { id: userId }, data: { status: "active" } });
    return updated;
  }
  // No active sub: create a bonus subscription window.
  const sub = await prisma.subscription.create({
    data: {
      userId,
      plan: "trial",
      startDate: now,
      endDate: addDays(now, days),
      status: "active",
    },
  });
  await prisma.user.update({ where: { id: userId }, data: { status: "active" } });
  return sub;
}

/** Immediately expire all active subscriptions for a user (e.g. on refund). */
export async function expireUser(userId: string): Promise<void> {
  await prisma.subscription.updateMany({
    where: { userId, status: "active" },
    data: { status: "expired" },
  });
  await prisma.user.update({ where: { id: userId }, data: { status: "expired" } });
}

/**
 * Mark expired subscriptions + downgrade user status. Used by cron.
 * Returns the ids of users that were downgraded (no remaining active sub) so
 * the caller can revoke their VPN keys on the panel.
 */
export async function expireDue(): Promise<{ count: number; downgradedUserIds: string[] }> {
  const now = new Date();
  const due = await prisma.subscription.findMany({
    where: { status: "active", endDate: { lte: now } },
    select: { id: true, userId: true },
  });
  if (due.length === 0) return { count: 0, downgradedUserIds: [] };

  await prisma.subscription.updateMany({
    where: { id: { in: due.map((s) => s.id) } },
    data: { status: "expired" },
  });

  // Downgrade users that have no remaining active subscription.
  const downgradedUserIds: string[] = [];
  for (const s of due) {
    const stillActive = await getActiveSubscription(s.userId);
    if (!stillActive) {
      await prisma.user.update({ where: { id: s.userId }, data: { status: "expired" } });
      downgradedUserIds.push(s.userId);
    }
  }
  return { count: due.length, downgradedUserIds };
}
