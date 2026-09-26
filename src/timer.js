/**
 * A pausable stopwatch on a monotonic clock (Q16). The clock is injectable for tests.
 */
export function createStopwatch(now = () => performance.now()) {
  let accumulated = 0;
  let startedAt = null;
  return {
    start() {
      if (startedAt === null) startedAt = now();
    },
    pause() {
      if (startedAt === null) return;
      accumulated += now() - startedAt;
      startedAt = null;
    },
    reset() {
      accumulated = 0;
      startedAt = null;
    },
    elapsedMs() {
      return accumulated + (startedAt === null ? 0 : now() - startedAt);
    },
    get running() {
      return startedAt !== null;
    },
  };
}
