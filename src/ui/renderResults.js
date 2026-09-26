/**
 * The results panel shown on completion and the "best" stat (U2).
 */
import { historyKey, runsFor } from "../history.js";
import { formatTime } from "../stats.js";

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

export function resultSummary({ wpm, accuracy, elapsedMs, errors, corrections }) {
  return [
    `${wpm} WPM`,
    `${accuracy}% accuracy`,
    formatTime(elapsedMs / 1000),
    plural(errors, "error"),
    plural(corrections, "backspace"),
  ].join(" · ");
}

export function resultComparison({ isBest, previousBest }, best) {
  if (previousBest === null) return "Your first recorded run of this snippet.";
  if (isBest) return `Beats your previous best of ${previousBest} WPM.`;
  return `Your best for this snippet is ${best} WPM.`;
}

/** A compact "when": the time for today's runs, otherwise the day ("Sep 25"). */
export function formatWhen(iso, now = new Date(), locale = undefined) {
  const date = new Date(iso);
  return date.toDateString() === now.toDateString()
    ? date.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

function renderRuns(tbody, runs, current) {
  const rows = runs.map((run) => {
    const row = document.createElement("tr");
    const isCurrent = run === current;
    if (isCurrent) row.className = "is-current";
    const cells = [
      isCurrent ? "This run" : formatWhen(run.at),
      `${run.wpm} WPM`,
      `${run.accuracy}%`,
      formatTime(run.elapsedMs / 1000),
    ];
    for (const text of cells) {
      const cell = document.createElement("td");
      cell.textContent = text;
      row.append(cell);
    }
    return row;
  });
  tbody.replaceChildren(...rows);
}

export function renderResults(els, state, prev) {
  const key = historyKey(state.item);
  const best = state.history.best[key];
  if (!prev || state.history !== prev.history || state.item !== prev.item) {
    els.best.textContent = best === undefined ? "–" : String(best);
  }
  if (prev && state.lastResult === prev.lastResult) return;
  const result = state.lastResult;
  els.results.hidden = !result;
  if (!result) return;
  els.resultsBadge.hidden = !result.isBest;
  els.resultsBadge.textContent = result.previousBest === null ? "First run" : "New best";
  els.resultsSummary.textContent = resultSummary(result.run);
  els.resultsCompare.textContent = resultComparison(result, best);
  renderRuns(els.resultsRuns, runsFor(state.history, key), result.run);
}
