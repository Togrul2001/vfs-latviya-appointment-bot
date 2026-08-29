import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);
// bot6.py-ın açdığı Chrome pəncərələri Xvfb-in virtual ekranında (:100) yaşayır — bu
// server üzərində İtaliya botu :99-u istifadə etdiyi üçün Çexiya təkrarçılığa düşməsin
// deyə ayrıca :100 seçilib. Windows-da lokal işlədərkən bu display yoxdur, xdotool
// tapılmayacaq (aşağıda tutulur).
const DISPLAY = ":102";
const XDOTOOL_ENV = { ...process.env, DISPLAY };

// Xvfb-də pəncərə meneceri (window manager) yoxdur, ona görə "getactivewindow" (EWMH
// _NET_ACTIVE_WINDOW tələb edir) işləmir — hansı pəncərənin öndə olduğunu özümüz
// yaddaşda izləyirik, X11-dən soruşmuruq.
let currentIndex = 0;

async function listChromeWindows() {
  try {
    const { stdout } = await execAsync('xdotool search --onlyvisible --class "[Cc]hrome"', {
      env: XDOTOOL_ENV,
    });
    // "search" pəncərələri yığın (stacking) sırası ilə qaytarır, bu da hər "raise"
    // əməliyyatından sonra dəyişir — indeksin sabit qalması üçün ID-yə görə (yaranma
    // sırası, dəyişməz) sıralayırıq.
    return stdout
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .sort((a, b) => Number(a) - Number(b));
  } catch {
    return [];
  }
}

// bot6.py giriş uğurlu olan kimi pəncərənin başlığını (document.title) hesabın email-inə
// çevirir — burada oxuyub Canlı Ekran panelində göstəririk ki, hansı email-lə giriş edilən
// brauzeri izlədiyimiz bilinsin.
async function getWindowEmail(windowId) {
  try {
    const { stdout } = await execAsync(`xdotool getwindowname ${windowId}`, { env: XDOTOOL_ENV });
    // Chrome adətən başlığa " - Google Chrome" şəkilçisi əlavə edir, təmizləyirik
    return stdout.trim().replace(/\s*-\s*Google Chrome$/, "");
  } catch {
    return "";
  }
}

export async function getWindowStatus() {
  const windows = await listChromeWindows();
  if (windows.length === 0) return { total: 0, activeIndex: -1, email: "" };
  if (currentIndex >= windows.length) currentIndex = 0;
  const email = await getWindowEmail(windows[currentIndex]);
  return { total: windows.length, activeIndex: currentIndex, email };
}

export async function cycleWindow(direction) {
  const windows = await listChromeWindows();
  if (windows.length === 0) return { total: 0, activeIndex: -1, email: "" };

  const base = currentIndex < windows.length ? currentIndex : 0;
  const delta = direction === "prev" ? -1 : 1;
  currentIndex = (base + delta + windows.length) % windows.length;

  // "windowactivate" EWMH (_NET_ACTIVE_WINDOW) tələb edir, Xvfb-də isə WM olmadığı üçün
  // xəta verir (canlı VPS-də test edilib) — "windowraise"/"windowfocus" isə birbaşa X11
  // protokolundan istifadə edir, WM-dən asılı deyil və işləyir.
  try {
    await execAsync(`xdotool windowraise ${windows[currentIndex]}`, { env: XDOTOOL_ENV });
    await execAsync(`xdotool windowfocus ${windows[currentIndex]}`, { env: XDOTOOL_ENV });
  } catch (err) {
    console.error("⚠️ Pəncərə önə çıxarıla bilmədi (nəzərə alınmadı):", err.message);
  }
  const email = await getWindowEmail(windows[currentIndex]);
  return { total: windows.length, activeIndex: currentIndex, email };
}
