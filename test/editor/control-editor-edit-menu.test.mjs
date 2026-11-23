// The control editor's Edit menu (DT-104/DT-106): LabVIEW's rows as measured in reports/2026-11-22-control-editor-window.md
// (local evidence), with the ones that act on a panel built and wired to the Front Panel's commands, so that a type
// definition's default values can be set; and the size a type definition keeps (reports/2026-11-23-cluster-elements-editor-try.md Q9).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

import * as Gr from "../../core/model/graph.mjs";
import * as CV from "../../core/model/control-values.mjs";
import { controlEditorGraph, controlEditorText, definitionObjectOf } from "../../core/model/control-editor.mjs";
import { readTypeDefinition, typeDefinitionText } from "../../core/model/type-definition.mjs";
import { setClusterElements } from "../../core/model/user-cluster.mjs";
import { updateFromDefinition } from "../../core/model/type-definition-update.mjs";
import { menuBarModel } from "../../editor/src/common/native-menu-model.mjs";
import { esHueco, ultimo } from "../../editor/src/common/labview-inventory.mjs";
import { EDIT_COMMANDS, editMenuId, editMenuVariants } from "../../editor/src/window/edit-menu.mjs";
import { createApplyTracker } from "../../editor/src/window/control-editor-apply.mjs";
import { CAT, INV, leer as leerJson } from "../helpers.mjs";

const source = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const EDIT = "window.control-editor.menu.edit";

test("the control editor's Edit menu has the measured rows and runs the ones that apply to a panel", () => {
  const rows = INV.hijos(EDIT).map((row) => `${row.separado ? "| " : ""}${row.etiqueta}`);
  assert.deepEqual(rows, [
    "Undo", "Redo", "| Cut", "Copy", "Paste", "Paste Special", "Delete", "Select All",
    "| Make Current Values Default", "Reinitialize Values to Default",
    "| Customize Control...", "Import Picture to Clipboard...", "Set Tabbing Order...",
    "| Remove Broken Wires from Selection", "Show Hidden Controls and Indicators", "Clean Up Panel", "Remove Breakpoints from Hierarchy", "Create OVI Snippet from Selection", "Create SubOVI",
    "| Disable Panel Grid Alignment", "Show Hidden Controls While Editing", "Align Items", "Distribute Items",
    "| OVI Revision History...", "Run-Time Menu...", "Adjust Pane Origin",
    "| Find and Replace...", "Show Search Results",
  ]);
  const built = INV.hijos(EDIT).filter((row) => !esHueco(row)).map((row) => ultimo(row.id)).sort();
  assert.deepEqual(built, [...EDIT_COMMANDS.filter((name) => name !== "remove-breakpoints-from-hierarchy"), "make-current-values-default", "reinitialize-values-to-default"].sort());
  // What is greyed says why: a hole answers with its reason, Remove Breakpoints never does anything here.
  assert.equal(INV.entrada(`${EDIT}.customize-control`).estado, "todo");
  assert.equal(INV.entrada(`${EDIT}.remove-breakpoints-from-hierarchy`).estado, "never");
  // The rows are the ones of the menu bar the window draws, and the window's own commands answer to their names.
  const menu = menuBarModel(INV, "window.control-editor").find((title) => title.id === EDIT);
  assert.equal(menu.rows.length, rows.length);
  const page = source("editor/src/window/editor-window.mjs");
  for (const name of ["undo", "redo", "cut", "copy", "paste", "delete", "select-all", "make-current-values-default", "reinitialize-values-to-default"]) assert.match(page, new RegExp(`"?${name}"?: \\(\\) =>`), name);
  // Its greyed rows follow the window's state, as the Front Panel's.
  const nothing = editMenuVariants("control-editor", { canUndo: false, canRedo: false, canCopy: false, hasSelection: false, clipboardFilled: false });
  for (const name of ["undo", "redo", "cut", "copy", "delete", "paste"]) assert.ok(nothing.desactivados.has(`${editMenuId("control-editor")}.${name}`), name);
});

/** The `.octl` text of a Numeric default 5 that is the control editor's object. */
const numericText = (value) => typeDefinitionText("type-def", { tipo: "control", label: { text: "n" }, config: { type: "number", value }, x: 10, y: 10 });

