// The Error list window (View ▸ Error List, Ctrl+L, or the broken Run arrow):
// what stops a VI from running, as LabVIEW lists it (REPORT.md §5, captures 92-98).
//
// Pure: `collect` turns what the editor already knows (the broken wires `Gr.tipos`
// finds, the required inputs nobody wired, what the hierarchy and the compiler
// refuse) into rows; `view` in debug-view.mjs draws them. `collectWarnings` finds what
// LabVIEW warns about without breaking the VI (labview-captures/reports/2026-10-16-warnings-frame-stops.md §A),
// shown only with Show Warnings, a setting of the session shared by every VI.

import * as Gr from "../../../core/model/graph.mjs";
import { nodeDisplayName } from "./debug-plan.mjs";

export const GROUP_TITLE = "Block Diagram Errors";
/** Every warning goes in one group, those of panel terminals too (measured: there is no Front Panel group). */
export const WARNING_GROUP_TITLE = "Block Diagram Warnings";

/**
 * The constants a user places and sets, which warn when nothing reads them. Measured on numeric and string
 * constants; the Boolean, enum, ring, array and error cluster constants are assumed to behave alike
 * (unverified), and the named constants of the palettes (pi, Tab…) are left out until measured.
 */
const USER_CONSTANTS = new Set(["const", "num-const", "str-const", "bool-const", "enum-const", "ring-const", "arr-const", "error-cluster-constant"]);
/** What the Details box says of each warning (own words). */
export const WARNING_DETAILS = {
  constant: "Nothing reads this constant on the block diagram. Wire it to an input or delete it.",
  terminal: "The terminal of this front panel control or indicator is not wired on the block diagram.",
};

/** What the Details box says of an unwired input (own words: the capture only fixes what it means). */
export const UNWIRED_DETAILS = "A required input of this function is not wired, or is wired in a way it cannot accept. Open the Context Help window to see which connections the function needs.";
const BROKEN_WIRE_DETAILS = "This wire cannot carry its data from one terminal to the other. Delete it or wire the terminals again.";
/**
 * What the Details box says of a wire with a loose end (own words; LabVIEW's measure what each case means,
 * labview-captures/broken-wires/REPORT.md §6): one that lost its source and one that reaches nothing.
 */
const LOOSE_WIRE_DETAILS = {
  [Gr.LOOSE_WIRE_REASONS.noSource]: "A wire needs exactly one data source, such as a control's terminal or a function output. Nothing feeds this wire, although it has sinks. Wire a source to its loose end (perhaps by changing an indicator to a control), or remove it with Edit > Remove Broken Wires.",
  [Gr.LOOSE_WIRE_REASONS.looseEnd]: "One end of this wire is not connected to any terminal. Wire the loose end to one, or choose Edit > Remove Broken Wires to delete every broken wire.",
};

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
    if (reason) rows.push({ id: `wire.${wire.id}`, text: `Wire: ${reason}`, details: LOOSE_WIRE_DETAILS[reason] ?? `${reason} ${BROKEN_WIRE_DETAILS}`, target: { wire: wire.id } });
  }

  for (const error of compileErrors) {
    if (error.nodo && unwired.has(error.nodo)) continue;
    rows.push({ id: `compile.${rows.length}`, text: error.nodo ? `${nameOf(error.nodo)}: ${error.motivo}` : error.motivo, details: error.motivo, target: error.nodo ? { node: error.nodo } : null });
  }
  return rows;
}

/**
 * The warnings of a VI, as rows like the errors' with `warning: true`: a constant nothing reads and a panel
 * terminal with no wire. They never break the VI: Run works.
 */
export function collectWarnings({ graph, catalog }) {
  const touched = new Set(graph.cables.flatMap((wire) => [wire.de.nodo, wire.a.nodo]));
  const reads = new Set(graph.cables.map((wire) => wire.de.nodo));
  const rows = [];
  for (const node of graph.nodos) {
    if (USER_CONSTANTS.has(node.tipo) && !reads.has(node.id)) {
      rows.push({ id: `warning.${node.id}`, text: "Diagram Constant: unwired block diagram constant", details: WARNING_DETAILS.constant, target: { node: node.id }, warning: true });
    } else if (catalog.bloque(node.tipo).panel && !touched.has(node.id)) {
      const label = node.label?.text ?? node.name;
      rows.push({ id: `warning.${node.id}`, text: `Front Panel Terminal '${label}': unwired front panel terminal`, details: WARNING_DETAILS.terminal, target: { node: node.id }, warning: true });
    }
  }
  return rows;
}

/** "3 errors and warnings", as the label above the list: it counts the rows shown, warnings included. */
export const countLabel = (rows) => `${rows.length} errors and warnings`;

export const initial = () => ({ open: false, showWarnings: false, selected: null });

/** The rows the list shows: the errors, and the warnings after them only with Show Warnings. */
export const visibleRows = (rows, showWarnings = false) => [...rows.filter((row) => !row.warning), ...(showWarnings ? rows.filter((row) => row.warning) : [])];

/** Whether the toolbars show the List Warnings triangle: Show Warnings is on and the VI has some. */
export const showsWarningButton = (rows, showWarnings) => showWarnings && rows.some((row) => row.warning);

export function selectRow(state, rowId) {
  return { ...state, selected: rowId };
}
