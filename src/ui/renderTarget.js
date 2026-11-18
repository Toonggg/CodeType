/**
 * Renders the card header and the code display.
 *
 * Rendering contract (P1): the spans are built once per target (build), then
 * each edit only patches the inclusive index range it changed, which always
 * includes the old and the new cursor (patch). Text is set with textContent, so
 * no HTML string is ever built from file content (R1).
 *
 * Each line is wrapped in a block-level span. A class change then only re-lays
 * out its own line instead of the whole file, which keeps keystrokes cheap on
 * long imports.
 */
import { LANGUAGES } from "../syntax/languages.js";
import { CHAR, charState } from "../typing.js";

/** Whitespace classes let CSS draw ↵ · → at the cursor and on mistakes (U1). */
const WHITESPACE_CLASS = { " ": "ws-space", "\t": "ws-tab", "\n": "ws-nl" };

const STATE_CLASS = {
  [CHAR.PENDING]: "",
  [CHAR.CORRECT]: " correct",
  [CHAR.INCORRECT]: " incorrect",
};

function renderHeader(els, { item, target, document }) {
  const range = item.range ? ` · lines ${item.range.start}–${item.range.end}` : "";
  const from = target.startLine ? ` · from line ${target.lineNumbers[0]}` : "";
  const comments = document.commentsKept ? " · only comments here" : "";
  els.repoName.textContent = item.repo;
  els.repoPath.textContent = ` ${item.path}${range}${from}${comments}`;
  els.repoIcon.textContent = (LANGUAGES[target.language] ?? LANGUAGES.generic).badge;
  els.lineCount.textContent = `${String(target.lineCount).padStart(2, "0")} lines`;
}

function lineForIndex(lineStarts, index) {
  let low = 0;
  let high = lineStarts.length - 1;
  let line = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lineStarts[mid] <= index) {
      line = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return line;
}

export function createTargetView(els) {
  let spans = [];
  let baseClasses = [];
  let lineHeight = 0;
  let lastScrollLine = -1;

  function classFor(index, target, session) {
    if (index === session.typed.length) return `${baseClasses[index]} current`;
    return baseClasses[index] + STATE_CLASS[charState(target.chars, session.typed, index)];
  }

  function build({ target, session }) {
    const fragment = document.createDocumentFragment();
    const newLine = () => {
      const line = document.createElement("span");
      line.className = "line";
      fragment.append(line);
      return line;
    };
    let line = newLine();
    spans = new Array(target.chars.length);
    baseClasses = new Array(target.chars.length);
    for (let i = 0; i < target.chars.length; i += 1) {
      const char = target.chars[i];
      const type = target.types[i];
      let base = "char";
      if (WHITESPACE_CLASS[char]) base += ` ${WHITESPACE_CLASS[char]}`;
      if (type) base += ` syntax-${type}`;
      baseClasses[i] = base;
      const span = document.createElement("span");
      span.className = classFor(i, target, session);
      span.textContent = char;
      spans[i] = span;
      line.append(span);
      if (char === "\n") line = newLine();
    }
    els.display.replaceChildren(fragment);
    els.display.scrollTop = 0;
    // The same text, unstyled, for screen readers (A2).
    els.targetText.textContent = target.chars.join("");
    // Read once per target, never per keystroke (P2).
    lineHeight = parseFloat(getComputedStyle(els.display).lineHeight) || 0;
    lastScrollLine = -1;
  }

  function patch({ target, session }, from, to) {
    const last = Math.min(to, spans.length - 1);
    for (let i = Math.max(0, from); i <= last; i += 1) {
      const next = classFor(i, target, session);
      if (spans[i].className !== next) spans[i].className = next;
    }
  }

  /** Keeps the cursor near the middle; offsetTop is correct with wrapped lines (B9, PERF-4). */
  function scrollToCursor({ target, session }) {
    const cursor = session.typed.length;
    const currentLine = lineForIndex(target.lineStarts, cursor);
    if (currentLine === lastScrollLine) return;
    lastScrollLine = currentLine;
    const span = spans[cursor] ?? spans[spans.length - 1];
    if (!span) return;
    const targetTop = Math.max(0, span.offsetTop - els.display.clientHeight / 2 + lineHeight);
    if (Math.abs(els.display.scrollTop - targetTop) > 1) {
      els.display.scrollTop = targetTop;
    }
  }

  function render(state, prev) {
    if (!prev || state.targetVersion !== prev.targetVersion) {
      renderHeader(els, state);
      build(state);
    } else if (state.session !== prev.session) {
      const edited = state.edit && state.edit !== prev.edit ? state.edit : null;
      const from = edited ? edited.from : 0;
      const to = edited
        ? edited.to
        : Math.max(prev.session.typed.length, state.session.typed.length);
      patch(state, from, to);
      scrollToCursor(state);
    } else {
      return;
    }
    els.clickHint.style.opacity = state.session.typed.length ? "0" : "1";
  }

  return { render };
}
