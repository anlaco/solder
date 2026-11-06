// Bundle By Name as a node of the Block Diagram, the mirror of Unbundle By Name, measured in LabVIEW
// 2026 Q3 (labview-captures/reports/2026-11-06-bundle-by-name.md): its size, rows, terminals, the
// stretching, the list of names and the menus it shares with Unbundle By Name. No browser needed.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import { caja, contexto, glifosPorBloque, terminales } from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as UN from "../../editor/src/block-diagram/unbundle-by-name.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { CAT, INV } from "../helpers.mjs";

// The editor font's widths of these names, as in test/editor/unbundle-by-name.test.mjs.
const EDITOR_FONT_WIDTHS = { status: 33, source: 36 };
const measure = (text) => EDITOR_FONT_WIDTHS[text] ?? [...text].length * 6.1;
const CTX = contexto(CAT, glifosPorBloque(INV), ",", measure);
const FONDO = { tipo: "fondo" };
const MENU_ID = "palette.functions.programming.cluster-class-and-variant.bundle-by-name";

const nodeOf = (d, id) => d.g.nodos.find((n) => n.id === id);
const boxOf = (d, id) => caja(nodeOf(d, id), CTX);
const sizeOf = (d, id) => [boxOf(d, id).ancho, boxOf(d, id).alto];

/** A fresh Bundle By Name (picked from the palette and clicked on the canvas) and an Error Cluster Constant. */
function freshDiagram() {
  let d = ED.coger(ED.inicial(), "bundle-by-name");
  d = ED.moverA(d, CTX, { x: 400, y: 300 });
  d = ED.pulsar(d, CTX, FONDO, { x: 400, y: 300 });
  const bundle = d.g.nodos[0].id;
  const constant = Gr.crearNodo(d.g, CAT, "error-cluster-constant", 0, 200);
  return { d: { ...d, g: constant.g }, bundle, constant: constant.id };
}

function wired(rows = 1) {
  const { d, bundle, constant } = freshDiagram();
  const g = Gr.conectar(d.g, CAT, { nodo: constant, puerto: "result", dir: "out" }, { nodo: bundle, puerto: "cluster", dir: "in" }).g;
  return { d: { ...d, g: Gr.resizeUnbundleRows(g, CAT, bundle, rows) }, bundle };
}

const offsets = (d, id) => {
  const box = boxOf(d, id);
  return terminales(nodeOf(d, id), CTX).map((t) => [t.puerto, t.dir, t.x - box.x, t.y - box.y]);
};

test("Bundle By Name is placed from the palette with its terminals", () => {
  const entry = INV.entrada(MENU_ID);
  assert.equal(entry.estado, "built");
  assert.equal(entry.bloque, "bundle-by-name");
  const { d, bundle } = freshDiagram();
  // Fresh and unwired: 30 by 17, centred on the click; input cluster on top at 18 px, output on the right.
  assert.deepEqual(sizeOf(d, bundle), [30, 17]);
  const box = boxOf(d, bundle);
  assert.ok(Math.abs(box.x + box.ancho / 2 - 400) <= 0.5 && Math.abs(box.y + box.alto / 2 - 300) <= 0.5, "centred on the click");
  assert.deepEqual(offsets(d, bundle), [["cluster", "in", 18, 0], ["output-cluster", "out", 30, 8.5]]);
});

test("wired, rows grow 16 px each; the inputs go on the left edge at each row and the output at the middle of the right edge", () => {
  const { d, bundle } = wired(3);
  assert.deepEqual(sizeOf(d, bundle), [58, 49]);
  assert.deepEqual(offsets(d, bundle), [
    ["cluster", "in", 46, 0],
    ["element-0", "in", 0, 8.5],
    ["element-1", "in", 0, 24.5],
    ["element-2", "in", 0, 40.5],
    ["output-cluster", "out", 58, 24.5],
  ]);
  assert.deepEqual(sizeOf(wired(1).d, wired(1).bundle), [55, 17]);
});

test("the names are drawn on the left in the colours of their types", () => {
  const { d } = wired(3);
  const html = D.contenido(d, CTX, Gr.tipos(d.g, CAT));
  assert.match(html, /<text class="nombre-fila" x="3" y="8.5" fill="#007f00">status<\/text>/);
  assert.match(html, /fill="#0000ff">code</);
  assert.match(html, /fill="#ff00ff">source</);
});

test("its menus are Unbundle By Name's; Create ▸ Constant wires a constant to a row and Remove Element takes it away", () => {
  const { d, bundle } = wired(2);
  assert.equal(D.menuDe(nodeOf(d, bundle), "element-1", d.g), UN.ROW_MENU);
  assert.equal(D.menuDe(nodeOf(d, bundle), "output-cluster", d.g), UN.BODY_MENU);
  const open = (diagram, port) => ED.abrirMenu(diagram, UN.ROW_MENU, bundle, 0, 0, port);
  const withConstant = ED.createOnTerminal(open(d, "element-1"), CTX, bundle, "element-1", "constant");
  assert.ok(withConstant.g.cables.some((c) => c.a.nodo === bundle && c.a.puerto === "element-1"), "the constant is wired to the row");
  const removed = ED.orden(open({ ...withConstant, menu: null }, "element-1"), "context.unbundle-by-name-row.remove-element", CTX);
  assert.deepEqual(nodeOf(removed, bundle).config.items, ["status"]);
  assert.ok(!removed.g.cables.some((c) => c.a.nodo === bundle && c.a.puerto === "element-1"), "its wire goes with it");
});

test("stretching by the bottom handle adds rows named after the one above", () => {
  let { d, bundle } = wired(1);
  d = { ...d, seleccion: [bundle] };
  d = ED.pulsar(d, CTX, { tipo: "asa", nodo: bundle, lado: "abajo" }, { x: 100, y: 100 });
  d = ED.moverA(d, CTX, { x: 100, y: 132 });
  d = ED.soltar(d, CTX, FONDO, { x: 100, y: 132 });
  assert.deepEqual(nodeOf(d, bundle).config.items, ["status", "code", "source"]);
});
