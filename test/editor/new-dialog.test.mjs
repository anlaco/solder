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
    ["folder", "From Template", true], ["folder", "Project", true], ["item", "Empty Project", true], ["folder", "Other Files", true],
  ]);
  for (const text of ["Create New", "Description", "Add to project", ">OK<", ">Cancel<", ">Help<"]) assert.ok(html.includes(text), text);
  assert.deepEqual([State.TREE[0].children.map((item) => item.label)], [["Blank OVI", "Malleable OVI", "Polymorphic OVI"]]);

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
  assert.equal(INV.entrada("dialog.new.add-to-project").estado, "todo");
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
  assert.match(main, /const NEW_DIALOG_CREATIONS = \{ "blank-ovi": openNewVI, "polymorphic-ovi": openNewPolymorphic \}/);
  assert.match(main, /ipcMain\.on\("vi:new-dialog"/);
  assert.match(main, /modal: !!owner/, "it is modal over the window that asked");
  // Every creation of the tree that is done has an opener.
  for (const creation of Object.values(State.CREATIONS)) assert.ok(main.includes(`"${creation}": open`), creation);
});
