// How a path that does not fit its field is shown (measured in LabVIEW 2026 Q3, reports/2026-10-26-path-type.md §1): the
// leading part is replaced by "..." and the last components stay, as in "...\f" and "...\file name.txt". Pure.

const ELLIPSIS = "...";

/** The separator a text written with `rules` ("windows" or "posix") uses between components. */
const separatorOf = (rules) => (rules === "windows" ? "\\" : "/");

/**
 * `text` as it is shown when `fits(candidate)` says whether a text is narrow enough: itself if it fits, otherwise "..."
 * and the most components from its end that still fit, at least the last one (which is cut by the field if it is too long
 * on its own). That LabVIEW keeps as many components as fit, and not one, is unverified.
 */
export function abbreviatePath(text, fits, rules) {
  if (fits(text)) return text;
  const separator = separatorOf(rules);
  const components = text.split(separator).filter((component) => component !== "");
  let shown = `${ELLIPSIS}${separator}${components.at(-1) ?? ""}`;
  for (let kept = 2; kept < components.length; kept++) {
    const candidate = `${ELLIPSIS}${separator}${components.slice(-kept).join(separator)}`;
    if (!fits(candidate)) break;
    shown = candidate;
  }
  return shown;
}
