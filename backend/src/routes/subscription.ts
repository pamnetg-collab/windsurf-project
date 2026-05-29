import { Router } from "express";
import { z } from "zod";
import { requireUser } from "../middleware/auth";
import { asyncHandler } from "../middleware/async";
import * as subscriptionService from "../services/subscriptionService";
import * as paymentService from "../services/paymentService";

export const subscriptionRouter = Router();

subscriptionRouter.use(requireUser);

/** POST /subscription/trial — start the 14-day trial. */
subscriptionRouter.post(
  "/trial",
  asyncHandler(async (req, res) => {
    const sub = await subscriptionService.startTrial(req.user!.sub);
    res.json({ subscription: sub });
  })
);

const createSchema = z.object({ plan: z.enum(["m1", "m3"]) });

/**
 * POST /subscription/create — create a payment invoice for a paid plan.
 * Activation happens after payment confirmation (see /payment/webhook).
 */
subscriptionRouter.post(
  "/create",
  asyncHandler(async (req, res) => {
    const { plan } = createSchema.parse(req.body);
    const { payment, info } = await paymentService.createPayment(req.user!.sub, plan);
    res.json({ payment, info });
  })
);

const renewSchema = z.object({ plan: z.enum(["m1", "m3"]) });

/** POST /subscription/renew — same flow as create (stacking handled on activate). */
subscriptionRouter.post(
  "/renew",
  asyncHandler(async (req, res) => {
    const { plan } = renewSchema.parse(req.body);
    const { payment, info } = await paymentService.createPayment(req.user!.sub, plan);
    res.json({ payment, info });
  })
);

/** GET /subscription/status — current subscription state for the user. */
subscriptionRouter.get(
  "/status",
  asyncHandler(async (req, res) => {
    const status = await subscriptionService.getStatus(req.user!.sub);
    res.json(status);
  })
);
