/**
 * Turns downloaded or read text into an import record plus messages for the user.
 */
import { PRACTICE_MAX_CHARS, PRACTICE_MAX_LINES } from "../constants.js";
import { splitLines } from "../practice.js";
import { ImportError } from "./errors.js";
import { looksBinary, normalizeSource } from "./normalize.js";
import { createImportRecord } from "./record.js";

/** Clamps a line range to the file and to the practice limits (lines and characters). */
export function clampRange(
  range,
  totalLines,
  maxLines = PRACTICE_MAX_LINES,
  lineLengths = null,
  maxChars = PRACTICE_MAX_CHARS,
) {
  const start = Math.min(Math.max(1, Math.trunc(range.start) || 1), totalLines);
  let end = Math.min(Math.max(start, Math.trunc(range.end) || start), totalLines);
  let limited = false;
  let limitedReason = null;

  if (end - start + 1 > maxLines) {
    end = start + maxLines - 1;
    limited = true;
    limitedReason = "lines";
  }

  if (lineLengths && lineLengths.length > 0) {
    let charCount = 0;
    let fitEnd = start;
    for (let lineNum = start; lineNum <= end; lineNum += 1) {
      const len = lineLengths[lineNum - 1] ?? 0;
      const addChars = lineNum === start ? len : 1 + len;
      if (charCount + addChars > maxChars) {
        if (lineNum > start) {
          fitEnd = lineNum - 1;
          limited = true;
          limitedReason = "chars";
        }
        break;
      }
      charCount += addChars;
      fitEnd = lineNum;
    }
    end = fitEnd;
  }

  return { range: { start, end }, limited, limitedReason };
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

  const rawLines = splitLines(normalized.text);
  const notices = [];
  let truncatedSingleLine = false;
  const processedLines = rawLines.map((line) => {
    if (line.length > PRACTICE_MAX_CHARS) {
      truncatedSingleLine = true;
      return line.slice(0, PRACTICE_MAX_CHARS);
    }
    return line;
  });
  if (truncatedSingleLine) {
    notices.push(`Lines longer than ${PRACTICE_MAX_CHARS} characters were truncated.`);
  }
  const endsWithNewline = normalized.text.endsWith("\n");
  const code = processedLines.join("\n") + (endsWithNewline ? "\n" : "");
  const totalLines = processedLines.length;
  const lineLengths = processedLines.map((l) => l.length);
  const totalChars = code.length;

  let range = null;
  if (meta.lineRange) {
    const clamped = clampRange(
      meta.lineRange,
      totalLines,
      PRACTICE_MAX_LINES,
      lineLengths,
      PRACTICE_MAX_CHARS,
    );
    range = clamped.range;
    if (clamped.limited) {
      if (clamped.limitedReason === "chars") {
        notices.push(
          `Showing lines ${range.start}–${range.end}: at most ${PRACTICE_MAX_CHARS} characters are practiced at once.`,
        );
      } else {
        notices.push(
          `Showing lines ${range.start}–${range.end}: at most ${PRACTICE_MAX_LINES} lines are practiced at once.`,
        );
      }
    }
  } else if (totalLines > PRACTICE_MAX_LINES || totalChars > PRACTICE_MAX_CHARS) {
    const clamped = clampRange(
      { start: 1, end: totalLines },
      totalLines,
      PRACTICE_MAX_LINES,
      lineLengths,
      PRACTICE_MAX_CHARS,
    );
    range = clamped.range;
    if (clamped.limitedReason === "chars") {
      notices.push(
        `Showing lines 1–${range.end} of ${totalLines}: at most ${PRACTICE_MAX_CHARS} characters are practiced at once. Choose other lines under Options → Lines.`,
      );
    } else {
      notices.push(
        `Showing lines 1–${PRACTICE_MAX_LINES} of ${totalLines}. Choose other lines under Options → Lines.`,
      );
    }
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
    code,
    range,
  });
  return { record, notices, totalLines };
}
