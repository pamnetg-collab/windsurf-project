// Minimal typings + helpers around the Telegram WebApp SDK.
interface TgWebAppUser {
  id: number;
  first_name?: string;
  username?: string;
}

interface TgWebApp {
  initData: string;
  initDataUnsafe: { user?: TgWebAppUser; start_param?: string };
  colorScheme: "light" | "dark";
  themeParams: Record<string, string>;
  ready: () => void;
  expand: () => void;
  openInvoice: (url: string, cb: (status: string) => void) => void;
  openTelegramLink: (url: string) => void;
  HapticFeedback?: { notificationOccurred: (t: "error" | "success" | "warning") => void };
  showAlert?: (msg: string) => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

export const tg = window.Telegram?.WebApp;

export function initTelegram() {
  tg?.ready();
  tg?.expand();
}

export function tgUser(): TgWebAppUser | undefined {
  return tg?.initDataUnsafe?.user;
}

/** Stable device hash matching the bot: sha256("tg:<id>") hex. */
export async function deviceHashFor(id: number): Promise<string> {
  const data = new TextEncoder().encode(`tg:${id}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function haptic(type: "error" | "success" | "warning") {
  tg?.HapticFeedback?.notificationOccurred(type);
}
