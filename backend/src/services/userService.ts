import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { Conflict, NotFound } from "../lib/errors";
import type { User } from "@prisma/client";

function generateReferralCode(): string {
  return crypto.randomBytes(5).toString("hex").toUpperCase();
}

async function uniqueReferralCode(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = generateReferralCode();
    const exists = await prisma.user.findUnique({ where: { referralCode: code } });
    if (!exists) return code;
  }
  // fallback to uuid-ish
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
}

export interface UpsertInput {
  telegramId: number | bigint;
  username?: string;
  firstName?: string;
  startParam?: string; // referral code of inviter
}

/**
 * Find or create a user from Telegram identity.
 * Returns { user, isNew } so callers can trigger trial/referral on first contact.
 */
export async function findOrCreateUser(
  input: UpsertInput
): Promise<{ user: User; isNew: boolean }> {
  const telegramId = BigInt(input.telegramId);
  const existing = await prisma.user.findUnique({ where: { telegramId } });
  if (existing) {
    // keep profile fields fresh
    if (input.username !== undefined || input.firstName !== undefined) {
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: { username: input.username, firstName: input.firstName },
      });
      return { user: updated, isNew: false };
    }
    return { user: existing, isNew: false };
  }

  const referralCode = await uniqueReferralCode();
  let referredBy: string | null = null;
  if (input.startParam) {
    const inviter = await prisma.user.findUnique({
      where: { referralCode: input.startParam },
    });
    if (inviter) referredBy = inviter.id;
  }

  const user = await prisma.user.create({
    data: {
      telegramId,
      username: input.username,
      firstName: input.firstName,
      referralCode,
      referredBy,
    },
  });

  return { user, isNew: true };
}

export async function getUserById(id: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw NotFound("User not found");
  return user;
}

export async function getUserByTelegramId(telegramId: number | bigint): Promise<User | null> {
  return prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
}

export async function setStatus(userId: string, status: User["status"]): Promise<User> {
  return prisma.user.update({ where: { id: userId }, data: { status } });
}

export async function banUser(userId: string, banned: boolean): Promise<User> {
  return prisma.user.update({
    where: { id: userId },
    data: { status: banned ? "banned" : "expired" },
  });
}

/**
 * Device binding: 1 user = 1 active device (hash-based fingerprint).
 * If a different device hash arrives, the previous one is deactivated.
 */
export async function bindDevice(userId: string, deviceHash: string) {
  const active = await prisma.device.findFirst({
    where: { userId, active: true },
  });

  if (active && active.deviceHash !== deviceHash) {
    // Enforce single-device policy: reject new device while one is active.
    throw Conflict("Another device is already bound to this account", "device_conflict");
  }

  return prisma.device.upsert({
    where: { userId_deviceHash: { userId, deviceHash } },
    update: { active: true },
    create: { userId, deviceHash, active: true },
  });
}

export async function resetDevices(userId: string) {
  await prisma.device.updateMany({ where: { userId }, data: { active: false } });
}
