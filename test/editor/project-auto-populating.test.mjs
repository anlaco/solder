// Auto-populating folders (DT-099 stage c): a folder item that mirrors a folder on disk, read while the project is open
// and never stored with its contents. Measured in LabVIEW 2026 Q3 (labview-captures/reports/2026-11-21-project-explorer-s5.md).

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import * as Auto from "../../core/model/auto-populating.mjs";
import * as Project from "../../core/model/project.mjs";
import * as Tree from "../../core/model/project-tree.mjs";
import { readProjectDisk } from "../../editor/electron/project-disk-requests.mjs";
import { connectFolderDialog } from "../../editor/electron/project-dialogs.mjs";
import * as Edit from "../../editor/src/project-explorer/project-explorer-edit.mjs";
import * as State from "../../editor/src/project-explorer/project-explorer-state.mjs";
import { INV, RAIZ } from "../helpers.mjs";

const source = (file) => readFileSync(path.join(RAIZ, file), "utf8");

/** auto2 as s5 Q1 had it: empty\, sub\d.vi, a.vi, B.txt, c.octl, as the main process lists it. */
const AUTO2 = [
  { name: "empty", path: "auto2/empty", folder: true, entries: [] },
  { name: "sub", path: "auto2/sub", folder: true, entries: [{ name: "d.ovi", path: "auto2/sub/d.ovi" }] },
  { name: "a.ovi", path: "auto2/a.ovi" },
  { name: "B.txt", path: "auto2/B.txt" },
  { name: "c.octl", path: "auto2/c.octl" },
];

/** A window on a project with My Computer ▸ auto2 (auto-populating) and main.ovi, with the disk read. */
function windowWithAuto2(entries = AUTO2, exists = true) {
  const project = Project.addFiles(Project.addAutoPopulatingFolder(Project.blankProject(), "auto2"), ["main.ovi"]).project;
  const disk = { dependencies: { library: [], others: [], missing: [] }, folders: { auto2: { exists, entries } } };
  return State.withDisk(State.fromProject(project, "P1.sdproj", { opened: true }), disk);
}

const AUTO2_KEY = "project/0/0";
const rowsOf = (state) => State.visibleRows(state).map((row) => `${"  ".repeat(row.depth)}${row.label}${row.expandable ? (row.expanded ? " −" : " +") : ""}`);
const keyOf = (state, label) => State.visibleRows(state).find((row) => row.label === label).key;

test("an auto-populating folder shows the disk: folders first, then files, hidden ones not", () => {
  // The order of s5 Q1: folders by name, then the files in one list, case-insensitive, whatever their type.
  const listed = Auto.inDiskOrder([{ name: "c.octl" }, { name: "sub", folder: true }, { name: ".hidden.txt" }, { name: "B.txt" }, { name: "empty", folder: true }, { name: "a.ovi" }]);
  assert.deepEqual(listed.map((entry) => entry.name), ["empty", "sub", "a.ovi", "B.txt", "c.octl"]);
  const state = State.expandAll(windowWithAuto2(), AUTO2_KEY);
  assert.deepEqual(rowsOf(state).slice(2, 9), ["    auto2 −", "      empty", "      sub −", "        d.ovi", "      a.ovi", "      B.txt", "      c.octl"]);
  const rows = Object.fromEntries(State.visibleRows(state).map((row) => [row.label, row]));
  assert.equal(rows.sub.kind, "auto-populating-subfolder", "the same icon as its parent, a menu of its own");
  assert.equal(rows.sub.icon, "auto-populating-subfolder");
  assert.deepEqual(["a.ovi", "B.txt", "c.octl"].map((label) => [rows[label].kind, rows[label].icon]), [["auto-populated-file", "ovi"], ["auto-populated-file", "document"], ["auto-populated-file", "type-definition"]]);
  // Nothing of it is written (s5 Q1: the Folder item with its URL and no children).
  assert.doesNotMatch(Edit.projectText(state.project), /a\.ovi|B\.txt/);
  // A row of the disk cannot be removed or dragged.
  assert.equal(Edit.canRemove(State.select(state, keyOf(state, "a.ovi"))), false);
  assert.ok(!State.EDITABLE_KINDS.includes("auto-populated-file"));
});

