// Where the subVIs of a VI are, as paths (DT-045, spec/05 §12).
//
// A `subvi` node stores the path of the VI file it calls relative to the file of
// its caller. A caller that has never been saved has no folder to be relative
// to, so it stores the absolute path and converts it when it is first saved.
// Pure and independent of the system: it works on strings, with `/` as the
// separator (a Windows path is read with its backslashes turned into `/`), so
// the page and the main process share it. An OVI of ovi.lib is stored by its
// symbolic `<ovilib>/…` path instead (DT-073, core/model/ovi-lib.mjs), which a
// rebase leaves alone: it does not depend on where the caller is.

import { isOviLibPath, oviLibPathFor, resolveOviLibPath } from "../../../core/model/ovi-lib.mjs";
import { POLYMORPHIC_EXTENSION, isPolymorphicPath } from "../../../core/model/polymorphic.mjs";

const WINDOWS_DRIVE = /^[A-Za-z]:\//;

/**
 * The extension a VI is written with (DT-051), and the one Solder wrote before it, which still
 * opens: a caller names its subVIs with the extension they had, so an old file keeps it when it is
 * saved again in place.
 */
export const VI_EXTENSION = ".sdg";
export const OLD_VI_EXTENSION = ".qvi";
const VI_EXTENSIONS = [VI_EXTENSION, OLD_VI_EXTENSION];

/** Whether a path names a VI file, with either extension and in any case. */
export const isVIFile = (path) => VI_EXTENSIONS.some((extension) => path.toLowerCase().endsWith(extension));

/** A VI's name without its extension, as the error chain and the debugger show it. */
export const withoutVIExtension = (name) => VI_EXTENSIONS.reduce((rest, extension) => (rest.toLowerCase().endsWith(extension) ? rest.slice(0, -extension.length) : rest), name);

/** Where Save As writes the path the user chose: as it is if it already names a VI file, with `.sdg` added if not. */
export const savePathFor = (chosen) => (isVIFile(chosen) ? chosen : `${chosen}${VI_EXTENSION}`);

/**
 * Where Save As writes a polymorphic OVI (DT-074): the path the user chose, with `.sdp` added if it does not end so.
 * LabVIEW writes a `.vi`; Solder's polymorphic OVI is a file of its own.
 */
export const polymorphicSavePathFor = (chosen) => (isPolymorphicPath(chosen) ? chosen : `${chosen}${POLYMORPHIC_EXTENSION}`);

/** What Save As proposes for a polymorphic OVI: its name with `.sdp`. */
export const polymorphicSaveProposal = (currentPath, name) => `${(currentPath ?? name).replace(/\.[^./\\]+$/, "")}${POLYMORPHIC_EXTENSION}`;

/** The stylesheet that goes with a VI file (DT-058 §2): the same name with `.css`, next to it. */
export const companionStylesheetPath = (viPath) => `${withoutVIExtension(viPath)}.css`;

/** What Save As proposes: the same name with `.sdg`, so an old `.qvi` is offered under the new extension. */
export const saveAsProposal = (currentPath, name) => (currentPath ? `${withoutVIExtension(currentPath)}${VI_EXTENSION}` : `${withoutVIExtension(name)}${VI_EXTENSION}`);

const withSlashes = (path) => path.replaceAll("\\", "/");

/** The key of a saved VI: its path with `/` as separator, whatever the system. */
export const pathKey = withSlashes;

/** Is it a path from the root of a disk, and not one relative to a folder? */
export const isAbsolutePath = (path) => withSlashes(path).startsWith("/") || WINDOWS_DRIVE.test(withSlashes(path));

/** The key of a VI that has no file yet. It is not a path: it never contains a folder. */
export const untitledKey = (id) => `untitled:${id}`;

/** Does this key stand for a VI saved in a file? */
export const isSavedKey = (key) => typeof key === "string" && isAbsolutePath(key);

