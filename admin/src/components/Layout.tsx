import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, Server, Users as UsersIcon, LogOut, ShieldCheck } from "lucide-react";
import { clearToken } from "../lib/api";

const navItems = [
  { to: "/", label: "Дашборд", icon: LayoutDashboard },
  { to: "/servers", label: "Серверы", icon: Server },
  { to: "/users", label: "Пользователи", icon: UsersIcon },
];

export default function Layout() {
  const navigate = useNavigate();

  function logout() {
    clearToken();
    navigate("/login");
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col">
        <div className="h-16 flex items-center gap-2 px-6 border-b border-slate-800">
          <ShieldCheck className="text-brand-500" size={24} />
          <span className="font-semibold">VPN SaaS</span>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                  isActive ? "bg-brand-600 text-white" : "text-slate-300 hover:bg-slate-800"
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={logout}
          className="m-4 flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800"
        >
          <LogOut size={18} />
          Выйти
        </button>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
