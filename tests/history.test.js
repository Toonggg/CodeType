import { describe, expect, test } from "vitest";
import { HISTORY_MAX_RUNS } from "../src/constants.js";
import { emptyHistory, historyKey, recordRun, runsFor, validateHistory } from "../src/history.js";
import { formatWhen, resultComparison, resultSummary } from "../src/ui/renderResults.js";

const run = (key, wpm, extra = {}) => ({
  key,
  label: key,
  wpm,
  accuracy: 97,
  elapsedMs: 42_000,
  errors: 3,
  corrections: 5,
  chars: 250,
  at: "2026-09-26T12:00:00.000Z",
  ...extra,
});

describe("historyKey", () => {
  test("examples use their id; imports use their file name", () => {
    expect(historyKey({ id: "go-strings" })).toBe("go-strings");
    expect(historyKey({ id: "custom", filename: "main.rs" })).toBe("import:main.rs");
  });

  test("two imports with the same filename from different repos keep separate keys (BUG-5)", () => {
    const item1 = {
      id: "custom",
      filename: "utils.py",
      repo: "user1/repoA",
      path: "/src/utils.py",
    };
    const item2 = {
      id: "custom",
      filename: "utils.py",
      repo: "user2/repoB",
      path: "/src/utils.py",
    };
    expect(historyKey(item1)).not.toBe(historyKey(item2));
    expect(historyKey(item1)).toBe("import:user1/repoA/src/utils.py");
    expect(historyKey(item2)).toBe("import:user2/repoB/src/utils.py");

    // Separate ranges on same file also have distinct keys
    const ranged = { ...item1, range: { start: 1, end: 20 } };
    expect(historyKey(ranged)).toBe("import:user1/repoA/src/utils.py#L1-20");
  });
});

describe("recordRun", () => {
  test("the first run of a snippet is its best", () => {
    const result = recordRun(emptyHistory(), run("a", 50));
    expect(result).toMatchObject({ isBest: true, previousBest: null });
    expect(result.history.best).toEqual({ a: 50 });
  });

  test("a faster run replaces the best; a slower or equal one does not", () => {
    let { history } = recordRun(emptyHistory(), run("a", 50));
    const slower = recordRun(history, run("a", 40));
    expect(slower).toMatchObject({ isBest: false, previousBest: 50 });
    expect(slower.history.best.a).toBe(50);
    expect(recordRun(history, run("a", 50)).isBest).toBe(false);
    ({ history } = recordRun(history, run("a", 61)));
    expect(history.best.a).toBe(61);
  });

  test("bests are kept per snippet", () => {
    let { history } = recordRun(emptyHistory(), run("a", 50));
    ({ history } = recordRun(history, run("b", 30)));
    expect(history.best).toEqual({ a: 50, b: 30 });
  });

  test(`keeps the ${HISTORY_MAX_RUNS} most recent runs, newest first`, () => {
    let history = emptyHistory();
    for (let i = 0; i < HISTORY_MAX_RUNS + 5; i += 1)
      ({ history } = recordRun(history, run("a", i)));
    expect(history.runs).toHaveLength(HISTORY_MAX_RUNS);
    expect(history.runs[0].wpm).toBe(HISTORY_MAX_RUNS + 4);
  });

  test("does not mutate the previous history", () => {
    const before = emptyHistory();
    recordRun(before, run("a", 50));
    expect(before).toEqual(emptyHistory());
  });
});

describe("runsFor", () => {
  test("returns one snippet's runs, newest first, limited", () => {
    let history = emptyHistory();
    for (const [key, wpm] of [
      ["a", 1],
      ["b", 2],
      ["a", 3],
      ["a", 4],
    ]) {
      ({ history } = recordRun(history, run(key, wpm)));
    }
    expect(runsFor(history, "a", 2).map((r) => r.wpm)).toEqual([4, 3]);
    expect(runsFor(history, "c")).toEqual([]);
  });
});

describe("validateHistory", () => {
  test("unknown or corrupt values become an empty history", () => {
    for (const value of [null, "x", 42, {}, { version: 2, runs: [], best: {} }]) {
      expect(validateHistory(value)).toEqual(emptyHistory());
    }
  });

  test("keeps valid runs and bests and drops the rest", () => {
    const value = {
      version: 1,
      runs: [run("a", 50), { key: "a", wpm: "fast" }, run("b", -1), null],
      best: { a: 50, b: "x", c: Number.NaN, d: 12 },
    };
    expect(validateHistory(value)).toEqual({
      version: 1,
      runs: [run("a", 50)],
      best: { a: 50, d: 12 },
    });
  });
});

describe("result texts", () => {
  test("the summary lists speed, accuracy, time, errors and backspaces", () => {
    expect(resultSummary(run("a", 72))).toBe(
      "72 WPM · 97% accuracy · 00:42 · 3 errors · 5 backspaces",
    );
    expect(resultSummary(run("a", 72, { errors: 1, corrections: 1 }))).toMatch(
      /1 error · 1 backspace$/,
    );
  });

  test("the comparison describes first runs, new bests and other runs", () => {
    expect(resultComparison({ isBest: true, previousBest: null }, 50)).toBe(
      "Your first recorded run of this snippet.",
    );
    expect(resultComparison({ isBest: true, previousBest: 50 }, 61)).toBe(
      "Beats your previous best of 50 WPM.",
    );
    expect(resultComparison({ isBest: false, previousBest: 61 }, 61)).toBe(
      "Your best for this snippet is 61 WPM.",
    );
  });
});

describe("formatWhen", () => {
  const now = new Date(2026, 8, 26, 21, 0);
  test("today's runs show the time, older runs the day", () => {
    expect(formatWhen(new Date(2026, 8, 26, 8, 5).toISOString(), now, "en-US")).toBe("8:05 AM");
    expect(formatWhen(new Date(2026, 8, 25, 23, 59).toISOString(), now, "en-US")).toBe("Sep 25");
  });
});
