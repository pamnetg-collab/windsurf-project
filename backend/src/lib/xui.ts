import crypto from "crypto";
import { logger } from "./logger";

/**
 * Minimal client for the 3x-ui (x-ui) panel HTTP API.
 *
 * Auth flow: POST {base}/login -> Set-Cookie session, reused for the
 * /panel/api/inbounds/* endpoints. Cookie is cached and refreshed on 401.
 *
 * Tested against the MHSanaei/3x-ui fork.
 */

export interface XuiInboundClient {
  id: string; // vless uuid
  email: string;
  flow?: string;
  limitIp?: number;
  totalGB?: number;
  expiryTime?: number; // ms epoch, 0 = unlimited
  enable?: boolean;
  tgId?: string;
  subId?: string;
  reset?: number;
}

export interface XuiInbound {
  id: number;
  port: number;
  protocol: string;
  remark: string;
  enable: boolean;
  settings: string; // JSON string
  streamSettings: string; // JSON string
}

export interface XuiTraffic {
  up: number;
  down: number;
  total: number;
  expiryTime: number;
  enable: boolean;
}

export class XuiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XuiError";
  }
}

interface FetchInit {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
}

export class XuiClient {
  private base: string;
  private username: string;
  private password: string;
  private cookie: string | null = null;

  constructor(baseUrl: string, username: string, password: string) {
    // Normalise: strip trailing slash.
    this.base = baseUrl.replace(/\/+$/, "");
    this.username = username;
    this.password = password;
  }

