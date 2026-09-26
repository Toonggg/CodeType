// @vitest-environment jsdom
import { readFileSync } from "node:fs";
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

describe("labels, grouping and page metadata (A7, H4, H6, H12)", () => {
  const html = readFileSync("index.html", "utf8");

  test("the source select has a visible label and no duplicate aria-label", () => {
    const label = document.querySelector('label[for="source-select"]');
    expect(label.textContent).toBe("EXAMPLE OR FILE");
    expect(els.sourceSelect.hasAttribute("aria-label")).toBe(false);
  });

  test("every option row is a fieldset named by its legend", () => {
    const rows = [...document.querySelectorAll(".options-panel .option-row")];
    expect(rows.length).toBe(4);
    for (const row of rows) {
      expect(row.tagName).toBe("FIELDSET");
      expect(row.firstElementChild.tagName).toBe("LEGEND");
    }
    expect(els.rangeRow.tagName).toBe("FIELDSET");
  });

  test("the page has a description, a noscript notice and untranslated code", () => {
    expect(html).toMatch(/<meta\s+name="description"\s+content="[^"]{40,}"/);
    expect(html).toMatch(/<meta name="theme-color"/);
    expect(document.querySelector("noscript")).not.toBeNull();
    expect(els.display.getAttribute("translate")).toBe("no");
    expect(els.targetText.getAttribute("translate")).toBe("no");
    expect(els.repoName.closest(".repo-info").getAttribute("translate")).toBe("no");
  });
});

describe("icons (U10, A11, H14)", () => {
  test("no Unicode symbol icons remain in the page", () => {
    expect(document.body.textContent).not.toMatch(/[☾☀＋⌘✕⇥⌗⚡↝▶↻×✦]/u);
  });

  test("every icon references a sprite symbol and is hidden from assistive technology", () => {
    const uses = [...document.querySelectorAll("svg.icon use")];
    expect(uses.length).toBeGreaterThanOrEqual(14);
    for (const use of uses) {
      expect(document.querySelector(use.getAttribute("href"))?.tagName).toBe("symbol");
      expect(use.closest('[aria-hidden="true"]')).not.toBeNull();
    }
    const sprite = document.querySelector(".icon-sprite");
    expect(sprite.hasAttribute("hidden")).toBe(true);
    expect(sprite.getAttribute("width")).toBe("0");
  });

  test("every button keeps a text name", () => {
    for (const button of document.querySelectorAll("button")) {
      const name = button.getAttribute("aria-label") ?? button.textContent.trim();
      expect(name, button.id).not.toBe("");
    }
  });
});

describe("keyboard (A10, U13)", () => {
  test("Ctrl+Enter and Cmd+Enter restart into ready with focus", () => {
    els.input.focus();
    typeValue(els, target().slice(0, 3));
    expect(app.store.get().status).toBe(STATUS.RUNNING);
    const event = pressKey(els.input, "Enter", { ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(app.store.get().status).toBe(STATUS.READY);
    expect(els.input.value).toBe("");
    expect(document.activeElement).toBe(els.input);

    typeValue(els, target().slice(0, 2));
    pressKey(document.body, "Enter", { metaKey: true });
    expect(els.input.value).toBe("");
    expect(app.store.get().status).toBe(STATUS.READY);
  });

  test("the shortcut restarts after completion and closes the options menu", () => {
    els.input.focus();
    typeValue(els, target());
    expect(app.store.get().status).toBe(STATUS.COMPLETE);
    els.optionsMenu.open = true;
    pressKey(document.body, "Enter", { ctrlKey: true });
    expect(els.optionsMenu.open).toBe(false);
    expect(app.store.get().status).toBe(STATUS.READY);
  });

  test("the shortcut is left alone in other form fields", () => {
    els.input.focus();
    typeValue(els, target().slice(0, 3));
    els.githubUrl.hidden = false;
    const event = pressKey(els.githubUrl, "Enter", { ctrlKey: true });
    expect(event.defaultPrevented).toBe(false);
    expect(app.store.get().session.typed.length).toBe(3);
  });

  test("plain Enter is typed, not treated as a shortcut", () => {
    els.input.focus();
    const event = pressKey(els.input, "Enter");
    expect(event.defaultPrevented).toBe(false);
  });

  test("Shift+Tab is not intercepted, so focus can leave the typing area (A1)", () => {
    els.input.focus();
    expect(pressKey(els.input, "Tab", { shiftKey: true }).defaultPrevented).toBe(false);
    expect(pressKey(els.input, "Tab").defaultPrevented).toBe(true);
  });
});
