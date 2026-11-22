// Creating, opening, saving and closing projects (DT-099 §6): the numbering of untitled projects, the star in the title, the
// dialogs' options, the close question, the Window menu's list and the Open Items condition. Measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-17-project-explorer-s1.md Q3, -s2.md Q6, 2026-11-18-project-explorer-s3.md). All of it is pure:
// the registry and the dialogs' options are tested without Electron.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { PROJECT_EXTENSION, blankProject, readProject } from "../../core/model/project.mjs";
import { EXIT_ANSWERS } from "../../editor/electron/exit-flow.mjs";
import { CLOSE_ALL_BUTTONS, CLOSE_ANSWERS, CLOSE_BUTTONS, confirmCloseAll } from "../../editor/electron/close-flow.mjs";
import { PROJECT_FILTERS, closeProjectDialogText, hasOVIsOutsideProjects, openProjectDialog, projectSavePathFor, saveProjectDialog } from "../../editor/electron/project-dialogs.mjs";
import { createProjectRegistry, isModified, projectBody, projectFileText, projectName, recordChange, recordSave } from "../../editor/electron/project-registry.mjs";
import { projectWindowTitle } from "../../editor/electron/project-window.mjs";
import { confirmExit } from "../../editor/electron/exit-flow.mjs";
import { windowListRows } from "../../editor/electron/project-window-list.mjs";
import * as State from "../../editor/src/project-explorer/project-explorer-state.mjs";
import * as View from "../../editor/src/project-explorer/project-explorer-view.mjs";
import { windowMenuVariant } from "../../editor/src/project-explorer/window-menu.mjs";
import { INV, RAIZ } from "../helpers.mjs";

const blankText = () => projectBody(blankProject());
const titleOf = (entry) => projectWindowTitle({ name: projectName(entry), modified: isModified(entry) });

test("untitled projects are numbered from 1 and a closed number is never used again", () => {
  const registry = createProjectRegistry();
  const names = [1, 2, 3].map(() => projectName(registry.open({ text: blankText() }).entry));
  assert.deepEqual(names, ["Untitled Project 1", "Untitled Project 2", "Untitled Project 3"]);
  // Measured (s3 Q1): with 3 closed the next is 4.
  const [, , third] = registry.list();
  registry.close(third.id);
  assert.equal(projectName(registry.open({ text: blankText() }).entry), "Untitled Project 4");
  // Every project has its own id, and a project opened from a file takes no untitled number.
  const saved = registry.open({ path: "/work/P1.sdproj", text: blankText() }).entry;
  assert.equal(projectName(saved), "P1.sdproj");
  assert.equal(projectName(registry.open({ text: blankText() }).entry), "Untitled Project 5");
  assert.equal(new Set(registry.list().map((entry) => entry.id)).size, registry.list().length);
});

test("a project's title has the star while its text differs from the saved one", () => {
  const registry = createProjectRegistry();
  const fresh = registry.open({ text: blankText() }).entry;
  // Measured: a project that was never saved has the star ("Untitled Project 1 * - Project Explorer").
  assert.equal(titleOf(fresh), "Untitled Project 1 * - Project Explorer");
  recordSave(fresh, "/work/P1.sdproj");
  assert.equal(titleOf(fresh), "P1.sdproj - Project Explorer");
  assert.equal(fresh.untitledNumber, null);
  // A change makes the text differ; going back to the saved text takes the star away.
  const edited = projectBody({ ...blankProject(), items: [...blankProject().items, { name: "extra", kind: "document" }] });
  recordChange(fresh, edited);
  assert.equal(titleOf(fresh), "P1.sdproj * - Project Explorer");
  recordChange(fresh, blankText());
  assert.equal(isModified(fresh), false);
  // A project opened from its file has no star; the window's place is never a change.
  const opened = registry.open({ path: "/work/P2.sdproj", text: projectBody(readProject(projectFileText(blankText(), { x: 5, y: 6, width: 300, height: 400 }))) }).entry;
  assert.equal(titleOf(opened), "P2.sdproj - Project Explorer");
});

