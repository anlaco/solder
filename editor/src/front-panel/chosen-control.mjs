// Controls palette ▸ Select a Control... (DT-107): an `.octl` chosen on disk is carried on the cursor and lands where the
// panel is clicked. Measured in LabVIEW 2026 Q3 (labview-captures/reports/2026-11-25-placing-a-control.md Q1 and
// -empty-and-multi-control.md): only a file with exactly one object places anything, with zero or several nothing happens,
// silently; the label is the file's, numbered when taken; a Control is copied, a Type Def. placed linked (DT-096 §2).
// A pure module: the file's text and the path to store come from the caller.

import { linkFor, readTypeDefinition, typeDefinitionInstances } from "../../../core/model/type-definition.mjs";
import { resolveRelative } from "../common/ovi-paths.mjs";

/**
 * What `placeControl` of the panel needs for the object of the `.octl` `text`: `{ bloque, config, placement }`, or null when
 * the file does not hold exactly one object. `storedPath` is the file's path as this OVI stores it (relative to it); a
 * type definition's object takes the link to it, and a plain control none. An unreadable file throws its `ErrorQvi`.
 */
export function controlToPlace(text, catalog, storedPath) {
  const { kind, object } = readTypeDefinition(text, catalog);
  if (!object) return null;
  const link = linkFor(storedPath, kind);
  const config = { ...object.config, ...(link && { typedef: link }) };
  const size = object.w !== undefined && object.h !== undefined ? { w: object.w, h: object.h } : undefined;
  return { bloque: object.tipo, config, placement: { label: object.label?.text ?? "", ...(size && { size }) } };
}

/**
 * The definitions that objects of `g` follow and that the hierarchy does not hold yet, as absolute keys: an object linked
 * since the hierarchy was last built (a chosen control, a pasted one), whose file must be read for it to follow.
 */
export function unknownDefinitionKeys(g, knownKeys, oviKey, oviLibRoot) {
  const known = new Set(knownKeys);
  const keys = typeDefinitionInstances(g).map((node) => resolveRelative(oviKey, node.config.typedef.path, oviLibRoot));
  return [...new Set(keys.filter((key) => !known.has(key)))];
}
