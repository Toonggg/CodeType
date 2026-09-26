import { createHash } from "node:crypto";
import { defineConfig } from "vite";

/**
 * The Content-Security-Policy of the built site (R5, H15). Scripts, styles, fonts
 * and images come only from the site itself; the one inline script (the theme
 * bootstrap in index.html) is allowed by its hash; the only network request is
 * the GitHub import (src/import/github.js). frame-ancestors cannot be set in a
 * <meta> tag and needs a response header from the host.
 */
export const CSP_DIRECTIVES = {
  "default-src": ["'self'"],
  "script-src": ["'self'"],
  "style-src": ["'self'"],
  "img-src": ["'self'"],
  "font-src": ["'self'"],
  "connect-src": ["https://raw.githubusercontent.com"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
};

const inlineScriptHash = (body) =>
  `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`;

/**
 * Adds the policy as the first element of <head> in production builds only: the
 * dev server needs Vite's inline styles and its hot-reload socket.
 */
export function contentSecurityPolicy() {
  return {
    name: "codetype-csp",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(([, body]) =>
          inlineScriptHash(body),
        );
        const directives = { ...CSP_DIRECTIVES };
        directives["script-src"] = [...directives["script-src"], ...hashes];
        const policy = Object.entries(directives)
          .map(([name, values]) => `${name} ${values.join(" ")}`)
          .join("; ");
        const anchor = '<meta charset="UTF-8" />';
        if (!html.includes(anchor)) throw new Error(`codetype-csp: "${anchor}" not found`);
        return html.replace(
          anchor,
          `${anchor}\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
        );
      },
    },
  };
}

export default defineConfig({
  // Relative asset URLs so the built site works from any sub-path.
  base: "./",
  plugins: [contentSecurityPolicy()],
  test: {
    include: ["tests/**/*.test.js"],
  },
});
