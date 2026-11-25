// Customize Control..., Advanced ▸ Customize..., and Select a Control... (DT-107), as measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-25-new-custom-control.md Q3, -empty-and-multi-control.md, -placing-a-control.md Q1 and Q2,
// local evidence never committed). What was not measured says "unverified".

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { definitionObjectOf } from "../../core/model/control-editor.mjs";
import { FREE_LABEL } from "../../core/model/free-label.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { DBL } from "../../core/model/types.mjs";
import { typeDefinitionText } from "../../core/model/type-definition.mjs";
import { SELECT_CONTROL_DIALOG } from "../../editor/electron/new-controls.mjs";
import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import { controlToPlace, unknownDefinitionKeys } from "../../editor/src/front-panel/chosen-control.mjs";
import { customizableNode, customizedObject } from "../../editor/src/front-panel/customize-control.mjs";
import * as P from "../../editor/src/front-panel/front-panel.mjs";
import { constantToPlace } from "../../editor/src/window/chosen-constant.mjs";
import { editMenuId, editMenuVariants } from "../../editor/src/window/edit-menu.mjs";
import { CAT, INV } from "../helpers.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",");
const FONDO = { tipo: "fondo" };
const source = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");

/** Carry a control from the palette to `point` and click, as the editor does; `placement` is what a file's control brings. */
function place(panel, block, point, config, placement) {
  const carried = P.moverA(P.coger(panel, block, config, placement), CTX, point);
  return P.confirmar(P.pulsar(carried, CTX, FONDO, point));
}

/** A panel with two numeric controls, and the ids of both. */
function panelWithTwoControls() {
  const first = place(P.inicial(), "control", { x: 100, y: 100 });
  const second = place(first, "control", { x: 300, y: 100 });
  return { panel: second, ids: second.g.nodos.map((node) => node.id) };
}

test("Customize Control... of the Front Panel is enabled with exactly one panel object selected", () => {
  const { panel, ids } = panelWithTwoControls();
  const selecting = (...selection) => ({ ...panel, seleccion: selection });
  assert.equal(customizableNode(selecting(ids[0]), CAT)?.id, ids[0], "one object, selected by its frame");
  for (const [what, selection] of [["nothing", []], ["two objects", ids], ["an object's label alone", [`${ids[0]}#etiqueta`]]]) {
    assert.equal(customizableNode(selecting(...selection), CAT), null, what);
  }
  // A free label is not an object a control editor holds.
  const labelled = Gr.crearNodo(panel.g, CAT, FREE_LABEL, undefined, undefined);
  const withLabel = { ...labelled.g, nodos: labelled.g.nodos.map((node) => (node.id === labelled.id ? { ...node, panel: { x: 10, y: 10 }, label: { text: "note" } } : node)) };
  assert.equal(customizableNode({ ...panel, g: withLabel, seleccion: [labelled.id] }, CAT), null, "a free label");
  assert.equal(customizedObject(withLabel, CAT, labelled.id), null);
  // What the control editor opens with is the object as Make Type Def. holds it.
  assert.deepEqual(customizedObject(panel.g, CAT, ids[0]), definitionObjectOf(panel.g.nodos[0]));

  // The row's state in the menu: greyed on the panel unless one object is selected; the diagram's and the control editor's are not built (measured greyed).
  const row = `${editMenuId("front-panel")}.customize-control`;
  const state = { canUndo: true, canRedo: true, canCopy: true, hasSelection: true, clipboardFilled: true };
  assert.ok(editMenuVariants("front-panel", state).desactivados.has(row));
  assert.ok(!editMenuVariants("front-panel", { ...state, canCustomize: true }).desactivados.has(row));
  assert.equal(INV.entrada(row).estado, "built");
  for (const id of ["window.block-diagram.menu.edit.customize-control", "window.control-editor.menu.edit.customize-control"]) assert.equal(INV.entrada(id).estado, "todo", id);
  assert.match(source("editor/src/window/editor-window.mjs"), /"customize-control": \(\) => customizeControl\(customizableNode\(pan, cat\)\?\.id\)/);
});

test("Advanced Customize... opens a copy of the object it is on, in every panel menu that has it", () => {
  const roots = ["numeric-panel-control", "cluster-control", "waveform-chart", "waveform-graph", "xy-graph", "visa-control", "daq-task-name-control", "daq-name-control", "path-control"];
  for (const root of roots) {
    assert.equal(INV.entrada(`context.${root}.advanced.customize`).estado, "built", root);
    assert.equal(INV.entrada(`context.${root}.advanced`).estado, "built", `${root}: the submenu that holds it is done`);
  }
  // The numeric control's Advanced had no rows: LabVIEW's four, in its order (reports/2026-11-17-typedef-editor-entry.md Q1).
  assert.deepEqual(INV.hijos("context.numeric-panel-control.advanced").map((entry) => entry.etiqueta), ["Key Navigation...", "Synchronous Display", "Customize...", "Run-Time Shortcut Menu"]);
  // The panel objects reach those menus.
  const cluster = INV.entrada("palette.controls.modern.data-containers.cluster");
  const configs = { "cluster-control": cluster.config };
  for (const block of ["control", "cluster-control", "waveform-chart", "waveform-graph", "xy-graph", "visa-control", "path-control"]) {
    const { g, id } = Gr.crearEnPanel(Gr.nuevo(), CAT, block, 10, 10, "x", configs[block] ?? {});
    const root = P.menuDe(g.nodos.find((node) => node.id === id));
    assert.equal(INV.entrada(`${root}.advanced.customize`).estado, "built", block);
  }
  // The diagram's constants were not measured there: still not done.
  for (const id of ["context.cluster-constant.advanced.customize", "context.visa-constant.advanced.customize"]) assert.equal(INV.entrada(id).estado, "todo", id);
  assert.match(source("editor/src/window/editor-window.mjs"), /customize: \(nodeId\) => customizeControl\(nodeId\)/);
});

