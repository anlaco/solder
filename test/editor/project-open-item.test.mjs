// Opening an OVI from the Project Explorer's tree: a double click on its row, or its menu's Open. LabVIEW opens the VI in
// the project, "main1.vi Front Panel on P1.lvproj/My Computer" (measured: labview-captures/reports/2026-11-17-project-explorer-s2.md Q4).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import * as Project from "../../core/model/project.mjs";
import { projectItemPath } from "../../editor/electron/project-paths.mjs";
import * as Edit from "../../editor/src/project-explorer/project-explorer-edit.mjs";
import * as State from "../../editor/src/project-explorer/project-explorer-state.mjs";
import { INV, RAIZ } from "../helpers.mjs";

const source = (file) => readFileSync(path.join(RAIZ, file), "utf8");

/** My Computer with sub/main.ovi, notes.txt and a new OVI not saved yet. */
function sampleWindow() {
  const project = Project.addFiles(Project.blankProject(), ["sub/main.ovi", "notes.txt"]).project;
  const state = State.fromProject(project, "P1.sdproj");
  return Edit.addNewOvi(state, State.targetKeyOf(state.project), "Untitled 2", "9");
}

const keyOfNamed = (state, name) => State.keyOfPlace([0, state.project.items[0].items.findIndex((item) => item.name === name)]);

test("Open and a double click open an OVI of the tree in the project", () => {
  const state = sampleWindow();
  assert.deepEqual(Edit.openRequestOf(state, keyOfNamed(state, "main.ovi")), { storedPath: "sub/main.ovi" });
  assert.deepEqual(Edit.openRequestOf(state, keyOfNamed(state, "Untitled 2")), { unsavedOvi: "9" }, "a new OVI brings its windows forward");
  assert.equal(Edit.openRequestOf(state, keyOfNamed(state, "notes.txt")), null, "a document's Open is not built");
  assert.equal(Edit.openRequestOf(state, State.targetKeyOf(state.project)), null, "My Computer opens nothing");
  assert.equal(Edit.openRequestOf(state, State.ROOT_KEY), null);
  // The stored path is relative to the project's folder; a project never saved stores absolute paths.
  assert.equal(projectItemPath("/home/u/P1.sdproj", "sub/main.ovi"), "/home/u/sub/main.ovi");
  assert.equal(projectItemPath("/home/u/P1.sdproj", "../other/a.ovi"), "/home/other/a.ovi");
  assert.equal(projectItemPath(null, "/home/u/a.ovi"), "/home/u/a.ovi");
  // The menu's Open is built and runs the same command; the document's stays greyed.
  assert.equal(State.CONTEXT_COMMANDS["context.project-explorer.ovi-item.open"], "openItem");
  assert.equal(INV.entrada("context.project-explorer.document-item.open").estado, "todo");
});

test("the page, the preload and the main process wire the open of a tree item", () => {
  const page = source("editor/src/project-explorer/project-explorer.mjs");
  // The second click of a double click opens the row; a `dblclick` listener never fires, the first click having repainted the row.
  assert.match(page, /clickControl\(event\.target, event\.detail\)/);
  assert.match(page, /if \(clickCount === DOUBLE_CLICK\) treeCommands\.openItem\(row\.dataset\.key\)/);
  assert.doesNotMatch(page, /addEventListener\("dblclick"/, "Chromium sends no dblclick to the repainted row");
  assert.match(source("editor/electron/preload.cjs"), /openItem: \(request\) => ipcRenderer\.send\("project:open-item", request\)/);
  assert.ok(source("editor/electron/project-manager.mjs").includes('"project:open-item"'));
  // The OVI opens in the project: its entry takes the project before its windows are made (the titles say "on P1.sdproj/My Computer").
  assert.match(source("editor/electron/main.mjs"), /function openPathIn\(filePath, project, owner\)/);
});
