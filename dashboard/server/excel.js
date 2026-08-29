import fs from "node:fs/promises";
import path from "node:path";

import ExcelJS from "exceljs";

export const ACCOUNTS_FILENAME = "accounts.xlsx";

// Sağlam hesab statusları (bot bunları skan üçün istifadə edir)
const GOOD_STATUSES = ["aktiv", "aktiv_hesab", "gozleyir", "gözləyir"];
// Xəta deyil, sadəcə müvəqqəti "istirahət" statusu (yer götürülüb, cooldown-dadır)
const COOLDOWN_STATUSES = ["yer goturuldu", "yer götürüldü"];

export function normalizeHeader(value) {
  return String(value ?? "").trim().toLowerCase();
}

export async function readSheetAsObjects(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];

  const headerRow = sheet.getRow(1);
  const headers = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = normalizeHeader(cell.value);
  });

  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const key = headers[colNumber];
      if (!key) return;
      let value = cell.value;
      if (value && typeof value === "object" && value.text) value = value.text;
      if (value instanceof Date) {
        const day = String(value.getUTCDate()).padStart(2, "0");
        const month = String(value.getUTCMonth() + 1).padStart(2, "0");
        value = `${day}.${month}.${value.getUTCFullYear()}`;
      }
      obj[key] = value ?? "";
    });
    rows.push(obj);
  });

  return rows;
}

export async function readAccounts(baseDir) {
  const filePath = accountsFilePath(baseDir);
  let rows;
  try {
    rows = await readSheetAsObjects(filePath);
  } catch (err) {
    if (err.code === "ENOENT" || err.message?.includes("File not found")) {
      return {
        accounts: [],
        summary: { total: 0, active: 0, blocked: 0, error: 0 },
        fileExists: false,
      };
    }
    throw err;
  }
  const now = Date.now();

  const accounts = rows
    .filter((r) => String(r.login_email || "").trim())
    .map((r) => {
      const status = String(r.status || "").trim();
      const statusLower = status.toLowerCase();
      const blokVaxti = String(r.blok_vaxti || "").trim();
      const blokTime = blokVaxti ? Date.parse(blokVaxti) : NaN;
      const blokedForNow = !Number.isNaN(blokTime) && blokTime > now;

      const isGoodStatus = GOOD_STATUSES.includes(statusLower);
      const isActive = isGoodStatus && !blokedForNow;
      // Bloklanmış: sağlam status amma müvəqqəti kilidlənib, ya da "yer götürüldü" (uğur) cooldown-u
      const isBlocked = (isGoodStatus && blokedForNow) || COOLDOWN_STATUSES.includes(statusLower);
      // Xətalı: qalan hər şey — qeydiyyatsız hesab, giriş/login xətaları, tanınmayan status və s.
      const isError = !isActive && !isBlocked;

      return {
        email: String(r.login_email).trim(),
        status,
        sonIstifade: String(r.son_istifade || "").trim(),
        blokVaxti,
        isActive,
        isBlocked,
        isError,
      };
    });

  const summary = {
    total: accounts.length,
    active: accounts.filter((a) => a.isActive).length,
    blocked: accounts.filter((a) => a.isBlocked).length,
    error: accounts.filter((a) => a.isError).length,
  };

  const statuses = [...new Set(accounts.map((a) => a.status).filter(Boolean))];

  return { accounts, summary, statuses, fileExists: true };
}

export function accountsFilePath(baseDir) {
  return path.join(baseDir, ACCOUNTS_FILENAME);
}

// Telegram bildirişlərində (botProcess.js) hansı hesabla giriş edildiyini göstərmək üçün —
// readAccounts() qəsdən şifrəni frontend-ə göndərmir, ona görə ayrıca daxili funksiya.
export async function getAccountPassword(baseDir, email) {
  try {
    const rows = await readSheetAsObjects(accountsFilePath(baseDir));
    const target = String(email).trim().toLowerCase();
    const row = rows.find((r) => String(r.login_email || "").trim().toLowerCase() === target);
    return row ? String(row.login_parol || "").trim() : "";
  } catch {
    return "";
  }
}

export function getHeaderMap(sheet) {
  const map = {};
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    map[normalizeHeader(cell.value)] = colNumber;
  });
  return map;
}

