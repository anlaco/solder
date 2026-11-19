// The Project Explorer window (DT-099 §6): what it holds and how a click changes it. Measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-17-project-explorer-s1.md and -s2.md). Pure: the page only turns DOM events into
// these calls, so the tree, the menus and the selection are tested without a browser.
//
// The state keeps the project (core/model/project.mjs), the key of the selected row, the keys of the expanded rows and
// the open menu. A row's key is its place in the tree (`project/0/2`), so it never depends on a name: two items may
// share one.

import { ITEM_KINDS } from "../../../core/model/project.mjs";
import { inicial as windowState } from "../window/window-state.mjs";

export const PREFIX = "window.project-explorer";
const CONTEXT_PREFIX = "context.project-explorer";

/** The two tabs of the window; only Items is built (Files shows the disk tree, stage a2 of DT-099). */
export const TABS = Object.freeze({ ITEMS: "items", FILES: "files" });

/** The key of the row that stands for the project itself, the root of the tree. */
export const ROOT_KEY = "project";

/** What a row stands for, which decides its icon and its right-click menu. */
export const ROW_KINDS = Object.freeze({ PROJECT: "project", ...ITEM_KINDS, AUTO_POPULATING_FOLDER: "auto-populating-folder" });

/** The window's own commands, by the last segment of the menu row's id; the main process runs them. */
export const MENU_COMMANDS = Object.freeze({
  "new-vi": "newOvi",
  new: "newDialog",
  open: "open",
  close: "close",
  "create-project": "createProject",
  "open-project": "openProject",
  "save-project": "saveProject",
  "close-project": "close",
  exit: "exit",
  // Edit ▸ Remove From Project (and the same row of the item menus, by their last segment).
  "remove-from-project": "removeFromProject",
});

/** The toolbar's built buttons, by the last segment of their id (s1 Q1: Open Project and Save Project; s4: Remove From Project). */
export const TOOLBAR_COMMANDS = Object.freeze({ "open-project": "openProject", "save-project": "saveProject", "remove-from-project": "removeFromProject" });

/** The built rows of the right-click menus, per menu: what each runs. The tree edits are the page's (project-explorer-edit.mjs). */
const TREE_ROWS = { "new.virtual-folder": "newVirtualFolder", "add.file": "addFile", "add.folder-snapshot": "addSnapshotFolder", "add.folder-auto-populating": "addAutoPopulatingFolder" };
const CONTEXT_ROWS_BY_MENU = {
  project: { save: "saveProject" },
  "my-computer": TREE_ROWS,
  "virtual-folder": { ...TREE_ROWS, "remove-from-project": "removeFromProject", rename: "rename" },
  "auto-populating-folder": { "remove-from-project": "removeFromProject" },
  "ovi-item": { "remove-from-project": "removeFromProject" },
  "document-item": { "remove-from-project": "removeFromProject" },
};

/** The built rows of a right-click menu that run a command of the window, by id; Expand All and Collapse All are the state's own. */
export const CONTEXT_COMMANDS = Object.freeze(
  Object.fromEntries(Object.entries(CONTEXT_ROWS_BY_MENU).flatMap(([menu, rows]) => Object.entries(rows).map(([row, command]) => [`${CONTEXT_PREFIX}.${menu}.${row}`, command]))),
);

/** Rename's row for a kind of row that has one that is not built: F2 on it shows why (the other kinds do nothing, measured for a document). */
export const RENAME_HOLE_OF_KIND = Object.freeze({ project: `${CONTEXT_PREFIX}.project.rename`, ovi: `${CONTEXT_PREFIX}.ovi-item.rename` });

/** The project was saved under another name: the root of the tree says so. */
export const rename = (state, name) => ({ ...state, name });

