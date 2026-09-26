/**
 * Renders speed, accuracy, time and progress.
 */
import { computeStats, formatTime } from "../stats.js";

export function renderStats(els, state, prev) {
  if (
    prev &&
    state.typed === prev.typed &&
    state.elapsedMs === prev.elapsedMs &&
    state.targetVersion === prev.targetVersion
  ) {
    return;
  }
  const stats = computeStats({
    target: state.target.text,
    typed: state.typed,
    elapsedMs: state.elapsedMs,
  });
  els.wpm.textContent = stats.wpm;
  els.accuracy.textContent = stats.accuracy;
  els.progress.textContent = stats.progress;
  els.progressBar.style.width = `${stats.progress}%`;
  els.time.textContent = formatTime(state.elapsedMs / 1000);
}