export async function saveWorkbookAtomic(workbook, filePath) {
  const buffer = await workbook.xlsx.writeBuffer();
  const tmpPath = `${filePath}.tmp-${Date.now()}`;
  await fs.writeFile(tmpPath, buffer);
  await fs.rename(tmpPath, filePath);
}

export function findRowByColumn(sheet, headers, colKey, value) {
  if (!headers[colKey]) throw new Error(`Excel-də '${colKey}' sütunu yoxdur`);
  const target = String(value).trim().toLowerCase();
  let match = null;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1 || match) return;
    const cellValue = String(row.getCell(headers[colKey]).value || "").trim().toLowerCase();
    if (cellValue === target) match = row;
  });
  if (!match) throw new Error("Sətir tapılmadı");
  return match;
}

export async function updateAccountStatus(baseDir, email, newStatus) {
  const filePath = accountsFilePath(baseDir);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  const headers = getHeaderMap(sheet);
  if (!headers.status) throw new Error("Excel-də 'status' sütunu yoxdur");
  const row = findRowByColumn(sheet, headers, "login_email", email);
  row.getCell(headers.status).value = newStatus;
  await saveWorkbookAtomic(workbook, filePath);
}

// login_email (KÖHNƏ) ilə hesabı tapıb göndərilmiş sütunları yeniləyir. Tarix sütunları
// (son_istifade, blok_vaxti) frontend-dən xam (dəyişməyibsə eyni) mətn kimi gəlir və olduğu
// kimi yazılır — dəyişməyən dəyər korlanmır.
export async function updateAccount(baseDir, oldEmail, updates = {}) {
  const filePath = accountsFilePath(baseDir);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  const headers = getHeaderMap(sheet);
  const row = findRowByColumn(sheet, headers, "login_email", oldEmail);

  const map = {
    email: "login_email",
    status: "status",
    sonIstifade: "son_istifade",
    blokVaxti: "blok_vaxti",
  };
  for (const [key, col] of Object.entries(map)) {
    if (updates[key] === undefined || !headers[col]) continue;
    row.getCell(headers[col]).value = String(updates[key]).trim();
  }

  await saveWorkbookAtomic(workbook, filePath);
}

export async function deleteAccount(baseDir, email) {
  const filePath = accountsFilePath(baseDir);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  const headers = getHeaderMap(sheet);
  const row = findRowByColumn(sheet, headers, "login_email", email);
  sheet.spliceRows(row.number, 1);
  await saveWorkbookAtomic(workbook, filePath);
}

export async function addAccount(baseDir, { email, password, status }) {
  if (!email || !email.trim()) throw new Error("Email tələb olunur");

  const filePath = accountsFilePath(baseDir);
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.readFile(filePath);
  } catch (err) {
    if (err.code !== "ENOENT" && !err.message?.includes("File not found")) throw err;
    // Fayl yoxdursa sıfırdan başlıq sətri ilə yaradırıq
    const sheet = workbook.addWorksheet("Sheet1");
    sheet.addRow(["login_email", "login_parol", "status", "son_istifade", "blok_vaxti"]);
  }

  const sheet = workbook.worksheets[0];
  const headers = getHeaderMap(sheet);
  const newRowNumber = sheet.rowCount + 1;
  const row = sheet.getRow(newRowNumber);
  if (headers.login_email) row.getCell(headers.login_email).value = email.trim();
  if (headers.login_parol) row.getCell(headers.login_parol).value = (password || "").trim();
  if (headers.status) row.getCell(headers.status).value = (status || "Aktiv").trim();
  row.commit();

  await saveWorkbookAtomic(workbook, filePath);
}

async function validateAccountsBuffer(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Excel faylında heç bir vərəq tapılmadı");

  const headers = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell) => {
    headers.push(normalizeHeader(cell.value));
  });
  if (!headers.includes("login_email")) {
    throw new Error("Excel faylında 'login_email' sütunu tapılmadı");
  }
}

// Köhnə accounts.xlsx-i yenisi ilə əvəz edir. Fayl adı dəyişmir ki, bot6.py onu tapa bilsin.
export async function replaceAccountsFile(baseDir, buffer) {
  await validateAccountsBuffer(buffer);
  const filePath = accountsFilePath(baseDir);
  const tmpPath = `${filePath}.tmp-${Date.now()}`;
  await fs.writeFile(tmpPath, buffer);
  await fs.rename(tmpPath, filePath);
}
