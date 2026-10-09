// The `subvi` nodes of a diagram: what the editor needs besides what any node
// has (DT-045). Pure, over the graph and the catalog view of the VI.

import { cellAnchor } from "../../../core/model/connector.mjs";

export const isSubVI = (node) => node?.tipo === "subvi";

/** The node as it is placed from Select a VI...: `storedPath` is what the caller stores (see common/vi-paths.mjs). */
export const subVIConfig = (storedPath) => ({ vi: storedPath });

/** The ports of a subVI node with the place of each on the 32 × 32 icon, from its connector cell. */
export const portsWithAnchors = (node, cat) => {
  const { in: inputs, out: outputs } = cat.puertos(node);
  return [...inputs, ...outputs].map((port) => ({ ...port, anchor: cellAnchor(port.cell) }));
};
