// The Project Explorer window (DT-099 §6): its tree, its menu bar and toolbar in the measured order, its right-click menus
// and how a click changes it. Measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-17-project-explorer-s1.md and -s2.md). The state is pure and the view is a string, so
// none of it needs a browser or Electron.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as PolymorphicState from "../../editor/src/polymorphic-window/polymorphic-window-state.mjs";
import * as PolymorphicView from "../../editor/src/polymorphic-window/polymorphic-window-view.mjs";
import * as Project from "../../core/model/project.mjs";
import { PROJECT_WINDOW_SIZE, projectWindowTitle, untitledProjectName } from "../../editor/electron/project-window.mjs";
import * as State from "../../editor/src/project-explorer/project-explorer-state.mjs";
import * as View from "../../editor/src/project-explorer/project-explorer-view.mjs";
import { INV, RAIZ } from "../helpers.mjs";

const measure = (text) => text.length * 6;
const windowSize = { width: 374, height: 401 };
const draw = (state) => View.projectExplorerWindow(INV, state, measure, windowSize);
const blankState = () => State.fromProject(Project.blankProject(), "Untitled Project 2");

/** A project with a folder, two files and an auto-populating folder, in the order the file keeps them. */
function projectWithFiles() {
  let project = Project.blankProject();
  project = Project.addFiles(project, ["zeta.txt", "alpha.ovi"]).project;
  project = Project.addFiles(project, ["inner/b.ovi", "inner/A.txt"], "Folder").project;
  project = Project.addAutoPopulatingFolder(project, "auto");
  return Project.readProject(Project.writeProject(project));
}

