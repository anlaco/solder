// File ▸ Create Project...: the Create Project dialog with its tree, its 17 rows, Finish, Cancel and Help, and the Open Items
// question that a project asks when OVIs are open. Measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-18-project-explorer-s3.md Q1 and Q2; project-explorer/s3-b-dialog.png). The state is pure and
// the view is a string, so none of it needs a browser.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { MENU_COMMANDS as GETTING_STARTED_COMMANDS } from "../../editor/src/getting-started/getting-started-state.mjs";
import { MENU_COMMANDS as POLYMORPHIC_COMMANDS } from "../../editor/src/polymorphic-window/polymorphic-window-state.mjs";
import * as State from "../../editor/src/create-project/create-project-state.mjs";
import * as View from "../../editor/src/create-project/create-project-view.mjs";
import { CREATE_PROJECT_DIALOG_SIZE } from "../../editor/electron/project-window.mjs";
import { INV, RAIZ } from "../helpers.mjs";

const draw = (state) => View.createProjectDialog(INV, state);
const anchor = { x: 230, y: 120 };
const source = (file) => readFileSync(path.join(RAIZ, file), "utf8");

const treeDrawn = (html) => [...html.matchAll(/class="cp-tree-row([^"]*)" data-id="[^"]+" data-tree="([^"]+)"[^>]*padding-left:(\d+)px">([^<]*)</g)].map(([, classes, , padding, label]) => ({ label, indented: Number(padding) > 23, selected: classes.includes("seleccionada"), hole: classes.includes("hueco") }));
const rowsDrawn = (html) => [...html.matchAll(/class="cp-row([^"]*)" data-id="[^"]+" data-row="([^"]+)">.*?<strong>([^<]*)<\/strong><em>([^<]*)<\/em>/g)].map(([, classes, id, name, category]) => ({ id, name, category, selected: classes.includes("seleccionada"), hole: classes.includes("hueco") }));

