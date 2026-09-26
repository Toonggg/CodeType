/**
 * User settings: loading from and saving to storage. The live values are held in
 * the store (state.settings); nothing reads settings back from the DOM (Q6).
 */
import { MAX_COUNTDOWN_S, STORAGE_KEYS } from "./constants.js";
import { readFlag, readString, writeFlag, writeString } from "./storage.js";

/** Parses and clamps a countdown value to 0..MAX_COUNTDOWN_S whole seconds. */
export function clampCountdown(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(MAX_COUNTDOWN_S, Math.max(0, parsed));
}

export function loadSettings() {
  const theme = readString(STORAGE_KEYS.theme);
  return {
    theme: theme === "dark" || theme === "light" ? theme : null,
    punishment: readFlag(STORAGE_KEYS.punishment, false),
    randomStart: readFlag(STORAGE_KEYS.randomStart, false),
    countdownSeconds: clampCountdown(readString(STORAGE_KEYS.countdown, "0")),
    autoIndent: readFlag(STORAGE_KEYS.autoIndent, true),
    skipComments: readFlag(STORAGE_KEYS.skipComments, true),
  };
}

/** Persists one setting. Returns false when storage is unavailable or full. */
export function saveSetting(name, value) {
  switch (name) {
    case "theme":
      return writeString(STORAGE_KEYS.theme, value);
    case "punishment":
      return writeFlag(STORAGE_KEYS.punishment, value);
    case "randomStart":
      return writeFlag(STORAGE_KEYS.randomStart, value);
    case "countdownSeconds":
      return writeString(STORAGE_KEYS.countdown, String(value));
    case "autoIndent":
      return writeFlag(STORAGE_KEYS.autoIndent, value);
    case "skipComments":
      return writeFlag(STORAGE_KEYS.skipComments, value);
    default:
      throw new Error(`Unknown setting: ${name}`);
  }
}
