/**
 * The status line and timer indicator. This is the only writer of #typing-status (B6).
 */
import { STATUS } from "../state.js";

/** Status → text table. Includes the keyboard hints for each state (U3). */
export function statusText({ status, focused, countdownRemaining }) {
  switch (status) {
    case STATUS.COUNTDOWN:
      return `STARTING IN ${countdownRemaining} · ESC TO CANCEL`;
    case STATUS.READY:
      return "READY · TYPE TO START THE TIMER";
    case STATUS.RUNNING:
      return "TYPING · ESC TO PAUSE";
    case STATUS.PAUSED:
      return focused
        ? "PAUSED · TYPE OR ESC TO RESUME · ESC ESC TO RESTART"
        : "PAUSED · CLICK TO RESUME";
    case STATUS.COMPLETE:
      return "COMPLETE · ↻ TO RESTART";
    default:
      return "CLICK TO START TYPING";
  }
}

const INDICATOR_CLASSES = ["running", "paused", "countdown", "complete"];

export function renderStatus(els, state, prev) {
  if (
    prev &&
    state.status === prev.status &&
    state.focused === prev.focused &&
    state.countdownRemaining === prev.countdownRemaining
  ) {
    return;
  }
  els.status.textContent = statusText(state);
  els.timeStat.classList.remove(...INDICATOR_CLASSES);
  if (INDICATOR_CLASSES.includes(state.status)) els.timeStat.classList.add(state.status);
  els.timerIndicator.setAttribute("aria-label", `Timer ${state.status}`);
  els.window.classList.toggle("complete", state.status === STATUS.COMPLETE);
}
