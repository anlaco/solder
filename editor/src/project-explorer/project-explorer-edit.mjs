// Editing the project from the Project Explorer's tree (DT-099 stage b): adding items, a new virtual folder and the
// in-place edit of a name, Remove From Project with its question, and the drag that moves an item. Measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-18-project-explorer-s4.md, -s2.md). Pure, as project-explorer-state.mjs: each call
// takes the window's state and gives the next one, so the page only turns events into calls.
//
// The project's own edits are core/model/project-tree.mjs's; what this adds is what the window keeps in step with them:
// every edit re-sorts a list, so a row's key (its place) may change, and the selection and the expanded rows follow the
// items, not the keys.

import { ITEM_KINDS, NEW_FOLDER_NAME, withoutWindow, writeProject } from "../../../core/model/project.mjs";
import { addAutoPopulatingFolderInto, addFilesInto, addInto, addSnapshotFolderInto, addVirtualFolderInto, holdsItems, isEditable, itemAt, moveItem, removeItem, renameFileItem, renameItem } from "../../../core/model/project-tree.mjs";
import { newOviItem, withNewOviSaved, withoutNewOvi } from "../../../core/model/project-new-ovis.mjs";
import { ROOT_KEY, ROW_KINDS, keyOfPlace, nodeAt, placeOfKey, targetKeyOf, visibleRows } from "./project-explorer-state.mjs";
import { ROW_ICONS } from "./disk-rows.mjs";
import { autoPopulatingPlaces, convertToAutoPopulating as convertFolder, stopAutoPopulating as stopFolder, withFolderGone } from "../../../core/model/auto-populating.mjs";

/**
 * The project as the main process compares it with the saved one (editor/electron/project-registry.mjs `projectBody`: no
 * window place). The page sends it after every edit and the title's asterisk follows "differs from the saved text". LabVIEW
 * leaves the asterisk off after Add and Remove, yet asks on close (measured: s4 "Asterisk"); Solder shows it after every edit.
 */
export const projectText = (project) => writeProject(withoutWindow(project));

const parentOf = (place) => place.slice(0, -1);
const itemOf = (state, key) => itemAt(state.project, placeOfKey(key));

/** The item of the selected row, or undefined for the project's own row. */
export const selectedItem = (state) => itemOf(state, state.selected);

/** Is the selected row an item the user can remove (not the project, the target, Dependencies or Build Specifications)? */
export const canRemove = (state) => isEditable(selectedItem(state));

/** The items at `parentPlace` (the top ones for `[]`). */
const itemsAt = (project, parentPlace) => (parentPlace.length ? itemAt(project, parentPlace)?.items : project.items) ?? [];

/** The place of `item` (the same object) at any depth, or undefined. */
function placeOfObject(items, item, prefix = []) {
  for (const [index, candidate] of items.entries()) {
    const place = [...prefix, index];
    if (candidate === item) return place;
    const inner = candidate.items && placeOfObject(candidate.items, item, place);
    if (inner) return inner;
  }
  return undefined;
}

/** The place of the item that is in `after`'s list at `parentPlace` and was not in `before`'s: the one an edit added or renamed. */
function newItemPlace(before, after, parentPlace) {
  const known = new Set(itemsAt(before, parentPlace));
  const index = itemsAt(after, parentPlace).findIndex((item) => !known.has(item));
  return [...parentPlace, index];
}

/**
 * Where the item that was at `place` before an edit is after it. An edit keeps the objects of every item it does not
 * touch, so they are found as they are; the ancestors of the edit are new objects that stay where they were.
 * `alias` is the one place an edit changed on purpose (a renamed item: `{ from, to }`).
 */
function placeAfterEdit(before, after, place, alias) {
  if (alias && alias.from.join("/") === place.join("/")) return alias.to;
  const item = itemAt(before, place);
  const found = item && placeOfObject(after.items, item);
  if (found) return found;
  const sameSpot = itemAt(after, place);
  return item && sameSpot?.name === item.name && sameSpot.kind === item.kind ? place : undefined;
}

