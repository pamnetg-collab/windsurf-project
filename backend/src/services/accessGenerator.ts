import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { config } from "../config";
import { BadRequest } from "../lib/errors";
import { logger } from "../lib/logger";
import { getActiveSubscription } from "./subscriptionService";
import { selectAutoServer } from "./loadBalancer";
import * as serverManager from "./serverManager";
import {
  XuiClient,
  buildVlessLink,
  inboundDefaultFlow,
  type XuiInbound,
} from "../lib/xui";
import type { AccessKey, Server } from "@prisma/client";

/** True when the server has full 3x-ui panel credentials configured. */
export function hasPanel(server: Server): boolean {
  return Boolean(server.apiUrl && server.panelUser && server.panelPass && server.inboundId != null);
}

function xuiFor(server: Server): XuiClient {
  return new XuiClient(server.apiUrl!, server.panelUser!, server.panelPass!);
}

/** Stable, unique-within-inbound client identifier for a user. */
function emailFor(telegramId: bigint, server: Server): string {
  return `tg${telegramId}_${server.id.slice(0, 6)}`;
}

/** Fallback demo link for servers without a configured panel (dev only). */
function buildDemoLink(server: Server, clientUuid: string, label: string): string {
  const params = new URLSearchParams({
    type: "tcp",
    security: "reality",
    sni: server.sni ?? server.ip,
    fp: "chrome",
    pbk: server.publicKey ?? "",
    flow: "xtls-rprx-vision",
  });
  return `vless://${clientUuid}@${server.ip}:${server.port}?${params.toString()}#${encodeURIComponent(label)}`;
}

export interface GenerateResult {
  accessKey: AccessKey;
  server: Server;
}

/**
 * Generate (or reuse) an access key for a user.
 *  - requires an active subscription
 *  - enforces device binding (handled by caller via userService.bindDevice)
 *  - if serverId omitted -> AUTO balancer selects the best server
 */
export async function generateAccess(
  userId: string,
  serverId?: string
): Promise<GenerateResult> {
  const sub = await getActiveSubscription(userId);
  if (!sub) throw BadRequest("No active subscription", "no_subscription");

  const server = serverId
    ? await serverManager.getServer(serverId)
    : await selectAutoServer();

  if (serverId && (server.status === "full" || server.status === "offline")) {
    throw BadRequest("Selected server is not available", "server_unavailable");
  }

  // Reuse existing active key for this server if present.
  const existing = await prisma.accessKey.findFirst({
    where: { userId, serverId: server.id, active: true },
  });
  if (existing) return { accessKey: existing, server };

  // Single active key per user: revoke keys on any other server first.
  await revokeOtherServerKeys(userId, server.id);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw BadRequest("User not found", "user_not_found");

  const clientUuid = crypto.randomUUID();
  const subId = crypto.randomBytes(8).toString("hex");
  const label = `${server.region}-${server.name}`;
  const expiryMs = sub.endDate.getTime();

  let configLink: string;
  let email: string | null = null;

  if (hasPanel(server)) {
    email = emailFor(user.telegramId, server);
    const xui = xuiFor(server);
    let inbound: XuiInbound;
    try {
      inbound = await xui.getInbound(server.inboundId!);
    } catch (err) {
      logger.error("3x-ui getInbound failed", { server: server.id, err: String(err) });
      throw BadRequest("VPN server is not reachable", "provision_failed");
    }
    try {
      await xui.addClient(server.inboundId!, {
        id: clientUuid,
        email,
        flow: inboundDefaultFlow(inbound) ?? "xtls-rprx-vision",
        limitIp: config.rules.deviceLimit,
        totalGB: 0,
        expiryTime: expiryMs,
        enable: true,
        subId,
      });
    } catch (err) {
      logger.error("3x-ui addClient failed", { server: server.id, err: String(err) });
      throw BadRequest("Failed to create VPN user", "provision_failed");
    }
    configLink = buildVlessLink({
      inbound,
      clientUuid,
      address: server.ip,
      label,
      flow: inboundDefaultFlow(inbound) ?? "xtls-rprx-vision",
    });
  } else {
    configLink = buildDemoLink(server, clientUuid, label);
  }

  const accessKey = await prisma.accessKey.create({
    data: {
      userId,
      serverId: server.id,
      uuid: clientUuid,
      email,
      subId,
      config: configLink,
      active: true,
      expiryAt: sub.endDate,
    },
  });

  await serverManager.incrementLoad(server.id, 1);

  return { accessKey, server };
}

/** Return the latest active config for a user (any server). */
export async function getConfig(userId: string): Promise<AccessKey | null> {
  return prisma.accessKey.findFirst({
    where: { userId, active: true },
    orderBy: { createdAt: "desc" },
  });
}

