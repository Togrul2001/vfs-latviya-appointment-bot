import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import { WebSocketServer } from "ws";

import {
  addApplicant,
  APPLICANTS_FILENAME,
  applicantsFilePath,
  deleteApplicant,
  readApplicants,
  replaceApplicantsFile,
  updateApplicant,
} from "./applicants.js";
import { getVisaCategory, setVisaCategory } from "./botSettings.js";
import { getLogHistory, getStatus, startBot, stopBot, subscribeLogs } from "./botProcess.js";
import {
  accountsFilePath,
  ACCOUNTS_FILENAME,
  addAccount,
  deleteAccount,
  readAccounts,
  replaceAccountsFile,
  updateAccount,
} from "./excel.js";
import {
  addProxy,
  deleteProxy,
  PROXY_FILENAME,
  proxyFilePath,
  readProxies,
  replaceProxyFile,
  updateProxyStatus,
} from "./proxies.js";
import { createLinkRequest, getTelegramStatus, startTelegramPolling, unlinkTelegram } from "./telegram.js";
import { cycleWindow, getWindowStatus } from "./windowSwitcher.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_DIR = path.resolve(__dirname, "..", "..");
const FRONTEND_DIST = path.join(__dirname, "..", "frontend", "dist");
dotenv.config({ path: path.join(BASE_DIR, ".env") });

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-insecure-secret-change-me";
const PORT = process.env.SERVER_PORT || 4000;
const COOKIE_NAME = "session";
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 gün

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
  })
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith(".xlsx")) return cb(null, true);
    cb(new Error("Yalnız .xlsx faylı qəbul olunur"));
  },
});

function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: "Giriş tələb olunur" });
  try {
    req.user = jwt.verify(token, SESSION_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Sessiya etibarsızdır" });
  }
}

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "İstifadəçi adı və ya şifrə yanlışdır" });
  }
  const token = jwt.sign({ username }, SESSION_SECRET, { expiresIn: "7d" });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_MS,
  });
  res.json({ username });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ username: req.user.username });
});

app.get("/api/accounts", requireAuth, async (req, res) => {
  try {
    const data = await readAccounts(BASE_DIR);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: `accounts.xlsx oxunmadı: ${err.message}` });
  }
});

app.get("/api/accounts/download", requireAuth, (req, res) => {
  res.download(accountsFilePath(BASE_DIR), ACCOUNTS_FILENAME, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "Excel faylı tapılmadı" });
  });
});

app.post("/api/accounts/upload", requireAuth, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Fayl seçilməyib" });
  try {
    await replaceAccountsFile(BASE_DIR, req.file.buffer);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/accounts", requireAuth, async (req, res) => {
  try {
    await addAccount(BASE_DIR, req.body || {});
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch("/api/accounts/:email", requireAuth, async (req, res) => {
  try {
    await updateAccount(BASE_DIR, req.params.email, req.body || {});
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/accounts/:email", requireAuth, async (req, res) => {
  try {
    await deleteAccount(BASE_DIR, req.params.email);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/applicants", requireAuth, async (req, res) => {
  try {
    const data = await readApplicants(BASE_DIR);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: `applicants.xlsx oxunmadı: ${err.message}` });
  }
});

app.get("/api/applicants/download", requireAuth, (req, res) => {
  res.download(applicantsFilePath(BASE_DIR), APPLICANTS_FILENAME, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "Excel faylı tapılmadı" });
  });
});

app.post("/api/applicants/upload", requireAuth, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Fayl seçilməyib" });
  try {
    await replaceApplicantsFile(BASE_DIR, req.file.buffer);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/applicants", requireAuth, async (req, res) => {
  try {
    await addApplicant(BASE_DIR, req.body || {});
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch("/api/applicants/:passport", requireAuth, async (req, res) => {
  try {
    await updateApplicant(BASE_DIR, req.params.passport, req.body || {});
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/applicants/:passport", requireAuth, async (req, res) => {
  try {
    await deleteApplicant(BASE_DIR, req.params.passport);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/proxies", requireAuth, async (req, res) => {
  try {
    const data = await readProxies(BASE_DIR);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: `proxy.xlsx oxunmadı: ${err.message}` });
  }
});

app.get("/api/proxies/download", requireAuth, (req, res) => {
  res.download(proxyFilePath(BASE_DIR), PROXY_FILENAME, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "Excel faylı tapılmadı" });
  });
});

