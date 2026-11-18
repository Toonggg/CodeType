// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { STATUS } from "../src/state.js";
import { mountApp, pressKey, typeValue } from "./helpers/mount.js";

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

const status = () => app.store.get().status;

describe("countdown", () => {
  test("typing during the countdown is ignored and a single Escape cancels (B3, B7)", () => {
    app.actions.setCountdown("3");
    app.actions.start();
    expect(status()).toBe(STATUS.COUNTDOWN);
    expect(els.input.readOnly).toBe(true);
    expect(els.status.textContent).toBe("STARTING IN 3 · ESC TO CANCEL");

    typeValue(els, "def");
    expect(els.input.value).toBe("");
    expect(app.store.get().session.typed).toEqual([]);

    pressKey(document, "Escape");
    expect(status()).toBe(STATUS.IDLE);
    vi.advanceTimersByTime(5000);
    expect(status()).toBe(STATUS.IDLE);
  });

  test("the countdown ends in ready with the typing area focused", () => {
    app.actions.setCountdown("2");
    app.actions.start();
    vi.advanceTimersByTime(1000);
    expect(els.status.textContent).toBe("STARTING IN 1 · ESC TO CANCEL");
    vi.advanceTimersByTime(1000);
    expect(status()).toBe(STATUS.READY);
    expect(document.activeElement).toBe(els.input);
    expect(els.status.textContent).toBe("READY · TYPE TO START THE TIMER");
  });
});

describe("running and pausing", () => {
  test("Escape pauses and freezes the clock, Escape again resumes (D4)", () => {
    els.input.focus();
    expect(status()).toBe(STATUS.READY);
    typeValue(els, "d");
    expect(status()).toBe(STATUS.RUNNING);
    vi.advanceTimersByTime(2000);
    expect(els.time.textContent).toBe("00:02");

    pressKey(document, "Escape");
    expect(status()).toBe(STATUS.PAUSED);
    vi.advanceTimersByTime(5000);
    expect(els.time.textContent).toBe("00:02");

    vi.advanceTimersByTime(1000); // outside the double-press window
    pressKey(document, "Escape");
    expect(status()).toBe(STATUS.RUNNING);
    vi.advanceTimersByTime(1000);
    expect(els.time.textContent).toBe("00:03");
  });

  test("two quick Escapes restart into ready", () => {
    els.input.focus();
    typeValue(els, "de");
    pressKey(document, "Escape");
    pressKey(document, "Escape");
    expect(status()).toBe(STATUS.READY);
    expect(els.input.value).toBe("");
    expect(document.activeElement).toBe(els.input);
  });

  test("losing focus while running pauses (U15)", () => {
    els.input.focus();
    typeValue(els, "d");
    els.input.blur();
    expect(status()).toBe(STATUS.PAUSED);
    expect(els.status.textContent).toBe("PAUSED · CLICK TO RESUME");
    els.input.focus();
    expect(els.status.textContent).toBe("PAUSED · TYPE OR ESC TO RESUME · ESC ESC TO RESTART");
    typeValue(els, "de");
    expect(status()).toBe(STATUS.RUNNING);
  });

  test("the page becoming hidden pauses", () => {
    els.input.focus();
    typeValue(els, "d");
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
    delete document.hidden;
    expect(status()).toBe(STATUS.PAUSED);
  });
});

describe("completion", () => {
  test("freezes stats, stops the indicator and makes the input read-only (B5)", () => {
    const target = app.store.get().target.chars.join("");
    els.input.focus();
    typeValue(els, target.slice(0, 1));
    vi.advanceTimersByTime(3000);
    typeValue(els, target);
    expect(status()).toBe(STATUS.COMPLETE);
    expect(els.window.classList.contains("complete")).toBe(true);
    expect(els.timeStat.classList.contains("complete")).toBe(true);
    expect(els.timeStat.classList.contains("running")).toBe(false);
    expect(els.input.readOnly).toBe(true);
    expect(document.body.classList.contains("challenge-active")).toBe(false);
    const time = els.time.textContent;
    vi.advanceTimersByTime(5000);
    typeValue(els, target.slice(0, -1));
    expect(els.input.value).toBe(target);
    expect(els.time.textContent).toBe(time);
  });

  test("Restart returns to ready with focus (B26)", () => {
    const target = app.store.get().target.chars.join("");
    els.input.focus();
    typeValue(els, target);
    els.restart.click();
    expect(status()).toBe(STATUS.READY);
    expect(document.activeElement).toBe(els.input);
    expect(els.input.value).toBe("");
    expect(els.time.textContent).toBe("00:00");
  });
});

describe("page and source changes", () => {
  test("a restored page (bfcache) resets the session (B14)", () => {
    els.input.focus();
    typeValue(els, "de");
    const event = new Event("pageshow");
    event.persisted = true;
    window.dispatchEvent(event);
    expect(status()).toBe(STATUS.IDLE);
    expect(els.input.value).toBe("");
  });

  test("choosing 'My imported code' without an import keeps the current source (B11)", () => {
    const custom = els.sourceSelect.querySelector('option[value="custom"]');
    expect(custom.disabled).toBe(true);
    app.actions.selectSource("custom");
    expect(els.sourceSelect.value).toBe("python-stdlib");
  });

  test("Escape closes the options menu before anything else (U13)", () => {
    els.optionsMenu.open = true;
    pressKey(document, "Escape");
    expect(els.optionsMenu.open).toBe(false);
    expect(document.activeElement).toBe(els.optionsSummary);
  });

  test("settings are persisted by their setters (Q6, B21)", () => {
    app.actions.togglePunishment();
    app.actions.setCountdown("75");
    expect(localStorage.getItem("codetype-punishment")).toBe("on");
    expect(localStorage.getItem("codetype-countdown")).toBe("60");
    expect(els.countdownSeconds.value).toBe("60");
    expect(els.punishmentToggle.getAttribute("aria-pressed")).toBe("true");
  });

  test("boot recovers safely if savedImport has empty target (BUG-1)", () => {
    app.destroy();
    localStorage.setItem(
      "codetype-last-import",
      JSON.stringify({
        version: 2,
        id: "custom",
        filename: "test.py",
        repo: "test.py",
        path: "/ local",
        code: "\n\n\n",
        range: { start: 1, end: 3 },
      }),
    );
    // Should not throw and should fall back to EXAMPLES[0]
    ({ app, els } = mountApp());
    expect(app.store.get().item.id).toBe("python-stdlib");
    expect(localStorage.getItem("codetype-last-import")).toBeNull();
  });

  test("IME composition text is ignored while composing and scored on compositionend (BUG-6)", () => {
    const inputSpy = vi.spyOn(app.actions, "input");
    els.input.focus();

    // 1. compositionstart
    els.input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));

    // 2. intermediate input with isComposing: true
    els.input.value = "d";
    const event = new InputEvent("input", { bubbles: true, isComposing: true });
    Object.defineProperty(event, "isComposing", { value: true });
    els.input.dispatchEvent(event);

    expect(inputSpy).not.toHaveBeenCalled();

    // 3. compositionend
    els.input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    expect(inputSpy).toHaveBeenCalledTimes(1);
    expect(inputSpy).toHaveBeenCalledWith("d");
  });
});
