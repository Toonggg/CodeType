# CodeType — Bugs and Performance TODO

Review of the current code (`src/`, `styles/`, `index.html`, `vite.config.js`) on 2026-11-18.
`fixed.md` is an older review of the pre-refactor single-file app; its IDs (B1, P1, …) are
referenced in code comments. To avoid confusion, this file uses the prefixes **BUG-** and
**PERF-**.

Baseline at review time: `npm test` passes (15 files, 333 tests); `npm run lint` is clean.
Every finding marked **verified** was reproduced with a script against the real modules
(see "Repro" in each item). Line numbers are as of commit `52aa560`.

Severity: **[High]** crash, freeze or bricked app · **[Medium]** wrong behaviour users will
notice · **[Low]** edge case, polish or a small cost.

## Suggested order

1. BUG-1 + BUG-2 (an empty practice document crashes and can stop the app from booting)
2. PERF-1 (quadratic tokenizer, multi-second freezes)
3. PERF-2 (no character cap, so one-line minified files build ~1M DOM spans)
4. BUG-3 (an import failure leaves inconsistent state)
5. Everything else. BUG-4, BUG-5 and BUG-9 need a decision from the owner first (noted
   in each item).

For every fix: add a regression test next to the existing tests in `tests/`, and keep
`npm test` and `npm run lint` green.

---

## Bugs

### BUG-1 [High] An empty practice document crashes with random start on, persists, and then stops the app from booting (verified)

- **Where:** `src/practice.js:73-86` (`chooseStartLine`), `src/practice.js:40-66` (`selectLines`),
  `src/app.js:88-93` (boot), `src/app.js:443-465` (`setRange`), `src/typing.js:86-88` (`isComplete`).
- **What happens:** `selectLines` can return zero lines. This happens when the range covers
  only blank lines, which includes picking the phantom last line from BUG-2. It also happens
  when a GitHub link has `#L10` and line 10 is blank. Then:
  - With **random start on**, `chooseStartLine([])` computes `needed = 0`, enters the loop
    with `i = 0` and reads `lines[0].text`, which throws
    `TypeError: Cannot read properties of undefined (reading 'text')`.
  - `setRange` writes the new range to localStorage (`app.js:454`) **before**
    `refreshDocument()` throws. On the next page load, `createApp` runs the same code at boot
    (`app.js:91-92`) and throws before `init()`. The app stays dead until the user clears site
    data.
  - With **random start off**, the target is empty. `isComplete` treats an empty target as
    complete (`0 === 0 && incorrect === 0`). Any keystroke finishes the run instantly and
    records a junk 0-WPM run, shown as "First run" or "New best".
- **Repro:** `prepareImport("a = 1\n\n\n\nb = 2\n", {…, lineRange: {start: 2, end: 3}})`, then
  call `selectLines` and `chooseStartLine`. The result has 0 lines and the call throws. In the
  UI: import any file, turn random start on, then under Options → Lines set start = end = the
  last line number.
- **Fix:**
  1. `chooseStartLine`: return 0 when `lines.length === 0`. Defensive; the real fix is below.
  2. Never produce an empty practice document. In `practiceDocumentFor` (`app.js:81-86`) or in
     `selectLines`, if the range yields no non-blank lines, fall back to the whole document
     (or the nearest non-blank lines). Show a notice such as "Lines X–Y are empty; showing the
     whole file." Mirror the existing `commentsKept` pattern.
  3. `isComplete`: also require `session.target.length > 0`.
  4. Boot safety: in `createApp`, if building the first document from `savedImport` throws or
     yields an empty target, discard the saved import (`removeKey(STORAGE_KEYS.lastImport)`)
     and fall back to `EXAMPLES[0]`. A bad stored record must never brick the app.
  5. `setRange`: persist the range only after `refreshDocument()` succeeds.
- **Tests:** empty range with random start on and off; boot with a stored record whose range
  points at blank lines; `isComplete` with an empty target returns false.

### BUG-2 [Medium] The line count includes a phantom empty line after the final newline (verified by reading)

- **Where:** `src/practice.js:21-27` (`createDocument` uses `text.split("\n")`),
  `src/import/prepare.js:29`, `src/ui/renderControls.js:16-21`.
