// Where the subOVIs of an OVI are, as paths (DT-045, spec/05 §12).
//
// A `subvi` node stores the path of the OVI file it calls relative to the file of
// its caller. A caller that has never been saved has no folder to be relative
// to, so it stores the absolute path and converts it when it is first saved.
// Pure and independent of the system: it works on strings, with `/` as the
// separator (a Windows path is read with its backslashes turned into `/`), so
// the page and the main process share it. An OVI of ovi.lib is stored by its
// symbolic `<ovilib>/…` path instead (DT-073, core/model/ovi-lib.mjs), which a
// rebase leaves alone: it does not depend on where the caller is.

import { OVI_EXTENSIONS, isOviLibPath, oviLibPathFor, resolveOviLibPath } from "../../../core/model/ovi-lib.mjs";
import { POLYMORPHIC_EXTENSION, isPolymorphicPath } from "../../../core/model/polymorphic.mjs";

const WINDOWS_DRIVE = /^[A-Za-z]:\//;

/**
 * The extension an OVI is written with (DT-094), and the ones Solder wrote before it (DT-051's `.sdg`, the first
 * `.qvi`), which still open: a caller names its subOVIs with the extension they had, so an old file keeps it when it
 * is saved again in place.
 */
export { OVI_EXTENSIONS };
export const OVI_EXTENSION = OVI_EXTENSIONS[0];

/** Whether a path names an OVI file, with any of its extensions and in any case. */
export const isOVIFile = (path) => OVI_EXTENSIONS.some((extension) => path.toLowerCase().endsWith(extension));

/** An OVI's name without its extension, as the error chain and the debugger show it. */
export const withoutOVIExtension = (name) => OVI_EXTENSIONS.reduce((rest, extension) => (rest.toLowerCase().endsWith(extension) ? rest.slice(0, -extension.length) : rest), name);

/**
 * The path a save dialog gave, without the extension the dialog added to a name that already had one of `extensions`:
 * Linux's dialog wrote `first.ovi.ovi` for "first.ovi" typed with the OVI filter chosen (found under Xvfb,
 * labview-captures/reports/2026-11-22-files-tab-editor-try.md). A name typed with a doubled extension on purpose loses
 * the last one too: no Solder file is named so.
 */
export function withoutDoubledExtension(chosen, extensions) {
  const lower = chosen.toLowerCase();
  const added = extensions.find((extension) => lower.endsWith(extension) && extensions.some((first) => lower.slice(0, -extension.length).endsWith(first)));
  return added ? chosen.slice(0, -added.length) : chosen;
}

/** Where Save As writes the path the user chose: as it is if it already names an OVI file, with `.ovi` added if not. */
export function savePathFor(chosen) {
  const path = withoutDoubledExtension(chosen, OVI_EXTENSIONS);
  return isOVIFile(path) ? path : `${path}${OVI_EXTENSION}`;
}

/**
 * Where Save As writes a polymorphic OVI (DT-074): the path the user chose, with `.sdp` added if it does not end so.
 * LabVIEW writes a `.vi`; Solder's polymorphic OVI is a file of its own.
 */
export function polymorphicSavePathFor(chosen) {
  const path = withoutDoubledExtension(chosen, [POLYMORPHIC_EXTENSION]);
  return isPolymorphicPath(path) ? path : `${path}${POLYMORPHIC_EXTENSION}`;
}

/** What Save As proposes for a polymorphic OVI: its name with `.sdp`. */
export const polymorphicSaveProposal = (currentPath, name) => `${(currentPath ?? name).replace(/\.[^./\\]+$/, "")}${POLYMORPHIC_EXTENSION}`;

/** The stylesheet that goes with an OVI file (DT-058 §2): the same name with `.css`, next to it. */
export const companionStylesheetPath = (oviPath) => `${withoutOVIExtension(oviPath)}.css`;

/** What Save As proposes: the same name with `.ovi`, so an old `.sdg` or `.qvi` is offered under the new extension. */
export const saveAsProposal = (currentPath, name) => (currentPath ? `${withoutOVIExtension(currentPath)}${OVI_EXTENSION}` : `${withoutOVIExtension(name)}${OVI_EXTENSION}`);

const withSlashes = (path) => path.replaceAll("\\", "/");

/** The key of a saved OVI: its path with `/` as separator, whatever the system. */
export const pathKey = withSlashes;

/** Is it a path from the root of a disk, and not one relative to a folder? */
export const isAbsolutePath = (path) => withSlashes(path).startsWith("/") || WINDOWS_DRIVE.test(withSlashes(path));

/** The key of an OVI that has no file yet. It is not a path: it never contains a folder. */
export const untitledKey = (id) => `untitled:${id}`;

/** Does this key stand for an OVI saved in a file? */
export const isSavedKey = (key) => typeof key === "string" && isAbsolutePath(key);

/** The name an OVI goes by: its file name once saved, `untitledName` ("Untitled N") before (spec/04 Rule 21k). */
export const oviDisplayName = (key, untitledName) => (isSavedKey(key) ? withSlashes(key).split("/").pop() : untitledName);

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

