/**
 * Keeps the option controls in sync with state.settings and the selected item.
 */

/** Builds the source <select> options from the EXAMPLES data (Q7, H11). */
export function populateSourceOptions(select, examples) {
  const options = examples.map((example) => new Option(example.label, example.id));
  select.replaceChildren(...options, new Option("My imported code", "custom"));
}

function setToggle(button, enabled, label) {
  button.setAttribute("aria-pressed", String(enabled));
  button.textContent = `${label} ${enabled ? "on" : "off"}`;
}

export function renderControls(els, state, prev) {
  const settings = state.settings;
  const before = prev?.settings;
  if (!before || settings.punishment !== before.punishment) {
    setToggle(els.punishmentToggle, settings.punishment, "⚡ Punishment");
  }
  if (!before || settings.randomStart !== before.randomStart) {
    setToggle(els.randomStartToggle, settings.randomStart, "↝ Random start");
    // "New start" rerolls; Restart retries the same start (U8).
    els.newStart.hidden = !settings.randomStart;
  }
  if (!before || settings.autoIndent !== before.autoIndent) {
    setToggle(els.autoIndentToggle, settings.autoIndent, "⇥ Auto-indent");
  }
  if (!before || settings.countdownSeconds !== before.countdownSeconds) {
    els.countdownSeconds.value = String(settings.countdownSeconds);
  }
  if (!prev || state.hasImport !== prev.hasImport) {
    // "My imported code" is only selectable once an import exists (B11).
    const custom = els.sourceSelect.querySelector('option[value="custom"]');
    if (custom) custom.disabled = !state.hasImport;
  }
  if (!prev || state.item !== prev.item) {
    els.sourceSelect.value = state.item.id;
  }
}
