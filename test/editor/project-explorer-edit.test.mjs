// Editing the project from the Project Explorer's tree (DT-099 stage b): the in-place edit of a name, Add ▸, Remove From
// Project and its question, the drag, the paths a project stores, the dialogs' options and the folders' right-click menus.
// Measured in LabVIEW 2026 Q3 (labview-captures/reports/2026-11-18-project-explorer-s4.md, -s2.md). The state is pure and
// the page's glue takes the preload's API as a parameter, so none of it needs a browser or Electron.

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import * as Project from "../../core/model/project.mjs";
import * as Tree from "../../core/model/project-tree.mjs";
import { moveOVIFile } from "../../editor/electron/ovi-file-rename.mjs";
import * as Dialogs from "../../editor/electron/project-dialogs.mjs";
import * as Paths from "../../editor/electron/project-paths.mjs";
import { projectBody } from "../../editor/electron/project-registry.mjs";
import { createTreeCommands } from "../../editor/src/project-explorer/project-explorer-commands.mjs";
import * as Edit from "../../editor/src/project-explorer/project-explorer-edit.mjs";
import * as State from "../../editor/src/project-explorer/project-explorer-state.mjs";
import * as View from "../../editor/src/project-explorer/project-explorer-view.mjs";
import { INV, RAIZ } from "../helpers.mjs";

/**
 * My Computer holding the folders Sub (with main1.ovi) and Tools, the files notes.txt and q1.ovi and the fixed items:
 * keys project/0/0 Sub, /0/0/0 main1.ovi, /0/1 Tools, /0/2 notes.txt, /0/3 q1.ovi, /0/4 Dependencies, /0/5 Build Specifications.
 */
function sample() {
  let project = Project.addFiles(Project.blankProject(), ["notes.txt", "q1.ovi"]).project;
  project = Project.addVirtualFolder(Project.addVirtualFolder(project, "Tools"), "Sub");
  return Tree.addInto(project, [0, 0], [{ name: "main1.ovi", kind: "ovi", path: "main1.ovi" }]);
}
const sampleState = () => State.fromProject(sample(), "P1.sdproj");
const labelOf = (state, key) => Tree.itemAt(state.project, State.placeOfKey(key)).name;
const rowLabels = (state) => State.visibleRows(state).map((row) => row.label);
const draw = (state) => View.projectExplorerWindow(INV, state, (text) => text.length * 6, { width: 374, height: 401 });

test("New Virtual Folder opens an in-place edit that Enter commits and Escape cancels", () => {
  // Into a virtual folder: "New Folder", selected, in edit, the folder it went into open (measured: s2 Q2).
  let state = Edit.newVirtualFolder(sampleState(), "project/0/1");
  assert.deepEqual(state.edit, { key: "project/0/1/0", text: "New Folder" });
  assert.equal(state.selected, "project/0/1/0");
  assert.ok(state.expanded.includes("project/0/1"));
  assert.match(draw(state), /<input class="pe-edit" data-edit="project\/0\/1\/0" value="New Folder"/);
  assert.equal(draw(State.select(Edit.cancelEdit(state), "project/0")).includes('class="pe-edit"'), false, "no text box once the edit ends");
  // Typing changes only the text; Enter gives the folder its name and its place in the order, and the selection follows it.
  state = Edit.typeEdit(state, "Zed");
  assert.equal(state.project, Edit.typeEdit(state, "Zeds").project);
  state = Edit.commitEdit(state);
  assert.equal(state.edit, null);
  assert.equal(labelOf(state, state.selected), "Zed");
  // At the target: the new folder goes among the folders (before "Sub"), so the rows after it change key and keep what they had expanded.
  const atTarget = Edit.newVirtualFolder(sampleState(), "project/0");
  assert.equal(atTarget.edit.key, "project/0/0");
  assert.deepEqual(rowLabels(atTarget).slice(2, 5), ["New Folder", "Sub", "main1.ovi"], "Sub stayed expanded under its new key");
  // Escape ends the edit and the folder keeps "New Folder"; an empty name or the same one changes nothing either.
  const cancelled = Edit.cancelEdit(Edit.typeEdit(atTarget, "Never"));
  assert.deepEqual([cancelled.edit, labelOf(cancelled, "project/0/0")], [null, "New Folder"]);
  assert.equal(Edit.commitEdit(Edit.typeEdit(atTarget, "  ")).project, atTarget.project);
  assert.equal(Edit.commitEdit(atTarget).project, atTarget.project);
  // Not into a file, a document or Dependencies.
  for (const key of ["project/0/2", "project/0/4", "project"]) assert.equal(Edit.newVirtualFolder(sampleState(), key).edit, null);
  assert.equal(INV.entrada("context.project-explorer.my-computer.new.virtual-folder").estado, "built");
  assert.equal(INV.entrada("context.project-explorer.my-computer.new.vi").estado, "built", "New ▸ OVI makes an OVI of the project (test/editor/project-new-ovi.test.mjs)");
});

