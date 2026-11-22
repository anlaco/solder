// Editing a project's tree (DT-099 stage b): removing, renaming and moving items, and adding them into a folder. An
// item is found by its place, the list of indices from the project's top items down (the Project Explorer's row keys
// are the same places), and every change leaves each level in LabVIEW's order (folders first, then by name: Arrange By
// ▸ Name, measured), so the place of an item may change after an edit. Pure, as core/model/project.mjs.

import { ALREADY_IN_PROJECT, ITEM_KINDS, NEW_FOLDER_NAME, fileItem, fileNameOf, inFileOrder, itemsWithPaths } from "./project.mjs";

export { ALREADY_IN_PROJECT };

/** The items the user cannot remove, rename or move: the target and its two fixed items (measured: their menus have no such rows). */
const FIXED_KINDS = new Set([ITEM_KINDS.TARGET, ITEM_KINDS.DEPENDENCIES, ITEM_KINDS.BUILD]);

/** Can the user remove, rename or move this item? */
export const isEditable = (item) => !!item && !FIXED_KINDS.has(item.kind);

/** Can items be put into this one: the target or a virtual folder (an auto-populating folder mirrors the disk instead). */
export const holdsItems = (item) => !!item && (item.kind === ITEM_KINDS.TARGET || (item.kind === ITEM_KINDS.FOLDER && !item.autoPopulating));

/** The item at `place`, or undefined. */
export function itemAt(project, place) {
  let items = project.items;
  let item;
  for (const index of place) {
    item = items?.[index];
    items = item?.items;
  }
  return place.length ? item : undefined;
}

/** The project with the list of items at `place` (the top list for `[]`) changed by `change`, then put back in order. */
function withItemsAt(project, place, change) {
  if (!place.length) return { ...project, items: change(project.items) };
  const [first, ...rest] = place;
  const replaced = (item) => (rest.length ? withItemsAt(item, rest, change) : { ...item, items: inFileOrder(change(item.items ?? [])) });
  return { ...project, items: project.items.map((item, index) => (index === first ? replaced(item) : item)) };
}

const parentOf = (place) => place.slice(0, -1);
const lastOf = (place) => place[place.length - 1];

/** The project without the item at `place`, a folder with everything in it (Remove From Project). A fixed item stays. */
export function removeItem(project, place) {
  if (!isEditable(itemAt(project, place))) return project;
  return withItemsAt(project, parentOf(place), (items) => items.filter((_item, index) => index !== lastOf(place)));
}

/** The project without the items at `places`, removed from the last to the first so that earlier places stay true. */
export function removeItems(project, places) {
  const deepestLast = [...places].sort((first, second) => second.join("/").localeCompare(first.join("/"), "en", { numeric: true }));
  return deepestLast.reduce(removeItem, project);
}

/** The project with the folder at `place` renamed in the tree; a file item is renamed with its file (`renameFileItem`). */
export function renameItem(project, place, name) {
  if (!isEditable(itemAt(project, place)) || !name) return project;
  return withItemsAt(project, parentOf(place), (items) => items.map((item, index) => (index === lastOf(place) ? { ...item, name } : item)));
}

/**
 * The project with the file item at `place` (an OVI) pointing at `storedPath`, its name the new file's: LabVIEW's Rename of
 * a VI renames its file, and the item's name and URL follow (measured: reports/2026-11-18-project-explorer-s4.md "Rename").
 */
export function renameFileItem(project, place, storedPath) {
  const item = itemAt(project, place);
  if (!isEditable(item) || item.path === undefined || !storedPath) return project;
  return replaceItem(project, place, { ...item, name: fileNameOf(storedPath), path: storedPath });
}

/** Is `inner` the place `outer` or one below it? */
const isWithin = (inner, outer) => outer.every((index, depth) => inner[depth] === index) && inner.length >= outer.length;

/**
 * Where the place `place` is once the item at `removed` is gone: one index less at the removed item's level when it
 * came after it in the same list. Removing keeps every list's order, so nothing else moves.
 */
function placeAfterRemoving(place, removed) {
  const depth = removed.length - 1;
  const sameList = place.length > depth && parentOf(removed).every((index, level) => place[level] === index);
  if (!sameList || place[depth] < removed[depth]) return place;
  return place.map((index, level) => (level === depth ? index - 1 : index));
}

/**
 * The project with the item at `from` moved into the target or virtual folder at `into` (a drag in the tree). Refused,
 * the project unchanged, when the item is fixed, when `into` cannot hold items, when it is the item itself or inside it,
 * or when the item is already there.
 */
export function moveItem(project, from, into) {
  const moved = itemAt(project, from);
  if (!isEditable(moved) || !holdsItems(itemAt(project, into)) || isWithin(into, from)) return project;
  if (parentOf(from).join("/") === into.join("/")) return project;
  return withItemsAt(removeItem(project, from), placeAfterRemoving(into, from), (items) => [...items, moved]);
}

/** The project with the item at `place` replaced by `replacement`, its list put back in order. */
export const replaceItem = (project, place, replacement) => withItemsAt(project, parentOf(place), (items) => items.map((item, index) => (index === lastOf(place) ? replacement : item)));

/** The project with `added` put into the target or virtual folder at `into`; refused when `into` cannot hold items. */
export function addInto(project, into, added) {
  if (!holdsItems(itemAt(project, into))) return project;
  return withItemsAt(project, into, (items) => [...items, ...added]);
}

/**
 * The project with the files at `storedPaths` added into the target or virtual folder at `into` (Add ▸ File... from its
 * menu). A file already in the project is skipped and returned in `refused`, as LabVIEW reports it ("Unable to Add Items").
 */
export function addFilesInto(project, into, storedPaths) {
  const present = new Set(itemsWithPaths(project).map((item) => item.path));
  const refused = storedPaths.filter((path) => present.has(path));
  const files = [...new Set(storedPaths.filter((path) => !present.has(path)))].map(fileItem);
  return { project: files.length ? addInto(project, into, files) : project, refused };
}

/** The project with a new empty virtual folder, "New Folder" (measured), in the target or virtual folder at `into`. */
export const addVirtualFolderInto = (project, into, name = NEW_FOLDER_NAME) => addInto(project, into, [{ name, kind: ITEM_KINDS.FOLDER, items: [] }]);

/**
 * The project with a virtual folder named `folderName` holding the files at `storedPaths`, put into the target or virtual
 * folder at `into` (Add ▸ Folder (Snapshot)..., stored as a virtual folder with its files, measured: s2 Q3). A file already
 * in the project is skipped and returned in `refused`, as `addFilesInto` does; the folder is added even when every file was.
 */
export function addSnapshotFolderInto(project, into, folderName, storedPaths) {
  const present = new Set(itemsWithPaths(project).map((item) => item.path));
  const refused = storedPaths.filter((path) => present.has(path));
  const files = [...new Set(storedPaths.filter((path) => !present.has(path)))].map(fileItem);
  const folder = { name: folderName, kind: ITEM_KINDS.FOLDER, items: inFileOrder(files) };
  return { project: addInto(project, into, [folder]), refused };
}

/** The project with an auto-populating folder that mirrors the folder at `storedPath`, put into the target or virtual folder at `into`. */
export const addAutoPopulatingFolderInto = (project, into, storedPath) => addInto(project, into, [{ name: fileNameOf(storedPath), kind: ITEM_KINDS.FOLDER, path: storedPath, autoPopulating: true, items: [] }]);