test("Stop Auto-populating turns the folder and its folders into virtual folders with the files as items", () => {
  const state = State.select(windowWithAuto2(), AUTO2_KEY);
  assert.equal(State.CONTEXT_COMMANDS["context.project-explorer.auto-populating-folder.stop-auto-populating"], "stopAutoPopulating");
  const stopped = Edit.stopAutoPopulating(state);
  const folder = Tree.itemAt(stopped.project, [0, 0]);
  assert.deepEqual(folder, {
    name: "auto2",
    kind: "folder",
    items: [
      { name: "empty", kind: "folder", items: [] },
      { name: "sub", kind: "folder", items: [{ name: "d.ovi", kind: "ovi", path: "auto2/sub/d.ovi" }] },
      { name: "a.ovi", kind: "ovi", path: "auto2/a.ovi" },
      { name: "B.txt", kind: "document", path: "auto2/B.txt" },
      { name: "c.octl", kind: "ovi", path: "auto2/c.octl" },
    ],
  }, "the nesting and the empty folder kept (s5 Q4)");
  assert.equal(State.selectedKind(stopped), "folder", "the menu is now the virtual folder's");
  assert.equal(stopped.selected, AUTO2_KEY);
  // On a virtual folder it does nothing.
  assert.equal(Edit.stopAutoPopulating(stopped), stopped);
});

