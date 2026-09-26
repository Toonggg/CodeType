// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test } from "vitest";
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
