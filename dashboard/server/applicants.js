import fs from "node:fs/promises";
import path from "node:path";

import ExcelJS from "exceljs";

import { findRowByColumn, getHeaderMap, normalizeHeader, readSheetAsObjects, saveWorkbookAtomic } from "./excel.js";

export const APPLICANTS_FILENAME = "applicants.xlsx";
// Latviya applicants.xlsx-də tarix_baslangic/tarix_bitis native Excel tarixi kimi saxlanılır —
// yeni sətir əlavə edərkən eyni formatı istifadə edirik ki, bot6.py (pandas) bunları
// pd.Timestamp kimi oxusun, sadə mətn kimi yox.
const DATE_NUMFMT = "yyyy-mm-dd hh:mm:ss";

// Bot bu statusları "gözləyən, hələ skan edilməli" kimi qəbul edir (boş xana da daxil).
// Bot iş bitəndə status = 1 yazır, ona görə "1" pending deyil.
const PENDING_STATUSES = ["", "gozleyir", "gözləyir", "nan", "none"];

export function applicantsFilePath(baseDir) {
  return path.join(baseDir, APPLICANTS_FILENAME);
}

export async function readApplicants(baseDir) {
  const filePath = applicantsFilePath(baseDir);
  let rows;
  try {
    rows = await readSheetAsObjects(filePath);
  } catch (err) {
    if (err.code === "ENOENT" || err.message?.includes("File not found")) {
      return {
        applicants: [],
        summary: { total: 0, pending: 0, done: 0, groups: 0 },
        statuses: [],
        fileExists: false,
      };
    }
    throw err;
  }

  const applicants = rows
    .filter((r) => String(r.ad || "").trim() || String(r.soyad || "").trim())
    .map((r) => {
      const status = String(r.status ?? "").trim();
      const isPending = PENDING_STATUSES.includes(status.toLowerCase());
      return {
        qrupId: String(r.qrup_id ?? "").trim(),
        ad: String(r.ad || "").trim(),
        soyad: String(r.soyad || "").trim(),
        mail: String(r.mail || "").trim(),
        telefon: String(r.telefon ?? "").trim(),
        tarixBaslangic: String(r.tarix_baslangic || "").trim(),
        tarixBitis: String(r.tarix_bitis || "").trim(),
        vizaNovu: String(r.viza_novu ?? "").trim(),
        status,
        isPending,
      };
    });

  const summary = {
    total: applicants.length,
    pending: applicants.filter((a) => a.isPending).length,
    done: applicants.filter((a) => !a.isPending).length,
    groups: new Set(applicants.filter((a) => a.isPending).map((a) => a.qrupId)).size,
  };
  const statuses = [...new Set(applicants.map((a) => a.status).filter(Boolean))];

  return { applicants, summary, statuses, fileExists: true };
}

// Frontend-dən gələn "20.07.2026" (DD.MM.YYYY) və ya "2026-07-20" (ISO) mətnini native
// tarixə çevirir ki, bot6.py (pandas) onu Timestamp kimi oxusun. Tanımasa null qaytarır.
function parseFlexibleDate(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return null;
}

// mail (KÖHNƏ) ilə ərizəçini tapıb göndərilmiş bütün sahələri yeniləyir.
// Yalnız `updates`-də olan açarlar dəyişir — qalan xanalara toxunulmur.
export async function updateApplicant(baseDir, mail, updates = {}) {
  const filePath = applicantsFilePath(baseDir);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  const headers = getHeaderMap(sheet);
  const row = findRowByColumn(sheet, headers, "mail", mail);

  const textMap = {
    qrupId: "qrup_id",
    ad: "ad",
    soyad: "soyad",
    mail: "mail",
    telefon: "telefon",
    vizaNovu: "viza_novu",
    status: "status",
  };
  const dateMap = {
    tarixBaslangic: "tarix_baslangic",
    tarixBitis: "tarix_bitis",
  };

  for (const [key, col] of Object.entries(textMap)) {
    if (updates[key] === undefined || !headers[col]) continue;
    row.getCell(headers[col]).value = String(updates[key]).trim();
  }
  for (const [key, col] of Object.entries(dateMap)) {
    if (updates[key] === undefined || !headers[col]) continue;
    const cell = row.getCell(headers[col]);
    const raw = String(updates[key]).trim();
    const parsed = parseFlexibleDate(raw);
    if (parsed) {
      cell.value = parsed;
      cell.numFmt = DATE_NUMFMT;
    } else {
      cell.value = raw;
    }
  }

  await saveWorkbookAtomic(workbook, filePath);
}

