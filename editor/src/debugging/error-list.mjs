// The Error list window (View ▸ Error List, Ctrl+L, or the broken Run arrow):
// what stops a VI from running, as LabVIEW lists it (REPORT.md §5, captures 92-98).
//
// Pure: `collect` turns what the editor already knows (the broken wires `Gr.tipos`
// finds, the required inputs nobody wired, what the hierarchy and the compiler
// refuse) into rows; `view` in debug-view.mjs draws them. Warnings are not computed
// yet: the Show Warnings box is there and adds nothing.

import * as Gr from "../../../core/model/graph.mjs";
import { nodeDisplayName } from "./debug-plan.mjs";

export const GROUP_TITLE = "Block Diagram Errors";

/** What the Details box says of an unwired input (own words: the capture only fixes what it means). */
export const UNWIRED_DETAILS = "A required input of this function is not wired, or is wired in a way it cannot accept. Open the Context Help window to see which connections the function needs.";
const BROKEN_WIRE_DETAILS = "This wire cannot carry its data from one terminal to the other. Delete it or wire the terminals again.";

/**
 * The rows of the error list of a VI: `{ id, text, details, target }`, where `target` is the object
 * Show Error frames: `{ node }`, `{ wire }` or nothing.
 */
export function collect({ graph, catalog, resolved, hierarchyErrors = [], compileErrors = [], inventory }) {
  const rows = [];
  const nameOf = (nodeId) => nodeDisplayName(graph.nodos.find((node) => node.id === nodeId) ?? { tipo: "node" }, inventory);
  const unwired = new Set();

  for (const message of hierarchyErrors) rows.push({ id: `hierarchy.${rows.length}`, text: message, details: message, target: null });

  const wired = new Set(graph.cables.map((wire) => `${wire.a.nodo}.${wire.a.puerto}`));
  for (const node of graph.nodos) {
    if (catalog.bloque(node.tipo).panel) continue;
    const missing = catalog.puertos(node).in.some((port) => Gr.requerido(graph, node, port) && !wired.has(`${node.id}.${port.name}`));
    if (!missing) continue;
    unwired.add(node.id);
    rows.push({ id: `node.${node.id}`, text: `${nameOf(node.id)}: Contains unwired or bad terminal`, details: UNWIRED_DETAILS, target: { node: node.id } });
  }

  for (const wire of graph.cables) {
    const reason = resolved.cables.get(wire.id)?.roto;
    if (reason) rows.push({ id: `wire.${wire.id}`, text: `Wire: ${reason}`, details: `${reason} ${BROKEN_WIRE_DETAILS}`, target: { wire: wire.id } });
  }

  for (const error of compileErrors) {
    if (error.nodo && unwired.has(error.nodo)) continue;
    rows.push({ id: `compile.${rows.length}`, text: error.nodo ? `${nameOf(error.nodo)}: ${error.motivo}` : error.motivo, details: error.motivo, target: error.nodo ? { node: error.nodo } : null });
  }
  return rows;
}

/** "2 errors and warnings", as the label above the list (warnings, when computed, are added by the caller). */
export const countLabel = (rows) => `${rows.length} errors and warnings`;

export const initial = () => ({ open: false, showWarnings: false, selected: null });

/** Rows the list shows: the warnings do not exist yet, so Show Warnings changes nothing. */
export const visibleRows = (rows) => rows;

export function selectRow(state, rowId) {
  return { ...state, selected: rowId };
}
