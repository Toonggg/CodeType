import { expect, test } from "vitest";
import { createStopwatch } from "../src/timer.js";

test("stopwatch accumulates across pauses and resets", () => {
  let clock = 1000;
  const watch = createStopwatch(() => clock);
  expect(watch.elapsedMs()).toBe(0);
  watch.start();
  clock += 500;
  expect(watch.elapsedMs()).toBe(500);
  watch.pause();
  clock += 10_000;
  expect(watch.elapsedMs()).toBe(500);
  expect(watch.running).toBe(false);
  watch.start();
  watch.start(); // idempotent
  clock += 250;
  expect(watch.elapsedMs()).toBe(750);
  watch.reset();
  expect(watch.elapsedMs()).toBe(0);
  expect(watch.running).toBe(false);
});
