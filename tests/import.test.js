import { describe, expect, test, vi } from "vitest";
import { stripCommentLines } from "../src/import/comments.js";
import { ImportError } from "../src/import/errors.js";
import { fetchGitHubFile, parseGitHubUrl, parseLineHash } from "../src/import/github.js";
import { readLocalFile } from "../src/import/local.js";
import { looksBinary, normalizeSource } from "../src/import/normalize.js";
import { clampRange, prepareImport } from "../src/import/prepare.js";
import { IMPORT_VERSION, isValidImportRecord, migrateImportRecord } from "../src/import/record.js";

const ch = (code) => String.fromCharCode(code);
const BOM = ch(0xfeff);
const NBSP = ch(0xa0);
const ZWSP = ch(0x200b);

describe("normalizeSource (B4, R8)", () => {
  test("strips a byte order mark and zero-width characters", () => {
    expect(normalizeSource(`${BOM}def f(): pass${ZWSP}`).text).toBe("def f(): pass");
  });

  test("converts CRLF and CR line endings", () => {
    expect(normalizeSource("a\r\nb\rc").text).toBe("a\nb\nc");
  });

  test("turns no-break spaces and typographic punctuation into ASCII", () => {
    const input = `x${NBSP}=${NBSP}${ch(0x201c)}hi${ch(0x201d)} ${ch(0x2014)} ${ch(0x2018)}ok${ch(0x2019)}${ch(0x2026)}`;
    const result = normalizeSource(input);
    expect(result.text).toBe(`x = "hi" - 'ok'...`);
    expect(result.replaced).toBe(8);
  });

  test("removes control characters but keeps tabs", () => {
    expect(normalizeSource(`a${ch(7)}\tb${ch(0x0c)}`).text).toBe("a\tb");
  });

  test("trims trailing whitespace and keeps the line count", () => {
    const result = normalizeSource("a   \n\n\n\n\nb\t \n");
    expect(result.text).toBe("a\n\n\n\n\nb\n");
    expect(result.text.split("\n")).toHaveLength(7);
  });

  test("reports characters that are hard to type", () => {
    const result = normalizeSource(`name = "Jos${ch(0xe9)}" # ${ch(0xe9)}`);
    expect(result.untypeable).toEqual([ch(0xe9)]);
    expect(result.untypeableCount).toBe(2);
  });
});

describe("looksBinary (R7)", () => {
  test("detects NUL bytes and replacement characters", () => {
    expect(looksBinary(`PNG${ch(0)}data`)).toBe(true);
    expect(looksBinary(ch(0xfffd).repeat(50) + "x".repeat(100))).toBe(true);
  });
  test("accepts ordinary source text", () => {
    expect(looksBinary("def f():\n\treturn 1\n")).toBe(false);
    expect(looksBinary("")).toBe(false);
  });
});

describe("stripCommentLines (B4)", () => {
  test("keeps pointer dereference lines", () => {
    expect(stripCommentLines("for (;;)\n    *out = *a;", "cpp")).toBe("for (;;)\n    *out = *a;");
  });
  test("keeps #include lines in C++", () => {
    expect(stripCommentLines("#include <algorithm>\nint x;", "cpp")).toContain("#include");
  });
  test("keeps Rust attributes", () => {
    expect(stripCommentLines("#[derive(Debug)]\nstruct P;", "rust")).toContain("#[derive(Debug)]");
  });
  test("a /* inside a string does not swallow the rest of the file", () => {
    expect(stripCommentLines('glob("src/*.ts");\nconst a = 1;', "javascript")).toBe(
      'glob("src/*.ts");\nconst a = 1;',
    );
  });
  test("keeps arithmetic continuation lines", () => {
    expect(stripCommentLines("total = (a\n         * b)", "python")).toContain("* b)");
  });
  test("removes whole-line comments per language", () => {
    expect(stripCommentLines("# a\nx = 1  # b\n    # c\ny = 2", "python")).toBe(
      "x = 1  # b\ny = 2",
    );
    expect(stripCommentLines("/**\n * Doc\n */\nint f();\n// x\nint g();", "cpp")).toBe(
      "int f();\nint g();",
    );
    expect(stripCommentLines("#!/bin/sh\n# note\necho $#\n", "shell")).toBe("echo $#\n");
  });
  test("# is not a comment in JavaScript", () => {
    expect(stripCommentLines("#!/usr/bin/env node\nclass A { #x = 1 }", "javascript")).toBe(
      "#!/usr/bin/env node\nclass A { #x = 1 }",
    );
  });
  test("drops a blank line left doubled by a removed comment", () => {
    expect(stripCommentLines("a = 1\n\n# note\n\nb = 2", "python")).toBe("a = 1\n\nb = 2");
  });
});