export async function deleteApplicant(baseDir, mail) {
  const filePath = applicantsFilePath(baseDir);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  const headers = getHeaderMap(sheet);
  const row = findRowByColumn(sheet, headers, "mail", mail);
  sheet.spliceRows(row.number, 1);
  await saveWorkbookAtomic(workbook, filePath);
}

function parseDateInput(value) {
  if (!value) return null;
  // <input type="date"> "YYYY-MM-DD" qaytarır — tarix-yalnız ISO sətir ECMAScript
  // spesifikasiyasına görə UTC gecəyarısı kimi parse olunur, ona görə server hansı
  // saat qurşağında olursa olsun (Bakı və ya başqa) təqvim günü sürüşmür.
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function addApplicant(baseDir, fields) {
  const {
    qrupId,
    ad,
    soyad,
    mail,
    telefon,
    tarixBaslangic,
    tarixBitis,
    vizaNovu,
    status,
  } = fields;

  if (!ad || !ad.trim()) throw new Error("Ad tələb olunur");
  if (!mail || !mail.trim()) throw new Error("Mail tələb olunur");

  const filePath = applicantsFilePath(baseDir);
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.readFile(filePath);
  } catch (err) {
    if (err.code !== "ENOENT" && !err.message?.includes("File not found")) throw err;
    // Fayl yoxdursa sıfırdan başlıq sətri ilə yaradırıq
    const sheet = workbook.addWorksheet("Sheet1");
    sheet.addRow([
      "qrup_id",
      "ad",
      "soyad",
      "mail",
      "telefon",
      "tarix_baslangic",
      "tarix_bitis",
      "viza_novu",
      "status",
    ]);
  }

  const sheet = workbook.worksheets[0];
  const headers = getHeaderMap(sheet);

  // Eyni qrup_id-ə aid sətirləri bir yerdə saxlamaq üçün — yeni ərizəçini lap sona yox,
  // öz qrupunun son sətrindən dərhal sonra əlavə edirik. Uyğun qrup tapılmasa (və ya bu
  // qrupun son sətri artıq faylın ən sonudursa) sadəcə axırına əlavə olunur.
  const targetQrupId = (qrupId ?? "").toString().trim();
  let insertAt = sheet.rowCount + 1;
  if (targetQrupId && headers.qrup_id) {
    let lastMatchRow = null;
    sheet.eachRow((r, rowNumber) => {
      if (rowNumber === 1) return;
      const cellVal = String(r.getCell(headers.qrup_id).value ?? "").trim();
      if (cellVal === targetQrupId) lastMatchRow = rowNumber;
    });
    if (lastMatchRow) insertAt = lastMatchRow + 1;
  }
  if (insertAt <= sheet.rowCount) {
    sheet.spliceRows(insertAt, 0, []);
  }
  const row = sheet.getRow(insertAt);

  const setCell = (key, value) => {
    if (headers[key]) row.getCell(headers[key]).value = value;
  };
  const setDateCell = (key, value) => {
    if (!headers[key]) return;
    const parsed = parseDateInput(value);
    if (!parsed) return;
    const cell = row.getCell(headers[key]);
    cell.value = parsed;
    cell.numFmt = DATE_NUMFMT;
  };

  setCell("qrup_id", (qrupId ?? "").toString().trim());
  setCell("ad", ad.trim());
  setCell("soyad", (soyad || "").trim());
  setCell("mail", mail.trim());
  setCell("telefon", (telefon || "").trim());
  setDateCell("tarix_baslangic", tarixBaslangic);
  setDateCell("tarix_bitis", tarixBitis);
  setCell("viza_novu", (vizaNovu ?? "").toString().trim());
  setCell("status", (status || "").trim());
  row.commit();

  await saveWorkbookAtomic(workbook, filePath);
}

async function validateApplicantsBuffer(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Excel faylında heç bir vərəq tapılmadı");

  const headers = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell) => headers.push(normalizeHeader(cell.value)));
  if (!headers.includes("mail")) {
    throw new Error("Excel faylında 'mail' sütunu tapılmadı");
  }
}

// Köhnə applicants.xlsx-i yenisi ilə əvəz edir. Fayl adı dəyişmir ki, bot6.py onu tapa bilsin.
export async function replaceApplicantsFile(baseDir, buffer) {
  await validateApplicantsBuffer(buffer);
  const filePath = applicantsFilePath(baseDir);
  const tmpPath = `${filePath}.tmp-${Date.now()}`;
  await fs.writeFile(tmpPath, buffer);
  await fs.rename(tmpPath, filePath);
}
