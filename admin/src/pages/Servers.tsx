import { useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import type { Server, ServerStatus } from "../types";

const STATUS_STYLES: Record<ServerStatus, string> = {
  active: "bg-emerald-100 text-emerald-700",
  warm: "bg-amber-100 text-amber-700",
  full: "bg-red-100 text-red-700",
  offline: "bg-slate-200 text-slate-600",
};

const STATUS_OPTIONS: ServerStatus[] = ["active", "warm", "full", "offline"];

export default function Servers() {
  const [servers, setServers] = useState<Server[]>([]);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    name: "",
    ip: "",
    region: "",
    capacity: 100,
    port: 443,
    apiUrl: "",
    panelUser: "",
    panelPass: "",
    inboundId: 1,
  });

  function load() {
    api.get<Server[]>("/admin/servers").then(setServers).catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function addServer(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/servers/add", {
        name: form.name,
        ip: form.ip,
        region: form.region,
        capacity: Number(form.capacity),
        port: Number(form.port),
        apiUrl: form.apiUrl || undefined,
        panelUser: form.panelUser || undefined,
        panelPass: form.panelPass || undefined,
        inboundId: form.apiUrl ? Number(form.inboundId) : undefined,
      });
      setShowAdd(false);
      setForm({ name: "", ip: "", region: "", capacity: 100, port: 443, apiUrl: "", panelUser: "", panelPass: "", inboundId: 1 });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function updateStatus(id: string, status: ServerStatus) {
    await api.patch(`/admin/servers/${id}`, { status });
    load();
  }

  async function updateCapacity(id: string, capacity: number) {
    await api.patch(`/admin/servers/${id}`, { capacity });
    load();
  }

  async function removeServer(id: string) {
    if (!confirm("Удалить сервер?")) return;
    await api.post("/servers/remove", { id });
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Серверы</h1>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50"
          >
            <RefreshCw size={16} /> Обновить
          </button>
          <button
            onClick={() => setShowAdd((s) => !s)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-brand-600 text-white text-sm hover:bg-brand-700"
          >
            <Plus size={16} /> Добавить
          </button>
        </div>
      </div>

      {error && <div className="text-red-600 mb-4">{error}</div>}

      {showAdd && (
        <form
          onSubmit={addServer}
          className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 mb-6 grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          <input
            placeholder="Название"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
            required
          />
          <input
            placeholder="IP сервера"
            value={form.ip}
            onChange={(e) => setForm({ ...form, ip: e.target.value })}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
            required
          />
          <input
            placeholder="Регион (напр. NL)"
            value={form.region}
            onChange={(e) => setForm({ ...form, region: e.target.value })}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
            required
          />
          <input
            type="number"
            placeholder="Лимит пользователей"
            value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
            required
          />

          <div className="col-span-2 md:col-span-4 mt-2 text-xs font-medium text-slate-500">
            Подключение к панели 3x-ui (для автоматической выдачи ключей)
          </div>
          <input
            placeholder="URL панели, напр. http://IP:2053/путь"
            value={form.apiUrl}
            onChange={(e) => setForm({ ...form, apiUrl: e.target.value })}
            className="col-span-2 border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            placeholder="Логин панели"
            value={form.panelUser}
            onChange={(e) => setForm({ ...form, panelUser: e.target.value })}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="password"
            placeholder="Пароль панели"
            value={form.panelPass}
            onChange={(e) => setForm({ ...form, panelPass: e.target.value })}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="number"
            placeholder="Inbound ID (напр. 1)"
            value={form.inboundId}
            onChange={(e) => setForm({ ...form, inboundId: Number(e.target.value) })}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="number"
            placeholder="Порт (для ссылки)"
            value={form.port}
            onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />

          <button className="col-span-2 md:col-span-4 bg-brand-600 text-white rounded-lg py-2 text-sm hover:bg-brand-700">
            Создать сервер
          </button>
        </form>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left px-4 py-3">Сервер</th>
              <th className="text-left px-4 py-3">Регион</th>
              <th className="text-left px-4 py-3">Загрузка</th>
              <th className="text-left px-4 py-3">Capacity</th>
              <th className="text-left px-4 py-3">Статус</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {servers.map((s) => {
              const pct = s.capacity > 0 ? Math.round((s.currentUsers / s.capacity) * 100) : 0;
              return (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium">
                    {s.name}
                    <div className="text-xs text-slate-400">{s.ip}:{s.port}</div>
                    <div className="text-xs">
                      {s.apiUrl ? (
                        <span className="text-emerald-600">3x-ui подключён</span>
                      ) : (
                        <span className="text-amber-600">панель не настроена</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">{s.region}</td>
                  <td className="px-4 py-3 w-40">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={pct >= 100 ? "h-full bg-red-500" : pct >= 80 ? "h-full bg-amber-500" : "h-full bg-emerald-500"}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500">{s.currentUsers}/{s.capacity}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      defaultValue={s.capacity}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== s.capacity) updateCapacity(s.id, v);
                      }}
                      className="w-20 border border-slate-300 rounded-lg px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={s.status}
                      onChange={(e) => updateStatus(s.id, e.target.value as ServerStatus)}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[s.status]}`}
                    >
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => removeServer(s.id)}
                      className="text-red-600 hover:underline text-sm"
                    >
                      Удалить
                    </button>
                  </td>
                </tr>
              );
            })}
            {servers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  Серверов пока нет
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