describe("parseLineHash", () => {
  test.each([
    ["#L10-L20", { start: 10, end: 20 }],
    ["#L5", { start: 5, end: 5 }],
    ["#L10C3-L20C9", { start: 10, end: 20 }],
    ["#L20-L10", { start: 10, end: 20 }],
    ["#readme", null],
    ["", null],
  ])("%s", (hash, expected) => {
    expect(parseLineHash(hash)).toEqual(expected);
  });
});

describe("parseGitHubUrl (B20)", () => {
  const RAW = "https://raw.githubusercontent.com";
  test.each([
    [
      "https://github.com/psf/requests/blob/main/src/requests/sessions.py",
      {
        owner: "psf",
        repo: "requests",
        ref: "main",
        path: "src/requests/sessions.py",
        lineRange: null,
      },
      `${RAW}/psf/requests/main/src/requests/sessions.py`,
    ],
    [
      "https://github.com/psf/requests/blob/main/setup.py#L10-L20",
      { ref: "main", path: "setup.py", lineRange: { start: 10, end: 20 } },
      `${RAW}/psf/requests/main/setup.py`,
    ],
    [
      "https://github.com/psf/requests/blob/v2.31.0/setup.py?plain=1#L3-L4",
      { ref: "v2.31.0", path: "setup.py", lineRange: { start: 3, end: 4 } },
      `${RAW}/psf/requests/v2.31.0/setup.py`,
    ],
    [
      "  github.com/golang/go/blob/master/src/strings/strings.go  ",
      { owner: "golang", repo: "go", path: "src/strings/strings.go" },
      `${RAW}/golang/go/master/src/strings/strings.go`,
    ],
    [
      "https://www.github.com/a/b/raw/main/x.rs",
      { owner: "a", repo: "b", ref: "main", path: "x.rs" },
      `${RAW}/a/b/main/x.rs`,
    ],
    [
      `${RAW}/rust-lang/rustup/master/rustup-init.sh`,
      { owner: "rust-lang", repo: "rustup", ref: "master", path: "rustup-init.sh" },
      `${RAW}/rust-lang/rustup/master/rustup-init.sh`,
    ],
    [
      `${RAW}/a/b/refs/heads/main/src/x.py`,
      { ref: "refs/heads/main", path: "src/x.py" },
      `${RAW}/a/b/refs/heads/main/src/x.py`,
    ],
    [
      "https://github.com/a/b/blob/main/my%20file.py",
      { path: "my file.py" },
      `${RAW}/a/b/main/my%20file.py`,
    ],
  ])("%s", (url, expected, rawUrl) => {
    const parsed = parseGitHubUrl(url);
    expect(parsed).toMatchObject(expected);
    expect(parsed.rawUrl).toBe(rawUrl);
  });

  test.each([
    ["", /first/],
    ["not a url at all", /does not look like a link/],
    ["https://gitlab.com/a/b/-/blob/main/x.py", /Only github.com/],
    ["https://github.com/psf/requests", /single file/],
    ["https://github.com/psf/requests/tree/main/src", /single file/],
    ["ftp://github.com/a/b/blob/main/x.py", /https/],
    ["https://raw.githubusercontent.com/a/b/main", /does not point to a file/],
  ])("rejects %j", (url, message) => {
    expect(() => parseGitHubUrl(url)).toThrow(ImportError);
    expect(() => parseGitHubUrl(url)).toThrow(message);
  });
});

