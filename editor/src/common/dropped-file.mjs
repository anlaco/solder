// Dragging an `.octl` from the Project Explorer's tree onto an OVI's Front Panel or Block Diagram (DT-107 §4). Measured in
// LabVIEW 2026 Q3 (labview-captures/reports/2026-11-25-placing-a-control.md Q3, Q4): on the panel a file of exactly one
// object places it, a control copied and a type definition linked, its box at the drop point minus (32, 6..14); on the
// diagram a type definition of one numeric places the linked constant near the drop point; a file of none or of several
// places nothing, silently. The explorer and the OVI are two windows, so the drag carries the file's absolute path under
// its own data type. Pure: the file's text and the path to store come from the caller.

import { controlToPlace } from "../front-panel/chosen-control.mjs";
import { constantToPlace } from "../window/chosen-constant.mjs";
import { resolveRelative } from "./ovi-paths.mjs";

/** The data type of a drag that carries a file's absolute path (the row's key travels as text/plain, to move items in the tree). */
export const FILE_DRAG_TYPE = "application/x-solder-file";

/**
 * Where the object's box lies from the drop point: x measured −32 both times; y −6 (type definition) and −14 (control), so
 * the middle is taken, since the rule behind the difference was not found (the report's "not verified").
 */
export const PANEL_DROP_OFFSET = Object.freeze({ x: 32, y: 10 });

const TYPE_DEFINITION_FILE = /\.octl$/i;

/**
 * The absolute path of the file a tree row can carry, or null: only a row with a stored path that is an `.octl` (an item, or a
 * file of an auto-populating folder). `storedPath` is relative to the project file `projectFile`, or absolute when the
 * project was never saved (null).
 */
export function draggableFilePath(storedPath, projectFile) {
  if (typeof storedPath !== "string" || !TYPE_DEFINITION_FILE.test(storedPath)) return null;
  return projectFile ? resolveRelative(projectFile, storedPath) : storedPath;
}

/** Does a drag (its `dataTransfer.types`) carry a file? Only then may the OVI's canvases accept it. */
export const carriesFile = (types) => Array.from(types ?? []).includes(FILE_DRAG_TYPE);

/** The top-left corner for the object dropped at `point`, in the panel's coordinates. */
export const panelCornerOfDrop = (point) => ({ x: Math.round(point.x - PANEL_DROP_OFFSET.x), y: Math.round(point.y - PANEL_DROP_OFFSET.y) });

/**
 * What the Front Panel places for the `.octl` `text` dropped at `point`: `{ bloque, config, placement }` with the corner in
 * `placement`, or null when the file does not hold exactly one object (nothing is placed, silently).
 */
export function controlDroppedOnPanel(text, catalog, storedPath, point) {
  const placed = controlToPlace(text, catalog, storedPath);
  return placed && { ...placed, placement: { ...placed.placement, corner: panelCornerOfDrop(point) } };
}

/**
 * What the Block Diagram places for the `.octl` `text`: a constant linked to a type definition of one numeric, as Select an
 * OVI... places it, or null. Where the constant lands is the caller's (the grab point of the block, at the drop point).
 */
export const constantDroppedOnDiagram = (text, catalog, storedPath) => constantToPlace(text, catalog, storedPath);
