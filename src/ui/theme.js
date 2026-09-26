/**
 * Colour theme (B19). An inline script in index.html applies the theme before the
 * first paint; this module keeps it in sync afterwards. With no saved choice the
 * theme follows the operating system, live. A choice is saved only when the user
 * presses the toggle.
 */

const THEME_COLORS = { light: "#f4f5f0", dark: "#0d1117" };

function systemPrefersDark(win) {
  return Boolean(win.matchMedia?.("(prefers-color-scheme: dark)").matches);
}

export function isDark(theme, win = window) {
  return theme === "dark" || (theme === null && systemPrefersDark(win));
}

export function applyTheme(els, dark, doc = document) {
  doc.documentElement.classList.toggle("dark", dark);
  els.themeToggle.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  doc
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLORS[dark ? "dark" : "light"]);
}

export function renderTheme(els, state, prev) {
  if (prev && state.settings.theme === prev.settings.theme) return;
  applyTheme(els, isDark(state.settings.theme));
}

/** Re-applies the theme when the OS preference changes and no choice is saved. */
export function watchSystemTheme(els, getTheme, { win = window, signal } = {}) {
  const query = win.matchMedia?.("(prefers-color-scheme: dark)");
  query?.addEventListener?.(
    "change",
    () => {
      if (getTheme() === null) applyTheme(els, query.matches);
    },
    { signal },
  );
}
