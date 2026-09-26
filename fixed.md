# CodeType — Review Findings and Implementation Plan

Scope: `index.html` (113 lines), `styles.css` (202), `app.js` (425), `favicon.svg` (4). No code was changed while producing this document. Every finding names the file and line numbers **as they are today**, states what is wrong, and states the change to make. Section 11 is the ordered plan for the implementing model.

> **Line numbers go stale after Phase 0 step 3 (formatting).** From then on, locate findings by their ID and the quoted identifiers, not by line.

## Legend

- **[High]** breaks the core loop: a challenge cannot be completed, imported code is lost, or stats are wrong.
- **[Medium]** wrong behaviour the user will notice, or a cost that grows with imported file size.
- **[Low]** polish, consistency, hygiene.
- ID prefixes: **B** bug · **U** UX/product · **A** accessibility · **P** performance · **Q** JS code quality · **C** CSS · **H** HTML · **R** robustness/security/privacy. The plan in §11 refers to these IDs.

## Decisions the owner should confirm (defaults are chosen so work can proceed)

| # | Decision | Recommended default |
|---|---|---|
| D1 | ES modules need HTTP; double-clicking `index.html` stops working. Use Vite (dev server + static `dist/` build) or bundle to a single `app.js` with esbuild? | Vite |
| D2 | Whitespace policy: strict (spaces/tabs/newlines must match, made painless by exact-Tab and auto-indent) or lenient (whitespace never counts)? | Strict + auto-indent on by default |
| D3 | Syntax highlighting: extend the custom tokenizer, or adapt Prism's tokenizer output (200+ grammars, one dependency)? | Extend custom tokenizer; revisit if >6 languages are wanted |
| D4 | Escape semantics: keep "Esc = pause, Esc Esc = restart" or change to "Esc toggles pause/resume, Restart button / Ctrl+Enter restarts"? | Toggle pause/resume; Esc twice within 450 ms still restarts |
| D5 | Self-host fonts (privacy, offline) or keep Google Fonts? | Self-host |
| D6 | Theme toggle position: right edge of the header (current CSS leaves it next to the brand)? | Right edge |

---

## 1. Snapshot

**What exists.** A single-page, dependency-free typing trainer: Python/C++/Rust snippets, local-file and GitHub import, per-character highlighting, WPM/accuracy/time/progress, "punishment" shake, random start line, countdown, pause/stop via Escape, light/dark theme, localStorage persistence. No build step, no `package.json`, no tests, no README, not a git repository.

**What is good and should be preserved.**
- Zero dependencies and a fast load.
- The invisible-textarea-behind-a-display technique for input capture (works on mobile, keeps native Enter/IME behaviour).
- Every piece of user content is escaped before `innerHTML` — no XSS found.
- The stopwatch model (`elapsedMs` accumulated on pause + `startedAt`) is correct; it only needs to live in one place.
- CSS custom properties already exist for the base palette; the theming just needs finishing.

---

## 2. Bugs

### B1 [High] Tab inserts the wrong indentation for 1–3-space indents, creating an invisible error that blocks completion
- **Where:** `app.js:292-302`.
- **What happens:** the handler inserts four spaces only when the target line starts with ≥4 spaces; otherwise it inserts a tab character. The bundled C++ example (`app.js:6`) has 2-space lines (`  for (; __first != __last; ...`). Pressing Tab there inserts `\t`; because whitespace mismatches are displayed as neutral (B2), nothing turns red, yet `input.value === target` can never become true. Progress reaches 100% and the challenge never completes.
- **Change:** on Tab, read the run of spaces/tabs that the target expects starting at the caret and insert exactly that run. If the target character at the caret is not whitespace, insert nothing. Tab must never produce a character the target does not expect. Let Shift+Tab pass through (A1). Lives in the `typing` module (§10.2).

### B2 [High] Whitespace mistakes are hidden by the display and the shake check, but still counted by accuracy and completion
- **Where:** display `app.js:148-151`; punishment `app.js:305-309`; accuracy `app.js:186`; completion `app.js:287`.
- **What happens:** when either the expected or the typed character is whitespace, the character gets no `correct`/`incorrect` class and does not trigger the shake. Accuracy still drops and completion stays impossible until the user finds a mismatch they cannot see. The copy at `index.html:105` promises the opposite ("Spaces, tabs, and line breaks are part of the challenge").
- **Change:** implement one whitespace policy (D2) in a single `charState(index)` function that display, stats, punishment and completion all call. Update the copy to match.

### B3 [High] Typing during the countdown starts the timer; the countdown then wipes the timer but keeps the typed text
- **Where:** `app.js:222-258` (countdown), `app.js:276-288` (input handler).
- **What happens:** `startChallenge()` blurs the input but the code window stays clickable. A click focuses the textarea and the first key calls `start()`. When the countdown hits zero, `beginChallenge()` zeroes `startedAt`/`elapsedMs` without clearing `input.value`. The next key restarts the clock with the already-typed characters counted → inflated WPM, wrong time.
- **Change:** while the status is `countdown`, the textarea is read-only and input events are ignored. Only `ready`, `running` and `paused` accept input (state machine, §10.2).

### B4 [High] The import cleaner deletes real code and can swallow the rest of a file
- **Where:** `codeOnly`, `app.js:163-181`.
- **Confirmed by running the function on sample input:**
  - `    *out = *a;` → **removed** (a line starting with `*` is treated as a block-comment continuation). Pointer-dereference assignments in C/C++/Rust and arithmetic continuation lines such as `         * b)` vanish.
  - `#include <algorithm>` and Rust `#[derive(Debug)]` → **removed** (`#` is treated as a comment for every language).
  - `const files = glob("src/*.ts");` → the line contains `/*` but no `*/`, so `inBlockComment` becomes true and **every following line of the file is dropped** until a `*/` appears somewhere.
  - All blank lines are removed, so the practiced text no longer looks like the file; trailing whitespace is kept (the user must type invisible trailing spaces); a UTF-8 BOM is not stripped (untypeable first character).
  - `startsBlock` (`app.js:170`) is fully covered by the regex on the next line — dead code.
  - Built-in examples keep their docstrings while imports are cleaned — inconsistent.
- **Change:** replace with two pure functions in the `import` module:
  1. `normalizeSource(text)` — strip BOM and zero-width characters, `\r\n` → `\n`, NBSP → space, trim trailing whitespace per line, collapse runs of three or more blank lines to one, and report any remaining characters that cannot be typed on a standard keyboard.
  2. `stripCommentLines(text, language)` — use the tokenizer's comment ranges (Phase 4) so only lines that are entirely comment or whitespace are removed; `#` is a comment only in Python/shell-style languages; strings can never open a comment.
  Store the **raw normalized text** and apply comment stripping at render time behind a "Skip comments" setting (default on) so the choice is reversible.

