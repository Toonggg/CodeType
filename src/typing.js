/**
 * Pure typing rules.
 *
 * Whitespace policy (D2, strict): every character counts, including spaces, tabs
 * and newlines. `charState()` is the single rule used by the display, the stats,
 * the punishment shake and completion (B2). Text is handled as arrays of code
 * points so astral characters never shift indices (B10).
 *
 * Friction is removed instead of hidden: Tab inserts exactly the whitespace the
 * target expects (B1) and, when auto-indent is on, Enter is followed by the next
 * line's indentation (U7).
 */

export const CHAR = Object.freeze({ PENDING: 0, CORRECT: 1, INCORRECT: 2 });

/** Splits text into code points. */
export function toChars(text) {
  return Array.from(text);
}

export function charState(targetChars, typedChars, index) {
  if (index >= typedChars.length) return CHAR.PENDING;
  return typedChars[index] === targetChars[index] ? CHAR.CORRECT : CHAR.INCORRECT;
}

/**
 * A typing session. `correct`/`incorrect` describe the current buffer; `entered`
 * and `errors` count every keystroke of the run, so fixing a mistake does not
 * erase it (U5); `corrections` counts deleted characters.
 */
export function createSession(targetChars) {
  return {
    target: targetChars,
    typed: [],
    correct: 0,
    incorrect: 0,
    entered: 0,
    errors: 0,
    corrections: 0,
  };
}

function commonPrefixLength(a, b) {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i += 1;
  return i;
}

/**
 * Applies a new typed buffer (clamped to the target length).
 * Characters at index >= autoFrom were inserted by the app (auto-indent) and are
 * not counted as keystrokes.
 * Returns the new session and the inclusive index range [from, to] whose display
 * state may have changed; it always covers the old and the new cursor.
 */
export function applyTyped(session, nextTyped, { autoFrom = Infinity } = {}) {
  const { target, typed } = session;
  const next = nextTyped.length > target.length ? nextTyped.slice(0, target.length) : nextTyped;
  const from = commonPrefixLength(typed, next);
  let { correct, incorrect, entered, errors, corrections } = session;

  for (let i = from; i < typed.length; i += 1) {
    if (typed[i] === target[i]) correct -= 1;
    else incorrect -= 1;
  }
  corrections += typed.length - from;

  for (let i = from; i < next.length; i += 1) {
    const ok = next[i] === target[i];
    if (ok) correct += 1;
    else incorrect += 1;
    if (i < autoFrom) {
      entered += 1;
      if (!ok) errors += 1;
    }
  }

  return {
    session: { ...session, typed: next, correct, incorrect, entered, errors, corrections },
    from,
    to: Math.max(typed.length, next.length),
  };
}

export function isComplete(session) {
  return session.typed.length === session.target.length && session.incorrect === 0;
}

/** The run of spaces and tabs the target expects starting at `index`. */
export function whitespaceRun(targetChars, index) {
  let end = index;
  while (end < targetChars.length && (targetChars[end] === " " || targetChars[end] === "\t")) {
    end += 1;
  }
  return targetChars.slice(index, end);
}

/**
 * What Tab inserts at the caret: exactly the whitespace the target expects there,
 * or nothing when the target expects something else. Never a wrong character (B1).
 */
export function smartTab(targetChars, caret) {
  return whitespaceRun(targetChars, caret);
}

/**
 * The indentation to add after a newline typed at `newlineIndex`: the next
 * target line's leading whitespace, but only when the newline itself was correct.
 */
export function autoIndent(targetChars, newlineIndex) {
  if (targetChars[newlineIndex] !== "\n") return [];
  return whitespaceRun(targetChars, newlineIndex + 1);
}
