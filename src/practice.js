/**
 * Builds the practice target from the selected item and settings.
 */
import { detectLanguage } from "./syntax/languages.js";
import { buildSyntaxRanges } from "./syntax/tokenize.js";
import { toChars } from "./typing.js";

export function chooseRandomStart(lines, random = Math.random) {
  const candidates = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.trim().length > 0)
    .map(({ index }) => index);
  return candidates.length ? candidates[Math.floor(random() * candidates.length)] : 0;
}

export function buildTarget(item, settings, random = Math.random) {
  const lines = item.code.split("\n");
  const startLine = settings.randomStart ? chooseRandomStart(lines, random) : 0;
  const text = lines.slice(startLine).join("\n");
  const language = item.language || detectLanguage(item.filename || item.path || item.repo);
  return {
    text,
    chars: toChars(text),
    startLine,
    language,
    ranges: buildSyntaxRanges(text, language),
    lineCount: text.split("\n").length,
  };
}