- **What happens:** A file that ends with `\n` (almost every file) gets one extra, empty last
  line. A 10-line file shows "of 11" in Options → Lines. The range inputs accept line 11, and
  selecting it alone is the easiest way to trigger BUG-1. `prepareImport` counts lines the
  same way, so the "Showing lines 1–400 of N" notice is off by one too.
- **Fix:** Compute `totalLines` without the trailing empty element when the text ends with
  `\n`. Keep the line numbering otherwise identical, so GitHub `#L` anchors stay valid. Use the
  same helper in `prepare.js` and `practice.js`.
- **Tests:** `"a\nb\n"` gives 2 lines; `"a\nb"` gives 2 lines; the range max equals the real
  line count.

### BUG-3 [Medium] A failure inside `useImport` is swallowed and leaves state half-applied

- **Where:** `src/app.js:388-408` (`useImport`, `runImport`), `src/app.js:53-54` (`messageOf`).
- **What happens:** `useImport` writes the record to storage and sets `savedImport` **before**
  `selectItem(record)`. If `selectItem` throws (for example BUG-1, or any future bug),
  `runImport` catches the error and shows the generic "Something went wrong while importing."
  By then the bad record is already persisted, which can brick the next page load (see
  BUG-1). Nothing is logged, so the real error is invisible.
- **Fix:** Build the practice document first, and only then persist the record and update the
  state. That means calling `selectItem` before `writeJSON`, or validating with
  `practiceDocumentFor` up front. In `runImport`, `console.error(error)` anything that is not
  an `ImportError`.
- **Tests:** make `selectItem` throw (via an injected bad record) and assert that nothing was
  written to storage.

### BUG-4 [Medium] WPM and accuracy count whitespace the user did not type, inconsistently (owner decision)

- **Where:** `src/app.js:281-295` (auto-indent), `src/app.js:331-340` (`insertIndent`),
  `src/typing.js:57-84` (`applyTyped`), `src/stats.js:18-21` (`computeWpm` uses
  `session.correct`).
- **What happens:**
  - Auto-indent inserts the next line's indentation with `autoFrom`. Those characters are not
    counted as keystrokes (`entered`), but they are counted in `correct`, which drives WPM. On
    indented code with auto-indent on, WPM is inflated by the share of indentation (often
    10–25%).
  - Tab inserts a whole whitespace run through `handleInput` **without** `autoFrom`. One key
    press therefore counts as N keystrokes, all correct, which pads both accuracy and WPM.
    The same whitespace is treated differently depending on how it got there.
  - Backspacing over auto-inserted indentation increments `corrections` (`typing.js:67`), so
    the "backspaces" stat counts characters the user never typed.
  - Runs with auto-indent on and off share one best score (see BUG-5), so "New best" can come
    from a settings change alone.
- **Decide:** Should app-inserted whitespace count toward WPM? Recommended: no. Track an
  `inserted` count (auto-indent plus Tab runs), compute WPM from
  `correct − insertedCorrect`, count a Tab press as one keystroke, and don't count deleting
  inserted characters as corrections. At minimum, make Tab and auto-indent consistent.
- **Tests:** a typed versus an auto-indented line gives the same WPM per typed key; one Tab
  equals one keystroke.

### BUG-5 [Medium] History "best" keys collide for imports (owner decision)

- **Where:** `src/history.js:22-25` (`historyKey`).
- **What happens:** Imports are keyed as `import:<filename>`. Any two `utils.py` or `index.js`
  files from different repos share runs and best WPM. So do different line ranges of the same
  file. A run on easy lines can "beat" a best set on hard lines.
- **Fix (suggested):** Key imports by source identity plus range, for example
  `import:<repo>/<path>#<start>-<end>`. The URL works for GitHub; local files only have the
  filename. Keep reading old `import:<filename>` keys, or accept that old bests reset. Also
  decide whether random-start runs should count toward "best": they type different text every
  time.
- **Tests:** two imports with the same filename from different repos keep separate bests.

### BUG-6 [Low] IME composition text is scored while still composing

- **Where:** `src/ui/events.js:50` (the `input` listener), `src/app.js:269-303`.
- **What happens:** The keydown handler skips `isComposing`, but the `input` listener does
  not. Intermediate composition strings (Japanese or Chinese IMEs, some dead-key layouts)
  are applied to the session. They count as `entered`/`errors`, can trigger the punishment
  shake and start the timer, and are then replaced, which adds `corrections`.
- **Fix:** In the `input` listener, ignore events with `event.isComposing === true`. Add a
  `compositionend` listener that calls `actions.input(els.input.value)` once.