### B5 [Medium] Completion leaves the timer indicator pulsing, keeps challenge mode on, and later edits corrupt the stats
- **Where:** `app.js:287`; `.complete` has no rule anywhere in `styles.css`.
- **What happens:** on completion `done = true` and the interval is cleared, but `startedAt` is never zeroed, `setTimerState()` is not called (the green pulse continues), the page stays blurred and scroll-locked, and the textarea stays editable. Backspace and retype after completion re-run `updateStats()` with a still-growing `Date.now() - startedAt`, so the displayed WPM decays. The `complete` class does nothing.
- **Change:** add a `complete` status that freezes the final elapsed time, sets the indicator to a "complete" state, makes the textarea read-only, leaves focus mode (or shows a results panel, U2), sets the status text (e.g. `COMPLETE · ↻ RESTART`), and gives `.complete` a visible style.

### B6 [Medium] Status text is written from six places and the focus handler overwrites two of them
- **Where:** writers at `app.js:97, 236, 244, 255, 268, 290`.
- **What happens:** `beginChallenge()` writes "READY · TYPE TO START TIMER" and then focuses the input; the focus listener (`app.js:289-291`) immediately replaces it with "TYPING · TAB INSERTS A TAB", so the READY message is never visible. Re-focusing the window while paused also replaces "PAUSED · PRESS A KEY TO RESUME".
- **Change:** one `renderStatus(state)` with a status → text table; nothing else writes `#typing-status`. The focus handler only dispatches an event.

### B7 [Medium] A single Escape during the countdown does nothing; only a double press cancels
- **Where:** `app.js:378-388` with `app.js:260-261`.
- **What happens:** the guard lets Escape through while `countdownTimer` is set, but `pauseChallenge()` returns early because `startedAt` is 0. Only the double-press path (`stopChallenge()`) works.
- **Change:** in the state machine, Escape in `countdown` → cancel to `idle`; in `running` → `paused`; in `paused` → resume (D4). Keep an explicit full restart (Restart button, Ctrl/Cmd+Enter). Show the keys in the status line (U3).

### B8 [Medium] Random start can produce a one-line challenge and breaks highlighting
- **Where:** `app.js:86-89`, `app.js:109-115`.
- **What happens:** the start line is any non-blank line, including the last one. The sliced text is re-tokenized from scratch, so a start inside a docstring or block comment mis-highlights everything after the next closing delimiter. Starting on an indented line forces the user to type leading whitespace as their very first keystrokes.
- **Change:** tokenize the full text once and offset the ranges by the slice start; choose the start among lines that leave at least `min(8, total)` lines (or use a fixed-size window); prefer zero-indent lines when any exist; offer "Retry same start" vs "New random start" (U8).

### B9 [Medium] Scroll-follow math ignores soft-wrapped lines
- **Where:** `app.js:154-159`; `styles.css:185` sets `white-space: pre-wrap`.
- **What happens:** `currentLine * lineHeight` assumes one visual line per logical line. Long imported lines wrap, so the viewport drifts away from the cursor. `getComputedStyle` is also called on every keystroke.
- **Change:** scroll using the current span's `offsetTop` relative to the `pre` (correct with wrapping); cache the line height once per render. Alternative: `white-space: pre` with horizontal scrolling.

### B10 [Medium] Mixed code-point and code-unit indexing
- **Where:** `[...target]` at `app.js:146` (code points) vs `typed[i]` at `app.js:147`, `target[i]` at `app.js:186, 307`, and `.length` comparisons at `app.js:284` (UTF-16 code units).
- **What happens:** any astral character (emoji inside a string, some CJK) shifts the display index relative to the compared index; every later character is coloured against the wrong expected character.
- **Change:** convert once per render with `Array.from()` for both target and typed text and use code-point arrays everywhere (lengths, comparisons, completion). Normalization (B4) should flag characters outside the typeable range.

### B11 [Medium] "My imported code" is selectable with nothing imported, and corrupt storage throws
- **Where:** `app.js:335-339`.
- **What happens:** with no import, `currentItem` becomes `null` and nothing re-renders; the select shows "My imported code" while the old example stays on screen. `JSON.parse` here has no try/catch (the init path at `app.js:405-413` does).
- **Change:** render the `custom` option `disabled` until an import exists; read through the safe storage wrapper (Q13); never leave `currentItem` null (fall back to the previous item and reset the select).

### B12 [Medium] Choosing the same local file twice does not re-import; read errors are ignored
- **Where:** `app.js:345-357`.
- **Change:** reset `fileInput.value = ""` after reading; handle `reader.onerror`; show an inline message.

### B13 [Medium] No size cap on imports; a storage quota error inside `onload` fails silently
- **Where:** `app.js:350`, `app.js:369`.
- **What happens:** `localStorage.setItem` throws `QuotaExceededError` for large files (≈2–5 MB), the exception escapes `reader.onload`, and nothing is rendered or reported.
- **Change:** cap imports (e.g. 400 lines / 64 KB) or offer a line-range picker; detect binary content (ratio of control characters) and refuse with a message; wrap every storage write in try/catch and still load the text in memory when persistence fails, with an inline note "Too large to remember between sessions".

### B14 [Low] `pageshow` resets timers but not `done`, the typed text, the status text or the display
- **Where:** `app.js:416-425`.
- **Change:** on `pageshow` with `event.persisted === true`, dispatch the same RESET the Restart button uses; do nothing on the initial load.

### B15 [Low] `render()` clears the countdown interval but leaves `countdownTimer` set
- **Where:** `app.js:75-76`; the Escape guard at `app.js:379` tests the truthiness of that stale id.
- **Change:** one `clearTimers()` that clears **and nulls** every timer id (disappears with the state machine).

### B16 [Low] The caret can be moved with arrow/Home/End keys; typing mid-text shifts every later character
- **Where:** no handling exists; the textarea is a normal editable control.
- **Change:** pin the caret to the end (prevent default on navigation keys; on `selectionchange`/`select` set both selection ends to the value length). Treat Select-All + type as a reset of the typed buffer or block it.

### B17 [Low] Paste and drop are allowed
- **Where:** `app.js:284` only trims overflow, so pasting the whole target is an instant "win".
- **Change:** `preventDefault()` on `paste` and `drop` (or on `beforeinput` for `insertFromPaste`/`insertFromDrop`).

### B18 [Low] WPM spikes into the thousands during the first few hundred milliseconds
- **Where:** `app.js:192`.
- **Change:** show 0 (or "—") until elapsed ≥ 1.5 s.

