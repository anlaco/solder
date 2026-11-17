// A cluster made by the user (DT-095): a panel object (`cluster-control`, `cluster-indicator`) or a diagram constant
// (`cluster-constant`) that holds other panel objects or constants, its elements, in cluster order. Its type and value
// are derived from them and never stored by hand. The error clusters, which have a style and no elements, keep the
// type stored in their configuration.
//
// An element is `{ tipo, label?, config?, x, y }`: the block it is, its label, its own configuration (representation,
// value, style, mechanical action…) and its place, relative to the cluster's interior.

import { panelObjectType } from "./graph.mjs";

/** Does this node hold elements, as a user's cluster does? */
export const hasElements = (node) => Array.isArray(node?.config?.elements);

/** An element's name in the cluster's type: its label's text, as LabVIEW names an element after its label. */
const elementName = (element) => element.label?.text ?? "";

/** An element's own type: the one its block takes from its configuration or gives on its terminal. */
export const elementType = (catalog, element) => panelObjectType(catalog, { tipo: element.tipo, config: element.config });

/** The cluster type of a list of elements, in their order (the cluster order, DT-095 §1). */
export const clusterTypeOf = (catalog, elements) => ({ cluster: elements.map((element) => ({ name: elementName(element), type: elementType(catalog, element) })) });

/** The cluster's value: each element's value, in cluster order (cluster-values.mjs); an element with no value of its own gives none. */
export const clusterValueOf = (elements) => elements.map((element) => element.config?.value);

/** The node with its type and value derived from its elements; a node with no elements as it is. */
export function withDerivedCluster(catalog, node) {
  if (!hasElements(node)) return node;
  const { elements } = node.config;
  return { ...node, config: { ...node.config, type: clusterTypeOf(catalog, elements), value: clusterValueOf(elements) } };
}

/** The configuration a user's cluster stores: its elements; its type and value are derived when it is read (DT-095 §2). */
export function storedClusterConfig(config) {
  if (!Array.isArray(config?.elements)) return config;
  const { type: _derivedType, value: _derivedValue, ...stored } = config;
  return stored;
}

/** The graph with node `id`'s elements set to `elements` and its type and value derived from them. */
export function setClusterElements(g, catalog, id, elements) {
  return { ...g, nodos: g.nodos.map((node) => (node.id === id ? withDerivedCluster(catalog, { ...node, config: { ...node.config, elements } }) : node)) };
}
