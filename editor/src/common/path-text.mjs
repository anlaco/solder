// How a path that does not fit its field is shown (measured in LabVIEW 2026 Q3, reports/2026-10-26-path-panel-compare.md, four
// data points): the root and the tail stay, the middle is replaced by "..." and the cut falls inside a component, as in
// `C:\...\dddd.txt`, `C:\...ree\file.txt`, `C:\...ive\file.txt`; when not even the root, "..." and the last component fit it
// is `...\...`. Pure.

const ELLIPSIS = "...";

/** The separator a text written with `rules` ("windows" or "posix") uses between components. */
const separatorOf = (rules) => (rules === "windows" ? "\\" : "/");

/** The root of a path as it is written: `C:\` on Windows, `/` on a POSIX host, nothing for a relative path. */
const rootOf = (text, rules) => (rules === "windows" ? (/^[A-Za-z]:\\/.exec(text)?.[0] ?? "") : text.startsWith("/") ? "/" : "");

/**
 * `text` as it is shown when `fits(candidate)` says whether a text is narrow enough: itself if it fits; otherwise the root,
 * "...", and as many trailing characters as fit, which always include the whole last component and the separator before it.
 * If even that does not fit, `...` and `...` around a separator. The rule is derived from four measurements and is unverified
 * beyond them (wider boxes, relative and UNC paths, POSIX and the "Path too long to fit" setting were not measured).
 */
export function abbreviatePath(text, fits, rules) {
  if (fits(text)) return text;
  const separator = separatorOf(rules);
  const root = rootOf(text, rules);
  const rest = text.slice(root.length);
  const lastComponentStart = Math.max(0, rest.lastIndexOf(separator));
  const abbreviated = (tailStart) => `${root}${ELLIPSIS}${rest.slice(tailStart)}`;
  if (!fits(abbreviated(lastComponentStart))) return `${ELLIPSIS}${separator}${ELLIPSIS}`;
  let tailStart = lastComponentStart;
  while (tailStart > 0 && fits(abbreviated(tailStart - 1))) tailStart--;
  return abbreviated(tailStart);
}
