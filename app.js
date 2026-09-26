const snippets = {
  python: {
    stdlib: { repo: "cpython", path: "/ Lib / asyncio / runners.py", icon: "⌘", code: `def run(main, *, debug=None):\n    \"\"\"Execute the coroutine and return the result.\n\n    This function runs the passed coroutine, taking care of managing the\n    asyncio event loop, finalizing asynchronous generators, and closing the\n    default executor.\n    \"\"\"\n    with Runner(debug=debug) as runner:\n        return runner.run(main)` },
    requests: { repo: "psf/requests", path: "/ src / requests / sessions.py", icon: "◈", code: `def send(self, request, **kwargs):\n    \"\"\"Send a PreparedRequest.\n\n    :param request: The PreparedRequest being sent.\n    :param stream: (optional) Whether to stream the request content.\n    \"\"\"\n    adapter = self.get_adapter(url=request.url)\n    start = preferred_clock()\n    r = adapter.send(request, **kwargs)\n    elapsed = preferred_clock() - start\n    r.elapsed = timedelta(seconds=elapsed)\n    return r` }
  },
  cpp: { stdlib: { repo: "llvm-project", path: "/ libcxx / include / algorithm", icon: "◆", code: `template <class _InputIterator, class _OutputIterator>\n_LIBCPP_CONSTEXPR_SINCE_CXX20\n_OutputIterator copy(_InputIterator __first,\n                     _InputIterator __last,\n                     _OutputIterator __result) {\n  for (; __first != __last; ++__first, ++__result)\n    *__result = *__first;\n  return __result;\n}` } },
  rust: { stdlib: { repo: "rust-lang/rust", path: "/ library / alloc / string.rs", icon: "⚙", code: `pub fn from_utf8(v: Vec<u8>) -> Result<String, FromUtf8Error> {\n    match str::from_utf8(&v) {\n        Ok(_) => Ok(String { vec: v }),\n        Err(e) => Err(FromUtf8Error { bytes: v, error: e }),\n    }\n}\n\npub fn into_bytes(self) -> Vec<u8> {\n    self.vec\n}` } }
};

const display = document.querySelector("#code-display");
const input = document.querySelector("#typing-input");
const windowEl = document.querySelector("#code-window");
const sourceSelect = document.querySelector("#source-select");
const fileInput = document.querySelector("#file-input");
const githubButton = document.querySelector("#github-button");
const githubImport = document.querySelector("#github-import");
const githubUrl = document.querySelector("#github-url");
const githubLoad = document.querySelector("#github-load");
const punishmentToggle = document.querySelector("#punishment-toggle");
const randomStartToggle = document.querySelector("#random-start-toggle");
const countdownSeconds = document.querySelector("#countdown-seconds");
const startCountdown = document.querySelector("#start-countdown");
const themeToggle = document.querySelector("#theme-toggle");
const restartButton = document.querySelector("#restart");
let language = "python", source = "python-stdlib", target = "", startedAt = 0, elapsedMs = 0, timerId = null, countdownTimer = null, done = false, paused = false;
let syntaxRanges = [];
let currentItem;
let punishmentTimer = null;
let randomStart = false;
let lastEscapeAt = 0;
const examples = [
  { id: "python-stdlib", language: "python", repo: "cpython", path: "/ Lib / asyncio / runners.py", icon: "⌘", code: snippets.python.stdlib.code },
  { id: "python-requests", language: "python", repo: "psf/requests", path: "/ src / requests / sessions.py", icon: "◈", code: snippets.python.requests.code },
  { id: "cpp-stdlib", language: "cpp", repo: "llvm-project", path: "/ libcxx / include / algorithm", icon: "◆", code: snippets.cpp.stdlib.code },
  { id: "rust-stdlib", language: "rust", repo: "rust-lang/rust", path: "/ library / alloc / string.rs", icon: "⚙", code: snippets.rust.stdlib.code }
];

