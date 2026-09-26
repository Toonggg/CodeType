/**
 * Syntax highlighting ranges (legacy implementation, replaced by a one-pass
 * tokenizer in Phase 4).
 */
import { SYNTAX_RULES } from "./languages.js";

export function buildSyntaxRanges(code, lang) {
  const ranges = [];
  for (const [type, rule] of SYNTAX_RULES[lang] || SYNTAX_RULES.generic) {
    for (const match of code.matchAll(rule)) {
      ranges.push({ start: match.index, end: match.index + match[0].length, type });
    }
  }
  return ranges.sort((a, b) => a.start - b.start);
}

export function syntaxClassAt(ranges, index) {
  const range = ranges.find(({ start, end }) => index >= start && index < end);
  return range ? `syntax-${range.type}` : "";
}