/** Revoke active keys on servers other than the given one (single-key policy). */
async function revokeOtherServerKeys(userId: string, keepServerId: string): Promise<void> {
  const keys = await prisma.accessKey.findMany({
    where: { userId, active: true, serverId: { not: keepServerId } },
  });
  for (const k of keys) {
    const server = await prisma.server.findUnique({ where: { id: k.serverId } });
    if (server && hasPanel(server)) {
      try {
        await xuiFor(server).deleteClient(server.inboundId!, k.uuid);
      } catch (err) {
        logger.warn("3x-ui deleteClient (switch) failed", { key: k.id, err: String(err) });
      }
    }
    await prisma.accessKey.update({ where: { id: k.id }, data: { active: false } });
    await serverManager.decrementLoad(k.serverId, 1);
  }
}

/**
 * Disable (not delete) a user's keys on the panel — used at the start of the
 * grace period. The DB record stays active so a renewal re-enables it.
 */
export async function disableUserKeys(userId: string): Promise<void> {
  const keys = await prisma.accessKey.findMany({ where: { userId, active: true } });
  for (const k of keys) {
    const server = await prisma.server.findUnique({ where: { id: k.serverId } });
    if (!server || !hasPanel(server) || !k.email) continue;
    try {
      await xuiFor(server).updateClient(server.inboundId!, {
        id: k.uuid,
        email: k.email,
        enable: false,
        limitIp: config.rules.deviceLimit,
        totalGB: 0,
        subId: k.subId ?? undefined,
      });
    } catch (err) {
      logger.warn("3x-ui disableClient failed", { key: k.id, err: String(err) });
    }
  }
}

/**
 * Permanently delete keys whose subscription expired more than graceDays ago
 * and the user still has no active subscription. Returns the count purged.
 */
export async function purgeExpiredKeys(): Promise<number> {
  const cutoff = new Date(Date.now() - config.rules.graceDays * 86400000);
  const keys = await prisma.accessKey.findMany({
    where: { active: true, expiryAt: { lt: cutoff } },
  });
  let purged = 0;
  for (const k of keys) {
    const stillActive = await getActiveSubscription(k.userId);
    if (stillActive) continue; // renewed during grace
    const server = await prisma.server.findUnique({ where: { id: k.serverId } });
    if (server && hasPanel(server)) {
      try {
        await xuiFor(server).deleteClient(server.inboundId!, k.uuid);
      } catch (err) {
        logger.warn("3x-ui purge deleteClient failed", { key: k.id, err: String(err) });
      }
    }
    await prisma.accessKey.update({ where: { id: k.id }, data: { active: false } });
    await serverManager.decrementLoad(k.serverId, 1);
    purged++;
  }
  return purged;
}

/** Revoke all keys for a user (e.g. on ban/refund): delete on panel + DB. */
export async function revokeUserKeys(userId: string): Promise<void> {
  const keys = await prisma.accessKey.findMany({ where: { userId, active: true } });
  for (const k of keys) {
    const server = await prisma.server.findUnique({ where: { id: k.serverId } });
    if (server && hasPanel(server)) {
      try {
        await xuiFor(server).deleteClient(server.inboundId!, k.uuid);
      } catch (err) {
        logger.warn("3x-ui deleteClient failed", { key: k.id, err: String(err) });
      }
    }
    await prisma.accessKey.update({ where: { id: k.id }, data: { active: false } });
    await serverManager.decrementLoad(k.serverId, 1);
  }
}

/**
 * Sync the expiry time of all active keys on the panel to the user's current
 * subscription end date. Called after a payment / renewal / referral reward.
 */
export async function syncUserKeysExpiry(userId: string): Promise<void> {
  const sub = await getActiveSubscription(userId);
  if (!sub) return;
  const keys = await prisma.accessKey.findMany({ where: { userId, active: true } });
  for (const k of keys) {
    const server = await prisma.server.findUnique({ where: { id: k.serverId } });
    if (!server || !hasPanel(server) || !k.email) continue;
    try {
      await xuiFor(server).updateClient(server.inboundId!, {
        id: k.uuid,
        email: k.email,
        expiryTime: sub.endDate.getTime(),
        limitIp: config.rules.deviceLimit,
        totalGB: 0,
        enable: true,
        subId: k.subId ?? undefined,
      });
      await prisma.accessKey.update({ where: { id: k.id }, data: { expiryAt: sub.endDate } });
    } catch (err) {
      logger.warn("3x-ui updateClient (expiry sync) failed", { key: k.id, err: String(err) });
    }
  }
}

/** Total traffic (bytes) used by a user across all active keys. */
export async function getUserTraffic(userId: string): Promise<{ up: number; down: number; total: number }> {
  const keys = await prisma.accessKey.findMany({ where: { userId, active: true } });
  let up = 0;
  let down = 0;
  for (const k of keys) {
    const server = await prisma.server.findUnique({ where: { id: k.serverId } });
    if (!server || !hasPanel(server) || !k.email) continue;
    const t = await xuiFor(server).getClientTraffic(k.email);
    if (t) {
      up += t.up;
      down += t.down;
    }
  }
  return { up, down, total: up + down };
}
