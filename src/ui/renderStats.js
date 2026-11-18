/**
 * Renders speed, accuracy, time and progress. The clock tick only changes
 * elapsedMs, so it only updates time and speed (P3).
 */
import { STATUS } from "../state.js";
import { computeAccuracy, computeProgress, computeWpm, formatTime } from "../stats.js";

export function renderStats(els, state, prev) {
  const { session, elapsedMs } = state;
  const sessionChanged = !prev || session !== prev.session;
  if (sessionChanged) {
    const progress = computeProgress(session.typed.length, session.target.length);
    els.accuracy.textContent = computeAccuracy(session.entered, session.errors);
    els.progress.textContent = progress;
    els.progressBar.style.width = `${progress}%`;
    els.progressTrack.setAttribute("aria-valuenow", String(progress));
  }
  const final = state.status === STATUS.COMPLETE;
  if (sessionChanged || elapsedMs !== prev.elapsedMs || state.status !== prev.status) {
    const correctTyped = Math.max(0, session.correct - (session.insertedCorrect ?? 0));
    const wpmStr = String(computeWpm(correctTyped, elapsedMs, { final }));
    const timeStr = formatTime(elapsedMs / 1000);
    if (els.wpm.textContent !== wpmStr) els.wpm.textContent = wpmStr;
    if (els.time.textContent !== timeStr) els.time.textContent = timeStr;
  }
}
