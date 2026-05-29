import dotenv from "dotenv";

dotenv.config();

const isProd = (process.env.NODE_ENV ?? "development") === "production";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const DEV_JWT_FALLBACK = "dev_secret_change_me";

/** JWT secret: mandatory and non-default in production. */
function resolveJwtSecret(): string {
  const value = process.env.JWT_SECRET;
  if (isProd) {
    if (!value || value === DEV_JWT_FALLBACK || value.length < 16) {
      throw new Error(
        "JWT_SECRET must be set to a strong value (>=16 chars) in production"
      );
    }
    return value;
  }
  return value ?? DEV_JWT_FALLBACK;
}

type ProcessRole = "all" | "api" | "worker";
const role = (process.env.PROCESS_ROLE ?? "all") as ProcessRole;

export const config = {
  env: process.env.NODE_ENV ?? "development",
  isProd,
  // Process role for horizontal scaling:
  //  all    -> API + bot + cron (single instance, default)
  //  api    -> API only (run many behind a load balancer)
  //  worker -> bot + cron only (run exactly one)
  role,
  runApi: role === "all" || role === "api",
  runWorker: role === "all" || role === "worker",
  port: parseInt(process.env.PORT ?? "4000", 10),
  publicApiUrl: process.env.PUBLIC_API_URL ?? "http://localhost:4000",
  corsOrigins: (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  jwtSecret: resolveJwtSecret(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
    botUsername: process.env.TELEGRAM_BOT_USERNAME ?? "",
    paymentProviderToken: process.env.TELEGRAM_PAYMENT_PROVIDER_TOKEN ?? "",
    miniAppUrl: process.env.MINI_APP_URL ?? "http://localhost:5173",
  },

  payments: {
    // Shared secret required to call POST /payment/webhook. If empty, the
    // webhook is disabled (Telegram Stars confirm via the bot does not need it).
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET ?? "",
  },

  rules: {
    trialDays: parseInt(process.env.TRIAL_DAYS ?? "14", 10),
    referralRewardDays: parseInt(process.env.REFERRAL_REWARD_DAYS ?? "7", 10),
    referralDailyLimit: parseInt(process.env.REFERRAL_DAILY_LIMIT ?? "10", 10),
    // Max simultaneous devices per VPN key (3x-ui limitIp). 0 = unlimited.
    deviceLimit: parseInt(process.env.DEVICE_LIMIT ?? "1", 10),
    // Days after subscription expiry before the VPN key is fully deleted.
    // During grace the key is disabled (not deleted) so renewals restore it.
    graceDays: parseInt(process.env.GRACE_DAYS ?? "2", 10),
  },

  admin: {
    email: process.env.ADMIN_EMAIL ?? "admin@example.com",
    password: process.env.ADMIN_PASSWORD ?? "admin12345",
  },
};

export type AppConfig = typeof config;
