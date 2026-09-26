// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { loadSettings } from "../src/settings.js";
import { isDark } from "../src/ui/theme.js";
import { mountApp } from "./helpers/mount.js";

/** A controllable prefers-color-scheme query; jsdom has no matchMedia. */
function fakeSystemTheme(dark) {
  const listeners = new Set();
  const query = {
    matches: dark,
    addEventListener: (type, fn, { signal } = {}) => {
      listeners.add(fn);
      signal?.addEventListener("abort", () => listeners.delete(fn));
    },
  };
  window.matchMedia = () => query;
  return {
    set(next) {
      query.matches = next;
      for (const fn of listeners) fn();
    },
  };
}

let app;
let els;
let meta;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
  meta = document.createElement("meta");
  meta.name = "theme-color";
  document.head.append(meta);
});

afterEach(() => {
  app?.destroy();
  app = null;
  meta.remove();
  delete window.matchMedia;
});

const dark = () => document.documentElement.classList.contains("dark");

describe("isDark", () => {
  test("a saved choice wins; with none, the system preference decides", () => {
    const win = { matchMedia: () => ({ matches: true }) };
    expect(isDark("dark", win)).toBe(true);
    expect(isDark("light", win)).toBe(false);
    expect(isDark(null, win)).toBe(true);
    expect(isDark(null, { matchMedia: () => ({ matches: false }) })).toBe(false);
    expect(isDark(null, {})).toBe(false);
  });
});

describe("theme (B19)", () => {
  test("with no saved choice the page follows the system and saves nothing", () => {
    fakeSystemTheme(true);
    ({ app, els } = mountApp());
    expect(dark()).toBe(true);
    expect(meta.content).toBe("#0d1117");
    expect(els.themeToggle.getAttribute("aria-label")).toBe("Switch to light mode");
    expect(localStorage.getItem("codetype-theme")).toBeNull();
  });

  test("the toggle saves the choice and flips from the displayed theme", () => {
    fakeSystemTheme(true);
    ({ app, els } = mountApp());
    app.actions.toggleTheme();
    expect(dark()).toBe(false);
    expect(meta.content).toBe("#f4f5f0");
    expect(els.themeToggle.getAttribute("aria-label")).toBe("Switch to dark mode");
    expect(localStorage.getItem("codetype-theme")).toBe("light");
  });

  test("system changes apply live until the user chooses", () => {
    const system = fakeSystemTheme(false);
    ({ app, els } = mountApp());
    expect(dark()).toBe(false);
    system.set(true);
    expect(dark()).toBe(true);

    app.actions.toggleTheme();
    expect(dark()).toBe(false);
    system.set(false);
    system.set(true);
    expect(dark()).toBe(false);
  });

  test("a saved choice overrides the system preference", () => {
    fakeSystemTheme(true);
    localStorage.setItem("codetype-theme", "light");
    ({ app, els } = mountApp());
    expect(dark()).toBe(false);
  });

  test("destroy stops listening to the system preference", () => {
    const system = fakeSystemTheme(false);
    ({ app, els } = mountApp());
    app.destroy();
    app = null;
    system.set(true);
    expect(dark()).toBe(false);
  });
});

describe("no flicker when the theme changes", () => {
  test("the dark class flips while transitions are suppressed, and the suppression is removed", () => {
    fakeSystemTheme(false);
    ({ app, els } = mountApp());
    const classes = document.documentElement.classList;
    const add = vi.spyOn(classes, "add");
    const toggle = vi.spyOn(classes, "toggle");
    app.actions.toggleTheme();
    expect(dark()).toBe(true);
    expect(add).toHaveBeenCalledWith("theme-switching");
    const suppressed =
      add.mock.invocationCallOrder[add.mock.calls.findIndex(([c]) => c === "theme-switching")];
    const flipped =
      toggle.mock.invocationCallOrder[toggle.mock.calls.findIndex(([c]) => c === "dark")];
    expect(suppressed).toBeLessThan(flipped);
    expect(classes.contains("theme-switching")).toBe(false);
    vi.restoreAllMocks();
  });

  test("the same theme applied again touches nothing", () => {
    fakeSystemTheme(true);
    ({ app, els } = mountApp());
    const add = vi.spyOn(document.documentElement.classList, "add");
    app.store.set({ settings: { ...app.store.get().settings, theme: "dark" } }); // already dark
    expect(add).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  test("the stylesheet switches themes without colour transitions", () => {
    const base = readFileSync("styles/base.css", "utf8");
    const body = base.match(/\nbody \{[^}]*\}/)[0];
    expect(body).not.toMatch(/transition/);
    expect(base).toMatch(/:root\.theme-switching \*,[\s\S]*?transition: none !important;/);
  });

  test("focus mode fades out as well as in (the transition is not tied to the class)", () => {
    const layout = readFileSync("styles/layout.css", "utf8");
    const active = [...layout.matchAll(/body\.challenge-active[^{]*\{[^}]*\}/g)].map(
      ([rule]) => rule,
    );
    expect(active.length).toBeGreaterThan(0);
    for (const rule of active) expect(rule).not.toMatch(/transition/);
    expect(layout).toMatch(
      /:is\(\.topbar, \.hero, \.controls, \.notice, \.explanation\) \{\s*transition:/,
    );
  });
});

describe("the head script and theme.js agree (no flip after loading)", () => {
  const html = readFileSync("index.html", "utf8");
  const headScript = html.match(/<script>([\s\S]*?)<\/script>/)[1];

  const cases = [];
  for (const stored of [null, "dark", "light", "blue", ""]) {
    for (const system of [false, true]) {
      for (const blocked of [false, true]) cases.push([stored, system, blocked]);
    }
  }

  test.each(cases)("stored %j, system dark %s, storage blocked %s", (stored, system, blocked) => {
    fakeSystemTheme(system);
    if (stored !== null) localStorage.setItem("codetype-theme", stored);
    if (blocked) {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("blocked");
      });
    }
    new Function(headScript)();
    const painted = dark();
    const afterLoad = isDark(loadSettings().theme);
    vi.restoreAllMocks();
    expect(painted).toBe(afterLoad);
  });
});