/** The page's glue on a fake of the preload's API: what it asks of the main process and what it reports back. */
function fakePage(project = sample(), answers = {}) {
  const page = { state: State.fromProject(project, "P1.sdproj"), changed: [], explained: [], unable: [] };
  const solder = { project: { changed: (text) => page.changed.push(text), unableToAdd: (paths) => page.unable.push(paths), ...answers } };
  const set = (next) => {
    page.state = next;
  };
  page.commands = createTreeCommands({ getState: () => page.state, show: set, update: set, explainHole: (id) => page.explained.push(id), solder });
  return page;
}

test("F2 and Rename edit a virtual folder in place and do nothing useful on the other rows", () => {
  assert.equal(Edit.startEdit(State.select(sampleState(), "project/0/0")).edit.text, "Sub");
  for (const key of ["project/0/3", "project/0/2", "project/0", "project/0/4"]) assert.equal(Edit.startEdit(State.select(sampleState(), key)).edit, null, key);
  const auto = State.select(State.fromProject(Project.addAutoPopulatingFolder(sample(), "auto"), "P"), "project/0/0");
  assert.equal(State.selectedKind(auto), "auto-populating-folder");
  assert.equal(Edit.startEdit(auto).edit, null, "an auto-populating folder has no Rename (s4)");
  // Renaming moves the folder in the order; the selection and the open folders follow their items.
  const edited = Edit.commitEdit(Edit.typeEdit(Edit.startEdit(State.select(sampleState(), "project/0/1")), "Alpha"));
  assert.deepEqual([rowLabels(edited).slice(2, 5), edited.selected], [["Alpha", "Sub", "main1.ovi"], "project/0/0"]);
  // The page: a virtual folder is edited, an OVI goes to the main process (the next test), a document does nothing (F2 on it, s4).
  const page = fakePage(sample(), { renameOvi: async () => null });
  page.commands.rename();
  assert.equal(page.state.edit, null, "My Computer is selected: nothing");
  page.state = State.select(page.state, "project/0/0");
  page.commands.rename();
  assert.equal(page.state.edit.text, "Sub");
  page.state = State.select(Edit.cancelEdit(page.state), "project/0/2");
  page.commands.rename();
  assert.deepEqual([page.explained, page.state.edit], [[], null], "a document has no Rename");
  assert.equal(INV.entrada("context.project-explorer.virtual-folder.rename").atajo, "F2");
  assert.equal(INV.entrada("context.project-explorer.virtual-folder.rename").estado, "built");
});

