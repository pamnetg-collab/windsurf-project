import { prisma } from "../lib/prisma";
import { config } from "../config";
import { BadRequest } from "../lib/errors";
import * as subscriptionService from "./subscriptionService";

export function buildReferralLink(referralCode: string): string {
  const username = config.telegram.botUsername || "your_bot";
  return `https://t.me/${username}?start=${referralCode}`;
}

export async function getReferralInfo(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return {
    code: user.referralCode,
    link: buildReferralLink(user.referralCode),
  };
}

export async function getStats(userId: string) {
  const [total, rewarded, pending, rewardAgg] = await Promise.all([
    prisma.referral.count({ where: { userId } }),
    prisma.referral.count({ where: { userId, status: "rewarded" } }),
    prisma.referral.count({ where: { userId, status: "pending" } }),
    prisma.referral.aggregate({
      where: { userId, status: "rewarded" },
      _sum: { rewardDays: true },
    }),
  ]);
  return {
    invited: total,
    rewarded,
    pending,
    daysEarned: rewardAgg._sum.rewardDays ?? 0,
  };
}

/**
 * Claim a referral for a newly-registered invitee.
 * Anti-abuse:
 *  - invitee can only be referred once (DB unique constraint)
 *  - cannot self-refer
 *  - inviter daily limit enforced
 * Reward (+7 days) is granted immediately to the inviter.
 */
export async function claimReferral(inviteeUserId: string): Promise<boolean> {
  const invitee = await prisma.user.findUniqueOrThrow({ where: { id: inviteeUserId } });
  if (!invitee.referredBy) return false;
  if (invitee.referredBy === inviteeUserId) return false;

  const existing = await prisma.referral.findUnique({
    where: { referredUserId: inviteeUserId },
  });
  if (existing) return false; // already claimed

  // Daily limit per inviter to prevent spam.
  const since = new Date(Date.now() - 86400000);
  const todayCount = await prisma.referral.count({
    where: { userId: invitee.referredBy, createdAt: { gte: since } },
  });
  if (todayCount >= config.rules.referralDailyLimit) {
    await prisma.referral.create({
      data: {
        userId: invitee.referredBy,
        referredUserId: inviteeUserId,
        rewardDays: 0,
        status: "rejected",
      },
    });
    return false;
  }

  const rewardDays = config.rules.referralRewardDays;
  await prisma.referral.create({
    data: {
      userId: invitee.referredBy,
      referredUserId: inviteeUserId,
      rewardDays,
      status: "rewarded",
    },
  });

  await subscriptionService.extendByDays(invitee.referredBy, rewardDays);
  return true;
}
