/**
 * Characterization tests for the legacy comment stripper, pinned as it was when
 * moved out of app.js. Known bugs are encoded with test.fails; the replacement
 * lands in Phase 5. (The legacy highlighter's tests moved to tokenize.test.js.)
 */
import { describe, expect, test } from "vitest";
import { codeOnly } from "../src/import/comments.js";

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
