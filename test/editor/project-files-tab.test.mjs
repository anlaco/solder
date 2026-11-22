// The Project Explorer's Files tab (DT-099 stage d), measured in LabVIEW 2026 Q3 (labview-captures/reports/2026-11-22-files-tab.md):
// the project's files from the drive down, the switch between Items and Files that carries the selection, and the Files
// rows' menus. The state is pure (files-tree.mjs, files-view.mjs); the page's wiring is checked in its source.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import * as Project from "../../core/model/project.mjs";
import * as Tree from "../../core/model/project-tree.mjs";
import * as Files from "../../editor/src/project-explorer/files-view.mjs";
import * as State from "../../editor/src/project-explorer/project-explorer-state.mjs";
import * as View from "../../editor/src/project-explorer/project-explorer-view.mjs";
import { INV, RAIZ } from "../helpers.mjs";

/**
 * As the measured project: in /w/s/F14/P.sdproj, a virtual folder holding first.ovi, an auto-populating folder `auto`
 * (a.ovi, b.txt), notes.txt, third.ovi, ../outside.txt and a dependency in Solder's library; extra.ovi is on disk next
 * to them but not in the project, so nothing lists it.
 */
function measuredState() {
  let project = Project.addFiles(Project.blankProject(), ["notes.txt", "third.ovi", "../outside.txt"]).project;
  project = Tree.addInto(Project.addVirtualFolder(project, "New Folder"), [0, 0], [{ name: "first.ovi", kind: "ovi", path: "first.ovi" }]);
  project = Project.addAutoPopulatingFolder(project, "auto");
  const disk = {
    dependencies: { library: ["/opt/solder/ovi.lib/dialogs/Dialog.ovi"], others: [], missing: [] },
    folders: { auto: { exists: true, entries: [{ name: "b.txt", path: "auto/b.txt" }, { name: "a.ovi", path: "auto/a.ovi" }] } },
    projectFile: "/w/s/F14/P.sdproj",
  };
  return State.withDisk(State.fromProject(project, "P.sdproj"), disk);
}
const drawn = (state) => Files.visibleFileRows(state).map((row) => `${"  ".repeat(row.depth)}${row.label}${row.expandable ? (row.expanded ? " -" : " +") : ""}`);
const keyOfLabel = (state, label) => Files.visibleFileRows(state).find((row) => row.label === label).key;
const itemsLabel = (state) => State.visibleRows(state).find((row) => row.key === state.selected).label;

test("the Files tab shows the project's files from the drive down, folders first, without virtual folders or side files", () => {
  const state = Files.showFilesTab(measuredState());
  // Q1: the drive is the root and selected; the chains to the project's folder and the dependency's are open; folders first, then files by name.
  assert.deepEqual(drawn(Files.expandAllFiles(Files.selectFile(state, keyOfLabel(state, "/")))), [
    "/ -", "  opt -", "    solder -", "      ovi.lib -", "        dialogs -", "          Dialog.ovi",
    "  w -", "    s -", "      F14 -", "        auto -", "          a.ovi", "          b.txt", "        first.ovi", "        notes.txt", "        P.sdproj", "        third.ovi",
    "      outside.txt",
  ]);
  assert.deepEqual(drawn(state).slice(0, 2), ["/ -", "  opt -"]);
  assert.equal(state.files.selected, keyOfLabel(state, "/"));
  assert.ok(drawn(state).includes("        auto +"), "an auto-populating folder is not opened at first (Q1 opens the chains only)");
  // The kinds give the icons and menus: the auto-populating folder, an OVI, another file, the project file, a dependency.
  const kinds = Object.fromEntries(Files.visibleFileRows(Files.expandAllFiles(state)).map((row) => [row.label, row.kind]));
  assert.deepEqual([kinds["/"], kinds.F14, kinds.auto, kinds["first.ovi"], kinds["notes.txt"], kinds["P.sdproj"], kinds["Dialog.ovi"]], ["files-drive", "files-folder", "files-auto-populating-folder", "files-ovi", "files-document", "files-project", "files-dependency-ovi"]);
  // On Windows the root is the drive without its colon (Q1: "C").
  const windows = State.withDisk(State.fromProject(Project.addFiles(Project.blankProject(), ["a.ovi"]).project, "P.sdproj"), { ...measuredState().disk, dependencies: { library: [], others: [], missing: [] }, projectFile: "C:/scratch/P.sdproj" });
  assert.deepEqual(drawn(Files.showFilesTab(windows)), ["C -", "  scratch -", "    a.ovi", "    P.sdproj"]);
  // Drawn in its own tree, whose rows never answer as Items rows, with the plain folder icon for every folder.
  const html = View.projectExplorerWindow(INV, state, (text) => text.length * 6, { width: 374, height: 401 });
  assert.match(html, /<div class="pe-tab seleccionada" data-tab="files"/);
  assert.match(html, /<div class="pe-tree" data-id="window\.project-explorer\.files"><div class="pe-row seleccionada" data-file-key="files:\/" data-kind="files-drive"/);
  assert.doesNotMatch(html, /data-key=/);
  assert.equal(INV.entrada("window.project-explorer.files").estado, "built");
});

