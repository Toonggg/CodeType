/**
 * Renders the card header and the code display.
 */
import { syntaxClassAt } from "../syntax/tokenize.js";
import { CHAR, charState } from "../typing.js";

function escapeHtml(value) {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c],
  );
}

/** Whitespace classes let CSS draw ↵ · → at the cursor and on mistakes (U1). */
const WHITESPACE_CLASS = { " ": "ws-space", "\t": "ws-tab", "\n": "ws-nl" };

const STATE_CLASS = {
  [CHAR.PENDING]: "",
  [CHAR.CORRECT]: "correct",
  [CHAR.INCORRECT]: "incorrect",
};

function renderHeader(els, { item, target }) {
  const start = target.startLine ? ` · starts at line ${target.startLine + 1}` : "";
  els.repoName.textContent = item.repo;
  els.repoPath.textContent = ` ${item.path}${start}`;
  els.repoIcon.textContent = item.icon;
  els.lineCount.textContent = `${String(target.lineCount).padStart(2, "0")} lines`;
}

export function renderTarget(els, state, prev) {
  const targetChanged = !prev || state.targetVersion !== prev.targetVersion;
  if (targetChanged) renderHeader(els, state);
  if (!targetChanged && state.session === prev.session) return;

  const { session, target } = state;
  const cursor = session.typed.length;
  els.display.innerHTML = target.chars
    .map((char, i) => {
      const stateClass =
        i === cursor ? "current" : STATE_CLASS[charState(target.chars, session.typed, i)];
      const classes = ["char", stateClass, WHITESPACE_CLASS[char], syntaxClassAt(target.ranges, i)]
        .filter(Boolean)
        .join(" ");
      return `<span class="${classes}">${escapeHtml(char)}</span>`;
    })
    .join("");
  const current = els.display.querySelector(".current");
  if (current) {
    const lineHeight = parseFloat(getComputedStyle(els.display).lineHeight);
    const currentLine = target.chars.slice(0, cursor).filter((c) => c === "\n").length;
    const offset = currentLine * lineHeight - els.display.clientHeight / 2;
    els.display.scrollTop = Math.max(0, offset + lineHeight);
  }
  els.clickHint.style.opacity = cursor ? "0" : "1";
}
