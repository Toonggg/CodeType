/**
 * Practice documents and targets.
 *
 * A document is the full source text split into lines, with a token type for
 * every code point. It is tokenized once over the whole text, so a target that
 * starts part-way through (random start) is still highlighted correctly, even
 * inside a docstring or block comment (B8).
 *
 * A target is what the user types: the document's lines from a start line on,
 * joined with newlines, as code-point arrays.
 */
import { RANDOM_START_MIN_LINES } from "./constants.js";
import { filterCommentLines } from "./import/comments.js";
import { detectLanguage } from "./syntax/languages.js";
import { tokenizeLines } from "./syntax/tokenize.js";

export function languageOf(item) {
  return item.language || detectLanguage(item.filename || item.path || item.repo || "");
}

export function createDocument(text, language) {
  const lines = tokenizeLines(text, language).map((line, index) => ({
    ...line,
    number: index + 1,
  }));
  return { language, lines, totalLines: lines.length };
}

const isBlank = (line) => line.text.trim() === "";

/**
 * Selects the lines to practice from a document, keeping original line numbers:
 * - `range` ({ start, end }, 1-based and inclusive) limits the lines,
 * - `skipComments` removes comment-only lines,
 * - runs of three or more blank lines collapse to one, and blank lines at the
 *   start and end are dropped.
 * When skipping comments would leave nothing, the comments are kept and
 * `commentsKept` is true.
 */
export function selectLines(document, { range = null, skipComments = false } = {}) {
  let lines = range
    ? document.lines.filter((line) => line.number >= range.start && line.number <= range.end)
    : document.lines;
  let commentsKept = false;
  if (skipComments) {
    const filtered = filterCommentLines(lines);
    if (filtered.some((line) => !isBlank(line))) lines = filtered;
    else commentsKept = lines.some((line) => !isBlank(line));
  }
  // Blank lines are held back until the next content line: a run of three or more
  // collapses to one, and runs at the start or end are dropped.
  const collapsed = [];
  let pendingBlank = [];
  for (const line of lines) {
    if (isBlank(line)) {
      pendingBlank.push(line);
      continue;
    }
    if (collapsed.length) {
      collapsed.push(...(pendingBlank.length >= 3 ? pendingBlank.slice(0, 1) : pendingBlank));
    }
    pendingBlank = [];
    collapsed.push(line);
  }
  return { ...document, lines: collapsed, commentsKept };
}

/**
 * Picks a random start line (B8): a non-blank line that leaves at least
 * min(RANDOM_START_MIN_LINES, total) lines to type, preferring lines that are not
 * indented, and avoiding `exclude` (the current start) when there is a choice.
 */
export function chooseStartLine(
  lines,
  { exclude = -1, random = Math.random, minLines = RANDOM_START_MIN_LINES } = {},
) {
  const needed = Math.min(minLines, lines.length);
  const candidates = [];
  for (let i = 0; lines.length - i >= needed; i += 1) {
    if (lines[i].text.trim()) candidates.push(i);
  }
  const topLevel = candidates.filter((i) => !/^[ \t]/.test(lines[i].text));
  let pool = topLevel.length ? topLevel : candidates;
  if (pool.length > 1) pool = pool.filter((i) => i !== exclude);
  return pool.length ? pool[Math.floor(random() * pool.length)] : 0;
}

export function buildTarget(document, startLine = 0) {
  const lines = document.lines.slice(startLine);
  const chars = [];
  const types = [];
  const lineStarts = [];
  lines.forEach((line, index) => {
    if (index > 0) {
      chars.push("\n");
      types.push(null);
    }
    lineStarts.push(chars.length);
    for (let i = 0; i < line.chars.length; i += 1) {
      chars.push(line.chars[i]);
      types.push(line.types[i]);
    }
  });
  return {
    language: document.language,
    chars,
    types,
    lineStarts,
    lineNumbers: lines.map((line) => line.number),
    startLine,
    lineCount: lines.length,
  };
}