  private async login(): Promise<void> {
    // 3x-ui's /login expects application/x-www-form-urlencoded.
    const form = new URLSearchParams({
      username: this.username,
      password: this.password,
    });
    const res = await fetch(`${this.base}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const setCookie = res.headers.get("set-cookie");
    let body: { success?: boolean; msg?: string } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      /* non-json */
    }
    if (!res.ok || body.success === false || !setCookie) {
      throw new XuiError(`3x-ui login failed: ${body.msg ?? res.status}`);
    }
    // Keep only the "name=value" portion of each cookie.
    this.cookie = setCookie
      .split(/,(?=[^;]+?=)/)
      .map((c) => c.split(";")[0].trim())
      .join("; ");
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    retry = true
  ): Promise<T> {
    if (!this.cookie) await this.login();
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Cookie: this.cookie ?? "",
        ...(init.headers ?? {}),
      },
    });

    if (res.status === 401 || res.status === 307 || res.status === 302) {
      if (retry) {
        this.cookie = null;
        return this.request<T>(path, init, false);
      }
      throw new XuiError("3x-ui unauthorized");
    }

    let body: { success?: boolean; msg?: string; obj?: unknown } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      throw new XuiError(`3x-ui non-JSON response (${res.status}) for ${path}`);
    }
    if (!res.ok || body.success === false) {
      throw new XuiError(`3x-ui API error for ${path}: ${body.msg ?? res.status}`);
    }
    return body.obj as T;
  }

  /** Verify connectivity + credentials. Returns true if the panel is reachable. */
  async ping(): Promise<boolean> {
    try {
      this.cookie = null;
      await this.login();
      await this.listInbounds();
      return true;
    } catch (err) {
      logger.warn("3x-ui ping failed", { base: this.base, err: String(err) });
      return false;
    }
  }

  async listInbounds(): Promise<XuiInbound[]> {
    return this.request<XuiInbound[]>("/panel/api/inbounds/list", { method: "GET" });
  }

  async getInbound(inboundId: number): Promise<XuiInbound> {
    return this.request<XuiInbound>(`/panel/api/inbounds/get/${inboundId}`, {
      method: "GET",
    });
  }

  async addClient(inboundId: number, client: XuiInboundClient): Promise<void> {
    await this.request("/panel/api/inbounds/addClient", {
      method: "POST",
      body: JSON.stringify({
        id: inboundId,
        settings: JSON.stringify({ clients: [normaliseClient(client)] }),
      }),
    });
  }

  async deleteClient(inboundId: number, clientUuid: string): Promise<void> {
    await this.request(`/panel/api/inbounds/${inboundId}/delClient/${clientUuid}`, {
      method: "POST",
    });
  }

  async updateClient(inboundId: number, client: XuiInboundClient): Promise<void> {
    await this.request(`/panel/api/inbounds/updateClient/${client.id}`, {
      method: "POST",
      body: JSON.stringify({
        id: inboundId,
        settings: JSON.stringify({ clients: [normaliseClient(client)] }),
      }),
    });
  }

  async getClientTraffic(email: string): Promise<XuiTraffic | null> {
    try {
      const obj = await this.request<XuiTraffic | null>(
        `/panel/api/inbounds/getClientTraffics/${encodeURIComponent(email)}`,
        { method: "GET" }
      );
      return obj ?? null;
    } catch {
      return null;
    }
  }
}

function normaliseClient(c: XuiInboundClient): XuiInboundClient {
  return {
    id: c.id,
    email: c.email,
    flow: c.flow ?? "",
    limitIp: c.limitIp ?? 0,
    totalGB: c.totalGB ?? 0,
    expiryTime: c.expiryTime ?? 0,
    enable: c.enable ?? true,
    tgId: c.tgId ?? "",
    subId: c.subId ?? crypto.randomBytes(8).toString("hex"),
    reset: c.reset ?? 0,
  };
}

/**
 * Build a vless:// connection link from a live 3x-ui inbound definition and a
 * provisioned client. Supports reality / tls / none with tcp / ws / grpc.
 */
export function buildVlessLink(params: {
  inbound: XuiInbound;
  clientUuid: string;
  address: string;
  label: string;
  flow?: string;
}): string {
  const { inbound, clientUuid, address, label } = params;
  const stream = safeParse(inbound.streamSettings);
  const network: string = stream.network ?? "tcp";
  const security: string = stream.security ?? "none";

  const q = new URLSearchParams();
  q.set("type", network);
  q.set("security", security);

  if (security === "reality") {
    const rs = stream.realitySettings ?? {};
    const settings = rs.settings ?? {};
    q.set("pbk", settings.publicKey ?? "");
    q.set("fp", settings.fingerprint ?? "chrome");
    const sni = Array.isArray(rs.serverNames) ? rs.serverNames[0] : rs.serverNames;
    if (sni) q.set("sni", sni);
    const sid = Array.isArray(rs.shortIds) ? rs.shortIds[0] : rs.shortIds;
    if (sid) q.set("sid", sid);
    if (settings.spiderX) q.set("spx", settings.spiderX);
    const flow = params.flow ?? "xtls-rprx-vision";
    if (flow) q.set("flow", flow);
  } else if (security === "tls") {
    const ts = stream.tlsSettings ?? {};
    if (ts.serverName) q.set("sni", ts.serverName);
    const fp = ts.settings?.fingerprint ?? "chrome";
    q.set("fp", fp);
    if (Array.isArray(ts.alpn) && ts.alpn.length) q.set("alpn", ts.alpn.join(","));
  }

  if (network === "ws") {
    const ws = stream.wsSettings ?? {};
    if (ws.path) q.set("path", ws.path);
    const hostHeader = ws.headers?.Host ?? ws.host;
    if (hostHeader) q.set("host", hostHeader);
  } else if (network === "grpc") {
    const g = stream.grpcSettings ?? {};
    if (g.serviceName) q.set("serviceName", g.serviceName);
  }

  return `vless://${clientUuid}@${address}:${inbound.port}?${q.toString()}#${encodeURIComponent(label)}`;
}

/** Extract the default flow configured on the inbound's first client, if any. */
export function inboundDefaultFlow(inbound: XuiInbound): string | undefined {
  const settings = safeParse(inbound.settings);
  const first = Array.isArray(settings.clients) ? settings.clients[0] : undefined;
  return first?.flow || undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeParse(json: string): any {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}
