import { FiFileText, FiHome, FiServer, FiSettings, FiUsers } from "react-icons/fi";
import { NavLink } from "react-router-dom";

const NAV_ITEMS = [
  { label: "Ana Səhifə", icon: FiHome, to: "/" },
  { label: "Hesablar", icon: FiUsers, to: "/accounts" },
  { label: "Ərizəçilər", icon: FiFileText, to: "/applicants" },
  { label: "Proxy-lər", icon: FiServer, to: "/proxies" },
  { label: "Ayarlar", icon: FiSettings, to: "/settings" },
];

export default function Sidebar({ open, onNavigate }) {
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col overflow-hidden border-r border-white/10 bg-[#131620] p-4 transition-transform duration-200 md:static md:z-auto md:transition-all ${
        open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      } ${open ? "md:w-60 md:p-4" : "md:w-0 md:p-0"}`}
    >
      <div className="mb-8 w-52 px-2 text-lg font-semibold whitespace-nowrap text-white">Tezebot</div>
      <nav className="flex w-52 flex-col gap-1">
        {NAV_ITEMS.map(({ label, icon: Icon, to }) =>
          to ? (
            <NavLink
              key={label}
              to={to}
              end={to === "/"}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm ${
                  isActive
                    ? "cursor-pointer bg-violet-600/20 text-violet-300"
                    : "cursor-pointer text-gray-400 hover:bg-white/5 hover:text-gray-200"
                }`
              }
            >
              <Icon />
              {label}
            </NavLink>
          ) : (
            <div
              key={label}
              title="Tezliklə"
              className="flex cursor-not-allowed items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-gray-600"
            >
              <Icon />
              {label}
              <span className="ml-auto rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-gray-500">
                Tezliklə
              </span>
            </div>
          )
        )}
      </nav>
    </aside>
  );
}