/** A key split into the item's part (the indices of its place) and what a row read from the disk adds after it. */
function splitDiskKey(key) {
  const segments = key.split("/");
  const firstDiskSegment = segments.findIndex((segment, index) => index > 0 && !/^\d+$/.test(segment));
  if (firstDiskSegment < 0) return { itemKey: key, diskSuffix: "" };
  return { itemKey: segments.slice(0, firstDiskSegment).join("/"), diskSuffix: `/${segments.slice(firstDiskSegment).join("/")}` };
}

/** `expanded` with the rows of `place` and of everything above it, so that the row at `place` is open and its children shown. */
const withPathExpanded = (expanded, place) => [...new Set([...expanded, ...place.map((_index, depth) => keyOfPlace(place.slice(0, depth + 1)))])];

/**
 * The window for `project` after an edit: the menus closed, the selection and the expanded rows following their items.
 * `select` is the place to select, if the edit decides it; `open` a place to open (the folder that received an item,
 * which LabVIEW's measurements did not say); `alias` as in `placeAfterEdit`.
 */
function followEdit(state, project, { select, open, alias } = {}) {
  const follow = (key) => {
    if (key === ROOT_KEY) return key;
    // A row read from the disk (under Dependencies or in an auto-populating folder) follows the item it hangs from.
    const { itemKey, diskSuffix } = splitDiskKey(key);
    const place = placeAfterEdit(state.project, project, placeOfKey(itemKey), alias);
    return place && `${keyOfPlace(place)}${diskSuffix}`;
  };
  const expanded = state.expanded.map(follow).filter(Boolean);
  const selected = select ? keyOfPlace(select) : (follow(state.selected) ?? targetKeyOf(project));
  return { ...state, project, selected, expanded: open ? withPathExpanded(expanded, open) : expanded, abierta: null, menuBarra: null };
}

// ——— Add ▸ ———

/** Add ▸ File...: the files at `storedPaths` into the row `key`; `refused` are the ones already in the project ("Unable to Add Items"). */
export function addFiles(state, key, storedPaths) {
  const into = placeOfKey(key);
  const { project, refused } = addFilesInto(state.project, into, storedPaths);
  return { state: project === state.project ? state : followEdit(state, project, { open: into }), refused };
}

/** Add ▸ Folder (Snapshot)...: a virtual folder `folderName` with the files at `storedPaths`, into the row `key`. */
export function addSnapshotFolder(state, key, folderName, storedPaths) {
  const into = placeOfKey(key);
  const { project, refused } = addSnapshotFolderInto(state.project, into, folderName, storedPaths);
  return { state: project === state.project ? state : followEdit(state, project, { open: into }), refused };
}

/** Add ▸ Folder (Auto-populating)...: the folder at `storedPath` as an auto-populating item (its files are stage c's), into the row `key`. */
export function addAutoPopulatingFolder(state, key, storedPath) {
  const into = placeOfKey(key);
  const project = addAutoPopulatingFolderInto(state.project, into, storedPath);
  return project === state.project ? state : followEdit(state, project, { open: into });
}

// ——— New ▸ Virtual Folder and the in-place edit ———

/**
 * New ▸ Virtual Folder: "New Folder" in the row `key`, selected and with its name in edit and selected (measured: s2 Q2).
 * The edit is `state.edit = { key, text }`.
 */
export function newVirtualFolder(state, key) {
  const into = placeOfKey(key);
  const project = addVirtualFolderInto(state.project, into);
  if (project === state.project) return state;
  const place = newItemPlace(state.project, project, into);
  return { ...followEdit(state, project, { select: place, open: into }), edit: { key: keyOfPlace(place), text: NEW_FOLDER_NAME } };
}

/** F2 and Rename... on a virtual folder: its name in edit. An OVI is renamed through "Save the OVI As" instead (`renameRequestOf`); a document has no Rename. */
export function startEdit(state) {
  const item = selectedItem(state);
  const isVirtualFolder = item?.kind === ITEM_KINDS.FOLDER && !item.autoPopulating;
  return isVirtualFolder ? { ...state, edit: { key: state.selected, text: item.name }, abierta: null, menuBarra: null } : state;
}

/** The text of the edit changed. */
export const typeEdit = (state, text) => (state.edit ? { ...state, edit: { ...state.edit, text } } : state);