/** The right-click menus of the tree, by the kind of row (s2 report Q1; the folders' are s4's). An OVI inside a folder has the menu of one at the root (s4). */
const CONTEXT_MENU_OF_KIND = Object.freeze({
  [ROW_KINDS.PROJECT]: "project",
  [ROW_KINDS.TARGET]: "my-computer",
  [ROW_KINDS.FOLDER]: "virtual-folder",
  [ROW_KINDS.AUTO_POPULATING_FOLDER]: "auto-populating-folder",
  [ROW_KINDS.OVI]: "ovi-item",
  [ROW_KINDS.DOCUMENT]: "document-item",
  [ROW_KINDS.DEPENDENCIES]: "dependencies",
  [ROW_KINDS.BUILD]: "build-specifications",
});

/** The inventory id of the menu a row opens with the right button, or undefined when none was measured. */
export const contextMenuOf = (kind) => (kind in CONTEXT_MENU_OF_KIND ? `${CONTEXT_PREFIX}.${CONTEXT_MENU_OF_KIND[kind]}` : undefined);

const rowKindOf = (item) => (item.kind === ITEM_KINDS.FOLDER && item.autoPopulating ? ROW_KINDS.AUTO_POPULATING_FOLDER : item.kind);

/**
 * The tree as nested nodes `{ key, kind, label, children }`. An auto-populating folder has no children here: its files
 * are read from the disk, which the window does not do yet. Dependencies is written empty and computed when a project
 * is open (DT-099 §4); filling it is the next step, so it has no children yet either.
 */
export function treeOf(project, name) {
  const nodeOf = (item, key) => ({ key, kind: rowKindOf(item), label: item.name, children: (item.items ?? []).map((inner, index) => nodeOf(inner, `${key}/${index}`)) });
  return { key: ROOT_KEY, kind: ROW_KINDS.PROJECT, label: `Project: ${name}`, children: project.items.map((item, index) => nodeOf(item, `${ROOT_KEY}/${index}`)) };
}

/** Every node of the tree below `node`, `node` included, parents before children. */
function nodesFrom(node) {
  return [node, ...node.children.flatMap(nodesFrom)];
}

const hasChildren = (node) => node.children.length > 0;

/** The node with `key`, or undefined. */
const findNode = (state, key) => nodesFrom(treeOf(state.project, state.name)).find((node) => node.key === key);

/** A row's place in the project, the list of indices from the top items down: `project/0/2` is `[0, 2]`, and the root `project` is `[]`. */
export const placeOfKey = (key) => key.split("/").slice(1).map(Number);

/** The row key of a place. */
export const keyOfPlace = (place) => [ROOT_KEY, ...place].join("/");

/** The rows the user can drag, remove and (for a virtual folder) rename: everything but the project, the target and the two fixed items. */
export const EDITABLE_KINDS = Object.freeze([ROW_KINDS.OVI, ROW_KINDS.DOCUMENT, ROW_KINDS.FOLDER, ROW_KINDS.AUTO_POPULATING_FOLDER]);

/** The key of the target My Computer, which a new project opens with selected (measured). */
export const targetKeyOf = (project) => `${ROOT_KEY}/${project.items.findIndex((item) => item.kind === ITEM_KINDS.TARGET)}`;

/**
 * The window for a project called `name`. A new project opens with every row expanded (measured); one opened from its file
 * opens the same but with Dependencies collapsed, since LabVIEW does not keep what was expanded (s1 report, Q5).
 */
export function fromProject(project, name, { opened = false } = {}) {
  const nodes = nodesFrom(treeOf(project, name));
  const expanded = nodes.filter((node) => hasChildren(node) && !(opened && node.kind === ROW_KINDS.DEPENDENCIES)).map((node) => node.key);
  return { project, name, tab: TABS.ITEMS, selected: targetKeyOf(project), expanded, windowRows: [], edit: null, dialog: null, ...windowState() };
}

/** One row of the tree as drawn: `{ key, kind, label, depth, expandable, expanded }`. */
export function visibleRows(state) {
  const rows = [];
  const walk = (node, depth) => {
    const expanded = state.expanded.includes(node.key);
    rows.push({ key: node.key, kind: node.kind, label: node.label, depth, expandable: hasChildren(node), expanded });
    if (expanded) node.children.forEach((child) => walk(child, depth + 1));
  };
  walk(treeOf(state.project, state.name), 0);
  return rows;
}

