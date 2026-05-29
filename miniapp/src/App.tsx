import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Shield,
  Zap,
  Server,
  Users,
  Copy,
  Check,
  QrCode,
  Crown,
  Loader2,
  AlertCircle,
  Share2,
} from "lucide-react";
import { api, authenticate } from "./lib/api";
import { initTelegram, tg, tgUser, deviceHashFor, haptic } from "./lib/telegram";
import type { Plan, ReferralInfo, ReferralStats, ServerItem, SubStatus } from "./types";

type Tab = "home" | "servers" | "referral";

export default function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("home");

  const [status, setStatus] = useState<SubStatus | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [servers, setServers] = useState<ServerItem[]>([]);
  const [referral, setReferral] = useState<ReferralInfo | null>(null);
  const [refStats, setRefStats] = useState<ReferralStats | null>(null);
  const [config, setConfig] = useState<string | null>(null);
  const [serverName, setServerName] = useState<string | null>(null);

  useEffect(() => {
    initTelegram();
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function bootstrap() {
    try {
      setLoading(true);
      await authenticate();
      await refreshAll();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  async function refreshAll() {
    const [s, p, srv, cfg] = await Promise.all([
      api.status(),
      api.plans().catch(() => []),
      api.servers().catch(() => []),
      api.config().catch(() => ({ config: null })),
    ]);
    setStatus(s);
    setPlans(p);
    setServers(srv);
    setConfig(cfg.config);
  }

  async function loadReferral() {
    try {
      const [info, stats] = await Promise.all([api.referralInfo(), api.referralStats()]);
      setReferral(info);
      setRefStats(stats);
    } catch {
      /* ignore */
    }
  }

  async function connect(serverId?: string) {
    const u = tgUser();
    if (!u) {
      setError("Откройте приложение внутри Telegram");
      return;
    }
    try {
      setError(null);
      const hash = await deviceHashFor(u.id);
      const result = await api.generate(hash, serverId);
      setConfig(result.config);
      setServerName(result.server.name);
      haptic("success");
      setTab("home");
    } catch (e) {
      haptic("error");
      setError(e instanceof Error ? e.message : "Не удалось подключиться");
    }
  }

  async function buy(plan: string) {
    try {
      setError(null);
      const { link } = await api.invoiceLink(plan);
      tg?.openInvoice(link, async (st) => {
        if (st === "paid") {
          haptic("success");
          await refreshAll();
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка оплаты");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 max-w-md mx-auto px-4 pt-6">
      <header className="flex items-center gap-2 mb-6">
        <Shield className="w-7 h-7 text-brand-500" />
        <h1 className="text-xl font-bold">VPN</h1>
      </header>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-red-500/15 text-red-300 p-3 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {tab === "home" && (
        <HomeTab
          status={status}
          plans={plans}
          config={config}
          serverName={serverName}
          onConnect={() => connect()}
          onBuy={buy}
        />
      )}
      {tab === "servers" && <ServersTab servers={servers} onPick={connect} />}
      {tab === "referral" && (
        <ReferralTab referral={referral} stats={refStats} />
      )}

      <nav className="fixed bottom-0 inset-x-0 max-w-md mx-auto border-t border-white/10 bg-black/40 backdrop-blur flex">
        <TabButton icon={<Zap />} label="Главная" active={tab === "home"} onClick={() => setTab("home")} />
        <TabButton icon={<Server />} label="Серверы" active={tab === "servers"} onClick={() => setTab("servers")} />
        <TabButton
          icon={<Users />}
          label="Друзья"
          active={tab === "referral"}
          onClick={() => {
            setTab("referral");
            if (!referral) void loadReferral();
          }}
        />
      </nav>
    </div>
  );
}

function TabButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-3 flex flex-col items-center gap-1 text-xs ${
        active ? "text-brand-500" : "text-slate-400"
      }`}
    >
      <span className="w-5 h-5">{icon}</span>
      {label}
    </button>
  );
}

function HomeTab({
  status,
  plans,
  config,
  serverName,
  onConnect,
  onBuy,
}: {
  status: SubStatus | null;
  plans: Plan[];
  config: string | null;
  serverName: string | null;
  onConnect: () => void;
  onBuy: (plan: string) => void;
}) {
  return (
    <div className="space-y-5">
      <StatusCard status={status} />

      <button
        onClick={onConnect}
        className="w-full rounded-2xl bg-brand-600 hover:bg-brand-700 active:scale-[0.99] transition py-4 font-semibold flex items-center justify-center gap-2"
      >
        <Zap className="w-5 h-5" /> Подключиться (авто-выбор)
      </button>

      {config && <ConfigCard config={config} serverName={serverName} />}

      <section>
        <h2 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-1">
          <Crown className="w-4 h-4 text-amber-400" /> Тарифы
        </h2>
        <div className="space-y-2">
          {plans.map((p) => (
            <div
              key={p.plan}
              className="rounded-2xl bg-white/5 p-4 flex items-center justify-between"
            >
              <div>
                <div className="font-semibold">{p.title}</div>
                <div className="text-xs text-slate-400">{p.description}</div>
              </div>
              <button
                onClick={() => onBuy(p.plan)}
                className="rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-semibold px-4 py-2 text-sm whitespace-nowrap"
              >
                {p.amount} ⭐
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatusCard({ status }: { status: SubStatus | null }) {
  const active = status?.active;
  return (
    <div
      className={`rounded-2xl p-5 ${
        active ? "bg-emerald-500/15" : "bg-white/5"
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">Статус</div>
      <div className="text-lg font-bold flex items-center gap-2">
        {active ? (
          <>
            <Check className="w-5 h-5 text-emerald-400" /> Подписка активна
          </>
        ) : (
          <>
            <AlertCircle className="w-5 h-5 text-slate-400" /> Нет активной подписки
          </>
        )}
      </div>
      {active && status?.endDate && (
        <div className="text-sm text-slate-300 mt-1">
          Действует до {new Date(status.endDate).toLocaleDateString("ru-RU")} (
          {status.daysLeft} дн.)
        </div>
      )}
    </div>
  );
}

function ConfigCard({ config, serverName }: { config: string; serverName: string | null }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  function copy() {
    navigator.clipboard.writeText(config).then(() => {
      setCopied(true);
      haptic("success");
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="rounded-2xl bg-white/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold flex items-center gap-2">
          <Server className="w-4 h-4 text-brand-500" />
          {serverName ? `Сервер: ${serverName}` : "Ваша конфигурация"}
        </div>
        <button onClick={() => setShowQr((v) => !v)} className="text-slate-400">
          <QrCode className="w-5 h-5" />
        </button>
      </div>

      {showQr && (
        <div className="flex justify-center bg-white rounded-xl p-4">
          <QRCodeSVG value={config} size={200} />
        </div>
      )}

      <div className="text-xs break-all bg-black/30 rounded-lg p-3 font-mono text-slate-300">
        {config}
      </div>

      <button
        onClick={copy}
        className="w-full rounded-xl bg-white/10 hover:bg-white/20 py-3 font-medium flex items-center justify-center gap-2"
      >
        {copied ? (
          <>
            <Check className="w-4 h-4 text-emerald-400" /> Скопировано
          </>
        ) : (
          <>
            <Copy className="w-4 h-4" /> Скопировать ключ
          </>
        )}
      </button>

      <Instructions config={config} />
    </div>
  );
}

function Instructions({ config }: { config: string }) {
  const apps = [
    { name: "Hiddify", url: `hiddify://import/${encodeURIComponent(config)}` },
    { name: "v2RayTun", url: `v2raytun://import/${encodeURIComponent(config)}` },
    { name: "Streisand", url: `streisand://import/${encodeURIComponent(config)}` },
  ];
  return (
    <details className="text-sm text-slate-300">
      <summary className="cursor-pointer font-medium py-1">Как подключиться?</summary>
      <ol className="list-decimal list-inside space-y-1 mt-2 text-slate-400">
        <li>Установите приложение (Hiddify / v2RayTun / Streisand).</li>
        <li>Нажмите кнопку нужного приложения ниже или скопируйте ключ и импортируйте вручную.</li>
        <li>Включите VPN в приложении.</li>
      </ol>
      <div className="flex flex-wrap gap-2 mt-3">
        {apps.map((a) => (
          <a
            key={a.name}
            href={a.url}
            className="rounded-lg bg-brand-600/80 hover:bg-brand-700 px-3 py-2 text-xs font-medium"
          >
            Открыть в {a.name}
          </a>
        ))}
      </div>
    </details>
  );
}

function ServersTab({
  servers,
  onPick,
}: {
  servers: ServerItem[];
  onPick: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-slate-300 mb-2">Выберите сервер</h2>
      {servers.length === 0 && (
        <div className="text-slate-400 text-sm">Нет доступных серверов.</div>
      )}
      {servers.map((s) => (
        <button
          key={s.id}
          onClick={() => onPick(s.id)}
          className="w-full rounded-2xl bg-white/5 hover:bg-white/10 p-4 flex items-center justify-between text-left"
        >
          <div>
            <div className="font-semibold">{s.name}</div>
            <div className="text-xs text-slate-400">{s.region}</div>
          </div>
          <div className="text-right">
            <LoadBadge load={s.load} />
          </div>
        </button>
      ))}
    </div>
  );
}

function LoadBadge({ load }: { load: number }) {
  const color =
    load < 60 ? "text-emerald-400" : load < 85 ? "text-amber-400" : "text-red-400";
  return <div className={`text-sm font-semibold ${color}`}>{load}%</div>;
}

function ReferralTab({
  referral,
  stats,
}: {
  referral: ReferralInfo | null;
  stats: ReferralStats | null;
}) {
  const [copied, setCopied] = useState(false);

  function share() {
    if (!referral) return;
    const text = `Подключайся к быстрому VPN: ${referral.link}`;
    tg?.openTelegramLink(
      `https://t.me/share/url?url=${encodeURIComponent(referral.link)}&text=${encodeURIComponent(text)}`
    );
  }

  function copy() {
    if (!referral) return;
    navigator.clipboard.writeText(referral.link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white/5 p-5">
        <div className="text-sm text-slate-300">
          Приглашайте друзей — за каждого получайте бонусные дни подписки.
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-2">
          <StatBox label="Приглашено" value={stats.invited} />
          <StatBox label="Засчитано" value={stats.rewarded} />
          <StatBox label="Дней получено" value={stats.daysEarned} />
        </div>
      )}

      {referral && (
        <div className="rounded-2xl bg-white/5 p-4 space-y-3">
          <div className="text-xs text-slate-400">Ваша ссылка</div>
          <div className="text-xs break-all font-mono bg-black/30 rounded-lg p-3 text-slate-300">
            {referral.link}
          </div>
          <div className="flex gap-2">
            <button
              onClick={share}
              className="flex-1 rounded-xl bg-brand-600 hover:bg-brand-700 py-3 font-medium flex items-center justify-center gap-2"
            >
              <Share2 className="w-4 h-4" /> Поделиться
            </button>
            <button
              onClick={copy}
              className="rounded-xl bg-white/10 hover:bg-white/20 px-4 py-3"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/5 p-3 text-center">
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[10px] text-slate-400">{label}</div>
    </div>
  );
}
