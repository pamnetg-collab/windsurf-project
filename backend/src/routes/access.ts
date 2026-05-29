import { Router } from "express";
import { z } from "zod";
import { requireUser } from "../middleware/auth";
import { asyncHandler } from "../middleware/async";
import * as accessGenerator from "../services/accessGenerator";
import { bindDevice } from "../services/userService";

export const accessRouter = Router();

accessRouter.use(requireUser);

const generateSchema = z.object({
  serverId: z.string().uuid().optional(), // omit => AUTO
  deviceHash: z.string().min(8),
});

/**
 * POST /access/generate
 * Binds the device (1 user = 1 device), then generates/reuses an access key.
 * If serverId is omitted, the load balancer picks the best server (AUTO).
 */
accessRouter.post(
  "/generate",
  asyncHandler(async (req, res) => {
    const { serverId, deviceHash } = generateSchema.parse(req.body);
    await bindDevice(req.user!.sub, deviceHash);
    const result = await accessGenerator.generateAccess(req.user!.sub, serverId);
    res.json({
      config: result.accessKey.config,
      server: {
        id: result.server.id,
        name: result.server.name,
        region: result.server.region,
      },
    });
  })
);

/** GET /access/config — latest active config for the user. */
accessRouter.get(
  "/config",
  asyncHandler(async (req, res) => {
    const key = await accessGenerator.getConfig(req.user!.sub);
    if (!key) {
      res.json({ config: null });
      return;
    }
    res.json({ config: key.config, serverId: key.serverId });
  })
);
