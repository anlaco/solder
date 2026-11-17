// Projects (DT-099): a `.sdproj` is LabVIEW's `.lvproj` copied one to one in JSON. Read from LabVIEW 2026 Q3's own
// files (reports/2026-11-17-project-explorer-s1.md): one item tree under the target My Computer, the user's items
// written sorted by name, then always Dependencies and Build Specifications. Dependencies is never written with
// contents: it is computed from the items' callees when the project is open (DT-099 §4).
//
// An item is `{ name, kind, path?, autoPopulating?, items? }`: its name in the tree, its kind (LabVIEW's item types
// in Solder's words, DT-099 §2), the file or folder it stands for by a path relative to the `.sdproj`'s folder (DT-099
// §3), whether a folder mirrors a folder on disk, and the items a folder or a target holds. Pure: no files are read.

import { isPolymorphicPath } from "./polymorphic.mjs";
import { OVI_EXTENSIONS } from "./ovi-lib.mjs";

export const PROJECT_EXTENSION = ".sdproj";

/** The version of the `.sdproj` format this Solder reads and writes; a newer one is refused. */
export const PROJECT_VERSION = 1;

/** LabVIEW's item types, as the `.sdproj` writes them (DT-099 §2). */
export const ITEM_KINDS = Object.freeze({ TARGET: "my-computer", OVI: "ovi", DOCUMENT: "document", FOLDER: "folder", DEPENDENCIES: "dependencies", BUILD: "build" });

/** The names LabVIEW gives the fixed items (measured), which a project file always holds. */
export const MY_COMPUTER = "My Computer";
export const DEPENDENCIES = "Dependencies";
export const BUILD_SPECIFICATIONS = "Build Specifications";

/** The items LabVIEW keeps last under a target, in this order, whatever the user adds (measured). */
const FIXED_KINDS = [ITEM_KINDS.DEPENDENCIES, ITEM_KINDS.BUILD];

export class ProjectFileError extends Error {}

/** Does a path name a project? */
export const isProjectPath = (path) => typeof path === "string" && path.toLowerCase().endsWith(PROJECT_EXTENSION);

/** The extension of a control file (DT-093 §5), which LabVIEW lists as a VI item (measured: a `.ctl` is written `Type="VI"`). */
const CONTROL_EXTENSION = ".octl";

/** The kind of item a file becomes when it is added: an OVI (a polymorphic OVI and a control too, as LabVIEW's are VIs), or a document. */
export function itemKindOf(path) {
  const lower = path.toLowerCase();
  const isOVI = OVI_EXTENSIONS.some((extension) => lower.endsWith(extension)) || isPolymorphicPath(path) || lower.endsWith(CONTROL_EXTENSION);
  return isOVI ? ITEM_KINDS.OVI : ITEM_KINDS.DOCUMENT;
}

/** A file's name, the last part of its path, as the tree names the item. */
export const fileNameOf = (path) => path.replaceAll("\\", "/").split("/").pop();

/** A new blank project, as File ▸ Create Project... ▸ Blank Project makes it: My Computer with its two fixed items. */
export const blankProject = () => ({
  items: [{ name: MY_COMPUTER, kind: ITEM_KINDS.TARGET, items: [{ name: DEPENDENCIES, kind: ITEM_KINDS.DEPENDENCIES }, { name: BUILD_SPECIFICATIONS, kind: ITEM_KINDS.BUILD }] }],
});

/** Two names in LabVIEW's order: by name, whatever the case ("EnumTD.ctl" before "q3.vi", measured). */
const byName = (first, second) => first.localeCompare(second, "en", { sensitivity: "base" });

/**
 * The items of a target or folder as LabVIEW writes and shows them (measured, Arrange By ▸ Name): folders first, then
 * the other items, each group by name; the fixed items last in their order.
 */
function inFileOrder(items) {
  const fixed = FIXED_KINDS.map((kind) => items.find((item) => item.kind === kind)).filter(Boolean);
  const own = items.filter((item) => !FIXED_KINDS.includes(item.kind));
  const sorted = (group) => group.sort((first, second) => byName(first.name, second.name));
  return [...sorted(own.filter((item) => item.kind === ITEM_KINDS.FOLDER)), ...sorted(own.filter((item) => item.kind !== ITEM_KINDS.FOLDER)), ...fixed];
}

/** An item as the file holds it; Dependencies is written with no contents, whatever the tree shows (measured). */
function itemToFile(item) {
  const file = { name: item.name, kind: item.kind };
  if (item.path !== undefined) file.path = item.path;
  if (item.autoPopulating) file["auto-populating"] = true;
  // Dependencies and an auto-populating folder are written with no contents: both are read again from the disk (measured).
  if (item.items && item.kind !== ITEM_KINDS.DEPENDENCIES && !item.autoPopulating) file.items = inFileOrder(item.items).map(itemToFile);
  return file;
}

/** The text of a project: JSON indented by two spaces; saving an unchanged project gives the same text (measured in LabVIEW). */
export function writeProject(project) {
  return `${JSON.stringify({ "solder-project": PROJECT_VERSION, items: project.items.map(itemToFile) }, null, 2)}\n`;
}

