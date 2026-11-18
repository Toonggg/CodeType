import { describe, expect, test, vi } from "vitest";
import {
  ALL_EVENTS,
  ALL_STATUSES,
  EVENT,
  STATUS,
  acceptsInput,
  createStore,
  effectsFor,
  transition,
} from "../src/state.js";

const { IDLE, COUNTDOWN, READY, RUNNING, PAUSED, COMPLETE } = STATUS;

// Columns: START(0 s), START(3 s), COUNTDOWN_DONE, RESTART, RESET, FOCUS, BLUR, TYPE,
// ESCAPE, HIDE, FINISH.
const COLUMNS = [
  [EVENT.START, { seconds: 0 }],
  [EVENT.START, { seconds: 3 }],
  [EVENT.COUNTDOWN_DONE],
  [EVENT.RESTART],
  [EVENT.RESET],
  [EVENT.FOCUS],
  [EVENT.BLUR],
  [EVENT.TYPE],
  [EVENT.ESCAPE],
  [EVENT.HIDE],
  [EVENT.FINISH],
];

// prettier-ignore
const TABLE = {
  [IDLE]:      [READY, COUNTDOWN, IDLE,     READY, IDLE, READY,     IDLE,      IDLE,      IDLE,     IDLE,      IDLE],
  [COUNTDOWN]: [READY, COUNTDOWN, READY,    READY, IDLE, COUNTDOWN, COUNTDOWN, COUNTDOWN, IDLE,     COUNTDOWN, COUNTDOWN],
  [READY]:     [READY, COUNTDOWN, READY,    READY, IDLE, READY,     IDLE,      RUNNING,   IDLE,     READY,     READY],
  [RUNNING]:   [READY, COUNTDOWN, RUNNING,  READY, IDLE, RUNNING,   PAUSED,    RUNNING,   PAUSED,   PAUSED,    COMPLETE],
  [PAUSED]:    [READY, COUNTDOWN, PAUSED,   READY, IDLE, PAUSED,    PAUSED,    RUNNING,   RUNNING,  PAUSED,    PAUSED],
  [COMPLETE]:  [READY, COUNTDOWN, COMPLETE, READY, IDLE, COMPLETE,  COMPLETE,  COMPLETE,  COMPLETE, COMPLETE,  COMPLETE],
};

describe("transition table", () => {
  test("covers every status and every event", () => {
    expect(Object.keys(TABLE).sort()).toEqual([...ALL_STATUSES].sort());
    expect(new Set(COLUMNS.map(([event]) => event))).toEqual(new Set(ALL_EVENTS));
  });

  for (const status of ALL_STATUSES) {
    COLUMNS.forEach(([event, payload], column) => {
      const expected = TABLE[status][column];
      const label = payload ? `${event}(${payload.seconds}s)` : event;
      test(`${status} + ${label} -> ${expected}`, () => {
        expect(transition(status, event, payload)).toBe(expected);
      });
    });
  }

  test("unknown events throw", () => {
    expect(() => transition(IDLE, "nope")).toThrow(/Unknown event/);
  });
});

describe("effectsFor", () => {
  // prettier-ignore
  const EXPECTED = {
    [IDLE]:      { timerRunning: false, focusMode: false, inputEnabled: false, countdownActive: false, focus: "release" },
    [COUNTDOWN]: { timerRunning: false, focusMode: true,  inputEnabled: false, countdownActive: true,  focus: null },
    [READY]:     { timerRunning: false, focusMode: true,  inputEnabled: true,  countdownActive: false, focus: "input" },
    [RUNNING]:   { timerRunning: true,  focusMode: true,  inputEnabled: true,  countdownActive: false, focus: null },
    [PAUSED]:    { timerRunning: false, focusMode: false, inputEnabled: true,  countdownActive: false, focus: null },
    [COMPLETE]:  { timerRunning: false, focusMode: false, inputEnabled: false, countdownActive: false, focus: "release" },
  };
  for (const status of ALL_STATUSES) {
    test(`side effects of ${status}`, () => {
      expect(effectsFor(status)).toEqual(EXPECTED[status]);
      expect(acceptsInput(status)).toBe(EXPECTED[status].inputEnabled);
    });
  }
});

describe("createStore", () => {
  test("notifies subscribers with the next and previous state", () => {
    const store = createStore({ a: 1, b: 2 });
    const calls = [];
    const unsubscribe = store.subscribe((next, prev) => calls.push([next, prev]));
    store.set({ a: 3 });
    expect(store.get()).toEqual({ a: 3, b: 2 });
    expect(calls).toEqual([
      [
        { a: 3, b: 2 },
        { a: 1, b: 2 },
      ],
    ]);
    unsubscribe();
    store.set({ a: 4 });
    expect(calls).toHaveLength(1);
  });

  test("skips notifying subscribers when patch values are unchanged (PERF-5)", () => {
    const store = createStore({ x: 10, y: 20 });
    const listener = vi.fn();
    store.subscribe(listener);
    store.set({ x: 10 });
    expect(listener).not.toHaveBeenCalled();
    store.set({ x: 11 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
