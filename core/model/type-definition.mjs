// Type definitions (DT-096): a panel object or a constant that follows an `.octl` file carries a link to it in its
// configuration, `typedef: { path, strict }`, and keeps a copy of what the file defined (a cluster's elements, an
// enum's items, its representation). The type on a wire stays structural (DT-096 §1); the link is a relation between
// an object and a file, read here and kept up to date by the editor.
//
// An `.octl` holds the control editor's panel: zero or more objects, each as a cluster holds an element
// (`elementToFile`): its block as `kind`, its label, its configuration and its place; and which of LabVIEW's three it
// is, the control editor's ring (Control, Type Def., Strict Type Def., measured: reports/2026-11-17-typedef-update.md
// Q4). LabVIEW saves a `.ctl` with zero, one or several controls, and only one with exactly one is placed or followed
// (reports/2026-11-25-empty-and-multi-control.md; DT-107). A pure module: it reads no files.

import { commentTable, fromTable, putComments, takeComments } from "./file-comments.mjs";
import { elementFromFile, elementToFile, ErrorQvi, VERSION } from "./qvi-format.mjs";
import { specialNumbersAsText } from "./constant-values.mjs";

/** The control editor's three kinds, in the ring's order (measured), as the `.octl` stores them. */
export const TYPE_DEFINITION_KINDS = Object.freeze(["control", "type-def", "strict-type-def"]);

/** The extension of a type definition's file (DT-096 §3, DT-104). */
export const CONTROL_FILE_EXTENSION = ".octl";

/** Whether a path names a type definition's `.octl` file, in any case. */
export const isControlPath = (path) => path.toLowerCase().endsWith(CONTROL_FILE_EXTENSION);

/** The title the control editor's window carries for each kind, from the kind it was opened with (measured: the title follows the ring only on reopening). */
export const KIND_TITLES = Object.freeze({ control: "Control", "type-def": "Type Def", "strict-type-def": "Strict Type Def" });

/** The kind an `.octl`'s text stores, for the window's title before its page reads the file; null when unreadable. */
export function kindOfText(text) {
  try {
    const kind = JSON.parse(text)?.["type-definition"];
    return TYPE_DEFINITION_KINDS.includes(kind) ? kind : null;
  } catch {
    return null;
  }
}

/** The kinds an object can follow: a plain custom control is copied when placed, not followed (DT-096 §2). */
const FOLLOWED_KINDS = new Set(["type-def", "strict-type-def"]);

/** The link of an object that follows a type definition, `{ path, strict }`, or null. */
export const typeDefinitionLink = (node) => node?.config?.typedef ?? null;

/** The link an object takes when it is made from an `.octl` of `kind` stored at `path`; null for a plain control. */
export const linkFor = (path, kind) => (FOLLOWED_KINDS.has(kind) ? { path, strict: kind === "strict-type-def" } : null);

/**
 * The size the control editor's object was given, `w` and `h` of the object in the file, only when it has one: a type
 * definition of a cluster resized to 293 × 223 keeps that size (measured: reports/2026-11-23-cluster-elements-editor-try.md
 * Q9, the editor opened a 100 × 100 shell with the elements clipped). Optional, so an older file reads as before.
 */
const sizeToFile = (object) => (Number.isFinite(object.w) && Number.isFinite(object.h) ? { w: object.w, h: object.h } : {});

/** The object of the file without its size, and the size apart (see `sizeToFile`). */
function splitSize({ w, h, ...rest }) {
  return { rest, size: Number.isFinite(w) && Number.isFinite(h) ? { w, h } : {} };
}

/** The format version that gave an `.octl` its list of `objects` (DT-107); older files hold their one `object`. */
const OBJECTS_VERSION = 10;

/** One object of the file, as `elementToFile` writes it, with its size when it has one. */
const objectToFile = (object) => {
  const { typedef: _ownLink, ...config } = object.config ?? {};
  return { ...elementToFile({ ...object, config }), ...sizeToFile(object) };
};

/**
 * The `.octl` file of `objects` (each `{ tipo, label?, config?, x, y }`, as a cluster element; zero or more, DT-107) as
 * `kind`, as an object for JSON, with the user's `comments` as `readTypeDefinition` gave them (DT-100 §6).
 */
export function writeTypeDefinition(kind, objects, comments) {
  if (!TYPE_DEFINITION_KINDS.includes(kind)) throw new ErrorQvi(`"${kind}" is not one of the control editor's kinds`);
  return putComments({ solder: VERSION, "type-definition": kind, objects: objects.map(objectToFile) }, fromTable(comments));
}

/** The text of an `.octl`: JSON indented by two spaces, as an `.ovi` is written. */
export const typeDefinitionText = (kind, objects, comments) => `${JSON.stringify(writeTypeDefinition(kind, objects, comments), specialNumbersAsText, 2)}\n`;

/** A file of a version before `objects` held its one `object`: read as the list of it, before its comments are taken by place. */
function withObjectsList(file) {
  if (file.solder >= OBJECTS_VERSION || file.objects !== undefined) return file;
  if (!file.object || typeof file.object !== "object") throw new ErrorQvi("a type definition of this version holds one object");
  const { object, ...rest } = file;
  return { ...rest, objects: [object] };
}

/** One object read from the file, its size apart from what `elementFromFile` reads. */
function objectFromFile(stored, catalog) {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) throw new ErrorQvi("each of a type definition's objects is an object");
  const { rest, size } = splitSize(stored);
  return { ...elementFromFile(rest, catalog), ...size };
}

/**
 * An `.octl` read from its text or object: `{ kind, objects, object, comments? }`. `objects` are the panel's, each as a
 * cluster holds an element; `object` is the definition's one object, what is placed and followed, or null when the file
 * holds none or several (DT-107). The user's comments come by place (file-comments.mjs), which nothing reads but the writer.
 */
export function readTypeDefinition(data, catalog) {
  const parsed = typeof data === "string" ? JSON.parse(data) : data;
  if (!Number.isInteger(parsed.solder) || parsed.solder < 1 || parsed.solder > VERSION) throw new ErrorQvi(`format version ${parsed.solder}: this Solder reads versions 1 to ${VERSION}`);
  const { file: read, comments } = takeComments(withObjectsList(parsed));
  const kind = read["type-definition"];
  if (!TYPE_DEFINITION_KINDS.includes(kind)) throw new ErrorQvi(`"${kind}" is not one of the control editor's kinds`);
  if (!Array.isArray(read.objects)) throw new ErrorQvi("a type definition holds a list of objects");
  const objects = read.objects.map((stored) => objectFromFile(stored, catalog));
  return { kind, objects, object: objects.length === 1 ? objects[0] : null, ...(comments.length && { comments: commentTable(comments) }) };
}

/**
 * What the Error list says of an object whose type definition is missing or unreadable: LabVIEW's words, with the
 * object's label (measured: reports/2026-11-17-typedef-update.md Q2, a blank label gives `' '`).
 */
export const missingTypeDefinitionReason = (label) => `Type Definition '${label || " "}': Type definition not found or contains errors.`;

/** The objects of an OVI's graph that follow a type definition, each with its link. */
export const typeDefinitionInstances = (g) => g.nodos.filter((node) => typeDefinitionLink(node)?.path);
