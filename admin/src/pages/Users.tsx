import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { api } from "../lib/api";
import type { AdminUser, UsersResponse, UserStatus } from "../types";

const STATUS_STYLES: Record<UserStatus, string> = {
  active: "bg-emerald-100 text-emerald-700",
  trial: "bg-blue-100 text-blue-700",
  expired: "bg-amber-100 text-amber-700",
  banned: "bg-red-100 text-red-700",
};

export default function Users() {
  const [data, setData] = useState<UsersResponse | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");

  function load() {
    const params = new URLSearchParams({ page: String(page) });
    if (q) params.set("q", q);
    api
      .get<UsersResponse>(`/admin/users?${params.toString()}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }

  useEffect(load, [page]);

  async function extend(u: AdminUser) {
    const input = prompt(`Продлить подписку (дней) для ${u.username ?? u.telegramId}:`, "30");
    if (!input) return;
    await api.post(`/admin/users/${u.id}/extend`, { days: Number(input) });
    load();
  }

  async function toggleBan(u: AdminUser) {
    const banned = u.status !== "banned";
    if (!confirm(banned ? "Забанить пользователя?" : "Разбанить?")) return;
    await api.post(`/admin/users/${u.id}/ban`, { banned });
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Пользователи</h1>

      <div className="flex gap-2 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (setPage(1), load())}
            placeholder="Поиск по username или telegram_id"
            className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <button
          onClick={() => {
            setPage(1);
            load();
          }}
          className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm hover:bg-brand-700"
        >
          Найти
        </button>
      </div>

      {error && <div className="text-red-600 mb-4">{error}</div>}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left px-4 py-3">Пользователь</th>
              <th className="text-left px-4 py-3">Telegram ID</th>
              <th className="text-left px-4 py-3">Статус</th>
              <th className="text-left px-4 py-3">Подписка до</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {data?.users.map((u) => {
              const sub = u.subscriptions[0];
              return (
                <tr key={u.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium">
                    {u.username ? `@${u.username}` : u.firstName ?? "—"}
                    <div className="text-xs text-slate-400">code: {u.referralCode}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{u.telegramId}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[u.status]}`}>
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {sub ? new Date(sub.endDate).toLocaleDateString("ru-RU") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right space-x-3">
                    <button onClick={() => extend(u)} className="text-brand-600 hover:underline">
                      Продлить
                    </button>
                    <button onClick={() => toggleBan(u)} className="text-red-600 hover:underline">
                      {u.status === "banned" ? "Разбан" : "Бан"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {data && data.users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Ничего не найдено
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && data.pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4 text-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1 rounded-lg border border-slate-300 disabled:opacity-40"
          >
            Назад
          </button>
          <span className="text-slate-500">
            {data.page} / {data.pages}
          </span>
          <button
            disabled={page >= data.pages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 rounded-lg border border-slate-300 disabled:opacity-40"
          >
            Вперёд
          </button>
        </div>
      )}
    </div>
  );
}
