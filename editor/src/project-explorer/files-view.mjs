// What the Files tab holds and how a click changes it (DT-099 stage d; measured in LabVIEW 2026 Q3:
// labview-captures/reports/2026-11-22-files-tab.md). The tab keeps its own selection and opened rows in `state.files`,
// apart from the Items tab's; Window ▸ Show Other Project View (Ctrl+E) and Show in Items View / Show in Files View switch
// tabs carrying the selection over (Q3). Pure, as project-explorer-state.mjs.

import { TABS, itemNodesOf, select } from "./project-explorer-state.mjs";
import { FILE_ROW_KINDS, fileNodesOf, filesTreeOf, firstExpanded, isFolderRow, shownFiles } from "./files-tree.mjs";

export { FILE_ROW_KINDS, isFolderRow };

const CONTEXT_PREFIX = "context.project-explorer";

/** The tab's roots as nested nodes, from the Items tree and the project's own path the main process read (`disk.projectFile`). */
export const filesRootsOf = (state) => filesTreeOf(shownFiles(state.project, itemNodesOf(state), state.disk.projectFile ?? null));

/** The node of the Files row `key`, or undefined. */
export const fileNodeAt = (state, key) => fileNodesOf(filesRootsOf(state)).find((node) => node.key === key);

/**
 * The Files tab shown. The first time, the drive is selected and the chains down to the project's folder and the
 * dependencies' folders are open (Q1); afterwards it is as it was left.
 */
export function showFilesTab(state) {
  if (state.files) return { ...state, tab: TABS.FILES };
  const roots = filesRootsOf(state);
  return { ...state, tab: TABS.FILES, files: { selected: roots[0]?.key ?? null, expanded: firstExpanded(roots) } };
}

/** The opened rows with every folder above `key` added, so that its row is seen. */
function withChainOpen(state, key) {
  const node = fileNodeAt(state, key);
  if (!node) return state.files.expanded;
  const ancestors = fileNodesOf(filesRootsOf(state)).filter((candidate) => isFolderRow(candidate.kind) && node.path.startsWith(candidate.path === "/" ? "/" : `${candidate.path}/`));
  return [...new Set([...state.files.expanded, ...ancestors.map((ancestor) => ancestor.key)])];
}

/**
 * Ctrl+E from Items, and Show in Files View: the Files tab with the selected item's file selected; a row that is no file
 * (Dependencies, My Computer) leaves the Files selection as it was (Q3).
 */
export function showInFilesView(state) {
  const shown = showFilesTab(state);
  const target = fileNodesOf(filesRootsOf(shown)).find((node) => node.itemsKey === state.selected);
  if (!target) return shown;
  return { ...shown, files: { selected: target.key, expanded: withChainOpen(shown, target.key) } };
}

/** The keys of the Items rows above `key` (`project/0/4/vi.lib/dep:…` has `project`, `project/0`, `project/0/4`, …). */
const itemsAncestorsOf = (key) => key.split("/").slice(0, -1).map((_segment, index, segments) => segments.slice(0, index + 1).join("/"));

/** Ctrl+E from Files, and Show in Items View: the Items tab with the file's item selected and its folders open (Q3). */
export function showInItemsView(state) {
  const itemsKey = fileNodeAt(state, state.files?.selected)?.itemsKey;
  const items = { ...state, tab: TABS.ITEMS };
  if (!itemsKey) return items;
  return { ...select(items, itemsKey), expanded: [...new Set([...state.expanded, ...itemsAncestorsOf(itemsKey)])] };
}

/** Window ▸ Show Other Project View (Ctrl+E): the other tab, with the selection carried over. */
export const showOtherView = (state) => (state.tab === TABS.FILES ? showInItemsView(state) : showInFilesView(state));

/** A click on a Files row selects it; closes what was open over the tree. */
export const selectFile = (state, key) => (fileNodeAt(state, key) ? { ...state, files: { ...state.files, selected: key }, abierta: null, menuBarra: null } : state);

/** The + or − of a folder row. */
export function toggleFileRow(state, key) {
  const node = fileNodeAt(state, key);
  if (!node?.children.length) return state;
  const { expanded } = state.files;
  return { ...state, files: { ...state.files, expanded: expanded.includes(key) ? expanded.filter((other) => other !== key) : [...expanded, key] } };
}

/** Expand All and Collapse All of a folder's menu: the selected row and everything under it. */
function setOpenUnder(state, open) {
  const node = fileNodeAt(state, state.files?.selected);
  if (!node) return state;
  const under = new Set(fileNodesOf([node]).filter((inner) => inner.children.length).map((inner) => inner.key));
  const kept = state.files.expanded.filter((key) => !under.has(key));
  return { ...state, menuBarra: null, files: { ...state.files, expanded: open ? [...kept, ...under] : kept } };
}
export const expandAllFiles = (state) => setOpenUnder(state, true);
export const collapseAllFiles = (state) => setOpenUnder(state, false);

/** One drawn row of the tab: `{ key, kind, label, depth, expandable, expanded }`. */
export function visibleFileRows(state) {
  const rows = [];
  const walk = (node, depth) => {
    const expanded = state.files.expanded.includes(node.key);
    rows.push({ key: node.key, kind: node.kind, label: node.label, depth, expandable: node.children.length > 0, expanded });
    if (expanded) node.children.forEach((child) => walk(child, depth + 1));
  };
  filesRootsOf(state).forEach((root) => walk(root, 0));
  return rows;
}

/** The inventory id of the right-click menu of a Files row kind (Q2). */
export const fileContextMenuOf = (kind) => `${CONTEXT_PREFIX}.${kind}`;

/** The right button on a Files row selects it and opens the menu of its kind at `where`. */
export function openFileContextMenu(state, inventory, key, where) {
  const selected = selectFile(state, key);
  const menuId = fileContextMenuOf(fileNodeAt(selected, key)?.kind);
  if (!inventory.tieneContenido(menuId)) return selected;
  return { ...selected, menuBarra: { id: menuId, x: where.x, y: where.y, abierto: null } };
}

/**
 * What Open (or a double click) on the Files row `key` asks the main process: an OVI or a dependency opens in the project
 * (Q4: "first.vi Front Panel on NewVI14.lvproj/My Computer"); its path is absolute, which the main process resolves as is.
 */
export function fileOpenRequest(state, key) {
  const node = fileNodeAt(state, key);
  return node && (node.kind === FILE_ROW_KINDS.OVI || node.kind === FILE_ROW_KINDS.DEPENDENCY) ? { storedPath: node.path } : null;
}

/** The Items row a Files row stands for (Rename... of an OVI file is the item's), or undefined. */
export const itemsKeyOfFile = (state, key) => fileNodeAt(state, key)?.itemsKey;
