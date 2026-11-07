// Free labels on the Block Diagram (DT-085), as measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-07-free-labels-look.md): created by a double click on empty space, typed with
// Enter for a new line, confirmed by a click away or Ctrl+Enter, gone when confirmed empty or cancelled with Escape,
// and drawn as a bordered box whose size follows the text. No browser needed.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as FL from "../../editor/src/common/free-labels.mjs";
import * as H from "../../editor/src/block-diagram/undo-history.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { FREE_LABEL } from "../../core/model/free-label.mjs";
import { CAT, INV } from "../helpers.mjs";

/** Text widths deduced from the measured boxes (the panel's "Hello" is 29 = 27 + 2, the diagram's 33 = 27 + 6), so the
 * same widths must give every measured box on both canvases. */
const MEASURED_TEXT_WIDTHS = { "": 0, Hello: 27, World: 31, Btn: 17, Tool: 23, Zed: 19, Away: 28 };
const measure = (text) => MEASURED_TEXT_WIDTHS[text] ?? [...text].length * 6.1;
const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",", measure);
const FONDO = { tipo: "fondo" };
const CLICK = { x: 600, y: 300 };

const freeLabels = (d) => d.g.nodos.filter((n) => n.tipo === FREE_LABEL);
const typeKeys = (d, keys) => keys.reduce((state, key) => ED.teclear(state, key), d);

test("a double click on empty space starts a free label 7 px above the click, typed into at once", () => {
  const d = ED.startFreeLabel(ED.inicial(), CTX, CLICK);
  const [label] = freeLabels(d);
  assert.deepEqual({ x: label.x, y: label.y }, { x: 600, y: 293 });
  assert.equal(d.edicion.nodo, label.id);
  assert.equal(d.edicion.libre, true);
  assert.deepEqual(D.caja(label, CTX, d.edicion), { x: 600, y: 293, ancho: 11, alto: 17 }, "empty: 11 x 17");
});

test("Enter starts another line and a click away confirms; the box fits the text as LabVIEW's does", () => {
  let d = typeKeys(ED.startFreeLabel(ED.inicial(), CTX, CLICK), [..."Hello"]);
  assert.deepEqual(D.caja(freeLabels(d)[0], CTX, d.edicion), { x: 600, y: 293, ancho: 33, alto: 17 });
  d = typeKeys(d, ["Enter", ..."World"]);
  d = ED.pulsar(d, CTX, FONDO, { x: 900, y: 500 });
  const [label] = freeLabels(d);
  assert.equal(d.edicion, null);
  assert.equal(label.label.text, "Hello\nWorld");
  assert.deepEqual(D.caja(label, CTX), { x: 600, y: 293, ancho: 37, alto: 32 });
  assert.deepEqual(d.seleccion, [], "a confirmed label is not selected");
});

test("the measured one-line boxes", () => {
  for (const [text, width] of [["Btn", 23], ["Tool", 29], ["Zed", 25], ["Away", 34]]) {
    const d = ED.confirmar(typeKeys(ED.startFreeLabel(ED.inicial(), CTX, CLICK), [...text]), CTX);
    assert.equal(D.caja(freeLabels(d)[0], CTX).ancho, width, text);
  }
});

test("confirmed empty or cancelled with Escape, a new label vanishes and leaves no step of undo", () => {
  const before = ED.inicial();
  const history = H.nuevo(before.g);
  const empty = ED.confirmar(ED.startFreeLabel(before, CTX, CLICK), CTX);
  assert.equal(empty.g, before.g);
  assert.equal(H.registrar(history, empty.g), history);
  const cancelled = ED.escape(typeKeys(ED.startFreeLabel(before, CTX, CLICK), [..."Gone"]));
  assert.equal(cancelled.g, before.g);
  assert.equal(cancelled.edicion, null);
});

test("one step of undo removes a confirmed label", () => {
  const before = ED.inicial();
  let history = H.nuevo(before.g);
  const confirmed = ED.confirmar(typeKeys(ED.startFreeLabel(before, CTX, CLICK), [..."Btn"]), CTX);
  history = H.registrar(history, confirmed.g);
  assert.equal(H.deshacer(history).g, before.g);
});

test("typing into an existing label again selects all its text; Escape keeps it as it was, emptying it removes it", () => {
  const confirmed = ED.confirmar(typeKeys(ED.startFreeLabel(ED.inicial(), CTX, CLICK), [..."Hello"]), CTX);
  const id = freeLabels(confirmed)[0].id;
  const again = ED.editFreeLabel(confirmed, id);
  assert.equal(again.edicion.todo, true);
  assert.equal(ED.escape(typeKeys(again, [..."X"])).g, confirmed.g);
  const emptied = ED.confirmar(typeKeys(again, ["Backspace"]), CTX);
  assert.deepEqual(freeLabels(emptied), []);
});

test("a label started inside a While Loop belongs to it", () => {
  const structure = Gr.crearEstructura(Gr.nuevo(), CAT, "while-loop", 500, 200, 300, 200);
  const d = ED.startFreeLabel({ ...ED.inicial(), g: structure.g }, CTX, CLICK);
  assert.equal(freeLabels(d)[0].dentro, structure.id);
});

test("a free label of the panel is not on the diagram, nor in its Select All", () => {
  const created = Gr.crearNodo(Gr.nuevo(), CAT, FREE_LABEL, undefined, undefined);
  const g = { ...created.g, nodos: created.g.nodos.map((n) => ({ ...n, panel: { x: 10, y: 10 }, label: { text: "panel" } })) };
  assert.deepEqual(D.visibles(g).nodos, []);
  assert.deepEqual(ED.selectAll({ ...ED.inicial(), g }).seleccion, []);
});

test("the corner for a click on each canvas", () => {
  assert.deepEqual(FL.cornerForClick("diagrama", CLICK), { x: 600, y: 293 });
  assert.deepEqual(FL.cornerForClick("panel", CLICK), { x: 601, y: 294 });
});