app.post("/api/proxies", requireAuth, async (req, res) => {
  const { server, username, password, active } = req.body || {};
  try {
    await addProxy(BASE_DIR, { server, username, password, active });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch("/api/proxies/:server", requireAuth, async (req, res) => {
  const { active } = req.body || {};
  if (typeof active !== "boolean") return res.status(400).json({ error: "active (boolean) tələb olunur" });
  try {
    await updateProxyStatus(BASE_DIR, req.params.server, active);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/proxies/:server", requireAuth, async (req, res) => {
  try {
    await deleteProxy(BASE_DIR, req.params.server);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/proxies/upload", requireAuth, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Fayl seçilməyib" });
  try {
    await replaceProxyFile(BASE_DIR, req.file.buffer);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/telegram/status", requireAuth, (req, res) => {
  res.json(getTelegramStatus());
});

app.post("/api/telegram/link", requireAuth, (req, res) => {
  try {
    res.json({ url: createLinkRequest() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/telegram/unlink", requireAuth, (req, res) => {
  unlinkTelegram();
  res.json({ ok: true });
});

app.get("/api/settings/visa-category", requireAuth, async (req, res) => {
  res.json({ visaCategory: await getVisaCategory(BASE_DIR) });
});

app.post("/api/settings/visa-category", requireAuth, async (req, res) => {
  const { visaCategory } = req.body || {};
  try {
    res.json(await setVisaCategory(BASE_DIR, visaCategory));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/bot/status", requireAuth, (req, res) => {
  res.json(getStatus());
});

app.post("/api/bot/start", requireAuth, (req, res) => {
  try {
    res.json(startBot(BASE_DIR));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/bot/stop", requireAuth, (req, res) => {
  try {
    res.json(stopBot());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/vnc/window-status", requireAuth, async (req, res) => {
  res.json(await getWindowStatus());
});

app.post("/api/vnc/window/next", requireAuth, async (req, res) => {
  res.json(await cycleWindow("next"));
});

app.post("/api/vnc/window/prev", requireAuth, async (req, res) => {
  res.json(await cycleWindow("prev"));
});

// Xvfb (:99) ekranının canlı görüntüsü (noVNC) nginx tərəfindən /vnc altında proxy
// edilir (auth_request ilə bu Node serverin /api/auth/me endpoint-inə qarşı yoxlanılır) —
// bax deploy/nginx.conf. Node tərəfində əlavə koda ehtiyac yoxdur.

// Build edilmiş frontend-i (npm run build → dist/) Express özü serve edir ki, PM2 ilə
// VPS-də tək proses (API + WebSocket + statik fayllar) kifayət etsin. Lokal dev-də
// dist/ qovluğu olmadığı üçün bu hissə sadəcə atlanır, Vite dev serveri işini görür.
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  app.get(/^(?!\/api|\/ws).*/, (req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, "index.html"));
  });
}

// Multer və digər middleware xətalarını JSON kimi qaytarır
app.use((err, req, res, next) => {
  res.status(400).json({ error: err.message || "Xəta baş verdi" });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws/logs" });

function parseCookie(header, name) {
  if (!header) return null;
  const found = header
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : null;
}

wss.on("connection", (ws, req) => {
  try {
    jwt.verify(parseCookie(req.headers.cookie, COOKIE_NAME), SESSION_SECRET);
  } catch {
    ws.close(4401, "Unauthorized");
    return;
  }

  try {
    for (const line of getLogHistory()) ws.send(line);
    // Tarixçənin bitdiyini bildirir ki, client köhnə sətirləri canlı yeni sətirlərdən ayıra bilsin
    ws.send("__HISTORY_END__");
  } catch (err) {
    console.error("⚠️ Log tarixçəsi göndərilərkən xəta (nəzərə alınmadı):", err.message);
  }

  const unsubscribe = subscribeLogs((line) => {
    if (ws.readyState === ws.OPEN) ws.send(line);
  });

  ws.on("close", () => unsubscribe());
  ws.on("error", (err) => {
    console.error("⚠️ WebSocket xətası (nəzərə alınmadı):", err.message);
  });
});

wss.on("error", (err) => {
  console.error("⚠️ WebSocket server xətası (nəzərə alınmadı):", err.message);
});

// Dashboard-un daxilində gözlənilməz kod xətası bot6.py prosesinə TƏSİR ETMİR — o, ayrıca
// OS prosesidir və Node prosesindən asılı olmadan işləməyə davam edir. Bura düşən hər xəta
// sadəcə log-lanır, server ayaqda qalır ki, statusu izləməyə davam edə bilək.
process.on("uncaughtException", (err) => {
  console.error("❌ Tutulmamış xəta (server davam edir):", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("❌ İdarə olunmayan promise rədd edildi (server davam edir):", reason);
});

startTelegramPolling();

server.listen(PORT, () => {
  console.log(`✅ Dashboard server http://localhost:${PORT} ünvanında işə düşdü`);
});
