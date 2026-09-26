/**
 * Turns downloaded or read text into an import record plus messages for the user.
 */
import { PRACTICE_MAX_LINES } from "../constants.js";
import { ImportError } from "./errors.js";
import { looksBinary, normalizeSource } from "./normalize.js";
import { createImportRecord } from "./record.js";

/** Clamps a line range to the file and to the practice limit. */
export function clampRange(range, totalLines, maxLines = PRACTICE_MAX_LINES) {
  const start = Math.min(Math.max(1, Math.trunc(range.start) || 1), totalLines);
  let end = Math.min(Math.max(start, Math.trunc(range.end) || start), totalLines);
  const limited = end - start + 1 > maxLines;
  if (limited) end = start + maxLines - 1;
  return { range: { start, end }, limited };
}

/**
 * meta: { source, filename, repo, path, url, lineRange }
 * Returns { record, notices } or throws ImportError.
 */
export function prepareImport(text, meta) {
  if (looksBinary(text)) {
    throw new ImportError(`${meta.filename} looks like a binary file. Import a text source file.`);
  }
  const normalized = normalizeSource(text);
  if (!normalized.text.trim()) throw new ImportError(`${meta.filename} is empty.`);

  const totalLines = normalized.text.split("\n").length;
  const notices = [];
  let range = null;
  if (meta.lineRange) {
    const clamped = clampRange(meta.lineRange, totalLines);
    range = clamped.range;
    if (clamped.limited) {
      notices.push(
        `Showing lines ${range.start}–${range.end}: at most ${PRACTICE_MAX_LINES} lines are practiced at once.`,
      );
    }
  } else if (totalLines > PRACTICE_MAX_LINES) {
    range = { start: 1, end: PRACTICE_MAX_LINES };
    notices.push(
      `Showing lines 1–${PRACTICE_MAX_LINES} of ${totalLines}. Choose other lines under Options → Lines.`,
    );
  }
  if (normalized.untypeable.length) {
    notices.push(
      `This file contains characters that are hard to type on a standard keyboard: ${normalized.untypeable.join(" ")}`,
    );
  }
  const record = createImportRecord({
    source: meta.source,
    filename: meta.filename,
    repo: meta.repo,
    path: meta.path,
    url: meta.url ?? null,
    code: normalized.text,
    range,
  });
  return { record, notices, totalLines };
}