test("Rename of an OVI renames its file through Save the OVI As, and the item's name and path follow", async () => {
  // Measured (s4 "Rename"): "Save the VI (main1.vi) As" in the VI's folder, the name without its extension, the VIs filter.
  assert.deepEqual(Dialogs.renameOviDialog("/work/Sub/main1.ovi"), { title: "Save the OVI (main1.ovi) As", defaultPath: "/work/Sub/main1", filters: [{ name: "OVIs (*.ovi)", extensions: ["ovi"] }] });
  const asked = [];
  const page = fakePage(sample(), { renameOvi: async (storedPath) => (asked.push(storedPath), "Sub/a-first.ovi") });
  page.state = State.select(page.state, "project/0/3");
  await page.commands.rename();
  assert.deepEqual(asked, ["q1.ovi"], "the item's stored path goes to the main process");
  // q1.ovi became a-first.ovi: still at My Computer (the item stays where it was in the tree), sorted by its new name, selected.
  assert.deepEqual(rowLabels(page.state).slice(2, 7), ["Sub", "main1.ovi", "Tools", "a-first.ovi", "notes.txt"]);
  assert.equal(page.state.selected, "project/0/2");
  assert.deepEqual(Tree.itemAt(page.state.project, [0, 2]), { name: "a-first.ovi", kind: "ovi", path: "Sub/a-first.ovi" });
  assert.equal(page.changed.length, 1, "the project has a change (s4: the title gets ' *')");
  // Cancelled or refused, nothing changes; a new OVI never saved asks nothing (not measured).
  const cancelled = fakePage(sample(), { renameOvi: async () => null });
  cancelled.state = State.select(cancelled.state, "project/0/3");
  await cancelled.commands.rename();
  assert.deepEqual([cancelled.changed, rowLabels(cancelled.state)], [[], rowLabels(sampleState())]);
  const withNew = Edit.addNewOvi(sampleState(), "project/0", "Untitled 3", "7");
  const newKey = State.visibleRows(withNew).find((row) => row.label === "Untitled 3").key;
  assert.equal(Edit.renameRequestOf(withNew, newKey), null);
  assert.equal(INV.entrada("context.project-explorer.ovi-item.rename").estado, "built");
});

test("an OVI renamed into another folder moves on disk with its subOVIs' paths rebased, and one renamed in place keeps its text", async () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), "solder-rename-"));
  mkdirSync(path.join(folder, "Sub"));
  const text = `${JSON.stringify({ "block-diagram": { nodes: [{ type: "subvi", config: { vi: "helper.ovi" } }] } }, null, 2)}\n`;
  writeFileSync(path.join(folder, "main1.ovi"), text);
  await moveOVIFile(path.join(folder, "main1.ovi"), path.join(folder, "renamed.ovi"));
  assert.equal(existsSync(path.join(folder, "main1.ovi")), false, "the old file is gone (s4: renamed at once)");
  assert.equal(readFileSync(path.join(folder, "renamed.ovi"), "utf8"), text);
  await moveOVIFile(path.join(folder, "renamed.ovi"), path.join(folder, "Sub", "deeper.ovi"));
  assert.equal(JSON.parse(readFileSync(path.join(folder, "Sub", "deeper.ovi"), "utf8"))["block-diagram"].nodes[0].config.vi, "../helper.ovi");
});

