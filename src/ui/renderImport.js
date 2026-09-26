/**
 * Import state: the GitHub form, busy state, inline errors (Q18) and notices.
 *
 * The error and notice elements stay in the page (collapsed when empty) so that
 * their live regions announce new messages reliably.
 */
export function renderImport(els, state, prev) {
  if (!prev || state.githubFormOpen !== prev.githubFormOpen) {
    els.githubForm.hidden = !state.githubFormOpen;
    els.githubButton.setAttribute("aria-expanded", String(state.githubFormOpen));
  }
  if (!prev || state.importBusy !== prev.importBusy) {
    els.githubLoad.disabled = state.importBusy;
    els.githubLoad.textContent = state.importBusy ? "Loading…" : "Load";
    els.importButton.disabled = state.importBusy;
  }
  if (!prev || state.importError !== prev.importError) {
    els.importError.textContent = state.importError ?? "";
    els.importError.dataset.empty = String(!state.importError);
  }
  if (!prev || state.notices !== prev.notices) {
    els.noticeText.textContent = state.notices.join(" ");
    els.notice.dataset.empty = String(state.notices.length === 0);
    els.noticeDismiss.hidden = state.notices.length === 0;
  }
}
