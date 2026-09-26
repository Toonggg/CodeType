/**
 * Characterization tests: they pin the behaviour of the pure helpers as they were
 * when moved out of app.js. Known bugs are encoded with test.fails so they flip
 * once the replacement implementation lands.
 */
import { describe, expect, test } from "vitest";
import { codeOnly } from "../src/import/comments.js";
import { formatTime } from "../src/stats.js";
import { detectLanguage } from "../src/syntax/languages.js";
import { buildSyntaxRanges, syntaxClassAt } from "../src/syntax/tokenize.js";

describe("formatTime", () => {
  test("pads minutes and seconds", () => {
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(5.9)).toBe("00:05");
    expect(formatTime(65)).toBe("01:05");
    expect(formatTime(3600)).toBe("60:00");
  });
});

describe("detectLanguage", () => {
  test("maps known extensions", () => {
    expect(detectLanguage("main.py")).toBe("python");
    expect(detectLanguage("gui.PYW")).toBe("python");
    expect(detectLanguage("vector.hpp")).toBe("cpp");
    expect(detectLanguage("lib.rs")).toBe("rust");
  });
  test("falls back to generic", () => {
    expect(detectLanguage("index.js")).toBe("generic");
    expect(detectLanguage("Makefile")).toBe("generic");
  });
});

describe("buildSyntaxRanges", () => {
  const classesOf = (code, lang) => {
    const ranges = buildSyntaxRanges(code, lang);
    return [...code].map((_, i) => syntaxClassAt(ranges, i));
  };

  test("keyword wins over function for `if (`", () => {
    const classes = classesOf("if (x)", "python");
    expect(classes[0]).toBe("syntax-keyword");
  });

  test("strings are highlighted", () => {
    const classes = classesOf('s = "hi"', "python");
    expect(classes[4]).toBe("syntax-string");
  });

  // B27: the comment rule matches from inside the string and leaks to end of line.
  test.fails("a # inside a string does not start a comment", () => {
    const code = 's = "#x" + foo()';
    const classes = classesOf(code, "python");
    expect(classes[code.indexOf("foo")]).toBe("syntax-function");
  });
});

describe("codeOnly", () => {
  test("drops comment-only lines and blank lines", () => {
    expect(codeOnly("# note\nx = 1\n\ny = 2")).toBe("x = 1\ny = 2");
  });

  test("normalizes CRLF", () => {
    expect(codeOnly("a\r\nb")).toBe("a\nb");
  });

  // B4: each of these deletes real code.
  test.fails("keeps pointer dereference lines", () => {
    expect(codeOnly("for (;;)\n    *out = *a;")).toContain("*out = *a;");
  });

  test.fails("keeps #include lines in C++", () => {
    expect(codeOnly("#include <algorithm>\nint x;")).toContain("#include");
  });

  test.fails("keeps Rust attributes", () => {
    expect(codeOnly("#[derive(Debug)]\nstruct P;")).toContain("#[derive(Debug)]");
  });

  test.fails("a /* inside a string does not swallow the rest of the file", () => {
    expect(codeOnly('glob("src/*.ts");\nconst a = 1;')).toContain("const a = 1;");
  });

  test.fails("keeps arithmetic continuation lines", () => {
    expect(codeOnly("total = (a\n         * b)")).toContain("* b)");
  });

  test.fails("strips a UTF-8 byte order mark", () => {
    expect(codeOnly("﻿def f(): pass").startsWith("def")).toBe(true);
  });
});
