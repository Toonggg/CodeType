/**
 * CodeType entry point: wires DOM events to the practice session.
 */
import {
  CHARS_PER_WORD,
  DOUBLE_ESCAPE_MS,
  MAX_COUNTDOWN_S,
  SHAKE_MS,
  STATS_TICK_MS,
  STORAGE_KEYS,
  TAB_SPACES,
} from "./constants.js";
import { EXAMPLES } from "./data/examples.js";
import { codeOnly } from "./import/comments.js";
import { formatTime } from "./stats.js";
import {
  readFlag,
  readJSON,
  readString,
  removeKey,
  writeFlag,
  writeJSON,
  writeString,
} from "./storage.js";
import { detectLanguage } from "./syntax/languages.js";
import { buildSyntaxRanges, syntaxClassAt } from "./syntax/tokenize.js";
import { populateSourceOptions, setCustomOptionEnabled } from "./ui/controls.js";
import { getElements } from "./ui/dom.js";

const els = getElements();

let target = "";
let startedAt = 0;
let elapsedMs = 0;
let timerId = null;
let countdownTimer = null;
let done = false;
let paused = false;
let syntaxRanges = [];
let currentItem;
let punishmentTimer = null;
let randomStart = false;
let lastEscapeAt = 0;

function activeSnippet() {
  return currentItem || EXAMPLES[0];
}

function render() {
  clearInterval(timerId);
  clearInterval(countdownTimer);
  startedAt = 0;
  elapsedMs = 0;
  timerId = null;
  paused = false;
  exitChallengeMode();
  setTimerState("idle");
  const item = activeSnippet();
  currentItem = item;
  const lines = item.code.split("\n");
  const startLine = randomStart ? chooseRandomStart(lines) : 0;
  target = lines.slice(startLine).join("\n");
  const language = item.language || detectLanguage(item.filename || item.path || item.repo);
  syntaxRanges = buildSyntaxRanges(target, language);
  els.repoName.textContent = item.repo;
  els.repoPath.textContent = ` ${item.path}${startLine ? ` · starts at line ${startLine + 1}` : ""}`;
  els.repoIcon.textContent = item.icon;
  els.lineCount.textContent = `${String(target.split("\n").length).padStart(2, "0")} lines`;
  els.input.value = "";
  done = false;
  els.window.classList.remove("complete");
  els.status.textContent = "CLICK TO START TYPING";
  updateDisplay();
  updateStats();
  updatePunishment();
}

function setTimerState(state) {
  els.timeStat.classList.remove("running", "paused", "countdown");
  if (state !== "idle") els.timeStat.classList.add(state);
  els.timerIndicator.setAttribute("aria-label", `Timer ${state}`);
}

function chooseRandomStart(lines) {
  const candidates = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.trim().length > 0)
    .map(({ index }) => index);
  return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : 0;
}

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

function updateDisplay() {
  const typed = els.input.value;
  els.display.innerHTML = [...target]
    .map((char, i) => {
      const state = charStateClass(char, typed[i], i, typed.length);
      const text = char === "\n" ? "\n" : escapeHtml(char);
      return `<span class="char ${state} ${syntaxClassAt(syntaxRanges, i)}">${text}</span>`;
    })
    .join("");
  const current = els.display.querySelector(".current");
  if (current) {
    const lineHeight = parseFloat(getComputedStyle(els.display).lineHeight);
    const currentLine = target.slice(0, typed.length).split("\n").length - 1;
    const offset = currentLine * lineHeight - els.display.clientHeight / 2;
    els.display.scrollTop = Math.max(0, offset + lineHeight);
  }
  els.clickHint.style.opacity = typed ? "0" : "1";
}

function updateStats() {
  const typed = els.input.value;
  const runningMs = startedAt ? Date.now() - startedAt : 0;
  const elapsed = (elapsedMs + runningMs) / 1000;
  const correct = [...typed].filter((char, i) => char === target[i]).length;
  const accuracy = typed.length ? Math.round((correct / typed.length) * 100) : 100;
  const progress = target ? Math.min(100, Math.round((typed.length / target.length) * 100)) : 0;
  els.accuracy.textContent = accuracy;
  els.progress.textContent = progress;
  els.progressBar.style.width = `${progress}%`;
  els.wpm.textContent = elapsed ? Math.round(correct / CHARS_PER_WORD / (elapsed / 60)) : 0;
  els.time.textContent = formatTime(elapsed);
}

function enterChallengeMode() {
  document.body.classList.add("challenge-active");
}

function exitChallengeMode() {
  document.body.classList.remove("challenge-active");
  els.input.blur();
}

