// The Files tab of the Project Explorer (DT-099 stage d): the project's files as they are on disk, measured in LabVIEW 2026
// Q3 (labview-captures/reports/2026-11-22-files-tab.md). The root is the drive ("C", without its colon); below it the
// folders down to every file the project shows, folders first and then files, each by name with case ignored: the items'
// files, the files of its auto-populating folders, every dependency and the project file itself. A virtual folder, My
// Computer, Dependencies and Build Specifications have no row, and a file of a folder that is not in the project is not
// shown (Q1). Pure: it is built from what the Items tree already holds.

import { ITEM_KINDS, itemKindOf } from "../../../core/model/project.mjs";
import { itemAt } from "../../../core/model/project-tree.mjs";
import { resolveRelative } from "../common/ovi-paths.mjs";
import { DISK_ROW_KINDS } from "./disk-rows.mjs";

/** What a row of the Files tab stands for, which decides its icon and its right-click menu (Q2). */
export const FILE_ROW_KINDS = Object.freeze({
  DRIVE: "files-drive",
  FOLDER: "files-folder",
  AUTO_POPULATING_FOLDER: "files-auto-populating-folder",
  OVI: "files-ovi",
  DOCUMENT: "files-document",
  PROJECT: "files-project",
  DEPENDENCY: "files-dependency-ovi",
});

const FOLDER_KINDS = new Set([FILE_ROW_KINDS.DRIVE, FILE_ROW_KINDS.FOLDER, FILE_ROW_KINDS.AUTO_POPULATING_FOLDER]);
export const isFolderRow = (kind) => FOLDER_KINDS.has(kind);

/** A row's key: the absolute path it stands for (`/` for a POSIX root), marked so that it never meets an Items key. */
const KEY_PREFIX = "files:";
export const fileKeyOf = (absolutePath) => `${KEY_PREFIX}${absolutePath}`;
export const isFileKey = (key) => typeof key === "string" && key.startsWith(KEY_PREFIX);

/** The kind of the file at `absolutePath` as an item or an auto-populating folder's file. */
const fileKindOf = (absolutePath) => (itemKindOf(absolutePath) === ITEM_KINDS.OVI ? FILE_ROW_KINDS.OVI : FILE_ROW_KINDS.DOCUMENT);

/**
 * Every file and auto-populating folder the tab shows, `{ path, kind, itemsKey }` with `path` absolute and `itemsKey` the
 * Items row it stands for (Show in Items View, Q3). `itemNodes` are the Items tree's nodes; `projectFile` the project's
 * absolute path, or null for a project never saved, whose stored paths are absolute.
 */
export function shownFiles(project, itemNodes, projectFile) {
  const absolute = (stored) => (projectFile ? resolveRelative(projectFile, stored) : stored);
  const files = projectFile ? [{ path: projectFile, kind: FILE_ROW_KINDS.PROJECT, itemsKey: itemNodes[0]?.key }] : [];
  for (const node of itemNodes) {
    const shown = shownFileOf(project, node);
    if (shown) files.push({ ...shown, path: shown.dependency ? shown.path : absolute(shown.path), itemsKey: node.key });
  }
  return files.map(({ dependency: _dependency, ...file }) => file);
}

/** The file a node of the Items tree shows in the Files tab, with its stored path (absolute for a dependency), or null. */
function shownFileOf(project, node) {
  if (node.kind === DISK_ROW_KINDS.DEPENDENCY_OVI || node.kind === DISK_ROW_KINDS.DEPENDENCY_TYPE_DEFINITION) return { path: node.path, kind: FILE_ROW_KINDS.DEPENDENCY, dependency: true };
  if (node.kind === DISK_ROW_KINDS.AUTO_POPULATED_FILE) return { path: node.path, kind: fileKindOf(node.path) };
  if (!node.key.startsWith("project/") || node.path !== undefined) return null;
  const item = itemAt(project, node.key.split("/").slice(1).map(Number));
  if (!item?.path) return null;
  if (item.kind === ITEM_KINDS.FOLDER) return item.autoPopulating ? { path: item.path, kind: FILE_ROW_KINDS.AUTO_POPULATING_FOLDER } : null;
  return { path: item.path, kind: fileKindOf(item.path) };
}

/** A path cut at its separators, its root first: "/" for a POSIX root, the drive without its colon for Windows (Q1: "C"). */
function segmentsOf(absolutePath) {
  const [root, ...rest] = absolutePath.split("/");
  const parts = rest.filter(Boolean);
  return root === "" ? { rootLabel: "/", rootPath: "/", parts } : { rootLabel: root.replace(/:$/, ""), rootPath: root, parts };
}

const joined = (parent, name) => (parent.endsWith("/") ? `${parent}${name}` : `${parent}/${name}`);

/** Folders first, then files, each by name with case ignored (Q1). */
function inFilesOrder(nodes) {
  const byName = (first, second) => first.label.localeCompare(second.label, "en", { sensitivity: "base" });
  const folders = nodes.filter((node) => isFolderRow(node.kind)).sort(byName);
  return [...folders, ...nodes.filter((node) => !isFolderRow(node.kind)).sort(byName)];
}

/** The tree's roots (one per drive) as nested nodes `{ key, kind, label, path, itemsKey?, children }`. */
export function filesTreeOf(files) {
  const nodes = new Map();
  const roots = [];
  const nodeAt = (path, label, kind, parent) => {
    if (!nodes.has(path)) {
      const node = { key: fileKeyOf(path), kind, label, path, children: [] };
      nodes.set(path, node);
      (parent ? parent.children : roots).push(node);
    }
    return nodes.get(path);
  };
  for (const file of files) {
    const { rootLabel, rootPath, parts } = segmentsOf(file.path);
    let parent = nodeAt(rootPath, rootLabel, FILE_ROW_KINDS.DRIVE, null);
    parts.forEach((name, index) => {
      const path = joined(parent.path, name);
      const last = index === parts.length - 1;
      parent = nodeAt(path, name, last ? file.kind : FILE_ROW_KINDS.FOLDER, parent);
      if (last) Object.assign(parent, { kind: file.kind, itemsKey: file.itemsKey });
    });
  }
  const ordered = (node) => ({ ...node, children: inFilesOrder(node.children).map(ordered) });
  return inFilesOrder(roots).map(ordered);
}

/** Every node of `roots`, parents before children. */
export const fileNodesOf = (roots) => roots.flatMap((root) => [root, ...fileNodesOf(root.children)]);

/**
 * The rows opened the first time the tab is shown: the chains from the drive down to the project's folder and to the
 * folders of the dependencies (Q1; how deep LabVIEW opens the other folders is not clear in the capture).
 */
export function firstExpanded(roots) {
  const opened = new Set();
  const openChainTo = (node, chain) => {
    const within = [...chain, node.key];
    if (node.kind === FILE_ROW_KINDS.PROJECT || node.kind === FILE_ROW_KINDS.DEPENDENCY) chain.forEach((key) => opened.add(key));
    node.children.forEach((child) => openChainTo(child, within));
  };
  roots.forEach((root) => openChainTo(root, []));
  return [...opened];
}
