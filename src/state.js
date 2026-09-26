/**
 * The practice session state machine (Q2) and a minimal observable store.
 *
 * Statuses
 *   idle       nothing in progress; the typing area is not focused
 *   countdown  a countdown is running; typing is ignored
 *   ready      focused and waiting; the first accepted keystroke starts the timer
 *   running    the timer is running
 *   paused     timer stopped; typing (or Escape) resumes
 *   complete   the target was typed exactly; results are frozen
 *
 * `transition()` is pure. The controller in app.js applies the side effects that
 * belong to each status (see `effectsFor`), so timers, focus mode and read-only
 * state are only ever changed in one place.
 */

export const STATUS = Object.freeze({
  IDLE: "idle",
  COUNTDOWN: "countdown",
  READY: "ready",
  RUNNING: "running",
  PAUSED: "paused",
  COMPLETE: "complete",
});

export const EVENT = Object.freeze({
  /** Start button. Payload: { seconds } */
  START: "start",
  COUNTDOWN_DONE: "countdownDone",
  /** Restart button, keyboard shortcut, double Escape. */
  RESTART: "restart",
  /** The target changed (source, import, option) or the page was restored. */
  RESET: "reset",
  FOCUS: "focus",
  BLUR: "blur",
  /** An accepted keystroke. */
  TYPE: "type",
  ESCAPE: "escape",
  /** The page became hidden. */
  HIDE: "hide",
  /** The typed text equals the target. */
  FINISH: "finish",
});

export const ALL_STATUSES = Object.values(STATUS);
export const ALL_EVENTS = Object.values(EVENT);

const INPUT_STATUSES = new Set([STATUS.READY, STATUS.RUNNING, STATUS.PAUSED]);
const FOCUS_MODE_STATUSES = new Set([STATUS.COUNTDOWN, STATUS.READY, STATUS.RUNNING]);

/** Only ready, running and paused accept typing. */
export function acceptsInput(status) {
  return INPUT_STATUSES.has(status);
}

/** Returns the next status; an unchanged status means "no transition". */
export function transition(status, event, payload = {}) {
  switch (event) {
    case EVENT.START:
      return payload.seconds > 0 ? STATUS.COUNTDOWN : STATUS.READY;
    case EVENT.RESTART:
      return STATUS.READY;
    case EVENT.RESET:
      return STATUS.IDLE;
    case EVENT.COUNTDOWN_DONE:
      return status === STATUS.COUNTDOWN ? STATUS.READY : status;
    case EVENT.FOCUS:
      return status === STATUS.IDLE ? STATUS.READY : status;
    case EVENT.BLUR:
      if (status === STATUS.RUNNING) return STATUS.PAUSED;
      if (status === STATUS.READY) return STATUS.IDLE;
      return status;
    case EVENT.HIDE:
      return status === STATUS.RUNNING ? STATUS.PAUSED : status;
    case EVENT.TYPE:
      return acceptsInput(status) ? STATUS.RUNNING : status;
    case EVENT.ESCAPE:
      switch (status) {
        case STATUS.COUNTDOWN:
        case STATUS.READY:
          return STATUS.IDLE;
        case STATUS.RUNNING:
          return STATUS.PAUSED;
        case STATUS.PAUSED:
          return STATUS.RUNNING;
        default:
          return status;
      }
    case EVENT.FINISH:
      return status === STATUS.RUNNING ? STATUS.COMPLETE : status;
    default:
      throw new Error(`Unknown event: ${event}`);
  }
}

/**
 * Side effects that hold while a status is active.
 * focus: "input" moves focus to the typing area, "release" takes it away from the
 * typing area, null leaves focus alone.
 */
export function effectsFor(status) {
  return {
    timerRunning: status === STATUS.RUNNING,
    focusMode: FOCUS_MODE_STATUSES.has(status),
    inputEnabled: acceptsInput(status),
    countdownActive: status === STATUS.COUNTDOWN,
    focus:
      status === STATUS.READY
        ? "input"
        : status === STATUS.IDLE || status === STATUS.COMPLETE
          ? "release"
          : null,
  };
}

/** A tiny observable store. Listeners receive (state, previousState). */
export function createStore(initialState) {
  let state = initialState;
  const listeners = new Set();
  return {
    get: () => state,
    set(patch) {
      const previous = state;
      state = { ...state, ...patch };
      for (const listener of listeners) listener(state, previous);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
