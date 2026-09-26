/**
 * Renders the card header and the code display.
 */
import { syntaxClassAt } from "../syntax/tokenize.js";

function escapeHtml(value) {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c],
  );
}

function charStateClass(char, typedChar, i, typedLength) {
  if (i >= typedLength) return i === typedLength ? "current" : "";
  const whitespace = /\s/.test(char) || (typedChar && /\s/.test(typedChar));
  if (whitespace) return "";
  return typedChar === char ? "correct" : "incorrect";
}

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
  if (!targetChanged && state.typed === prev.typed) return;

  const { typed, target } = state;
  els.display.innerHTML = [...target.text]
    .map((char, i) => {
      const stateClass = charStateClass(char, typed[i], i, typed.length);
      const text = char === "\n" ? "\n" : escapeHtml(char);
      return `<span class="char ${stateClass} ${syntaxClassAt(target.ranges, i)}">${text}</span>`;
    })
    .join("");
  const current = els.display.querySelector(".current");
  if (current) {
    const lineHeight = parseFloat(getComputedStyle(els.display).lineHeight);
    const currentLine = target.text.slice(0, typed.length).split("\n").length - 1;
    const offset = currentLine * lineHeight - els.display.clientHeight / 2;
    els.display.scrollTop = Math.max(0, offset + lineHeight);
  }
  els.clickHint.style.opacity = typed ? "0" : "1";
}
