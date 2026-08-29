import fs from "node:fs/promises";
import path from "node:path";

import ExcelJS from "exceljs";

import { findRowByColumn, getHeaderMap, normalizeHeader, readSheetAsObjects, saveWorkbookAtomic } from "./excel.js";

export const PROXY_FILENAME = "proxy.xlsx";

export function proxyFilePath(baseDir) {
  return path.join(baseDir, PROXY_FILENAME);
}

function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m} dəq ${s} san qalıb` : `${s} san qalıb`;
}

export async function readProxies(baseDir) {
  const filePath = proxyFilePath(baseDir);
  let rows;
  try {
    rows = await readSheetAsObjects(filePath);
  } catch (err) {
    if (err.code === "ENOENT" || err.message?.includes("File not found")) {
      return {
        proxies: [],
        summary: { total: 0, active: 0, inactive: 0, blocked: 0 },
        fileExists: false,
      };
    }
    throw err;
  }

  const now = Date.now();

  const proxies = rows
    .filter((r) => String(r.server || "").trim())
    .map((r) => {
      const rawBlokVaxti = String(r.blok_vaxti ?? "").trim();
      const blokTime = rawBlokVaxti ? Date.parse(rawBlokVaxti) : NaN;
      const isBlocked = !Number.isNaN(blokTime) && blokTime > now;

      return {
        server: String(r.server).trim(),
        username: String(r.username || "").trim(),
        password: String(r.password || "").trim(),
        active: String(r.aktiv ?? "").trim() === "Aktiv",
        isBlocked,
        // Blok vaxtı keçibsə heç nə göstərmirik — yalnız hələ blokdadırsa qalan müddəti göstəririk
        blockedRemaining: isBlocked ? formatRemaining(blokTime - now) : "",
      };
    });

  const summary = {
    total: proxies.length,
    active: proxies.filter((p) => p.active).length,
    inactive: proxies.filter((p) => !p.active).length,
    blocked: proxies.filter((p) => p.isBlocked).length,
  };

  return { proxies, summary, fileExists: true };
}

export async function updateProxyStatus(baseDir, server, active) {
  const filePath = proxyFilePath(baseDir);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  const headers = getHeaderMap(sheet);
  if (!headers.aktiv) throw new Error("Excel-də 'aktiv' sütunu yoxdur");
  const row = findRowByColumn(sheet, headers, "server", server);
  row.getCell(headers.aktiv).value = active ? "Aktiv" : "Deaktiv";
  await saveWorkbookAtomic(workbook, filePath);
}

export async function addProxy(baseDir, { server, username, password, active }) {
  if (!server || !server.trim()) throw new Error("Server ünvanı tələb olunur");

  const filePath = proxyFilePath(baseDir);
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.readFile(filePath);
  } catch (err) {
    if (err.code !== "ENOENT" && !err.message?.includes("File not found")) throw err;
    // Fayl yoxdursa sıfırdan başlıq sətri ilə yaradırıq
    const sheet = workbook.addWorksheet("Sheet1");
    sheet.addRow(["server", "username", "password", "aktiv", "blok_vaxti"]);
  }

  const sheet = workbook.worksheets[0];
  const headers = getHeaderMap(sheet);
  const newRowNumber = sheet.rowCount + 1;
  const row = sheet.getRow(newRowNumber);
  if (headers.server) row.getCell(headers.server).value = server.trim();
  if (headers.username) row.getCell(headers.username).value = (username || "").trim();
  if (headers.password) row.getCell(headers.password).value = (password || "").trim();
  if (headers.aktiv) row.getCell(headers.aktiv).value = active === false ? "Deaktiv" : "Aktiv";
  row.commit();

  await saveWorkbookAtomic(workbook, filePath);
}

export async function deleteProxy(baseDir, server) {
  const filePath = proxyFilePath(baseDir);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  const headers = getHeaderMap(sheet);
  const row = findRowByColumn(sheet, headers, "server", server);
  sheet.spliceRows(row.number, 1);
  await saveWorkbookAtomic(workbook, filePath);
}

async function validateProxyBuffer(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Excel faylında heç bir vərəq tapılmadı");

  const headers = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell) => headers.push(normalizeHeader(cell.value)));
  if (!headers.includes("server")) {
    throw new Error("Excel faylında 'server' sütunu tapılmadı");
  }
}

// Yüklənən faylın adı nə olursa-olsun, həmişə proxy.xlsx kimi saxlanılır ki, bot6.py tapa bilsin.
export async function replaceProxyFile(baseDir, buffer) {
  await validateProxyBuffer(buffer);
  const filePath = proxyFilePath(baseDir);
  const tmpPath = `${filePath}.tmp-${Date.now()}`;
  await fs.writeFile(tmpPath, buffer);
  await fs.rename(tmpPath, filePath);
}
