// Write and Read Delimited Spreadsheet in the editor (DT-067 §10 (c)): placed from Functions ▸ Programming ▸ File I/O,
// with LabVIEW's terminal rectangles and Read's instance ring, which chooses the type of its arrays
// (labview-captures/reports/2026-10-28-delimited-spreadsheet.md Q1).

import assert from "node:assert/strict";
import { test } from "node:test";

import * as Gr from "../../core/model/graph.mjs";
import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import { INSTANCE_RING } from "../../editor/src/block-diagram/spreadsheet-nodes.mjs";
import { CAT, INV } from "../helpers.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",", undefined, "windows");
const ROOT = "palette.functions.programming.file-io";
const WRITE = "write-delimited-spreadsheet-vi";
const READ = "read-delimited-spreadsheet-vi";

function withNode(block, x = 100, y = 60) {
  const created = Gr.crearNodo(Gr.nuevo(), CAT, block, x, y);
  return { d: { ...ED.inicial(), g: created.g }, id: created.id };
}
const nodeOf = (d, id) => d.g.nodos.find((n) => n.id === id);
const zones = (d, id) => {
  const node = nodeOf(d, id);
  return Object.fromEntries(D.terminales(node, CTX).map((t) => [t.puerto, [t.zona.x - node.x, t.zona.y - node.y, t.zona.ancho, t.zona.alto]]));
};

test("both VIs are placed from the File I/O palette", () => {
  for (const block of [WRITE, READ]) {
    const entry = INV.entrada(`${ROOT}.${block}`);
    assert.equal(entry.estado, "built", block);
    assert.equal(entry.bloque, block);
  }
});

test("Q1: the terminal rectangles are LabVIEW's", () => {
  const write = withNode(WRITE);
  assert.deepEqual(zones(write.d, write.id), {
    "file-path": [0, 0, 7, 7], format: [7, 0, 6, 16], "2d-data": [0, 7, 7, 6], "1d-data": [0, 13, 7, 6], append: [0, 19, 7, 6],
    "error-in": [0, 25, 7, 7], transpose: [7, 16, 6, 16], delimiter: [13, 16, 6, 16], "new-file-path": [25, 0, 7, 7], "error-out": [25, 25, 7, 7],
  });
  const read = withNode(READ);
  assert.deepEqual(zones(read.d, read.id), {
    "file-path": [0, 0, 7, 7], format: [7, 0, 6, 16], "number-of-rows": [0, 7, 7, 6], "start-of-read-offset": [0, 13, 7, 6],
    "max-characters": [0, 19, 7, 6], "error-in": [0, 25, 7, 7], transpose: [7, 16, 6, 16], delimiter: [13, 16, 6, 16],
    "new-file-path": [25, 0, 7, 7], "all-rows": [25, 7, 7, 6], "first-row": [25, 13, 7, 6], "mark-after-read": [25, 19, 7, 6],
    eof: [19, 16, 6, 16], "error-out": [25, 25, 7, 7],
  });
});

test("Q1: Read shows its instance ring and Write does not", () => {
  const html = (d) => D.contenido(d, CTX, Gr.tipos(d.g, CAT));
  assert.match(html(withNode(READ).d), /class="anillo-instancia"[^>]*><span class="texto-anillo">Double</);
  assert.doesNotMatch(html(withNode(WRITE).d), /anillo-instancia/);
});

test("Q1: a click on the ring lists the four instances, and choosing one gives the arrays its type", () => {
  let { d, id } = withNode(READ);
  const node = nodeOf(d, id);
  const onRing = { x: node.x + INSTANCE_RING.x + 5, y: node.y + INSTANCE_RING.y + 5 };
  d = ED.pulsar(d, CTX, { tipo: "nodo", id, anillo: true }, onRing);
  assert.deepEqual(d.lista, { nodo: id, x: onRing.x, y: onRing.y });
  const list = D.contenido(d, CTX, Gr.tipos(d.g, CAT));
  assert.deepEqual([...list.matchAll(/data-instancia="([^"]+)"/g)].map(([, value]) => value), ["double", "integer", "string", "utf-8-string"]);
  assert.match(list, /item-instancia marcado" data-nodo="[^"]+" data-instancia="double"/);
  d = ED.pulsar(d, CTX, { tipo: "fila-instancia", nodo: id, instancia: "integer" }, onRing);
  assert.equal(d.lista, null);
  const types = Gr.tipos(d.g, CAT).salidas;
  assert.deepEqual(types.get(`${id}.all-rows`), { array: "i64", dims: 2 });
  assert.deepEqual(types.get(`${id}.first-row`), { array: "i64" });
});
