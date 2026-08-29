import { useState } from "react";
import { FiLogOut, FiMenu } from "react-icons/fi";
import { useAuth } from "../context/AuthContext";
import Sidebar from "./Sidebar";
import SlotAlert from "./SlotAlert";

function isDesktopViewport() {
  return typeof window !== "undefined" && window.innerWidth >= 768;
}

export default function Layout({ title, children }) {
  const { user, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(isDesktopViewport);

  function closeOnMobile() {
    if (!isDesktopViewport()) setSidebarOpen(false);
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-[#0f1115]">
      <SlotAlert />
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-30 bg-black/50 md:hidden" />
      )}

      <Sidebar open={sidebarOpen} onNavigate={closeOnMobile} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              onClick={() => setSidebarOpen((o) => !o)}
              title="Menyunu aç/bağla"
              className="cursor-pointer rounded-lg p-1.5 text-gray-400 hover:bg-white/5 hover:text-gray-200"
            >
              <FiMenu />
            </button>
            <h1 className="truncate text-base font-semibold text-white sm:text-lg">{title}</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="hidden text-sm text-gray-400 sm:inline">{user?.username}</span>
            <button
              onClick={signOut}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-2.5 py-1.5 text-sm text-gray-300 hover:bg-white/5 sm:px-3"
            >
              <FiLogOut />
              <span className="hidden sm:inline">Çıxış</span>
            </button>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