test("Save Project proposes Name the Project with the untitled name and the sdproj filter, and writes the window's place", () => {
  const options = saveProjectDialog({ untitledNumber: 2, folder: "/work" });
  assert.equal(options.title, "Name the Project (Untitled Project 2)");
  assert.equal(options.defaultPath, path.join("/work", "Untitled Project 2"));
  assert.deepEqual(options.filters, [{ name: "Projects (*.sdproj)", extensions: ["sdproj"] }]);
  // The extension is added when the name has none (as the OVI's Save As does) and kept when it has.
  assert.equal(projectSavePathFor("/work/P1"), "/work/P1.sdproj");
  assert.equal(projectSavePathFor("/work/P1.sdproj.sdproj"), "/work/P1.sdproj", "the extension the dialog adds again");
  assert.equal(projectSavePathFor("/work/P1.sdproj"), "/work/P1.sdproj");
  assert.equal(PROJECT_EXTENSION, ".sdproj");
  // What is written is the project with the window's current place and size.
  const place = { x: 41, y: 32, width: 374, height: 434 };
  const written = projectFileText(blankText(), place);
  assert.deepEqual(readProject(written).window, place);
  assert.equal(readProject(written).items.length, 1);
  // Saving again without edits writes the same text (LabVIEW writes the same bytes, s1 Q5), and the place is not a change.
  assert.equal(projectFileText(blankText(), place), written);
  assert.equal(projectBody(readProject(written)), blankText());
});

