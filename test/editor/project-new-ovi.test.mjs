// New ▸ OVI in a project: measured in LabVIEW 2026 Q3 (labview-captures/reports/2026-11-19-project-new-vi.md). The new
// VI is an item at once ("Untitled N", sorted by name, selected), its titles say "on <project>/My Computer", saving it
// turns the item into its file, closing it unsaved takes the item out, and Save Project first saves every new VI after
// asking Yes or Cancel.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as Project from "../../core/model/project.mjs";
import { unsavedOviIds, withNewOviSaved, withoutNewOvi } from "../../core/model/project-new-ovis.mjs";
import { windowTitle } from "../../editor/electron/ovi-registry.mjs";
import { NEW_FILES_BUTTONS, newUnsavedFilesText } from "../../editor/electron/project-dialogs.mjs";
import { projectBody } from "../../editor/electron/project-registry.mjs";
import * as Edit from "../../editor/src/project-explorer/project-explorer-edit.mjs";
import * as State from "../../editor/src/project-explorer/project-explorer-state.mjs";

const source = (file) => readFileSync(new URL(`../../editor/${file}`, import.meta.url), "utf8");

/** A project with first.ovi and a virtual folder under My Computer, as the window shows it. */
function windowWithFolder() {
  let project = Project.addFiles(Project.blankProject(), ["first.ovi"]).project;
  project = Project.addVirtualFolder(project, "New Folder");
  return State.fromProject(project, "NewVI14.sdproj");
}

const target = (state) => state.project.items[0];
const names = (items) => items.map((item) => item.name);

test("New OVI puts an Untitled item in the row or in My Computer selected and sorted", () => {
  const start = windowWithFolder();
  const myComputer = State.targetKeyOf(start.project);
  const atTop = Edit.addNewOvi(start, myComputer, "Untitled 3", "7");
  assert.deepEqual(names(target(atTop).items), ["New Folder", "first.ovi", "Untitled 3", "Dependencies", "Build Specifications"], "by name, before the fixed items");
  assert.equal(itemAtKey(atTop, atTop.selected).unsavedOvi, "7", "the new item is selected");
  const folderKey = `${myComputer}/0`;
  const inFolder = Edit.addNewOvi(start, folderKey, "Untitled 4", "8");
  assert.deepEqual(names(target(inFolder).items[0].items), ["Untitled 4"], "a virtual folder's New ▸ OVI puts it inside");
  assert.ok(inFolder.expanded.includes(folderKey), "and opens the folder");
  // File ▸ New OVI of the explorer, or a row that holds nothing: My Computer's top (Q6).
  const fromMenu = Edit.addNewOvi(start, State.ROOT_KEY, "Untitled 5", "9");
  assert.ok(names(target(fromMenu).items).includes("Untitled 5"));
  assert.equal(State.CONTEXT_COMMANDS["context.project-explorer.my-computer.new.vi"], "newOviInto");
  assert.equal(State.CONTEXT_COMMANDS["context.project-explorer.virtual-folder.new.vi"], "newOviInto");
});

/** The item at a row key of the window. */
function itemAtKey(state, key) {
  return State.placeOfKey(key).reduce((items, index, depth, place) => (depth === place.length - 1 ? items[index] : items[index].items), state.project.items);
}

test("a new OVI marks the project changed but is never written to a saved file, and saving it makes the item its file", () => {
  const start = windowWithFolder();
  const withNew = Edit.addNewOvi(start, State.targetKeyOf(start.project), "Untitled 3", "7");
  const before = projectBody(start.project);
  const after = projectBody(withNew.project);
  assert.notEqual(after, before, "the title gets its asterisk");
  assert.deepEqual(unsavedOviIds(Project.readProject(after)), ["7"], "the compared text keeps the link through a read");
  const saved = Edit.newOviSaved(withNew, "7", "third.ovi");
  assert.deepEqual(names(target(saved).items), ["New Folder", "first.ovi", "third.ovi", "Dependencies", "Build Specifications"]);
  assert.equal(target(saved).items[2].path, "third.ovi");
  assert.deepEqual(unsavedOviIds(saved.project), []);
  assert.doesNotMatch(projectBody(saved.project), /unsaved-ovi/, "a saved project holds no unsaved OVI");
  const closed = Edit.newOviClosed(withNew, "7");
  assert.equal(projectBody(closed.project), before, "closed unsaved, the item goes and the project is as it was");
  assert.equal(withoutNewOvi(start.project, "nothing"), start.project);
  assert.equal(withNewOviSaved(start.project, "nothing", "x.ovi"), start.project);
});

test("the titles say the project and target, and Save Project asks LabVIEW's question before saving new OVIs", () => {
  const entry = { id: "7", path: null, untitledNumber: 3, saved: null, current: null, instance: "NewVI14.sdproj/My Computer" };
  assert.equal(windowTitle(entry, "front-panel"), "Untitled 3 Front Panel on NewVI14.sdproj/My Computer");
  assert.equal(windowTitle({ ...entry, instance: undefined }, "block-diagram"), "Untitled 3 Block Diagram");
  assert.deepEqual(newUnsavedFilesText("NewVI14.sdproj"), {
    title: "",
    message: '"NewVI14.sdproj" refers to new, unsaved files. You must save these files in order to save "NewVI14.sdproj".',
    detail: "Do you want to save the new, unsaved files?",
  });
  assert.deepEqual(NEW_FILES_BUTTONS, ["Yes", "Cancel"]);
  const manager = source("electron/project-manager.mjs");
  assert.match(manager, /async function writeProjectOf\(entry, owner\) \{\n    if \(!\(await saveNewOVIsOf\(entry, owner\)\)\) return false;/);
  const main = source("electron/main.mjs");
  assert.match(main, /if \(open\.entry\.project !== undefined && !open\.entry\.path\) projects\.newOVISettled\(open\.entry\.project, open\.entry\.id, null\);/, "closed unsaved, the page drops the item");
  assert.match(main, /if \(wasNewInProject\) projects\.newOVISettled\(entry\.project, entry\.id, target\);/, "saved, the page turns it into the file");
  assert.match(main, /path\.join\(entry\.projectFolder, proposal\)/, "its first Save proposes the project's folder");
});
