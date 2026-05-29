import { Router } from "express";
import { z } from "zod";
import { config } from "../config";
import { requireUser } from "../middleware/auth";
import { asyncHandler } from "../middleware/async";
import { Unauthorized, NotFound } from "../lib/errors";
import * as paymentService from "../services/paymentService";

export const paymentRouter = Router();

const createSchema = z.object({ plan: z.enum(["m1", "m3"]) });

/** POST /payment/create — create a pending payment + invoice info. */
paymentRouter.post(
  "/create",
  requireUser,
  asyncHandler(async (req, res) => {
    const { plan } = createSchema.parse(req.body);
    const { payment, info } = await paymentService.createPayment(req.user!.sub, plan);
    res.json({ payload: payment.payload, info });
  })
);

/** POST /payment/invoice-link — Stars invoice link for Mini App openInvoice(). */
paymentRouter.post(
  "/invoice-link",
  requireUser,
  asyncHandler(async (req, res) => {
    const { plan } = createSchema.parse(req.body);
    const result = await paymentService.createStarsInvoiceLink(req.user!.sub, plan);
    res.json(result);
  })
);

/** GET /payment/plans — public plan catalog (for the Mini App). */
paymentRouter.get(
  "/plans",
  requireUser,
  asyncHandler(async (_req, res) => {
    res.json(Object.values(paymentService.PLANS));
  })
);

const webhookSchema = z.object({
  payload: z.string().min(1),
  status: z.enum(["paid", "failed"]),
  providerRef: z.string().optional(),
});

/**
 * POST /payment/webhook — external provider callback (NOT used by Telegram
 * Stars; Stars are confirmed inside the bot's successful_payment handler).
 *
 * Protected by a shared secret. If PAYMENT_WEBHOOK_SECRET is not configured,
 * the endpoint is disabled entirely to avoid free-subscription abuse.
 */
paymentRouter.post(
  "/webhook",
  asyncHandler(async (req, res) => {
    if (!config.payments.webhookSecret) {
      throw NotFound("Webhook disabled");
    }
    const provided = req.header("x-webhook-secret");
    if (provided !== config.payments.webhookSecret) {
      throw Unauthorized("Invalid webhook secret");
    }
    const body = webhookSchema.parse(req.body);
    if (body.status === "paid") {
      await paymentService.confirmPayment(body.payload, body.providerRef);
    } else {
      await paymentService.failPayment(body.payload);
    }
    res.json({ ok: true });
  })
);
