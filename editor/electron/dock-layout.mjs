// Solder's docked view (DT-101): where each page goes in the docked window, which OVI tab is active, and the preference
// that says which view is on. Pure: dock-window.mjs applies it to Electron's views.

/** The two layouts: LabVIEW's floating windows, and Solder's docked window. */
export const LAYOUTS = Object.freeze({ FLOATING: "floating", DOCKED: "docked" });
export const FRONT_PANEL = "front-panel";
export const BLOCK_DIAGRAM = "block-diagram";

/** The Project Explorer's column on the left and the bar of tabs above the middle: a first version (DT-101 §5). */
export const LEFT_COLUMN_WIDTH = 300;
export const TAB_BAR_HEIGHT = 32;

/**
 * The rectangles of the docked window's parts, in its content area of `width` × `height`: the explorer (null when no
 * project is open), the bar of tabs, and the Front Panel and Block Diagram of the active OVI. Unsplit, both take the
 * whole middle and only one is shown; split (Ctrl+T), the Front Panel takes the left half and the Block Diagram the right.
 */
export function dockBounds({ width, height }, { hasExplorer, split }) {
  const left = hasExplorer ? Math.min(LEFT_COLUMN_WIDTH, Math.floor(width / 2)) : 0;
  const middleWidth = Math.max(0, width - left);
  const middleHeight = Math.max(0, height - TAB_BAR_HEIGHT);
  const explorer = hasExplorer ? { x: 0, y: 0, width: left, height } : null;
  const tabBar = { x: left, y: 0, width: middleWidth, height: TAB_BAR_HEIGHT };
  const middle = { x: left, y: TAB_BAR_HEIGHT, width: middleWidth, height: middleHeight };
  if (!split) return { explorer, tabBar, [FRONT_PANEL]: middle, [BLOCK_DIAGRAM]: middle };
  const half = Math.floor(middleWidth / 2);
  return {
    explorer,
    tabBar,
    [FRONT_PANEL]: { ...middle, width: half },
    [BLOCK_DIAGRAM]: { ...middle, x: left + half, width: middleWidth - half },
  };
}

/** The docked window's tabs: the open OVIs by id, newest last, the active one, which window each shows, and the split. */
export const emptyDock = () => ({ tabs: [], active: null, shown: {}, split: false });

/** An OVI's tab is opened, or brought forward if it is open; `kind`, the window to show (the Front Panel by default). */
export function activateTab(dock, id, kind) {
  const tabs = dock.tabs.includes(id) ? dock.tabs : [...dock.tabs, id];
  const shown = { ...dock.shown, [id]: kind ?? dock.shown[id] ?? FRONT_PANEL };
  return { ...dock, tabs, active: id, shown };
}

/** An OVI's tab is closed: the tab after it becomes active, or the one before when it was the last. */
export function closeTab(dock, id) {
  const index = dock.tabs.indexOf(id);
  if (index < 0) return dock;
  const tabs = dock.tabs.filter((tab) => tab !== id);
  const { [id]: _closed, ...shown } = dock.shown;
  const active = dock.active === id ? tabs[Math.min(index, tabs.length - 1)] ?? null : dock.active;
  return { ...dock, tabs, active, shown };
}

/** Ctrl+E in the docked window: the active OVI shows its other window. */
export function toggleShown(dock) {
  if (dock.active === null) return dock;
  const other = dock.shown[dock.active] === BLOCK_DIAGRAM ? FRONT_PANEL : BLOCK_DIAGRAM;
  return { ...dock, shown: { ...dock.shown, [dock.active]: other } };
}

/** Ctrl+T in the docked window: the middle is split in half, or joined again. */
export const toggleSplit = (dock) => ({ ...dock, split: !dock.split });

/** Whether a window of an OVI is on screen in the docked window. */
export function isOnScreen(dock, id, kind) {
  if (dock.active !== id) return false;
  return dock.split || dock.shown[id] === kind;
}

/** The application's preferences file, read: the layout, floating unless the file says docked. */
export function readPreferences(text) {
  let file = null;
  try {
    file = JSON.parse(text ?? "null");
  } catch {
    file = null;
  }
  return { layout: file?.layout === LAYOUTS.DOCKED ? LAYOUTS.DOCKED : LAYOUTS.FLOATING };
}

export const preferencesText = (preferences) => `${JSON.stringify({ layout: preferences.layout }, null, 2)}\n`;