### B19 [Low] Theme flashes light on load, ignores the OS preference, and is persisted even when the user never chose
- **Where:** `app.js:389-396`; CSS default is light; `body` has a 0.2 s colour transition (`styles.css:22`) that animates the flip.
- **Change:** a tiny inline script in `<head>` sets the theme class from storage, else from `prefers-color-scheme`, before first paint; `setTheme()` persists only when triggered by the toggle; add `<meta name="color-scheme" content="light dark">`.

### B20 [Low] GitHub URL handling is narrow and errors use `alert()`
- **Where:** `app.js:359-377`.
- **What happens:** URLs copied with `#L10-L20` or `?plain=1` fail (the hash is swallowed into the path → 404); `raw.githubusercontent.com` and `/raw/` URLs are rejected; branch names containing `/` are split incorrectly; the input is not trimmed; Enter in the field does nothing (no form); no timeout; the URL box stays open after success; `alert()` blocks the page.
- **Change:** a pure `parseGitHubUrl(url)` returning `{ owner, repo, ref, path, lineRange? }` that strips query/hash, accepts `blob`, `raw` and `raw.githubusercontent.com` forms, trims, and reads `#L<a>-L<b>` to slice lines (useful: import a single function). Wrap the input and button in a `<form>`; add an inline error element; `AbortController` with a ~10 s timeout; "Loading…" text; hide the box and clear the field on success. Document the slash-in-branch limitation in the README (or retry with `refs/heads/<longer prefix>` on 404).

### B21 [Low] Countdown seconds persist only when Start is pressed
- **Where:** `app.js:227-228`.
- **Change:** persist on the input's `change` event through a `setCountdown()` setter.

### B22 [Low] Card-header placeholders do not match the first example
- **Where:** `index.html:78-80` shows "cpython / Lib / functools.py / 08 lines"; the first item is `asyncio/runners.py` with 9 lines → visible flash of wrong content.
- **Change:** leave the three fields empty in HTML (they are filled on first render) or make them match.

### B23 [Low] The theme toggle sits next to the brand instead of at the right edge
- **Where:** `styles.css:56` (`.topbar` has `gap: 58px` but no `justify-content`); `styles.css:60-62` (`nav { flex: 1 }` — no `<nav>` exists in the HTML, so the rule that used to push the actions right is dead).
- **Change:** `.topbar { justify-content: space-between }` (or `.topbar-actions { margin-left: auto }`); delete the `nav` rules. Confirm D6.

### B24 [Low] The six `.import-button` buttons have no pointer cursor
- **Where:** `styles.css:93-96` (only `.theme-toggle`, `summary`, `select` and `.restart` set `cursor: pointer`).
- **Change:** add `cursor: pointer` to the shared button class.

### B25 [Low] Timer-indicator label mismatch and unsupported ARIA usage
- **Where:** `index.html:93` says "Timer inactive"; `app.js:107` writes "Timer idle"; `aria-label` on a bare `<i>` is not announced by screen readers.
- **Change:** make the indicator `aria-hidden` and put the timer state into the live status line (A3).

### B26 [Low] Restart blurs the input, forcing another click
- **Where:** `app.js:212-221` (`render()` → `exitChallengeMode()` → `blur()`, then two more blurs).
- **Change:** Restart → `ready` state with the input focused (same as Start with a 0 s countdown).

### B27 [Low] Highlighting precedence depends on rule order plus stable sort; comment markers inside strings leak
- **Where:** `app.js:116-124`, `app.js:140-143`.
- **What happens:** overlapping ranges are resolved by "earliest start wins, then insertion order". `s = "#x" + foo()` colours `+ foo()` as a comment because the `#` rule matched to end of line from inside the string. `if (` matches both the keyword and function rules and only works because the keyword rule happens to be pushed first.
- **Change:** a single left-to-right tokenizer: at each position try all rules, take the earliest (then longest) match, consume it, continue. No overlaps by construction; output a `classByIndex` array (P1).

---

## 3. UX and product gaps

- **U1 The cursor is invisible on whitespace.** A newline inside a `<span>` (`app.js:152`) has no width, so when the next key is Enter there is no cursor; a tab cursor is a wide block. Render `↵` for newline, `·` for space and `→` for tab at the current index (faint, `aria-hidden`) while keeping the real character for width.
- **U2 No results screen and no history.** On completion show WPM, accuracy, time, error count; store the last 20 runs and the best WPM per snippet id; show "best" in the stats row.
- **U3 Escape controls are undiscoverable.** Nothing on screen says Escape pauses or that Escape twice restarts. Put per-state hints in the status line (`RUNNING · ESC TO PAUSE`, `PAUSED · ANY KEY TO RESUME · ESC ESC TO RESTART`) and in "How it works".
- **U4 The GitHub URL box appears far from the button that opened it.** The button is inside the Options dropdown (`index.html:53`), the box is in the controls row (`index.html:68-71`), and the dropdown closes on the next click. Move the URL form into the options panel or a `<dialog>`.
- **U5 Accuracy is "current buffer correctness" and can be gamed with Backspace.** Track keystrokes and errors (corrected and uncorrected) per run and show real accuracy (or both figures).
- **U6 Four snippets, three languages.** JavaScript/TypeScript, Go, Java, C#, Shell, JSON/YAML all fall to `generic`. Add rule sets and at least one snippet each (D3).
- **U7 Auto-indent option.** After Enter, insert the next line's leading whitespace automatically (default on; off = hard mode). Removes most of the friction of the strict policy (B2).
- **U8 Restart always re-rolls the random start.** Offer "Retry same start" and "New start".
- **U9 Entering challenge mode jumps the layout and locks scrolling.** The `pre` grows 250 → 390 px (`styles.css:44-47`), the card scales 1.035 (`styles.css:37`), and `body { overflow: hidden }` (`styles.css:23`) makes the stats and Restart unreachable on short viewports (phones in landscape, small laptops). Use a stable height such as `min(390px, 50dvh)`, drop or reduce the scale, and do not lock scroll (or only on tall viewports).
- **U10 Icons are Unicode symbols.** `⚡ ⌘ ▶ ↝ ↻ ☾ ☀ ＋` render as emoji or missing glyphs on some platforms; `⌘` (the Mac Command key) is used for "GitHub" and as a repo icon. Use inline SVG icons with `aria-hidden`.
- **U11 No way to forget imported code.** Add "Forget import" (clears storage, disables the custom option). See R6.
- **U12 The Load button has no loading text**, only `disabled`. Show "Loading…".
- **U13 The Options `<details>` does not close on Escape or on Start.** After pressing Start inside the panel, the panel stays open and overlaps the card header once the challenge ends. Close it on Start and on Escape (menus take precedence over challenge Escape handling).
- **U14 Copy contradicts behaviour** (`index.html:105`) — fix together with B2/D2.
- **U15 No auto-pause when the tab is hidden.** Pause on `visibilitychange` or window `blur` while running.
- **U16 Random start on an indented line** — covered by B8 (prefer top-level lines) and U7.

