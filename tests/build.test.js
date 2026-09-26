import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { CSP_DIRECTIVES, contentSecurityPolicy } from "../vite.config.js";

const html = readFileSync("index.html", "utf8");
const transform = (source) => contentSecurityPolicy().transformIndexHtml.handler(source);
const policyOf = (source) =>
  source.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];

describe("Content-Security-Policy (R5, H15)", () => {
  test("only applies to production builds", () => {
    expect(contentSecurityPolicy().apply).toBe("build");
  });

  test("is the first element after the charset, before any script", () => {
    const out = transform(html);
    const csp = out.indexOf('http-equiv="Content-Security-Policy"');
    expect(csp).toBeGreaterThan(out.indexOf('<meta charset="UTF-8" />'));
    expect(csp).toBeLessThan(out.indexOf("<script"));
  });

  test("allows the inline theme script by its exact hash and nothing else inline", () => {
    const body = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    const hash = createHash("sha256").update(body).digest("base64");
    const scriptSrc = policyOf(transform(html))
      .split("; ")
      .find((d) => d.startsWith("script-src"));
    expect(scriptSrc).toBe(`script-src 'self' 'sha256-${hash}'`);
    expect(policyOf(transform(html))).not.toMatch(/unsafe-inline|unsafe-eval/);
  });

  test("changing the inline script changes the hash", () => {
    const edited = html.replace("var dark = false;", "var dark = true;");
    expect(policyOf(transform(edited))).not.toBe(policyOf(transform(html)));
  });

  test("lets the GitHub import reach raw.githubusercontent.com only", () => {
    expect(CSP_DIRECTIVES["connect-src"]).toEqual(["https://raw.githubusercontent.com"]);
    const github = readFileSync("src/import/github.js", "utf8");
    expect(github).toContain("https://raw.githubusercontent.com/");
  });

  test("fails loudly if the page has no charset meta to anchor to", () => {
    expect(() => transform("<html><head></head></html>")).toThrow(/not found/);
  });
});

describe("favicons (H16)", () => {
  test("the SVG uses paths, not font-dependent text", () => {
    const svg = readFileSync("public/favicon.svg", "utf8");
    expect(svg).not.toMatch(/<text/);
    expect(svg).toMatch(/<path/);
  });

  test("every icon linked from the page exists", () => {
    const hrefs = [...html.matchAll(/<link rel="(?:icon|apple-touch-icon)" href="\/([^"]+)"/g)];
    expect(hrefs.map(([, file]) => file).sort()).toEqual([
      "apple-touch-icon.png",
      "favicon.ico",
      "favicon.svg",
    ]);
    for (const [, file] of hrefs) expect(existsSync(`public/${file}`), file).toBe(true);
  });
});
