import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { prisma } from "../lib/prisma";
import { config } from "../config";
import { asyncHandler } from "../middleware/async";
import { requireAdmin, signAdminToken } from "../middleware/auth";
import { Unauthorized } from "../lib/errors";
import * as serverManager from "../services/serverManager";
import * as subscriptionService from "../services/subscriptionService";
import * as paymentService from "../services/paymentService";
import { banUser } from "../services/userService";
import { revokeUserKeys } from "../services/accessGenerator";

export const adminRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Brute-force protection: max 10 login attempts per IP per 15 minutes.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "Too many login attempts, try again later" } },
});

/** POST /admin/login — issues an admin JWT. */
adminRouter.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const admin = await prisma.admin.findUnique({ where: { email } });
    if (!admin) throw Unauthorized("Invalid credentials");
    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) throw Unauthorized("Invalid credentials");
    const token = signAdminToken({ sub: admin.id, email: admin.email });
    res.json({ token, admin: { id: admin.id, email: admin.email } });
  })
);

// All routes below require an admin token.
adminRouter.use(requireAdmin);

/** GET /admin/analytics — high-level platform metrics. */
adminRouter.get(
  "/analytics",
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const [
      totalUsers,
      activeUsers,
      trialUsers,
      expiredUsers,
      bannedUsers,
      activeSubs,
      paidPayments,
      revenueAgg,
      referralsRewarded,
      servers,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: "active" } }),
      prisma.user.count({ where: { status: "trial" } }),
      prisma.user.count({ where: { status: "expired" } }),
      prisma.user.count({ where: { status: "banned" } }),
      prisma.subscription.count({ where: { status: "active", endDate: { gt: now } } }),
      prisma.payment.count({ where: { status: "paid" } }),
      prisma.payment.aggregate({ where: { status: "paid" }, _sum: { amount: true } }),
      prisma.referral.count({ where: { status: "rewarded" } }),
      prisma.server.findMany(),
    ]);

    const totalCapacity = servers.reduce((a, s) => a + s.capacity, 0);
    const totalLoad = servers.reduce((a, s) => a + s.currentUsers, 0);
    const conversion = totalUsers > 0 ? +(activeUsers / totalUsers * 100).toFixed(1) : 0;

    res.json({
      users: { total: totalUsers, active: activeUsers, trial: trialUsers, expired: expiredUsers, banned: bannedUsers },
      subscriptions: { active: activeSubs },
      payments: { count: paidPayments, revenue: revenueAgg._sum.amount ?? 0 },
      referrals: { rewarded: referralsRewarded },
      conversion,
      servers: {
        count: servers.length,
        totalCapacity,
        totalLoad,
        utilization: totalCapacity > 0 ? +(totalLoad / totalCapacity * 100).toFixed(1) : 0,
      },
    });
  })
);

/** GET /admin/servers — server list with load (secrets redacted). */
adminRouter.get(
  "/servers",
  asyncHandler(async (_req, res) => {
    const servers = await serverManager.listServers();
    res.json(servers.map(serverManager.toPublicServer));
  })
);

const updateServerSchema = z.object({
  name: z.string().optional(),
  capacity: z.number().int().positive().optional(),
  status: z.enum(["active", "warm", "full", "offline"]).optional(),
  region: z.string().optional(),
  apiUrl: z.string().url().optional(),
  apiSecret: z.string().optional(),
  panelUser: z.string().optional(),
  panelPass: z.string().optional(),
  inboundId: z.number().int().positive().optional(),
});

/** PATCH /admin/servers/:id — update capacity/status/etc. */
adminRouter.patch(
  "/servers/:id",
  asyncHandler(async (req, res) => {
    const input = updateServerSchema.parse(req.body);
    const server = await serverManager.updateServer(req.params.id, input);
    res.json(serverManager.toPublicServer(server));
  })
);

/** GET /admin/users — searchable, paginated user list. */
adminRouter.get(
  "/users",
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
    const take = 20;
    const where = q
      ? {
          OR: [
            { username: { contains: q, mode: "insensitive" as const } },
            ...(/^\d+$/.test(q) ? [{ telegramId: BigInt(q) }] : []),
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * take,
        take,
        include: {
          subscriptions: {
            where: { status: "active" },
            orderBy: { endDate: "desc" },
            take: 1,
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ users, total, page, pages: Math.ceil(total / take) });
  })
);

const extendSchema = z.object({ days: z.number().int().positive() });

/** POST /admin/users/:id/extend — extend a user's subscription. */
adminRouter.post(
  "/users/:id/extend",
  asyncHandler(async (req, res) => {
    const { days } = extendSchema.parse(req.body);
    const sub = await subscriptionService.extendByDays(req.params.id, days);
    res.json(sub);
  })
);

const banSchema = z.object({ banned: z.boolean() });

/** POST /admin/users/:id/ban — ban or unban a user. */
adminRouter.post(
  "/users/:id/ban",
  asyncHandler(async (req, res) => {
    const { banned } = banSchema.parse(req.body);
    const user = await banUser(req.params.id, banned);
    if (banned) await revokeUserKeys(req.params.id);
    res.json(user);
  })
);

/** GET /admin/payments — recent payments (paginated). */
adminRouter.get(
  "/payments",
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
    const take = 20;
    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * take,
        take,
        include: { user: { select: { telegramId: true, username: true } } },
      }),
      prisma.payment.count(),
    ]);
    res.json({ payments, total, page, pages: Math.ceil(total / take) });
  })
);

/** POST /admin/payments/:id/refund — refund a paid Telegram Stars payment. */
adminRouter.post(
  "/payments/:id/refund",
  asyncHandler(async (req, res) => {
    const payment = await paymentService.refundPayment(req.params.id);
    res.json(payment);
  })
);

// Exported for seed/bootstrap reuse.
export async function ensureBootstrapAdmin() {
  const existing = await prisma.admin.findUnique({ where: { email: config.admin.email } });
  if (existing) return;
  const passwordHash = await bcrypt.hash(config.admin.password, 10);
  await prisma.admin.create({ data: { email: config.admin.email, passwordHash } });
}
