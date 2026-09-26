// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { EXAMPLES } from "../src/data/examples.js";
import { STATUS } from "../src/state.js";
import { LANGUAGES } from "../src/syntax/languages.js";
import { mountApp, typeValue } from "./helpers/mount.js";

describe("built-in examples (U6)", () => {
  test("ids are unique and every language has at least two snippets", () => {
    expect(new Set(EXAMPLES.map((e) => e.id)).size).toBe(EXAMPLES.length);
    const perLanguage = {};
    for (const e of EXAMPLES) perLanguage[e.language] = (perLanguage[e.language] ?? 0) + 1;
    for (const [language, count] of Object.entries(perLanguage)) {
      expect(LANGUAGES[language], language).toBeDefined();
      expect(count, language).toBeGreaterThanOrEqual(2);
    }
  });

  test.each(EXAMPLES.map((e) => [e.id, e]))("%s is typeable on a standard keyboard", (_, e) => {
    expect(e.code).toMatch(/^[\t\n\x20-\x7e]+$/);
    expect(e.code.split("\n").filter((line) => line !== line.trimEnd())).toEqual([]);
    expect(e.code).toBe(e.code.trim());
    expect(e.label).toMatch(/ · /);
    expect(e.path).toMatch(/^\/ /);
  });
});

describe("every example can be completed in the app", () => {
  let app;
  let els;
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    ({ app, els } = mountApp());
  });
  afterEach(() => {
    app.destroy();
    vi.useRealTimers();
  });

  test.each(EXAMPLES.map((e) => [e.id]))("%s", (id) => {
    app.actions.toggleSkipComments(); // off: type every line, comments included
    app.actions.selectSource(id);
    const text = app.store.get().target.chars.join("");
    const example = EXAMPLES.find((e) => e.id === id);
    expect(text).toBe(example.code);
    els.input.focus();
    typeValue(els, text);
    expect(app.store.get().status).toBe(STATUS.COMPLETE);
  });
});
