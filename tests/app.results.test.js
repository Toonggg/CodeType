// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { STATUS } from "../src/state.js";
import { mountApp, typeValue } from "./helpers/mount.js";

let app;
let els;

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  ({ app, els } = mountApp());
});

afterEach(() => {
  app.destroy();
  vi.useRealTimers();
});

const target = () => app.store.get().target.chars.join("");

/** Types the whole target over `seconds`, with one mistake fixed on the way. */
function completeRun(seconds) {
  const text = target();
  els.input.focus();
  typeValue(els, text.slice(0, 1));
  typeValue(els, `${text.slice(0, 1)}#`); // a wrong character
  typeValue(els, text.slice(0, 1)); // backspace
  vi.advanceTimersByTime(seconds * 1000);
  typeValue(els, text);
  expect(app.store.get().status).toBe(STATUS.COMPLETE);
}

const stored = () => JSON.parse(localStorage.getItem("codetype-history"));

describe("results and history (U2)", () => {
  test("nothing is shown before a run completes", () => {
    expect(els.results.hidden).toBe(true);
    expect(els.best.textContent).toBe("–");
  });

  test("completion shows the results, stores the run and sets the best", () => {
    completeRun(30);
    expect(els.results.hidden).toBe(false);
    expect(els.resultsBadge.hidden).toBe(false);
    expect(els.resultsBadge.textContent).toBe("First run");
    expect(els.resultsSummary.textContent).toBe(
      `${els.wpm.textContent} WPM · ${els.accuracy.textContent}% accuracy · 00:30 · 1 error · 1 backspace`,
    );
    expect(els.resultsCompare.textContent).toBe("Your first recorded run of this snippet.");
    expect(els.best.textContent).toBe(els.wpm.textContent);
    const rows = els.resultsRuns.querySelectorAll("tr");
    expect(rows).toHaveLength(1);
    expect(rows[0].className).toBe("is-current");
    expect(rows[0].cells[0].textContent).toBe("This run");

    const history = stored();
    expect(history.runs).toHaveLength(1);
    expect(history.runs[0]).toMatchObject({
      key: "python-stdlib",
      label: "Python · asyncio runner",
      errors: 1,
      corrections: 1,
      chars: target().length,
    });
    expect(history.best["python-stdlib"]).toBe(Number(els.wpm.textContent));
  });

  test("a faster run is a new best; a slower one is compared with the best", () => {
    completeRun(60);
    const first = Number(els.wpm.textContent);
    els.restart.click();
    expect(els.results.hidden).toBe(true);

    completeRun(20);
    const second = Number(els.wpm.textContent);
    expect(second).toBeGreaterThan(first);
    expect(els.resultsBadge.textContent).toBe("New best");
    expect(els.resultsCompare.textContent).toBe(`Beats your previous best of ${first} WPM.`);
    els.restart.click();

    completeRun(90);
    expect(els.resultsBadge.hidden).toBe(true);
    expect(els.resultsCompare.textContent).toBe(`Your best for this snippet is ${second} WPM.`);
    expect(els.best.textContent).toBe(String(second));
    expect(els.resultsRuns.querySelectorAll("tr")).toHaveLength(3);
  });

  test("the best stat follows the selected snippet and survives a reload", () => {
    completeRun(30);
    const best = els.best.textContent;
    app.actions.selectSource("rust-stdlib");
    expect(els.results.hidden).toBe(true);
    expect(els.best.textContent).toBe("–");
    app.actions.selectSource("python-stdlib");
    expect(els.best.textContent).toBe(best);

    app.destroy();
    ({ app, els } = mountApp());
    expect(els.best.textContent).toBe(best);
  });

  test("a corrupt stored history is ignored", () => {
    app.destroy();
    localStorage.setItem("codetype-history", "{not json");
    ({ app, els } = mountApp());
    expect(els.best.textContent).toBe("–");
    completeRun(30);
    expect(stored().runs).toHaveLength(1);
  });
});
