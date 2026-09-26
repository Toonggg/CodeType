/**
 * Mounts the real index.html body into jsdom and boots the app with a controllable clock.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createApp } from "../../src/app.js";
import { getElements } from "../../src/ui/dom.js";

const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];

export function mountApp(options = {}) {
  document.body.className = "";
  document.body.innerHTML = body;
  const els = getElements();
  const app = createApp(els, { now: () => Date.now(), random: () => 0, ...options });
  app.init();
  return { app, els };
}

/** Replaces the textarea value and fires an input event, like a keystroke would. */
export function typeValue(els, value) {
  els.input.value = value;
  els.input.dispatchEvent(new Event("input", { bubbles: true }));
}

export function pressKey(target, key, init = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}
