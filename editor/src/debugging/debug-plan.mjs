// What the debugger needs to know about a diagram (see debug-controller.mjs): which
// nodes report, which wires join them, in which structure each one lives, how long
// the wires are (for the pace of Highlight Execution) and what each node is called.
//
// Pure: the page builds it when a Run starts and sends it to the run worker with the
// module. Only the nodes the compiled VI hooks (`debugNodes` of the top-level VI) count.

import * as D from "../block-diagram/diagram-view.mjs";
import { isSubVI } from "../block-diagram/subvi-nodes.mjs";
import { withoutVIExtension } from "../common/vi-paths.mjs";

const LOOP_KINDS = ["while-loop", "for-loop"];

/** The name LabVIEW shows for a node: its own label, the palette's name for its block, or the block. */
export function nodeDisplayName(node, inventory) {
  if (node.label?.text) return node.label.text;
  if (isSubVI(node)) return withoutVIExtension(String(node.config?.vi ?? "SubVI").split("/").pop());
  const entry = inventory?.entradas.find((candidate) => candidate.bloque === node.tipo && candidate.id.startsWith("palette."));
  return entry?.etiqueta ?? node.tipo;
}

/** The length in px of the path of a wire. */
export function wireLength(graph, wire, terminals) {
  const from = terminals.get(`${wire.de.nodo}.${wire.de.puerto}`);
  const to = terminals.get(`${wire.a.nodo}.${wire.a.puerto}`);
  if (!from || !to) return 0;
  const path = D.ruta(from, to, wire.codos);
  let length = 0;
  for (let k = 1; k < path.length; k++) length += Math.abs(path[k][0] - path[k - 1][0]) + Math.abs(path[k][1] - path[k - 1][1]);
  return length;
}

/**
 * @param {object} graph      the VI's graph
 * @param {Array} debugNodes  `compilado.debugNodes`
 * @param {object} context    `D.contexto(...)`, to measure the wires
 * @param {object} [inventory]  to name the nodes
 */
export function buildDebugPlan(graph, debugNodes, context, inventory) {
  const topLevel = debugNodes.filter((entry) => entry.vi === "");
  const hooked = new Set(topLevel.map((entry) => entry.nodo));
  // A border element of a structure feeds nodes but never waits for its own inputs: the debugger does not stop before it.
  const borders = new Set(topLevel.filter((entry) => entry.border).map((entry) => entry.nodo));
  const terminals = D.extremos(graph, context);
  const plan = { successors: {}, inputCounts: {}, containers: {}, parents: {}, loops: [], wireLengths: {}, names: {}, wires: {}, quiet: [] };
  for (const node of graph.nodos) {
    if (D.esEstructura(node, context)) {
      plan.parents[node.id] = node.dentro ?? null;
      if (LOOP_KINDS.includes(node.tipo)) plan.loops.push(node.id);
    }
    if (hooked.has(node.id)) {
      // Single stepping does not stop at a constant or a panel terminal (border-probes §4, warnings-frame-stops §B).
      const block = context.cat?.bloque(node.tipo);
      // The Boolean and text constants are "input" blocks of the catalog, outside CONSTANTES (they draw their own way).
      if (D.CONSTANTES[node.tipo] || block?.cat === "input" || block?.panel) plan.quiet.push(node.id);
      plan.containers[node.id] = node.dentro ?? null;
      plan.names[node.id] = nodeDisplayName(node, inventory);
    }
  }
  for (const wire of graph.cables) {
    plan.wires[wire.id] = { from: wire.de.nodo, port: wire.de.puerto };
    if (!hooked.has(wire.de.nodo)) continue;
    const length = wireLength(graph, wire, terminals);
    plan.wireLengths[wire.de.nodo] = Math.max(plan.wireLengths[wire.de.nodo] ?? 0, length);
    if (!hooked.has(wire.a.nodo) || borders.has(wire.a.nodo)) continue;
    // Inputs are counted by source: a tunnel that reports every iteration, or two wires from one output, arrive once.
    const successors = (plan.successors[wire.de.nodo] ??= []);
    if (successors.includes(wire.a.nodo)) continue;
    successors.push(wire.a.nodo);
    plan.inputCounts[wire.a.nodo] = (plan.inputCounts[wire.a.nodo] ?? 0) + 1;
  }
  return plan;
}
