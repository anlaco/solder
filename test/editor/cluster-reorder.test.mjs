// Reorder Controls In Cluster... (DT-095 §4). Every sequence and measure is the one taken in LabVIEW 2026 Q3:
// labview-captures/reports/2026-11-17-cluster-reorder.md (local evidence, never committed). What was not measured says
// "unverified".

import assert from "node:assert/strict";
import { test } from "node:test";

import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as P from "../../editor/src/front-panel/front-panel.mjs";
import * as CR from "../../editor/src/front-panel/cluster-reorder.mjs";
import { foldClusters } from "../../editor/src/front-panel/cluster-unfolding.mjs";
import { REORDER_TOOLBAR, reorderToolbarHtml } from "../../editor/src/front-panel/cluster-reorder-view.mjs";
import * as V from "../../editor/src/window/window-view.mjs";
import { CAT, INV } from "../helpers.mjs";
import { menuRows } from "./menu-rows.mjs";
import { oldSchoolToken } from "./old-school-theme.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",");
const FONDO = { tipo: "fondo" };
const ROOT = "context.cluster-control";
const REORDER_ROW = `${ROOT}.reorder-controls-in-cluster`;

function place(p, block, point, config) {
  const carried = P.moverA(P.coger(p, block, config), CTX, point);
  return P.confirmar(P.pulsar(carried, CTX, FONDO, point));
}

/** The measured cluster: String 0, Boolean 1, Numeric 2 (the order of the VI the measurement used). */
function measuredCluster() {
  const entry = INV.entrada("palette.controls.modern.data-containers.cluster");
  let p = place(P.inicial(), entry.bloque, { x: 300, y: 300 }, entry.config);
  p = place(p, "str-control", { x: 300, y: 270 });
  p = place(p, "bool-control", { x: 300, y: 330 });
  p = place(p, "control", { x: 300, y: 300 });
  return p;
}
/** The cluster as the diagram and the file see it, its elements inside it: the panel's graph is unfolded while it is edited (DT-106), and folded while the order is set. */
const clusterOf = (p) => foldClusters(p.g, CAT).nodos.find((n) => n.config?.elements);
const shellMenu = (p) => ED.abrirMenuDelPanel(p, P.menuDe(clusterOf(p)), clusterOf(p).id, 0, 0);
const enterReorder = (p) => ED.orden(shellMenu(p), REORDER_ROW, CTX, INV);
const namesInOrder = (p) => clusterOf(p).config.elements.map((e) => e.label.text);
const STRING = 0;
const BOOLEAN = 1;
const NUMERIC = 2;

test("Reorder Controls In Cluster sets the cluster order by clicks, as measured", () => {
  let p = enterReorder(measuredCluster());
  assert.equal(p.menu, null);
  assert.deepEqual([p.reorder.fieldText, p.reorder.typed], ["0", false], "report §2: the field reads 0, selected, on entry");
  assert.deepEqual(CR.newNumbers(p.reorder), [0, 1, 2]);
  // Report §4, step 1: the field at 0, a click on the Numeric: Numeric 0, String 1, Boolean 2, and the field 1.
  p = CR.pressInReorder(p, CAT, { element: NUMERIC });
  assert.deepEqual(CR.newNumbers(p.reorder), [1, 2, 0]);
  assert.equal(p.reorder.fieldText, "1");
  assert.ok(CR.hasChanged(p.reorder), "✗ is enabled after the first change");
  // Steps 2 and 3: the String already holds 1 and the Boolean 2, so nothing moves; the field stops at 2, the last number.
  p = CR.pressInReorder(p, CAT, { element: STRING });
  assert.equal(p.reorder.fieldText, "2");
  p = CR.pressInReorder(p, CAT, { element: BOOLEAN });
  assert.deepEqual(CR.newNumbers(p.reorder), [1, 2, 0]);
  assert.equal(p.reorder.fieldText, "2", "the field does not wrap to 0");
  // The graph does not change until ✓.
  assert.deepEqual(namesInOrder(p), ["String", "Boolean", "Numeric"]);
  const committed = CR.pressInReorder(p, CAT, { button: "ok" });
  assert.equal(committed.reorder, null, "✓ leaves the mode");
  assert.deepEqual(namesInOrder(committed), ["Numeric", "String", "Boolean"]);
  assert.deepEqual(clusterOf(committed).config.type.cluster.map((field) => field.name), ["Numeric", "String", "Boolean"], "the type follows the new order");
});

test("a click gives the field's number and the others keep their relative order", () => {
  const p = enterReorder(measuredCluster());
  // Report §4: the field at 2 and a click on the String give String 2, Boolean 0, Numeric 1.
  const atTwo = { ...p, reorder: { ...p.reorder, fieldText: "2" } };
  assert.deepEqual(CR.newNumbers(CR.pressInReorder(atTwo, CAT, { element: STRING }).reorder), [2, 0, 1]);
});

