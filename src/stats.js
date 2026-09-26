/**
 * Pure statistics helpers.
 */
import { CHARS_PER_WORD } from "./constants.js";

/** Formats a duration in seconds as MM:SS. */
export function formatTime(seconds) {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const rest = String(Math.floor(seconds % 60)).padStart(2, "0");
  return `${minutes}:${rest}`;
}

export function computeStats({ target, typed, elapsedMs }) {
  const minutes = elapsedMs / 60000;
  const correct = [...typed].filter((char, i) => char === target[i]).length;
  return {
    wpm: minutes > 0 ? Math.round(correct / CHARS_PER_WORD / minutes) : 0,
    accuracy: typed.length ? Math.round((correct / typed.length) * 100) : 100,
    progress: target ? Math.min(100, Math.round((typed.length / target.length) * 100)) : 0,
  };
}
