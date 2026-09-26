/**
 * The controller. It owns the store, the timers and every side effect of a status
 * change, and exposes the actions that DOM events are mapped to.
 *
 * Data flow: DOM event → action (here) → store update / dispatch() → renderers.
 */
import {
  DOUBLE_ESCAPE_MS,
  PRACTICE_MAX_LINES,
  SHAKE_MS,
  STATS_TICK_MS,
  STORAGE_KEYS,
} from "./constants.js";
import { EXAMPLES } from "./data/examples.js";
import { ImportError } from "./import/errors.js";
import { fetchGitHubFile, parseGitHubUrl } from "./import/github.js";
import { readLocalFile } from "./import/local.js";
import { clampRange, prepareImport } from "./import/prepare.js";
import { migrateImportRecord } from "./import/record.js";
import {
  buildTarget,
  chooseStartLine,
  createDocument,
  languageOf,
  selectLines,
} from "./practice.js";
import { clampCountdown, loadSettings, saveSetting } from "./settings.js";
import { EVENT, STATUS, acceptsInput, createStore, effectsFor, transition } from "./state.js";
import { readJSON, removeKey, writeJSON } from "./storage.js";
import { createStopwatch } from "./timer.js";
import { applyTyped, autoIndent, createSession, isComplete, smartTab, toChars } from "./typing.js";
import { bindEvents } from "./ui/events.js";
import { renderImport } from "./ui/renderImport.js";
import { populateSourceOptions, renderControls } from "./ui/renderControls.js";
import { renderStats } from "./ui/renderStats.js";
import { renderStatus } from "./ui/renderStatus.js";
import { createTargetView } from "./ui/renderTarget.js";
import { isDark, renderTheme, watchSystemTheme } from "./ui/theme.js";

/** Loads the saved import, migrating old records and discarding unusable ones. */
function loadImport() {
  const saved = readJSON(STORAGE_KEYS.lastImport);
  if (!saved) return null;
  const record = migrateImportRecord(saved);
  if (!record) removeKey(STORAGE_KEYS.lastImport);
  else if (record.version !== saved.version) writeJSON(STORAGE_KEYS.lastImport, record);
  return record;
}

const messageOf = (error) =>
  error instanceof ImportError ? error.message : "Something went wrong while importing.";

