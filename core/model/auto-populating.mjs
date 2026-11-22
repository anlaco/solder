// Auto-populating folders (DT-099 stage c): a folder item that mirrors a folder on disk, whose contents the `.sdproj`
// never stores. Measured in LabVIEW 2026 Q3 (labview-captures/reports/2026-11-21-project-explorer-s5.md): what the tree
// shows of the disk, Stop Auto-populating, Convert to Auto-populating Folder... and a folder deleted on disk. Pure: the
// disk is read by the main process, which gives a listing of `{ name, path }` entries, `folder: true` and `entries` for a
// folder, every `path` stored as the project stores its items (relative to the `.sdproj`).

import { ITEM_KINDS, fileItem, fileNameOf, inFileOrder, myComputer } from "./project.mjs";
import { itemAt, replaceItem } from "./project-tree.mjs";

const byName = (first, second) => first.name.localeCompare(second.name, "en", { sensitivity: "base" });

/**
 * Is a file or folder of the disk shown? A hidden one is not (measured: `.hidden.txt`, both dot-named and with the Hidden
 * attribute, was not shown; which of the two hides it was not told apart, so the dot, the only one a Linux disk has).
 */
export const isShownOnDisk = (name) => !name.startsWith(".");

/**
 * A folder's entries as the tree shows them: folders first by name, then the files in one list by name, case-insensitive,
 * whatever their type (measured: s5 Q1). LabVIEW appends a folder created while the project is open after the others
 * (s5 Q2); Solder keeps the order a reopened project would have, which LabVIEW was not seen to give either way.
 */
export function inDiskOrder(entries) {
  const shown = entries.filter((entry) => isShownOnDisk(entry.name));
  return [...shown.filter((entry) => entry.folder).sort(byName), ...shown.filter((entry) => !entry.folder).sort(byName)];
}

/** The items a listing becomes: each folder a virtual folder with its own, each file an item of its file. */
const itemsOfListing = (entries) => entries.map((entry) => (entry.folder ? { name: entry.name, kind: ITEM_KINDS.FOLDER, items: inFileOrder(itemsOfListing(entry.entries ?? [])) } : fileItem(entry.path)));

/**
 * Stop Auto-populating: the folder at `place` and every folder in it become virtual folders, its files stay as items, an
 * empty folder and the nesting are kept, and no question is asked (measured: s5 Q4). `entries`: what the disk holds now.
 */
export function stopAutoPopulating(project, place, entries) {
  const folder = itemAt(project, place);
  if (!folder?.autoPopulating) return project;
  return replaceItem(project, place, { name: folder.name, kind: ITEM_KINDS.FOLDER, items: inFileOrder(itemsOfListing(entries)) });
}

/** The folder at `place` once its folder is gone from the disk: a plain virtual folder, empty, with no path (measured: s5 Q3). */
export function withFolderGone(project, place) {
  const folder = itemAt(project, place);
  if (!folder?.autoPopulating) return project;
  return replaceItem(project, place, { name: folder.name, kind: ITEM_KINDS.FOLDER, items: [] });
}

const slashed = (path) => path.replaceAll("\\", "/").replace(/\/+$/, "");

/** Is the stored path `path` inside the stored folder `folderPath`? */
const isInsideFolder = (path, folderPath) => slashed(path).startsWith(`${slashed(folderPath)}/`);

/** Every file item at any depth of `items`. */
const filesIn = (items) => items.flatMap((item) => (item.kind === ITEM_KINDS.FOLDER ? filesIn(item.items ?? []) : [item]));

/**
 * Convert to Auto-populating Folder... with the folder at `storedFolderPath` chosen: the virtual folder at `place` takes the
 * disk folder's name and mirrors it; its files inside that folder are now shown from the disk, and the others are not
 * deleted but moved to My Computer (measured: s5 Q5). A virtual folder inside it was not measured: its files are treated
 * as the folder's own and the folder itself goes.
 */
export function convertToAutoPopulating(project, place, storedFolderPath) {
  const folder = itemAt(project, place);
  if (folder?.kind !== ITEM_KINDS.FOLDER || folder.autoPopulating) return project;
  const outside = filesIn(folder.items ?? []).filter((item) => item.path === undefined || !isInsideFolder(item.path, storedFolderPath));
  const converted = replaceItem(project, place, { name: fileNameOf(slashed(storedFolderPath)), kind: ITEM_KINDS.FOLDER, path: storedFolderPath, autoPopulating: true, items: [] });
  const target = myComputer(converted);
  return { ...converted, items: converted.items.map((item) => (item === target ? { ...item, items: inFileOrder([...item.items, ...outside]) } : item)) };
}

/** The places of the auto-populating folders at any depth, with the item, parents before children. */
export function autoPopulatingPlaces(project) {
  const found = [];
  const walk = (items, place) =>
    items.forEach((item, index) => {
      if (item.autoPopulating) found.push({ place: [...place, index], item });
      else if (item.items) walk(item.items, [...place, index]);
    });
  walk(project.items, []);
  return found;
}

/** Every file of a listing at any depth, as entries. */
export const filesOfListing = (entries) => entries.flatMap((entry) => (entry.folder ? filesOfListing(entry.entries ?? []) : [entry]));