function start() {
  if (done || paused) return;
  if (!startedAt) {
    startedAt = Date.now();
    enterChallengeMode();
    setTimerState("running");
    timerId = setInterval(updateStats, STATS_TICK_MS);
  }
}

function restartChallenge() {
  render();
  elapsedMs = 0;
  paused = false;
  clearInterval(countdownTimer);
  countdownTimer = null;
  exitChallengeMode();
  setTimerState("idle");
  els.input.blur();
}

function startChallenge() {
  clearInterval(countdownTimer);
  render();
  elapsedMs = 0;
  paused = false;
  const parsed = Number.parseInt(els.countdownSeconds.value, 10) || 0;
  const seconds = Math.min(MAX_COUNTDOWN_S, Math.max(0, parsed));
  writeString(STORAGE_KEYS.countdown, String(seconds));
  if (seconds === 0) {
    beginChallenge();
    return;
  }
  let remaining = seconds;
  enterChallengeMode();
  setTimerState("countdown");
  els.status.textContent = `STARTING IN ${remaining}`;
  countdownTimer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      beginChallenge();
    } else {
      els.status.textContent = `STARTING IN ${remaining}`;
    }
  }, 1000);
}

function beginChallenge() {
  clearInterval(timerId);
  startedAt = 0;
  elapsedMs = 0;
  paused = false;
  enterChallengeMode();
  setTimerState("idle");
  els.status.textContent = "READY · TYPE TO START TIMER";
  updateStats();
  els.input.focus();
}

function pauseChallenge() {
  if (!startedAt || paused || done) return;
  elapsedMs += Date.now() - startedAt;
  startedAt = 0;
  paused = true;
  clearInterval(timerId);
  timerId = null;
  setTimerState("paused");
  els.status.textContent = "PAUSED · PRESS A KEY TO RESUME";
}

function stopChallenge() {
  clearInterval(timerId);
  timerId = null;
  render();
}

function hasTypingError() {
  return [...els.input.value].some((char, index) => {
    const expected = target[index];
    return expected && !(/\s/.test(char) || /\s/.test(expected)) && char !== expected;
  });
}

function updatePunishment() {
  clearTimeout(punishmentTimer);
  if (!document.body.classList.contains("punishment-enabled") || !hasTypingError()) {
    document.body.classList.remove("punishment-shaking");
    return;
  }
  document.body.classList.add("punishment-shaking");
  punishmentTimer = setTimeout(
    () => document.body.classList.remove("punishment-shaking"),
    SHAKE_MS,
  );
}

function setPunishmentUi(enabled) {
  els.punishmentToggle.setAttribute("aria-pressed", String(enabled));
  els.punishmentToggle.textContent = enabled ? "⚡ Punishment on" : "⚡ Punishment off";
  document.body.classList.toggle("punishment-enabled", enabled);
}

function setRandomStartUi(enabled) {
  els.randomStartToggle.setAttribute("aria-pressed", String(enabled));
  els.randomStartToggle.textContent = enabled ? "↝ Random start on" : "↝ Random start off";
}

function setTheme(dark) {
  document.body.classList.toggle("dark", dark);
  els.themeToggle.textContent = dark ? "☀" : "☾";
  els.themeToggle.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  writeString(STORAGE_KEYS.theme, dark ? "dark" : "light");
}

function useImport(imported) {
  const saved = writeJSON(STORAGE_KEYS.lastImport, imported);
  setCustomOptionEnabled(els.sourceSelect, true);
  currentItem = imported;
  els.sourceSelect.value = "custom";
  render();
  return saved;
}

function handleInput() {
  if (paused && !done) {
    paused = false;
    startedAt = Date.now();
    timerId = setInterval(updateStats, STATS_TICK_MS);
    enterChallengeMode();
  }
  start();
  if (els.input.value.length > target.length) {
    els.input.value = els.input.value.slice(0, target.length);
  }
  updateDisplay();
  updateStats();
  updatePunishment();
  if (els.input.value === target && !done) {
    done = true;
    clearInterval(timerId);
    els.window.classList.add("complete");
  }
}

