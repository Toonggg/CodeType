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

describe("typing area semantics (A2, H1)", () => {
  test("the wrapper is not a second text box; the textarea is described", () => {
    expect(els.window.hasAttribute("role")).toBe(false);
    expect(els.window.hasAttribute("tabindex")).toBe(false);
    const help = document.getElementById(els.input.getAttribute("aria-describedby"));
    expect(help.textContent).toMatch(/Tab inserts the expected indentation/);
  });

  test("the target text is exposed as plain text and follows the target", () => {
    expect(els.display.getAttribute("aria-hidden")).toBe("true");
    expect(els.targetText.textContent).toBe(target());
    app.actions.selectSource("rust-stdlib");
    expect(els.targetText.textContent).toBe(target());
  });
});

describe("live status and progress (A3, A8, B25)", () => {
  test("the status line is a live region and the indicator is decorative", () => {
    expect(els.status.getAttribute("role")).toBe("status");
    expect(els.timerIndicator.getAttribute("aria-hidden")).toBe("true");
    expect(els.timerIndicator.hasAttribute("aria-label")).toBe(false);
  });

  test("the progress bar reports its value", () => {
    expect(els.progressTrack.getAttribute("role")).toBe("progressbar");
    els.input.focus();
    const text = target();
    typeValue(els, text.slice(0, Math.floor(text.length / 2)));
    expect(els.progressTrack.getAttribute("aria-valuenow")).toBe(els.progress.textContent);
    expect(Number(els.progress.textContent)).toBeGreaterThan(0);
  });

  test("completion announces the results shown in the stats row", () => {
    const text = target();
    els.input.focus();
    typeValue(els, text.slice(0, 1));
    vi.advanceTimersByTime(12_000);
    typeValue(els, text);
    expect(app.store.get().status).toBe(STATUS.COMPLETE);
    expect(els.status.textContent).toBe(
      `COMPLETE · ${els.wpm.textContent} WPM · ${els.accuracy.textContent}% ACCURACY`,
    );
    expect(Number(els.wpm.textContent)).toBeGreaterThan(0);
  });
});
