/**
 * Applies the colour theme to the page and the toggle button.
 */
export function renderTheme(els, state, prev) {
  if (prev && state.settings.theme === prev.settings.theme) return;
  const dark = state.settings.theme === "dark";
  document.body.classList.toggle("dark", dark);
  els.themeToggle.textContent = dark ? "☀" : "☾";
  els.themeToggle.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
}
