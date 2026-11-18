/**
 * Pure statistics helpers.
 */
import { CHARS_PER_WORD, MIN_WPM_ELAPSED_MS } from "./constants.js";

/** Formats a duration in seconds as MM:SS. */
export function formatTime(seconds) {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const rest = String(Math.floor(seconds % 60)).padStart(2, "0");
  return `${minutes}:${rest}`;
}

/**
 * Words per minute from correct characters. While a run is live it stays 0 until
 * enough time has passed, to avoid absurd early spikes (B18); a final result is
 * always computed.
 */
export function computeWpm(correct, elapsedMs, { final = false } = {}) {
  if (elapsedMs <= 0 || (!final && elapsedMs < MIN_WPM_ELAPSED_MS)) return 0;
  return Math.round(correct / CHARS_PER_WORD / (elapsedMs / 60000));
}

/**
 * Accuracy counts every keystroke of the run, so Backspace cannot hide a mistake (U5).
 * Rounded down so a run with errors never shows 100%.
 */
export function computeAccuracy(entered, errors) {
  if (!entered) return 100;
  return Math.floor(((entered - errors) / entered) * 100);
}

/** Progress in whole percent; 100 only when every character has been typed. */
export function computeProgress(typedLength, targetLength) {
  if (!targetLength) return 0;
  return Math.floor((Math.min(typedLength, targetLength) / targetLength) * 100);
}

export function computeStats(session, elapsedMs, { final = false } = {}) {
  const correctTyped = Math.max(0, session.correct - (session.insertedCorrect ?? 0));
  return {
    wpm: computeWpm(correctTyped, elapsedMs, { final }),
    accuracy: computeAccuracy(session.entered, session.errors),
    progress: computeProgress(session.typed.length, session.target.length),
    errors: session.errors,
    corrections: session.corrections,
    elapsedMs,
  };
}
