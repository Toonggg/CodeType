/**
 * The controller. It owns the store, the timers and every side effect of a status
 * change, and exposes the actions that DOM events are mapped to.
 */
import {
  DOUBLE_ESCAPE_MS,
  SHAKE_MS,
  STATS_TICK_MS,
  STORAGE_KEYS,
  TAB_SPACES,
} from "./constants.js";
import { EXAMPLES } from "./data/examples.js";
import { codeOnly } from "./import/comments.js";
import { buildTarget } from "./practice.js";
import { clampCountdown, loadSettings, saveSetting } from "./settings.js";
import { EVENT, STATUS, acceptsInput, createStore, effectsFor, transition } from "./state.js";
import { readJSON, removeKey, writeJSON } from "./storage.js";
import { createStopwatch } from "./timer.js";
import { bindEvents } from "./ui/events.js";
import { populateSourceOptions, renderControls } from "./ui/renderControls.js";
import { renderStats } from "./ui/renderStats.js";
import { renderStatus } from "./ui/renderStatus.js";
import { renderTarget } from "./ui/renderTarget.js";
import { renderTheme } from "./ui/theme.js";

function loadImport() {
  const saved = readJSON(STORAGE_KEYS.lastImport);
  if (saved && typeof saved.code === "string") return saved;
  if (saved) removeKey(STORAGE_KEYS.lastImport);
  return null;
}

/** Whitespace mismatches are not shown as errors (legacy rule, replaced in Phase 3). */
function hasTypingError(target, typed) {
  return [...typed].some((char, index) => {
    const expected = target[index];
    return expected && !(/\s/.test(char) || /\s/.test(expected)) && char !== expected;
  });
}

