// When a page's window may be shown: once the page has painted itself, not when its HTML has loaded.
//
// An OVI's page has an empty body until its first paint, which comes after its module has read the inventory, the
// catalog and the OVI: shown at `did-finish-load` its window was blank for 100 to 320 ms, and docked the toolbar row
// went empty for ~700 ms (reports/2026-11-21-visual-faults-editor.md). The page says it has painted (`page:painted`);
// a page that never says so, because it failed while loading, is still shown after a while, as it was before, so that
// a broken page is seen rather than lost.

/** How long after its HTML has loaded a page that has not painted is shown anyway. */
export const UNPAINTED_PAGE_DEADLINE_MS = 3000;

/**
 * `onReady()` is called once: when the page has painted, or `UNPAINTED_PAGE_DEADLINE_MS` after it loaded without
 * painting. `setTimer(callback, ms)` is the main process's `setTimeout`. Returns `{ loaded(), painted() }`.
 */
export function createFirstPaintGate({ onReady, setTimer = setTimeout }) {
  let ready = false;
  const becomeReady = () => {
    if (ready) return;
    ready = true;
    onReady();
  };
  return {
    loaded: () => setTimer(becomeReady, UNPAINTED_PAGE_DEADLINE_MS),
    painted: becomeReady,
  };
}