test("Add File, Folder (Snapshot) and Folder (Auto-populating) put the items into the target and list the refused files", () => {
  const added = Edit.addFiles(sampleState(), "project/0/1", ["b.ovi", "a.txt", "q1.ovi"]);
  assert.deepEqual(added.refused, ["q1.ovi"], "a file already in the project (s2 Q3)");
  assert.deepEqual(rowLabels(added.state).slice(4, 7), ["Tools", "a.txt", "b.ovi"], "inside the folder that was chosen, which opens");
  const base = sampleState();
  assert.equal(Edit.addFiles(base, "project/0/2", ["z.txt"]).state, base, "not into a file");
  const snapshot = Edit.addSnapshotFolder(sampleState(), "project/0", "Shots", ["Shots/b.ovi", "Shots/a.txt"]);
  const folder = Tree.itemAt(snapshot.state.project, [0, 0]);
  assert.deepEqual([folder.name, folder.items.map((item) => item.name)], ["Shots", ["a.txt", "b.ovi"]], "a virtual folder with the files");
  const auto = Edit.addAutoPopulatingFolder(sampleState(), "project/0", "data/auto");
  assert.equal(State.treeOf(auto.project, "P").children[0].children[0].kind, "auto-populating-folder");
  assert.equal(State.visibleRows(auto).find((row) => row.label === "auto").expandable, false, "its contents are stage c's");
  // The page asks the main process for the paths, applies them, reports the new text and the refused files; a cancel does nothing.
  const page = fakePage(sample(), { chooseFiles: async () => ["x.txt", "q1.ovi"], chooseSnapshotFolder: async () => ({ folderName: "S", storedPaths: ["S/s.txt"] }), chooseAutoPopulatingFolder: async () => "auto" });
  return page.commands.addFile().then(async () => {
    assert.deepEqual(page.unable, [["q1.ovi"]]);
    assert.equal(page.changed.length, 1);
    assert.equal(page.changed[0], Edit.projectText(page.state.project));
    page.state = State.select(page.state, "project/0/0");
    await page.commands.addSnapshotFolder();
    await page.commands.addAutoPopulatingFolder();
    assert.equal(page.changed.length, 3);
    const cancelled = fakePage(sample(), { chooseFiles: async () => null, chooseSnapshotFolder: async () => null, chooseAutoPopulatingFolder: async () => null });
    await Promise.all([cancelled.commands.addFile(), cancelled.commands.addSnapshotFolder(), cancelled.commands.addAutoPopulatingFolder()]);
    assert.deepEqual(cancelled.changed, []);
    assert.equal(INV.entrada("context.project-explorer.my-computer.add.hyperlink").estado, "todo", "Hyperlink... stays greyed");
  });
});

test("Remove From Project asks first, removes the item with its items and selects the next row", () => {
  let state = State.select(sampleState(), "project/0/0");
  state = Edit.askRemove(state);
  assert.equal(state.dialog.title, "Remove Items");
  assert.equal(state.dialog.text, "The selected item(s) will be permanently deleted from the project or project library.");
  const html = draw(state);
  assert.match(html, /Do not show this dialog again\./);
  assert.match(html, /<div class="pe-check hueco" data-id="window\.project-explorer\.dialog\.remove-items\.do-not-show-again">/);
  assert.match(html, /class="pe-dialog-button default" data-answer="ok">OK<\/button><button class="pe-dialog-button" data-answer="cancel">Cancel/);
  assert.equal(INV.entrada("window.project-explorer.dialog.remove-items.do-not-show-again").estado, "todo");
  assert.equal(Edit.cancelDialog(state).project, state.project, "Cancel removes nothing");
  // OK: the folder goes with main1.ovi; the next row, Tools, is selected (it moved to the folder's place).
  const removed = Edit.confirmRemove(state);
  assert.deepEqual([removed.dialog, rowLabels(removed).slice(2, 4), labelOf(removed, removed.selected)], [null, ["Tools", "notes.txt"], "Tools"]);
  assert.equal(Project.itemsWithPaths(removed.project).some((item) => item.path === "main1.ovi"), false);
  // A file: the row that followed it is selected, here Dependencies; a file that was not the last keeps its neighbour.
  assert.equal(labelOf(Edit.confirmRemove(Edit.askRemove(State.select(sampleState(), "project/0/3"))), "project/0/3"), "Dependencies");
  assert.equal(labelOf(Edit.confirmRemove(Edit.askRemove(State.select(sampleState(), "project/0/2"))), "project/0/2"), "q1.ovi");
  // What cannot be removed does not ask: the project, My Computer, Dependencies and Build Specifications.
  for (const key of ["project", "project/0", "project/0/4", "project/0/5"]) assert.equal(Edit.askRemove(State.select(sampleState(), key)).dialog, null, key);
  // The toolbar's button and the Edit menu's row are greyed on the same rows.
  assert.ok(State.disabledButtons(State.select(sampleState(), "project/0/4")).has("remove-from-project"));
  assert.equal(State.disabledButtons(State.select(sampleState(), "project/0/2")).has("remove-from-project"), false);
  const editMenu = (key) => draw({ ...State.select(sampleState(), key), menuBarra: { id: "window.project-explorer.menu.edit", x: 40, y: 20, abierto: null } });
  const removeRow = (html) => html.match(/<div class="item-menu([^"]*)" data-id="window\.project-explorer\.menu\.edit\.remove-from-project"/)[1];
  assert.match(removeRow(editMenu("project/0")), /desactivado/);
  assert.doesNotMatch(removeRow(editMenu("project/0/2")), /desactivado/);
  // The page: the question opens with nothing reported; OK reports the new text; Cancel nothing.
  const page = fakePage();
  page.state = State.select(page.state, "project/0/2");
  page.commands.removeFromProject();
  page.commands.cancelDialog();
  assert.deepEqual([page.state.dialog, page.changed.length], [null, 0]);
  page.commands.removeFromProject();
  page.commands.confirmRemove();
  assert.deepEqual([page.changed.length, page.changed[0] === Edit.projectText(page.state.project)], [1, true]);
  // The edit menu, the toolbar and the item menus run the command, and Delete is not bound (the inventory has no shortcut for it).
  assert.equal(State.MENU_COMMANDS["remove-from-project"], "removeFromProject");
  assert.equal(INV.entrada("window.project-explorer.menu.edit.remove-from-project").atajo, undefined);
  for (const menu of ["virtual-folder", "auto-populating-folder", "ovi-item", "document-item"]) assert.equal(State.CONTEXT_COMMANDS[`context.project-explorer.${menu}.remove-from-project`], "removeFromProject", menu);
});

