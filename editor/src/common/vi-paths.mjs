// Where the subVIs of a VI are, as paths (DT-045, spec/05 §12).
//
// A `subvi` node stores the path of the `.qvi` it calls relative to the file of
// its caller. A caller that has never been saved has no folder to be relative
// to, so it stores the absolute path and converts it when it is first saved.
// Pure and independent of the system: it works on strings, with `/` as the
// separator (a Windows path is read with its backslashes turned into `/`), so
// the page and the main process share it.

const WINDOWS_DRIVE = /^[A-Za-z]:\//;

const withSlashes = (path) => path.replaceAll("\\", "/");

/** The key of a saved VI: its path with `/` as separator, whatever the system. */
export const pathKey = withSlashes;

/** Is it a path from the root of a disk, and not one relative to a folder? */
export const isAbsolutePath = (path) => withSlashes(path).startsWith("/") || WINDOWS_DRIVE.test(withSlashes(path));

/** The key of a VI that has no file yet. It is not a path: it never contains a folder. */
export const untitledKey = (id) => `untitled:${id}`;

/** Does this key stand for a VI saved in a file? */
export const isSavedKey = (key) => typeof key === "string" && isAbsolutePath(key);

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

/** The absolute path of the VI that a caller (saved or not) refers to with `storedPath`. */
export function resolveRelative(callerKey, storedPath) {
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
 * path relative to the caller if it has a file, and the absolute one if not.
 */
export const storedPathFor = (callerKey, absolutePath) => (isSavedKey(callerKey) ? relativeBetween(directoryOf(callerKey), joinPath(collapse(splitPath(absolutePath)))) : joinPath(collapse(splitPath(absolutePath))));

/**
 * The path a caller stored while it lived at `fromKey`, as it must be stored
 * once it lives at `toKey` (first save, or Save As to another folder). The
 * VI it points to is the same one.
 */
export function rebaseStoredPath(storedPath, fromKey, toKey) {
  if (!isSavedKey(toKey)) return storedPath;
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
  let changed = false;
  eachFileSubVINode(file["block-diagram"], (node) => {
    const vi = rebaseStoredPath(node.config.vi, fromKey, toKey);
    if (vi === node.config.vi) return;
    node.config.vi = vi;
    changed = true;
  });
  return changed ? `${JSON.stringify(file, null, 2)}\n` : text;
}

/**
 * Reads a VI and, one level after another, every subVI it calls: `readText(key)`
 * gives the text of a file or `null`. Returns `{ texts, missing }`, with the
 * text of each file that was found by its key (the absolute path) and the keys
 * that could not be read. Whoever opens the hierarchy in the page passes the
 * result to `loadHierarchy`, which cannot read the disk (core/model/hierarchy.mjs).
 */
export async function readHierarchyTexts(rootKey, rootText, readText) {
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
    for (const stored of subVIPathsInFile(file)) {
      const calleeKey = resolveRelative(key, stored);
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