---

## 4. Accessibility

- **A1 Keyboard trap.** The Tab handler (`app.js:293`) intercepts Shift+Tab as well, and Escape does not blur when idle, so a keyboard-only user cannot leave the textarea (WCAG 2.1.2). Let Shift+Tab pass; make Escape blur when the status is `idle` or `complete`.
- **A2 Nested text boxes and a hidden target.** `div.code-window` has `role="textbox"` and `tabindex="0"` around a real `<textarea>` (`index.html:83-86`); the `<pre>` is `aria-hidden`. Remove role/tabindex from the wrapper; add `aria-describedby` on the textarea pointing to a visually-hidden instruction; consider exposing the target text so screen-reader users can read what to type.
- **A3 No live regions.** Make `#typing-status` `role="status"`; announce completion results; give the progress track `role="progressbar"` with `aria-valuenow/min/max`.
- **A4 Contrast failures in the light theme.** Measured WCAG ratios (AA needs 4.5:1 for text, 3:1 for focus indicators):

| Element | Colours | Ratio | Verified replacement |
|---|---|---|---|
| `--muted` text on `--paper` (labels, lede) | `#7b8178` / `#f4f5f0` | 3.65 | `--muted: #646a61` → 5.08 |
| `--muted` on `--card` | `#7b8178` / `#fbfcf8` | 3.88 | same → 5.40 |
| Untyped `.char` on code background | `#687467` / `#eef0eb` | 4.27 | `#5b665a` → 5.24 |
| `pre` default text | `#737d72` / `#eef0eb` | 3.73 | `#5f6a5e` → 4.93 |
| `.code-header small`, `.click-hint` | `#778174` / `#eef0eb` | 3.53 | `#5f6a5e` → 4.93 |
| `.syntax-comment` | `#6b7b68` / `#eef0eb` | 3.93 | `#5c6c59` → 4.89 |
| `.repo-icon` glyph | `#75925c` / `#e9efe3` | 2.98 | `#55703f` → 4.75 |
| Focus outline on the code window | `#b9f24f` / `#f0f4eb` | **1.19** | `--green-dark #47631b` → 6.14 |

  The dark theme passes everywhere (lowest pair 5.01). Re-verify with a contrast checker after Phase 6.
- **A5 Text at 9–10 px**: `.eyebrow`, `.control-label`, `.stat-label`, `.option-label`, `.line-count`, `.click-hint`, `.code-header small`. Raise to ≥ 11 px (12 px preferred).
- **A6 No `prefers-reduced-motion` handling.** The body shake (`styles.css:48-55`), indicator pulse (`styles.css:192-195`) and scale/blur transitions must be disabled under `@media (prefers-reduced-motion: reduce)`.
- **A7 Visible labels are `<span>`s.** Use `<label for="source-select">` instead of `aria-label` + span (`index.html:36-38`); group option rows in `<fieldset>`/`<legend>`.
- **A8 Decorative `<i>` elements** for the indicator and progress bar → `<span aria-hidden="true">` and a `role="progressbar"` element.
- **A9 iOS auto-zoom on focus.** The hidden textarea has the UA default font size (< 16 px), so iOS Safari zooms the page when it is focused. Set `font-size: 16px` on `#typing-input`.
- **A10 Keyboard shortcut to restart** (Ctrl/Cmd+Enter) so keyboard users never need the mouse.
- **A11 Icon glyphs must be `aria-hidden`** and buttons must keep text labels when moving to SVG icons (U10).

---

## 5. Performance

- **P1 Full re-render on every keystroke, O(n·m).** `updateDisplay()` (`app.js:144-161`) rebuilds `innerHTML` for every character and calls `syntaxClassAt()` (`app.js:140-143`), a linear search over all ranges, per character. A 300-line import (~10 k chars, ~2 k ranges) means ~20 M comparisons plus parsing 10 k spans per keystroke — visible lag. **Change:** precompute `classByIndex` once per render (B27); build the spans once and keep them in an array; on input, patch only indices in `[min(prevLen, newLen), max(prevLen, newLen)]` plus the cursor; set text with `textContent` (removes `escapeHtml`).
- **P2 Layout reads and DOM lookups in hot paths.** `getComputedStyle` per keystroke (`app.js:156`); `document.querySelector` inside `updateStats()` (five lookups every 250 ms and on every key), `updateDisplay()`, `setTimerState()`, `render()`. Cache all element references once (Q11) and the line height once per render.
- **P3 Stats recount on every tick.** `updateStats()` rescans the typed text every 250 ms even when nothing changed. Count once per input event; the tick updates only time and WPM.
- **P4 `hasTypingError()` rescans on every keystroke** (`app.js:305-310`) — derive from the error count kept by P3.
- **P5 Fonts from the Google CDN** are render-blocking CSS (mitigated by `display=swap`). Self-hosting with `@font-face` + `<link rel="preload">` also fixes offline use and H13.

---

## 6. JavaScript code quality and maintainability

