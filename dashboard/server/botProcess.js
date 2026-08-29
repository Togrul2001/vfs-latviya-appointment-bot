import { exec, spawn } from "node:child_process";

import { readApplicants } from "./applicants.js";
import { getVisaCategory } from "./botSettings.js";
import { getAccountPassword } from "./excel.js";
import { sendTelegramMessage } from "./telegram.js";

const MAX_LOG_LINES = 300;
const SLOT_FOUND_PATTERN = /YER TAPDI/;
// bot6.py-in update_applicant_status() funksiyasının çap etdiyi sətir: yalnız həqiqi
// uğur ("Yer götürüldü") tuturuq, "Görüşü var" (əvvəldən görüşü olan) bura düşmür.
const SEAT_SECURED_PATTERN = /\[QRUP (.+?) - Pasport (.+?)\] Excel statusu 'Yer götürüldü' oldu!/;
// "🎉 🔥 [email] MÜVƏFFƏQİYYƏT!" sətri hər qrupun "Yer götürüldü" sətirlərindən HƏMİŞƏ
// əvvəl çap olunur (bot6.py:743) — hansı hesabla girildiyini buradan yadda saxlayırıq.
const SUCCESS_ACCOUNT_PATTERN = /\[(.+?)\] MÜVƏFFƏQİYYƏT!/;

let currentBaseDir = null;
let lastSuccessEmail = null;
// Windows-da adətən "python", Linux/Ubuntu-da isə yalnız "python3" PATH-də olur.
// PYTHON_BIN env dəyişəni ilə də override edilə bilər (bot6.py-a toxunmadan).
const PYTHON_BIN = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");

let child = null;
let startedAt = null;
let logBuffer = [];
let subscribers = new Set();

