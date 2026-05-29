import { tg } from "./telegram";
import type {
  AccessConfig,
  Plan,
  ReferralInfo,
  ReferralStats,
  ServerItem,
  SubStatus,
} from "../types";

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

let token: string | null = null;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      message = body?.error?.message ?? message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export async function authenticate(): Promise<void> {
  const initData = tg?.initData ?? "";
  const { token: t } = await request<{ token: string }>("/auth/telegram", {
    method: "POST",
    body: JSON.stringify({ initData }),
  });
  token = t;
}

export const api = {
  status: () => request<SubStatus>("/subscription/status"),
  plans: () => request<Plan[]>("/payment/plans"),
  invoiceLink: (plan: string) =>
    request<{ link: string; payload: string }>("/payment/invoice-link", {
      method: "POST",
      body: JSON.stringify({ plan }),
    }),
  servers: () => request<ServerItem[]>("/servers/list"),
  generate: (deviceHash: string, serverId?: string) =>
    request<AccessConfig>("/access/generate", {
      method: "POST",
      body: JSON.stringify({ deviceHash, serverId }),
    }),
  config: () => request<{ config: string | null; serverId?: string }>("/access/config"),
  referralInfo: () => request<ReferralInfo>("/referral/code"),
  referralStats: () => request<ReferralStats>("/referral/stats"),
};