/** The tree's rows as `[depth, label, expander]`, from the drawn page; the expander is "+", "−" or "". */
function drawnRows(html) {
  const rows = [...html.matchAll(/<div class="pe-row[^"]*" data-key="([^"]+)" data-kind="([^"]+)"[^>]*style="padding-left:(\d+)px">(.*?)<\/div>/g)];
  return rows.map(([, , , padding, body]) => {
    const expander = body.match(/data-expander="[^"]+"[^>]*>(.)<\/span>/)?.[1] ?? "";
    const label = body.match(/<span class="pe-label">(.*?)<\/span>/)[1];
    return [(Number(padding) - 4) / 16, label, expander];
  });
}
const selectedLabel = (html) => html.match(/<div class="pe-row seleccionada"[^>]*>.*?<span class="pe-label">(.*?)<\/span>/)?.[1];

test("the Project Explorer draws a blank project as LabVIEW does", () => {
  const state = blankState();
  const html = draw(state);
  // Measured: the tree opens fully expanded, My Computer selected, Dependencies and Build Specifications with no expander.
  assert.deepEqual(drawnRows(html), [
    [0, "Project: Untitled Project 2", "−"],
    [1, "My Computer", "−"],
    [2, "Dependencies", ""],
    [2, "Build Specifications", ""],
  ]);
  assert.equal(selectedLabel(html), "My Computer");
  assert.deepEqual([View.WINDOW_SIZE.width, View.WINDOW_SIZE.height], [374, 434]);
  assert.deepEqual(PROJECT_WINDOW_SIZE, { width: 374, height: 401 });
  // The tabs: Items is shown, Files is a hole that explains itself.
  assert.match(html, /<div class="pe-tab seleccionada" data-tab="items" data-id="window\.project-explorer\.items">Items<\/div>/);
  assert.match(html, /<div class="pe-tab hueco" data-tab="files" data-id="window\.project-explorer\.files">Files<\/div>/);
  assert.equal(INV.resolver("window.project-explorer.files").estado, "todo");
  // The title is the main process's: the star while the project was never saved, then the file's name (measured).
  assert.equal(projectWindowTitle({ name: untitledProjectName(2), modified: true }), "Untitled Project 2 * - Project Explorer");
  assert.equal(projectWindowTitle({ name: "P1.sdproj", modified: false }), "P1.sdproj - Project Explorer");
});

test("a project with folders and files shows the folders first, then the files, then the fixed items", () => {
  const html = draw(State.fromProject(projectWithFiles(), "P1.sdproj"));
  assert.deepEqual(
    drawnRows(html).map(([depth, label]) => `${depth} ${label}`),
    ["0 Project: P1.sdproj", "1 My Computer", "2 auto", "2 Folder", "3 A.txt", "3 b.ovi", "2 alpha.ovi", "2 zeta.txt", "2 Dependencies", "2 Build Specifications"],
    "folders by name, then files by name whatever the case, inside a folder too (s2 Q2)",
  );
  const kinds = [...html.matchAll(/data-kind="([^"]+)"/g)].map(([, kind]) => kind);
  assert.deepEqual(kinds, ["project", "my-computer", "auto-populating-folder", "folder", "document", "ovi", "ovi", "document", "dependencies", "build"]);
  // An auto-populating folder has no expander: its files are read from the disk, which the window does not do yet.
  assert.equal(drawnRows(html)[2][2], "");
  assert.equal(drawnRows(html)[3][2], "−");
});

test("a project opened from its file opens with Dependencies collapsed and a new one with everything expanded", () => {
  // Dependencies is computed when a project is open (DT-099 §4), so this one is given the callees it will have.
  const project = Project.blankProject();
  const target = Project.myComputer(project);
  const dependencies = target.items.find((item) => item.kind === Project.ITEM_KINDS.DEPENDENCIES);
  dependencies.items = [{ name: "callee.ovi", kind: Project.ITEM_KINDS.OVI }];
  const dependenciesKey = "project/0/0";
  assert.ok(State.fromProject(project, "x").expanded.includes(dependenciesKey), "a new project: everything expanded");
  const opened = State.fromProject(project, "x", { opened: true });
  assert.equal(opened.expanded.includes(dependenciesKey), false, "opened from its file: Dependencies collapsed (s1 Q5)");
  assert.deepEqual(opened.expanded, ["project", "project/0"], "the rest as a new one");
  assert.equal(State.visibleRows(opened).some((row) => row.label === "callee.ovi"), false);
  assert.equal(State.visibleRows(State.toggleExpanded(opened, dependenciesKey)).some((row) => row.label === "callee.ovi"), true);
});

test("clicking a row selects it and the + and − expand and collapse", () => {
  let state = State.fromProject(projectWithFiles(), "P1.sdproj");
  const rows = () => drawnRows(draw(state)).map(([, label]) => label);
  assert.equal(selectedLabel(draw(state)), "My Computer");
  state = State.select(state, "project/0/1");
  assert.equal(selectedLabel(draw(state)), "Folder");
  state = State.toggleExpanded(state, "project/0/1");
  assert.deepEqual(rows(), ["Project: P1.sdproj", "My Computer", "auto", "Folder", "alpha.ovi", "zeta.txt", "Dependencies", "Build Specifications"]);
  assert.equal(drawnRows(draw(state))[3][2], "+");
  // Collapsing My Computer hides the rest; expanding it shows them again, the folder still collapsed.
  state = State.toggleExpanded(state, "project/0");
  assert.deepEqual(rows(), ["Project: P1.sdproj", "My Computer"]);
  state = State.toggleExpanded(state, "project/0");
  assert.equal(rows().length, 8);
  // A row with no children has no expander, and a key that is not in the tree changes nothing.
  assert.equal(State.toggleExpanded(state, "project/0/0"), state);
  assert.equal(State.select(state, "project/9"), state);
});

test("the menu bar has LabVIEW's eight titles and the File rows run the window's commands", () => {
  const html = draw(blankState());
  const titles = [...html.matchAll(/<div class="menu[^"]*" data-id="window\.project-explorer\.menu\.(\w+)"/g)].map(([, name]) => name);
  assert.deepEqual(titles, ["file", "edit", "view", "project", "operate", "tools", "window", "help"]);
  const rowsOf = (menu) => INV.hijos(`window.project-explorer.menu.${menu}`).map((entry) => `${entry.separado ? "| " : ""}${entry.etiqueta}${entry.atajo ? ` ${entry.atajo}` : ""}`);
  // The rows as the s1 report lists them, with "|" before the one that starts a group; LabVIEW is Solder and a VI an OVI, as in the other windows.
  assert.deepEqual(rowsOf("file"), ["New OVI Ctrl+N", "New... ", "Open... Ctrl+O", "Close Ctrl+W", "Close All", "Close All (this Project)", "| Save Ctrl+S", "Save As...", "Save All Ctrl+Shift+S", "Save All (this Project)", "Save for Previous Version...", "Revert...", "| Create Project...", "Open Project...", "Save Project", "Close Project", "| Page Setup...", "Print...", "Print Window... Ctrl+P", "| OVI Properties Ctrl+I", "| Recent Projects", "Recent Files", "| Exit Ctrl+Q"].map((row) => row.trimEnd()));
  assert.deepEqual(rowsOf("edit"), ["Undo Ctrl+Z", "Redo Ctrl+Shift+Z", "| Find Project Items... Ctrl+F", "Show Search Results Ctrl+Shift+F", "Find Next", "Find Previous", "| Cut Ctrl+X", "Copy Ctrl+C", "Paste Ctrl+V", "Remove From Project"]);
  assert.deepEqual(rowsOf("view"), ["Controls Palette", "Functions Palette", "Tools Palette", "Quick Drop Ctrl+Space", "| Debug Window Ctrl+D", "Event Inspector Window", "Error List Ctrl+L", "Load and Save Warning List", "Externally Changed Files List", "Manage Trusted Files...", "| OVI Hierarchy", "Solder Class Hierarchy", "Browse Relationships", "Bookmark Manager", "This OVI in Project Ctrl+Shift+E", "| Zoom In Ctrl++", "Zoom Out Ctrl+-", "Actual Size Ctrl+0", "Toggle Zoom F2", "| Class Browser Ctrl+Shift+B", ".NET Assemblies in Memory", "ActiveX Control Property Browser", "Getting Started Window...", "Navigation Window", "Toolbars"]);
  assert.deepEqual(rowsOf("project"), ["Create Project...", "Open Project...", "Save Project", "Close Project", "| Add To Project", "| Package Dependencies...", "| Filter View", "Show Item Paths", "File Information", "Resolve Conflicts...", "| Project Environment Settings...", "| Properties"]);
  assert.deepEqual(rowsOf("operate"), ["Connect to Remote Panel...", "Debug Application or Shared Library..."]);
  assert.deepEqual(rowsOf("tools"), ["Measurement & Automation Explorer...", "Instrumentation", "| Real-Time Module", "| Compare", "Merge", "Profile", "Security", "User Name...", "| Build Application (EXE) from OVI...", "Source Control", "OVI Analyzer", "| LLB Manager...", "Import", "Shared Variable", "Distributed System Manager", "| Create Data Link...", "Find OVIs on Disk...", "Prepare Example OVIs for NI Example Finder...", "Remote Panel Connection Manager...", "Web Publishing Tool...", "Control and Simulation", "Find Solder Add-ons...", "Hobbyist", "UTF-8 Migration Tool...", "| Advanced", "Options..."]);
  assert.deepEqual(rowsOf("window"), ["Show Other Project View Ctrl+E", "Show Project", "| Tile Left and Right Ctrl+T", "Tile Up and Down", "Full Size Ctrl+/", "| All Windows... Ctrl+Shift+W"]);
  assert.deepEqual(rowsOf("help"), ["Show Context Help Ctrl+H", "Lock Context Help Ctrl+Shift+L", "| Solder Help... Ctrl+?", "Explain Error...", "Help for This OVI", "| Find Examples...", "Find Instrument Drivers...", "Web Resources...", "| Hobbyist", "| Activate Solder Components...", "Activate Add-ons...", "Check for Updates", "Customer Experience Improvement Program...", "| Patents...", "About Solder..."]);
  // What is built: the rows of File that open, create, save or close windows and projects; the rest is a hole with its reason.
  const built = INV.hijos("window.project-explorer.menu.file").filter((entry) => entry.estado === "built").map((entry) => State.MENU_COMMANDS[entry.id.split(".").pop()]);
  assert.deepEqual(built, ["newOvi", "newDialog", "open", "close", "createProject", "openProject", "saveProject", "close", "exit"]);
  assert.match(INV.explicacion(INV.entrada("window.project-explorer.menu.file.save")).solder, /Missing/);
});

test("an open menu shows its submenu arrows, the default of Arrange By ticked, and opens submenus under the mouse", () => {
  let state = blankState();
  state = State.openContextMenu(state, INV, "project/0", { x: 40, y: 60 });
  assert.equal(state.menuBarra.id, "context.project-explorer.my-computer");
  let html = draw(state);
  assert.match(html, /data-id="context\.project-explorer\.my-computer\.add"[^>]*>[^]*?flecha-menu/, "Add ▸ has an arrow");
  assert.equal(html.includes('data-id="context.project-explorer.my-computer.new.vi"'), false, "a submenu is drawn only while open");
  state = State.hoverMenuRow(state, INV, "context.project-explorer.my-computer.new");
  html = draw(state);
  assert.ok(html.includes('data-id="context.project-explorer.my-computer.new.virtual-folder"'));
  state = State.hoverMenuRow(state, INV, "context.project-explorer.my-computer.new.vi");
  assert.equal(state.menuBarra.abierto, "context.project-explorer.my-computer.new", "a row inside the submenu keeps it open");
  state = State.hoverMenuRow(state, INV, "context.project-explorer.my-computer.trace-execution");
  assert.equal(state.menuBarra.abierto, null, "another row of the menu closes it");
  state = State.hoverMenuRow(state, INV, "context.project-explorer.my-computer.arrange-by");
  assert.match(draw(state), /item-menu[^"]* marcado[^"]*" data-id="context\.project-explorer\.my-computer\.arrange-by\.name"/);
  // The menus of the bar open the same way, under their title.
  const bar = State.hoverMenuRow({ ...blankState(), menuBarra: { id: "window.project-explorer.menu.file", x: 0, y: 20, abierto: null } }, INV, "window.project-explorer.menu.file.recent-files");
  assert.equal(bar.menuBarra.abierto, null, "Recent Files has no declared rows yet, so it opens nothing");
});

test("the toolbar has LabVIEW's buttons in the measured order, each with its tooltip, greyed as measured or because it is not built", () => {
  const html = draw(blankState());
  const buttons = [...html.matchAll(/<div class="pe-button([^"]*)" data-id="window\.project-explorer\.toolbar\.([\w.-]+)" title="([^"]+)"/g)].map(([, classes, name, title]) => ({ name, title, classes }));
  assert.deepEqual(buttons.map((button) => button.title), ["New", "Open", "Save All (this Project)", "Cut", "Copy", "Paste", "Remove From Project", "Open Project", "Save Project", "Filter Project View", "Project Properties", "Resolve Conflicts...", "Run Unit Tests", "Unit Test Framework Results", "Build Selected"]);
  // Groups of the toolbar, as the separators fall in the capture: the inventory marks the first button of each group.
  const groupStarts = buttons.filter((button) => INV.entrada(`window.project-explorer.toolbar.${button.name}`).separado).map((button) => button.title);
  assert.deepEqual(groupStarts, ["Cut", "Open Project", "Filter Project View", "Run Unit Tests", "Build Selected"]);
  assert.equal(html.split('class="pe-separator"').length - 1, 5);
  // Greyed because of the selection (My Computer: nothing to cut, copy or remove, nothing copied, no conflicts); every other one is a hole.
  const disabled = buttons.filter((button) => button.classes.includes("desactivado")).map((button) => button.title);
  assert.deepEqual(disabled, ["Cut", "Copy", "Paste", "Remove From Project", "Resolve Conflicts..."]);
  // Open Project and Save Project are built; every other button is a hole.
  assert.deepEqual(buttons.filter((button) => !button.classes.includes("hueco")).map((button) => button.title), ["Open Project", "Save Project"]);
  // With a file selected, Cut, Copy and Remove From Project are not greyed by the selection (they are still not built).
  const onFile = State.select(State.fromProject(projectWithFiles(), "P1.sdproj"), "project/0/3");
  assert.deepEqual([...State.disabledButtons(onFile)].sort(), ["paste", "resolve-conflicts"]);
  // Every button has an icon of its own.
  const icons = [...html.matchAll(/<div class="pe-button[^"]*" [^>]*>(<svg.*?<\/svg>)<\/div>/g)].map(([, icon]) => icon);
  assert.equal(new Set(icons).size, 15);
});

test("the right-click menus of the tree are declared and Expand All and Collapse All work", () => {
  const labels = (kind) => INV.hijos(`context.project-explorer.${kind}`).map((entry) => `${entry.separado ? "| " : ""}${entry.etiqueta}${entry.atajo ? ` ${entry.atajo}` : ""}`);
  // The rows of s2 Q1, with "|" before the one that starts a group.
  assert.deepEqual(labels("project"), ["New", "| Explore...", "Show in Files View Ctrl+E", "| Save", "Save As...", "Save All (this Project)", "Mass Compile...", "| View", "Find Items with No Callers", "Find Missing Items", "Find Items Incorrectly Claimed by a Library", "| Find Project Items...", "| Arrange By", "Expand All", "Collapse All", "| Rename... F2", "| Properties"]);
  assert.deepEqual(labels("my-computer"), ["New", "Add", "| Trace Execution...", "Export", "Import", "| Find Project Items...", "| Arrange By", "Expand All", "Collapse All", "| Override OVI Properties to Enable Debugging", "Project Environment Settings...", "| Properties"]);
  assert.deepEqual(labels("ovi-item"), ["Open", "Explore...", "Show in Files View Ctrl+E", "| Print...", "| Run", "| Find", "| Save", "Save As...", "| Unit Tests", "| Analyze OVIs...", "| Arrange By", "| Remove from Project", "Rename... F2", "Replace with...", "| Properties"]);
  assert.deepEqual(labels("document-item"), ["Open", "Explore...", "Show in Files View Ctrl+E", "| Print...", "| Find", "| Remove from Project", "| Properties"]);
  assert.deepEqual(labels("dependencies"), ["Refresh", "| Find Project Items...", "| Arrange By", "Expand All", "Collapse All", "| Help..."]);
  assert.deepEqual(labels("build-specifications"), ["New", "| Arrange By", "| Help..."]);
  const under = (menu, row) => INV.hijos(`context.project-explorer.${menu}.${row}`).map((entry) => `${entry.separado ? "| " : ""}${entry.etiqueta}`);
  assert.deepEqual(under("my-computer", "new"), ["OVI", "Virtual Folder", "| Type Definition", "Library", "Class", "Interface", "Actor", "XControl", "Variable", "Web Service", "| NI-DAQmx Task", "NI-DAQmx Channel", "NI-DAQmx Scale", "Package Dependencies", "Unit Test", "Test Vectors", "| New..."]);
  assert.deepEqual(under("my-computer", "add"), ["File...", "Folder (Snapshot)...", "Folder (Auto-populating)...", "Hyperlink..."]);
  assert.deepEqual(under("my-computer", "arrange-by"), ["Name", "Type", "Path", "Custom"]);
  assert.deepEqual(under("build-specifications", "new"), ["Application (EXE)", "Installer", ".NET Framework Assembly", "Package", "Packed Library", "Shared Library (DLL)", "Source Distribution", "Zip File"]);

  // Right-click opens the menu of the row's kind and selects it; a virtual folder's menu was not measured, so it only selects.
  let state = State.fromProject(projectWithFiles(), "P1.sdproj");
  const kindsMenus = { "project": "project", "project/0": "my-computer", "project/0/2": "ovi-item", "project/0/3": "document-item", "project/0/4": "dependencies", "project/0/5": "build-specifications" };
  assert.deepEqual(State.visibleRows(state).map((row) => row.key).slice(0, 3), ["project", "project/0", "project/0/0"]);
  for (const [key, menu] of Object.entries(kindsMenus)) {
    const opened = State.openContextMenu(state, INV, key, { x: 10, y: 10 });
    assert.equal(opened.selected, key);
    assert.equal(opened.menuBarra?.id, `context.project-explorer.${menu}`, key);
  }
  const onFolder = State.openContextMenu(state, INV, "project/0/1", { x: 10, y: 10 });
  assert.deepEqual([onFolder.selected, onFolder.menuBarra], ["project/0/1", null]);

  // Collapse All on a row collapses it and everything under it; Expand All opens them again, and a sibling is left alone.
  state = State.select(state, "project/0");
  const collapsed = State.runContextCommand(state, "context.project-explorer.my-computer.collapse-all");
  assert.deepEqual(collapsed.expanded, ["project"]);
  assert.equal(collapsed.menuBarra, null);
  const expanded = State.runContextCommand(collapsed, "context.project-explorer.my-computer.expand-all");
  assert.deepEqual([...expanded.expanded].sort(), ["project", "project/0", "project/0/1"]);
  const onlyFolder = State.runContextCommand(State.select(collapsed, "project/0/1"), "context.project-explorer.my-computer.expand-all");
  assert.deepEqual(onlyFolder.expanded, ["project", "project/0/1"], "the row's own subtree, nothing else");
  // The other rows are holes that explain themselves: none is built.
  assert.equal(INV.resolver("context.project-explorer.my-computer.properties").estado, "todo");
  assert.equal(INV.resolver("context.project-explorer.my-computer.expand-all").estado, "built");
});

test("every inventory id the window draws exists", () => {
  const states = [blankState(), State.fromProject(projectWithFiles(), "P1.sdproj")];
  for (const state of states) {
    const withMenu = (id) => draw({ ...state, menuBarra: { id, x: 10, y: 30, abierto: null } });
    const pages = [draw(state), ...INV.hijos("window.project-explorer.menu").map((entry) => withMenu(entry.id))];
    for (const html of pages) {
      const ids = [...html.matchAll(/data-(?:id|row-id)="([^"]+)"/g)].map(([, id]) => id);
      assert.ok(ids.length > 20);
      for (const id of ids) assert.ok(INV.entrada(id), `${id} is drawn and is not in the inventory`);
    }
  }
  assert.ok(INV.entrada("context.project-explorer.project"));
});

/** The `top` of the first menu drawn, and whether it scrolls. */
function firstMenu(html) {
  const [, top] = html.match(/<div class="menu-contextual[^"]*"[^>]*style="left:[\d.]+px;top:(-?[\d.]+)px/);
  return { top: Number(top), scrolls: html.includes("data-scroll-max") };
}

test("a menu taller than the window keeps its top under the menu bar and scrolls", () => {
  const bar = View.MENU_BAR_HEIGHT;
  const tall = (id, y = bar) => ({ ...blankState(), menuBarra: { id, x: 0, y, abierto: null } });
  // File, View and Tools are taller than the 401 px page; they started at 0, under the bar, which hid their first rows.
  for (const menu of ["file", "view", "tools"]) {
    const placed = firstMenu(draw(tall(`window.project-explorer.menu.${menu}`)));
    assert.equal(placed.top, bar, `${menu} starts at the bottom of the bar`);
    assert.ok(placed.scrolls, `${menu} scrolls`);
  }
  // The Project row's right-click menu, opened low in the window, is moved up but never above the bar.
  const context = firstMenu(draw(tall("context.project-explorer.project", 380)));
  assert.ok(context.top >= bar, "the context menu stays under the bar");
  // A menu that fits is unchanged, and without a top limit (the OVI windows) a tall one still starts at 0.
  assert.equal(firstMenu(draw(tall("window.project-explorer.menu.operate"))).top, bar);
  const withoutLimit = D.menuContextual(INV, { raiz: "window.project-explorer.menu.file", x: 0, y: bar, abierto: null }, new Set(), measure, {}, { width: 374, height: 401 });
  assert.equal(firstMenu(withoutLimit).top, 0);
  // The Polymorphic OVI window passes the same limit.
  const polymorphic = PolymorphicView.polymorphicWindow(INV, { ...PolymorphicState.emptyState(), menuBarra: { id: "window.polymorphic-ovi.menu.file", x: 0, y: bar, abierto: null } }, measure, { width: 482, height: 358 });
  assert.equal(firstMenu(polymorphic).top, bar);
});

test("the menu bar titles are drawn as done, not as holes", () => {
  const html = draw(blankState());
  const titles = [...html.matchAll(/<div class="menu([^"]*)" data-id="window\.project-explorer\.menu\.(\w+)"/g)];
  assert.equal(titles.length, 8);
  for (const [, classes, name] of titles) assert.equal(classes.includes("hueco"), false, `${name} is not a hole`);
  assert.equal(INV.entrada("window.project-explorer.menu.tools").estado, "built");
  // Their rows keep their own state: Tools ▸ Options... is still not built.
  assert.equal(INV.resolver("window.project-explorer.menu.tools.options").estado, "todo");
});

test("the Project Explorer runs the project commands from its menus, toolbar and the root's right-click menu", () => {
  const rowsBuilt = (menu) => INV.hijos(`window.project-explorer.menu.${menu}`).filter((entry) => entry.estado === "built" && State.MENU_COMMANDS[entry.id.split(".").pop()]).map((entry) => `${entry.etiqueta} -> ${State.MENU_COMMANDS[entry.id.split(".").pop()]}`);
  assert.deepEqual(rowsBuilt("project"), ["Create Project... -> createProject", "Open Project... -> openProject", "Save Project -> saveProject", "Close Project -> close"]);
  assert.deepEqual(rowsBuilt("file").slice(-5, -1), ["Create Project... -> createProject", "Open Project... -> openProject", "Save Project -> saveProject", "Close Project -> close"]);
  // The toolbar's Open Project and Save Project, and Save in the right-click menu of the root, run the same commands.
  assert.deepEqual(State.TOOLBAR_COMMANDS, { "open-project": "openProject", "save-project": "saveProject" });
  for (const name of Object.keys(State.TOOLBAR_COMMANDS)) assert.equal(INV.entrada(`window.project-explorer.toolbar.project.${name}`).estado, "built");
  assert.deepEqual(State.CONTEXT_COMMANDS, { "context.project-explorer.project.save": "saveProject" });
  assert.equal(INV.entrada("context.project-explorer.project.save").estado, "built");
  assert.equal(INV.entrada("context.project-explorer.project.save-as").estado, "todo", "Save As... of the root is not built");
  // The page runs each command through the main process, and the root of the tree takes the name a Save gives.
  const page = readFileSync(path.join(RAIZ, "editor/src/project-explorer/project-explorer.mjs"), "utf8");
  for (const call of ["solder?.project.create()", "solder?.project.open()", "solder?.project.save()", "solder?.project.close()", "solder?.project.onRenamed("]) assert.ok(page.includes(call), call);
  assert.equal(State.visibleRows(State.rename(blankState(), "P1.sdproj"))[0].label, "Project: P1.sdproj");
  // The other holes of File and Project keep their reason: Save As... and Add To Project are still waiting for the project's flows.
  assert.equal(INV.entrada("window.project-explorer.menu.file.save-as").necesita, "flujos-del-proyecto");
});