export function createApp(
  els,
  { doc = document, win = window, now = () => performance.now(), random = Math.random } = {},
) {
  const stopwatch = createStopwatch(now);
  let tickId = null;
  let countdownId = null;
  let shakeId = null;
  let lastEscape = { at: -Infinity, status: null };

  const settings = loadSettings();
  const savedImport = loadImport();
  const firstItem = savedImport ?? EXAMPLES[0];
  const store = createStore({
    status: STATUS.IDLE,
    focused: false,
    countdownRemaining: 0,
    item: firstItem,
    target: buildTarget(firstItem, settings, random),
    targetVersion: 1,
    typed: "",
    elapsedMs: 0,
    settings,
    hasImport: Boolean(savedImport),
  });

  // --- Timers (B15: every timer id is cleared and nulled together) ------------

  function startTick() {
    if (tickId !== null) return;
    tickId = win.setInterval(() => store.set({ elapsedMs: stopwatch.elapsedMs() }), STATS_TICK_MS);
  }

  function stopTick() {
    win.clearInterval(tickId);
    tickId = null;
  }

  function startCountdown(seconds) {
    stopCountdown();
    store.set({ countdownRemaining: seconds });
    countdownId = win.setInterval(() => {
      const remaining = store.get().countdownRemaining - 1;
      if (remaining > 0) {
        store.set({ countdownRemaining: remaining });
        return;
      }
      stopCountdown();
      store.set({ countdownRemaining: 0 });
      dispatch(EVENT.COUNTDOWN_DONE);
    }, 1000);
  }

  function stopCountdown() {
    win.clearInterval(countdownId);
    countdownId = null;
  }

  function stopShake() {
    win.clearTimeout(shakeId);
    shakeId = null;
    doc.body.classList.remove("punishment-shaking");
  }

  function clearTimers() {
    stopTick();
    stopCountdown();
    stopShake();
  }

  // --- Lifecycle -------------------------------------------------------------

  /** Clears the typed text and the clock (the single RESET path, Q4). */
  function resetSession() {
    stopwatch.reset();
    stopShake();
    if (els.input.value !== "") els.input.value = "";
    store.set({ typed: "", elapsedMs: 0 });
  }

  /** Applies the side effects of a status. The only place that changes them. */
  function enter(status, payload) {
    const effects = effectsFor(status);
    if (!effects.countdownActive) stopCountdown();
    if (effects.timerRunning) {
      stopwatch.start();
      startTick();
    } else {
      stopwatch.pause();
      stopTick();
    }
    els.input.readOnly = !effects.inputEnabled;
    doc.body.classList.toggle("challenge-active", effects.focusMode);
    // Update state before moving focus: focus/blur handlers dispatch events too.
    store.set({ status, elapsedMs: stopwatch.elapsedMs() });
    if (effects.countdownActive) startCountdown(payload.seconds);
    if (effects.focus === "input" && doc.activeElement !== els.input) els.input.focus();
    if (effects.focus === "release" && doc.activeElement === els.input) els.input.blur();
  }

  /** Runs an event through the state machine and applies the result. */
  function dispatch(event, payload = {}) {
    const from = store.get().status;
    const to = transition(from, event, payload);
    const reenter = event === EVENT.RESET || event === EVENT.RESTART || event === EVENT.START;
    if (reenter) resetSession();
    if (to !== from || reenter) enter(to, payload);
    return to;
  }

  // --- Target ----------------------------------------------------------------

  function rebuildTarget() {
    const { item, settings: current, targetVersion } = store.get();
    store.set({ target: buildTarget(item, current, random), targetVersion: targetVersion + 1 });
    dispatch(EVENT.RESET);
  }

  /** Makes an item the current practice source (Q17). */
  function selectItem(item) {
    store.set({ item });
    rebuildTarget();
  }

  // --- Typing ----------------------------------------------------------------

  function updatePunishment() {
    win.clearTimeout(shakeId);
    const { settings: current, typed, target } = store.get();
    if (!current.punishment || !hasTypingError(target.text, typed)) {
      stopShake();
      return;
    }
    doc.body.classList.add("punishment-shaking");
    shakeId = win.setTimeout(stopShake, SHAKE_MS);
  }

  function handleInput(rawValue) {
    const state = store.get();
    if (!acceptsInput(state.status)) {
      // Typing is ignored outside ready/running/paused (B3).
      els.input.value = state.typed;
      return;
    }
    let value = rawValue;
    if (value.length > state.target.text.length) {
      value = value.slice(0, state.target.text.length);
      els.input.value = value;
    }
    dispatch(EVENT.TYPE);
    store.set({ typed: value, elapsedMs: stopwatch.elapsedMs() });
    updatePunishment();
    if (value === state.target.text) dispatch(EVENT.FINISH);
  }

  function insertIndent() {
    const state = store.get();
    if (!acceptsInput(state.status)) return;
    const { selectionStart, selectionEnd, value } = els.input;
    const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
    const targetIndent = state.target.text.slice(lineStart).match(/^ +/);
    const indentation =
      targetIndent && targetIndent[0].length >= TAB_SPACES ? " ".repeat(TAB_SPACES) : "\t";
    els.input.setRangeText(indentation, selectionStart, selectionEnd, "end");
    handleInput(els.input.value);
  }

  // --- Settings (Q6: one setter per setting, state is the source of truth) ----

  function updateSettings(patch) {
    store.set({ settings: { ...store.get().settings, ...patch } });
  }

  function setPunishment(enabled) {
    updateSettings({ punishment: enabled });
    saveSetting("punishment", enabled);
    updatePunishment();
  }

  function setRandomStart(enabled) {
    updateSettings({ randomStart: enabled });
    saveSetting("randomStart", enabled);
    rebuildTarget();
  }

  function setCountdown(value) {
    const seconds = clampCountdown(value);
    updateSettings({ countdownSeconds: seconds });
    // Re-render even when the clamped value is unchanged so the input shows it.
    els.countdownSeconds.value = String(seconds);
    saveSetting("countdownSeconds", seconds);
  }

  function setTheme(theme) {
    updateSettings({ theme });
    saveSetting("theme", theme);
  }

  // --- Imports (legacy pipeline, replaced in Phase 5) -------------------------

  function useImport(item) {
    writeJSON(STORAGE_KEYS.lastImport, item);
    store.set({ hasImport: true });
    selectItem(item);
  }

  function importLocalFile(file) {
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

  async function importGithub(url) {
    const match = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
    if (!match) {
      win.alert("Paste a GitHub file URL in the format github.com/user/repo/blob/branch/file");
      return;
    }
    const [, owner, repo, branch, path] = match;
    els.githubLoad.disabled = true;
    try {
      const response = await fetch(
        `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`,
      );
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
      win.alert(`Could not load that GitHub file: ${error.message}`);
    } finally {
      els.githubLoad.disabled = false;
    }
  }

  // --- Actions ---------------------------------------------------------------

  const actions = {
    input: handleInput,
    tab: insertIndent,
    focus() {
      store.set({ focused: true });
      dispatch(EVENT.FOCUS);
    },
    blur() {
      store.set({ focused: false });
      dispatch(EVENT.BLUR);
    },
    restart() {
      dispatch(EVENT.RESTART);
    },
    start() {
      els.optionsMenu.open = false;
      dispatch(EVENT.START, { seconds: store.get().settings.countdownSeconds });
    },
    escape(event) {
      // An open menu takes precedence over the challenge (U13).
      if (els.optionsMenu.open) {
        event.preventDefault();
        els.optionsMenu.open = false;
        els.optionsSummary.focus();
        return;
      }
      const { status } = store.get();
      const at = now();
      const inSession = (s) => s === STATUS.RUNNING || s === STATUS.PAUSED;
      const isDouble =
        at - lastEscape.at < DOUBLE_ESCAPE_MS && inSession(lastEscape.status) && inSession(status);
      lastEscape = isDouble ? { at: -Infinity, status: null } : { at, status };
      if (isDouble) {
        event.preventDefault();
        dispatch(EVENT.RESTART);
        return;
      }
      if (status === STATUS.IDLE || status === STATUS.COMPLETE) {
        // Escape releases the typing area so keyboard users are never trapped (A1).
        if (doc.activeElement === els.input) els.input.blur();
        return;
      }
      event.preventDefault();
      const next = dispatch(EVENT.ESCAPE);
      if (next === STATUS.RUNNING) els.input.focus();
    },
    hide() {
      dispatch(EVENT.HIDE);
    },
    pageRestored() {
      dispatch(EVENT.RESET);
    },
    selectSource(id) {
      const item = id === "custom" ? loadImport() : EXAMPLES.find((example) => example.id === id);
      if (item) {
        selectItem(item);
      } else {
        els.sourceSelect.value = store.get().item.id;
      }
    },
    togglePunishment: () => setPunishment(!store.get().settings.punishment),
    toggleRandomStart: () => setRandomStart(!store.get().settings.randomStart),
    setCountdown,
    toggleTheme: () => setTheme(store.get().settings.theme === "dark" ? "light" : "dark"),
    importLocalFile,
    importGithub,
  };

  const renderers = [renderTheme, renderControls, renderTarget, renderStats, renderStatus];

  const lifetime = new AbortController();

  function init() {
    populateSourceOptions(els.sourceSelect, EXAMPLES);
    const state = store.get();
    for (const render of renderers) render(els, state, undefined);
    store.subscribe((next, prev) => {
      for (const render of renderers) render(els, next, prev);
    });
    enter(STATUS.IDLE);
    bindEvents(els, actions, { doc, win, signal: lifetime.signal });
  }

  /** Removes every listener and timer (used by tests). */
  function destroy() {
    lifetime.abort();
    clearTimers();
  }

  return { init, destroy, store, actions, dispatch };
}
