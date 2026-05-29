import { Router } from "express";
import { authRouter } from "./auth";
import { subscriptionRouter } from "./subscription";
import { serverRouter } from "./servers";
import { accessRouter } from "./access";
import { referralRouter } from "./referral";
import { paymentRouter } from "./payments";
import { adminRouter } from "./admin";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

apiRouter.use("/auth", authRouter);
apiRouter.use("/subscription", subscriptionRouter);
apiRouter.use("/servers", serverRouter);
apiRouter.use("/access", accessRouter);
apiRouter.use("/referral", referralRouter);
apiRouter.use("/payment", paymentRouter);
apiRouter.use("/admin", adminRouter);