/** The folder that holds a saved OVI, or nothing for an unsaved one. */
export function directoryOf(key) {
  if (!isSavedKey(key)) return "";
  const { root, segments } = splitPath(key);
  return joinPath({ root, segments: segments.slice(0, -1) });
}

/**
 * The absolute path of the OVI that a caller (saved or not) refers to with `storedPath`; a `<ovilib>/…` path is
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
 * What a caller stores for a subOVI the user has chosen at `absolutePath`: the
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
 * OVI it points to is the same one.
 */
export function rebaseStoredPath(storedPath, fromKey, toKey) {
  if (isOviLibPath(storedPath) || !isSavedKey(toKey)) return storedPath;
  if (!isSavedKey(fromKey) && !isAbsolutePath(storedPath)) return storedPath;
  return relativeBetween(directoryOf(toKey), resolveRelative(fromKey, storedPath));
}

const isSubOVINode = (node) => node?.tipo === "subvi" && typeof node.config?.vi === "string";

/** An object's type definition link (DT-096), stored like a subOVI's path: relative to the OVI that follows it. */
const hasTypeDefinitionPath = (holder) => typeof holder?.typedef?.path === "string";

/** A node's configuration with its stored paths (subOVI, type definition) rebased; the same object when nothing moved. */
function rebasedConfig(node, fromKey, toKey) {
  let config = node.config;
  if (isSubOVINode(node)) config = { ...config, vi: rebaseStoredPath(config.vi, fromKey, toKey) };
  if (hasTypeDefinitionPath(config)) config = { ...config, typedef: { ...config.typedef, path: rebaseStoredPath(config.typedef.path, fromKey, toKey) } };
  const moved = config.vi !== node.config?.vi || config.typedef?.path !== node.config?.typedef?.path;
  return moved ? config : node.config;
}

/** The graph of an OVI with the subOVI and type definition paths of its nodes rebased from one location to another. */
export function rebaseGraph(g, fromKey, toKey) {
  let changed = false;
  const nodos = g.nodos.map((node) => {
    if (!node.config) return node;
    const config = rebasedConfig(node, fromKey, toKey);
    if (config === node.config) return node;
    changed = true;
    return { ...node, config };
  });
  return changed ? { ...g, nodos } : g;
}

/** Calls `visit` with every object of a file that holds a type definition link: front-panel items and node configurations. */
function eachFileTypeDefinitionHolder(value, visit) {
  if (Array.isArray(value)) return value.forEach((item) => eachFileTypeDefinitionHolder(item, visit));
  if (!value || typeof value !== "object") return;
  if (hasTypeDefinitionPath(value)) visit(value);
  for (const inner of Object.values(value)) eachFileTypeDefinitionHolder(inner, visit);
}

/** The paths of the type definitions (`.octl`, DT-096) an `.ovi` (as an object) follows, in the order they appear. */
export function typeDefinitionPathsInFile(file) {
  const paths = [];
  eachFileTypeDefinitionHolder([file["front-panel"], file["block-diagram"]], (holder) => paths.push(holder.typedef.path));
  return paths;
}

/** Calls `visit` with every `subvi` node of a `.qvi` as an object (its structures and frames included). */
function eachFileSubOVINode(value, visit) {
  if (Array.isArray(value)) return value.forEach((item) => eachFileSubOVINode(item, visit));
  if (!value || typeof value !== "object") return;
  if (value.type === "subvi" && typeof value.config?.vi === "string") visit(value);
  for (const inner of Object.values(value)) eachFileSubOVINode(inner, visit);
}

/** The paths a `.qvi` (as an object) stores for its subOVIs, in the order they appear. */
export function subOVIPathsInFile(file) {
  const paths = [];
  eachFileSubOVINode(file["block-diagram"], (node) => paths.push(node.config.vi));
  return paths;
}

/** The text of a `.qvi` with its subOVI paths rebased, formatted as the writer does (core/model/qvi-format.mjs). */
export function rebaseText(text, fromKey, toKey) {
  const file = JSON.parse(text);
  if (file["solder-polymorphic"] !== undefined) return rebasePolymorphicText(file, text, fromKey, toKey);
  let changed = false;
  eachFileTypeDefinitionHolder([file["front-panel"], file["block-diagram"]], (holder) => {
    const rebased = rebaseStoredPath(holder.typedef.path, fromKey, toKey);
    if (rebased === holder.typedef.path) return;
    holder.typedef.path = rebased;
    changed = true;
  });
  eachFileSubOVINode(file["block-diagram"], (node) => {
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
 * The paths a file (as an object) stores for what it calls: a polymorphic OVI (DT-074) its instances, each stored
 * relative to the `.sdp`; an OVI its subOVIs and the type definitions it follows (DT-096); a `.octl`, nothing.
 */
export function storedCalleePaths(key, file) {
  if (isPolymorphicPath(key)) return Array.isArray(file.instances) ? file.instances.map((instance) => instance?.ovi).filter((path) => typeof path === "string") : [];
  return [...subOVIPathsInFile(file), ...typeDefinitionPathsInFile(file)];
}

/**
 * Reads an OVI and, one level after another, every subOVI it calls: `readText(key)`
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
    for (const stored of storedCalleePaths(key, file)) {
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