/** The name a VI goes by: its file name once saved, `untitledName` ("Untitled N") before (spec/04 Rule 21k). */
export const viDisplayName = (key, untitledName) => (isSavedKey(key) ? withSlashes(key).split("/").pop() : untitledName);

/** A path split into its root (`/`, `C:/` or nothing) and its folders and file name. */
function splitPath(path) {
  const slashed = withSlashes(path);
  const root = slashed.startsWith("/") ? "/" : WINDOWS_DRIVE.test(slashed) ? slashed.slice(0, 3) : "";
  return { root, segments: slashed.slice(root.length).split("/").filter((segment) => segment && segment !== ".") };
}

/** Resolves `.` and `..`; a `..` at the root goes nowhere. */
function collapse({ root, segments }) {
  const kept = [];
  for (const segment of segments) {
    if (segment !== "..") kept.push(segment);
    else if (kept.length && kept.at(-1) !== "..") kept.pop();
    else if (!root) kept.push(segment);
  }
  return { root, segments: kept };
}

const joinPath = ({ root, segments }) => root + segments.join("/");

/** The folder that holds a saved VI, or nothing for an unsaved one. */
export function directoryOf(key) {
  if (!isSavedKey(key)) return "";
  const { root, segments } = splitPath(key);
  return joinPath({ root, segments: segments.slice(0, -1) });
}

/**
 * The absolute path of the VI that a caller (saved or not) refers to with `storedPath`; a `<ovilib>/…` path is
 * resolved against `oviLibRoot`, the ovi.lib folder of this Solder.
 */
export function resolveRelative(callerKey, storedPath, oviLibRoot = "") {
  if (isOviLibPath(storedPath)) {
    const resolved = resolveOviLibPath(storedPath, oviLibRoot);
    return isAbsolutePath(resolved) ? joinPath(collapse(splitPath(resolved))) : resolved;
  }
  if (isAbsolutePath(storedPath)) return joinPath(collapse(splitPath(storedPath)));
  const base = splitPath(directoryOf(callerKey));
  return joinPath(collapse({ root: base.root, segments: [...base.segments, ...splitPath(storedPath).segments] }));
}

/** `target` written relative to the folder `directory`; if they are on different disks, the absolute path. */
export function relativeBetween(directory, target) {
  const from = splitPath(directory);
  const to = splitPath(target);
  if (from.root !== to.root) return joinPath(to);
  let shared = 0;
  while (shared < from.segments.length && shared < to.segments.length - 1 && from.segments[shared] === to.segments[shared]) shared++;
  const climbs = from.segments.length - shared;
  return [...Array(climbs).fill(".."), ...to.segments.slice(shared)].join("/");
}

/**
 * What a caller stores for a subVI the user has chosen at `absolutePath`: the
 * symbolic path if it is in ovi.lib (`oviLibRoot`), else the path relative to
 * the caller if it has a file, and the absolute one if not.
 */
export function storedPathFor(callerKey, absolutePath, oviLibRoot = "") {
  const absolute = joinPath(collapse(splitPath(absolutePath)));
  const symbolic = oviLibPathFor(absolute, oviLibRoot);
  if (symbolic) return symbolic;
  return isSavedKey(callerKey) ? relativeBetween(directoryOf(callerKey), absolute) : absolute;
}

/**
 * The path a caller stored while it lived at `fromKey`, as it must be stored
 * once it lives at `toKey` (first save, or Save As to another folder). The
 * VI it points to is the same one.
 */
export function rebaseStoredPath(storedPath, fromKey, toKey) {
  if (isOviLibPath(storedPath) || !isSavedKey(toKey)) return storedPath;
  if (!isSavedKey(fromKey) && !isAbsolutePath(storedPath)) return storedPath;
  return relativeBetween(directoryOf(toKey), resolveRelative(fromKey, storedPath));
}

const isSubVINode = (node) => node?.tipo === "subvi" && typeof node.config?.vi === "string";