- **Tests:** simulate `compositionstart` → input (`isComposing: true`) → `compositionend` and
  assert one scoring pass.

### BUG-7 [Low] GitHub size limit: wrong units and the whole body is read before the check

- **Where:** `src/import/github.js:103-114`, compared with `src/import/local.js:19`.
- **What happens:** Local files are limited by `file.size` (bytes); GitHub files by
  `text.length` (UTF-16 code units), so the same 1 MB limit means different things. When
  `content-length` is missing or describes a compressed body, `response.text()` downloads and
  decodes the entire file before the size check. A large file can therefore use a lot of
  memory, bounded only by the 10 s timeout.
- **Fix:** Read `response.body` with a reader, count bytes, and abort with the ImportError
  once `maxBytes` is exceeded. Decode with `TextDecoder`. Keep the `fetchImpl` injection
  working with the test fakes in `tests/import.test.js`; fall back to `text()` when `body` is
  missing.

### BUG-8 [Low] Theme rendering ignores the injected `win`/`doc`

- **Where:** `src/ui/theme.js:33-44`: `renderTheme` calls `isDark(theme)` (global `window`)
  and `applyTheme(els, dark)` (global `document`). By contrast, `toggleTheme` in
  `src/app.js:548` passes `win`.
- **What happens:** When `createApp` gets a custom `doc`/`win` (as tests do), the theme reads
  the global matchMedia and writes to the global document. It works today only because tests
  use the global jsdom.
- **Fix:** Let renderers receive the injected `doc`/`win` (for example, close over them in
  `createApp` the same way `targetView` is), and pass them through to
  `isDark`/`applyTheme`/`watchSystemTheme`.

### BUG-9 [Low] Untracked sample files in `src/data/` (owner decision)

- `src/data/transformer_example.py` (1,413 lines) starts with ` ```python ` and ends with
  ` ``` ` (Markdown fences), so it is not valid Python. If it is imported for practice, the
  fences become lines to type. `src/data/subprocess_example.py` looks fine.
- Neither file is referenced from `src/data/examples.js`. Ask the owner whether they are meant
  to be built-in examples (then add them to `EXAMPLES` as trimmed excerpts with
  id/label/repo/path, and extend `tests/examples.test.js`) or scratch files (then move them
  out of `src/`). Do not commit them as they are.

---

## Performance

### PERF-1 [High] The tokenizer is quadratic when a file has many `/*` inside strings (verified)

- **Where:** `src/syntax/tokenize.js:41-66` together with the block-comment rules in
  `src/syntax/languages.js:18` (`SLASH_COMMENT`) and `:212` (generic).
- **What happens:** The block-comment regex is `/\/\*[\s\S]*?(?:\*\/|$)/`. When a `/*` sits
  inside a string, for example the glob `"src/**/*.js"`, the string rule wins, and the comment
  rule's cached match falls behind the scan position. The rule then searches again from the
  new position, finds the next `/*`, and scans lazily to the next `*/` or to the end of the
  file. That is O(n) per string, so O(n²) in total. It affects every C-family language,
  JS/TS, Go, Java, Rust and the generic fallback.
- **Measured** (lines of `x = "src/*.js";`, JavaScript):

  | Input                 | Time     |
  | --------------------- | -------- |
  | 2,000 lines (32 KB)   | 27 ms    |
  | 8,000 lines           | 385 ms   |
  | 16,000 lines (256 KB) | 1,361 ms |
  | 32,000 lines (512 KB) | 5,232 ms |

  A 1 MB file (the import limit) would freeze the tab for about 20 s. The full file is
  tokenized at import **and on every page load** (`app.js:75-80`, `practiceDocumentFor` at
  boot), so the freeze repeats on each visit. For comparison, the same size without `/*` in
  strings takes about 3 ms, and the Python, Rust and shell inputs probed stay linear.

- **Fix (recommended):** Make the terminator search memoized and monotonic. Let a rule
  optionally be `{ type, start: /\/\*/g, end: "*/" }` (or a matcher function). Find the start
  with the regex. Find the end with `text.indexOf(end, start + 2)`, caching the last
  terminator position found: any later start before that position reuses it, and `-1` means
  "runs to EOF" for every later start. Use the same scheme for Python and Java `"""`/`'''`
  strings, which share this shape. Keep the "earliest start, longest match, then rule order"
  contract documented at the top of `languages.js`.
  An alternative is to scan with sticky (`y`) regexes only at token boundaries, but that
  changes the tie-breaking semantics; check it against `tests/tokenize.test.js`.
