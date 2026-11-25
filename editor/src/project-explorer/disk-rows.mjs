// The rows of a project's tree that are read from the disk and never stored (DT-099 stage c), from what the main
// process read (editor/electron/project-disk-requests.mjs). Measured in LabVIEW 2026 Q3:
// - Dependencies (labview-captures/reports/2026-11-17-project-explorer-s1.md Q4): the files of the library in one folder
//   first, as LabVIEW groups `vi.lib`, then the others, each sorted by file name.
// - An auto-populating folder (2026-11-21-project-explorer-s5.md Q1): its folders, with the same icon and a menu of
//   their own, then its files, in the order the main process gives (core/model/auto-populating.mjs `inDiskOrder`).
// Pure.

import { ITEM_KINDS, LIBRARY_FOLDER, fileNameOf, itemKindOf } from "../../../core/model/project.mjs";

/** The kinds of row read from the disk, each with its measured menu (s2 Q1, s5 Q1). */
export const DISK_ROW_KINDS = Object.freeze({
  DEPENDENCY_LIBRARY: "dependency-library",
  DEPENDENCY_OVI: "dependency-ovi",
  DEPENDENCY_TYPE_DEFINITION: "dependency-type-definition",
  AUTO_POPULATING_SUBFOLDER: "auto-populating-subfolder",
  AUTO_POPULATED_FILE: "auto-populated-file",
});

/** The icons a row may draw apart from its kind's: a file of an auto-populating folder is drawn by its type. */
export const ROW_ICONS = Object.freeze({ OVI: "ovi", DOCUMENT: "document", TYPE_DEFINITION: "type-definition" });

/** What the files say before the main process has read them: nothing. */
export const EMPTY_DISK = Object.freeze({ dependencies: Object.freeze({ library: [], others: [], missing: [] }), folders: Object.freeze({}) });

const TYPE_DEFINITION_EXTENSION = ".octl";
export const isTypeDefinition = (path) => path.toLowerCase().endsWith(TYPE_DEFINITION_EXTENSION);

/** A file's icon: a type definition has its own (measured: a `.ctl` is not drawn as a VI, s5 Q1). */
const iconOfFile = (path) => (isTypeDefinition(path) ? ROW_ICONS.TYPE_DEFINITION : itemKindOf(path) === ITEM_KINDS.OVI ? ROW_ICONS.OVI : ROW_ICONS.DOCUMENT);

/** A dependency's row kind: a type definition has the menu of LabVIEW's `.ctl`; anything else is an OVI's. */
const kindOfDependency = (path) => (isTypeDefinition(path) ? DISK_ROW_KINDS.DEPENDENCY_TYPE_DEFINITION : DISK_ROW_KINDS.DEPENDENCY_OVI);

/** A row's key under `parentKey`, named by what it shows so that it stays the same when other rows come and go. */
const keyUnder = (parentKey, prefix, name) => `${parentKey}/${prefix}:${encodeURIComponent(name)}`;

/** A file that could not be read keeps its row, marked so (how LabVIEW draws a missing dependency was not measured). */
function dependencyNode(parentKey, path, missing) {
  return { key: keyUnder(parentKey, "dep", path), kind: kindOfDependency(path), label: fileNameOf(path), path, children: [], ...(missing.has(path) && { missing: true }) };
}

/** The nodes under Dependencies, whose own key is `dependenciesKey`. */
export function dependencyNodes(dependencies, dependenciesKey) {
  const missing = new Set(dependencies.missing);
  const libraryKey = `${dependenciesKey}/${LIBRARY_FOLDER}`;
  const library = dependencies.library.length ? [{ key: libraryKey, kind: DISK_ROW_KINDS.DEPENDENCY_LIBRARY, label: LIBRARY_FOLDER, children: dependencies.library.map((path) => dependencyNode(libraryKey, path, missing)) }] : [];
  return [...library, ...dependencies.others.map((path) => dependencyNode(dependenciesKey, path, missing))];
}

/** The nodes of a listing of the disk under `parentKey`; `path` is the stored path, as the project stores its items. */
export function folderNodes(entries, parentKey) {
  return entries.map((entry) => {
    const key = keyUnder(parentKey, "disk", entry.name);
    if (entry.folder) return { key, kind: DISK_ROW_KINDS.AUTO_POPULATING_SUBFOLDER, label: entry.name, path: entry.path, children: folderNodes(entry.entries ?? [], key) };
    return { key, kind: DISK_ROW_KINDS.AUTO_POPULATED_FILE, icon: iconOfFile(entry.path), label: entry.name, path: entry.path, children: [] };
  });
}