test("Ctrl+E and Show in Items or Files View switch tabs carrying the selection over", () => {
  // Items → Files: third.ovi selected in Items is selected in Files (Q3).
  const items = measuredState();
  const thirdKey = State.visibleRows(items).find((row) => row.label === "third.ovi").key;
  const files = Files.showOtherView(State.select(items, thirdKey));
  assert.equal(files.tab, "files");
  assert.equal(files.files.selected, "files:/w/s/F14/third.ovi");
  // Files → Items: the project file selects the project; a dependency selects its row, its folders opened.
  const back = Files.showOtherView(Files.selectFile(files, "files:/w/s/F14/P.sdproj"));
  assert.deepEqual([back.tab, back.selected], ["items", State.ROOT_KEY]);
  const collapsed = { ...files, expanded: [] };
  const dependency = Files.showInItemsView(Files.selectFile(collapsed, "files:/opt/solder/ovi.lib/dialogs/Dialog.ovi"));
  assert.equal(itemsLabel(dependency), "Dialog.ovi", "Dependencies and its ovi.lib folder open to show it");
  // A row with no file (Dependencies) keeps the Files selection (Q3).
  const dependenciesKey = State.visibleRows(items).find((row) => row.label === "Dependencies").key;
  assert.equal(Files.showOtherView({ ...State.select(back, dependenciesKey), files: files.files }).files.selected, "files:/w/s/F14/third.ovi");
  // The rows that do it: Window ▸ Show Other Project View (Ctrl+E), each Show in Items View and Show in Files View.
  assert.equal(State.MENU_COMMANDS["show-other-project-view"], "showOtherView");
  assert.equal(INV.entrada("window.project-explorer.menu.window.show-other-project-view").atajo, "Ctrl+E");
  for (const id of ["context.project-explorer.ovi-item.show-in-files-view", "context.project-explorer.project.show-in-files-view", "context.project-explorer.files-ovi.show-in-items-view", "context.project-explorer.files-project.show-in-items-view"]) {
    assert.equal(State.CONTEXT_COMMANDS[id], "showOtherView", id);
    assert.equal(INV.entrada(id).estado, "built", id);
  }
  assert.match(readFileSync(path.join(RAIZ, "editor/src/project-explorer/project-explorer.mjs"), "utf8"), /showOtherView: \(\) => show\(Files\.showOtherView\(state\)\)/);
});

test("the Files rows have LabVIEW's menus, and Open, a double click and Expand All work on them", () => {
  const rows = (menu) => INV.hijos(`context.project-explorer.${menu}`).map((entry) => `${entry.separado ? "| " : ""}${entry.etiqueta}${entry.atajo ? ` ${entry.atajo}` : ""}${entry.estado === "built" ? " +" : ""}`);
  // Q2, "+" on what is built.
  assert.deepEqual(rows("files-ovi"), ["Open +", "Explore...", "Show in Items View Ctrl+E +", "| Print...", "| Remove from Project", "Rename... F2 +", "| Move on Disk...", "| Properties"]);
  assert.deepEqual(rows("files-document"), ["Open", "Explore...", "Show in Items View Ctrl+E +", "| Print...", "| Remove from Project", "| Move on Disk...", "| Properties"]);
  assert.deepEqual(rows("files-project"), ["Explore...", "Show in Items View Ctrl+E +", "| Properties"]);
  assert.deepEqual(rows("files-folder"), ["Explore...", "| Arrange By", "Expand All +", "Collapse All +"]);
  assert.deepEqual(rows("files-drive"), rows("files-folder"));
  assert.deepEqual(rows("files-auto-populating-folder"), ["Explore...", "Show in Items View Ctrl+E +", "| Arrange By", "Expand All +", "Collapse All +", "| Remove from Project", "| Move on Disk..."]);
  assert.deepEqual(rows("files-dependency-ovi"), ["Open +", "Explore...", "Show in Items View Ctrl+E +", "| Print...", "| Rename... F2", "Help...", "| Properties"]);
  // The right button selects the row and opens its kind's menu.
  const state = Files.showFilesTab(measuredState());
  const menu = Files.openFileContextMenu(state, INV, "files:/w/s/F14/third.ovi", { x: 10, y: 20 });
  assert.deepEqual([menu.files.selected, menu.menuBarra.id], ["files:/w/s/F14/third.ovi", "context.project-explorer.files-ovi"]);
  // Open and a double click (Q4): an OVI or a dependency opens by its absolute path; a folder's double click opens or closes it.
  assert.deepEqual(Files.fileOpenRequest(state, "files:/w/s/F14/third.ovi"), { storedPath: "/w/s/F14/third.ovi" });
  assert.deepEqual(Files.fileOpenRequest(state, "files:/opt/solder/ovi.lib/dialogs/Dialog.ovi"), { storedPath: "/opt/solder/ovi.lib/dialogs/Dialog.ovi" });
  assert.equal(Files.fileOpenRequest(state, "files:/w/s/F14/notes.txt"), null);
  assert.equal(Files.toggleFileRow(state, "files:/w/s/F14/auto").files.expanded.includes("files:/w/s/F14/auto"), true);
  // Collapse All on the drive closes everything under it; Expand All opens it again.
  const drive = Files.selectFile(state, "files:/");
  assert.deepEqual(drawn(Files.collapseAllFiles(drive)), ["/ +"]);
  assert.equal(drawn(Files.expandAllFiles(Files.collapseAllFiles(drive))).length, 17);
  // Rename... of an OVI's file is its item's.
  assert.equal(State.visibleRows(state).find((row) => row.key === Files.itemsKeyOfFile(state, "files:/w/s/F14/first.ovi")).label, "first.ovi");
  const page = readFileSync(path.join(RAIZ, "editor/src/project-explorer/project-explorer.mjs"), "utf8");
  assert.match(page, /if \(clickCount === DOUBLE_CLICK\) openFileRow\(row\.dataset\.fileKey\);/);
  assert.match(page, /return state\.tab === State\.TABS\.FILES \? renameFileRow\(\) : treeCommands\.rename\(\);/);
  // The main process tells the page where the project file is.
  assert.match(readFileSync(path.join(RAIZ, "editor/electron/project-disk-requests.mjs"), "utf8"), /projectFile: entry\.path \? pathKey\(entry\.path\) : null/);
});
