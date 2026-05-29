import { Router } from "express";
import { z } from "zod";
import { config } from "../config";
import { verifyInitData } from "../lib/telegramAuth";
import { findOrCreateUser } from "../services/userService";
import { claimReferral } from "../services/referralService";
import { signUserToken } from "../middleware/auth";
import { asyncHandler } from "../middleware/async";
import { Unauthorized } from "../lib/errors";

export const authRouter = Router();

const schema = z.object({
  initData: z.string().min(1),
});

/**
 * POST /auth/telegram
 * Validates Telegram Mini App initData, upserts the user, claims referral on
 * first contact, and returns a JWT for subsequent API calls.
 */
authRouter.post(
  "/telegram",
  asyncHandler(async (req, res) => {
    const { initData } = schema.parse(req.body);
    const parsed = verifyInitData(initData, config.telegram.botToken);
    if (!parsed || !parsed.user) throw Unauthorized("Invalid Telegram initData");

    const { user, isNew } = await findOrCreateUser({
      telegramId: parsed.user.id,
      username: parsed.user.username,
      firstName: parsed.user.first_name,
      startParam: parsed.start_param,
    });

    if (isNew && user.referredBy) {
      await claimReferral(user.id);
    }

    const token = signUserToken({ sub: user.id, telegramId: user.telegramId.toString() });
    res.json({ token, user });
  })
);
