# CodeType

Typing practice for developers. Type real code from well-known open-source projects, or import
your own file, and track speed and accuracy as you go. Plain HTML, CSS and JavaScript modules, no
framework and no runtime dependencies.

## Run it

Requires Node.js 22.13+ (22.x), 24.x or 26+: the versions Vite, Vitest and ESLint all support.
`package.json` declares the range.

```sh
npm install
npm run dev
```

The app opens in your default browser (the URL is also printed in the terminal). ES modules need
HTTP, so opening `index.html` from disk does not work (decision D1).

## Test, lint and format

```sh
npm test               # Vitest; jsdom for the DOM tests
npm run lint           # ESLint
npm run format:check   # Prettier (npm run format rewrites)
```

## Build and deploy

```sh
npm run build     # static site in dist/
npm run preview   # serve dist/ locally
```

`dist/` uses relative URLs, so it can be served from any path (for example GitHub Pages). The
build adds a Content-Security-Policy `<meta>` tag (see [Security and privacy](#security-and-privacy)).

## How practice works

- **Choose a source** (an example or your imported file) and type it exactly. The first keystroke
  starts the timer; completing the text stops it and shows the results.
- **Whitespace is strict** (decision D2): spaces, tabs and line breaks must match. A wrong space
  turns red, and the run completes only when every character matches.
- **Tab** inserts exactly the whitespace the code expects at the cursor: the rest of the
  indentation, whether spaces or tabs. When there is nothing to insert it moves focus instead,
  except during a run, where it does nothing so a stray press never pauses you.
- **Auto-indent** (on by default) adds the next line's indentation after Enter. Turn it off in
  Options for a harder run. Characters inserted this way do not count as keystrokes.
- **Skip comments** (on by default) leaves out lines that contain only comments, as decided by
  the language's tokenizer. If a selection is nothing but comments, they are kept.
- **Random start** begins at a random non-blank line, preferring unindented lines, and always
  leaves at least 8 lines to type (or the whole text, if shorter). **Restart** retries the same
  start; **New start** picks another.
- **Countdown** (0-60 s) delays the start after pressing Start. Typing during it is ignored.
- **Punishment** shakes the page after each keystroke while a mistake is on screen (a red outline
  instead with "Reduce motion" on).
- The caret stays at the end of the typed text: arrow keys, Home/End, select-all, undo, paste and
  drop are blocked. Backspace works.

### Statistics

- **Speed (WPM)**: correct characters / 5 per minute. It shows 0 for the first 1.5 s of a run to
  avoid meaningless spikes; the final result is always computed.
- **Accuracy**: correct keystrokes / all keystrokes of the run, rounded down, so a mistake fixed
  with Backspace still counts.
- **Progress**: typed characters / target characters.
- **Best**: the highest WPM recorded for the selected snippet.

### Results and history

When a run completes, a results panel shows speed, accuracy, time, errors and backspaces, whether
it was a first run or a new best, and the last five runs of that snippet. The last 20 runs and the
best WPM per snippet are kept in this browser only (`localStorage`). Examples are identified by
their id; imported files by their file name, so re-importing a file keeps its best.

## Keyboard shortcuts

| Keys                   | Where                             | Action                                                                                                             |
| ---------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Tab                    | Typing area                       | Insert the expected indentation; with none, move focus (not during a run)                                          |
| Shift+Tab              | Typing area                       | Move focus out (a running challenge pauses)                                                                        |
| Esc                    | Anywhere                          | Close the Options menu if open; else cancel a countdown, pause or resume a run, or leave the typing area when idle |
| Esc Esc                | During a run                      | Restart (two presses within 450 ms)                                                                                |
| Ctrl+Enter / Cmd+Enter | Anywhere except other form fields | Restart and focus the typing area                                                                                  |

## Importing code

- **Local file**: any text file up to 1 MB (1,000,000 bytes). The same file can be imported
  again.
- **GitHub file**: a public file link in any of these forms, with or without `https://`:
  `github.com/<owner>/<repo>/blob/<ref>/<path>`, `github.com/<owner>/<repo>/raw/<ref>/<path>`
  or `raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>` (including `refs/heads/...` and
  `refs/tags/...`). Query strings are ignored; a `#L10` or `#L10-L20` anchor imports just those
  lines. The request times out after 10 s and is refused over 1 MB.
- **Refused**: empty files and files that look binary (NUL bytes, or more than 2% control or
  replacement characters in the first 8,000 characters).
- **Normalized**: byte order marks and zero-width characters removed; CRLF/CR converted to LF;
  no-break spaces converted to spaces; curly quotes, en/em dashes and ellipses converted to ASCII;
  other control characters removed; trailing whitespace trimmed. Line numbers are preserved, so
  `#L` anchors stay correct. Characters that remain hard to type are listed in a notice.
- **Length**: at most 400 lines are practiced at once. Longer files start with lines 1-400;
  choose other lines under Options → Lines.
- **Storage**: the last import is kept in `localStorage` (the raw text, so Skip comments can be
  toggled later) until you press **Forget import**. If storage is full, the file still loads for
  the session and a notice says so.
- The language is detected from the file extension (see `EXTENSIONS` in
  `src/syntax/languages.js`); unknown files use a generic rule set.

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

## Architecture

```
index.html                 markup, head theme script, SVG icon sprite
styles/                    index.css imports, in order:
  fonts.css                self-hosted @font-face (DM Mono, Space Grotesk; SIL OFL)
  tokens.css               every colour/font/spacing variable; :root.dark overrides values only
  base.css                 reset, focus ring, .btn, form fields, .icon
  layout.css               topbar, hero, controls, options panel, explanation, responsive
  code.css                 practice card, code window, character states, syntax colours
  stats.css                stats row, timer indicator, progress, results panel
  motion.css               animations and prefers-reduced-motion
src/
  main.js                  entry: createApp(getElements()).init()
  app.js                   controller: store, timers, status side effects, actions
  state.js                 STATUS/EVENT, pure transition(), effectsFor(), createStore()
  timer.js                 stopwatch on performance.now()
  typing.js                pure: toChars, applyTyped, charState, smartTab, autoIndent, isComplete
  stats.js                 pure: WPM, accuracy, progress, formatTime
  practice.js              documents, line selection, random start, build the target
  history.js               run history and bests (versioned, validated)
  settings.js  storage.js  constants.js
  data/examples.js         EXAMPLES: the only list of snippets; drives the <select>
  syntax/languages.js      rule sets, badges, extension map
  syntax/tokenize.js       one-pass tokenizer: earliest match wins, then longest, then first rule
  import/                  normalize, comments, github, local, prepare, record (schema v2), errors
  ui/                      dom (queries every element once), events (all listeners),
                           renderTarget, renderStats, renderStatus, renderControls,
                           renderImport, renderResults, theme
tests/                     Vitest; *.test.js per module plus app.*.test.js on the real index.html
public/                    favicons and fonts, copied to dist/ as is
```

**Data flow.** DOM event → `ui/events.js` → an action in `app.js` → `store.set()` or
`dispatch(event)` → every renderer receives `(els, state, previousState)` and updates only what
changed. Pure modules never touch the DOM.

**Rendering.** The code display is built once per target (one `<span>` per character inside one
block per line, text set with `textContent`), then each keystroke patches only the changed index
range. The display is scrolled with `offsetTop`, so soft-wrapped lines are handled; the line
height is read once per target.

### State machine

`transition(status, event)` in `src/state.js` is pure. `enter()` in `app.js` is the only place
that starts or stops timers, sets the textarea read-only, toggles focus mode and moves focus.

| Status      | Meaning                                      | Next                                                                             |
| ----------- | -------------------------------------------- | -------------------------------------------------------------------------------- |
| `idle`      | Nothing in progress; typing area not focused | Start → `countdown` (seconds > 0) or `ready`; focusing the typing area → `ready` |
| `countdown` | Counting down; typing ignored                | reaches 0 → `ready`; Esc → `idle`                                                |
| `ready`     | Focused, waiting                             | first keystroke → `running`; Esc or blur → `idle`                                |
| `running`   | Timer running                                | Esc, blur or hidden tab → `paused`; target typed → `complete`                    |
| `paused`    | Timer stopped                                | a keystroke or Esc → `running`                                                   |
| `complete`  | Results frozen, input read-only              | see below                                                                        |

From any status, Restart (button, Ctrl/Cmd+Enter, Esc Esc during a run) starts a fresh run in
`ready`; changing the source, the import, the line range, Skip comments or Random start, or a
back/forward-cache restore, resets to `idle`.

| Side effect                       | Statuses                                           |
| --------------------------------- | -------------------------------------------------- |
| Timer running                     | `running`                                          |
| Input accepted                    | `ready`, `running`, `paused`                       |
| Focus mode (surroundings blurred) | `countdown`, `ready`, `running`                    |
| Typing area focused / released    | focused on `ready`; released on `idle`, `complete` |

## Syntax highlighting

Highlighting uses a small built-in tokenizer (`src/syntax/tokenize.js`) with rule sets for
Python, C/C++, Rust, JavaScript, TypeScript, Go, Java and shell (`src/syntax/languages.js`).
Other files fall back to a generic rule set.

Decision (D3): the custom tokenizer was extended rather than adopting Prism. It keeps the app
dependency-free and is enough for a handful of languages. Revisit this if more than about six
more languages are wanted.

## Adding a snippet

Add an object to `EXAMPLES` in `src/data/examples.js`:

```js
{
  id: "go-errors",                 // stable: history and bests are keyed by it
  label: "Go · errors.New",        // "<Language> · <what>", shown in the menu
  language: "go",                  // a key of LANGUAGES in src/syntax/languages.js
  repo: "golang/go",               // shown in the card header
  path: "/ src / errors / errors.go",
  code: "...",                     // verbatim excerpt of that file
}
```

Excerpt from the real file (removing only the enclosing class or impl indentation) and keep it
typeable: printable ASCII, tabs and newlines only, no trailing whitespace. `tests/examples.test.js`
enforces this and completes every example in the app.

## Adding a language

1. In `src/syntax/languages.js`, add a rule set to `SYNTAX_RULES`: an array of
   `[tokenType, /regex/g]` pairs using the token types listed at the top of the file. Reuse the
   shared rules (`SLASH_COMMENT`, `HASH_COMMENT`, `DOUBLE_STRING`, `NUMBER`, ...). Precedence comes
   from position in the text, so rules do not need to exclude each other.
2. Add `{ name, badge }` to `LANGUAGES` and its extensions to `EXTENSIONS` (and `FILE_NAMES` for
   extensionless files).
3. Add tokenizer cases to `tests/tokenize.test.js` (comment markers inside strings, keywords vs.
   function calls) and at least two snippets.

"Skip comments" works automatically: it removes lines whose only tokens are `comment`.

## Security and privacy

- No accounts, analytics or third-party requests. Fonts are self-hosted (decision D5). The only
  network request is the GitHub import, to `raw.githubusercontent.com`.
- Code is rendered with `textContent`, never as HTML.
- The production build carries a Content-Security-Policy: `default-src`, `script-src`,
  `style-src`, `img-src` and `font-src` are `'self'` (the inline theme script is allowed by its
  SHA-256 hash, computed at build time in `vite.config.js`), `connect-src` is
  `https://raw.githubusercontent.com`, `object-src 'none'`, `base-uri` and `form-action`
  `'self'`. `frame-ancestors` cannot be set from a `<meta>` tag; set it as a response header if
  clickjacking matters for your host. The dev server has no policy, because Vite injects inline
  styles and a hot-reload socket.
- `localStorage` keys (all `codetype-*`): `theme` (only after using the toggle), `punishment`,
  `random-start`, `countdown`, `auto-indent`, `skip-comments`, `last-import`, `history`. Every
  read tolerates missing, corrupt or blocked storage.

## Final verification (step 48, 2026-09-26)

Run in Chrome 154 (headless, macOS 27) against the production build served by `vite preview`,
so everything ran under the Content-Security-Policy. Real key events, file-input uploads and
a live GitHub request were driven through the DevTools protocol.

| #   | Check                                                                                                                                           | Result                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1   | The C++ example completes using only Tab for indentation, auto-indent off (B1)                                                                  | Pass: 5 Tab presses, complete                                                                 |
| 2   | A typed space where a letter belongs turns red (B2)                                                                                             | Pass: `incorrect` class and colour                                                            |
| 3   | Typing during the countdown is ignored; one Escape cancels it (B3, B7)                                                                          | Pass                                                                                          |
| 4   | Completion: indicator stops, stats freeze, Backspace is inert, visible complete state (B5)                                                      | Pass                                                                                          |
| 5   | A file with `*ptr = x;`, `#include`, `#[derive]` and `"src/*.ts"` keeps every line; only the comment-only line is skipped (B4)                  | Pass                                                                                          |
| 6   | The same file imports twice in a row (B12); a 10 MB file is refused with a message (B13)                                                        | Pass                                                                                          |
| 7   | A GitHub link with `#L10-L20` loads exactly those lines (B20)                                                                                   | Pass: 11 lines, byte-identical                                                                |
| 8   | No wrong-theme flash on load (B19), with 300 ms latency, for saved dark/OS light, saved light/OS dark, and nothing saved with either OS setting | Pass: every painted frame after navigation has the expected theme                             |
| 9   | Shift+Tab leaves the typing area; Escape when idle releases it (A1)                                                                             | Pass                                                                                          |
| 10  | A 500-line import (400-line window, 11,630 character spans) types smoothly (P1)                                                                 | Pass: 299 keystrokes, input handling plus forced layout median 0.4 ms, p95 0.6 ms, max 0.9 ms |
| 11  | Reduced motion: no shake or pulse (A6); contrast of text and focus indicators (A4)                                                              | Pass: 94 token pairs meet AA in both themes; axe reports no violations                        |
| 12  | `npm test`, `npm run lint`, `npm run format:check`, `npm run build`                                                                             | Pass: 309 tests                                                                               |

Not covered: browsers other than Chrome, real phones and on-screen keyboards, IMEs and dead
keys, and the VoiceOver pass. Item 10 times the input handler and layout, not painting.

## Known limitations

- **GitHub branch names containing `/`** cannot be told apart from the file path. The file still
  loads (the raw URL keeps the original segments), but the header may split branch and path in
  the wrong place.
- Only public GitHub files can be imported (no sign-in), and only one import is kept at a time.
- Highlighting is regex-based: good for typing practice, not a parser. For example, nested
  template literals, heredocs and Rust attributes are coloured approximately.
- Input methods that compose characters (IMEs, and dead keys on international layouts, which
  some code characters such as backtick and tilde need) have not been tested. Keys pressed during
  composition are not treated as shortcuts, but the composed text is still read as typing.
- Best speeds are per snippet, regardless of Random start, Skip comments or the chosen line
  range; imported files are matched by file name.
- Verified in Chrome only; the VoiceOver pass in the accessibility record above has not been
  done yet.
