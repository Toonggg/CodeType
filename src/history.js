/**
 * Run history and best speeds (U2).
 *
 * Stored under STORAGE_KEYS.history as
 *   { version: 1, runs: Run[], best: { [key]: wpm } }
 * where runs are newest first and capped at HISTORY_MAX_RUNS, and
 *   Run = { key, label, wpm, accuracy, elapsedMs, errors, corrections, chars, at }
 * (`at` is an ISO timestamp). `key` identifies a snippet: the example id, or
 * "import:<filename>" for imported code, so a re-imported file keeps its best.
 *
 * Everything except loadHistory/saveHistory is pure.
 */
import { HISTORY_MAX_RUNS, STORAGE_KEYS } from "./constants.js";
import { readJSON, writeJSON } from "./storage.js";

export const HISTORY_VERSION = 1;

export function emptyHistory() {
  return { version: HISTORY_VERSION, runs: [], best: {} };
}

/** The history key of a practice item. */
export function historyKey(item) {
  return item.id === "custom" ? `import:${item.filename}` : item.id;
}

const isCount = (value) => Number.isFinite(value) && value >= 0;

function isRun(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof value.key === "string" &&
    typeof value.label === "string" &&
    typeof value.at === "string" &&
    ["wpm", "accuracy", "elapsedMs", "errors", "corrections", "chars"].every((field) =>
      isCount(value[field]),
    )
  );
}

/** Keeps the valid parts of a stored value; anything unrecognised becomes empty. */
export function validateHistory(value) {
  if (!value || typeof value !== "object" || value.version !== HISTORY_VERSION) {
    return emptyHistory();
  }
  const runs = Array.isArray(value.runs) ? value.runs.filter(isRun).slice(0, HISTORY_MAX_RUNS) : [];
  const best = {};
  if (value.best && typeof value.best === "object") {
    for (const [key, wpm] of Object.entries(value.best)) {
      if (isCount(wpm)) best[key] = wpm;
    }
  }
  return { version: HISTORY_VERSION, runs, best };
}

/**
 * Adds a run. Returns the new history, whether the run set a new best, and the
 * best before it (null on the first run of a snippet).
 */
export function recordRun(history, run) {
  const previousBest = history.best[run.key] ?? null;
  const isBest = previousBest === null || run.wpm > previousBest;
  return {
    history: {
      version: HISTORY_VERSION,
      runs: [run, ...history.runs].slice(0, HISTORY_MAX_RUNS),
      best: isBest ? { ...history.best, [run.key]: run.wpm } : history.best,
    },
    isBest,
    previousBest,
  };
}

/** Recent runs of one snippet, newest first. */
export function runsFor(history, key, limit = 5) {
  return history.runs.filter((run) => run.key === key).slice(0, limit);
}

export function loadHistory() {
  return validateHistory(readJSON(STORAGE_KEYS.history));
}

/** Returns false when storage is unavailable or full; the history still works in memory. */
export function saveHistory(history) {
  return writeJSON(STORAGE_KEYS.history, history);
}
