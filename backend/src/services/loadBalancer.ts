import { prisma } from "../lib/prisma";
import { config } from "../config";
import { AppError } from "../lib/errors";
import type { Server } from "@prisma/client";

/** In production only serve servers with a configured 3x-ui panel (real keys). */
function isUsable(s: Server): boolean {
  if (s.currentUsers >= s.capacity) return false;
  if (config.isProd) {
    return Boolean(s.apiUrl && s.panelUser && s.panelPass && s.inboundId != null);
  }
  return true;
}

/**
 * AUTO SELECT ALGORITHM (per spec):
 *  1. filter: status in (active, warm) AND current_users < capacity
 *  2. sort:   lowest load ratio first, then most recently healthy (stability)
 *  3. return: the best server
 *
 * `full` and `offline` servers are excluded from the AUTO pool.
 */
export async function selectAutoServer(): Promise<Server> {
  const candidates = await prisma.server.findMany({
    where: {
      status: { in: ["active", "warm"] },
    },
  });

  const pool = candidates.filter(isUsable);
  if (pool.length === 0) {
    throw new AppError(503, "No available servers", "no_servers");
  }

  pool.sort((a, b) => {
    const loadA = a.capacity > 0 ? a.currentUsers / a.capacity : 1;
    const loadB = b.capacity > 0 ? b.currentUsers / b.capacity : 1;
    if (loadA !== loadB) return loadA - loadB; // lowest load first
    // stability tie-breaker: prefer active over warm, then most recent health
    if (a.status !== b.status) return a.status === "active" ? -1 : 1;
    const hA = a.lastHealthAt?.getTime() ?? 0;
    const hB = b.lastHealthAt?.getTime() ?? 0;
    return hB - hA;
  });

  return pool[0];
}

/** Servers a user may manually pick (excludes full/offline). */
export async function listSelectableServers(): Promise<Server[]> {
  const servers = await prisma.server.findMany({
    where: { status: { in: ["active", "warm"] } },
    orderBy: { region: "asc" },
  });
  return servers.filter(isUsable);
}
