// Type definitions (DT-096): a panel object or a constant that follows an `.octl` file carries a link to it in its
// configuration, `typedef: { path, strict }`, and keeps a copy of what the file defined (a cluster's elements, an
// enum's items, its representation). The type on a wire stays structural (DT-096 §1); the link is a relation between
// an object and a file, read here and kept up to date by the editor.
//
// An `.octl` holds one panel object as a cluster holds an element (`elementToFile`): its block as `kind`, its label,
// its configuration and its place; and which of LabVIEW's three it is, the control editor's ring (Control, Type Def.,
// Strict Type Def., measured: reports/2026-11-17-typedef-update.md Q4). A pure module: it reads no files.

import { commentTable, fromTable, putComments, takeComments } from "./file-comments.mjs";
import { elementFromFile, elementToFile, ErrorQvi, VERSION } from "./qvi-format.mjs";

/** The control editor's three kinds, in the ring's order (measured), as the `.octl` stores them. */
export const TYPE_DEFINITION_KINDS = Object.freeze(["control", "type-def", "strict-type-def"]);

/** The kinds an object can follow: a plain custom control is copied when placed, not followed (DT-096 §2). */
const FOLLOWED_KINDS = new Set(["type-def", "strict-type-def"]);

/** The link of an object that follows a type definition, `{ path, strict }`, or null. */
export const typeDefinitionLink = (node) => node?.config?.typedef ?? null;

/** The link an object takes when it is made from an `.octl` of `kind` stored at `path`; null for a plain control. */
export const linkFor = (path, kind) => (FOLLOWED_KINDS.has(kind) ? { path, strict: kind === "strict-type-def" } : null);

/**
 * The `.octl` file of `object` (`{ tipo, label?, config?, x, y }`, as a cluster element) as `kind`, as an object for JSON,
 * with the user's `comments` as `readTypeDefinition` gave them (DT-100 §6).
 */
export function writeTypeDefinition(kind, object, comments) {
  if (!TYPE_DEFINITION_KINDS.includes(kind)) throw new ErrorQvi(`"${kind}" is not one of the control editor's kinds`);
  const { typedef: _ownLink, ...config } = object.config ?? {};
  return putComments({ solder: VERSION, "type-definition": kind, object: elementToFile({ ...object, config }) }, fromTable(comments));
}

/** The text of an `.octl`: JSON indented by two spaces, as an `.ovi` is written. */
export const typeDefinitionText = (kind, object, comments) => `${JSON.stringify(writeTypeDefinition(kind, object, comments), null, 2)}\n`;

/**
 * An `.octl` read from its text or object: `{ kind, object, comments? }`, the object as a cluster holds an element and
 * the user's comments by place (file-comments.mjs), which nothing reads but the writer.
 */
export function readTypeDefinition(data, catalog) {
  const { file: read, comments } = takeComments(typeof data === "string" ? JSON.parse(data) : data);
  if (!Number.isInteger(read.solder) || read.solder < 1 || read.solder > VERSION) throw new ErrorQvi(`format version ${read.solder}: this Solder reads versions 1 to ${VERSION}`);
  const kind = read["type-definition"];
  if (!TYPE_DEFINITION_KINDS.includes(kind)) throw new ErrorQvi(`"${kind}" is not one of the control editor's kinds`);
  if (!read.object || typeof read.object !== "object") throw new ErrorQvi("a type definition holds one object");
  return { kind, object: elementFromFile(read.object, catalog), ...(comments.length && { comments: commentTable(comments) }) };
}

/**
 * What the Error list says of an object whose type definition is missing or unreadable: LabVIEW's words, with the
 * object's label (measured: reports/2026-11-17-typedef-update.md Q2, a blank label gives `' '`).
 */
export const missingTypeDefinitionReason = (label) => `Type Definition '${label || " "}': Type definition not found or contains errors.`;

/** The objects of an OVI's graph that follow a type definition, each with its link. */
export const typeDefinitionInstances = (g) => g.nodos.filter((node) => typeDefinitionLink(node)?.path);
