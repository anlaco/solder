// The window list of the Window menu in the Project Explorer (DT-099 §6). Measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-18-project-explorer-s3.md Q6): after the fixed rows come the VI windows, then the
// Project Explorers with the most recently activated first, numbered 1…N continuously, each row bringing its window to
// the front. The Getting Started window is not listed. Pure: the main process gives the titles.

/** The windows a row can stand for. */
export const LISTED_KINDS = Object.freeze({ OVI: "ovi", PROJECT: "project" });

/**
 * The rows of the list. `oviWindows` are `{ key, title }` in the order they are shown (unmeasured beyond the one example of
 * the report, where the newest OVI came first); `explorers` are `{ key, title, activation }`, a higher activation being
 * more recent. Each row is `{ key, kind, number, label, startsGroup }`; `startsGroup` is where a separator is drawn.
 */
export function windowListRows({ oviWindows, explorers }) {
  const recentFirst = [...explorers].sort((first, second) => second.activation - first.activation);
  const listed = [
    ...oviWindows.map((window, index) => ({ ...window, kind: LISTED_KINDS.OVI, startsGroup: index === 0 })),
    ...recentFirst.map((window, index) => ({ key: window.key, title: window.title, kind: LISTED_KINDS.PROJECT, startsGroup: index === 0 })),
  ];
  return listed.map(({ key, title, kind, startsGroup }, index) => ({ key, kind, number: index + 1, label: `${index + 1} ${title}`, startsGroup }));
}
