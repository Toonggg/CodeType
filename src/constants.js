/**
 * Named constants shared across the app (Q12).
 */

/** How often the running stats (time, WPM) refresh, in milliseconds. */
export const STATS_TICK_MS = 250;

/** Two Escape presses within this window count as a double press. */
export const DOUBLE_ESCAPE_MS = 450;

/** Duration of the punishment shake after a keystroke with errors present. */
export const SHAKE_MS = 750;

/** Upper bound for the countdown input, in seconds. */
export const MAX_COUNTDOWN_S = 60;

/** Standard typing-test definition of a "word". */
export const CHARS_PER_WORD = 5;

/** Leading spaces at or above which Tab inserts spaces instead of a tab (legacy behaviour). */
export const TAB_SPACES = 4;

/** localStorage keys. Values stay compatible with earlier versions of the app. */
export const STORAGE_KEYS = Object.freeze({
  theme: "codetype-theme",
  punishment: "codetype-punishment",
  randomStart: "codetype-random-start",
  countdown: "codetype-countdown",
  lastImport: "codetype-last-import",
});
