import { useEffect, useState } from "react";
import { Users, CreditCard, Server, Gift, TrendingUp, Activity } from "lucide-react";
import { api } from "../lib/api";
import type { Analytics } from "../types";

function StatCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string | number;
  icon: typeof Users;
  hint?: string;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">{label}</span>
        <Icon size={18} className="text-brand-500" />
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<Analytics>("/admin/analytics")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="text-red-600">{error}</div>;
  if (!data) return <div className="text-slate-400">Загрузка...</div>;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Дашборд</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Всего пользователей"
          value={data.users.total}
          icon={Users}
          hint={`Активных: ${data.users.active} · Trial: ${data.users.trial}`}
        />
        <StatCard
          label="Активные подписки"
          value={data.subscriptions.active}
          icon={Activity}
        />
        <StatCard
          label="Конверсия"
          value={`${data.conversion}%`}
          icon={TrendingUp}
          hint="Активные / всего"
        />
        <StatCard
          label="Доход (Stars)"
          value={data.payments.revenue}
          icon={CreditCard}
          hint={`Платежей: ${data.payments.count}`}
        />
        <StatCard
          label="Рефералы (начислено)"
          value={data.referrals.rewarded}
          icon={Gift}
        />
        <StatCard
          label="Серверы"
          value={data.servers.count}
          icon={Server}
          hint={`Загрузка: ${data.servers.utilization}% (${data.servers.totalLoad}/${data.servers.totalCapacity})`}
        />
      </div>

      <div className="mt-8 bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <h2 className="font-semibold mb-4">Распределение пользователей</h2>
        <div className="space-y-3">
          {[
            { label: "Активные", value: data.users.active, color: "bg-emerald-500" },
            { label: "Trial", value: data.users.trial, color: "bg-blue-500" },
            { label: "Истёкшие", value: data.users.expired, color: "bg-amber-500" },
            { label: "Забанены", value: data.users.banned, color: "bg-red-500" },
          ].map((row) => {
            const pct = data.users.total > 0 ? (row.value / data.users.total) * 100 : 0;
            return (
              <div key={row.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{row.label}</span>
                  <span className="text-slate-500">{row.value}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full ${row.color}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