test("Make Current Values Default in the control editor changes a default and leaves Apply Changes greyed (measured: typedef-instances Q3, Q6)", () => {
  const opened = numericText(5);
  const read = controlEditorGraph(opened, CAT);
  const tracker = createApplyTracker(opened);
  const textOf = (g) => controlEditorText(read.kind, g, CAT, read.comments);
  const typed = CV.setCurrentValue(read.g, read.id, 9);
  const made = CV.makeCurrentValuesDefault(typed, [read.id]);
  const text = textOf(made);
  assert.equal(readTypeDefinition(text, CAT).object.config.value, 9, "the default is now 9");
  assert.notEqual(text, opened);
  assert.equal(tracker.hasChanges(CAT, made, read.kind, () => text), false, "a default alone has nothing to apply");
  const structural = controlEditorGraph(typeDefinitionText("type-def", { tipo: "str-control", label: { text: "n" }, config: { value: "" }, x: 10, y: 10 }), CAT).g;
  assert.equal(tracker.hasChanges(CAT, structural, read.kind, () => typeDefinitionText("type-def", { tipo: "str-control", label: { text: "n" }, config: { value: "" }, x: 10, y: 10 })), true, "another type is a change");
});

/** A cluster 293 × 223 holding one numeric. */
function bigCluster() {
  const placed = Gr.crearEnPanel(Gr.nuevo(), CAT, "cluster-control", 40, 50, "Pt", {});
  const withElement = setClusterElements(placed.g, CAT, placed.id, [{ tipo: "control", label: { text: "a" }, config: { type: "number", value: 1 }, x: 200, y: 150 }]);
  const g = { ...withElement, nodos: withElement.nodos.map((node) => (node.id === placed.id ? { ...node, panel: { ...node.panel, w: 293, h: 223 } } : node)) };
  return { g, node: g.nodos.find((node) => node.id === placed.id) };
}

test("a type definition keeps its cluster's size: the .octl stores it and the control editor opens at it", () => {
  const { node } = bigCluster();
  const text = typeDefinitionText("type-def", definitionObjectOf(node));
  const file = JSON.parse(text).object;
  assert.deepEqual([file.w, file.h], [293, 223]);
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(leerJson("docs/schema/octl.schema.json"));
  assert.ok(validate(JSON.parse(text)), JSON.stringify(validate.errors));
  const opened = controlEditorGraph(text, CAT);
  const shell = opened.g.nodos.find((candidate) => candidate.id === opened.id);
  assert.deepEqual([shell.panel.w, shell.panel.h], [293, 223], "not a 100 × 100 shell that clips the element");
  assert.deepEqual([JSON.parse(controlEditorText("type-def", opened.g, CAT)).object.w, JSON.parse(controlEditorText("type-def", opened.g, CAT)).object.h], [293, 223], "and it writes it back");
  // An object of its default size writes no size, and a file without one reads as before.
  const plain = JSON.parse(typeDefinitionText("type-def", { tipo: "control", config: { type: "number" }, x: 0, y: 0 })).object;
  assert.ok(!("w" in plain) && !("h" in plain));
});

test("a strict instance takes the definition's size and a non-strict one keeps its own (the look rule)", () => {
  const { node: definition } = bigCluster();
  const definitionObject = readTypeDefinition(typeDefinitionText("type-def", definitionObjectOf(definition)), CAT).object;
  const own = Gr.crearEnPanel(Gr.nuevo(), CAT, "cluster-control", 40, 50, "Pt", {});
  const instance = (strict) => ({ ...own.g.nodos.find((node) => node.id === own.id), panel: { x: 40, y: 50, w: 120, h: 90 }, config: { typedef: { path: "a.octl", strict } } });
  const strictSize = updateFromDefinition(CAT, instance(true), definitionObject).node.panel;
  assert.deepEqual([strictSize.w, strictSize.h], [293, 223]);
  const looseSize = updateFromDefinition(CAT, instance(false), definitionObject).node.panel;
  assert.deepEqual([looseSize.w, looseSize.h], [120, 90]);
});