describe("fetchGitHubFile (R3)", () => {
  const response = (status, body = "", headers = {}) => ({
    status,
    ok: status >= 200 && status < 300,
    headers: new Map(Object.entries(headers)),
    text: async () => body,
  });

  test("returns the file text", async () => {
    const fetchImpl = vi.fn(async () => response(200, "print(1)"));
    await expect(fetchGitHubFile("https://raw/x.py", { fetchImpl })).resolves.toBe("print(1)");
    expect(fetchImpl.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  test("explains a 404", async () => {
    const fetchImpl = async () => response(404);
    await expect(fetchGitHubFile("u", { fetchImpl })).rejects.toThrow(/could not find/);
  });

  test("reports other HTTP errors", async () => {
    const fetchImpl = async () => response(503);
    await expect(fetchGitHubFile("u", { fetchImpl })).rejects.toThrow(/\(503\)/);
  });

  test("refuses files over the size limit", async () => {
    const big = async () => response(200, "", { "content-length": "20000000" });
    await expect(fetchGitHubFile("u", { fetchImpl: big })).rejects.toThrow(/20\.0 MB/);
    const long = async () => response(200, "x".repeat(50));
    await expect(fetchGitHubFile("u", { fetchImpl: long, maxBytes: 10 })).rejects.toThrow(
      /too large/,
    );
  });

  test("times out", async () => {
    vi.useFakeTimers();
    const fetchImpl = (url, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      });
    const pending = fetchGitHubFile("u", { fetchImpl, timeoutMs: 1000 });
    const assertion = expect(pending).rejects.toThrow(/took too long/);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    vi.useRealTimers();
  });

  test("reports network failures", async () => {
    const fetchImpl = async () => {
      throw new TypeError("Failed to fetch");
    };
    await expect(fetchGitHubFile("u", { fetchImpl })).rejects.toThrow(/Could not reach GitHub/);
  });
});

describe("prepareImport (B13)", () => {
  const meta = { source: "local", filename: "x.py", repo: "x.py", path: "/ local file" };

  test("builds a v2 record with the normalized text", () => {
    const { record, notices } = prepareImport(`${BOM}a = 1\r\n`, meta);
    expect(record).toMatchObject({
      version: IMPORT_VERSION,
      id: "custom",
      language: "python",
      code: "a = 1\n",
      range: null,
    });
    expect(notices).toEqual([]);
    expect(isValidImportRecord(record)).toBe(true);
  });

  test("refuses binary and empty files", () => {
    expect(() => prepareImport(`a${ch(0)}b`, meta)).toThrow(/binary/);
    expect(() => prepareImport("  \n\n", meta)).toThrow(/empty/);
  });

  test("long files get the first 400 lines and a notice", () => {
    const text = Array.from({ length: 1000 }, (_, i) => `x${i} = ${i}`).join("\n");
    const { record, notices } = prepareImport(text, meta);
    expect(record.range).toEqual({ start: 1, end: 400 });
    expect(notices[0]).toMatch(/lines 1–400 of 1000/);
  });

  test("a requested line range is clamped to the file", () => {
    const text = "a\nb\nc\nd";
    expect(prepareImport(text, { ...meta, lineRange: { start: 2, end: 99 } }).record.range).toEqual(
      { start: 2, end: 4 },
    );
  });

  test("warns about characters that are hard to type", () => {
    expect(prepareImport(`s = "${ch(0xe9)}"`, meta).notices[0]).toMatch(/hard to type/);
  });
});

describe("clampRange", () => {
  test("keeps ranges inside the file and under the practice limit", () => {
    expect(clampRange({ start: 0, end: 5 }, 10)).toEqual({
      range: { start: 1, end: 5 },
      limited: false,
    });
    expect(clampRange({ start: 8, end: 3 }, 10)).toEqual({
      range: { start: 8, end: 8 },
      limited: false,
    });
    expect(clampRange({ start: 1, end: 900 }, 1000)).toEqual({
      range: { start: 1, end: 400 },
      limited: true,
    });
  });
});

describe("migrateImportRecord (R4)", () => {
  test("migrates a v1 local record", () => {
    const record = migrateImportRecord({
      id: "custom",
      filename: "main.rs",
      repo: "main.rs",
      path: "/ local file · comments skipped",
      icon: "x",
      code: "fn main() {}\r\n",
    });
    expect(record).toMatchObject({
      version: 2,
      source: "local",
      path: "/ local file",
      language: "rust",
      code: "fn main() {}\n",
    });
  });

  test("migrates a v1 GitHub record", () => {
    const record = migrateImportRecord({
      id: "custom",
      filename: "src/app.ts",
      repo: "a/b",
      path: "/ src/app.ts · comments skipped",
      code: "let a = 1",
    });
    expect(record).toMatchObject({
      source: "github",
      repo: "a/b",
      path: "/ src/app.ts",
      language: "typescript",
    });
  });

  test("keeps valid v2 records and discards invalid ones", () => {
    const valid = prepareImport("x = 1", {
      source: "local",
      filename: "a.py",
      repo: "a.py",
      path: "/ local file",
    }).record;
    expect(migrateImportRecord(valid)).toEqual(valid);
    expect(migrateImportRecord({ ...valid, language: "cobol" })).toBeNull();
    expect(migrateImportRecord({ ...valid, range: { start: 5, end: 2 } })).toBeNull();
    expect(migrateImportRecord({ version: 7 })).toBeNull();
    expect(migrateImportRecord("nope")).toBeNull();
    expect(migrateImportRecord({ filename: "a.py" })).toBeNull();
  });
});

describe("readLocalFile (B12, B13)", () => {
  test("reads text", async () => {
    await expect(readLocalFile({ name: "a.py", size: 5, text: async () => "x = 1" })).resolves.toBe(
      "x = 1",
    );
  });
  test("refuses large files before reading", async () => {
    const text = vi.fn();
    await expect(readLocalFile({ name: "big.log", size: 10_000_000, text })).rejects.toThrow(
      /big\.log is 10\.0 MB/,
    );
    expect(text).not.toHaveBeenCalled();
  });
  test("reports read errors", async () => {
    const file = { name: "a.py", size: 1, text: async () => Promise.reject(new Error("io")) };
    await expect(readLocalFile(file)).rejects.toThrow(/Could not read a\.py/);
  });
});
