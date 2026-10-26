// What a Run does to the values of the front panel (DT-053).
//
// The Run starts from the current value of each control, and operating a control
// while it runs changes that current value, never the default the file saves, so
// the VI is not marked modified. When the Run ends the controls keep what was
// operated, and what each indicator shows becomes its current value: Make Current
// Values Default then makes it the indicator's default, as in LabVIEW
// (labview-captures/reports/2026-10-15-default-values.md, stage 2).

import * as CV from "../../../core/model/control-values.mjs";

export const isControl = CV.isControl;

const INDICATOR_TYPES = new Set(["indicator", "bool-indicator", "str-indicator", "cluster-indicator", "arr-indicator", "visa-indicator", "path-indicator"]);

/** Is this node an indicator of the front panel that holds a value (a chart or a graph holds a history instead)? */
export const isIndicator = (node) => INDICATOR_TYPES.has(node.tipo);

/** Two control values are the same: an error cluster is an object and is compared by what it carries. */
export const sameValue = (a, b) => a === b || (typeof a === "object" && typeof b === "object" && JSON.stringify(a) === JSON.stringify(b));

const isTrueLatch = (node) => node.tipo === "bool-control" && String(node.config?.mechanical ?? "").startsWith("latch") && CV.currentValue(node) === true;

/**
 * The graph and the indicator values shown when a Run ends: each indicator in
 * `shownValues` takes what it shows as its current value and leaves `shownValues`.
 * A Latch still TRUE goes back to FALSE, as before (whether LabVIEW keeps a Latch
 * that was never read is unverified).
 */
export function afterRun(graph, shownValues = {}) {
  const takesShownValue = (node) => isIndicator(node) && node.id in shownValues && !sameValue(CV.currentValue(node), shownValues[node.id]);
  const withIndicators = graph.nodos.filter(takesShownValue).reduce((all, node) => CV.setCurrentValue(all, node.id, shownValues[node.id]), graph);
  const finished = withIndicators.nodos.filter(isTrueLatch).reduce((all, node) => CV.setCurrentValue(all, node.id, false), withIndicators);
  const remaining = Object.fromEntries(Object.entries(shownValues).filter(([id]) => !graph.nodos.some((node) => node.id === id && isIndicator(node))));
  return { graph: finished, shownValues: remaining };
}
