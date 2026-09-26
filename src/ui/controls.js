/**
 * Builds the source <select> options from the EXAMPLES data (Q7, H11). The
 * "My imported code" option is disabled until an import exists (B11).
 */
export function populateSourceOptions(select, examples, hasImport) {
  const options = examples.map((example) => new Option(example.label, example.id));
  const custom = new Option("My imported code", "custom");
  custom.disabled = !hasImport;
  select.replaceChildren(...options, custom);
}

export function setCustomOptionEnabled(select, enabled) {
  const custom = select.querySelector('option[value="custom"]');
  if (custom) custom.disabled = !enabled;
}
