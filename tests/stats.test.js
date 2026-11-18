import { describe, expect, test } from "vitest";
import {
  computeAccuracy,
  computeProgress,
  computeStats,
  computeWpm,
  formatTime,
} from "../src/stats.js";
import { applyTyped, createSession, toChars } from "../src/typing.js";

describe("computeWpm", () => {
  test("is 0 during the first 1.5 seconds (B18)", () => {
    expect(computeWpm(50, 0)).toBe(0);
    expect(computeWpm(50, 1499)).toBe(0);
  });
  test("a final result is computed even when the run was very short", () => {
    expect(computeWpm(50, 1000, { final: true })).toBe(600);
    expect(computeWpm(50, 0, { final: true })).toBe(0);
  });
  test("counts five correct characters as a word", () => {
    expect(computeWpm(300, 60_000)).toBe(60);
    expect(computeWpm(150, 30_000)).toBe(60);
  });
});

describe("computeAccuracy", () => {
  test("is 100 before typing", () => {
    expect(computeAccuracy(0, 0)).toBe(100);
  });
  test("never shows 100 with errors", () => {
    expect(computeAccuracy(300, 1)).toBe(99);
    expect(computeAccuracy(4, 1)).toBe(75);
  });
});

describe("computeProgress", () => {
  test("reaches 100 only when complete", () => {
    expect(computeProgress(199, 200)).toBe(99);
    expect(computeProgress(200, 200)).toBe(100);
    expect(computeProgress(0, 0)).toBe(0);
  });
});

test("computeStats combines the session and the clock", () => {
  const { session } = applyTyped(createSession(toChars("hello world")), toChars("hellx"));
  expect(computeStats(session, 60_000)).toEqual({
    wpm: 1,
    accuracy: 80,
    progress: 45,
    errors: 1,
    corrections: 0,
    elapsedMs: 60_000,
  });
});

test("typed versus auto-indented line gives same WPM per typed key (BUG-4)", () => {
  const target = toChars("a\n    b");
  // Case 1: user types 'a', '\n', and 'b' (with auto-indent inserting the 4 spaces)
  let s1 = applyTyped(createSession(target), toChars("a\n"));
  s1 = applyTyped(s1.session, toChars("a\n    "), { autoFrom: 2 });
  s1 = applyTyped(s1.session, toChars("a\n    b"));

  // Case 2: flat code where user types 'a', 'x', 'b' (3 keystrokes, 3 correct)
  const targetFlat = toChars("axb");
  const s2 = applyTyped(createSession(targetFlat), toChars("axb"));

  const stats1 = computeStats(s1.session, 60_000, { final: true });
  const stats2 = computeStats(s2.session, 60_000, { final: true });

  // Both should compute WPM from 3 typed characters
  expect(stats1.wpm).toBe(stats2.wpm);
});

test("formatTime pads minutes and seconds", () => {
  expect(formatTime(65)).toBe("01:05");
});
