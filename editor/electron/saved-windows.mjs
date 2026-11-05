// The windows saved with an OVI (DT-078). Pure functions over the file's text and the screens, tested without Electron.
//
// LabVIEW saves where both windows of a VI were and how far each was scrolled, and opens them there again; moving
// or scrolling a window does not make the VI modified, and a Save writes them all the same
// (labview-captures/reports/2026-11-05-scrollbars-and-window-bounds.md §B).

/** The file's text as an object, or null when it is not JSON (it is then left as it is). */
function parsedOrNull(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** The windows saved in an OVI's text, `{ "front-panel": { x, y, width, height, origin }, … }`, or null. */
export const savedWindows = (text) => (text ? parsedOrNull(text)?.layout?.windows ?? null : null);

/** The text with `windows` in its `layout`, written as the format writes every file (core/model/qvi-format.mjs `aTexto`). */
export function withWindows(text, windows) {
  const vi = parsedOrNull(text);
  if (!vi) return text;
  vi.layout = { ...vi.layout, windows };
  return `${JSON.stringify(vi, null, 2)}\n`;
}

/** The text with no windows: what tells whether an OVI has unsaved changes, which the windows never are. */
export function withoutWindows(text) {
  const vi = parsedOrNull(text);
  if (!vi?.layout?.windows) return text;
  const { windows, ...layout } = vi.layout;
  return `${JSON.stringify({ ...vi, layout }, null, 2)}\n`;
}

const overlaps = (bounds, area) => bounds.x < area.x + area.width && bounds.x + bounds.width > area.x && bounds.y < area.y + area.height && bounds.y + bounds.height > area.y;

/**
 * The bounds a window opens with: the saved ones when they still fall on one of the screens' `workAreas`
 * (a screen may have been unplugged since; unverified what LabVIEW does then), or else `fallback`.
 */
export function restoredBounds(saved, workAreas, fallback) {
  if (!saved || !(saved.width > 0 && saved.height > 0)) return fallback;
  const bounds = { x: saved.x, y: saved.y, width: saved.width, height: saved.height };
  return workAreas.some((area) => overlaps(bounds, area)) ? bounds : fallback;
}

/** What is saved of one window: its bounds and, when it was scrolled, its origin. */
export function windowRecord(bounds, origin) {
  const record = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  return origin && (origin.x || origin.y) ? { ...record, origin: { x: origin.x, y: origin.y } } : record;
}