test("dragging an item onto My Computer or a virtual folder moves it and nowhere else", () => {
  const withAuto = () => State.fromProject(Project.addAutoPopulatingFolder(sample(), "auto"), "P");
  // withAuto: auto project/0/0, Sub /0/1 (main1.ovi /0/1/0), Tools /0/2, notes.txt /0/3, q1.ovi /0/4.
  const intoSub = Edit.dropOnto(withAuto(), "project/0/4", "project/0/1");
  assert.deepEqual([labelOf(intoSub, intoSub.selected), State.placeOfKey(intoSub.selected).length], ["q1.ovi", 3], "q1.ovi is in Sub now, selected");
  assert.deepEqual(rowLabels(intoSub).slice(3, 6), ["Sub", "main1.ovi", "q1.ovi"]);
  const toRoot = Edit.dropOnto(withAuto(), "project/0/1/0", "project/0");
  assert.equal(labelOf(toRoot, toRoot.selected), "main1.ovi");
  assert.equal(State.placeOfKey(toRoot.selected).length, 2, "from a folder onto My Computer: moved to the root (s4)");
  // A folder dropped on a folder nests (the rule between nesting and reordering was not measured).
  const nested = Edit.dropOnto(withAuto(), "project/0/2", "project/0/1");
  assert.deepEqual(rowLabels(nested).slice(2, 6), ["auto", "Sub", "Tools", "main1.ovi"], "folders first inside Sub");
  assert.equal(State.placeOfKey(nested.selected).length, 3);
  // Nothing happens onto an auto-populating folder or a file, onto the fixed items, onto the project, or onto itself.
  const base = withAuto();
  for (const target of ["project/0/0", "project/0/3", "project/0/5", "project/0/6", "project", "project/0/4"]) {
    assert.equal(Edit.dropOnto(base, "project/0/4", target), base, `onto ${target}`);
    assert.equal(Edit.canDrop(base, "project/0/4", target), false);
  }
  assert.equal(Edit.canDrop(base, "project/0/4", "project/0/1"), true);
  for (const fixed of ["project", "project/0", "project/0/5", "project/0/6"]) assert.equal(Edit.canDrop(withAuto(), fixed, "project/0/1"), false, `${fixed} does not move`);
  assert.equal(Edit.canDrop(withAuto(), "project/0/1", "project/0/1/0"), false, "not into itself");
  // Only the rows that can move are draggable.
  const html = draw(withAuto());
  assert.equal([...html.matchAll(/draggable="true"/g)].length, 6, "auto, Sub, main1.ovi, Tools, notes.txt, q1.ovi");
  assert.doesNotMatch(html, /data-kind="(project|my-computer|dependencies|build)" draggable/);
  // The page reports the new text.
  const page = fakePage();
  page.commands.drop("project/0/3", "project/0/0");
  assert.equal(page.changed.length, 1);
  page.commands.drop("project/0/3", "project/0/4");
  assert.equal(page.changed.length, 1, "a drop that does nothing reports nothing");
});

