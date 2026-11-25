// New ▸ Type Definition in a project and the controls that join it (DT-107): measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-25-project-new-type-definition.md). The new control is an item "Control N" at once,
// selected, in the row that holds items or in My Computer; saving it turns the item into its file and closing it unsaved
// takes it out, as a new OVI's. Its row, and any `.octl`'s, shows the type definition icon.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as Project from "../../core/model/project.mjs";
import { newControlItem, unsavedOviIds, withNewOviSaved } from "../../core/model/project-new-ovis.mjs";
import { projectBody } from "../../editor/electron/project-registry.mjs";
import * as Edit from "../../editor/src/project-explorer/project-explorer-edit.mjs";
import { ROW_ICONS } from "../../editor/src/project-explorer/disk-rows.mjs";
import * as State from "../../editor/src/project-explorer/project-explorer-state.mjs";
import { INV } from "../helpers.mjs";

/** A project with first.ovi and a virtual folder under My Computer, as the window shows it. */
function windowWithFolder() {
  let project = Project.addFiles(Project.blankProject(), ["first.ovi"]).project;
  project = Project.addVirtualFolder(project, "New Folder");
  return State.fromProject(project, "NewControl.sdproj");
}

const target = (state) => state.project.items[0];
const names = (items) => items.map((item) => item.name);
const rowOf = (state, key) => State.visibleRows(state).find((row) => row.key === key);

test("New Type Definition puts a Control item with the type definition icon in the row or in My Computer", () => {
  const start = windowWithFolder();
  const myComputer = State.targetKeyOf(start.project);
  const atTop = Edit.addNewControl(start, myComputer, "Control 1", "7");
  assert.deepEqual(names(target(atTop).items), ["New Folder", "Control 1", "first.ovi", "Dependencies", "Build Specifications"]);
  assert.deepEqual(target(atTop).items[1], { name: "Control 1", kind: "ovi", unsavedOvi: "7", unsavedControl: true });
  assert.equal(rowOf(atTop, atTop.selected).label, "Control 1", "the new item is selected");
  assert.equal(rowOf(atTop, atTop.selected).icon, ROW_ICONS.TYPE_DEFINITION, "with the type definition's icon");
  // A virtual folder's New ▸ Type Definition puts it inside the folder and opens it (Q5).
  const folderKey = `${myComputer}/0`;
  const inFolder = Edit.addNewControl(start, folderKey, "Control 2", "8");
  assert.deepEqual(names(target(inFolder).items[0].items), ["Control 2"]);
  assert.ok(inFolder.expanded.includes(folderKey));
  // Both menus run the command.
  assert.equal(State.CONTEXT_COMMANDS["context.project-explorer.my-computer.new.type-definition"], "newTypeDefinitionInto");
  assert.equal(State.CONTEXT_COMMANDS["context.project-explorer.virtual-folder.new.type-definition"], "newTypeDefinitionInto");
  // The page's wiring: the menu command and the main process's message.
  const page = readFileSync(new URL("../../editor/src/project-explorer/project-explorer.mjs", import.meta.url), "utf8");
  assert.match(page, /"newTypeDefinitionInto"/);
  assert.match(page, /onNewControl\?\.\(\(created\) => treeCommands\.newControl\(created\)\)/);
  for (const id of ["my-computer", "virtual-folder"]) assert.equal(INV.entrada(`context.project-explorer.${id}.new.type-definition`).estado, "built");
  for (const name of ["library", "class", "interface", "xcontrol", "variable", "web-service", "package-dependencies", "unit-test", "test-vectors"]) {
    assert.equal(INV.entrada(`context.project-explorer.virtual-folder.new.${name}`).estado, "todo", name);
  }
});

test("a new control from the New dialog or Customize Control joins My Computer, is persisted as unsaved-control and becomes its file when saved", () => {
  const start = windowWithFolder();
  const withNew = Edit.addNewControl(start, State.ROOT_KEY, "Control 3", "9");
  assert.ok(names(target(withNew).items).includes("Control 3"), "File ▸ New's Add to project puts it in My Computer");
  const body = projectBody(withNew.project);
  assert.notEqual(body, projectBody(start.project), "the project is modified");
  assert.match(body, /"unsaved-control": true/);
  const read = Project.readProject(body);
  assert.deepEqual(unsavedOviIds(read), ["9"]);
  assert.equal(read.items[0].items.find((item) => item.name === "Control 3").unsavedControl, true, "it survives a read");
  const saved = Edit.newOviSaved(withNew, "9", "third.octl");
  const item = target(saved).items.find((inner) => inner.name === "third.octl");
  assert.deepEqual(item, { name: "third.octl", kind: "ovi", path: "third.octl" }, "no unsavedControl left");
  assert.doesNotMatch(projectBody(saved.project), /unsaved-/);
  assert.equal(withNewOviSaved(start.project, "nothing", "x.octl"), start.project);
  assert.equal(Edit.newOviClosed(withNew, "9").project.items[0].items.some((inner) => inner.name === "Control 3"), false, "closed unsaved, the item goes");
  assert.deepEqual(newControlItem("Control 4", "1"), { name: "Control 4", kind: "ovi", unsavedOvi: "1", unsavedControl: true });
});

test("any item whose path is an .octl shows the type definition icon and an OVI keeps its own", () => {
  let project = Project.addFiles(Project.blankProject(), ["first.ovi", "defs/Point.octl"]).project;
  const state = State.fromProject(project, "Icons.sdproj");
  const labelled = (label) => State.visibleRows({ ...state, expanded: [...state.expanded, State.targetKeyOf(project)] }).find((row) => row.label === label);
  assert.equal(labelled("Point.octl").icon, ROW_ICONS.TYPE_DEFINITION);
  assert.equal(labelled("first.ovi").icon, "ovi");
});
