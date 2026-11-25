// File ▸ New...: the New dialog, with its tree (OVI ▸ Blank OVI, Malleable OVI, Polymorphic OVI, then From Template, Project
// and Other Files), the description of the selected item, OK, Cancel and Help. Measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-05-polymorphic-window.md; new2.png). The state is pure and the view is a string.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import * as State from "../../editor/src/new-dialog/new-dialog-state.mjs";
import { newDialog } from "../../editor/src/new-dialog/new-dialog-view.mjs";
import { MENU_COMMANDS } from "../../editor/src/getting-started/getting-started-state.mjs";
import { INV, RAIZ } from "../helpers.mjs";

const draw = (state) => newDialog(INV, state);
const itemsDrawn = (html) => [...html.matchAll(/class="nd-row (nd-folder|nd-item)([^"]*)" data-id="([^"]+)"[^>]*><span class="nd-label"[^>]*>([^<]*)</g)].map(([, kind, classes, id, label]) => [kind === "nd-folder" ? "folder" : "item", label, classes.includes("hueco")]);

test("the New dialog lists LabVIEW's tree and creates a blank OVI or a polymorphic OVI, and explains what is not done", () => {
  const html = draw(State.initialState());
  // LabVIEW's tree, in its order, with the folders OVI, From Template, Project and Other Files.
  assert.deepEqual(itemsDrawn(html), [
    ["folder", "OVI", false], ["item", "Blank OVI", false], ["item", "Malleable OVI", true], ["item", "Polymorphic OVI", false],
    ["folder", "From Template", true], ["folder", "Project", true], ["item", "Empty Project", true], ["folder", "Other Files", false],
    ["item", "Class", true], ["item", "Custom Control", false], ["item", "Global Variable", true], ["item", "Interface", true],
    ["item", "Library", true], ["item", "Run-Time Menu", true], ["item", "Type Definition", false], ["item", "XControl", true],
  ]);
  for (const text of ["Create New", "Description", "Add to project", ">OK<", ">Cancel<", ">Help<"]) assert.ok(html.includes(text), text);
  assert.deepEqual([State.TREE[0].children.map((item) => item.label)], [["Blank OVI", "Malleable OVI", "Polymorphic OVI"]]);
  // Each caption ends above its box, as on new2.png, and is not drawn over by it.
  const pixels = (style, property) => Number(new RegExp(`${property}:(\\d+)px`).exec(style)[1]);
  const styleOf = (marker) => new RegExp(`style="([^"]*)"[^>]*>${marker}`).exec(html)[1];
  for (const [label, box] of [["Create New", 'class="nd-tree"'], ["Description", 'class="nd-description"']]) {
    const captionStyle = styleOf(label);
    const boxStyle = new RegExp(`${box} style="([^"]*)"`).exec(html)[1];
    assert.ok(pixels(captionStyle, "top") + pixels(captionStyle, "line-height") <= pixels(boxStyle, "top"), `${label} ends above its box`);
  }

  // Selecting Polymorphic OVI shows its description and lets OK create it; Blank OVI creates a blank one.
  const anchor = { x: 30, y: 90 };
  let state = State.select(State.initialState(), INV, State.CREATIONS.POLYMORPHIC_OVI, anchor);
  assert.equal(State.acceptedCreation(state), "polymorphic-ovi");
  assert.match(draw(state), /Creates a new polymorphic OVI/);
  assert.match(draw(state), /nd-item seleccionada" data-id="dialog\.new\.polymorphic-ovi"/);
  assert.equal(State.acceptedCreation(State.select(state, INV, State.CREATIONS.BLANK_OVI, anchor)), "blank-ovi");
  assert.equal(State.acceptedCreation(State.initialState()), "blank-ovi", "it opens on Blank OVI");
  assert.match(draw(State.initialState()), /OK<\/div>/);

  // What is not done does not take the selection: it explains why (rule 53) and OK still creates what was selected.
  state = State.select(state, INV, "malleable-ovi", anchor);
  assert.equal(state.selected, "polymorphic-ovi");
  assert.equal(state.abierta.id, "dialog.new.malleable-ovi");
  assert.equal(INV.entrada("dialog.new.malleable-ovi").necesita, "ovis-maleables");
  assert.match(draw(state), /data-explicacion="dialog\.new\.malleable-ovi"/);
  assert.equal(State.select(state, INV, "other-files", anchor), state, "a folder is not an item");
  // Help follows the convention of the other dialogs: a hole that explains itself.
  assert.equal(INV.entrada("dialog.new.help").estado, "todo");
  // OK is greyed when nothing done is selected.
  assert.match(draw({ ...State.initialState(), selected: "malleable-ovi" }), /nd-button[^"]*desactivado[^"]*" data-id="dialog\.new\.ok"/);
  assert.equal(State.acceptedCreation({ ...State.initialState(), selected: "malleable-ovi" }), null);
});

test("File New... is a row of the menus of the OVI windows and of Getting Started, and the main process opens the dialog", () => {
  assert.equal(INV.entrada("window.front-panel.menu.file.new").estado, "built");
  assert.equal(INV.entrada("window.getting-started.menu.file.new").estado, "built");
  assert.equal(MENU_COMMANDS.new, "newDialog");
  const editorWindow = readFileSync(path.join(RAIZ, "editor/src/window/editor-window.mjs"), "utf8");
  assert.match(editorWindow, /new: \(\) => window\.solder\?\.nuevo\(\)/);
  const main = readFileSync(path.join(RAIZ, "editor/electron/main.mjs"), "utf8");
  assert.match(main, /const NEW_DIALOG_CREATIONS = \{\s+"blank-ovi": openNewOVI,\s+"polymorphic-ovi": openNewPolymorphic,/);
  assert.match(main, /ipcMain\.on\("ovi:new-dialog"/);
  assert.match(main, /modal: !!owner/, "it is modal over the window that asked");
  // Every creation of the tree that is done has an opener.
  for (const creation of Object.values(State.CREATIONS)) assert.match(main, new RegExp(`"${creation}": (\\(project\\) => )?open`), creation);
});

test("the New dialog's Other Files lists Custom Control and Type Definition and Add to project follows the project", () => {
  const anchor = { x: 30, y: 90 };
  // Without a project: LabVIEW's rows, no Shared Variable, Add to project greyed and unticked.
  const alone = State.initialState();
  assert.deepEqual(State.treeOf(alone)[3].children.map((item) => item.label), ["Class", "Custom Control", "Global Variable", "Interface", "Library", "Run-Time Menu", "Type Definition", "XControl"]);
  assert.match(draw(alone), /class="nd-check pv-check desactivado" data-id="dialog\.new\.add-to-project"/);
  assert.equal(State.toggleAddToProject(alone), alone, "a click on the greyed box does nothing");
  assert.equal(alone.addToProject, false);
  // From a project: Shared Variable comes first (it is not done), the box is ticked and a click unticks it.
  const inProject = State.initialState("Project.sdproj");
  assert.equal(State.treeOf(inProject)[3].children[0].label, "Shared Variable");
  assert.deepEqual(itemsDrawn(draw(inProject)).slice(-9, -7), [["item", "Shared Variable", true], ["item", "Class", true]]);
  assert.match(draw(inProject), /class="nd-check pv-check marcada" data-id="dialog\.new\.add-to-project"/);
  const unticked = State.toggleAddToProject(inProject);
  assert.equal(unticked.addToProject, false);
  assert.doesNotMatch(draw(unticked), /pv-check marcada/);
  assert.equal(State.toggleAddToProject(unticked).addToProject, true);
  // Custom Control and Type Definition are created by OK, with their own text; the others explain themselves.
  let state = State.select(alone, INV, "custom-control", anchor);
  assert.equal(State.acceptedCreation(state), State.CREATIONS.CUSTOM_CONTROL);
  assert.match(draw(state), /saved as an \.octl file; set its ring to Type Def\./);
  state = State.select(state, INV, "type-definition", anchor);
  assert.equal(State.acceptedCreation(state), State.CREATIONS.TYPE_DEFINITION);
  assert.match(draw(state), /every copy of it follows/);
  state = State.select(state, INV, "class", anchor);
  assert.equal(state.selected, "type-definition", "Class is not done: the selection stays");
  assert.equal(state.abierta.id, "dialog.new.class");
  assert.equal(State.select(inProject, INV, "shared-variable", anchor).abierta.id, "dialog.new.shared-variable");
  for (const id of ["custom-control", "type-definition", "add-to-project", "other-files"]) assert.equal(INV.entrada(`dialog.new.${id}`).estado, "built", id);
  // The page sends the tick with OK.
  const page = readFileSync(path.join(RAIZ, "editor/src/new-dialog/new-dialog.mjs"), "utf8");
  assert.match(page, /aceptar\(creation, state\.addToProject\)/);
});