test("Convert to Auto-populating Folder takes the disk folder's name and moves the files outside it to My Computer", () => {
  // s5 Q5: a virtual folder auto2 holding auto4/p.ovi (inside the folder chosen) and extra.txt (outside it).
  let project = Project.addFiles(Project.blankProject(), ["auto4/p.ovi", "extra.txt"], "auto2").project;
  project = Project.addFiles(project, ["q1.ovi"]).project;
  const state = State.select(State.fromProject(project, "P1.sdproj"), "project/0/0");
  assert.equal(State.CONTEXT_COMMANDS["context.project-explorer.virtual-folder.convert-to-auto-populating-folder"], "convertToAutoPopulating");
  const converted = Edit.convertToAutoPopulating(state, "auto4");
  const target = Project.myComputer(converted.project);
  assert.deepEqual(target.items.map((item) => [item.name, item.path ?? null, !!item.autoPopulating]), [
    ["auto4", "auto4", true],
    ["extra.txt", "extra.txt", false],
    ["q1.ovi", "q1.ovi", false],
    ["Dependencies", null, false],
    ["Build Specifications", null, false],
  ]);
  assert.match(Edit.projectText(converted.project), /"auto-populating": true/);
  assert.doesNotMatch(Edit.projectText(converted.project), /auto4\/p\.ovi/, "p.ovi is shown from the disk now, not stored");
  assert.equal(State.selectedKind(converted), "auto-populating-folder", "the converted folder stays selected");
  // Its dialog: "Select Folder to Connect", in the project's folder (s5 Q5).
  assert.deepEqual(connectFolderDialog("/p"), { title: "Select Folder to Connect", defaultPath: "/p", properties: ["openDirectory"] });
  assert.match(source("editor/electron/project-item-requests.mjs"), /connectFolderDialog\(projectPath \? path\.dirname\(projectPath\)/);
  // An auto-populating folder is not converted again.
  assert.equal(Edit.convertToAutoPopulating(converted, "other"), converted);
});

test("a folder gone from the disk becomes a virtual folder", () => {
  const state = windowWithAuto2([], false);
  const after = Edit.withGoneFoldersVirtual(state);
  assert.deepEqual(Tree.itemAt(after.project, [0, 0]), { name: "auto2", kind: "folder", items: [] }, "no URL and no NI.DISK (s5 Q3)");
  const present = windowWithAuto2();
  assert.equal(Edit.withGoneFoldersVirtual(present), present, "a folder still there changes nothing");
  // The page sends it as an edit of the project.
  assert.match(source("editor/src/project-explorer/project-explorer-commands.mjs"), /if \(next\.project !== getState\(\)\.project\) return edited\(next\);/);
});

test("the menus of a folder inside an auto-populating folder and of its files", () => {
  const rows = (menu) => INV.hijos(`context.project-explorer.${menu}`).map((entry) => `${entry.separado ? "| " : ""}${entry.etiqueta}${entry.atajo ? ` ${entry.atajo}` : ""}`);
  // s5 Q1: the folder's menu with no Stop Auto-populating, no Remove from Project and no Rename.
  assert.deepEqual(rows("auto-populating-subfolder"), ["New", "| Explore...", "Show in Files View Ctrl+E", "| Add", "| Find Items with No Callers", "Items incorrectly claimed by a library", "| Unit Tests", "| Analyze OVIs...", "| Find Project Items...", "| Arrange By", "Expand All", "Collapse All"]);
  let state = State.expandAll(windowWithAuto2(), AUTO2_KEY);
  assert.equal(State.openContextMenu(state, INV, keyOf(state, "sub"), { x: 0, y: 0 }).menuBarra.id, "context.project-explorer.auto-populating-subfolder");
  assert.equal(State.openContextMenu(state, INV, keyOf(state, "B.txt"), { x: 0, y: 0 }).menuBarra.id, "context.project-explorer.auto-populated-file");
  state = State.runContextCommand(State.select(state, keyOf(state, "sub")), "context.project-explorer.auto-populating-subfolder.collapse-all");
  assert.ok(!rowsOf(state).some((row) => row.includes("d.ovi")));
  // An edit elsewhere keeps the rows of the disk as they were opened.
  const edited = Edit.newVirtualFolder(State.expandAll(windowWithAuto2(), AUTO2_KEY), "project/0");
  assert.ok(State.visibleRows(Edit.commitEdit(edited)).some((row) => row.label === "d.ovi"), "the expanded subfolder followed its folder");
});

test("Open on an OVI of an auto-populating folder opens it in the project", () => {
  const state = State.expandAll(windowWithAuto2(), AUTO2_KEY);
  assert.deepEqual(Edit.openRequestOf(state, keyOf(state, "a.ovi")), { storedPath: "auto2/a.ovi" });
  assert.deepEqual(Edit.openRequestOf(state, keyOf(state, "d.ovi")), { storedPath: "auto2/sub/d.ovi" });
  assert.equal(Edit.openRequestOf(state, keyOf(state, "B.txt")), null, "a document's Open is not built");
  assert.equal(Edit.openRequestOf(state, keyOf(state, "c.octl")), null, "a type definition has no window yet");
  assert.equal(State.CONTEXT_COMMANDS["context.project-explorer.auto-populated-file.open"], "openItem");
});

test("the main process lists an auto-populating folder from the disk, and what its files call is in Dependencies", async () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), "solder-auto-"));
  try {
    mkdirSync(path.join(folder, "auto", "sub"), { recursive: true });
    mkdirSync(path.join(folder, "ext"));
    writeFileSync(path.join(folder, "auto", "m.ovi"), JSON.stringify({ "block-diagram": { nodes: [{ type: "subvi", config: { vi: "../ext/leaf.ovi" } }] } }));
    writeFileSync(path.join(folder, "auto", "Notes.txt"), "");
    writeFileSync(path.join(folder, "auto", ".hidden.txt"), "");
    writeFileSync(path.join(folder, "auto", "sub", "d.ovi"), "{}");
    writeFileSync(path.join(folder, "ext", "leaf.ovi"), "{}");
    const projectPath = path.join(folder, "P.sdproj");
    const project = Project.addAutoPopulatingFolder(Project.addAutoPopulatingFolder(Project.blankProject(), "auto"), "gone");
    const disk = await readProjectDisk({ path: projectPath, current: Project.writeProject(project) }, "/nowhere/ovi.lib");
    assert.deepEqual(disk.folders.auto, {
      exists: true,
      entries: [
        { name: "sub", path: "auto/sub", folder: true, entries: [{ name: "d.ovi", path: "auto/sub/d.ovi" }] },
        { name: "m.ovi", path: "auto/m.ovi" },
        { name: "Notes.txt", path: "auto/Notes.txt" },
      ],
    });
    assert.deepEqual(disk.folders.gone, { exists: false, entries: [] });
    assert.deepEqual(disk.dependencies.others.map((key) => path.basename(key)), ["leaf.ovi"], "s5 Q6: the folder's files are items");
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