test("a project stores its paths relative to its file and rebases them when an untitled one is saved", () => {
  const file = "/home/u/work/P1.sdproj";
  assert.equal(Paths.storedProjectPath(file, "/home/u/work/sub/a.ovi"), "sub/a.ovi");
  assert.equal(Paths.storedProjectPath(file, "/home/u/other/b.txt"), "../other/b.txt");
  assert.equal(Paths.storedProjectPath(null, "/home/u/other/b.txt"), "/home/u/other/b.txt", "absolute while untitled");
  assert.equal(Paths.storedProjectPath(null, "C:\\Users\\u\\a.vi"), "C:/Users/u/a.vi");
  assert.equal(Paths.storedProjectPath("C:\\proj\\P.sdproj", "C:\\proj\\x\\a.vi"), "x/a.vi");
  // Saving a project that was never saved: every path, files and auto-populating folders, becomes relative to the new folder.
  let project = Project.addFiles(Project.blankProject(), ["/home/u/work/a.ovi", "/home/u/other/b.txt"]).project;
  project = Project.addAutoPopulatingFolder(project, "/home/u/work/data");
  project = Tree.addSnapshotFolderInto(project, [0], "Shots", ["/home/u/work/Shots/s.txt"]).project;
  const rebased = Project.readProject(Paths.rebaseProjectBody(projectBody(project), null, file));
  const stored = Project.itemsWithPaths(rebased).map((item) => item.path).sort();
  assert.deepEqual(stored, ["../other/b.txt", "Shots/s.txt", "a.ovi"]);
  assert.equal(Tree.itemAt(rebased, [0, 0]).path, "data", "the auto-populating folder too");
  // Saved again where it is, or elsewhere: the files stay the same ones.
  assert.equal(Paths.rebaseProjectBody(projectBody(rebased), file, file), projectBody(rebased));
  const moved = Project.readProject(Paths.rebaseProjectBody(projectBody(rebased), file, "/home/u/P2.sdproj"));
  assert.deepEqual(Project.itemsWithPaths(moved).map((item) => item.path).sort(), ["other/b.txt", "work/Shots/s.txt", "work/a.ovi"]);
  // Add ▸ Folder (Snapshot): a virtual folder named after the folder, its top-level files only.
  assert.deepEqual(Paths.snapshotOfFolder(file, "/home/u/work/Shots/", ["a.txt", "b.ovi"]), { folderName: "Shots", storedPaths: ["Shots/a.txt", "Shots/b.ovi"] });
  // The text the window sends is the text the registry compares (no window place).
  assert.equal(Edit.projectText(sample()), projectBody(sample()));
});

test("the dialogs ask what LabVIEW asks", () => {
  assert.deepEqual(Dialogs.addFileDialog("/h"), { title: "Select a File to Insert", buttonLabel: "Add File", defaultPath: "/h", properties: ["openFile", "multiSelections"] });
  assert.deepEqual(Dialogs.addFolderDialog("/h"), { title: "Select a Folder to Insert", defaultPath: "/h", properties: ["openDirectory"] });
  const text = Dialogs.unableToAddDialogText([{ name: "q1.ovi", path: "/h/q1.ovi" }, { name: "a.txt", path: "/h/a.txt" }]);
  assert.equal(text.title, "Unable to Add Items");
  assert.match(text.detail, /q1\.ovi\n\/h\/q1\.ovi\n\na\.txt\n\/h\/a\.txt\n\n\(Hex 0xDAC2\) An item with this path already exists in the project\.$/);
  assert.equal(Dialogs.UNABLE_TO_ADD_REASON, `(Hex 0xDAC2) ${Tree.ALREADY_IN_PROJECT}`);
});

