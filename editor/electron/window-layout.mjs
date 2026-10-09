// Where the windows of a VI go on the screen, as LabVIEW places them
// (labview-captures/editor-checks/REPORT.md §4 and §7). Pure functions over the
// work area of the screen, so the rules are tested without Electron.

import { WINDOW_KINDS } from "./vi-registry.mjs";

/** The outer size of both windows of a new VI, title bar included. */
export const NEW_VI_SIZE = { width: 1090, height: 696 };

/** The Block Diagram sits this far left of and above the Front Panel, which is in front. */
export const DIAGRAM_OFFSET = { x: -49, y: -30 };

/** Each VI opened after the first sits this far down and right of the one before, so none hides another. */
export const CASCADE_STEP = 30;

/**
 * Where the pair of windows starts, as a share of the screen's free room (what
 * is left of the work area once the pair is placed): LabVIEW left 61 % of the
 * free width to the left of the pair and 39 % above it (unverified for other screens).
 */
const PAIR_PLACE = { horizontal: 0.61, vertical: 0.39 };

/** Window ▸ Tile Left and Right: the gap to the screen's edges and between the windows. */
const TILE = { sideMargin: 12, verticalMargin: 3, gap: 20 };

/**
 * The outer bounds of the Front Panel and the Block Diagram of the VI opened
 * as number `index` (0 for the first one). Both are `NEW_VI_SIZE`, scaled down
 * when the pair does not fit the work area `{ x, y, width, height }`.
 */
export function newVIBounds(workArea, index) {
  const pairWidth = NEW_VI_SIZE.width - DIAGRAM_OFFSET.x;
  const pairHeight = NEW_VI_SIZE.height - DIAGRAM_OFFSET.y;
  const scale = Math.min(1, workArea.width / pairWidth, workArea.height / pairHeight);
  const [width, height] = [Math.floor(NEW_VI_SIZE.width * scale), Math.floor(NEW_VI_SIZE.height * scale)];
  const offset = { x: Math.round(DIAGRAM_OFFSET.x * scale), y: Math.round(DIAGRAM_OFFSET.y * scale) };
  const free = { x: workArea.width - (width - offset.x), y: workArea.height - (height - offset.y) };
  const cascade = index * CASCADE_STEP;
  // The cascade never pushes the pair off the screen: the last place that fits is kept.
  const panel = {
    x: workArea.x + Math.min(Math.round(free.x * PAIR_PLACE.horizontal) - offset.x + cascade, workArea.width - width),
    y: workArea.y + Math.min(Math.round(free.y * PAIR_PLACE.vertical) - offset.y + cascade, workArea.height - height),
    width,
    height,
  };
  return { "front-panel": panel, "block-diagram": { ...panel, x: panel.x + offset.x, y: panel.y + offset.y } };
}

/** The bounds of Window ▸ Tile Left and Right: Front Panel on the left, Block Diagram on the right, no overlap. */
export function tiledBounds(workArea) {
  const width = Math.floor((workArea.width - 2 * TILE.sideMargin - TILE.gap) / 2);
  const bounds = { x: workArea.x + TILE.sideMargin, y: workArea.y + TILE.verticalMargin, width, height: workArea.height - 2 * TILE.verticalMargin };
  return { "front-panel": bounds, "block-diagram": { ...bounds, x: bounds.x + width + TILE.gap } };
}

/** Ctrl+E from one window of a VI goes to the other one. */
export const otherWindowKind = (kind) => WINDOW_KINDS.find((candidate) => candidate !== kind);
