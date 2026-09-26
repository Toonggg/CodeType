/**
 * Normalization of imported text (B4, R8). Line structure is preserved exactly
 * (one line in, one line out) so GitHub #L line numbers stay valid; blank-line
 * collapsing happens later, when the practice lines are selected.
 */

const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;
const NO_BREAK_SPACES = /[\u00A0\u2007\u202F]/g;
const TYPOGRAPHIC = {
  "\u201C": '"',
  "\u201D": '"',
  "\u201E": '"',
  "\u2018": "'",
  "\u2019": "'",
  "\u201A": "'",
  "\u2013": "-",
  "\u2014": "-",
  "\u2026": "...",
};
const TYPOGRAPHIC_PATTERN = new RegExp(`[${Object.keys(TYPOGRAPHIC).join("")}]`, "g");
/** C0 and C1 control characters other than tab and newline. */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;
/** Anything outside printable ASCII, tab and newline. */
const HARD_TO_TYPE = /[^\t\n\x20-\x7E]/gu;

/**
 * Returns { text, replaced, untypeable, untypeableCount }:
 * - byte order marks and zero-width characters are removed,
 * - CRLF and CR become LF, no-break spaces become spaces,
 * - curly quotes, dashes and ellipses become their ASCII forms,
 * - other control characters are removed,
 * - trailing whitespace is trimmed from every line,
 * - `untypeable` lists up to eight distinct characters that remain hard to type.
 */
export function normalizeSource(input) {
  let replaced = 0;
  const count = (pattern, text) => (text.match(pattern) ?? []).length;
  let text = String(input);
  text = text.replace(/\r\n?/g, "\n");
  replaced += count(ZERO_WIDTH, text) + count(NO_BREAK_SPACES, text);
  text = text.replace(ZERO_WIDTH, "").replace(NO_BREAK_SPACES, " ");
  replaced += count(TYPOGRAPHIC_PATTERN, text);
  text = text.replace(TYPOGRAPHIC_PATTERN, (char) => TYPOGRAPHIC[char]);
  text = text.replace(CONTROL, "");
  text = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n");

  const hard = text.match(HARD_TO_TYPE) ?? [];
  return {
    text,
    replaced,
    untypeable: [...new Set(hard)].slice(0, 8),
    untypeableCount: hard.length,
  };
}

/**
 * Heuristic binary detection (R7): NUL bytes, or many control or replacement
 * characters (what invalid UTF-8 decodes to) in the first 8,000 characters.
 */
export function looksBinary(text) {
  const sample = String(text).slice(0, 8000);
  if (!sample) return false;
  if (sample.includes("\u0000")) return true;
  // eslint-disable-next-line no-control-regex -- matching control characters is the point
  const suspicious = (sample.match(/[\u0001-\u0008\u000E-\u001F\uFFFD]/g) ?? []).length;
  return suspicious / sample.length > 0.02;
}