test("Open Project asks for a sdproj in the last folder and a project already open is the same project", () => {
  const options = openProjectDialog("/work");
  assert.equal(options.title, "Select the Project to Open");
  assert.equal(options.defaultPath, "/work");
  assert.deepEqual(options.filters, PROJECT_FILTERS);
  assert.deepEqual(options.properties, ["openFile"]);
  // Opening a path that is open gives that project back, to bring its window forward; another path is another project.
  const registry = createProjectRegistry();
  const place = { x: 10, y: 20, width: 300, height: 400 };
  const first = registry.open({ path: "/work/P1.sdproj", text: blankText(), place });
  assert.equal(first.alreadyOpen, false);
  assert.deepEqual(first.entry.place, place, "the window opens where the file kept it");
  const again = registry.open({ path: "/work/P1.sdproj", text: blankText() });
  assert.equal(again.alreadyOpen, true);
  assert.equal(again.entry, first.entry);
  assert.equal(registry.open({ path: "/work/P2.sdproj", text: blankText() }).alreadyOpen, false);
  assert.equal(registry.list().length, 2);
  // File ▸ Open... accepts a .sdproj and the main process routes it to the project (s3 Q3).
  const main = readFileSync(path.join(RAIZ, "editor/electron/main.mjs"), "utf8");
  assert.match(main, /if \(isProjectPath\(filePath\)\) return projects\.openPath\(filePath, owner\)/);
  assert.match(main, /const OPEN_FILTERS = \[\{ name: "All Solder files", extensions: \[\.\.\.OVI_EXTENSIONS, POLYMORPHIC_EXTENSION, PROJECT_EXTENSION, CONTROL_FILE_EXTENSION\]/);
});

test("closing a project asks only when it has changes, with the text and buttons of LabVIEW's question", async () => {
  const registry = createProjectRegistry();
  const saved = registry.open({ path: "/work/P1.sdproj", text: blankText() }).entry;
  const fresh = registry.open({ text: blankText() }).entry;
  assert.deepEqual(closeProjectDialogText("P1.sdproj"), {
    title: "Save changes? (Close Project)",
    message: "P1.sdproj has unsaved changes.",
    detail: "P1.sdproj is about to leave memory. Its unsaved changes will be lost.",
    checkboxLabel: null,
  });
  assert.deepEqual(CLOSE_BUTTONS, ["Save", "Don't Save", "Cancel"]);
  const asked = [];
  const flow = (answer) => ({ isDirty: isModified, ask: async (entry) => (asked.push(projectName(entry)), answer), save: async (entry) => (recordSave(entry, "/work/saved.sdproj"), true) });
  // No changes: closes silently. Changes: asks; Cancel keeps it, Don't Save lets it go, Save saves first.
  assert.equal(await confirmExit([saved], flow(EXIT_ANSWERS.cancel)), true);
  assert.deepEqual(asked, []);
  assert.equal(await confirmExit([fresh], flow(EXIT_ANSWERS.cancel)), false);
  assert.equal(await confirmExit([fresh], flow(EXIT_ANSWERS.dontSave)), true);
  assert.deepEqual(asked, ["Untitled Project 1", "Untitled Project 1"]);
  assert.equal(await confirmExit([fresh], flow(EXIT_ANSWERS.save)), true);
  assert.equal(isModified(fresh), false);
  assert.equal(await confirmExit([fresh], flow(EXIT_ANSWERS.cancel)), true, "saved now, so it no longer asks");
  // A Save As that is cancelled keeps the project open.
  const another = registry.open({ text: blankText() }).entry;
  assert.equal(await confirmExit([another], { ...flow(EXIT_ANSWERS.save), save: async () => false }), false);
});

test("Close Project asks about its OVIs first and the project last, and one answer can serve the rest", async () => {
  // Measured (s3 "Extras"): an OVI of the project first, "Untitled 1 has unsaved changes.", with the box for the remaining 2.
  assert.deepEqual(closeProjectDialogText("Untitled 1", 2), {
    title: "Save changes? (Close Project)",
    message: "Untitled 1 has unsaved changes.",
    detail: "Untitled 1 is about to leave memory. Its unsaved changes will be lost.",
    checkboxLabel: "Apply same action to the remaining 2 affected items",
  });
  assert.deepEqual(CLOSE_ALL_BUTTONS, ["Save - All", "Don't Save - All", "Cancel"]);
  const items = ["Untitled 2", "Untitled 1", "clean.ovi", "P1.sdproj"].map((name) => ({ name, dirty: name !== "clean.ovi" }));
  const asked = [];
  const saved = [];
  const hooks = (reply) => ({ isDirty: (item) => item.dirty, ask: async (item, remaining) => (asked.push([item.name, remaining]), reply), save: async (item) => (saved.push(item.name), true) });
  assert.equal(await confirmCloseAll(items, hooks({ answer: CLOSE_ANSWERS.save, applyToRemaining: true })), true);
  assert.deepEqual(asked, [["Untitled 2", 2]], "Save - All answers for the other OVI and the project");
  assert.deepEqual(saved, ["Untitled 2", "Untitled 1", "P1.sdproj"], "the project is saved after its OVIs");
});

test("Close Project closes the project's OVIs before its own window, and the last OVI does not bring Getting Started back while a project is open", () => {
  const main = readFileSync(path.join(RAIZ, "editor/electron/main.mjs"), "utf8");
  const manager = readFileSync(path.join(RAIZ, "editor/electron/project-manager.mjs"), "utf8");
  assert.match(manager, /return \[\.\.\.host\.projectOVIs\(entry\.id\), project\];/);
  assert.match(manager, /for \(const item of items\) await item\.close\?\.\(\);\n    closing\.add\(entry\.id\);\n    windowOf\(entry\)\.close\(\);/);
  assert.match(main, /function projectOVIs\(projectId\)[\s\S]*open\.entry\.project === projectId[\s\S]*closeAllOrder\(/);
  assert.match(main, /panel\.on\("closed"[\s\S]*if \(anyDocumentOpen\(\)\) return;\n[\s\S]*showGettingStarted\(\)/);
  // Found under Xvfb (reports/2026-11-22-project-stage-d-editor-try.md): the page's last messages arrive after its entry is gone.
  assert.match(manager, /"project:changed", \(event, text\) => \{\n      const entry = entryOf\(event\);\n[^\n]*\n      if \(!entry\) return;/);
  assert.match(readFileSync(path.join(RAIZ, "editor/electron/project-disk-requests.mjs"), "utf8"), /const entry = entryOf\(event\);\n[^\n]*\n    if \(!entry\) return null;/);
});

test("the Window menu lists the OVI windows, then the Project Explorers most recently activated first, numbered continuously", () => {
  const oviWindows = [
    { key: "ovi:2:front-panel", title: "Untitled 2 Front Panel" },
    { key: "ovi:2:block-diagram", title: "Untitled 2 Block Diagram" },
    { key: "ovi:1:front-panel", title: "Untitled 1 Front Panel" },
  ];
  const explorers = [
    { key: "project:1", title: "P1.sdproj - Project Explorer", activation: 3 },
    { key: "project:2", title: "Untitled Project 2 * - Project Explorer", activation: 9 },
    { key: "project:3", title: "Untitled Project 3 * - Project Explorer", activation: 5 },
  ];
  const rows = windowListRows({ oviWindows, explorers });
  assert.deepEqual(rows.map((row) => row.label), [
    "1 Untitled 2 Front Panel", "2 Untitled 2 Block Diagram", "3 Untitled 1 Front Panel",
    "4 Untitled Project 2 * - Project Explorer", "5 Untitled Project 3 * - Project Explorer", "6 P1.sdproj - Project Explorer",
  ]);
  assert.deepEqual(rows.map((row) => row.key).slice(3), ["project:2", "project:3", "project:1"], "the most recently activated first");
  assert.deepEqual(rows.filter((row) => row.startsGroup).map((row) => row.number), [1, 4], "a separator before each group");
  // Without OVI windows the explorers start the list, and without anything the menu keeps only its own rows.
  assert.deepEqual(windowListRows({ oviWindows: [], explorers }).map((row) => row.number), [1, 2, 3]);
  assert.deepEqual(windowListRows({ oviWindows: [], explorers: [] }), []);

  // The menu draws them after Full Size and before All Windows..., each a built row with a separator before its group.
  const variant = windowMenuVariant(INV, rows);
  const labels = variant.submenus.get("window.project-explorer.menu.window").map((entry) => entry.etiqueta);
  assert.deepEqual(labels, ["Show Other Project View", "Show Project", "Tile Left and Right", "Tile Up and Down", "Full Size", ...rows.map((row) => row.label), "All Windows..."]);
  const state = { ...State.fromProject(blankProject(), "Untitled Project 2"), windowRows: rows, menuBarra: { id: "window.project-explorer.menu.window", x: 0, y: 20, abierto: null } };
  const html = View.projectExplorerWindow(INV, state, (text) => text.length * 6, { width: 374, height: 401 });
  assert.equal(html.split("separador-menu").length - 1, 4, "before Tile Left and Right, each group of windows and All Windows...");
  for (const row of rows) assert.ok(html.includes(`>${row.label}</span>`), row.label);
  assert.equal(View.projectExplorerWindow(INV, { ...state, windowRows: [] }, (text) => text.length * 6, { width: 374, height: 401 }).includes("Project Explorer</span>"), false, "no windows listed: only the fixed rows");
});

test("the Open Items question is asked only when an OVI is open outside a project", () => {
  assert.equal(hasOVIsOutsideProjects([]), false, "no OVI open");
  assert.equal(hasOVIsOutsideProjects([{ id: "1" }]), true, "an OVI open outside any project");
  assert.equal(hasOVIsOutsideProjects([{ id: "1", project: "p" }]), false, "only OVIs of a project are open (s3 Q1: not shown then)");
  assert.equal(hasOVIsOutsideProjects([{ id: "1", project: "p" }, { id: "2" }]), true);
});

test("the main process wires the project commands and no longer needs the development switch", () => {
  const main = readFileSync(path.join(RAIZ, "editor/electron/main.mjs"), "utf8");
  const manager = readFileSync(path.join(RAIZ, "editor/electron/project-manager.mjs"), "utf8");
  assert.equal(main.includes("SOLDER_PROJECT"), false, "File ▸ Create Project... opens a project now");
  assert.match(main, /projects\.registerRequests\(\)/);
  // Exit asks about the projects with changes too, after the OVIs.
  assert.match(main, /await projects\.confirmQuit\(owner\)/);
  // After the last project closes the Getting Started window is minimized, not shown (s3 Q4); the last OVI still shows it.
  assert.match(main, /function afterLastProjectClosed\(\)[\s\S]*window\.minimize\(\)/);
  for (const channel of ["project:init", "project:close", "project:save", "project:create", "project:open", "project:window-list", "project:activate-window", "create-project:init", "create-project:finish", "create-project:cancel"]) {
    assert.ok(manager.includes(`"${channel}"`), channel);
  }
  assert.match(manager, /"close", \(event\) => \{[\s\S]*closeProject\(entry\)/, "the close box asks like Close Project");
});
