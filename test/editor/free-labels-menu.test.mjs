// The right-click menus of a free label and its resizing (DT-085), measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-07-free-labels-behaviour.md §1 and §3).

import assert from "node:assert/strict";
import { test } from "node:test";

import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as FL from "../../editor/src/common/free-labels.mjs";
import * as P from "../../editor/src/front-panel/front-panel.mjs";
import { idsPintados } from "../../editor/src/window/window-view.mjs";
import { FREE_LABEL } from "../../core/model/free-label.mjs";
import { CAT, INV } from "../helpers.mjs";

const MEASURED_TEXT_WIDTHS = { "": 0, Hello: 27, World: 31 };
const measure = (text) => MEASURED_TEXT_WIDTHS[text] ?? [...text].length * 6.1;
const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",", measure);
const CLICK = { x: 600, y: 300 };

const typeKeys = (state, keys, teclear) => keys.reduce((typed, key) => teclear(typed, key), state);
const diagramLabel = () => ED.confirmar(typeKeys(ED.startFreeLabel(ED.inicial(), CTX, CLICK), [..."Hello", "Enter", ..."World"], ED.teclear), CTX);
const panelLabel = () => P.confirmar(typeKeys(P.startFreeLabel(P.inicial(), CTX, CLICK), [..."Hello", "Enter", ..."World"], P.teclear));
const labelOf = (state) => state.g.nodos.find((n) => n.tipo === FREE_LABEL);

/** The rows a menu shows, with the ones it ticks. */
function openMenu(state, root) {
  const opened = ED.abrirMenu(state, root, labelOf(state).id, 0, 0);
  const marks = ED.marcados(opened, CTX);
  return { opened, rows: idsPintados(D.menuContextual(INV, opened.menu, marks)).map((id) => id.slice(root.length + 1)), marks };
}

test("the free labels menus have LabVIEW's rows in order", () => {
  const diagram = diagramLabel();
  assert.equal(D.menuDe(labelOf(diagram)), FL.DIAGRAM_MENU_ROOT);
  assert.deepEqual(openMenu(diagram, FL.DIAGRAM_MENU_ROOT).rows, ["visible-items", "quick-change", "size-to-text", "vertical-arrangement", "attach-label-to-object", "text-representation", "properties"]);
  const panel = panelLabel();
  assert.equal(P.menuDe(labelOf(panel)), FL.PANEL_MENU_ROOT);
  assert.deepEqual(openMenu(panel, FL.PANEL_MENU_ROOT).rows, ["visible-items", "quick-change", "size-to-text", "enable-hyperlinks", "vertical-arrangement", "properties"]);
  assert.ok(openMenu(panel, FL.PANEL_MENU_ROOT).marks.has(`${FL.PANEL_MENU_ROOT}.enable-hyperlinks`));
  assert.ok(openMenu(diagram, FL.DIAGRAM_MENU_ROOT).marks.has(`${FL.DIAGRAM_MENU_ROOT}.text-representation.system-encoding`));
});

test("Size To Text is ticked until the label is resized, and fits it to its text again", () => {
  const before = diagramLabel();
  const label = labelOf(before);
  assert.ok(openMenu(before, FL.DIAGRAM_MENU_ROOT).marks.has(`${FL.DIAGRAM_MENU_ROOT}.size-to-text`));
  // The right-middle handle dragged 40 px to the right: 77 x 32, kept (measured).
  let d = ED.pulsar(before, CTX, { tipo: "asa", nodo: label.id, lado: "e" }, { x: 636, y: 309 });
  d = ED.moverA(d, CTX, { x: 676, y: 309 });
  d = ED.soltar(d, CTX, null, { x: 676, y: 309 });
  assert.deepEqual(D.caja(labelOf(d), CTX), { x: 600, y: 293, ancho: 77, alto: 32 });
  const { opened, marks } = openMenu(d, FL.DIAGRAM_MENU_ROOT);
  assert.ok(!marks.has(`${FL.DIAGRAM_MENU_ROOT}.size-to-text`));
  const fitted = ED.orden(opened, `${FL.DIAGRAM_MENU_ROOT}.size-to-text`, CTX);
  assert.deepEqual(D.caja(labelOf(fitted), CTX), { x: 600, y: 293, ancho: 37, alto: 32 }, "fitted again, its corner kept");
});

test("a resized label keeps its size while typed into, and wraps its text inside the box", () => {
  const d = ED.orden(ED.abrirMenu(diagramLabel(), FL.DIAGRAM_MENU_ROOT, labelOf(diagramLabel()).id, 0, 0), `${FL.DIAGRAM_MENU_ROOT}.size-to-text`, CTX);
  const fixed = labelOf(d);
  assert.deepEqual(fixed.tam, { ancho: 37, alto: 32 }, "unticked, the box stays as it is");
  const typed = ED.confirmar(typeKeys(ED.editFreeLabel(d, fixed.id), [..."A much longer text"], ED.teclear), CTX);
  assert.deepEqual(D.caja(labelOf(typed), CTX), { x: 600, y: 293, ancho: 37, alto: 32 });
  assert.match(FL.textClass(labelOf(typed), null), /con-tamano/);
});

test("a label is never resized smaller than an empty one, and a left handle stops it instead of sliding it", () => {
  const box = { x: 600, y: 293, ancho: 37, alto: 32 };
  const smallest = FL.smallestSize("diagrama");
  assert.deepEqual(smallest, { ancho: 11, alto: 17 });
  assert.deepEqual(FL.stretchedBox(box, "w", 100, 0, smallest), { x: 626, y: 293, ancho: 11, alto: 32 });
  assert.deepEqual(FL.stretchedBox(box, "e", -100, 0, smallest), { x: 600, y: 293, ancho: 11, alto: 32 });
  assert.deepEqual(FL.smallestSize("panel"), { ancho: 7, alto: 15 });
});

test("a panel label is resized by its handles too", () => {
  const before = panelLabel();
  const label = labelOf(before);
  let p = P.pulsar(before, CTX, { tipo: "asa-libre", id: label.id, lado: "e" }, { x: 633, y: 309 });
  p = P.moverA(p, CTX, { x: 653, y: 309 });
  p = P.soltar(p, CTX, null, { x: 653, y: 309 });
  assert.deepEqual(labelOf(p).tam, { ancho: 53, alto: 30 });
  assert.match(P.contenido(p, CTX), /data-asa-libre="e"/);
});

test("the selection marquee is 1 px outside the diagram box (inside its border) and 2 px outside the panel box", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("../../editor/src/styles.css", import.meta.url), "utf8");
  const rule = css.match(/\.etiqueta-libre\.seleccionado::after \{([^}]*)\}/);
  assert.ok(rule, "the marquee rule");
  assert.match(rule[1], /inset: -2px/);
  assert.match(css, /\.nodo\.etiqueta-libre \{[^}]*border: 1px solid/);
});