const syntaxRules = {
  python: [
    ["comment", /#[^\n]*/g],
    ["string", /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g],
    ["decorator", /@[A-Za-z_]\w*/g],
    ["keyword", /\b(?:and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|if|import|in|is|lambda|match|not|or|pass|raise|return|try|while|with|yield)\b/g],
    ["literal", /\b(?:False|None|True)\b/g],
    ["type", /\b(?:Any|Callable|Dict|Iterable|List|Optional|Set|Tuple|Type|bool|bytes|dict|float|int|list|object|set|str|tuple)\b/g],
    ["number", /\b\d+(?:\.\d+)?\b/g],
    ["function", /\b[A-Za-z_]\w*(?=\s*\()/g]
  ],
  cpp: [
    ["comment", /\/\/[^\n]*|\/\*[\s\S]*?\*\//g],
    ["string", /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g],
    ["preprocessor", /^\s*#\s*\w+.*$/gm],
    ["keyword", /\b(?:alignas|auto|bool|break|case|catch|class|const|constexpr|continue|decltype|default|delete|else|enum|explicit|export|extern|for|friend|if|inline|namespace|new|nullptr|operator|private|protected|public|return|sizeof|static|struct|switch|template|this|throw|try|typedef|typename|using|virtual|void|while)\b/g],
    ["literal", /\b(?:false|nullptr|true)\b/g],
    ["type", /\b(?:allocator|char|double|float|int|long|size_t|string|unsigned|vector)\b/g],
    ["number", /\b\d+(?:\.\d+)?\b/g],
    ["function", /\b[A-Za-z_]\w*(?=\s*\()/g]
  ],
  rust: [
    ["comment", /\/\/[^\n]*|\/\*[\s\S]*?\*\//g],
    ["string", /"(?:\\.|[^"\\])*"/g],
    ["macro", /\b[A-Za-z_]\w*!(?=\s*\()/g],
    ["keyword", /\b(?:as|async|await|break|const|continue|crate|dyn|else|enum|extern|fn|for|if|impl|in|let|loop|match|mod|move|mut|pub|ref|return|self|Self|static|struct|super|trait|type|unsafe|use|where|while)\b/g],
    ["literal", /\b(?:false|None|Some|true)\b/g],
    ["type", /\b(?:Result|String|Vec|bool|char|f32|f64|i32|i64|str|u32|u64|usize)\b/g],
    ["number", /\b\d+(?:\.\d+)?\b/g],
    ["function", /\b[A-Za-z_]\w*(?=\s*\()/g]
  ]
};

function activeSnippet() {
  return currentItem || examples[0];
}
function render() {
  clearInterval(timerId);
  clearInterval(countdownTimer);
  startedAt = 0;
  elapsedMs = 0;
  timerId = null;
  paused = false;
  exitChallengeMode();
  setTimerState("idle");
  const item = activeSnippet();
  currentItem = item;
  const lines = item.code.split("\n");
  const startLine = randomStart ? chooseRandomStart(lines) : 0;
  target = lines.slice(startLine).join("\n");
  language = item.language || detectLanguage(item.filename || item.path || item.repo);
  syntaxRanges = buildSyntaxRanges(target, language);
  document.querySelector("#repo-name").textContent = item.repo;
  document.querySelector("#repo-path").textContent = ` ${item.path}${startLine ? ` · starts at line ${startLine + 1}` : ""}`;
  document.querySelector("#repo-icon").textContent = item.icon;
  document.querySelector("#line-count").textContent = `${String(target.split("\n").length).padStart(2, "0")} lines`;
  input.value = "";
  done = false;
  windowEl.classList.remove("complete");
  document.querySelector("#typing-status").textContent = "CLICK TO START TYPING";
  updateDisplay();
  updateStats();
  updatePunishment();
}
function setTimerState(state) {
  const timeStat = document.querySelector(".time-stat");
  const indicator = document.querySelector("#timer-indicator");
  timeStat.classList.remove("running", "paused", "countdown");
  if (state !== "idle") timeStat.classList.add(state);
  indicator.setAttribute("aria-label", `Timer ${state}`);
}
function chooseRandomStart(lines) {
  const candidates = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.trim().length > 0)
    .map(({ index }) => index);
  return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : 0;
}
function buildSyntaxRanges(code, lang) {
  const ranges = [];
  for (const [type, rule] of (syntaxRules[lang] || syntaxRules.generic)) {
    for (const match of code.matchAll(rule)) {
      ranges.push({ start: match.index, end: match.index + match[0].length, type });
    }
  }
  return ranges.sort((a, b) => a.start - b.start);
}
syntaxRules.generic = [
  ["comment", /#[^\n]*|\/\/[^\n]*|\/\*[\s\S]*?\*\//g],
  ["string", /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g],
  ["keyword", /\b(?:class|const|def|else|for|fn|function|if|import|let|new|public|return|static|struct|var|void|while)\b/g],
  ["literal", /\b(?:false|null|true|None|nil)\b/g],
  ["number", /\b\d+(?:\.\d+)?\b/g],
  ["function", /\b[A-Za-z_]\w*(?=\s*\()/g]
];
function detectLanguage(filename) {
  const extension = filename.toLowerCase().split(".").pop();
  if (["py", "pyw"].includes(extension)) return "python";
  if (["c", "cc", "cpp", "cxx", "h", "hpp"].includes(extension)) return "cpp";
  if (extension === "rs") return "rust";
  return "generic";
}
function syntaxClassAt(index) {
  const range = syntaxRanges.find(({ start, end }) => index >= start && index < end);
  return range ? `syntax-${range.type}` : "";
}
function updateDisplay() {
  const typed = input.value;
  display.innerHTML = [...target].map((char, i) => {
    const typedChar = typed[i];
    const whitespace = /\s/.test(char) || (typedChar && /\s/.test(typedChar));
    const state = i < typed.length
      ? whitespace ? "" : typedChar === char ? "correct" : "incorrect"
      : i === typed.length ? "current" : "";
    return `<span class="char ${state} ${syntaxClassAt(i)}">${char === "\n" ? "\n" : escapeHtml(char)}</span>`;
  }).join("");
  const current = display.querySelector(".current");
  if (current) {
    const lineHeight = parseFloat(getComputedStyle(display).lineHeight);
    const currentLine = target.slice(0, input.value.length).split("\n").length - 1;
    display.scrollTop = Math.max(0, currentLine * lineHeight - display.clientHeight / 2 + lineHeight);
  }
  document.querySelector(".click-hint").style.opacity = typed ? "0" : "1";
}
function escapeHtml(value) { return value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c])); }
function codeOnly(sourceText) {
  const lines = sourceText.replace(/\r\n?/g, "\n").split("\n");
  const result = [];
  let inBlockComment = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const startsBlock = /^(\/\*|\*\/|```)/.test(trimmed);
    const commentOnly = inBlockComment ||
      /^(#|\/\/|\/\*|\*|```)/.test(trimmed) ||
      startsBlock;

    if (trimmed.includes("/*") && !trimmed.includes("*/")) inBlockComment = true;
    if (inBlockComment && trimmed.includes("*/")) inBlockComment = false;
    if (!commentOnly && trimmed) result.push(line);
  }

  return result.join("\n");
}
function updateStats() {
  const typed = input.value;
  const runningMs = startedAt ? Date.now() - startedAt : 0;
  const elapsed = (elapsedMs + runningMs) / 1000;
  const correct = [...typed].filter((char, i) => char === target[i]).length;
  const accuracy = typed.length ? Math.round(correct / typed.length * 100) : 100;
  const progress = target ? Math.min(100, Math.round(typed.length / target.length * 100)) : 0;
  document.querySelector("#accuracy").textContent = accuracy;
  document.querySelector("#progress").textContent = progress;
  document.querySelector("#progress-bar").style.width = `${progress}%`;
  document.querySelector("#wpm").textContent = elapsed ? Math.round(correct / 5 / (elapsed / 60)) : 0;
  document.querySelector("#time").textContent = formatTime(elapsed);
}
function formatTime(seconds) { return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`; }
function enterChallengeMode() {
  document.body.classList.add("challenge-active");
}
function exitChallengeMode() {
  document.body.classList.remove("challenge-active");
  input.blur();
}
function start() {
  if (done || paused) return;
  if (!startedAt) {
    startedAt = Date.now();
    enterChallengeMode();
    setTimerState("running");
    timerId = setInterval(updateStats, 250);
  }
}
function restartChallenge() {
  render();
  elapsedMs = 0;
  paused = false;
  clearInterval(countdownTimer);
  countdownTimer = null;
  exitChallengeMode();
  setTimerState("idle");
  input.blur();
}
function startChallenge() {
  clearInterval(countdownTimer);
  render();
  elapsedMs = 0;
  paused = false;
  const seconds = Math.min(60, Math.max(0, Number.parseInt(countdownSeconds.value, 10) || 0));
  localStorage.setItem("codetype-countdown", String(seconds));
  if (seconds === 0) {
    beginChallenge();
    return;
  }
  let remaining = seconds;
  enterChallengeMode();
  setTimerState("countdown");
  document.querySelector("#typing-status").textContent = `STARTING IN ${remaining}`;
  countdownTimer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      beginChallenge();
    } else {
      document.querySelector("#typing-status").textContent = `STARTING IN ${remaining}`;
    }
  }, 1000);
}
function beginChallenge() {
  clearInterval(timerId);
  startedAt = 0;
  elapsedMs = 0;
  paused = false;
  enterChallengeMode();
  setTimerState("idle");
  document.querySelector("#typing-status").textContent = "READY · TYPE TO START TIMER";
  updateStats();
  input.focus();
}
startCountdown.addEventListener("click", startChallenge);
function pauseChallenge() {
  if (!startedAt || paused || done) return;
  elapsedMs += Date.now() - startedAt;
  startedAt = 0;
  paused = true;
  clearInterval(timerId);
  timerId = null;
  setTimerState("paused");
  document.querySelector("#typing-status").textContent = "PAUSED · PRESS A KEY TO RESUME";
}
function stopChallenge() {
  clearInterval(timerId);
  timerId = null;
  render();
}

input.addEventListener("input", () => {
  if (paused && !done) {
    paused = false;
    startedAt = Date.now();
    timerId = setInterval(updateStats, 250);
    enterChallengeMode();
  }
  start();
  if (input.value.length > target.length) input.value = input.value.slice(0, target.length);
  updateDisplay(); updateStats();
  updatePunishment();
  if (input.value === target && !done) { done = true; clearInterval(timerId); windowEl.classList.add("complete"); }
});
input.addEventListener("focus", () => {
  document.querySelector("#typing-status").textContent = "TYPING · TAB INSERTS A TAB";
});
input.addEventListener("keydown", event => {
  if (event.key !== "Tab") return;
  event.preventDefault();
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const lineStart = input.value.lastIndexOf("\n", start - 1) + 1;
  const targetIndent = target.slice(lineStart).match(/^ +/);
  const indentation = targetIndent && targetIndent[0].length >= 4 ? " ".repeat(4) : "\t";
  input.setRangeText(indentation, start, end, "end");
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
windowEl.addEventListener("click", () => input.focus());
restartButton.addEventListener("click", restartChallenge);
function hasTypingError() {
  return [...input.value].some((char, index) => {
    const expected = target[index];
    return expected && !(/\s/.test(char) || /\s/.test(expected)) && char !== expected;
  });
}
function updatePunishment() {
  clearTimeout(punishmentTimer);
  if (!document.body.classList.contains("punishment-enabled") || !hasTypingError()) {
    document.body.classList.remove("punishment-shaking");
    return;
  }
  document.body.classList.add("punishment-shaking");
  punishmentTimer = setTimeout(() => document.body.classList.remove("punishment-shaking"), 750);
}
punishmentToggle.addEventListener("click", () => {
  const enabled = punishmentToggle.getAttribute("aria-pressed") !== "true";
  punishmentToggle.setAttribute("aria-pressed", String(enabled));
  punishmentToggle.textContent = enabled ? "⚡ Punishment on" : "⚡ Punishment off";
  document.body.classList.toggle("punishment-enabled", enabled);
  localStorage.setItem("codetype-punishment", enabled ? "on" : "off");
  updatePunishment();
});
randomStartToggle.addEventListener("click", () => {
  randomStart = randomStartToggle.getAttribute("aria-pressed") !== "true";
  randomStartToggle.setAttribute("aria-pressed", String(randomStart));
  randomStartToggle.textContent = randomStart ? "↝ Random start on" : "↝ Random start off";
  localStorage.setItem("codetype-random-start", randomStart ? "on" : "off");
  render();
});
sourceSelect.addEventListener("change", () => {
  source = sourceSelect.value;
  currentItem = source === "custom" ? JSON.parse(localStorage.getItem("codetype-last-import") || "null") : examples.find(item => item.id === source);
  if (currentItem) render();
});
document.addEventListener("click", event => {
  const optionsMenu = document.querySelector(".options-menu");
  if (optionsMenu.open && !optionsMenu.contains(event.target)) optionsMenu.open = false;
});
document.querySelector("#import-button").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const imported = { id: "custom", filename: file.name, repo: file.name, path: "/ local file · comments skipped", icon: "↥", code: codeOnly(String(reader.result)) };
    localStorage.setItem("codetype-last-import", JSON.stringify(imported));
    currentItem = imported;
    source = "custom";
    sourceSelect.value = "custom";
    render();
  };
  reader.readAsText(file);
});
githubButton.addEventListener("click", () => { githubImport.hidden = !githubImport.hidden; if (!githubImport.hidden) githubUrl.focus(); });
githubLoad.addEventListener("click", async () => {
  const match = githubUrl.value.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
  if (!match) return alert("Paste a GitHub file URL in the format github.com/user/repo/blob/branch/file");
  const [, owner, repo, branch, path] = match;
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  githubLoad.disabled = true;
  try {
    const response = await fetch(rawUrl);
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    const imported = { id: "custom", filename: path, repo: `${owner}/${repo}`, path: `/ ${path} · comments skipped`, icon: "◆", code: codeOnly(await response.text()) };
    localStorage.setItem("codetype-last-import", JSON.stringify(imported));
    currentItem = imported;
    source = "custom";
    sourceSelect.value = "custom";
    render();
  } catch (error) {
    alert(`Could not load that GitHub file: ${error.message}`);
  } finally { githubLoad.disabled = false; }
});
document.addEventListener("keydown", event => {
  if (event.key !== "Escape" || !startedAt && !paused && !countdownTimer) return;
  event.preventDefault();
  const now = Date.now();
  if (now - lastEscapeAt < 450) {
    stopChallenge();
  } else {
    pauseChallenge();
  }
  lastEscapeAt = now;
});
function setTheme(dark) {
  document.body.classList.toggle("dark", dark);
  themeToggle.textContent = dark ? "☀" : "☾";
  themeToggle.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  localStorage.setItem("codetype-theme", dark ? "dark" : "light");
}
themeToggle.addEventListener("click", () => setTheme(!document.body.classList.contains("dark")));
setTheme(localStorage.getItem("codetype-theme") === "dark");
const punishmentEnabled = localStorage.getItem("codetype-punishment") === "on";
punishmentToggle.setAttribute("aria-pressed", String(punishmentEnabled));
punishmentToggle.textContent = punishmentEnabled ? "⚡ Punishment on" : "⚡ Punishment off";
document.body.classList.toggle("punishment-enabled", punishmentEnabled);
randomStart = localStorage.getItem("codetype-random-start") === "on";
randomStartToggle.setAttribute("aria-pressed", String(randomStart));
randomStartToggle.textContent = randomStart ? "↝ Random start on" : "↝ Random start off";
countdownSeconds.value = localStorage.getItem("codetype-countdown") || "0";
const savedImport = localStorage.getItem("codetype-last-import");
if (savedImport) {
  try {
    currentItem = JSON.parse(savedImport);
    source = "custom";
  } catch {
    localStorage.removeItem("codetype-last-import");
  }
}
sourceSelect.value = source;
render();
window.addEventListener("pageshow", () => {
  clearInterval(timerId);
  clearInterval(countdownTimer);
  startedAt = 0;
  elapsedMs = 0;
  paused = false;
  exitChallengeMode();
  input.blur();
  updateStats();
});
