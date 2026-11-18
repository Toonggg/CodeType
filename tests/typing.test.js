import { describe, expect, test } from "vitest";
import {
  CHAR,
  applyTyped,
  autoIndent,
  charState,
  createSession,
  isComplete,
  smartTab,
  toChars,
  whitespaceRun,
} from "../src/typing.js";

const session = (target) => createSession(toChars(target));
const type = (s, text, options) => applyTyped(s, toChars(text), options);

describe("charState (strict whitespace, B2)", () => {
  const target = toChars("a b\n\tc");
  test("pending, correct and incorrect", () => {
    expect(charState(target, toChars("a"), 0)).toBe(CHAR.CORRECT);
    expect(charState(target, toChars("a"), 1)).toBe(CHAR.PENDING);
    expect(charState(target, toChars("ax"), 1)).toBe(CHAR.INCORRECT);
  });
  test("whitespace mismatches are errors", () => {
    expect(charState(target, toChars("a\t"), 1)).toBe(CHAR.INCORRECT);
    expect(charState(target, toChars("a b "), 3)).toBe(CHAR.INCORRECT);
    expect(charState(target, toChars("a b\n "), 4)).toBe(CHAR.INCORRECT);
  });
});

describe("applyTyped", () => {
  test("counts correct, incorrect, entered and errors", () => {
    const { session: s, from, to } = type(session("hello"), "hxl");
    expect(s).toMatchObject({ correct: 2, incorrect: 1, entered: 3, errors: 1, corrections: 0 });
    expect([from, to]).toEqual([0, 3]);
  });

  test("Backspace fixes the buffer but not the error count (U5)", () => {
    let s = type(session("hello"), "hx").session;
    s = type(s, "h").session;
    expect(s).toMatchObject({ correct: 1, incorrect: 0, entered: 2, errors: 1, corrections: 1 });
    const result = type(s, "he");
    expect(result.session).toMatchObject({ correct: 2, entered: 3, errors: 1 });
    expect([result.from, result.to]).toEqual([1, 2]);
  });

  test("the changed range covers the old and new cursor", () => {
    const s = type(session("abcdef"), "abcd").session;
    expect(type(s, "ab")).toMatchObject({ from: 2, to: 4 });
  });

  test("input is clamped to the target length", () => {
    const { session: s } = type(session("ab"), "abcd");
    expect(s.typed).toEqual(["a", "b"]);
    expect(isComplete(s)).toBe(true);
  });

  test("auto-inserted characters are not keystrokes", () => {
    let s = type(session("a\n    b"), "a\n").session;
    s = type(s, "a\n    ", { autoFrom: 2 }).session;
    expect(s).toMatchObject({ correct: 6, entered: 2, errors: 0, insertedCorrect: 4 });
  });

  test("one Tab equals one keystroke and marks inserted characters (BUG-4)", () => {
    const s = type(session("    return 1"), "    ", { isTab: true }).session;
    expect(s).toMatchObject({ correct: 4, entered: 1, errors: 0, insertedCorrect: 4 });
  });

  test("backspacing over inserted characters does not increment corrections (BUG-4)", () => {
    let s = type(session("a\n    b"), "a\n").session;
    s = type(s, "a\n    ", { autoFrom: 2 }).session;
    expect(s.corrections).toBe(0);
    // Backspace 4 spaces of auto-indentation
    s = type(s, "a\n").session;
    expect(s.corrections).toBe(0);
    // Backspace the user-typed newline
    s = type(s, "a").session;
    expect(s.corrections).toBe(1);
  });

  test("astral characters are single positions (B10)", () => {
    const s = type(session("x = '😀';"), "x = '😀'").session;
    expect(s.typed).toHaveLength(7); // the emoji is one position, not two UTF-16 units
    expect(s.incorrect).toBe(0);
    expect(charState(s.target, s.typed, 5)).toBe(CHAR.CORRECT);
    expect(isComplete(type(s, "x = '😀';").session)).toBe(true);
  });
});

describe("isComplete", () => {
  test("requires every character to match", () => {
    expect(isComplete(type(session("a b"), "a\tb").session)).toBe(false);
    expect(isComplete(type(session("a b"), "a b").session)).toBe(true);
  });

  test("returns false when target is empty (BUG-1)", () => {
    expect(isComplete(session(""))).toBe(false);
  });
});

describe("smartTab (B1)", () => {
  const cpp = toChars("{\n  for (;;)\n    x;\n}");
  test("fills a 2-space indent exactly", () => {
    expect(smartTab(cpp, 2)).toEqual([" ", " "]);
  });
  test("fills a 4-space indent exactly", () => {
    expect(smartTab(cpp, 13)).toEqual([" ", " ", " ", " "]);
  });
  test("fills a tab indent with a tab", () => {
    expect(smartTab(toChars("f() {\n\treturn;\n}"), 6)).toEqual(["\t"]);
  });
  test("completes a partially typed indent", () => {
    expect(smartTab(cpp, 14)).toEqual([" ", " ", " "]);
  });
  test("fills whitespace in the middle of a line", () => {
    expect(smartTab(toChars("x  = 1"), 1)).toEqual([" ", " "]);
  });
  test("inserts nothing when the target expects a non-whitespace character", () => {
    expect(smartTab(cpp, 4)).toEqual([]);
    expect(smartTab(cpp, 1)).toEqual([]);
  });
  test("mixed tabs and spaces are copied as-is", () => {
    expect(whitespaceRun(toChars("\t  x"), 0)).toEqual(["\t", " ", " "]);
  });
});

describe("autoIndent (U7)", () => {
  const target = toChars("def f():\n    return 1\n\n    x");
  test("returns the next line's indentation after a correct newline", () => {
    expect(autoIndent(target, 8)).toEqual([" ", " ", " ", " "]);
  });
  test("returns nothing before a blank line", () => {
    expect(autoIndent(target, 21)).toEqual([]);
  });
  test("returns nothing when the newline was wrong", () => {
    expect(autoIndent(target, 3)).toEqual([]);
  });
});
