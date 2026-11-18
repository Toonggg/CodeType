/**
 * One-pass syntax tokenizer (B27).
 *
 * The text is scanned left to right. At the current position every rule proposes
 * its next match; the earliest start wins, ties go to the longest match and then
 * to the rule listed first. The winning match is consumed and scanning continues
 * after it, so tokens never overlap and a comment marker inside a string can never
 * leak.
 *
 * Each rule's next match is cached and only recomputed once the scan has passed
 * its start, which keeps the cost close to one pass per rule.
 */
import { SYNTAX_RULES } from "./languages.js";

function compileRule(type, pattern) {
  if (
    pattern &&
    typeof pattern === "object" &&
    !(pattern instanceof RegExp) &&
    "start" in pattern &&
    "end" in pattern
  ) {
    const startPattern = pattern.start;
    return {
      type,
      startRegex: new RegExp(
        startPattern.source,
        startPattern.flags.includes("g") ? startPattern.flags : `${startPattern.flags}g`,
      ),
      end: pattern.end,
      lastEnd: -2,
      next: undefined,
    };
  }
  return {
    type,
    regex: new RegExp(
      pattern.source,
      pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
    ),
    next: undefined,
  };
}

function compile(language) {
  const rules = SYNTAX_RULES[language] ?? SYNTAX_RULES.generic;
  const list = [];
  for (const item of rules) {
    if (Array.isArray(item) && Array.isArray(item[0])) {
      for (const [type, pattern] of item) {
        list.push(compileRule(type, pattern));
      }
    } else {
      const [type, pattern] = item;
      list.push(compileRule(type, pattern));
    }
  }
  return list;
}

function findNext(rule, text, from) {
  if (rule.startRegex) {
    rule.startRegex.lastIndex = from;
    let match = rule.startRegex.exec(text);
    while (match && match[0].length === 0) {
      rule.startRegex.lastIndex = match.index + 1;
      match = rule.startRegex.exec(text);
    }
    if (!match) return null;
    const startIndex = match.index;
    const afterStart = startIndex + match[0].length;
    let endIndex;
    if (rule.lastEnd === -1) {
      endIndex = text.length;
    } else if (rule.lastEnd !== -2 && afterStart <= rule.lastEnd - rule.end.length) {
      endIndex = rule.lastEnd;
    } else {
      const found = text.indexOf(rule.end, afterStart);
      if (found === -1) {
        rule.lastEnd = -1;
        endIndex = text.length;
      } else {
        rule.lastEnd = found + rule.end.length;
        endIndex = rule.lastEnd;
      }
    }
    return { index: startIndex, length: endIndex - startIndex };
  }

  rule.regex.lastIndex = from;
  let match = rule.regex.exec(text);
  while (match && match[0].length === 0) {
    rule.regex.lastIndex = match.index + 1;
    match = rule.regex.exec(text);
  }
  return match ? { index: match.index, length: match[0].length } : null;
}

/**
 * Returns the token type (or null) for every UTF-16 code unit of `text`.
 */
export function tokenize(text, language) {
  const rules = compile(language);
  const types = new Array(text.length).fill(null);
  let position = 0;
  while (position < text.length) {
    let best = null;
    for (const rule of rules) {
      if (rule.next === undefined || (rule.next !== null && rule.next.index < position)) {
        rule.next = findNext(rule, text, position);
      }
      const candidate = rule.next;
      if (
        candidate &&
        (!best ||
          candidate.index < best.index ||
          (candidate.index === best.index && candidate.length > best.length))
      ) {
        best = { ...candidate, type: rule.type };
      }
    }
    if (!best) break;
    types.fill(best.type, best.index, best.index + best.length);
    position = best.index + best.length;
  }
  return types;
}

/** Converts per-code-unit types into per-code-point types (B10). */
export function toCodePointTypes(text, unitTypes) {
  const result = [];
  let unit = 0;
  for (const char of text) {
    result.push(unitTypes[unit]);
    unit += char.length;
  }
  return result;
}

/** Token type (or null) for every code point of `text`. */
export function classifyChars(text, language) {
  return toCodePointTypes(text, tokenize(text, language));
}

/**
 * Splits text into lines, each with its code points and their token types. The
 * whole text is tokenized at once, so multi-line tokens are typed correctly on
 * every line they span.
 */
export function tokenizeLines(text, language) {
  const unitTypes = tokenize(text, language);
  let offset = 0;
  return text.split("\n").map((line) => {
    const types = toCodePointTypes(line, unitTypes.slice(offset, offset + line.length));
    offset += line.length + 1;
    return { text: line, chars: Array.from(line), types };
  });
}