/** Enter, or a click elsewhere: the folder takes the typed name and its place in the order; an empty name or the same one changes nothing. */
export function commitEdit(state) {
  const { edit } = state;
  if (!edit) return state;
  const place = placeOfKey(edit.key);
  const item = itemAt(state.project, place);
  const closed = { ...state, edit: null };
  if (!item || !edit.text.trim() || edit.text === item.name) return closed;
  const project = renameItem(state.project, place, edit.text);
  const renamed = newItemPlace(state.project, project, parentOf(place));
  return followEdit(closed, project, { select: renamed, alias: { from: place, to: renamed } });
}

/** Escape: the edit ends and the name stays as it was ("New Folder", for a folder just made). */
export const cancelEdit = (state) => (state.edit ? { ...state, edit: null } : state);

// ——— Remove From Project ———

/** The question of Remove From Project (measured: s2 Q6). Its checkbox is a hole: what it would remember is not built. */
export const REMOVE_ITEMS_DIALOG = Object.freeze({
  id: "remove-items",
  title: "Remove Items",
  text: "The selected item(s) will be permanently deleted from the project or project library.",
  checkbox: "Do not show this dialog again.",
});

/** Remove From Project on the selected row: the question opens (nothing for a row that cannot be removed). */
export const askRemove = (state) => (canRemove(state) ? { ...state, dialog: REMOVE_ITEMS_DIALOG, edit: null, abierta: null, menuBarra: null } : state);

/** Cancel, Escape: the question closes. */
export const cancelDialog = (state) => (state.dialog ? { ...state, dialog: null } : state);

/**
 * OK: the selected item goes, a folder with its items (the files stay on disk), and the selection moves to the next row
 * (measured: s4 "Remove From Project"): the one after the removed row and what is under it, or the one before when it was last.
 */
export function confirmRemove(state) {
  const closed = { ...state, dialog: null };
  const project = removeItem(state.project, placeOfKey(state.selected));
  if (project === state.project) return closed;
  const keys = visibleRows(state).map((row) => row.key);
  const index = keys.indexOf(state.selected);
  const nextKey = keys.slice(index + 1).find((key) => key !== state.selected && !key.startsWith(`${state.selected}/`)) ?? keys[index - 1];
  return followEdit(closed, project, { select: placeAfterEdit(state.project, project, placeOfKey(nextKey)) });
}

// ——— Drag ———

/**
 * The state after dragging the row `fromKey` onto the row `targetKey`, the same state when nothing happens: an item goes
 * into My Computer or a virtual folder; onto an auto-populating folder or a file nothing happens (measured: s4 "Drag").
 * A folder dropped onto another always nests in it: LabVIEW nested it or put it after the target depending on where in
 * the target's row it was dropped, which was not measured.
 */
export function dropOnto(state, fromKey, targetKey) {
  const from = placeOfKey(fromKey);
  const project = moveItem(state.project, from, placeOfKey(targetKey));
  if (project === state.project) return state;
  const place = placeOfObject(project.items, itemAt(state.project, from));
  return followEdit(state, project, { select: place, open: parentOf(place) });
}

/** Can the row `fromKey` be dropped on the row `targetKey`? The page allows the drop only then. */
export const canDrop = (state, fromKey, targetKey) => dropOnto(state, fromKey, targetKey) !== state;

// ——— New ▸ OVI (core/model/project-new-ovis.mjs) ———

/**
 * The new OVI `name`, open as `entryId`, as an item of the row `key` when it holds items, else of My Computer (the
 * explorer's File ▸ New OVI puts it at My Computer's top, measured: reports/2026-11-19-project-new-vi.md Q6). The new
 * item is selected and its folder opened, as LabVIEW shows it (Q1, Q2).
 */
export function addNewOvi(state, key, name, entryId) {
  const asked = key === ROOT_KEY ? [] : placeOfKey(key);
  const into = holdsItems(itemAt(state.project, asked)) ? asked : placeOfKey(targetKeyOf(state.project));
  const project = addInto(state.project, into, [newOviItem(name, entryId)]);
  return followEdit(state, project, { open: into, select: newItemPlace(state.project, project, into) });
}