- **Q1 Global classic script** (`index.html:111`): top-level functions become `window` properties; no strict mode. Switch to `<script type="module">` and ES modules.
- **Q2 State is twelve loose variables** (`app.js:25-30`) plus the DOM used as state (`document.body.classList.contains("punishment-enabled")` at `app.js:313` is the source of truth for a setting) plus the `<select>` value. Modes are implied by combinations of `startedAt`, `paused`, `done`, `countdownTimer`. Replace with one state object and an explicit `status` (§10.2).
- **Q3 `render()` does two jobs**: resets the lifecycle (timers, flags, focus, body classes) and draws the target. Split into `resetChallenge()` and `renderTarget()` / `renderStats()` / `renderStatus()` / `renderControls()`.
- **Q4 Six reset paths with different subsets**: `render()` (75-82), `restartChallenge()` (212-221), `startChallenge()` (223-226), `beginChallenge()` (249-254), `stopChallenge()` (271-273), `pageshow` (417-424). One `clearTimers()` and one RESET transition.
- **Q5 Six status writers** (B6).
- **Q6 Toggle logic duplicated** between the click handlers (`app.js:320-334`) and init (`app.js:397-403`); only the theme has a setter. Add `setPunishment()`, `setRandomStart()`, `setCountdown()`, `setTheme()` that update state, DOM and storage, used from both places.
- **Q7 Data duplicated three times**: `snippets` (`app.js:1-8`) holds repo/path/icon/code; `examples` (`app.js:31-36`) repeats repo/path/icon and reads only `.code`; the `<select>` options (`index.html:39-43`) repeat the ids and add labels. Keep one `EXAMPLES` array (`id, label, language, repo, path, icon, code`) in a data module and generate the `<option>`s from it.
- **Q8 `syntaxRules.generic` is attached after a function** (`app.js:125-132`), away from the other rules. Move it into the rules object; share the common comment/string/number/function rules via small helpers instead of repeating them four times.
- **Q9 Duplicate rule entries**: `nullptr` in both C++ keyword and literal lists; `bool` in both keyword and type (`app.js:53-55`).
- **Q10 Redundant variables**: `source` (`app.js:25`) is written five times and read once at init — derive it from `currentItem.id`; `language` is only used inside `render()` — make it a field set once per target.
- **Q11 DOM references half cached, half re-queried** (`app.js:10-24` vs the `document.querySelector` calls inside functions). One `els` object created at boot; throw a clear error if an id is missing.
- **Q12 Magic numbers**: 250 ms stats tick, 450 ms double-Escape window, 750 ms shake, 60 s max countdown, 5 chars per word, 4-space tab. Name them in `constants.js`.
- **Q13 Storage**: five repeated key literals (`codetype-*`), raw `localStorage` calls that throw in private mode or on quota, `JSON.parse` without try/catch at `app.js:337`, and no shape check on the saved import (a record without `code` makes `render()` throw at `app.js:85`). Add a `storage` module: `get/set/remove` with try/catch, `KEYS`, JSON helpers, a `version` field on the saved import, and a validator/migrator.
- **Q14 Formatting and lint issues**: multiple statements per line (`app.js:285, 346`), 200+-character lines (`app.js:3-7, 25`), `const start` shadows the `start()` function (`app.js:295`), unparenthesized `||`/`&&` mix (`app.js:379`), listener registration scattered between function definitions (`app.js:259, 303-304`). Adopt Prettier + ESLint (`no-shadow`, `no-mixed-operators`, `prefer-const`, `eqeqeq`).
- **Q15 Zero comments.** Add a header comment per module and doc comments for the state machine, whitespace policy, tokenizer contract and storage schema. Optional: `// @ts-check` with JSDoc types (no build change) or TypeScript (Vite supports it natively).
- **Q16 `Date.now()` for elapsed time** (`app.js:184, 206, 262, 278`) — use `performance.now()` (monotonic).
- **Q17 Hidden side effect**: `render()` assigns `currentItem` via `activeSnippet()` (`app.js:83-84`). Use an explicit `selectItem(item)`.
- **Q18 `alert()` for errors** (`app.js:361, 375`) — inline error component.
- **Q19 The input handler mixes concerns** (`app.js:276-288`): resume-from-pause, start, overflow trim, render, punishment, completion. Move to a thin controller `handleInput()` that dispatches to the state machine; subscribers render.
- **Q20 No tooling, tests, README or version control.**

---

## 7. CSS

