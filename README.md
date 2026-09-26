# CodeType

Typing practice for developers. Type real code from well-known open-source projects, or import
your own file, and track speed and accuracy as you go.

## Run it

Requires Node.js 20 or newer.

```sh
npm install
npm run dev
```

Open the printed local URL in a browser.

## Test and lint

```sh
npm test
npm run lint
```

## Build

```sh
npm run build     # static site in dist/
npm run preview   # serve dist/ locally
```

## Accessibility

- **Keyboard.** Every control is reachable with Tab, and the typing area is a single tab stop.
  In the typing area, Tab inserts the indentation the code expects. With nothing to indent it
  moves focus on, except while a run is in progress (press Esc to pause first). Shift+Tab always
  leaves. A finished run drops out of the tab order so the next Tab reaches Restart.
  Ctrl/Cmd+Enter restarts from anywhere except other form fields. Esc closes the Options menu
  before it does anything else.
- **Screen readers.** The per-character code display is hidden from assistive technology. The
  same text is exposed as plain text in a "Code to type" region. The typing area is described
  by short instructions, the status line is a polite live region (it announces the countdown,
  pauses and, on completion, WPM and accuracy), progress is a `progressbar`, and each Options
  row is a `fieldset` named by its legend. Toggles expose `aria-pressed`; icons are hidden.
- **Motion and contrast.** With "Reduce motion" on, nothing shakes or pulses; a punishment
  mistake turns the code window's outline red instead. Text and focus indicators meet WCAG AA
  in both themes.

### Verification record (step 43, 2026-09-26)

Checked in Chrome 154 (headless, macOS 27) by scripting real key events through the DevTools
protocol, in the light and dark themes:

- Keyboard only: the tab order is brand → theme → source → Options → typing area → Restart,
  and every stop except the invisible textarea shows a focus ring. Enter opens Options, Tab
  enters the panel, Esc closes it and returns focus to Options. Focus starts a run, typing
  runs it, Esc pauses and resumes, Ctrl+Enter restarts, and Shift+Tab leaves (pausing the run).
  A whole snippet completes using only Tab and auto-indent for indentation, and the next Tab
  after completion reaches Restart.
- Accessibility tree: the only text box is "Type the code", with its description; the status
  line is `status` (polite, atomic); the progress bar reports the same value as the visible
  percentage; the "Code to type" region, the labelled source combobox and the three Options
  groups are present; every button has a name, toggle names carry no on/off text and no icon
  glyph leaks into a name.
- axe-core 4.13.0: no violations in either theme with the Options panel open. (The first run
  found the on/off hint on active toggles at 3.6:1; it is now full opacity.)
- Reduced motion (emulated): no shake or pulse animation; the red outline appears instead.

**Not yet done: a VoiceOver pass by a person.** Suggested checks: VO+U lists the "Code to
type" region and VO can read it line by line; focusing the typing area announces its name and
description; the countdown, pause and completion results are announced without moving focus;
Options groups announce their legends and toggles announce "selected" or "not selected".

## Syntax highlighting

Highlighting uses a small built-in tokenizer (`src/syntax/tokenize.js`) with rule sets for
Python, C/C++, Rust, JavaScript, TypeScript, Go, Java and shell (`src/syntax/languages.js`).
Other files fall back to a generic rule set.

Decision (D3): the custom tokenizer was extended rather than adopting Prism. It keeps the app
dependency-free and is enough for a handful of languages. Revisit this if more than about six
more languages are wanted.
