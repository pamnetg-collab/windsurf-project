import { Router } from "express";
import { z } from "zod";
import { requireUser, requireAdmin } from "../middleware/auth";
import { asyncHandler } from "../middleware/async";
import * as serverManager from "../services/serverManager";
import { listSelectableServers } from "../services/loadBalancer";

export const serverRouter = Router();

/** GET /servers/list — selectable servers for end users (auth required). */
serverRouter.get(
  "/list",
  requireUser,
  asyncHandler(async (_req, res) => {
    const servers = await listSelectableServers();
    res.json(
      servers.map((s) => ({
        id: s.id,
        name: s.name,
        region: s.region,
        load: s.capacity > 0 ? Math.round((s.currentUsers / s.capacity) * 100) : 100,
        status: s.status,
      }))
    );
  })
);

/** GET /servers/health — admin health snapshot. */
serverRouter.get(
  "/health",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const results = await serverManager.healthCheck();
    res.json(results);
  })
);

const addSchema = z.object({
  name: z.string().min(1),
  ip: z.string().min(3),
  port: z.number().int().positive().optional(),
  region: z.string().min(1),
  capacity: z.number().int().positive().optional(),
  apiUrl: z.string().url().optional(),
  apiSecret: z.string().optional(),
  publicKey: z.string().optional(),
  sni: z.string().optional(),
  // 3x-ui panel credentials
  panelUser: z.string().optional(),
  panelPass: z.string().optional(),
  inboundId: z.number().int().positive().optional(),
});

/** POST /servers/add — admin adds a server to the pool. */
serverRouter.post(
  "/add",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const input = addSchema.parse(req.body);
    const server = await serverManager.addServer(input);
    res.status(201).json(serverManager.toPublicServer(server));
  })
);

const removeSchema = z.object({ id: z.string().uuid() });

/** POST /servers/remove — admin removes a server. */
serverRouter.post(
  "/remove",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = removeSchema.parse(req.body);
    await serverManager.removeServer(id);
    res.json({ ok: true });
  })
);
