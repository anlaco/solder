// What a wire knows of type definitions (DT-096 §1, §5). The type on a wire is structural; the type definition a wire
// carries is found by walking back from it to its source, through what passes a cluster whole. Measured in LabVIEW
// (reports/2026-11-17-typedef-wiring.md Q4, Q6):
// - Context Help names the type definition of a wire that leaves an object following one, and keeps naming it after a
//   structure's tunnel and after a Bundle wired at the top; a cluster built anew (Unbundle then Bundle) follows none.
// - A coercion dot is drawn where the wire enters an object whose type definition is not the one the wire carries, in
//   the same kind: definition to plain, plain to definition, one file to another, strict to non-strict. NI's help says
//   it warns that editing the definition could break the VI.
// A shift register, an indexed tunnel and a subOVI's terminals are not measured: they carry no type definition here.

import { typeDefinitionLink } from "./type-definition.mjs";

/** The input a node passes whole to its output: a tunnel's outside or inside end, a Bundle's cluster at the top. */
const PASS_THROUGH_INPUT = { "tunnel-in": "x", "tunnel-out": "x", bundle: "cluster" };

/** The wires that end on `port` of node `nodeId`. */
const wiresInto = (g, nodeId, port) => g.cables.filter((wire) => wire.a.nodo === nodeId && (port === undefined || wire.a.puerto === port));

/** The input ports through which `node` passes a cluster whole, or none. */
function passThroughInputs(node) {
  if (node.tipo === "case-tunnel-out") return null; // each frame's input: every wired one is followed
  if (node.config?.indexado) return [];
  const port = PASS_THROUGH_INPUT[node.tipo];
  return port ? [port] : [];
}

/** Two links that name the same file in the same kind; two absent links are the same too. */
export const sameTypeDefinition = (first, second) => (first?.path ?? null) === (second?.path ?? null) && !!first?.strict === !!second?.strict;

/**
 * The type definition a wire leaving node `nodeId` carries, `{ path, strict }`, or null: the node's own link, or the one
 * that reaches it through what passes a cluster whole. A Case's output tunnel carries one only when every wired frame
 * brings the same one (unverified in LabVIEW).
 */
export function typeDefinitionOfSource(g, nodeId, visited = new Set()) {
  const node = g.nodos.find((candidate) => candidate.id === nodeId);
  if (!node || visited.has(nodeId)) return null;
  visited.add(nodeId);
  const own = typeDefinitionLink(node);
  if (own) return own;
  const ports = passThroughInputs(node);
  const incoming = ports === null ? wiresInto(g, nodeId) : ports.flatMap((port) => wiresInto(g, nodeId, port));
  if (!incoming.length) return null;
  const links = incoming.map((wire) => typeDefinitionOfSource(g, wire.de.nodo, new Set(visited)));
  return links.every((link) => link && sameTypeDefinition(link, links[0])) ? links[0] : null;
}

/** Whether `wire` gets the coercion dot of a type definition where it enters a panel object or a constant. */
export function hasTypeDefinitionDot(g, catalog, wire) {
  const destination = g.nodos.find((node) => node.id === wire.a.nodo);
  if (!destination || !catalog.bloque(destination.tipo).panel) return false;
  const carried = typeDefinitionOfSource(g, wire.de.nodo);
  const followed = typeDefinitionLink(destination);
  return Boolean(carried || followed) && !sameTypeDefinition(carried, followed);
}

/** The file name a link names, as Context Help shows it: the last part of its path. */
const fileNameOf = (link) => link.path.split(/[\\/]/).at(-1);

/**
 * The line Context Help shows before the type of a wire or terminal that carries a type definition, in LabVIEW's form
 * `(typedef 'PointTD.ctl'[non-strict])` (measured), with Solder's file name; null when it carries none.
 */
export const typeDefinitionHelpLine = (link) => (link ? `(typedef '${fileNameOf(link)}'[${link.strict ? "strict" : "non-strict"}])` : null);
