// What a Run does to the values of the controls.
//
// While the VI runs, operating a control changes its current value in the graph
// the two windows share, but a Run does not change the VI: what is saved, and
// what is compared with the file to show the modified mark, is the default each
// control had when the Run started, and the graph goes back to it when the Run
// ends (labview-captures/windows-install-0.2.1/). LabVIEW keeps the current value
// apart from the default; Solder keeps only the default until Make Current
// Value Default exists (docs/spec/05-editor.md, Rule 40m).

import * as Gr from "../../../core/model/graph.mjs";

const CONTROL_TYPES = new Set(["control", "bool-control", "str-control", "cluster-control", "arr-control"]);

/** Is this node a control of the front panel? */
export const isControl = (node) => CONTROL_TYPES.has(node.tipo);

/** Two control values are the same: an error cluster is an object and is compared by what it carries. */
export const sameValue = (a, b) => a === b || (typeof a === "object" && typeof b === "object" && JSON.stringify(a) === JSON.stringify(b));

/** The value each control of `graph` holds, by node id, exactly as stored (`undefined` when it has none). */
export const controlValues = (graph) => Object.fromEntries(graph.nodos.filter(isControl).map((node) => [node.id, node.config?.value]));

/** `graph` with each control at the value given for it; whatever already has it, or is not a control, is left as it is. */
export function withControlValues(graph, values) {
  return graph.nodos.filter(isControl).reduce((all, node) => (sameValue(node.config?.value, values[node.id]) ? all : Gr.fijarValor(all, node.id, values[node.id])), graph);
}
