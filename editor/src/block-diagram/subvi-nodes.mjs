// The `subvi` nodes of a diagram: what the editor needs besides what any node
// has (DT-045). Pure, over the graph and the catalog view of the VI.

import { cellAnchor } from "../../../core/model/connector.mjs";
import { resolveRelative } from "../common/vi-paths.mjs";
import { isPolymorphicPath, polymorphicNodeConfig, readPolymorphic } from "../../../core/model/polymorphic.mjs";

export const isSubVI = (node) => node?.tipo === "subvi";

/** The node as it is placed from Select a VI...: `storedPath` is what the caller stores (see common/vi-paths.mjs). */
export const subVIConfig = (storedPath) => ({ vi: storedPath });

/**
 * The config of a node placed from Select a VI... `textOfFile` is the text of the chosen file: a `.sdp` gives a
 * polymorphic node (Automatic, the first instance, the selector as the file says: DT-074), anything else a plain subOVI.
 * Throws `PolymorphicFileError` when the `.sdp` cannot be read.
 */
export const placedConfig = (storedPath, textOfFile) =>
  isPolymorphicPath(storedPath) ? polymorphicNodeConfig(storedPath, readPolymorphic(textOfFile)) : subVIConfig(storedPath);

/** The ports of a subVI node with the place of each on the 32 × 32 icon, from its connector cell. */
export const portsWithAnchors = (node, cat) => {
  const { in: inputs, out: outputs } = cat.puertos(node);
  return [...inputs, ...outputs].map((port) => ({ ...port, anchor: cellAnchor(port.cell) }));
};

/**
 * The file that double-clicking a subOVI node or Open Front Panel opens: the OVI it stores, resolved against its
 * caller; for a polymorphic node the instance it calls now, not the `.sdp` (DT-074, measured). Null for a node with no OVI.
 */
export function fileToOpen(node, cat, callerKey, oviLibRoot = "") {
  if (!node?.config?.vi) return null;
  const instance = isPolymorphicPath(node.config.vi) ? cat.calleeOf?.(node) : null;
  return instance?.key ?? resolveRelative(callerKey, node.config.vi, oviLibRoot);
}
