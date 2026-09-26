/**
 * Queries every element the app needs exactly once (Q11). A missing element is a
 * programming error, so it throws with a clear message instead of failing later.
 */
const SELECTORS = {
  display: "#code-display",
  input: "#typing-input",
  window: "#code-window",
  sourceSelect: "#source-select",
  fileInput: "#file-input",
  importButton: "#import-button",
  githubButton: "#github-button",
  githubImport: "#github-import",
  githubUrl: "#github-url",
  githubLoad: "#github-load",
  punishmentToggle: "#punishment-toggle",
  randomStartToggle: "#random-start-toggle",
  autoIndentToggle: "#auto-indent-toggle",
  countdownSeconds: "#countdown-seconds",
  startCountdown: "#start-countdown",
  themeToggle: "#theme-toggle",
  restart: "#restart",
  optionsMenu: ".options-menu",
  optionsSummary: ".options-menu summary",
  practiceCard: ".practice-card",
  repoName: "#repo-name",
  repoPath: "#repo-path",
  repoIcon: "#repo-icon",
  lineCount: "#line-count",
  status: "#typing-status",
  clickHint: ".click-hint",
  timeStat: ".time-stat",
  timerIndicator: "#timer-indicator",
  wpm: "#wpm",
  accuracy: "#accuracy",
  time: "#time",
  progress: "#progress",
  progressBar: "#progress-bar",
};

export function getElements(root = document) {
  const els = {};
  for (const [name, selector] of Object.entries(SELECTORS)) {
    const el = root.querySelector(selector);
    if (!el) throw new Error(`CodeType: required element "${selector}" is missing from the page.`);
    els[name] = el;
  }
  return els;
}
