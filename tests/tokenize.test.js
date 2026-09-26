import { describe, expect, test } from "vitest";
import { LANGUAGES, SYNTAX_RULES, detectLanguage } from "../src/syntax/languages.js";
import { classifyChars, tokenize, toCodePointTypes } from "../src/syntax/tokenize.js";

/** Renders tokens as "[type:text]" runs for readable assertions. */
function tokens(code, language) {
  const types = classifyChars(code, language);
  const chars = [...code];
  let out = "";
  let i = 0;
  while (i < chars.length) {
    let j = i;
    while (j < chars.length && types[j] === types[i]) j += 1;
    const text = chars.slice(i, j).join("");
    out += types[i] ? `[${types[i]}:${text}]` : text;
    i = j;
  }
  return out;
}

describe("precedence (B27)", () => {
  test("a # inside a string does not start a comment", () => {
    expect(tokens('s = "#x" + foo()', "python")).toBe('s = [string:"#x"] + [function:foo]()');
  });

  test("keyword beats function for `if (` by rule order", () => {
    expect(tokens("if (x)", "javascript")).toBe("[keyword:if] (x)");
  });

  test("the earliest match wins", () => {
    expect(tokens('x = "a" # "b"', "python")).toBe('x = [string:"a"] [comment:# "b"]');
  });

  test("the longest match wins at the same start", () => {
    // Both "number" and nothing else start at 1; the number rule takes the whole literal.
    expect(tokens("1.5e3", "javascript")).toBe("[number:1.5e3]");
  });

  test("/* inside a string does not open a block comment", () => {
    expect(tokens('glob("src/*.ts");\nconst a = 1;', "typescript")).toBe(
      '[function:glob]([string:"src/*.ts"]);\n[keyword:const] a = [number:1];',
    );
  });

  test("an unterminated docstring runs to the end of the text", () => {
    expect(tokens('x = 1\n"""open\ny = 2', "python")).toBe(
      '[type:x] = [number:1]\n[string:"""open\ny = 2]'.replace("[type:x]", "x"),
    );
  });

  test("an unterminated single-line string does not swallow later lines", () => {
    expect(tokens('a = "oops\nb = 1', "javascript")).toBe('a = "oops\nb = [number:1]');
  });

  test("tokens never overlap and cover only matched text", () => {
    for (const language of Object.keys(SYNTAX_RULES)) {
      const types = tokenize("if (x) { return f(1); } // c", language);
      expect(types).toHaveLength("if (x) { return f(1); } // c".length);
    }
  });
});

describe("language rules", () => {
  test("C++ keeps #include as a preprocessor line", () => {
    expect(tokens("#include <vector>\nint *p = nullptr;", "cpp")).toBe(
      "[preprocessor:#include <vector>]\n[type:int] *p = [literal:nullptr];",
    );
  });

  test("Rust attributes, macros, chars and lifetimes", () => {
    expect(tokens("#[derive(Debug)]\nfn f<'a>(c: char) { println!(\"{}\", 'c') }", "rust")).toBe(
      "[decorator:#[derive(Debug)]]\n[keyword:fn] f<'a>(c: [type:char]) { [macro:println!]([string:\"{}\"], [string:'c']) }",
    );
  });

  test("shell comments start only at a word boundary", () => {
    expect(tokens('echo "$HOME" $# ${#a} # note', "shell")).toBe(
      '[function:echo] [string:"$HOME"] [variable:$#] [variable:${#a}] [comment:# note]',
    );
  });

  test("Go raw strings may span lines", () => {
    expect(tokens("s := `a\nb`", "go")).toBe("s := [string:`a\nb`]");
  });

  test("Java annotations", () => {
    expect(tokens("@ForceInline\nvoid f()", "java")).toBe(
      "[decorator:@ForceInline]\n[type:void] [function:f]()",
    );
  });

  test("every language has display metadata", () => {
    for (const language of Object.keys(SYNTAX_RULES)) {
      expect(LANGUAGES[language]?.badge).toBeTruthy();
    }
  });
});

describe("code points (B10)", () => {
  test("types are reported per code point", () => {
    const code = 'x = "😀" + 1';
    const types = classifyChars(code, "python");
    expect(types).toHaveLength([...code].length);
    expect(types[5]).toBe("string");
    expect(types[types.length - 1]).toBe("number");
  });

  test("toCodePointTypes maps surrogate pairs to one entry", () => {
    expect(toCodePointTypes("a😀b", ["x", "y", "y", "z"])).toEqual(["x", "y", "z"]);
  });
});

describe("detectLanguage", () => {
  test.each([
    ["main.py", "python"],
    ["gui.PYW", "python"],
    ["stubs.pyi", "python"],
    ["vector.hpp", "cpp"],
    ["main.c", "cpp"],
    ["lib.rs", "rust"],
    ["index.js", "javascript"],
    ["App.jsx", "javascript"],
    ["arrays.ts", "typescript"],
    ["view.tsx", "typescript"],
    ["strings.go", "go"],
    ["Objects.java", "java"],
    ["install.sh", "shell"],
    [".bashrc", "shell"],
    ["src/deep/path/file.go", "go"],
    ["Makefile", "generic"],
    ["notes.txt", "generic"],
    [".gitignore", "generic"],
    ["", "generic"],
  ])("%s -> %s", (name, language) => {
    expect(detectLanguage(name)).toBe(language);
  });
});