/** The new OVI `entryId` was saved at `storedPath`: its item becomes that file. */
export const newOviSaved = (state, entryId, storedPath) => followEdit(state, withNewOviSaved(state.project, entryId, storedPath));

/** The new OVI `entryId` left memory unsaved: its item goes. */
export const newOviClosed = (state, entryId) => followEdit(state, withoutNewOvi(state.project, entryId));

// ——— Rename... of an OVI item (measured: reports/2026-11-18-project-explorer-s4.md "Rename") ———

/** The stored path Rename... asks the main process to rename for the row `key`: an OVI saved in a file, or null (a new OVI is not measured). */
export function renameRequestOf(state, key) {
  const item = itemOf(state, key);
  return item?.kind === ITEM_KINDS.OVI && item.unsavedOvi === undefined && item.path !== undefined ? item.path : null;
}

/** The OVI item at `key` was renamed on disk to `storedPath`: its name and path follow and it stays selected wherever its new name puts it. */
export function oviItemRenamed(state, key, storedPath) {
  const place = placeOfKey(key);
  const project = renameFileItem(state.project, place, storedPath);
  if (project === state.project) return state;
  const renamed = newItemPlace(state.project, project, parentOf(place));
  return followEdit(state, project, { select: renamed, alias: { from: place, to: renamed } });
}

// ——— Open (a double click on the row, or its menu's Open) ———

/**
 * What opening the row `key` asks of the main process: an OVI saved in a file opens from its stored path, and a new OVI
 * not saved yet brings its windows forward. Any other row opens nothing here (a document's Open is not built; a folder's
 * double click was not measured). LabVIEW opens a VI of the tree in the project, "main1.vi Front Panel on
 * P1.lvproj/My Computer" (measured: reports/2026-11-17-project-explorer-s2.md Q4).
 */
export function openRequestOf(state, key) {
  // A dependency and an OVI of an auto-populating folder are opened in the project too (unverified: LabVIEW's title for
  // them was not measured); a type definition has no window to open in yet.
  const row = nodeAt(state, key);
  if (row?.kind === ROW_KINDS.DEPENDENCY_OVI || (row?.kind === ROW_KINDS.AUTO_POPULATED_FILE && row.icon === ROW_ICONS.OVI)) return { storedPath: row.path };
  const item = itemOf(state, key);
  if (item?.kind !== ITEM_KINDS.OVI) return null;
  if (item.unsavedOvi !== undefined) return { unsavedOvi: item.unsavedOvi };
  return item.path === undefined ? null : { storedPath: item.path };
}


// ——— Auto-populating folders (stage c; measured: reports/2026-11-21-project-explorer-s5.md) ———

/** Stop Auto-populating on the selected folder: it becomes virtual folders holding what the disk holds now, with no question (s5 Q4). */
export function stopAutoPopulating(state) {
  const item = selectedItem(state);
  const project = stopFolder(state.project, placeOfKey(state.selected), state.disk.folders[item?.path]?.entries ?? []);
  return project === state.project ? state : followEdit(state, project);
}

/** Convert to Auto-populating Folder... on the selected virtual folder, with the folder chosen at `storedFolderPath` (s5 Q5). */
export function convertToAutoPopulating(state, storedFolderPath) {
  const place = placeOfKey(state.selected);
  const project = convertFolder(state.project, place, storedFolderPath);
  if (project === state.project) return state;
  // It takes the disk folder's name, so its place in the order may change.
  const index = itemsAt(project, parentOf(place)).findIndex((item) => item.autoPopulating && item.path === storedFolderPath);
  const converted = [...parentOf(place), index];
  return followEdit(state, project, { select: converted, alias: { from: place, to: converted } });
}

/**
 * What the disk said was read (`state.disk`): an auto-populating folder whose folder is gone becomes a plain virtual
 * folder, with no question (s5 Q3). The same state when none is gone.
 */
export function withGoneFoldersVirtual(state) {
  const gone = autoPopulatingPlaces(state.project).filter(({ item }) => state.disk.folders[item.path]?.exists === false);
  if (!gone.length) return state;
  const project = gone.reduce((changed, { place }) => withFolderGone(changed, place), state.project);
  return { ...followEdit(state, project), menuBarra: state.menuBarra };
}