function handleTab(event) {
  if (event.key !== "Tab") return;
  event.preventDefault();
  const selectionStart = els.input.selectionStart;
  const selectionEnd = els.input.selectionEnd;
  const lineStart = els.input.value.lastIndexOf("\n", selectionStart - 1) + 1;
  const targetIndent = target.slice(lineStart).match(/^ +/);
  const indentation =
    targetIndent && targetIndent[0].length >= TAB_SPACES ? " ".repeat(TAB_SPACES) : "\t";
  els.input.setRangeText(indentation, selectionStart, selectionEnd, "end");
  els.input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function loadGithubFile() {
  const match = els.githubUrl.value.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/,
  );
  if (!match) {
    alert("Paste a GitHub file URL in the format github.com/user/repo/blob/branch/file");
    return;
  }
  const [, owner, repo, branch, path] = match;
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  els.githubLoad.disabled = true;
  try {
    const response = await fetch(rawUrl);
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    useImport({
      id: "custom",
      filename: path,
      repo: `${owner}/${repo}`,
      path: `/ ${path} · comments skipped`,
      icon: "◆",
      code: codeOnly(await response.text()),
    });
  } catch (error) {
    alert(`Could not load that GitHub file: ${error.message}`);
  } finally {
    els.githubLoad.disabled = false;
  }
}

function loadLocalFile() {
  const file = els.fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    useImport({
      id: "custom",
      filename: file.name,
      repo: file.name,
      path: "/ local file · comments skipped",
      icon: "↥",
      code: codeOnly(String(reader.result)),
    });
  };
  reader.readAsText(file);
}

function handleEscape(event) {
  if (event.key !== "Escape" || (!startedAt && !paused && !countdownTimer)) return;
  event.preventDefault();
  const now = Date.now();
  if (now - lastEscapeAt < DOUBLE_ESCAPE_MS) {
    stopChallenge();
  } else {
    pauseChallenge();
  }
  lastEscapeAt = now;
}

function bindEvents() {
  els.startCountdown.addEventListener("click", startChallenge);
  els.input.addEventListener("input", handleInput);
  els.input.addEventListener("focus", () => {
    els.status.textContent = "TYPING · TAB INSERTS A TAB";
  });
  els.input.addEventListener("keydown", handleTab);
  els.window.addEventListener("click", () => els.input.focus());
  els.restart.addEventListener("click", restartChallenge);
  els.punishmentToggle.addEventListener("click", () => {
    const enabled = els.punishmentToggle.getAttribute("aria-pressed") !== "true";
    setPunishmentUi(enabled);
    writeFlag(STORAGE_KEYS.punishment, enabled);
    updatePunishment();
  });
  els.randomStartToggle.addEventListener("click", () => {
    randomStart = els.randomStartToggle.getAttribute("aria-pressed") !== "true";
    setRandomStartUi(randomStart);
    writeFlag(STORAGE_KEYS.randomStart, randomStart);
    render();
  });
  els.sourceSelect.addEventListener("change", () => {
    const source = els.sourceSelect.value;
    const next =
      source === "custom"
        ? readJSON(STORAGE_KEYS.lastImport)
        : EXAMPLES.find((item) => item.id === source);
    if (next) {
      currentItem = next;
      render();
    } else {
      els.sourceSelect.value = activeSnippet().id;
    }
  });
  document.addEventListener("click", (event) => {
    if (els.optionsMenu.open && !els.optionsMenu.contains(event.target)) {
      els.optionsMenu.open = false;
    }
  });
  els.importButton.addEventListener("click", () => els.fileInput.click());
  els.fileInput.addEventListener("change", loadLocalFile);
  els.githubButton.addEventListener("click", () => {
    els.githubImport.hidden = !els.githubImport.hidden;
    if (!els.githubImport.hidden) els.githubUrl.focus();
  });
  els.githubLoad.addEventListener("click", loadGithubFile);
  document.addEventListener("keydown", handleEscape);
  els.themeToggle.addEventListener("click", () =>
    setTheme(!document.body.classList.contains("dark")),
  );
  window.addEventListener("pageshow", () => {
    clearInterval(timerId);
    clearInterval(countdownTimer);
    startedAt = 0;
    elapsedMs = 0;
    paused = false;
    exitChallengeMode();
    els.input.blur();
    updateStats();
  });
}

function init() {
  setTheme(readString(STORAGE_KEYS.theme) === "dark");
  setPunishmentUi(readFlag(STORAGE_KEYS.punishment));
  randomStart = readFlag(STORAGE_KEYS.randomStart);
  setRandomStartUi(randomStart);
  els.countdownSeconds.value = readString(STORAGE_KEYS.countdown, "0");
  const savedImport = readJSON(STORAGE_KEYS.lastImport);
  if (savedImport && typeof savedImport.code !== "string") removeKey(STORAGE_KEYS.lastImport);
  const hasImport = Boolean(savedImport && typeof savedImport.code === "string");
  populateSourceOptions(els.sourceSelect, EXAMPLES, hasImport);
  if (hasImport) currentItem = savedImport;
  els.sourceSelect.value = activeSnippet().id;
  render();
  bindEvents();
}

init();
