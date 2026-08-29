import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LINK_FILE = path.join(__dirname, "telegram_link.json");

const PENDING_TTL_MS = 10 * 60 * 1000; // 10 dəqiqə

// TOKEN/BOT_USERNAME-i modul yüklənəndə deyil, hər çağırışda oxuyuruq — çünki ES modul
// import-ları hoist olunur və bu fayl index.js-in dotenv.config() sətrindən ƏVVƏL
// qiymətləndirilir, yəni top-level const kimi tutsaydıq process.env həmişə boş görünərdi.
function getToken() {
  return process.env.TELEGRAM_BOT_TOKEN;
}

function getBotUsername() {
  return process.env.TELEGRAM_BOT_USERNAME;
}

function apiBase() {
  const token = getToken();
  return token ? `https://api.telegram.org/bot${token}` : null;
}

let pendingToken = null;
let pendingExpiresAt = 0;
let pollOffset = 0;
let pollingStarted = false;

function readLink() {
  try {
    return JSON.parse(fs.readFileSync(LINK_FILE, "utf8"));
  } catch {
    return { chatId: null };
  }
}

function writeLink(data) {
  fs.writeFileSync(LINK_FILE, JSON.stringify(data));
}

export function getTelegramStatus() {
  return { linked: !!readLink().chatId, botConfigured: !!(getToken() && getBotUsername()) };
}

export function createLinkRequest() {
  const botUsername = getBotUsername();
  if (!getToken() || !botUsername) throw new Error("Telegram bot konfiqurasiya olunmayıb (.env)");
  pendingToken = crypto.randomBytes(12).toString("hex");
  pendingExpiresAt = Date.now() + PENDING_TTL_MS;
  return `https://t.me/${botUsername}?start=${pendingToken}`;
}

export function unlinkTelegram() {
  writeLink({ chatId: null });
}

export async function sendTelegramMessage(text) {
  const { chatId } = readLink();
  const base = apiBase();
  if (!chatId || !base) return;
  try {
    await fetch(`${base}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (err) {
    console.error("⚠️ Telegram mesajı göndərilə bilmədi (nəzərə alınmadı):", err.message);
  }
}

async function pollOnce() {
  const res = await fetch(`${apiBase()}/getUpdates?timeout=25&offset=${pollOffset}`, {
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json();
  if (!data.ok) return;

  for (const update of data.result) {
    pollOffset = update.update_id + 1;
    const chatId = update.message?.chat?.id;
    const text = update.message?.text || "";
    if (!chatId) continue;

    const match = text.match(/^\/start\s+(\S+)/);
    if (match && pendingToken && match[1] === pendingToken && Date.now() < pendingExpiresAt) {
      writeLink({ chatId });
      pendingToken = null;
      await sendTelegramMessage("✅ Qoşuldu! Bot yer tapanda buraya bildiriş gələcək.");
    }
  }
}

// Telegram-ın webhook (HTTPS+domain tələb edir) əvəzinə long-polling istifadə edirik —
// serverdə hələ domain/SSL olmadığı üçün bu daha sadədir.
export function startTelegramPolling() {
  if (pollingStarted || !apiBase()) return;
  pollingStarted = true;

  (async function loop() {
    while (true) {
      try {
        await pollOnce();
      } catch (err) {
        console.error("⚠️ Telegram getUpdates xətası (nəzərə alınmadı):", err.message);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  })();
}
