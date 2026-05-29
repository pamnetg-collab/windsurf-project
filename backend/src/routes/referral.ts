import { Router } from "express";
import { requireUser } from "../middleware/auth";
import { asyncHandler } from "../middleware/async";
import * as referralService from "../services/referralService";

export const referralRouter = Router();

referralRouter.use(requireUser);

/** GET /referral/code — referral code + share link. */
referralRouter.get(
  "/code",
  asyncHandler(async (req, res) => {
    const info = await referralService.getReferralInfo(req.user!.sub);
    res.json(info);
  })
);

/** POST /referral/claim — re-attempt claim for the current user's inviter. */
referralRouter.post(
  "/claim",
  asyncHandler(async (req, res) => {
    const claimed = await referralService.claimReferral(req.user!.sub);
    res.json({ claimed });
  })
);

/** GET /referral/stats — invited/rewarded counts + days earned. */
referralRouter.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const stats = await referralService.getStats(req.user!.sub);
    res.json(stats);
  })
);
