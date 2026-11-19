// Editing a project's tree (DT-099 stage b): an item is found by its place, every edit keeps LabVIEW's order (folders
// first, then by name, measured: reports/2026-11-17-project-explorer-s2.md Q2), and the target, Dependencies and Build
// Specifications cannot be removed, renamed or moved.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as Project from "../../core/model/project.mjs";
import * as Tree from "../../core/model/project-tree.mjs";

/** My Computer holding the folders "Sub" (with main1.ovi) and "Tools", and the files notes.txt and q1.ovi. */
function sample() {
  let project = Project.addFiles(Project.blankProject(), ["notes.txt", "q1.ovi"]).project;
  project = Project.addVirtualFolder(Project.addVirtualFolder(project, "Tools"), "Sub");
  return Tree.addInto(project, [0, 0], [{ name: "main1.ovi", kind: "ovi", path: "main1.ovi" }]);
}
const names = (items) => items.map((item) => item.name);
const target = (project) => Project.myComputer(project).items;

test("the sample tree is in LabVIEW's order", () => {
  assert.deepEqual(names(target(sample())), ["Sub", "Tools", "notes.txt", "q1.ovi", "Dependencies", "Build Specifications"]);
  assert.equal(Tree.itemAt(sample(), [0, 0, 0]).name, "main1.ovi");
});

test("removing a folder removes what it holds; the fixed items cannot be removed", () => {
  const removed = Tree.removeItem(sample(), [0, 0]);
  assert.deepEqual(names(target(removed)), ["Tools", "notes.txt", "q1.ovi", "Dependencies", "Build Specifications"]);
  assert.equal(Project.itemsWithPaths(removed).some((item) => item.path === "main1.ovi"), false);
  assert.deepEqual(names(target(Tree.removeItem(sample(), [0, 4]))), names(target(sample())), "Dependencies stays");
  assert.deepEqual(Tree.removeItem(sample(), [0]).items.length, 1, "My Computer stays");
});

test("several items are removed at once, whatever order their places come in", () => {
  const removed = Tree.removeItems(sample(), [[0, 2], [0, 0, 0], [0, 3]]);
  assert.deepEqual(names(target(removed)), ["Sub", "Tools", "Dependencies", "Build Specifications"]);
  assert.deepEqual(Tree.itemAt(removed, [0, 0]).items, []);
});

test("a renamed item takes its place in the order", () => {
  const renamed = Tree.renameItem(sample(), [0, 1], "Alpha");
  assert.deepEqual(names(target(renamed)), ["Alpha", "Sub", "notes.txt", "q1.ovi", "Dependencies", "Build Specifications"]);
  assert.deepEqual(names(target(Tree.renameItem(sample(), [0, 4], "Deps"))), names(target(sample())), "a fixed item keeps its name");
});

test("an item moves into a virtual folder and back out to My Computer", () => {
  const intoTools = Tree.moveItem(sample(), [0, 3], [0, 1]);
  assert.deepEqual(names(Tree.itemAt(intoTools, [0, 1]).items), ["q1.ovi"]);
  assert.deepEqual(names(target(intoTools)), ["Sub", "Tools", "notes.txt", "Dependencies", "Build Specifications"]);
  const outOfSub = Tree.moveItem(sample(), [0, 0, 0], [0]);
  assert.deepEqual(names(target(outOfSub)), ["Sub", "Tools", "main1.ovi", "notes.txt", "q1.ovi", "Dependencies", "Build Specifications"]);
});

test("a folder moves into a folder that comes after it in the list", () => {
  const moved = Tree.moveItem(sample(), [0, 0], [0, 1]);
  assert.deepEqual(names(target(moved)), ["Tools", "notes.txt", "q1.ovi", "Dependencies", "Build Specifications"]);
  assert.deepEqual(names(Tree.itemAt(moved, [0, 0]).items), ["Sub"]);
  assert.deepEqual(names(Tree.itemAt(moved, [0, 0, 0]).items), ["main1.ovi"], "with what it held");
});

test("a move is refused into a file, an auto-populating folder, the item itself or something inside it", () => {
  const withAuto = Project.addAutoPopulatingFolder(sample(), "auto");
  assert.equal(Tree.moveItem(withAuto, [0, 4], [0, 0]), withAuto, "into an auto-populating folder");
  const project = sample();
  assert.equal(Tree.moveItem(project, [0, 2], [0, 3]), project, "into a file");
  assert.equal(Tree.moveItem(project, [0, 0], [0, 0]), project, "into itself");
  assert.equal(Tree.moveItem(project, [0, 0], [0, 0, 0]), project, "into something inside it");
  assert.equal(Tree.moveItem(project, [0, 4], [0, 0]), project, "Dependencies does not move");
});

test("files and folders are added into a virtual folder; a file already in the project is refused", () => {
  const { project, refused } = Tree.addFilesInto(sample(), [0, 1], ["b.ovi", "a.txt", "q1.ovi", "a.txt"]);
  assert.deepEqual(refused, ["q1.ovi"]);
  assert.deepEqual(names(Tree.itemAt(project, [0, 1]).items), ["a.txt", "b.ovi"], "in order, each once");
  const withFolder = Tree.addVirtualFolderInto(sample(), [0, 0]);
  assert.deepEqual(names(Tree.itemAt(withFolder, [0, 0]).items), ["New Folder", "main1.ovi"], "folders first");
});

test("a snapshot folder holds the files of a folder, a refused one is listed, and an auto-populating folder mirrors a path", () => {
  const { project, refused } = Tree.addSnapshotFolderInto(sample(), [0, 1], "Shots", ["Shots/b.ovi", "q1.ovi", "Shots/a.txt"]);
  assert.deepEqual(refused, ["q1.ovi"]);
  const folder = Tree.itemAt(project, [0, 1, 0]);
  assert.deepEqual([folder.name, folder.kind, names(folder.items)], ["Shots", "folder", ["a.txt", "b.ovi"]]);
  const mirrored = Tree.addAutoPopulatingFolderInto(sample(), [0, 0], "data/auto");
  assert.deepEqual(Tree.itemAt(mirrored, [0, 0, 0]), { name: "auto", kind: "folder", path: "data/auto", autoPopulating: true, items: [] });
  assert.equal(Tree.addAutoPopulatingFolderInto(sample(), [0, 2], "auto").items.length, sample().items.length, "not into a file");
  assert.equal(Tree.itemAt(Tree.addAutoPopulatingFolderInto(sample(), [0, 2], "auto"), [0, 2]).items, undefined);
});