/** The graph of a VI with the subVI paths of its nodes rebased from one location to another. */
export function rebaseGraph(g, fromKey, toKey) {
  let changed = false;
  const nodos = g.nodos.map((node) => {
    if (!isSubVINode(node)) return node;
    const vi = rebaseStoredPath(node.config.vi, fromKey, toKey);
    if (vi === node.config.vi) return node;
    changed = true;
    return { ...node, config: { ...node.config, vi } };
  });
  return changed ? { ...g, nodos } : g;
}

/** Calls `visit` with every `subvi` node of a `.qvi` as an object (its structures and frames included). */
function eachFileSubVINode(value, visit) {
  if (Array.isArray(value)) return value.forEach((item) => eachFileSubVINode(item, visit));
  if (!value || typeof value !== "object") return;
  if (value.type === "subvi" && typeof value.config?.vi === "string") visit(value);
  for (const inner of Object.values(value)) eachFileSubVINode(inner, visit);
}

/** The paths a `.qvi` (as an object) stores for its subVIs, in the order they appear. */
export function subVIPathsInFile(file) {
  const paths = [];
  eachFileSubVINode(file["block-diagram"], (node) => paths.push(node.config.vi));
  return paths;
}

/** The text of a `.qvi` with its subVI paths rebased, formatted as the writer does (core/model/qvi-format.mjs). */
export function rebaseText(text, fromKey, toKey) {
  const file = JSON.parse(text);
  if (file["solder-polymorphic"] !== undefined) return rebasePolymorphicText(file, text, fromKey, toKey);
  let changed = false;
  eachFileSubVINode(file["block-diagram"], (node) => {
    const vi = rebaseStoredPath(node.config.vi, fromKey, toKey);
    if (vi === node.config.vi) return;
    node.config.vi = vi;
    changed = true;
  });
  return changed ? `${JSON.stringify(file, null, 2)}\n` : text;
}

/** A `.sdp` with the paths of its instances rebased (they are stored relative to the `.sdp`, like a caller's subOVIs). */
function rebasePolymorphicText(file, text, fromKey, toKey) {
  let changed = false;
  for (const instance of file.instances ?? []) {
    if (typeof instance?.ovi !== "string") continue;
    const rebased = rebaseStoredPath(instance.ovi, fromKey, toKey);
    if (rebased === instance.ovi) continue;
    instance.ovi = rebased;
    changed = true;
  }
  return changed ? `${JSON.stringify(file, null, 2)}\n` : text;
}

/**
 * Reads a VI and, one level after another, every subVI it calls: `readText(key)`
 * gives the text of a file or `null`; `oviLibRoot` is where `<ovilib>` paths lead. Returns `{ texts, missing }`, with the
 * text of each file that was found by its key (the absolute path) and the keys
 * that could not be read. Whoever opens the hierarchy in the page passes the
 * result to `loadHierarchy`, which cannot read the disk (core/model/hierarchy.mjs).
 */
export async function readHierarchyTexts(rootKey, rootText, readText, oviLibRoot = "") {
  const texts = {};
  const missing = [];
  const visited = new Set([rootKey]);
  const queue = [{ key: rootKey, text: rootText }];
  while (queue.length) {
    const { key, text } = queue.shift();
    let file;
    try {
      file = JSON.parse(text);
    } catch {
      continue;
    }
    // A polymorphic OVI (DT-074) reaches its instances, each stored relative to the `.sdp`.
    const reached = isPolymorphicPath(key) ? (Array.isArray(file.instances) ? file.instances.map((instance) => instance?.ovi).filter((path) => typeof path === "string") : []) : subVIPathsInFile(file);
    for (const stored of reached) {
      const calleeKey = resolveRelative(key, stored, oviLibRoot);
      if (visited.has(calleeKey)) continue;
      visited.add(calleeKey);
      const calleeText = await readText(calleeKey);
      if (calleeText === null) missing.push(calleeKey);
      else {
        texts[calleeKey] = calleeText;
        queue.push({ key: calleeKey, text: calleeText });
      }
    }
  }
  return { texts, missing };
}