/** An item read from the file, checked as far as the core needs. */
function itemFromFile(file, where) {
  if (typeof file?.name !== "string" || !Object.values(ITEM_KINDS).includes(file.kind)) throw new ProjectFileError(`${where}: an item has a name and one of the kinds ${Object.values(ITEM_KINDS).join(", ")}`);
  const item = { name: file.name, kind: file.kind };
  if (typeof file.path === "string") item.path = file.path;
  if (file["auto-populating"] === true) item.autoPopulating = true;
  if (Array.isArray(file.items)) item.items = file.items.map((inner) => itemFromFile(inner, `${where}/${file.name}`));
  return item;
}

/** A project read from its text or object. Throws `ProjectFileError` when it is not a `.sdproj` this Solder reads. */
export function readProject(text) {
  let file;
  try {
    file = typeof text === "string" ? JSON.parse(text) : text;
  } catch (error) {
    throw new ProjectFileError(`not a project: ${error.message}`);
  }
  const version = file?.["solder-project"];
  if (!Number.isInteger(version) || version < 1 || version > PROJECT_VERSION) throw new ProjectFileError(`project format version ${version}: this Solder reads versions 1 to ${PROJECT_VERSION}`);
  if (!Array.isArray(file.items) || !file.items.some((item) => item?.kind === ITEM_KINDS.TARGET)) throw new ProjectFileError("a project holds the target My Computer");
  return { items: file.items.map((item) => itemFromFile(item, "")) };
}

/** The target My Computer of a project. */
export const myComputer = (project) => project.items.find((item) => item.kind === ITEM_KINDS.TARGET);

/** Every item of the tree with a path on disk, at any depth, Dependencies excluded. */
export function itemsWithPaths(project) {
  const found = [];
  const walk = (items) => {
    for (const item of items) {
      if (item.kind === ITEM_KINDS.DEPENDENCIES) continue;
      if (item.path !== undefined && item.kind !== ITEM_KINDS.FOLDER) found.push(item);
      if (item.items) walk(item.items);
    }
  };
  walk(project.items);
  return found;
}

/** LabVIEW's reason for a file that is already an item (measured: "Unable to Add Items", 0xDAC2). */
export const ALREADY_IN_PROJECT = "An item with this path already exists in the project.";

/** The project with `added` appended to the target's items. */
const withTargetItem = (project, added) => ({ ...project, items: project.items.map((item) => (item.kind === ITEM_KINDS.TARGET ? { ...item, items: [...item.items, added] } : item)) });

/** A file item for `storedPath`. */
const fileItem = (storedPath) => ({ name: fileNameOf(storedPath), kind: itemKindOf(storedPath), path: storedPath });

/**
 * The project with the files at `storedPaths` added under the target (Add ▸ File...), or, given `folderName`, inside a
 * new folder of that name (Add ▸ Folder (Snapshot)..., stored as a virtual folder with its files, measured). A file
 * already in the project is skipped and returned in `refused`, as LabVIEW reports it in "Unable to Add Items".
 */
export function addFiles(project, storedPaths, folderName) {
  const present = new Set(itemsWithPaths(project).map((item) => item.path));
  const refused = storedPaths.filter((path) => present.has(path));
  const files = storedPaths.filter((path) => !present.has(path)).map(fileItem);
  if (!files.length && folderName === undefined) return { project, refused };
  const added = folderName === undefined ? files : [{ name: folderName, kind: ITEM_KINDS.FOLDER, items: files }];
  return { project: added.reduce(withTargetItem, project), refused };
}

/** The name LabVIEW gives a new virtual folder (measured). */
export const NEW_FOLDER_NAME = "New Folder";

/** The project with a new empty virtual folder under the target (My Computer ▸ New ▸ Virtual Folder). */
export const addVirtualFolder = (project, name = NEW_FOLDER_NAME) => withTargetItem(project, { name, kind: ITEM_KINDS.FOLDER, items: [] });

/** The project with an auto-populating folder that mirrors the folder at `storedPath` (Add ▸ Folder (Auto-populating)...). */
export const addAutoPopulatingFolder = (project, storedPath) => withTargetItem(project, { name: fileNameOf(storedPath), kind: ITEM_KINDS.FOLDER, path: storedPath, autoPopulating: true, items: [] });

/** The folder item LabVIEW's Dependencies groups `vi.lib` under (measured); Solder's library, `ovi.lib`, goes there. */
export const LIBRARY_FOLDER = "ovi.lib";

/**
 * What the tree shows under Dependencies (measured: reports/2026-11-17-project-explorer-s1.md Q4): every file the
 * items call, at any depth (subOVIs and type definitions), that is not an item itself. Those of Solder's library go
 * into one folder item, `ovi.lib`, first; the rest follow; each list sorted by file name. `itemKeys` are the absolute
 * keys of the items, `calleesOf(key)` the absolute keys a file calls directly, `isLibraryKey(key)` whether a key is in
 * Solder's library. Returns `{ library, others }`, lists of keys.
 */
export function dependencyKeys(itemKeys, calleesOf, isLibraryKey) {
  const items = new Set(itemKeys);
  const reached = new Set();
  const pending = [...itemKeys];
  while (pending.length) {
    for (const callee of calleesOf(pending.pop()) ?? []) {
      if (reached.has(callee)) continue;
      reached.add(callee);
      pending.push(callee);
    }
  }
  const dependencies = [...reached].filter((key) => !items.has(key)).sort((first, second) => byName(fileNameOf(first), fileNameOf(second)));
  return { library: dependencies.filter(isLibraryKey), others: dependencies.filter((key) => !isLibraryKey(key)) };
}
