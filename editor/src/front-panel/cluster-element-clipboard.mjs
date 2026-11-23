// Copy, cut, paste and duplicate on the unfolded Front Panel, where the elements of a user's cluster are objects of their
// own (DT-106). Measured in LabVIEW 2026 Q3 (reports/2026-11-23-cluster-elements.md Q3): Cut and Copy take an element with
// its label and value; Paste with the mouse over a cluster's interior adds the copy as the cluster's last element, its label
// numbered if the cluster has it ("Numeric 2"), and with the mouse over the free panel makes a free control that keeps its
// label, since the name is free at top level.
//
// A fragment (core/model/clipboard.mjs) holds folded clusters, as a clipboard that crosses to the Block Diagram or to
// another OVI must: a copied cluster takes its elements with it, and an element copied without its cluster is a free control.

import { copyFragment, pasteFragment } from "../../../core/model/clipboard.mjs";
import { foldClusters, unfoldClusters } from "./cluster-unfolding.mjs";
import { canBeElement } from "./cluster-panel.mjs";
import { clusterTaking, graftedOnto, joinedTo, topLevelOf, withDescendants } from "./cluster-elements.mjs";

/** An element copied without its cluster as the free control it would become, with its terminal where it is (as `Gr.crearEnPanel` makes it). */
function asFreeControl(node) {
  if (node.inside === undefined) return node;
  const { inside: _cluster, ...free } = node;
  return { ...free, x: node.panel.x, y: node.panel.y };
}

/** The panel objects `ids` as a fragment with no wires: clusters whole, with their elements inside them. */
export function fragmentOf(g, cat, ids) {
  const { nodes } = copyFragment(g, withDescendants(g, ids));
  const folded = foldClusters({ nodos: nodes, cables: [], siguiente: 1 }, cat);
  return { nodes: folded.nodos.map(asFreeControl), wires: [] };
}

/** The graph without `ids` and what is inside the clusters among them. */
export const withoutObjects = (g, ids) => {
  const gone = new Set(withDescendants(g, ids));
  return { ...g, nodos: g.nodos.filter((node) => !gone.has(node.id)) };
};

/**
 * The fragment pasted: free, among the top level's objects (so that the labels are numbered against them alone), or, when
 * `cluster` is given, with each object of it joining the cluster as its last element. A pasted cluster comes unfolded.
 * Returns `{ g, ids }`, the ids of the objects to select.
 */
export function pastedFragment(g, fragment, shifts, cluster) {
  if (cluster) {
    const pasted = pasteFragment(g, fragment, shifts);
    return { g: pasted.ids.reduce((graph, id) => joinedTo(graph, id, cluster.id), pasted.g), ids: pasted.ids };
  }
  const top = topLevelOf(g);
  const pasted = pasteFragment(top, fragment, shifts);
  return { g: unfoldClusters(graftedOnto(g, top, pasted.g)), ids: pasted.ids };
}

/** The cluster that takes a fragment pasted with its centre at `pointer`: none unless all of it can be elements. */
export const clusterForPaste = (g, fragment, pointer) => (fragment.nodes.every((node) => canBeElement(node.tipo)) ? clusterTaking(g, fragment.nodes[0].tipo, pointer) : undefined);

/** Ctrl+drag's copies: the objects `ids` pasted where they are, shifted on the diagram only, the clusters among them with their elements. */
export function duplicated(g, cat, ids, step) {
  const free = ids.filter((id) => g.nodos.find((node) => node.id === id)?.inside === undefined);
  const fragment = fragmentOf(g, cat, free);
  return pastedFragment(g, fragment, { dx: step, dy: step, panelDx: 0, panelDy: 0 });
}