- **C1 Two theming systems.** Tokens exist (`styles.css:1-20`) but ~40 hard-coded hex values are used for controls, the code area and syntax colours, so dark mode needs ~60 lines of `body.dark …` overrides (`styles.css:57, 88, 91, 104-174, 181-183, 186`). Define semantic tokens in `:root` — `--sans`, `--control-bg`, `--control-border`, `--control-text`, `--control-hover-bg`, `--control-active-bg/-border/-text`, `--code-bg`, `--code-bg-focus`, `--code-text`, `--focus`, `--accent`, `--accent-strong`, `--danger`, `--correct-fg/-bg`, `--incorrect-fg/-bg`, and `--syn-keyword`, `--syn-string`, `--syn-comment`, `--syn-number`, `--syn-literal`, `--syn-function`, `--syn-type`, `--syn-decorator`, `--syn-preprocessor`, `--syn-macro` — and let `body.dark` override **token values only**. Delete the override blocks.
- **C2 Dead rules** (no matching markup): `nav`, `nav a`, `nav a.active` (60-62); `footer` (28, 196, and inside the media query); `kbd` (196); all `.language*` rules (parts of 93-96, 104, 142-147, 151, 159-164); `.segmented` (92). Remove.
- **C3 Formatting.** Several rules per line (73, 92, 177-178, 184-186, 189, 196, 201-202), stray leading spaces (179-183), no sections. Prettier, one declaration per line, section comments (tokens / base / topbar / hero / controls / options / practice card / code window / stats / explanation / responsive / motion). Optionally split into files.
- **C4 Redundant rules.** `body.dark .theme-toggle` styled twice (104-110 and 136-141); `body.dark .restart { margin-left: auto }` (168-170) repeats 189; the selector list at 118-125 includes `body.dark` variants that 126-135 immediately override; `select` border colour set at both 93 and 99.
- **C5 No sans-serif token.** `font: 12px "Space Grotesk"` shorthand without a fallback at 78, 80, 93, 99, 189 (falls back to the browser's default serif if the web font fails). Add `--sans: "Space Grotesk", system-ui, sans-serif` and use it everywhere.
- **C6 Misleading names.** `--green` is orange (`#d29922`) in dark mode → rename `--accent`/`--accent-strong`. `.topbar` hard-codes the paper colour as rgba (56-57) → `color-mix(in srgb, var(--paper) 88%, transparent)`.
- **C7 Global element selectors** (`pre`, `select`, `h1`, plus dead `nav`, `footer`) → scope with classes (`.code-display`, `.select`).
- **C8 ID selectors for styling** (`#github-button`, `#punishment-toggle`, `#random-start-toggle`, `#typing-input`, `#timer-indicator`, `#progress-bar`) → classes/modifiers (`.btn--wide`, `.btn--toggle`).
- **C9 `.import-button` is the generic button class** (also used by Start, Load and both toggles). Rename to `.btn`; add `cursor: pointer` (B24).
- **C10 Duplicated magic numbers**: code padding 68 px (179) and `.click-hint left: 68px` (188), 22 px in the media query → `--code-pad-x`.
- **C11 Weight change on typed characters** (`.char.correct/.incorrect { font-weight: 500 }`, 185-186) can change glyph advance in some fonts and make text jitter. Use colour/background only.
- **C12 Focus ring** hard-coded `#58a6ff` (197); the code window's focus outline fails contrast (A4). Use `--focus`.
- **C13 No reduced-motion block** (A6).
- **C14 Challenge-mode layout** (U9): overflow lock (23), scale (37), `pre` height jump (44-47); target `.code-display` instead of bare `pre`.
- **C15 Responsive.** One breakpoint only (700 px, line 202). `.options-panel { min-width: 590px }` (84) is fixed → `min(590px, calc(100vw - 2rem))`; add a ~900 px step for the controls row.
- **C16 `.restart:first-letter` hack** (189) to colour the icon → wrap the icon in `<span aria-hidden>`.
- **C17 `#typing-input`** needs `font-size: 16px` (A9); keep `opacity: 0`.
- **C18 Small text** (A5). **C19 Contrast** (A4).
- **C20 Body colour transition** (22) animates the wrong-theme flash (B19); keep the transition, fix the flash.
- **C21 Focus styles missing** for `summary`, `#github-url`, `#countdown-seconds` (UA default only) → unify with `--focus`.
- **C22 `body.dark select option`** (171-174) has limited browser support — harmless, keep or drop.

---

## 8. HTML

- **H1** Wrapper `role="textbox"`/`tabindex`, `<pre aria-hidden>` (A2).
- **H2** `type="button"` missing on `#import-button`, `#github-button`, `#github-load` (52, 53, 70).
- **H3** `accept="*/*"` on the file input (67) is meaningless — remove it.
- **H4** `<span class="control-label">` → `<label for="source-select">`; drop the duplicate `aria-label` on the select (36-38); wrap option rows in `<fieldset><legend>`.
- **H5** Placeholder header values (B22).
- **H6** Missing `<noscript>` notice, `<meta name="description">`, `<meta name="color-scheme" content="light dark">`, `<meta name="theme-color">`.
- **H7** Decorative `<i>` elements (93, 94) → `<span aria-hidden="true">`; the progress track → `role="progressbar"`.
- **H8** `#typing-status` → `role="status"`.
- **H9** GitHub import → `<form>` with `inputmode="url"`, submit on Enter, an `<output>`/error element.
- **H10** `<script src="app.js">` → `<script type="module" src="src/main.js">`; add the inline head theme script (B19).
- **H11** `<option>`s generated from data (Q7); the `custom` option `disabled` until an import exists (B11).
- **H12** `<pre translate="no">` so browser translation never rewrites code.
- **H13** Google Fonts: a third-party request on every load (privacy — a German court ruled Google Fonts embedding a GDPR violation in 2022) and no offline fallback. Self-host DM Mono and Space Grotesk under `fonts/` with `@font-face` and `font-display: swap` (D5).
- **H14** Unicode-symbol icons (U10).
- **H15** Optional `<meta http-equiv="Content-Security-Policy">` allowing `'self'`, the font hosts (until self-hosted) and `https://raw.githubusercontent.com` in `connect-src` (R5).
- **H16** `favicon.svg` is fine; optionally add a PNG/`apple-touch-icon` fallback and convert the `<text>` to a path so it renders identically everywhere.

---

## 9. Robustness, security, privacy

- **R1** XSS: current escaping is correct. The incremental renderer should use `textContent` per span so no HTML string building remains.
- **R2** Storage exceptions unhandled (B13, Q13).
- **R3** Fetch: only `github.com` URLs are accepted (good — keep a host allow-list); add an `AbortController` timeout.
- **R4** Saved import shape unvalidated (Q13): validate `{ version, id, filename, repo, path, icon, raw }` and migrate or discard old records.
- **R5** Optional CSP (H15).
- **R6** Imported (possibly proprietary) code stays in localStorage indefinitely — add "Forget import" (U11) and say so in the UI.
- **R7** Binary/huge file guard (B13).
- **R8** Untypeable characters (BOM `﻿`, NBSP ` `, zero-width `​-‍`, curly quotes in prose) — strip/replace during normalization and warn about anything left that cannot be typed on a standard keyboard.

---

## 10. Architecture

### 10.1 Assessment of the current structure

- **One 425-line global script.** DOM refs, data, rules, state, rendering, event handling and boot share one scope with no sections.
- **Implicit state machine.** Six user-visible modes are encoded as combinations of four variables; every lifecycle function re-implements part of the reset; the DOM (body classes, select value, button text) is read back as state.
- **`render()` is overloaded.** It resets the session *and* draws the target, so any data change (choosing a source, toggling random start) also resets the session and blurs the input, and every reset re-rolls the random start.
- **O(n·m) rendering** that cannot scale to real files (P1).
- **Lossy, language-agnostic import pipeline.** Raw text is discarded at import time (B4) and the language is detected after the fact.
- **Duplicated data** (Q7) and **two theming systems** (C1).
- **No module boundaries**, so nothing is unit-testable without a browser.

### 10.2 Target architecture (still vanilla JS, no framework)

```
CodeType/
├─ index.html
├─ styles/                    (or one styles.css with these sections)
│  ├─ tokens.css              :root and body.dark token values only
│  ├─ base.css                reset, typography, .btn, inputs, focus ring
│  ├─ layout.css              topbar, hero, controls, options panel, explanation, responsive
│  ├─ code.css                practice card, code window, .char states, syntax classes, cursor glyphs
│  ├─ stats.css               stats row, timer indicator, progress bar, results panel
│  └─ motion.css              animations + prefers-reduced-motion
├─ src/
│  ├─ main.js                 boot: build els, load settings, bindEvents(), initial render
│  ├─ constants.js            timings, limits, STORAGE keys, status texts
│  ├─ state.js                createStore(): state object, STATUS enum, transition(), subscribe()
│  ├─ timer.js                stopwatch: start/pause/resume/reset/elapsedMs (performance.now)
│  ├─ typing.js               pure: toChars(), charStates(), smartTab(), autoIndent(), isComplete()
│  ├─ stats.js                pure: computeStats(targetChars, typedChars, counts, elapsedMs)
│  ├─ syntax/
│  │  ├─ languages.js         rule sets, extension → language map, generic fallback
│  │  └─ tokenize.js          pure: tokenize(text, lang) → classByIndex (one pass, no overlaps)
│  ├─ import/
│  │  ├─ normalize.js         pure: normalizeSource(text) → { text, warnings }
│  │  ├─ comments.js          pure: stripCommentLines(text, lang) via tokenizer comment ranges
│  │  ├─ github.js            pure parseGitHubUrl(); fetchGitHubFile() with timeout
│  │  └─ local.js             readLocalFile(file, limits)
│  ├─ storage.js              safe get/set/remove, JSON helpers, saved-import schema + migrate
│  ├─ data/examples.js        EXAMPLES array — single source of truth; drives the <select>
│  └─ ui/
│     ├─ dom.js               query every element once; assert presence
│     ├─ renderTarget.js      build spans once; patch(from, to); cursor glyphs; scroll follow
│     ├─ renderStats.js  renderStatus.js  renderControls.js  theme.js
├─ tests/                     Vitest: tokenize, normalize, comments, github, stats, typing, state
├─ fonts/                     self-hosted DM Mono + Space Grotesk (Phase 6, D5)
├─ package.json  vite.config.js  eslint.config.js  .prettierrc  .editorconfig  .gitignore  README.md
```

**State machine** (the core of the refactor)

- Status values: `idle`, `countdown`, `ready`, `running`, `paused`, `complete`.
- Transitions:
  - `idle` → `countdown` (Start with seconds > 0) · `idle` → `ready` (Start with 0 s, Restart, click into the window) · `idle`/`ready` → `running` (first accepted keystroke)
  - `countdown` → `ready` (timer reaches 0) · `countdown` → `idle` (Escape, Restart, source change)
  - `running` → `paused` (Escape, tab hidden) · `paused` → `running` (typed key, or Escape) · `running` → `complete` (typed equals target)
  - any → `idle` (Restart, Escape twice, source or option change, `pageshow` restore)
- Each transition is the **only** place that starts/stops timers, sets `readOnly` on the textarea, toggles `challenge-active`, and focuses/blurs. Subscribers then re-render status, stats, controls, and — only when `target` changed — the code display.
- Input is accepted only in `ready`, `running` and `paused` (where it resumes).

**State shape** (one object): `status`, `item` (selected example or import), `target` + `targetChars`, `typedChars`, `startLine`, `classByIndex`, `charStates`, `counts { correct, errors, keystrokes, corrections }`, `timer`, `countdownRemaining`, `settings { punishment, randomStart, countdownSeconds, autoIndent, skipComments, theme }`, `lastResult`, `history`.

**Data flow.** DOM event → thin controller handler → `store.transition()` / `store.update()` → subscribers render. Pure modules (`typing`, `stats`, `tokenize`, `normalize`, `comments`, `github`) never touch the DOM and are unit-tested.

**Rendering contract.** `renderTarget.build()` on target change (once); `renderTarget.patch(from, to)` on input; cursor glyphs for whitespace; scroll via `offsetTop`.

**Serving and build (D1).** ES modules need HTTP. Recommended: Vite — `npm run dev` for development, `npm run build` for a static `dist/` deployable anywhere. If a no-tooling single file is a hard requirement, bundle `src/main.js` to `app.js` (IIFE) with esbuild and keep `index.html` loading `app.js`.

---

## 11. Implementation plan (ordered)

Each step lists what to do, the IDs it resolves, and an acceptance check. Do not skip Phases 0–1: every later phase depends on the module split and the tests. Commit after every numbered step.

### Phase 0 — Safety net (no behaviour change)

1. `git init`; add `.gitignore` (`node_modules/`, `dist/`, `.DS_Store`); commit the current four files as the baseline.
2. Add `package.json` with dev dependencies `vite`, `vitest`, `jsdom`, `eslint` (flat config: `js.configs.recommended` plus `no-shadow`, `no-mixed-operators`, `prefer-const`, `eqeqeq`) and `prettier`. Scripts: `dev`, `build`, `preview`, `test`, `lint`, `format`. Add `.editorconfig` and `.prettierrc`.
3. Run Prettier over `index.html`, `styles.css`, `app.js` and commit as "format only" (C3, Q14 formatting). Line numbers in this document are stale from here on.
4. README skeleton: what the app is, how to run (`npm run dev`), how to test.
   - **Acceptance:** `npm run dev` serves the app unchanged; `npm run lint` reports only the issues listed in Q14.

### Phase 1 — Mechanical modularization (behaviour preserved)

5. Create the `src/` tree from §10.2 and move code **verbatim** into modules: DOM refs → `ui/dom.js` as one `els` object that asserts every id exists (Q11); snippet data → `data/examples.js` as one `EXAMPLES` array with `label`, delete `snippets` (Q7); rules including `generic` → `syntax/languages.js` (Q8, Q9); `codeOnly` → `import/comments.js` (temporary, replaced in Phase 5); storage calls → `storage.js` with `KEYS`, try/catch and JSON helpers (Q13, R2); magic numbers → `constants.js` (Q12); listener registration → `bindEvents()` and init code → `init()` in `main.js` (Q14 scattering).
6. Switch `index.html` to `<script type="module" src="src/main.js">` (Q1, H10). Generate the `<select>` options from `EXAMPLES` at boot; keep the `custom` option and render it `disabled` when there is no saved import (H11, B11).
7. Fold in the trivial fixes: `.topbar` justify + delete `nav` rules (B23), `cursor: pointer` on the button class (B24), empty card-header placeholders (B22), `type="button"` on the three buttons (H2), remove `accept="*/*"` (H3).
8. Vitest characterization tests for the pure modules **as they behave now**: `formatTime`, `detectLanguage`, `buildSyntaxRanges` (precedence cases from B27), `codeOnly` (encode the B4 cases as `test.fails`/`test.todo` so they flip to passing in Phase 5).
   - **Acceptance:** the app behaves identically to the baseline; `npm test` is green; `npm run lint` is clean apart from rules deliberately deferred.

### Phase 2 — State machine and lifecycle

9. Implement `state.js` (STATUS enum, `transition()`, `subscribe()`) and `timer.js` on `performance.now()` per §10.2 (Q2, Q16).
10. Replace `render()`, `restartChallenge()`, `startChallenge()`, `beginChallenge()`, `stopChallenge()`, `pauseChallenge()` and the `pageshow` handler with transitions; one `clearTimers()`; split `render()` into `resetChallenge()` + `renderTarget()` / `renderStats()` / `renderStatus()` / `renderControls()` (Q3, Q4, Q17, Q19, B14, B15).
11. `renderStatus()` from a status → text table; delete all direct writers; the focus handler only dispatches (B6, Q5). Include the Escape hints in the texts (U3).
12. Countdown: textarea `readOnly` while `countdown`; Escape cancels; input ignored (B3, B7).
13. Completion: `complete` status freezes the timer, sets the indicator, makes the textarea read-only, exits focus mode, adds visible `.complete` styling (B5).
14. Restart → `ready` with focus (B26); Escape toggles pause/resume per D4; Escape when idle/complete blurs (A1 part); auto-pause on `visibilitychange` (U15); close the options panel on Start and Escape (U13).
15. Settings setters `setPunishment / setRandomStart / setCountdown / setTheme` used by both init and handlers; settings live in state, not in body classes (Q6); persist countdown on change (B21).
16. Tests: transition table (every status × every event → expected status and side-effect flags).
   - **Acceptance (manual):** start with a 3 s countdown → typing is ignored → Escape once cancels. Run → Escape pauses → Escape resumes. Finish a snippet → indicator stops, stats freeze, Backspace is inert, a visible complete state appears. Restart focuses the window.

### Phase 3 — Typing semantics

17. `typing.js`: `toChars()` via `Array.from`; a single `charState(i)` used by display, stats, punishment and completion (B2, B10); strict whitespace policy (D2); `smartTab(target, caret)` returns the exact expected whitespace run or nothing (B1); `autoIndent` after Enter behind a setting, default on (U7); caret pinned to the end; `paste`/`drop` blocked; Shift+Tab passes through (B16, B17, A1).
18. Cursor glyphs for newline/space/tab at the current index (U1).
19. `stats.js`: pure `computeStats()`; counts maintained per input event; the tick updates only time and WPM; WPM shown after 1.5 s; keystroke/error tracking for real accuracy (P3, P4, B18, U5).
20. Update the "How it works" copy to the implemented policy (U14).
21. Tests: `charState`, `smartTab` (2-space, 4-space, tab, mid-line, non-whitespace at caret), `autoIndent`, `computeStats`, astral characters.
   - **Acceptance:** the C++ example completes using only Tab for indentation; a wrong space shows red; pasting does nothing; arrow keys do not move the caret.

### Phase 4 — Tokenizer and rendering performance

22. `syntax/tokenize.js`: one-pass tokenizer over the **full** text producing `classByIndex`; earliest (then longest) match wins; no overlaps (B27). Extend the extension map (U6 start).
23. Random start: tokenize the full text and offset by the start index; minimum remaining lines; prefer zero-indent lines; "Retry same start" (B8, U8).
24. `ui/renderTarget.js`: build spans once with `textContent`, keep references, `patch(from, to)` on input, scroll via `offsetTop`, cached line height, no `getComputedStyle` per key (P1, P2, B9, R1).
25. Rule sets and one snippet each for JavaScript/TypeScript, Go, Java, Shell — or wire a Prism adapter; record the D3 decision in the README (U6).
26. Tests: tokenizer precedence (`#` inside a string, `if (` keyword vs function, unterminated docstring after an offset), offset correctness. **Manual:** import a 500-line file and confirm keystroke handling stays under ~16 ms in the DevTools Performance panel.

### Phase 5 — Import pipeline

27. `import/normalize.js` (BOM, CRLF, NBSP/zero-width, trailing whitespace, blank-line collapse, untypeable-character report) and `import/comments.js` using tokenizer comment ranges; "Skip comments" setting applied at render time from the stored raw text; saved-import schema v2 with migration of the old record (B4, R4, R8).
28. Size cap / line-range picker / binary detection; an inline error component replacing every `alert()` (B13, R7, Q18).
29. `import/github.js`: `parseGitHubUrl()` (blob, raw, raw.githubusercontent, `#L` ranges, query/hash strip, trim), fetch with an `AbortController` timeout, `<form>` submit on Enter, loading text, hide + clear on success; move the form into the options panel or a `<dialog>` (B20, U4, U12, H9, R3).
30. Local file: reset `value`, handle `onerror` (B12). "Forget import" button; the custom option enabled/disabled accordingly (U11, R6, B11).
31. Tests: normalize (every B4 case must now pass), `stripCommentLines` per language, `parseGitHubUrl` matrix.
   - **Acceptance:** the six B4 inputs survive intact; a `#L10-L20` URL imports exactly those lines; the same file can be re-imported twice in a row; a 10 MB file is refused with a message.

### Phase 6 — CSS architecture, theming, motion, responsiveness

32. Token layer (`tokens.css`) with the semantic names from C1; convert every hard-coded colour; `body.dark` overrides tokens only; delete the override blocks; rename `--green` → `--accent`; add `--sans`, `--focus`, `--code-pad-x` (C1, C5, C6, C10, C12).
33. Apply the verified contrast values from A4; raise 9–10 px text to ≥ 11 px (A4, A5, C18, C19).
34. `motion.css` with `prefers-reduced-motion` (A6, C13); challenge mode without scroll lock or scale and with a stable `pre` height (U9, C14).
35. Scope selectors, classes instead of IDs, `.btn` rename, remove the `first-letter` hack, drop the weight change, `#typing-input { font-size: 16px }` (C7, C8, C9, C11, C16, C17, A9).
36. Head inline theme script + `prefers-color-scheme` + `color-scheme` meta; persist the theme only on toggle (B19, H6).
37. Second breakpoint (~900 px), fluid options-panel width (C15); delete any remaining dead rules (C2); unify focus styles (C21).
38. Optional per D5: self-host fonts with `@font-face` and preload (H13, P5).
   - **Acceptance:** layout unchanged at 1280 / 900 / 700 / 375 px; a contrast checker shows ≥ 4.5:1 for all text and ≥ 3:1 for focus indicators in both themes; with "Reduce motion" enabled nothing shakes or pulses; a dark-theme reload shows no light flash.

### Phase 7 — Accessibility and semantics

39. Remove `role="textbox"`/`tabindex` from the wrapper; `aria-describedby` on the textarea; decide whether to expose the target text (A2, H1). `role="status"` on the status line; `role="progressbar"` on the track; decorative `<span aria-hidden>` instead of `<i>` (A3, A8, H7, H8, B25).
40. `<label for>` / `<fieldset>`; `<noscript>`; meta description and theme-color; `translate="no"` on the code display (A7, H4, H6, H12).
41. Inline SVG icons with `aria-hidden`, replacing the Unicode symbols (U10, A11, H14).
42. Keyboard: Ctrl/Cmd+Enter restarts; Escape closes the options menu before anything else (A10, U13).
43. Manual pass with VoiceOver (macOS) and keyboard only; record the results in the README.

### Phase 8 — Product enhancements (optional, after Phases 0–7)

44. Results panel + history and best per snippet (U2).
45. More snippets per language (U6).
46. Optional CSP meta (R5, H15) and favicon fallbacks (H16).

### Phase 9 — Documentation and final verification

47. README: architecture overview (§10.2), state-machine table, whitespace/Tab policy, keyboard shortcuts, import rules and limits, known limitations (branch names containing `/`), how to add a language or a snippet.
48. Full manual checklist:
   - The C++ example completes with Tab-only indentation (B1).
   - A typed space where a letter belongs turns red (B2).
   - Typing during the countdown is ignored; a single Escape cancels it (B3, B7).
   - Completion: indicator stops, stats frozen, Backspace inert, visible complete state (B5).
   - A file containing `*ptr = x;`, `#include`, `#[derive]` and `"src/*.ts"` imports with every line intact (B4).
   - The same file imports twice in a row (B12); a 10 MB file is refused (B13).
   - A GitHub URL with `#L10-L20` loads exactly those lines (B20).
   - Dark-theme reload shows no light flash (B19).
   - Shift+Tab leaves the textarea; Escape when idle blurs (A1).
   - A 500-line import types smoothly (P1).
   - Reduced motion: no shake or pulse (A6). Contrast ≥ 4.5:1 for text (A4).
   - `npm test`, `npm run lint` and `npm run build` all pass.
