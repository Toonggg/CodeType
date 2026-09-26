/**
 * The saved-import record (Q13, R4).
 *
 * Schema v2:
 *   { version: 2, id: "custom", source: "local" | "github", filename, repo, path,
 *     url, language, code, range }
 * - code is the normalized full file (comments included; skipping them is a
 *   display setting, so the choice is reversible),
 * - path is the display path shown in the card header,
 * - range is null or { start, end } (1-based, inclusive).
 *
 * v1 records ({ id, filename, repo, path, icon, code } with comments already
 * stripped) are migrated; anything else is discarded.
 */
import { LANGUAGES, detectLanguage } from "../syntax/languages.js";
import { normalizeSource } from "./normalize.js";

export const IMPORT_VERSION = 2;

const isString = (value) => typeof value === "string";
const isLine = (value) => Number.isInteger(value) && value >= 1;

function validRange(range) {
  return range === null || (isLine(range?.start) && isLine(range?.end) && range.end >= range.start);
}

export function createImportRecord({
  source,
  filename,
  repo,
  path,
  url = null,
  code,
  range = null,
  language,
}) {
  return {
    version: IMPORT_VERSION,
    id: "custom",
    source,
    filename,
    repo,
    path,
    url,
    language: language ?? detectLanguage(filename),
    code,
    range,
  };
}

export function isValidImportRecord(value) {
  return Boolean(
    value &&
    value.version === IMPORT_VERSION &&
    value.id === "custom" &&
    (value.source === "local" || value.source === "github") &&
    isString(value.filename) &&
    isString(value.repo) &&
    isString(value.path) &&
    isString(value.code) &&
    Object.hasOwn(LANGUAGES, value.language) &&
    validRange(value.range ?? null),
  );
}

/** Returns a valid v2 record, migrating v1 records; null when unusable. */
export function migrateImportRecord(value) {
  if (!value || typeof value !== "object") return null;
  if (value.version === IMPORT_VERSION) {
    return isValidImportRecord(value) ? { ...value, range: value.range ?? null } : null;
  }
  if (value.version !== undefined || !isString(value.code) || !isString(value.filename)) {
    return null;
  }
  const local = /local file/.test(value.path ?? "");
  const path = local
    ? "/ local file"
    : (value.path ?? "").replace(/\s*·\s*comments skipped$/, "").trim() || `/ ${value.filename}`;
  return createImportRecord({
    source: local ? "local" : "github",
    filename: value.filename,
    repo: isString(value.repo) ? value.repo : value.filename,
    path,
    code: normalizeSource(value.code).text,
  });
}
