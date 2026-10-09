// Copy, cut, paste and Select All on the Block Diagram (Edit menu and Ctrl+C,
// Ctrl+X, Ctrl+V and Ctrl+A), as measured in labview-captures/create-paste/
// (REPORT.md §B). Pure functions over the diagram state of diagram-editing.mjs.
//
// A copied fragment is plain data (core/model/clipboard.mjs), so the window can
// keep it for any other VI that is open. What the window also keeps is the
// "paste memory": where the last paste was done, to move the next one.

import { alojar, borrarConCables, copyableIds } from "./diagram-editing.mjs";
import { caja } from "./diagram-view.mjs";
import { copyFragment, pasteFragment } from "../../../core/model/clipboard.mjs";
import { REPEATED_PASTE_STEP, remember, repeatCount } from "../common/paste-memory.mjs";
import { placePastedPanelObjects } from "./terminal-creation.mjs";

/** Is there something Copy, Cut and Delete can act on? They are greyed out otherwise (edit-menu-diagram-nothing-selected.png). */
export const hasSelection = (d) => d.seleccion.length > 0;

/** Ctrl+C: the fragment the selection makes, or nothing when no node is selected. */
export function copySelection(d) {
  const ids = copyableIds(d);
  return ids.length ? copyFragment(d.g, ids) : null;
}

/** Ctrl+X: the fragment, and the diagram without the selection and its wires: Cut takes the wires, Delete leaves them broken (DT-046). */
export function cutSelection(d) {
  const fragment = copySelection(d);
  return fragment ? { fragment, d: borrarConCables(d) } : null;
}

/** The point at the middle of the boxes of the nodes of a fragment that are not inside another one. */
function fragmentCentre(fragment, ctx) {
  const inside = new Set(fragment.nodes.map((n) => n.id));
  const boxes = fragment.nodes.filter((n) => !inside.has(n.dentro)).map((n) => caja(n, ctx));
  const [left, right] = [Math.min(...boxes.map((b) => b.x)), Math.max(...boxes.map((b) => b.x + b.ancho))];
  const [top, bottom] = [Math.min(...boxes.map((b) => b.y)), Math.max(...boxes.map((b) => b.y + b.alto))];
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}

/**
 * Ctrl+V: the fragment, centred on `pointer`; a second paste with the pointer
 * where it was shifts the copy by 8 px more down and to the right each time.
 * The copies are selected, enter the structure they fall in, and the controls
 * among them get a new object on the panel. `memory` is what the last paste
 * left (or null); the new one is returned to keep for the next. One paste is
 * one change, so it is one step of undo.
 */
export function pasteAt(d, ctx, fragment, pointer, memory) {
  const count = repeatCount(memory, pointer);
  const centre = fragmentCentre(fragment, ctx);
  const [dx, dy] = [Math.round(pointer.x + count * REPEATED_PASTE_STEP - centre.x), Math.round(pointer.y + count * REPEATED_PASTE_STEP - centre.y)];
  const before = new Set(d.g.nodos.map((n) => n.id));
  const pasted = pasteFragment(d.g, fragment, { dx, dy, panelDx: 0, panelDy: 0 });
  const newIds = pasted.g.nodos.filter((n) => !before.has(n.id)).map((n) => n.id);
  const withPanelObjects = placePastedPanelObjects(pasted.g, ctx, newIds, ctx.panelSize);
  return {
    d: { ...d, g: alojar(withPanelObjects, ctx, pasted.ids), seleccion: pasted.ids, accion: null, edicion: null, menu: null, aviso: null },
    memory: remember(pointer, count),
  };
}
