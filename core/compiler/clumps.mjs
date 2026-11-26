// How a scope of the diagram is ordered and split into clumps (DT-040, DT-041). A structure, with all it holds, counts
// as one node of its scope (`representativeOf`), and it takes time. `extraEdges` are the dependencies that are not
// wires, as the order of the error chain.

import { feedbackOrderEdges } from "../model/feedback-node.mjs";

/**
 * The edges of a scope between the representatives of its wires' ends, then those that are not wires: each Feedback
 * Node's store half after its first half (DT-109), and the extra ones.
 */
const scopeEdges = (graph, representativeOf, extraEdges) => [
  ...[...graph.cables.map((wire) => [wire.de.nodo, wire.a.nodo]), ...feedbackOrderEdges(graph)].map(([from, to]) => [representativeOf(from), representativeOf(to)]),
  ...extraEdges,
];

/**
 * A topological order (Kahn's) of the nodes of a scope, `scopeIds`, joining each node to its representative in it (the
 * node itself, or the structure of the scope that holds it). What is not of the scope —its structure's border— is
 * already there.
 */
export function topologicalOrder(graph, scopeIds, representativeOf, extraEdges = []) {
  const incomingCount = new Map(scopeIds.map((id) => [id, 0]));
  const outgoing = new Map(scopeIds.map((id) => [id, new Set()]));
  for (const [from, to] of scopeEdges(graph, representativeOf, extraEdges)) {
    if (from === to || !outgoing.has(from) || !outgoing.has(to) || outgoing.get(from).has(to)) continue;
    outgoing.get(from).add(to);
    incomingCount.set(to, incomingCount.get(to) + 1);
  }
  const ready = scopeIds.filter((id) => incomingCount.get(id) === 0);
  const order = [];
  while (ready.length) {
    const id = ready.shift();
    order.push(id);
    for (const next of outgoing.get(id)) if (incomingCount.set(next, incomingCount.get(next) - 1).get(next) === 0) ready.push(next);
  }
  return order;
}

/**
 * Splits an OVI's diagram into clumps. A node that takes time (`takesTime`) goes alone in its own; an instant one goes
 * with the other instant ones that depend on the same time-taking nodes (directly or not). So an instant node runs as
 * soon as the last time-taking node it depends on ends, which is when its data arrive: what the panel shows (when an
 * indicator is written, when a control is read) is the same as if each node ran on its own. Each clump carries the
 * indices of the clumps it receives something from (`deps`). The clump's keys (`largo`, `locales`, `cuerpo`) are read
 * by compile-ovi.mjs and the assembler.
 */
export function splitIntoClumps(graph, orderedIds, representativeOf, takesTime, extraEdges = []) {
  const edges = scopeEdges(graph, representativeOf, extraEdges);
  const incoming = new Map(orderedIds.map((id) => [id, []]));
  for (const [from, to] of edges) if (from !== to && incoming.has(to) && incoming.has(from)) incoming.get(to).push(from);
  const timeTakersBehind = new Map();
  const clumpOf = new Map();
  const clumpByKey = new Map();
  const clumps = [];
  for (const id of orderedIds) {
    const behind = new Set();
    for (const predecessor of incoming.get(id)) {
      for (const timeTaker of timeTakersBehind.get(predecessor)) behind.add(timeTaker);
      if (takesTime(predecessor)) behind.add(predecessor);
    }
    timeTakersBehind.set(id, behind);
    const key = takesTime(id) ? `largo:${id}` : [...behind].sort().join(",");
    if (!clumpByKey.has(key)) clumpByKey.set(key, clumps.push({ largo: takesTime(id), deps: new Set(), locales: [], cuerpo: [] }) - 1);
    clumpOf.set(id, clumpByKey.get(key));
  }
  for (const [fromNode, toNode] of edges) {
    const [from, to] = [clumpOf.get(fromNode), clumpOf.get(toNode)];
    if (from !== undefined && to !== undefined && from !== to) clumps[to].deps.add(from);
  }
  return { clumpDe: clumpOf, clumps };
}