// Server hansı ölkədə/timezone-da deploy olunursa olunsun (VPS xarici server olacaq),
// vaxtlar həmişə Bakı (Asia/Baku) saatı ilə göstərilir — server-in öz lokal saatına etibar edilmir.
function formatBakuTime(date) {
  return new Intl.DateTimeFormat("az-AZ", {
    timeZone: "Asia/Baku",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts = [];
  if (h) parts.push(`${h} saat`);
  if (h || m) parts.push(`${m} dəq`);
  parts.push(`${s} san`);
  return parts.join(" ");
}

function safeBroadcast(line) {
  // Bir subscriber-in (WebSocket) xətası nə bota, nə də digər subscriber-lərə təsir etməməlidir
  for (const send of subscribers) {
    try {
      send(line);
    } catch (err) {
      console.error("⚠️ Log subscriber xətası (nəzərə alınmadı):", err.message);
    }
  }
}

function pushLog(line) {
  try {
    logBuffer.push(line);
    if (logBuffer.length > MAX_LOG_LINES) logBuffer.shift();
    safeBroadcast(line);
    if (SLOT_FOUND_PATTERN.test(line)) {
      sendTelegramMessage(`🟢 Yer tapıldı!\n\n${line}`);
    }
    const successMatch = line.match(SUCCESS_ACCOUNT_PATTERN);
    if (successMatch) {
      lastSuccessEmail = successMatch[1].trim();
    }
    // "Yer götürüldü" Telegram bildirişi bot6.py-ın özündən gedir — dashboard-dan
    // təkrar göndərilməsin deyə buradakı notifySeatSecured çağırışı söndürüldü.
  } catch (err) {
    console.error("⚠️ Log emalında xəta (nəzərə alınmadı):", err.message);
  }
}

async function notifySeatSecured(qrupId, passportNo) {
  try {
    if (!currentBaseDir) return;
    const { applicants } = await readApplicants(currentBaseDir);
    const applicant = applicants.find(
      (a) => a.pasportNomresi.toUpperCase() === passportNo.toUpperCase()
    );
    const name = applicant ? `${applicant.ad} ${applicant.soyad}`.trim() : "";

    const lines = ["🎉 Yer götürüldü!", ""];
    if (lastSuccessEmail) {
      const password = await getAccountPassword(currentBaseDir, lastSuccessEmail);
      lines.push(`Email: ${lastSuccessEmail}`, `Şifrə: ${password || "—"}`, "");
    }
    lines.push(`Qrup: ${qrupId}`);
    if (name) lines.push(name);
    lines.push(`Pasport: ${passportNo}`);

    await sendTelegramMessage(lines.join("\n"));
  } catch (err) {
    console.error("⚠️ Yer götürüldü bildirişi göndərilə bilmədi (nəzərə alınmadı):", err.message);
  }
}

function attachOutput(stream) {
  let leftover = "";
  stream.on("data", (chunk) => {
    try {
      leftover += chunk.toString("utf8");
      const parts = leftover.split(/\r?\n/);
      leftover = parts.pop();
      for (const line of parts) {
        if (line.trim()) pushLog(line);
      }
    } catch (err) {
      console.error("⚠️ Stdout emalında xəta (nəzərə alınmadı):", err.message);
    }
  });
  stream.on("error", (err) => {
    console.error("⚠️ Stream xətası (nəzərə alınmadı):", err.message);
  });
}

export function getStatus() {
  return {
    running: child !== null,
    pid: child?.pid ?? null,
    startedAt,
  };
}

export function getLogHistory() {
  return logBuffer;
}

export function subscribeLogs(callback) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

export function startBot(baseDir) {
  if (child) throw new Error("Bot artıq işləyir");
  currentBaseDir = baseDir;
  lastSuccessEmail = null;

  // PYTHONIOENCODING: stdout piped olanda Python Azərbaycan/emoji simvollarını yazarkən
  // encoding xətası ilə çökməsin deyə. PYTHONUNBUFFERED: stdout pipe-a bağlananda Python
  // çıxışı partiya-partiya buferləməsin, hər print() dərhal göndərilsin (bot6.py-a toxunmadan).
  // detached: Linux-da öz proses qrupunun lideri olsun ki, Stop-da bütün alt-proseslər
  // (Playwright-in açdığı Chromium) də öldürülə bilsin; həm də bot dashboard-dan asılı
  // olmadan yaşasın (dashboard çöksə/yenidən başlasa belə bot dayanmır).
  child = spawn(PYTHON_BIN, ["bot6.py"], {
    cwd: baseDir,
    stdio: ["ignore", "pipe", "pipe"],
    // DISPLAY: bu serverdə İtaliya botu :99-u istifadə etdiyi üçün Chrome pəncərələri
    // qarışmasın deyə Çexiya botu ayrıca :102 virtual ekranında açılır (windowSwitcher.js
    // ilə uyğun) — burada sərt yazılıb ki, prosesi hansı mühitdən başlatsan da doğru olsun.
    env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1", DISPLAY: ":102" },
    detached: process.platform !== "win32",
  });
  const startDate = new Date();
  startedAt = startDate.toISOString();
  logBuffer = [];

  attachOutput(child.stdout);
  attachOutput(child.stderr);
  pushLog(`🚀 Bot başladıldı: ${formatBakuTime(startDate)}`);
  getVisaCategory(baseDir)
    .then((category) => pushLog(`🎯 Viza Kateqoriyası: ${category}`))
    .catch((err) => console.error("⚠️ Viza kateqoriyası oxuna bilmədi (nəzərə alınmadı):", err.message));

  child.on("exit", () => {
    if (child) {
      const duration = startedAt ? Date.now() - new Date(startedAt).getTime() : 0;
      pushLog(`🏁 Bot prosesi bitdi: ${formatBakuTime(new Date())} | Müddət: ${formatDuration(duration)}`);
    }
    child = null;
    startedAt = null;
  });

  child.on("error", (err) => {
    console.error("❌ Bot prosesi başladılarkən xəta:", err.message);
    child = null;
    startedAt = null;
  });

  return getStatus();
}

export function stopBot() {
  if (!child) throw new Error("Bot işləmir");
  const pid = child.pid;
  const duration = startedAt ? Date.now() - new Date(startedAt).getTime() : 0;

  if (process.platform === "win32") {
    // Proses ağacı ilə birlikdə öldürür (Playwright-in açdığı Chromium alt-prosesləri daxil)
    exec(`taskkill /PID ${pid} /T /F`);
  } else {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }

  child = null;
  startedAt = null;
  pushLog(`🛑 Bot dayandırıldı: ${formatBakuTime(new Date())} | Müddət: ${formatDuration(duration)}`);
  return getStatus();
}
