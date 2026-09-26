/**
 * CodeType entry point.
 */
import { createApp } from "./app.js";
import { getElements } from "./ui/dom.js";

createApp(getElements()).init();

// Comments use the italic face. Once the fonts on screen have loaded, fetch it too, so
// it is ready when comment lines appear instead of swapping in then. Waiting keeps it
// from competing with those fonts. It is not preloaded: comments are hidden by default,
// and a preload that goes unused triggers a console warning.
document.fonts?.ready.then(() => document.fonts.load('italic 400 1em "DM Mono"')).catch(() => {});
