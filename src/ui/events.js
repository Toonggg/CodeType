/**
 * All DOM event listeners, in one place. Handlers stay thin: they translate DOM
 * events into controller actions.
 */

/** Keys that would move the caret away from the end of the typed text (B16). */
const NAVIGATION_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

/** Input types that would insert text the user did not type (B17). */
const BLOCKED_INPUT_TYPES = new Set([
  "insertFromPaste",
  "insertFromPasteAsQuotation",
  "insertFromDrop",
  "insertFromYank",
  "insertReplacementText",
  "insertTranspose",
  "insertLink",
  "deleteByDrag",
  "historyUndo",
  "historyRedo",
]);

function handleTypingKeydown(event, actions) {
  if (event.isComposing) return;
  const shortcut = event.ctrlKey || event.metaKey;
  if (event.key === "Tab" && !event.shiftKey && !event.altKey && !shortcut) {
    // Shift+Tab is left alone so keyboard users can always leave (A1).
    event.preventDefault();
    actions.tab();
  } else if (NAVIGATION_KEYS.has(event.key)) {
    event.preventDefault();
  } else if (shortcut && ["a", "z", "y"].includes(event.key.toLowerCase())) {
    // Select-all, undo and redo would edit text away from the caret.
    event.preventDefault();
  }
}

export function bindEvents(els, actions, { doc = document, win = window, signal } = {}) {
  const options = { signal };
  // Typing area.
  els.input.addEventListener("input", () => actions.input(els.input.value), options);
  els.input.addEventListener("keydown", (event) => handleTypingKeydown(event, actions), options);
  els.input.addEventListener(
    "beforeinput",
    (event) => {
      if (BLOCKED_INPUT_TYPES.has(event.inputType)) event.preventDefault();
    },
    options,
  );
  for (const type of ["paste", "drop"]) {
    els.input.addEventListener(type, (event) => event.preventDefault(), options);
  }
  // Keep the caret pinned to the end of the typed text (B16).
  const pinCaret = () => {
    const end = els.input.value.length;
    if (els.input.selectionStart !== end || els.input.selectionEnd !== end) {
      els.input.setSelectionRange(end, end);
    }
  };
  els.input.addEventListener("select", pinCaret, options);
  doc.addEventListener(
    "selectionchange",
    () => {
      if (doc.activeElement === els.input) pinCaret();
    },
    options,
  );
  els.input.addEventListener("focus", actions.focus, options);
  els.input.addEventListener("blur", actions.blur, options);
  els.window.addEventListener("click", () => els.input.focus(), options);
  // Clicking inside the card must not steal focus from the typing area (which would
  // pause a running challenge). Form fields keep their normal behaviour.
  els.practiceCard.addEventListener(
    "mousedown",
    (event) => {
      if (!event.target.closest("input, select, textarea, a, summary")) event.preventDefault();
    },
    options,
  );

  // Session controls.
  els.restart.addEventListener("click", actions.restart, options);
  els.newStart.addEventListener("click", actions.newStart, options);
  els.startCountdown.addEventListener("click", actions.start, options);

  // Settings.
  els.punishmentToggle.addEventListener("click", actions.togglePunishment, options);
  els.randomStartToggle.addEventListener("click", actions.toggleRandomStart, options);
  els.autoIndentToggle.addEventListener("click", actions.toggleAutoIndent, options);
  els.countdownSeconds.addEventListener(
    "change",
    () => actions.setCountdown(els.countdownSeconds.value),
    options,
  );
  els.themeToggle.addEventListener("click", actions.toggleTheme, options);

  // Source and imports.
  els.sourceSelect.addEventListener(
    "change",
    () => actions.selectSource(els.sourceSelect.value),
    options,
  );
  els.importButton.addEventListener("click", () => els.fileInput.click(), options);
  els.fileInput.addEventListener(
    "change",
    () => {
      const [file] = els.fileInput.files;
      // Reset so choosing the same file again fires "change" again (B12).
      els.fileInput.value = "";
      actions.importLocalFile(file);
    },
    options,
  );
  els.githubButton.addEventListener("click", actions.toggleGithubForm, options);
  els.githubForm.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      actions.importGithub(els.githubUrl.value);
    },
    options,
  );
  els.forgetImport.addEventListener("click", actions.forgetImport, options);
  for (const input of [els.rangeStart, els.rangeEnd]) {
    input.addEventListener(
      "change",
      () => actions.setRange(els.rangeStart.value, els.rangeEnd.value),
      options,
    );
  }
  els.skipCommentsToggle.addEventListener("click", actions.toggleSkipComments, options);
  els.noticeDismiss.addEventListener("click", actions.dismissNotice, options);

  // Page-level.
  doc.addEventListener(
    "click",
    (event) => {
      if (els.optionsMenu.open && !els.optionsMenu.contains(event.target)) {
        els.optionsMenu.open = false;
      }
    },
    options,
  );
  doc.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") actions.escape(event);
    },
    options,
  );
  doc.addEventListener(
    "visibilitychange",
    () => {
      if (doc.hidden) actions.hide();
    },
    options,
  );
  win.addEventListener(
    "pageshow",
    (event) => {
      if (event.persisted) actions.pageRestored();
    },
    options,
  );
}
