// The Front Panel's unfolded view of a user's clusters (DT-106). In LabVIEW an element of a cluster is a whole control
// (measured: labview-captures/reports/2026-11-23-cluster-elements.md): selected alone, operated, moved within the
// cluster and out of it, deleted, copied and pasted. So, while the panel is edited, each element is a panel object of
// its own marked with the cluster it is inside (`inside`), at its place on the panel; after each edit the objects inside
// a cluster are folded back into its elements, in their order. The model and the file keep them inside (DT-095).
//
// Pure functions over a graph.

import * as CV from "../../../core/model/control-values.mjs";
import { hasElements, setClusterElements, withDerivedCluster } from "../../../core/model/user-cluster.mjs";
import { interiorBox, shellBox } from "./cluster-panel.mjs";

/** The id an element takes while unfolded: where it was when the panel was unfolded, kept until the next unfolding. */
export const unfoldedElementId = (clusterId, index) => `${clusterId}.elements.${index}`;

/** Is this panel object an element of a cluster, unfolded? */
export const isUnfoldedElement = (node) => node?.inside !== undefined;

/** The place on the panel of what lies at `place` inside `cluster`'s interior. */
function onPanel(cluster, place) {
  const interior = interiorBox(shellBox(cluster));
  return { x: interior.x + place.x, y: interior.y + place.y };
}

/** An element as a panel object inside `cluster`, with its current value from the cluster's at `index`. */
function elementAsObject(cluster, element, index) {
  const { x, y, w, h, ...rest } = element;
  const currentValue = cluster.currentValue?.[index];
  return {
    ...rest,
    id: unfoldedElementId(cluster.id, index),
    inside: cluster.id,
    panel: { ...onPanel(cluster, { x, y }), ...(w !== undefined && { w }), ...(h !== undefined && { h }) },
    ...(currentValue !== undefined && { currentValue }),
  };
}

/** A cluster and, after it, its elements as objects (theirs after each nested one): the cluster keeps no elements while unfolded. */
function unfoldNode(node) {
  if (!node.panel || !hasElements(node)) return [node];
  const { currentValue: _value, ...shell } = node;
  const unfolded = { ...shell, config: { ...node.config, elements: [] } };
  return [unfolded, ...node.config.elements.flatMap((element, index) => unfoldNode(elementAsObject(node, element, index)))];
}

/** The graph with every panel cluster's elements as panel objects of their own (DT-106 §1). */
export const unfoldClusters = (g) => ({ ...g, nodos: g.nodos.flatMap(unfoldNode) });

/** An object inside `cluster` as one of its elements again: its place relative to the interior, no id, no panel place. */
function objectAsElement(cluster, node) {
  const { id: _id, inside: _inside, panel, currentValue: _value, ...element } = node;
  const interior = interiorBox(shellBox(cluster));
  return { ...element, x: panel.x - interior.x, y: panel.y - interior.y, ...(panel.w !== undefined && { w: panel.w }), ...(panel.h !== undefined && { h: panel.h }) };
}

/** How deep an object is: 0 for a top-level one, 1 for an element of a top-level cluster, and so on. */
function depthOf(byId, node) {
  let depth = 0;
  for (let parent = node; isUnfoldedElement(parent); parent = byId.get(parent.inside)) depth++;
  return depth;
}

/** The cluster's current value from its elements' when any element has one of its own; none otherwise. */
function currentValueOf(children) {
  return children.some(CV.hasCurrentValue) ? children.map(CV.currentValue) : undefined;
}

/** Is the cluster's own configuration what its elements derive (its type and value): true of every cluster that was folded, not of one whose elements were taken out. */
const isDerivedFromItsElements = (catalog, cluster) => JSON.stringify(withDerivedCluster(catalog, cluster).config) === JSON.stringify(cluster.config);

/**
 * Folds the objects inside the cluster `id` back into it. With none inside the cluster is folded already when it holds
 * elements, or when it holds none and its type and value say so; folding a folded graph changes nothing, not even the
 * object (the window folds whatever it publishes, and a Run works on the folded graph).
 */
function foldInto(g, catalog, id) {
  const cluster = g.nodos.find((node) => node.id === id);
  const children = g.nodos.filter((node) => node.inside === id);
  if (!children.length && (cluster.config.elements.length || isDerivedFromItsElements(catalog, cluster))) return g;
  const childIds = new Set(children.map((node) => node.id));
  const elements = children.map((node) => objectAsElement(cluster, node));
  const currentValue = currentValueOf(children);
  const rest = { ...g, nodos: g.nodos.filter((node) => !childIds.has(node.id)).map((node) => (node.id === id ? withCurrentValue(node, currentValue) : node)) };
  return setClusterElements(rest, catalog, id, elements);
}

const withCurrentValue = (node, currentValue) => {
  const { currentValue: _old, ...rest } = node;
  return currentValue === undefined ? rest : { ...rest, currentValue };
};

/**
 * The graph folded back (DT-106 §2): the objects inside each cluster are its elements again, in the graph's order, which
 * is the cluster order; the innermost clusters first, so that a nested cluster is whole when it becomes an element.
 */
export function foldClusters(g, catalog) {
  const byId = new Map(g.nodos.map((node) => [node.id, node]));
  const clusters = g.nodos.filter((node) => node.panel && hasElements(node));
  const innermostFirst = [...clusters].sort((left, right) => depthOf(byId, right) - depthOf(byId, left));
  return innermostFirst.reduce((folded, cluster) => foldInto(folded, catalog, cluster.id), g);
}