export function createApp(
  els,
  {
    doc = document,
    win = window,
    now = () => performance.now(),
    random = Math.random,
    fetchImpl = (...args) => win.fetch(...args),
  } = {},
) {
  const stopwatch = createStopwatch(now);
  let tickId = null;
  let countdownId = null;
  let shakeId = null;
  let lastEscape = { at: -Infinity, status: null };

  // The full document of the current item is tokenized once and reused when the
  // range or the skip-comments setting changes.
  let documentCache = { item: null, document: null };
  function fullDocumentFor(item) {
    if (documentCache.item !== item) {
      documentCache = { item, document: createDocument(item.code, languageOf(item)) };
    }
    return documentCache.document;
  }
  function practiceDocumentFor(item, settings) {
    return selectLines(fullDocumentFor(item), {
      range: item.range ?? null,
      skipComments: settings.skipComments,
    });
  }

  const settings = loadSettings();
  const savedImport = loadImport();
  const firstItem = savedImport ?? EXAMPLES[0];
  const firstDocument = practiceDocumentFor(firstItem, settings);
  const firstStart = settings.randomStart ? chooseStartLine(firstDocument.lines, { random }) : 0;
  const firstTarget = buildTarget(firstDocument, firstStart);
  const store = createStore({
    status: STATUS.IDLE,
    focused: false,
    countdownRemaining: 0,
    item: firstItem,
    /** The lines being practiced, tokenized over the whole file (practice.js). */
    document: firstDocument,
    /** What is typed: the document from the start line on. */
    target: firstTarget,
    targetVersion: 1,
    session: createSession(firstTarget.chars),
    /** Inclusive index range changed by the last edit (for incremental rendering). */
    edit: null,
    elapsedMs: 0,
    settings,
    savedImport,
    githubFormOpen: false,
    importBusy: false,
    importError: null,
    notices: [],
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
    store.set({ session: createSession(store.get().target.chars), edit: null, elapsedMs: 0 });
  }

  /** Applies the side effects of a status. The only place that changes them. */
  function enter(status, payload) {
    const effects = effectsFor(status);
    const wasFocusMode = effectsFor(store.get().status).focusMode;
    if (!effects.countdownActive) stopCountdown();
    if (effects.timerRunning) {
      stopwatch.start();
      startTick();
    } else {
      stopwatch.pause();
      stopTick();
    }
    els.input.readOnly = !effects.inputEnabled;
    // A finished run is inert: skip it so the next Tab reaches Restart. Clicks and
    // Restart still focus it programmatically.
    els.input.tabIndex = status === STATUS.COMPLETE ? -1 : 0;
    doc.body.classList.toggle("challenge-active", effects.focusMode);
    // Update state before moving focus: focus/blur handlers dispatch events too.
    store.set({ status, elapsedMs: stopwatch.elapsedMs() });
    if (effects.countdownActive) startCountdown(payload.seconds);
    if (effects.focus === "input" && doc.activeElement !== els.input) els.input.focus();
    if (effects.focus === "release" && doc.activeElement === els.input) els.input.blur();
    // The page no longer locks scrolling in focus mode (U9); bring the card into view.
    if (effects.focusMode && !wasFocusMode) {
      els.practiceCard.scrollIntoView?.({ block: "nearest" });
    }
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

  /** A random start line when the setting is on (never the current one, U8). */
  function pickStart(document, exclude = -1) {
    return store.get().settings.randomStart
      ? chooseStartLine(document.lines, { exclude, random })
      : 0;
  }

  /**
   * Replaces the target. `event` is RESET (back to idle) or RESTART (ready and
   * focused). Restart alone never calls this, so it retries the same start (U8).
   */
  function setTarget(document, startLine, event = EVENT.RESET) {
    const target = buildTarget(document, startLine);
    store.set({
      document,
      target,
      targetVersion: store.get().targetVersion + 1,
      session: createSession(target.chars),
      edit: null,
    });
    dispatch(event);
  }

  /** Rebuilds the practice lines of the current item (range or settings changed). */
  function refreshDocument() {
    const { item, settings: current } = store.get();
    const document = practiceDocumentFor(item, current);
    setTarget(document, pickStart(document));
  }

  /** Makes an item the current practice source (Q17). */
  function selectItem(item) {
    store.set({ item });
    refreshDocument();
  }

  // --- Typing ----------------------------------------------------------------

  /** Shakes after each keystroke while the buffer contains a mistake (P4). */
  function updatePunishment() {
    win.clearTimeout(shakeId);
    const { settings: current, session } = store.get();
    if (!current.punishment || session.incorrect === 0) {
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
      els.input.value = state.session.typed.join("");
      return;
    }
    const previous = state.session;
    const applied = applyTyped(previous, toChars(rawValue));
    const { from } = applied;
    let { session, to } = applied;

    // Auto-indent (U7): a single newline was just typed at the end.
    const insertedNewline =
      from === previous.typed.length &&
      session.typed.length === from + 1 &&
      session.typed[from] === "\n";
    if (insertedNewline && state.settings.autoIndent) {
      const indent = autoIndent(session.target, from);
      if (indent.length) {
        const auto = applyTyped(session, [...session.typed, ...indent], {
          autoFrom: session.typed.length,
        });
        session = auto.session;
        to = Math.max(to, auto.to);
      }
    }

    const text = session.typed.join("");
    if (els.input.value !== text) els.input.value = text;
    dispatch(EVENT.TYPE);
    store.set({ session, edit: { from, to }, elapsedMs: stopwatch.elapsedMs() });
    updatePunishment();
    if (isComplete(session)) dispatch(EVENT.FINISH);
  }

  /**
   * Tab inserts exactly the whitespace the target expects at the caret (B1).
   * Returns false when Tab should move focus instead: nothing to insert and no
   * run in progress, so keyboard users can always Tab past the typing area. A
   * running challenge keeps every Tab, so a stray press never pauses it.
   */
  function insertIndent() {
    const { status, session } = store.get();
    if (!acceptsInput(status)) return false;
    const run = smartTab(session.target, session.typed.length);
    if (run.length) {
      handleInput(els.input.value + run.join(""));
      return true;
    }
    return status === STATUS.RUNNING;
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
    const { document } = store.get();
    setTarget(document, pickStart(document));
  }

  function setAutoIndent(enabled) {
    updateSettings({ autoIndent: enabled });
    saveSetting("autoIndent", enabled);
  }

  function setSkipComments(enabled) {
    updateSettings({ skipComments: enabled });
    saveSetting("skipComments", enabled);
    refreshDocument();
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

  // --- Imports (Phase 5 pipeline) ----------------------------------------------

  /** Saves and selects a prepared import; the text stays usable if storage is full (B13). */
  function useImport(record, notices = []) {
    const messages = [...notices];
    if (!writeJSON(STORAGE_KEYS.lastImport, record)) {
      messages.push("Loaded, but the file is too large to remember between sessions.");
    }
    store.set({ savedImport: record, importError: null, notices: messages });
    els.optionsMenu.open = false;
    selectItem(record);
  }

  async function runImport(task) {
    if (store.get().importBusy) return;
    store.set({ importBusy: true, importError: null });
    try {
      await task();
    } catch (error) {
      store.set({ importError: messageOf(error) });
    } finally {
      store.set({ importBusy: false });
    }
  }

  function importLocalFile(file) {
    if (!file) return Promise.resolve();
    return runImport(async () => {
      const text = await readLocalFile(file);
      const { record, notices } = prepareImport(text, {
        source: "local",
        filename: file.name,
        repo: file.name,
        path: "/ local file",
      });
      useImport(record, notices);
    });
  }

  function importGithub(url) {
    return runImport(async () => {
      const parsed = parseGitHubUrl(url);
      const text = await fetchGitHubFile(parsed.rawUrl, { fetchImpl });
      const { record, notices } = prepareImport(text, {
        source: "github",
        filename: parsed.path.split("/").pop() || parsed.path,
        repo: `${parsed.owner}/${parsed.repo}`,
        path: `/ ${parsed.path.split("/").join(" / ")}`,
        url: String(url).trim(),
        lineRange: parsed.lineRange,
      });
      els.githubUrl.value = "";
      store.set({ githubFormOpen: false });
      useImport(record, notices);
    });
  }

  /** Changes the practiced line range of the current import. */
  function setRange(startValue, endValue) {
    const { item } = store.get();
    if (item.id !== "custom") return;
    const total = fullDocumentFor(item).totalLines;
    const { range, limited } = clampRange(
      { start: Number(startValue), end: Number(endValue) },
      total,
    );
    const whole = range.start === 1 && range.end === total;
    const next = { ...item, range: whole ? null : range };
    documentCache = { item: next, document: fullDocumentFor(item) };
    writeJSON(STORAGE_KEYS.lastImport, next);
    store.set({
      item: next,
      savedImport: next,
      notices: limited
        ? [
            `At most ${PRACTICE_MAX_LINES} lines are practiced at once, so the range ends at line ${range.end}.`,
          ]
        : [],
    });
    refreshDocument();
  }

  /** Removes the imported code from this browser (U11, R6). */
  function forgetImport() {
    removeKey(STORAGE_KEYS.lastImport);
    const wasCurrent = store.get().item.id === "custom";
    store.set({ savedImport: null, notices: ["Imported code removed from this browser."] });
    if (wasCurrent) selectItem(EXAMPLES[0]);
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
      els.optionsMenu.open = false;
      dispatch(EVENT.RESTART);
    },
    newStart() {
      const { document, target } = store.get();
      setTarget(document, pickStart(document, target.startLine), EVENT.RESTART);
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
      const item =
        id === "custom" ? store.get().savedImport : EXAMPLES.find((example) => example.id === id);
      if (item) {
        selectItem(item);
      } else {
        els.sourceSelect.value = store.get().item.id;
      }
    },
    togglePunishment: () => setPunishment(!store.get().settings.punishment),
    toggleRandomStart: () => setRandomStart(!store.get().settings.randomStart),
    toggleAutoIndent: () => setAutoIndent(!store.get().settings.autoIndent),
    toggleSkipComments: () => setSkipComments(!store.get().settings.skipComments),
    setCountdown,
    toggleTheme: () => setTheme(isDark(store.get().settings.theme, win) ? "light" : "dark"),
    toggleGithubForm() {
      const open = !store.get().githubFormOpen;
      store.set({ githubFormOpen: open, importError: null });
      if (open) els.githubUrl.focus();
    },
    importLocalFile,
    importGithub,
    setRange,
    forgetImport,
    dismissNotice: () => store.set({ notices: [] }),
  };

  const targetView = createTargetView(els);
  const renderers = [
    renderTheme,
    renderControls,
    renderImport,
    (_, state, prev) => targetView.render(state, prev),
    renderStats,
    renderStatus,
  ];
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
    watchSystemTheme(els, () => store.get().settings.theme, { win, signal: lifetime.signal });
  }

  /** Removes every listener and timer (used by tests). */
  function destroy() {
    lifetime.abort();
    clearTimers();
  }

  return { init, destroy, store, actions, dispatch };
}
