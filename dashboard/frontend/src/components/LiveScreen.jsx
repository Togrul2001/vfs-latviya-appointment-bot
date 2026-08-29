import { useEffect, useRef, useState } from "react";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { getWindowStatus, nextWindow, prevWindow } from "../lib/api";

// Konteyner (desktop) 16:9-dur (Xvfb 1920x1080 = 16:9). scale: false = native/clip (Ubuntu
// paneli tam doldurur, qalanı scroll ilə). Tam ekran isə brauzerin Fullscreen API-sidir.
const SIZES = [
  { key: "standart", label: "Standart", scale: false, css: { maxWidth: "100%", aspectRatio: "16 / 9" } },
];

const SIZE_STORAGE_KEY = "liveScreenSize";

export default function LiveScreen() {
  const [status, setStatus] = useState({ total: 0, activeIndex: -1, email: "" });
  const [sizeKey, setSizeKey] = useState(() => {
    try {
      const saved = localStorage.getItem(SIZE_STORAGE_KEY);
      return SIZES.some((s) => s.key === saved) ? saved : "standart";
    } catch {
      return "standart";
    }
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 640);
  const screenRef = useRef(null);

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(document.fullscreenElement === screenRef.current);
    const onResize = () => setIsMobile(window.innerWidth < 640);
    document.addEventListener("fullscreenchange", onFsChange);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  function refreshStatus() {
    getWindowStatus()
      .then(setStatus)
      .catch(() => {});
  }

  function handleSelect(value) {
    if (value === "fullscreen") {
      // Tam ekran ölçü deyil, əməldir — Fullscreen API çağırılır, seçici ölçüdə qalır.
      const el = screenRef.current;
      if (el && el.requestFullscreen) {
        el.requestFullscreen().catch(() => {});
      }
      return;
    }
    setSizeKey(value);
    try {
      localStorage.setItem(SIZE_STORAGE_KEY, value);
    } catch {
      // localStorage əlçatan deyilsə səssiz keç
    }
  }

  async function handleSwitch(direction) {
    try {
      const next = direction === "next" ? await nextWindow() : await prevWindow();
      setStatus(next);
    } catch {
      // Xvfb/xdotool yoxdursa (məs. lokal dev) səssiz keç
    }
  }

  const size = SIZES.find((s) => s.key === sizeKey) || SIZES[0];
  // Tam ekran: bütün fiziki ekran. Digər hallarda (mobil daxil) 16:9 panel.
  const screenStyle = isFullscreen ? { width: "100%", height: "100%" } : size.css;

  return (
    <div>
      <div className="mb-2">
        <div className="flex items-center gap-3">
          <h2 className="shrink-0 text-sm font-medium text-gray-300">Canlı Ekran</h2>
          <select
            value={sizeKey}
            onChange={(e) => handleSelect(e.target.value)}
            title="Ekran ölçüsü"
            className="cursor-pointer rounded-lg border border-white/10 bg-[#0f1115] px-2 py-1 text-xs text-gray-300 outline-none hover:bg-white/5 focus:border-violet-500"
          >
            {SIZES.map((s) => (
              <option key={s.key} value={s.key} className="bg-[#161922] text-gray-200">
                {s.label}
              </option>
            ))}
            <option value="fullscreen" className="bg-[#161922] text-gray-200">
              Tam ekran
            </option>
          </select>
          {/* Web-də (desktop) email eyni sətirdə ortada — əvvəlki kimi. Mobil-də bura yalnız boşluqdur. */}
          {!isMobile && status.total > 0 && status.email ? (
            <span className="min-w-0 flex-1 truncate text-center text-xs text-gray-400" title={status.email}>
              {status.email}
            </span>
          ) : (
            <div className="flex-1" />
          )}
          {status.total > 0 && (
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => handleSwitch("prev")}
                className="cursor-pointer rounded-lg border border-white/10 p-1.5 text-gray-300 hover:bg-white/5"
                title="Əvvəlki Chrome"
              >
                <FiChevronLeft />
              </button>
              <span className="text-xs text-gray-400">
                {status.activeIndex + 1} / {status.total}
              </span>
              <button
                onClick={() => handleSwitch("next")}
                className="cursor-pointer rounded-lg border border-white/10 p-1.5 text-gray-300 hover:bg-white/5"
                title="Növbəti Chrome"
              >
                <FiChevronRight />
              </button>
            </div>
          )}
        </div>
        {/* Mobil-də email ayrıca ikinci sətirdə (bir sətirdə hamısı qarışmasın deyə). */}
        {isMobile && status.total > 0 && status.email && (
          <div className="mt-1 truncate text-center text-xs text-gray-400" title={status.email}>
            {status.email}
          </div>
        )}
      </div>
      <div
        ref={screenRef}
        className="mx-auto w-full overflow-hidden rounded-lg border border-white/10 bg-black"
        style={screenStyle}
      >
        <iframe
          title="Canlı Ekran"
          src={`/vnc/vnc_lite.html?path=vnc/websockify&autoconnect=true&scale=${size.scale}&reconnect=true`}
          className="h-full w-full"
        />
      </div>
    </div>
  );
}