test("✗ restores the order and stays in the mode; a press elsewhere does nothing", () => {
  let p = enterReorder(measuredCluster());
  assert.equal(CR.pressInReorder(p, CAT, { button: "cancel" }), p, "✗ is grey until a change");
  assert.equal(CR.pressInReorder(p, CAT, null), p, "report §4: a click on empty background does nothing");
  p = CR.pressInReorder(p, CAT, { element: NUMERIC });
  const discarded = CR.pressInReorder(p, CAT, { button: "cancel" });
  assert.deepEqual(CR.newNumbers(discarded.reorder), [0, 1, 2]);
  assert.ok(discarded.reorder, "report §5: ✗ does not leave the mode");
  assert.equal(discarded.reorder.fieldText, p.reorder.fieldText, "and keeps the field");
  // ✓ with no change leaves the mode with the graph as it was.
  const left = CR.pressInReorder(discarded, CAT, { button: "ok" });
  assert.equal(left.reorder, null);
  assert.deepEqual(foldClusters(left.g, CAT), discarded.g, "and, unfolded again, with the elements it had");
  assert.ok(left.g.nodos.some((node) => node.inside !== undefined));
});

test("the field takes digits and deletions, and Escape and Enter do nothing", () => {
  const { reorder } = enterReorder(measuredCluster());
  assert.equal(CR.typeInField(reorder, "Escape"), reorder);
  assert.equal(CR.typeInField(reorder, "Enter"), reorder);
  assert.equal(CR.typeInField(reorder, "ArrowUp"), reorder, "report §4: Up and Down do not step it");
  const typed = CR.typeInField(reorder, "2");
  assert.deepEqual([typed.fieldText, typed.typed], ["2", true], "the selected text is replaced");
  assert.equal(CR.typeInField(typed, "Backspace").fieldText, "");
  // A typed 2 is used by the next click (report §4); above the last number it is taken as the last (unverified).
  const p = enterReorder(measuredCluster());
  assert.deepEqual(CR.newNumbers(CR.pressInReorder({ ...p, reorder: CR.typeInField(p.reorder, "2") }, CAT, { element: STRING }).reorder), [2, 0, 1]);
  assert.deepEqual(CR.newNumbers(CR.pressInReorder({ ...p, reorder: CR.typeInField(p.reorder, "9") }, CAT, { element: STRING }).reorder), [2, 0, 1]);
});

test("the row is greyed on an empty cluster and live on one with elements", () => {
  const entry = INV.entrada("palette.controls.modern.data-containers.cluster");
  const empty = place(P.inicial(), entry.bloque, { x: 300, y: 300 }, entry.config);
  const rowOf = (p) => menuRows(shellMenu(p)).find((row) => row.label === "Reorder Controls In Cluster...");
  assert.equal(rowOf(empty).greyed, true, "report cluster-panel §3: greyed when empty");
  assert.equal(enterReorder(empty).reorder, undefined);
  assert.equal(rowOf(measuredCluster()).greyed, false);
});

test("each element is framed with its badge: the new number white on black, the current one black on white", () => {
  let p = enterReorder(measuredCluster());
  p = CR.pressInReorder(p, CAT, { element: NUMERIC });
  const html = P.contenido(p, CTX);
  const frames = [...html.matchAll(/data-reorder-element="(\d)"[^>]*>.*?sd-reorder-new">(\d)<.*?sd-reorder-current">(\d)</g)].map((m) => m.slice(1).map(Number));
  assert.deepEqual(frames, [[STRING, 1, 0], [BOOLEAN, 2, 1], [NUMERIC, 0, 2]]);
  assert.equal(oldSchoolToken("--reorder-panel-background"), "#5a5a5a");
  assert.equal(oldSchoolToken("--reorder-new-background"), "#000000");
  assert.equal(oldSchoolToken("--reorder-button-disabled"), "#666666");
  assert.doesNotMatch(P.contenido(measuredCluster(), CTX), /sd-reorder-frame/, "no frames out of the mode");
});

test("the window replaces its toolbar with ✓, ✗, the text and the field, and greys the Edit menu", () => {
  const { reorder } = enterReorder(measuredCluster());
  const window = V.ventana(INV, "front-panel", {}, { reorder });
  assert.match(window, /class="sd-reorder-toolbar"/);
  assert.doesNotMatch(window, /data-id="window\.front-panel\.toolbar\.run"/, "report §2: the whole toolbar is replaced");
  assert.match(window, /class="lienzo lienzo-front-panel[^"]*reordenando/);
  assert.match(window, /class="menu[^"]*desactivado[^"]*" data-id="window\.front-panel\.menu\.edit"/);
  assert.match(reorderToolbarHtml(reorder), /data-reorder="cancel"[^>]*/);
  assert.match(reorderToolbarHtml(reorder), /sd-reorder-button desactivado" data-reorder="cancel"/, "✗ grey before a change");
  assert.match(reorderToolbarHtml(reorder), /Click to set to/);
  assert.match(reorderToolbarHtml(reorder), /sd-reorder-field-text seleccionado">0</);
  assert.deepEqual([REORDER_TOOLBAR.ok.width, REORDER_TOOLBAR.ok.height, REORDER_TOOLBAR.cancel.width, REORDER_TOOLBAR.field.width, REORDER_TOOLBAR.field.height], [11, 10, 13, 32, 17]);
  assert.doesNotMatch(V.ventana(INV, "front-panel", {}, {}), /sd-reorder-toolbar/);
});