test("the Create Project dialog lists LabVIEW's tree and its 17 rows and opens on Blank Project", () => {
  const html = draw(State.initialState());
  // The tree, in the measured order: All selected, Desktop and Real-Time indented under Sample Projects, no expanders.
  assert.deepEqual(treeDrawn(html), [
    { label: "All", indented: false, selected: true, hole: false },
    { label: "Templates", indented: false, selected: false, hole: true },
    { label: "Sample Projects", indented: false, selected: false, hole: true },
    { label: "Desktop", indented: true, selected: false, hole: true },
    { label: "Real-Time", indented: true, selected: false, hole: true },
  ]);
  // The 17 rows of the list, in the measured order; the categories of the first two were measured.
  assert.deepEqual(rowsDrawn(html).map((row) => row.name), [
    "Blank Project", "Blank OVI", "My First DAQ Measurement", "Simple State Machine", "Simple State Machine (UTF-8)", "Channeled Message Handler", "Queued Message Handler",
    "Queued Message Handler (UTF-8)", "Actor Framework", "Finite Measurement", "Continuous Measurement and Logging", "Feedback Evaporative Cooler", "Instrument Driver Project",
    "Continuous Measurement and Logging (NI-DAQmx)", "Finite Measurement (NI-DAQmx)", "Solder Real-Time Control (NI-DAQmx)", "Solder Real-Time Waveform Acquisition and Logging (NI-DAQmx)",
  ]);
  assert.deepEqual(rowsDrawn(html).slice(0, 2).map((row) => row.category), ["Templates", "Templates"]);
  for (const row of State.LIST) assert.ok(row.description.length > 10, `${row.name} has a description of Solder's own`);
  // Blank Project is selected on open, every time, whatever was selected before.
  assert.deepEqual(rowsDrawn(html).filter((row) => row.selected).map((row) => row.name), ["Blank Project"]);
  assert.equal(State.initialState().selected, "blank-project");
  assert.equal(State.initialState().treeSelected, "all");
  // The banner, the greyed Additional Search and Keyword, and Finish (the default), Cancel and Help.
  assert.match(html, /Choose a starting point for the project:/);
  assert.match(html, /cp-additional-search hueco"[^>]*>Additional Search</);
  assert.match(html, /cp-keyword hueco"[^>]*>Keyword</);
  assert.match(html, /pv-boton cp-button defecto" data-id="dialog\.create-project\.finish"[^>]*>Finish</);
  assert.match(html, /data-id="dialog\.create-project\.cancel"[^>]*>Cancel</);
  assert.match(html, /cp-button hueco" data-id="dialog\.create-project\.help"[^>]*>Help</);
  // 802 x 632 with its title bar, as measured; the page holds what is under the 31 px bar.
  assert.deepEqual([View.WINDOW_SIZE.width, View.WINDOW_SIZE.height, View.TITLE_BAR_HEIGHT], [802, 632, 31]);
  assert.deepEqual(CREATE_PROJECT_DIALOG_SIZE, { width: 802, height: 601 });
  // Every id the dialog draws is in the inventory.
  for (const [, id] of html.matchAll(/data-id="([^"]+)"/g)) assert.ok(INV.entrada(id), `${id} is drawn and is not in the inventory`);
});

test("only Blank Project and Blank OVI are built and the other rows explain themselves without taking the selection", () => {
  const built = State.LIST.filter((row) => row.creation).map((row) => row.name);
  assert.deepEqual(built, ["Blank Project", "Blank OVI"]);
  for (const row of State.LIST) assert.equal(INV.entrada(State.listEntryId(row.id)).estado, row.creation ? "built" : "todo", row.name);
  let state = State.select(State.initialState(), "blank-ovi", anchor);
  assert.equal(state.selected, "blank-ovi", "Blank OVI can be selected");
  // A row that is not built says why when clicked and the selection stays where it was.
  state = State.select(state, "simple-state-machine", anchor);
  assert.equal(state.selected, "blank-ovi");
  assert.equal(state.abierta.id, "dialog.create-project.list.simple-state-machine");
  assert.equal(INV.entrada(state.abierta.id).necesita, "plantillas-de-proyecto");
  assert.match(draw(state), /data-explicacion="dialog\.create-project\.list\.simple-state-machine"[\s\S]*none yet/);
  assert.equal(State.select(state, "no-such-row", anchor), state);
  // The tree's other rows and the keyword box explain themselves too; All is the selection already.
  const onTemplates = State.selectTree(State.initialState(), "templates", anchor);
  assert.equal(onTemplates.treeSelected, "all");
  assert.equal(INV.entrada(onTemplates.abierta.id).necesita, "filtros-crear-proyecto");
  assert.equal(State.selectTree(State.initialState(), "all", anchor).abierta ?? null, null);
  assert.match(INV.explicacion(INV.entrada("dialog.create-project.keyword")).solder, /unmeasured/);
});

test("Finish creates what is selected and a project asks the Open Items question first when OVIs are open", () => {
  const initial = State.initialState();
  assert.deepEqual(State.finish(initial, { oviOpen: false }), { state: initial, create: "blank-project" });
  // Blank OVI is a standalone OVI and never asks (s3 Q2: Finish with Blank VI gives no project).
  const blankOvi = State.select(initial, "blank-ovi", anchor);
  assert.equal(State.finish(blankOvi, { oviOpen: true }).create, "blank-ovi");
  // A project with OVIs open asks first.
  const asked = State.finish(initial, { oviOpen: true });
  assert.equal(asked.create, undefined);
  assert.equal(asked.state.openItems, true);
  const html = draw(asked.state);
  assert.match(html, /<span>Open Items<\/span>/);
  assert.match(html, /You have one or more OVIs open in the main application instance\. Do you want to add the open OVI\(s\) to the new project\?/);
  assert.match(html, /cp-check hueco" data-id="dialog\.open-items\.do-not-show-again"[^>]*>.*Do not show this dialog again\./);
  // Add is the default button and a hole; Don't Add and Cancel are plain.
  assert.match(html, /<button class="boton-dialogo defecto hueco" data-id="dialog\.open-items\.add">Add<\/button>/);
  assert.match(html, /<button class="boton-dialogo" data-id="dialog\.open-items\.dont-add">Don't Add<\/button>/);
  assert.match(html, /<button class="boton-dialogo" data-id="dialog\.open-items\.cancel">Cancel<\/button>/);
  assert.equal(INV.entrada("dialog.open-items.add").necesita, "open-items-add");
  // Don't Add creates the project, Cancel gives it up, Add explains itself and creates nothing.
  assert.equal(State.pressOpenItemsButton(asked.state, "dont-add", anchor).create, "blank-project");
  assert.equal(State.pressOpenItemsButton(asked.state, "cancel", anchor).cancelled, true);
  const add = State.pressOpenItemsButton(asked.state, "add", anchor);
  assert.equal(add.create, undefined);
  assert.equal(add.state.abierta.id, "dialog.open-items.add");
  assert.match(draw(add.state), /data-explicacion="dialog\.open-items\.add"[\s\S]*unmeasured/);
  // The question is not asked without anything selectable to create.
  assert.deepEqual(State.finish({ ...initial, selected: "simple-state-machine" }, { oviOpen: true }).create, undefined);
});

test("File Create Project and Open Project are built rows of every window that has them, and so is Getting Started's button", () => {
  for (const window of ["front-panel", "block-diagram", "polymorphic-ovi", "getting-started", "project-explorer"]) {
    for (const row of ["create-project", "open-project"]) assert.equal(INV.entrada(`window.${window}.menu.file.${row}`).estado, "built", `${window} ${row}`);
  }
  // Save Project and Close Project of an OVI window act on the project the OVI belongs to (test/editor/ovi-project-menus.test.mjs);
  // a polymorphic OVI belongs to none yet.
  for (const window of ["front-panel", "block-diagram"]) {
    for (const row of ["save-project", "close-project"]) assert.equal(INV.entrada(`window.${window}.menu.file.${row}`).estado, "built");
  }
  for (const row of ["save-project", "close-project"]) assert.equal(INV.entrada(`window.polymorphic-ovi.menu.file.${row}`).necesita, "ovis-en-proyecto");
  assert.equal(INV.entrada("window.getting-started.create-project").estado, "built");
  assert.equal(GETTING_STARTED_COMMANDS["create-project"], "createProject");
  assert.equal(GETTING_STARTED_COMMANDS["open-project"], "openProject");
  assert.equal(POLYMORPHIC_COMMANDS["create-project"], "createProject");
  assert.equal(POLYMORPHIC_COMMANDS["open-project"], "openProject");
  // The pages run them through the main process.
  const editorWindow = source("editor/src/window/editor-window.mjs");
  assert.match(editorWindow, /"create-project": \(\) => window\.solder\?\.project\.create\(\)/);
  assert.match(editorWindow, /"open-project": \(\) => window\.solder\?\.project\.open\(\)/);
  assert.match(source("editor/src/polymorphic-window/polymorphic-window.mjs"), /createProject: \(\) => solder\?\.project\.create\(\)/);
  const gettingStarted = source("editor/src/getting-started/getting-started.mjs");
  assert.match(gettingStarted, /createProject: \(\) => solder\?\.project\.create\(\)/);
  assert.match(gettingStarted, /action === "create-project"/);
  assert.match(source("editor/src/getting-started/getting-started-view.mjs"), /data-action="create-project"/);
  // The dialog's own page gives Finish to the main process, which opens the project or the OVI.
  const manager = source("editor/electron/project-manager.mjs");
  assert.match(manager, /ipcMain\.on\("create-project:finish"/);
  assert.match(manager, /modal: !!owner/, "it is modal over the window that asked");
  assert.match(manager, /if \(creation === CREATIONS\.BLANK_PROJECT\) createBlankProject\(\);\s*else if \(creation === CREATIONS\.BLANK_OVI\) host\.openNewOVI\(\)/);
  assert.equal(Object.values(State.CREATIONS).every((creation) => manager.includes(`"${creation}"`)), true);
});
