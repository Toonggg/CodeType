import { describe, expect, test } from "vitest";
import { EXAMPLES } from "../src/data/examples.js";
import {
  buildTarget,
  chooseStartLine,
  countLines,
  createDocument,
  languageOf,
  selectLines,
  splitLines,
} from "../src/practice.js";

describe("splitLines / countLines (BUG-2)", () => {
  test("trailing newline does not create a phantom empty line", () => {
    expect(splitLines("a\nb\n")).toEqual(["a", "b"]);
    expect(splitLines("a\nb")).toEqual(["a", "b"]);
    expect(countLines("a\nb\n")).toBe(2);
    expect(countLines("a\nb")).toBe(2);
    expect(createDocument("a\nb\n", "javascript").totalLines).toBe(2);
    expect(createDocument("a\nb", "javascript").totalLines).toBe(2);
  });
});

describe("createDocument / buildTarget", () => {
  test("a target starting inside a docstring is still highlighted as a string (B8)", () => {
    const document = createDocument(
      'def f():\n    """Doc\n    more doc\n    """\n    return 1',
      "python",
    );
    const target = buildTarget(document, 2);
    expect(target.chars.slice(0, 12).join("")).toBe("    more doc");
    expect(target.types[4]).toBe("string");
    expect(target.lineNumbers).toEqual([3, 4, 5]);
    expect(target.lineStarts).toEqual([0, 13, 21]);
  });

  test("newlines between lines have no token type", () => {
    const target = buildTarget(createDocument("a = 1\nb = 2", "python"), 0);
    expect(target.chars.join("")).toBe("a = 1\nb = 2");
    expect(target.types[5]).toBeNull();
    expect(target.lineCount).toBe(2);
  });

  test("every example builds a target with one type per character", () => {
    for (const example of EXAMPLES) {
      const target = buildTarget(createDocument(example.code, languageOf(example)), 0);
      expect(target.chars.join("")).toBe(example.code);
      expect(target.types).toHaveLength(target.chars.length);
    }
  });
});

describe("chooseStartLine (B8)", () => {
  const lines = (texts) => createDocument(texts.join("\n"), "python").lines;
  const twenty = lines(
    Array.from({ length: 20 }, (_, i) => (i % 5 === 0 ? `def f${i}():` : `    x = ${i}`)),
  );

  test("leaves at least eight lines", () => {
    for (let r = 0; r < 1; r += 0.05) {
      const start = chooseStartLine(twenty, { random: () => r });
      expect(twenty.length - start).toBeGreaterThanOrEqual(8);
    }
  });

  test("prefers lines that are not indented", () => {
    const starts = new Set();
    for (let r = 0; r < 1; r += 0.01) starts.add(chooseStartLine(twenty, { random: () => r }));
    expect([...starts].sort((a, b) => a - b)).toEqual([0, 5, 10]);
  });

  test("never picks a blank line", () => {
    const withBlanks = lines(["", "a", "", "b", "c", "d", "e", "f", "g", "h", "i", ""]);
    for (let r = 0; r < 1; r += 0.05) {
      const start = chooseStartLine(withBlanks, { random: () => r });
      expect(withBlanks[start].text.trim()).not.toBe("");
    }
  });

  test("avoids the excluded start when there is a choice (U8)", () => {
    expect(chooseStartLine(twenty, { random: () => 0, exclude: 0 })).toBe(5);
  });

  test("returns 0 on empty lines array (BUG-1)", () => {
    expect(chooseStartLine([])).toBe(0);
  });
});

describe("selectLines (BUG-1)", () => {
  test("falls back to full document when range covers only blank lines", () => {
    const doc = createDocument("a = 1\n\n\n\nb = 2\n", "python");
    const result = selectLines(doc, { range: { start: 2, end: 4 } });
    expect(result.emptyRangeFallback).toBe(true);
    expect(result.lines.map((l) => l.text)).toEqual(["a = 1", "", "b = 2"]);
  });
});
