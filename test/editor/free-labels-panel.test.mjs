// Free labels on the Front Panel (DT-085), as measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-07-free-labels-look.md): a box with no border, white while typed and only its
// text once confirmed, 1 px right of and 6 px above the double click; on the panel only, never on the diagram.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as P from "../../editor/src/front-panel/front-panel.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { FREE_LABEL } from "../../core/model/free-label.mjs";
import { CAT, INV } from "../helpers.mjs";

/** Text widths deduced from the measured boxes, as in free-labels-diagram.test.mjs. */
const MEASURED_TEXT_WIDTHS = { "": 0, Hello: 27, World: 31 };
const measure = (text) => MEASURED_TEXT_WIDTHS[text] ?? [...text].length * 6.1;
const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",", measure);
const FONDO = { tipo: "fondo" };
const CLICK = { x: 600, y: 300 };

const freeLabels = (p) => p.g.nodos.filter((n) => n.tipo === FREE_LABEL);
const typeKeys = (p, keys) => keys.reduce((state, key) => P.teclear(state, key), p);

test("a double click on empty panel space starts a label at the measured place and sizes", () => {
  let p = P.startFreeLabel(P.inicial(), CTX, CLICK);
  const [label] = freeLabels(p);
  assert.deepEqual(label.panel, { x: 601, y: 294 });
  assert.equal(label.x, undefined, "no place on the diagram");
  assert.deepEqual(P.caja(label, measure, p.edicion), { x: 601, y: 294, ancho: 7, alto: 15, casilla: 0 });
  p = typeKeys(p, [..."Hello"]);
  assert.equal(P.caja(freeLabels(p)[0], measure, p.edicion).ancho, 29);
  p = typeKeys(p, ["Enter", ..."World"]);
  assert.deepEqual(P.caja(freeLabels(p)[0], measure, p.edicion), { x: 601, y: 294, ancho: 33, alto: 30, casilla: 0 });
});

test("typed, the label is a white box; confirmed, only its text", () => {
  let p = typeKeys(P.startFreeLabel(P.inicial(), CTX, CLICK), [..."Hi"]);
  assert.match(P.contenido(p, CTX), /class="objeto-panel etiqueta-libre"[^>]*><div class="texto-etiqueta-libre editando">Hi<span class="caret">/);
  p = P.pulsar(p, CTX, FONDO, { x: 900, y: 500 });
  assert.match(P.contenido(p, CTX), /<div class="texto-etiqueta-libre">Hi<\/div>/);
  assert.equal(p.edicion, null);
});

test("confirmed empty or cancelled, it vanishes and the graph is the one before it", () => {
  const before = P.inicial();
  assert.equal(P.confirmar(P.startFreeLabel(before, CTX, CLICK)).g, before.g);
  assert.equal(P.escape(typeKeys(P.startFreeLabel(before, CTX, CLICK), [..."Gone"])).g, before.g);
});

test("typing into it again selects all its text", () => {
  const p = P.confirmar(typeKeys(P.startFreeLabel(P.inicial(), CTX, CLICK), [..."Hello"]));
  const again = P.editFreeLabel(p, freeLabels(p)[0].id);
  assert.equal(again.edicion.todo, true);
  assert.equal(again.edicion.libre, true);
});

test("a free label of the diagram is not on the panel", () => {
  const created = Gr.crearNodo(Gr.nuevo(), CAT, FREE_LABEL, 10, 10);
  const g = { ...created.g, nodos: created.g.nodos.map((n) => ({ ...n, label: { text: "diagram" } })) };
  assert.equal(P.contenido({ ...P.inicial(), g }, CTX), "");
});
