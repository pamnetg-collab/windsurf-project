import { prisma } from "../lib/prisma";
import { NotFound } from "../lib/errors";
import { logger } from "../lib/logger";
import { XuiClient } from "../lib/xui";
import type { Server, ServerStatus } from "@prisma/client";

export interface AddServerInput {
  name: string;
  ip: string;
  port?: number;
  region: string;
  capacity?: number;
  apiUrl?: string;
  apiSecret?: string;
  publicKey?: string;
  sni?: string;
  panelUser?: string;
  panelPass?: string;
  inboundId?: number;
}

export async function addServer(input: AddServerInput): Promise<Server> {
  return prisma.server.create({
    data: {
      name: input.name,
      ip: input.ip,
      port: input.port ?? 443,
      region: input.region,
      capacity: input.capacity ?? 100,
      apiUrl: input.apiUrl,
      apiSecret: input.apiSecret,
      publicKey: input.publicKey,
      sni: input.sni,
      panelUser: input.panelUser,
      panelPass: input.panelPass,
      inboundId: input.inboundId,
    },
  });
}

export async function removeServer(id: string): Promise<void> {
  const server = await prisma.server.findUnique({ where: { id } });
  if (!server) throw NotFound("Server not found");
  await prisma.server.delete({ where: { id } });
}

export async function listServers(): Promise<Server[]> {
  return prisma.server.findMany({ orderBy: { createdAt: "asc" } });
}

/** Strip secrets (panelPass / apiSecret) before sending a server over the API. */
export function toPublicServer(server: Server) {
  const { panelPass: _pp, apiSecret: _as, ...rest } = server;
  return { ...rest, hasPanel: Boolean(server.apiUrl && server.panelUser && server.panelPass && server.inboundId != null) };
}

export type PublicServer = ReturnType<typeof toPublicServer>;

export async function getServer(id: string): Promise<Server> {
  const server = await prisma.server.findUnique({ where: { id } });
  if (!server) throw NotFound("Server not found");
  return server;
}

export interface UpdateServerInput {
  name?: string;
  capacity?: number;
  status?: ServerStatus;
  apiUrl?: string;
  apiSecret?: string;
  region?: string;
  panelUser?: string;
  panelPass?: string;
  inboundId?: number;
}

export async function updateServer(id: string, input: UpdateServerInput): Promise<Server> {
  await getServer(id);
  const server = await prisma.server.update({ where: { id }, data: input });
  return reconcileStatus(server.id);
}

/**
 * Recompute derived status based on load, unless the server is offline (manual)
 * or explicitly set. Implements the FULL SERVER LOGIC from the spec.
 */
export async function reconcileStatus(id: string): Promise<Server> {
  const server = await prisma.server.findUnique({ where: { id } });
  if (!server) throw NotFound("Server not found");
  if (server.status === "offline") return server;

  let status: ServerStatus = server.status;
  const ratio = server.capacity > 0 ? server.currentUsers / server.capacity : 1;

  if (server.currentUsers >= server.capacity) {
    status = "full";
  } else if (ratio >= 0.8) {
    status = "warm";
  } else {
    status = "active";
  }

  if (status !== server.status) {
    return prisma.server.update({ where: { id }, data: { status } });
  }
  return server;
}

/** Atomically increment load and reconcile status. */
export async function incrementLoad(id: string, delta = 1): Promise<Server> {
  await prisma.server.update({
    where: { id },
    data: { currentUsers: { increment: delta } },
  });
  return reconcileStatus(id);
}

export async function decrementLoad(id: string, delta = 1): Promise<Server> {
  // Atomic, clamped at 0 to avoid drift from concurrent updates.
  await prisma.server.updateMany({
    where: { id, currentUsers: { gte: delta } },
    data: { currentUsers: { decrement: delta } },
  });
  await prisma.server.updateMany({
    where: { id, currentUsers: { lt: delta } },
    data: { currentUsers: 0 },
  });
  return reconcileStatus(id);
}

/**
 * Reconcile each server's currentUsers counter with the actual number of
 * active access keys in the DB (the source of truth), then recompute status.
 * Run periodically to correct any drift.
 */
export async function reconcileServerLoads(): Promise<void> {
  const servers = await prisma.server.findMany({ select: { id: true, currentUsers: true } });
  for (const s of servers) {
    const actual = await prisma.accessKey.count({ where: { serverId: s.id, active: true } });
    if (actual !== s.currentUsers) {
      await prisma.server.update({ where: { id: s.id }, data: { currentUsers: actual } });
    }
    await reconcileStatus(s.id);
  }
}

export async function setOffline(id: string, offline: boolean): Promise<Server> {
  await getServer(id);
  if (offline) {
    return prisma.server.update({ where: { id }, data: { status: "offline" } });
  }
  // bring back online -> recompute from load
  await prisma.server.update({ where: { id }, data: { status: "active" } });
  return reconcileStatus(id);
}

/**
 * Health check: ping each server's 3x-ui panel (login + list inbounds).
 * Servers that fail are marked offline; recovered servers return to active.
 * Servers without panel credentials are left untouched.
 */
export async function healthCheck(): Promise<{ id: string; status: ServerStatus; ok: boolean }[]> {
  const servers = await prisma.server.findMany();
  const results: { id: string; status: ServerStatus; ok: boolean }[] = [];
  for (const s of servers) {
    const hasPanel = Boolean(s.apiUrl && s.panelUser && s.panelPass && s.inboundId != null);
    let ok = true;

    if (hasPanel) {
      const xui = new XuiClient(s.apiUrl!, s.panelUser!, s.panelPass!);
      ok = await xui.ping();
      if (!ok && s.status !== "offline") {
        await prisma.server.update({ where: { id: s.id }, data: { status: "offline" } });
        logger.warn("Server marked offline (panel unreachable)", { id: s.id, name: s.name });
      } else if (ok && s.status === "offline") {
        await prisma.server.update({ where: { id: s.id }, data: { status: "active" } });
        await reconcileStatus(s.id);
        logger.info("Server recovered", { id: s.id, name: s.name });
      }
    }

    await prisma.server.update({ where: { id: s.id }, data: { lastHealthAt: new Date() } });
    results.push({ id: s.id, status: s.status, ok });
  }
  return results;
}
