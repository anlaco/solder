// Bundle and Unbundle follow the cluster wired to them (DT-098): each keeps in `config.type` a copy of that cluster's
// type, and this refreshes the copy after the diagram changed, as LabVIEW reshapes both nodes at once when an element is
// added to or removed from the source (labview-captures/reports/2026-11-17-bundle-unbundle.md Q4).
//
// A wire stays on the row of its index: when the cluster changes, row 0's wire stays on row 0 even if a different
// element is there now, and breaks if its type no longer fits (Q4, measured). The wires of rows that no longer exist go
// away, as Index Array's do when its dimensions shrink (unverified for Bundle and Unbundle: LabVIEW's were not wired).
// The editor calls this after each change of the graph; the compiler never does, and a stale copy breaks the wire
// instead of being read with the wrong layout (cluster-node-ports.mjs).

import { tipos } from "./graph.mjs";
import { esCluster, iguales } from "./types.mjs";
import { bundleRowCount, rowOfPort } from "./cluster-node-ports.mjs";

/** The port of each node that takes the cluster its rows follow. */
const CLUSTER_PORT = { bundle: "cluster", unbundle: "value" };

/** The wired cluster's type reaching `node`, or undefined when nothing is wired or what is wired is no cluster. */
function wiredClusterType(g, resolved, node) {
  const wire = g.cables.find((candidate) => candidate.a.nodo === node.id && candidate.a.puerto === CLUSTER_PORT[node.tipo]);
  const type = wire?.de?.nodo !== undefined ? resolved.salidas.get(`${wire.de.nodo}.${wire.de.puerto}`) : undefined;
  return esCluster(type) ? type : undefined;
}

/**
 * The configuration `node` takes from `type`, the wired cluster's: the copy, or none. A Bundle that loses its top wire
 * keeps as many element inputs as it had (unverified: LabVIEW's was not unwired after being wired).
 */
function configFor(node, type) {
  const { type: _copy, ...rest } = node.config ?? {};
  if (type) return { ...rest, type };
  return node.tipo === "bundle" ? { ...rest, rows: bundleRowCount(node) } : rest;
}

/** The node's rows that exist with `config`: the element count of its copy (a Bundle without one, its stretched rows). */
const rowCount = (node, config) => config.type?.cluster.length ?? (node.tipo === "bundle" ? config.rows : 0);

/** Does `wire` touch a row of `node` beyond `count`? */
function onVanishedRow(wire, node, count) {
  const end = node.tipo === "bundle" ? wire.a : wire.de;
  return end?.nodo === node.id && rowOfPort(end.puerto) >= count;
}

/** One pass: each node whose copy differs from what is wired takes it. Returns the graph, unchanged when all agree. */
function refreshOnce(g, cat) {
  const resolved = tipos(g, cat);
  let changed = g;
  for (const node of g.nodos.filter((candidate) => candidate.tipo in CLUSTER_PORT)) {
    const type = wiredClusterType(g, resolved, node);
    if (iguales(type, node.config?.type)) continue;
    const config = configFor(node, type);
    const count = rowCount(node, config);
    changed = {
      ...changed,
      nodos: changed.nodos.map((candidate) => (candidate.id === node.id ? { ...candidate, config } : candidate)),
      cables: changed.cables.filter((wire) => !onVanishedRow(wire, node, count)),
    };
  }
  return changed;
}

/**
 * The graph with every Bundle and Unbundle following the cluster wired to it. A change can reach further down (an
 * Unbundle fed by a Bundle that just changed), so passes repeat until nothing changes, at most once per node.
 */
export function followWiredClusters(g, cat) {
  let current = g;
  for (let pass = 0; pass <= g.nodos.length; pass++) {
    const next = refreshOnce(current, cat);
    if (next === current) return current;
    current = next;
  }
  return current;
}
