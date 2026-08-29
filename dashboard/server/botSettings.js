import fs from "node:fs/promises";
import path from "node:path";

export const SETTINGS_FILENAME = "bot_settings.json";
const VALID_CATEGORIES = ["Tourist", "Business"];
const DEFAULT_CATEGORY = "Tourist";

function settingsFilePath(baseDir) {
  return path.join(baseDir, SETTINGS_FILENAME);
}

export async function getVisaCategory(baseDir) {
  try {
    const raw = await fs.readFile(settingsFilePath(baseDir), "utf8");
    const data = JSON.parse(raw);
    return VALID_CATEGORIES.includes(data.visaCategory) ? data.visaCategory : DEFAULT_CATEGORY;
  } catch {
    return DEFAULT_CATEGORY;
  }
}

export async function setVisaCategory(baseDir, category) {
  if (!VALID_CATEGORIES.includes(category)) {
    throw new Error(`visaCategory yalnız bunlardan biri ola bilər: ${VALID_CATEGORIES.join(", ")}`);
  }
  await fs.writeFile(settingsFilePath(baseDir), JSON.stringify({ visaCategory: category }, null, 2));
  return { visaCategory: category };
}
