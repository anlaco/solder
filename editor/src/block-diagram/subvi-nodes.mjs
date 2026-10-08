// The `subvi` nodes of a diagram: what the editor needs besides what any node
// has (DT-045). Pure, over the graph and the catalog view of the VI.

import { cellAnchor } from "../../../core/model/connector.mjs";

export const isSubVI = (node) => node?.tipo === "subvi";

/** The node as it is placed from Select a VI...: `storedPath` is what the caller stores (see common/vi-paths.mjs). */
export const subVIConfig = (storedPath) => ({ vi: storedPath });

/**
 * Removes the wires that end on a port a subVI no longer has, because its
 * connector changed since the wire was made. LabVIEW keeps them broken; the
 * editor drops them for now, as there is no wire left to hang the break on
 * (spec/05 rule 70; LabVIEW's behaviour is unverified).
 */
export function pruneOrphanWires(g, cat) {
  const byId = new Map(g.nodos.map((node) => [node.id, node]));
  const hasPort = (nodeId, portName, dir) => {
    const node = byId.get(nodeId);
    return !isSubVI(node) || cat.puertos(node)[dir].some((port) => port.name === portName);
  };
  const cables = g.cables.filter((wire) => hasPort(wire.de.nodo, wire.de.puerto, "out") && hasPort(wire.a.nodo, wire.a.puerto, "in"));
  return cables.length === g.cables.length ? g : { ...g, cables };
}

/** The ports of a subVI node with the place of each on the 32 × 32 icon, from its connector cell. */
export const portsWithAnchors = (node, cat) => {
  const { in: inputs, out: outputs } = cat.puertos(node);
  return [...inputs, ...outputs].map((port) => ({ ...port, anchor: cellAnchor(port.cell) }));
};