/** The `.octl` of `kind` holding `objects`, as the editor writes it. */
const octl = (kind, objects) => typeDefinitionText(kind, objects);
const numeric = (label = "Numeric") => ({ tipo: "control", label: { text: label }, config: { type: DBL, value: 3 }, x: 0, y: 0 });

test("Select a Control... places the one object of an octl, copied or linked, and nothing otherwise", () => {
  // The dialog is LabVIEW's.
  assert.equal(SELECT_CONTROL_DIALOG.title, "Select the Control to Open");
  assert.equal(SELECT_CONTROL_DIALOG.filters[0].name, "Front Panel Controls");
  assert.deepEqual(SELECT_CONTROL_DIALOG.filters[0].extensions, ["octl"]);

  // A file with zero or several objects places nothing, silently (measured).
  assert.equal(controlToPlace(octl("control", []), CAT, "A.octl"), null);
  assert.equal(controlToPlace(octl("type-def", [numeric(), numeric("Other")]), CAT, "A.octl"), null);

  // A Control is copied, unlinked; a Type Def. is linked, strict or not, by the path as the OVI stores it.
  const plain = controlToPlace(octl("control", [numeric()]), CAT, "defs/One.octl");
  assert.equal(plain.config.typedef, undefined);
  assert.deepEqual(controlToPlace(octl("type-def", [numeric()]), CAT, "defs/One.octl").config.typedef, { path: "defs/One.octl", strict: false });
  assert.deepEqual(controlToPlace(octl("strict-type-def", [numeric()]), CAT, "defs/One.octl").config.typedef, { path: "defs/One.octl", strict: true });

  // It lands where clicked, its label the file's and numbered when taken ("Numeric 2", measured), its stored size kept.
  const linked = controlToPlace(octl("type-def", [{ ...numeric(), w: 140, h: 40 }]), CAT, "defs/One.octl");
  const base = place(P.inicial(), "control", { x: 100, y: 100 });
  const placed = place(base, linked.bloque, { x: 300, y: 200 }, linked.config, linked.placement);
  const node = placed.g.nodos.at(-1);
  assert.equal(node.label.text, "Numeric 2");
  assert.deepEqual(node.config.typedef, { path: "defs/One.octl", strict: false });
  assert.deepEqual([node.panel.w, node.panel.h], [140, 40]);
  assert.ok(Math.abs(node.panel.x - 300) < 150 && Math.abs(node.panel.y - 200) < 50, "near the click, not at the origin");
  // The label of the file is the one carried, even when the block's own is another.
  const named = controlToPlace(octl("control", [numeric("Speed")]), CAT, "One.octl");
  assert.equal(place(P.inicial(), named.bloque, { x: 50, y: 50 }, named.config, named.placement).g.nodos[0].label.text, "Speed");

  // A linked object the hierarchy does not hold yet makes it load the definition, once.
  const oviKey = "/work/p.ovi";
  assert.deepEqual(unknownDefinitionKeys(placed.g, [], oviKey, ""), ["/work/defs/One.octl"]);
  assert.deepEqual(unknownDefinitionKeys(placed.g, ["/work/defs/One.octl"], oviKey, ""), []);
  assert.deepEqual(unknownDefinitionKeys(base.g, [], oviKey, ""), [], "an unlinked object needs none");

  // The wiring: the page asks for the dialog through the preload, and the main process answers it.
  assert.match(source("editor/electron/preload.cjs"), /chooseControl: \(\) => ipcRenderer\.invoke\("control:choose"\)/);
  assert.match(source("editor/electron/main.mjs"), /ipcMain\.handle\("control:choose"/);
  assert.match(source("editor/src/window/editor-window.mjs"), /palette\.controls\.select-a-control/);
});

test("Select an OVI... on the octl of a type definition of a numeric places a constant that follows it", () => {
  const constant = constantToPlace(octl("type-def", [numeric()]), CAT, "defs/One.octl");
  assert.equal(constant.bloque, "num-const");
  assert.deepEqual(constant.config, { type: DBL, value: 3, typedef: { path: "defs/One.octl", strict: false } });
  assert.equal(constantToPlace(octl("strict-type-def", [numeric()]), CAT, "T.octl").config.typedef.strict, true);
  // A plain Control, a file of none or several objects, and what was not measured place nothing.
  assert.equal(constantToPlace(octl("control", [numeric()]), CAT, "One.octl"), null);
  assert.equal(constantToPlace(octl("type-def", []), CAT, "T.octl"), null);
  assert.equal(constantToPlace(octl("type-def", [numeric(), numeric()]), CAT, "T.octl"), null);
  const flag = { tipo: "bool-control", label: { text: "Flag" }, config: { value: false }, x: 0, y: 0 };
  assert.equal(constantToPlace(octl("type-def", [flag]), CAT, "T.octl"), null, "a Boolean's constant was not measured");
  assert.ok(INV.entrada("palette.functions.select-a-vi").estado === "built");
});
