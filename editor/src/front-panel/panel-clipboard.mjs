// Copy, cut, paste and Select All on the Front Panel (Edit menu, Ctrl+C, Ctrl+X,
// Ctrl+V and Ctrl+A), as measured in labview-captures/create-paste/ (REPORT.md §C).
// Pure functions over the panel state of front-panel.mjs.
//
// The fragment is the same plain data the diagram uses (core/model/clipboard.mjs),
// so a control copied on the panel can be pasted on a diagram and the other way
// round. Pasted on the panel it is centred on the pointer with a numbered label
// and gets its diagram terminal, unwired.

import { ALTO_LINEA } from "../common/labels.mjs";
import { MEDIDAS_PANEL, caja, objetos } from "./front-panel.mjs";
import { REPEATED_PASTE_STEP, remember, repeatCount } from "../common/paste-memory.mjs";
import { copyFragment, pasteFragment } from "../../../core/model/clipboard.mjs";
import * as Gr from "../../../core/model/graph.mjs";

const LABEL_SUFFIX = "#etiqueta";
/** The panel objects selected, without their labels. */
export const selectedObjects = (p) => p.seleccion.filter((id) => !id.endsWith(LABEL_SUFFIX) && p.g.nodos.some((n) => n.id === id && n.panel));

/** Is there something Copy, Cut and Delete can act on? */
export const hasSelection = (p) => selectedObjects(p).length > 0;

/** Ctrl+C on the panel: the selected objects, without wires (a wire is not part of the panel). */
export function copySelection(p) {
  const ids = selectedObjects(p);
  return ids.length ? { ...copyFragment(p.g, ids), wires: [] } : null;
}

/** Ctrl+X on the panel: the fragment, and the panel without those objects (their terminals go with them, as Delete does). */
export function cutSelection(p) {
  const fragment = copySelection(p);
  return fragment ? { fragment, p: { ...p, g: Gr.borrar(p.g, selectedObjects(p)), seleccion: [] } } : null;
}

/** Ctrl+A on the panel: every object. */
export const selectAll = (p) => ({ ...p, seleccion: objetos(p.g).map((n) => n.id), accion: null, menu: null });

/** The middle of the boxes of the panel objects of a fragment, each with the label above it. */
function fragmentCentre(nodes) {
  const boxes = nodes.map((n) => caja(n));
  const room = ALTO_LINEA + MEDIDAS_PANEL.separacion;
  const [left, right] = [Math.min(...boxes.map((b) => b.x)), Math.max(...boxes.map((b) => b.x + b.ancho))];
  const [top, bottom] = [Math.min(...boxes.map((b) => b.y - room)), Math.max(...boxes.map((b) => b.y + b.alto))];
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}

/**
 * Ctrl+V on the panel: the controls and indicators of the fragment, centred on
 * `pointer`, with the labels numbered and their terminals made on the diagram,
 * unwired, a little down and to the right of where they were (where LabVIEW puts
 * them is unverified). Pasting again without moving the pointer shifts the copy
 * by 8 px more each time. Returns `{ p, memory }`, or `{ p }` untouched when
 * the fragment has no panel object.
 */
export function pasteAt(p, ctx, fragment, pointer, memory) {
  const nodes = fragment.nodes.filter((n) => n.panel);
  if (!nodes.length) return { p, memory };
  const count = repeatCount(memory, pointer);
  const centre = fragmentCentre(nodes);
  const [panelDx, panelDy] = [Math.round(pointer.x + count * REPEATED_PASTE_STEP - centre.x), Math.round(pointer.y + count * REPEATED_PASTE_STEP - centre.y)];
  const diagramShift = REPEATED_PASTE_STEP * (count + 1);
  const pasted = pasteFragment(p.g, { nodes, wires: [] }, { dx: diagramShift, dy: diagramShift, panelDx, panelDy });
  return { p: { ...p, g: pasted.g, seleccion: pasted.ids, accion: null, edicion: null, menu: null }, memory: remember(pointer, count) };
}
