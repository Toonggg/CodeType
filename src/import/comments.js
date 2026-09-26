/**
 * Comment-line removal (B4). A line is removed only when every non-whitespace
 * character on it is part of a comment token, as decided by the language's
 * tokenizer. So `*ptr = x;`, `#include`, `#[derive]` and a "/*" inside a string
 * are never mistaken for comments, and `#` is a comment only in languages where
 * it is one.
 */
import { tokenizeLines } from "../syntax/tokenize.js";

const isBlank = (line) => line.text.trim() === "";

/** True when the line has content and all of it is comment. */
export function isCommentOnlyLine(line) {
  let hasComment = false;
  for (let i = 0; i < line.chars.length; i += 1) {
    const char = line.chars[i];
    if (char === " " || char === "\t") continue;
    if (line.types[i] !== "comment") return false;
    hasComment = true;
  }
  return hasComment;
}

/**
 * Removes comment-only lines. A blank line that would directly follow another
 * blank line because comments between them were removed is dropped as well.
 */
export function filterCommentLines(lines) {
  const kept = [];
  let removedSinceKept = false;
  for (const line of lines) {
    if (isCommentOnlyLine(line)) {
      removedSinceKept = true;
      continue;
    }
    const previous = kept[kept.length - 1];
    if (isBlank(line) && removedSinceKept && (!previous || isBlank(previous))) continue;
    kept.push(line);
    removedSinceKept = false;
  }
  return kept;
}

/** Convenience wrapper over text. */
export function stripCommentLines(text, language) {
  return filterCommentLines(tokenizeLines(text, language))
    .map((line) => line.text)
    .join("\n");
}