/** The kind of the selected row. */
export const selectedKind = (state) => findNode(state, state.selected)?.kind;

/** Selecting a row closes whatever was open over the tree. */
export const select = (state, key) => (findNode(state, key) ? { ...state, selected: key, abierta: null, menuBarra: null } : state);

/** The + or − of a row: expands a collapsed row and collapses an expanded one; a row with no children has none. */
export function toggleExpanded(state, key) {
  const node = findNode(state, key);
  if (!node || !hasChildren(node)) return state;
  const expanded = state.expanded.includes(key) ? state.expanded.filter((other) => other !== key) : [...state.expanded, key];
  return { ...state, expanded };
}

/** Expand All of a row's menu: the row and everything under it (what it does to rows under a collapsed one was not measured). */
export function expandAll(state, key) {
  const node = findNode(state, key);
  if (!node) return state;
  const expandable = nodesFrom(node).filter(hasChildren).map((inner) => inner.key);
  return { ...state, expanded: [...new Set([...state.expanded, ...expandable])] };
}

/** Collapse All: the row and everything under it. */
export function collapseAll(state, key) {
  const node = findNode(state, key);
  if (!node) return state;
  const collapsed = new Set(nodesFrom(node).map((inner) => inner.key));
  return { ...state, expanded: state.expanded.filter((other) => !collapsed.has(other)) };
}

/** The tab that is shown. */
export const setTab = (state, tab) => (Object.values(TABS).includes(tab) ? { ...state, tab } : state);

/**
 * The right button on a row: it selects the row, as LabVIEW does, and opens the menu of its kind at `where`. A kind with
 * no measured menu only selects.
 */
export function openContextMenu(state, inventory, key, where) {
  const selected = select(state, key);
  const menuId = contextMenuOf(selectedKind(selected));
  if (!menuId || !inventory.tieneContenido(menuId)) return selected;
  return { ...selected, menuBarra: { id: menuId, x: where.x, y: where.y, abierto: null } };
}

/**
 * The mouse over a row of the open menu: a row with a submenu opens it, a row inside a submenu keeps it open, any other
 * row of the menu closes it.
 */
export function hoverMenuRow(state, inventory, rowId) {
  const menu = state.menuBarra;
  if (!menu) return state;
  const parentId = rowId.slice(0, rowId.lastIndexOf("."));
  const open = inventory.tieneContenido(rowId) ? rowId : parentId !== menu.id ? parentId : null;
  return open === menu.abierto ? state : { ...state, menuBarra: { ...menu, abierto: open } };
}

/** A click on a row that has a submenu opens it, as the hover does (the keyboard and a touch have no hover). */
export const openSubmenu = (state, rowId) => (state.menuBarra ? { ...state, menuBarra: { ...state.menuBarra, abierto: rowId } } : state);

/** The row of a right-click menu that was clicked, by its id: Expand All or Collapse All, the two that are built. */
export function runContextCommand(state, rowId) {
  const command = rowId.slice(rowId.lastIndexOf(".") + 1);
  const closed = { ...state, menuBarra: null };
  if (command === "expand-all") return expandAll(closed, state.selected);
  if (command === "collapse-all") return collapseAll(closed, state.selected);
  return closed;
}

/** The buttons of the toolbar that are greyed because of what is selected or because there is nothing to act on (measured on My Computer). */
export function disabledButtons(state) {
  const fixed = [ROW_KINDS.PROJECT, ROW_KINDS.TARGET, ROW_KINDS.DEPENDENCIES, ROW_KINDS.BUILD].includes(selectedKind(state));
  // Paste: nothing was copied. Resolve Conflicts: a new project has none (pale in the capture).
  const names = ["paste", "resolve-conflicts", ...(fixed ? ["cut", "copy", "remove-from-project"] : [])];
  return new Set(names);
}