- **Tests:** add a timing-tolerant test that 20,000 lines of `x = "src/*.js";` tokenize in
  under ~200 ms, and keep every existing tokenize test passing (unterminated block comment
  still runs to EOF, and so on).

### PERF-2 [High] Only lines are capped, not characters: minified files build about 1M DOM spans (verified)

- **Where:** `src/import/prepare.js:29-45` and `src/constants.js:30` (`PRACTICE_MAX_LINES`
  only), `src/ui/renderTarget.js:45-76` (one `<span>` per character), `src/app.js:269-303`
  (O(n) work per keystroke).
- **What happens:** A 960,000-character one-line minified JS file passes every check:
  `range = null` and the target has 960,000 characters. `build()` then creates 960k spans
  plus 960k class strings, which hangs the tab for seconds and uses hundreds of MB. Every
  keystroke also runs `Array.from` over the whole textarea value plus a prefix scan and a
  `join`. Even 400 lines × 2,000 characters (data or generated files) reaches 800k spans.
- **Fix:** Add `PRACTICE_MAX_CHARS` (suggested 20,000) to `constants.js`. Apply it when
  choosing the default range in `prepareImport` and when clamping in `setRange`/`clampRange`.
  End the range at the last whole line that fits; if a single line is longer than the cap,
  truncate that line and show a notice. Optionally refuse files whose median line length
  suggests minified output ("This looks like minified code").
- **Tests:** importing a 500 KB single-line file gives a target ≤ `PRACTICE_MAX_CHARS` plus a
  notice; a range that would exceed the cap is clamped.

### PERF-3 [Low] Per-keystroke work is O(target length)

- **Where:** `src/app.js:269-303`, `src/typing.js:43-84`.
- **What happens:** Each `input` event runs `toChars(rawValue)` (`Array.from` of the whole
  buffer), `commonPrefixLength` from index 0, `session.typed.join("")`, and spreads a new
  session. It is fine at today's sizes and becomes noticeable with large targets.
- **Fix (after PERF-2):** Add a fast path for the common cases. If `rawValue` equals the
  previous text plus a short suffix, or the previous text minus a short suffix, compute the
  change from the suffix alone. Keep the cached previous string in the controller instead of
  re-joining. Fall back to the current general path otherwise.

### PERF-4 [Low] `scrollToCursor` forces a layout and writes `scrollTop` on every keystroke

- **Where:** `src/ui/renderTarget.js:86-92, 104-105`.
- **What happens:** After the class writes in `patch`, reading `span.offsetTop` and
  `clientHeight` forces a synchronous layout. Then `scrollTop` is set even when the cursor is
  on the same line, so the browser does layout and scroll work on every key.
- **Fix:** Track the cursor's line (binary search over `target.lineStarts`, or flag `\n`
  crossings in `patch`). Recompute the scroll only when the line changes, and skip the write
  when the new `scrollTop` equals the current value.

### PERF-5 [Low] The stats tick rewrites unchanged text and runs every renderer four times a second

- **Where:** `src/app.js:122-125` (tick → `store.set`), `src/ui/renderStats.js:19-22`,
  `src/app.js:577-579` (all 7 renderers on every `set`).
- **What happens:** Every 250 ms, `time` and `wpm` get their `textContent` replaced even when
  the string is the same; `time` changes only once a second. That is a DOM mutation plus style
  and layout invalidation each time.
- **Fix:** Cache the last rendered strings in `renderStats` and write only on change.
  Optionally, let `store.set` skip notification when the patch changes nothing.

---

## Checked and found fine (no action)

- The state machine (`src/state.js`) transitions, the double-Escape logic, focus/blur pause
  and resume, countdown cancel, and `pageshow` reset.
- Storage wrappers handle private mode, quota errors and corrupt JSON; v1 import migration;
  history validation.
- XSS: all file content is set via `textContent`; the CSP plugin in `vite.config.js` hashes
  the inline theme script.
- The built-in `EXAMPLES` have no trailing whitespace, CR characters or non-ASCII characters
  (checked by script).
- Tokenizer timing on Python, Rust and shell inputs of 20,000 lines is linear (6–10 ms).
