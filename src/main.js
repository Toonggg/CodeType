/**
 * CodeType entry point.
 */
import { createApp } from "./app.js";
import { getElements } from "./ui/dom.js";

createApp(getElements()).init();