test("the right-click menus of virtual and auto-populating folders and of the items inside them are declared with their state", () => {
  const rows = (menu) => INV.hijos(`context.project-explorer.${menu}`).map((entry) => `${entry.separado ? "| " : ""}${entry.etiqueta}${entry.atajo ? ` ${entry.atajo}` : ""}${entry.estado === "built" ? " +" : ""}`);
  // s4 "Menus", with "|" before the first row of a group and "+" on what is built; a VI is an OVI here.
  assert.deepEqual(rows("virtual-folder"), ["New +", "Add +", "| Convert to Auto-populating Folder... +", "| Convert to Library", "Find Items with No Callers", "Items incorrectly claimed by a library", "| Unit Tests", "| Analyze OVIs...", "| Find Project Items...", "| Arrange By", "Expand All +", "Collapse All +", "| Remove from Project +", "Rename... F2 +"]);
  assert.deepEqual(rows("auto-populating-folder"), ["New", "| Explore...", "Show in Files View Ctrl+E +", "| Add +", "| Stop Auto-populating +", "| Find Items with No Callers", "Items incorrectly claimed by a library", "| Unit Tests", "| Analyze OVIs...", "| Find Project Items...", "| Arrange By", "Expand All +", "Collapse All +", "| Remove from Project +"]);
  assert.deepEqual(rows("auto-populated-file"), ["Open +", "Explore...", "Show in Files View Ctrl+E +", "| Print...", "| Find", "| Properties"], "no Remove and no Rename (s4)");
  const under = (menu, row) => INV.hijos(`context.project-explorer.${menu}.${row}`).map((entry) => `${entry.etiqueta}${entry.estado === "built" ? " +" : ""}`);
  assert.deepEqual(under("virtual-folder", "add"), ["File... +", "Folder (Snapshot)... +", "Folder (Auto-populating)... +", "Hyperlink..."]);
  assert.deepEqual(under("my-computer", "add"), ["File... +", "Folder (Snapshot)... +", "Folder (Auto-populating)... +", "Hyperlink..."]);
  assert.deepEqual(under("virtual-folder", "new").slice(0, 2), ["OVI +", "Virtual Folder +"]);
  // An OVI inside a folder has the menu of one at the root, Remove from Project and Rename... built.
  assert.equal(State.contextMenuOf(State.treeOf(Tree.addInto(sample(), [0, 0], []), "P").children[0].children[0].children[0].kind), "context.project-explorer.ovi-item");
  assert.deepEqual(["ovi-item", "document-item"].map((menu) => INV.entrada(`context.project-explorer.${menu}.remove-from-project`).estado), ["built", "built"]);
  assert.equal(INV.entrada("context.project-explorer.ovi-item.rename").estado, "built");
  // The rows open on the menus of their kind, and each built row runs the command of its name.
  const withAuto = State.fromProject(Project.addAutoPopulatingFolder(sample(), "auto"), "P");
  assert.equal(State.openContextMenu(withAuto, INV, "project/0/0", { x: 10, y: 10 }).menuBarra.id, "context.project-explorer.auto-populating-folder");
  assert.equal(State.openContextMenu(withAuto, INV, "project/0/1", { x: 10, y: 10 }).menuBarra.id, "context.project-explorer.virtual-folder");
  const builtCommands = Object.entries(State.CONTEXT_COMMANDS).filter(([id]) => !id.includes(".project."));
  assert.equal(builtCommands.length, 42, "five on each of My Computer and the virtual folder (New ▸ OVI, 2026-11-19), Remove on four menus, Rename on a folder and (stage d) an OVI, an OVI's Open; stage c: Dependencies' Refresh, a dependency's Open, Convert, Stop and an auto-populated OVI's Open; stage d: six Show in Files View and the Files tab's fourteen (project-files-tab.test.mjs)");
  for (const [id, command] of Object.entries(State.CONTEXT_COMMANDS)) {
    assert.equal(INV.entrada(id).estado, "built", id);
    assert.ok(typeof command === "string");
  }
  // Add ▸ of an auto-populating folder is drawn greyed and does nothing (s4); the other menus' Add ▸ is not.
  const menuOf = (menu) => draw({ ...withAuto, menuBarra: { id: `context.project-explorer.${menu}`, x: 40, y: 40, abierto: null } });
  assert.match(menuOf("auto-populating-folder"), /<div class="item-menu[^"]*desactivado[^"]*" data-id="context\.project-explorer\.auto-populating-folder\.add"/);
  assert.doesNotMatch(menuOf("virtual-folder"), /item-menu[^"]*desactivado/);
  // Every id the menus draw exists in the inventory.
  for (const menu of ["virtual-folder", "auto-populating-folder", "auto-populated-file"]) {
    for (const [, id] of menuOf(menu).matchAll(/data-id="([^"]+)"/g)) assert.ok(INV.entrada(id), id);
  }
});

test("the page wires the tree's edits to the keys, the mouse and the main process", () => {
  const page = readFileSync(path.join(RAIZ, "editor/src/project-explorer/project-explorer.mjs"), "utf8");
  for (const call of ['"F2"', "dragstart", "dragover", "drop", "treeCommands.commitEdit()", "treeCommands.confirmRemove()", "solder?.project.onRebased("]) assert.ok(page.includes(call), call);
  assert.equal(/Delete|Backspace/.test(page.replace(/The Delete key does not remove[^\n]*/, "")), false, "no key removes: LabVIEW's Edit ▸ Remove From Project has no shortcut");
  const preload = readFileSync(path.join(RAIZ, "editor/electron/preload.cjs"), "utf8");
  for (const channel of ["project:choose-files", "project:choose-snapshot-folder", "project:choose-auto-populating-folder", "project:unable-to-add", "project:rebased"]) assert.ok(preload.includes(channel), channel);
  const manager = readFileSync(path.join(RAIZ, "editor/electron/project-manager.mjs"), "utf8");
  assert.ok(manager.includes("rebaseProjectBody(entry.current, entry.path, target)"), "Save Project rebases the paths to the new file's folder");
});

// Found on the desktop on 2026-11-19: in the explorer's 374 × 401 window the File menu is taller than the window, was cut
// off and did not scroll, so File ▸ Exit could not be reached. The wheel scrolls it, as the windows' menus scroll.
test("a menu taller than the explorer scrolls with the wheel, so File ▸ Exit can be reached", () => {
  const file = "window.project-explorer.menu.file";
  const exitRow = `${file}.exit`;
  const opened = { ...State.fromProject(sample(), "P"), menuBarra: { id: file, x: 0, y: 19 } };
  const html = draw(opened);
  const scrollMax = Number(/data-menu="window\.project-explorer\.menu\.file" data-scroll-max="(\d+)"/.exec(html)?.[1]);
  assert.ok(scrollMax > 0, "the File menu does not fit and scrolls");
  const exitTop = (state) => Number(new RegExp(`data-id="${exitRow.replaceAll(".", "\\.")}" style="top:([\\d.]+)px`).exec(draw(state))[1]);
  const menuHeight = Number(/class="menu-contextual desplazable"[^>]*height:([\d.]+)px/.exec(html)[1]);
  assert.ok(exitTop(opened) > menuHeight, "unscrolled, Exit is below what shows");
  const scrolled = State.scrollMenu(opened, file, 10_000, scrollMax);
  assert.equal(scrolled.menuBarra.desplazados[file], scrollMax, "the scroll stops at the end");
  assert.ok(exitTop(scrolled) < menuHeight, "scrolled to the end, Exit shows");
  assert.match(readFileSync(path.join(RAIZ, "editor/src/project-explorer/project-explorer.mjs"), "utf8"), /State\.scrollMenu\(state, list\.dataset\.menu, event\.deltaY/, "the page scrolls it on the wheel");
});
