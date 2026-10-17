// Format Into String and Scan From String as nodes of the Block Diagram, measured in LabVIEW 2026 Q3
// (labview-captures/format-scan/): their size, their terminals, the stretching by rows, the box with
// the type of each row and their right-click menus. No browser needed.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import { caja, contexto, glifosPorBloque, terminales } from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { DBL } from "../../core/model/types.mjs";
import { CAT, INV } from "../helpers.mjs";
import { oldSchoolToken } from "./old-school-theme.mjs";

const CTX = contexto(CAT, glifosPorBloque(INV), ",");
const FONDO = { tipo: "fondo" };
const STEP = 8;

/** Picks a block from the palette and clicks the canvas at `p`. */
function place(d, block, p) {
  d = ED.coger(d, block);
  d = ED.moverA(d, CTX, p);
  return ED.pulsar(d, CTX, FONDO, p);
}

const nodeOf = (d, id = d.g.nodos[0].id) => d.g.nodos.find((n) => n.id === id);
const spots = (d, id) => Object.fromEntries(terminales(nodeOf(d, id), CTX).map((t) => [t.puerto, [t.x - nodeOf(d, id).x, t.y - nodeOf(d, id).y]]));
const rows = (d, id) => nodeOf(d, id).config.inputs;

/** Stretches the node by its bottom handle by `delta` px. */
function stretch(d, id, delta) {
  d = { ...d, seleccion: [id] };
  d = ED.pulsar(d, CTX, { tipo: "asa", nodo: id, lado: "abajo" }, { x: 100, y: 100 });
  d = ED.moverA(d, CTX, { x: 100, y: 100 + delta });
  return ED.soltar(d, CTX, FONDO, { x: 100, y: 100 + delta });
}

/** Wires an output of a new block to a port of the node. */
function wire(d, id, port, dir, source) {
  const r = Gr.crearNodo(d.g, CAT, source.block, 0, 200);
  const [from, to] = dir === "in" ? [{ nodo: r.id, puerto: source.port, dir: "out" }, { nodo: id, puerto: port, dir: "in" }] : [{ nodo: id, puerto: port, dir: "out" }, { nodo: r.id, puerto: source.port, dir: "in" }];
  return { ...d, g: Gr.conectar(r.g, CAT, from, to).g };
}

test("Format Into String is placed at 32 by 29 with its terminals where LabVIEW has them", () => {
  const d = place(ED.inicial(), "format-into-string", { x: 400, y: 300 });
  const box = caja(nodeOf(d), CTX);
  assert.deepEqual([box.ancho, box.alto], [32, 29]);
  // Centred on the click (format-scan/03-fmt-placed.png).
  assert.ok(Math.abs(box.x + box.ancho / 2 - 400) <= 0.5 && Math.abs(box.y + box.alto / 2 - 300) <= 0.5, "centred on the click, to the pixel");
  const at = spots(d);
  assert.deepEqual(Object.keys(at), ["format-string", "initial-string", "error-in", "input-0", "resulting-string", "error-out"]);
  assert.deepEqual(at["format-string"], [16, 0], "the format string comes in on top");
  assert.deepEqual([at["initial-string"][0], at["error-in"][0], at["input-0"][0]], [0, 0, 0], "initial string, error in and the rows on the left");
  assert.deepEqual([at["resulting-string"][0], at["error-out"][0]], [32, 32], "resulting string and error out on the right");
  assert.ok(at["initial-string"][1] < at["error-in"][1] && at["error-in"][1] < at["input-0"][1]);
  assert.equal(terminales(nodeOf(d), CTX).find((t) => t.puerto === "format-string").lado, "top");
  // The tips are the names of the context help (format-scan/02-qd.png).
  assert.deepEqual(terminales(nodeOf(d), CTX).map((t) => t.etiqueta), ["format string", "initial string", "error in (no error)", "input 1", "resulting string", "error out"]);
});

// The yellow and the dark border were measured in LabVIEW (format-scan/03z.png); the drawing asks for the tokens of the theme.
test("a Format Into String body takes the node fill and border from the theme", () => {
  const d = place(ED.inicial(), "format-into-string", { x: 400, y: 300 });
  const drawing = D.contenido(d, CTX, Gr.tipos(d.g, CAT));
  assert.match(drawing, /fill="var\(--node-fill\)" stroke="var\(--format-node-border\)"/);
  assert.equal(oldSchoolToken("--node-fill"), "#ffffcc");
  assert.equal(oldSchoolToken("--format-node-border"), "#4c4c3d");
});

test("Scan From String is placed at 32 by 37 with its terminals where LabVIEW has them", () => {
  const d = place(ED.inicial(), "scan-from-string", { x: 400, y: 300 });
  const box = caja(nodeOf(d), CTX);
  assert.deepEqual([box.ancho, box.alto], [32, 37]);
  assert.ok(Math.abs(box.x + box.ancho / 2 - 400) <= 0.5 && Math.abs(box.y + box.alto / 2 - 300) <= 0.5, "centred on the click, to the pixel");
  const at = spots(d);
  assert.deepEqual(Object.keys(at), ["input-string", "format-string", "initial-scan-location", "error-in", "default-0", "remaining-string", "offset-past-scan", "error-out", "output-0"]);
  assert.deepEqual(at["format-string"], [16, 0]);
  for (const left of ["input-string", "initial-scan-location", "error-in", "default-0"]) assert.equal(at[left][0], 0, left);
  for (const right of ["remaining-string", "offset-past-scan", "error-out", "output-0"]) assert.equal(at[right][0], 32, right);
  // Each default is level with its output (format-scan/30-scan-context-help.png).
  assert.equal(at["default-0"][1], at["output-0"][1]);
  assert.equal(at["error-in"][1], at["error-out"][1]);
});

test("stretching Format Into String by its bottom handle adds rows of 8 px, and shrinking only removes unwired ones", () => {
  let d = place(ED.inicial(), "format-into-string", { x: 400, y: 300 });
  const id = d.g.nodos[0].id;
  assert.match(D.contenido({ ...d, seleccion: [id], sobre: { nodo: id } }, CTX, Gr.tipos(d.g, CAT)), /class="asa" [^>]*data-asa="abajo"/, "the handle shows when the selected node is hovered");
  d = stretch(d, id, 3 * STEP);
  assert.equal(rows(d, id), 4);
  assert.deepEqual([caja(nodeOf(d, id), CTX).ancho, caja(nodeOf(d, id), CTX).alto], [32, 29 + 3 * STEP], "taller by 8 px a row, as wide as before");
  assert.deepEqual(Object.keys(spots(d, id)).filter((name) => name.startsWith("input-")), ["input-0", "input-1", "input-2", "input-3"]);
  assert.equal(spots(d, id)["input-3"][1] - spots(d, id)["input-2"][1], STEP);
  // The second row has a wire: the node cannot shrink beyond it.
  d = wire(d, id, "input-1", "in", { block: "num-const", port: "result" });
  d = stretch(d, id, -10 * STEP);
  assert.equal(rows(d, id), 2, "stops at the last wired row");
  assert.equal(d.g.cables.length, 1);
  // Never fewer than one.
  d = { ...d, g: Gr.borrar(d.g, [d.g.nodos[1].id]) };
  d = stretch(d, id, -10 * STEP);
  assert.equal(rows(d, id), 1);
});

test("stretching Scan From String adds a default and an output at a time", () => {
  let d = place(ED.inicial(), "scan-from-string", { x: 400, y: 300 });
  const id = d.g.nodos[0].id;
  d = stretch(d, id, 2 * STEP);
  assert.equal(rows(d, id), 3);
  assert.equal(caja(nodeOf(d, id), CTX).alto, 37 + 2 * STEP);
  const names = Object.keys(spots(d, id));
  assert.deepEqual(names.filter((name) => /^(default|output)-/.test(name)), ["default-0", "default-1", "default-2", "output-0", "output-1", "output-2"]);
  // A wire on an output keeps its row.
  d = wire(d, id, "output-1", "out", { block: "indicator", port: "value" });
  d = stretch(d, id, -5 * STEP);
  assert.equal(rows(d, id), 2);
});

test("the type box of each row follows what is wired", () => {
  let d = place(ED.inicial(), "format-into-string", { x: 400, y: 300 });
  const id = d.g.nodos[0].id;
  d = stretch(d, id, STEP);
  const boxes = (state) => [...D.contenido(state, CTX, Gr.tipos(state.g, CAT)).matchAll(/<g class="caja-tipo">.*?fill="(#[0-9a-f]+)">([^<]+)<\/text>/gi)].map((m) => [m[2], m[1].toLowerCase()]);
  assert.deepEqual(boxes(d), [["DBL", "#ff7f00"], ["DBL", "#ff7f00"]], "an unwired row is DBL");
  d = wire(d, id, "input-0", "in", { block: "str-const", port: "result" });
  assert.deepEqual(boxes(d)[0], ["abc", "#ff00ff"], "a string row is pink");
  d = wire(d, id, "input-1", "in", { block: "bool-const", port: "result" });
  assert.deepEqual(boxes(d)[1][0], "TF");
  assert.equal(boxes(d)[1][1], "#007f00", "a Boolean row is green");
  const scan = place(ED.inicial(), "scan-from-string", { x: 400, y: 300 });
  assert.deepEqual(boxes(scan), [["DBL", "#ff7f00"]], "Scan From String shows its output types");
  const wired = wire(scan, scan.g.nodos[0].id, "default-0", "in", { block: "num-const", port: "result" });
  assert.equal(boxes(wired).length, 1);
});

/** The rows of a right-click menu, with the ones that are greyed marked. */
const menuRows = (root, variants) => [...D.menuContextual(INV, { raiz: root, x: 0, y: 0 }, new Set(), undefined, variants).matchAll(/class="item-menu([^"]*)" data-id="([^"]+)"/g)].map((m) => [m[2].slice(root.length + 1), /hueco|desactivado/.test(m[1])]);
const names = (list) => list.map(([name]) => name);

test("the menu of Format Into String has LabVIEW's rows in its order", () => {
  const d = place(ED.inicial(), "format-into-string", { x: 400, y: 300 });
  assert.equal(D.menuDe(nodeOf(d), null, d.g), "context.format-into-string");
  const list = menuRows("context.format-into-string");
  assert.deepEqual(names(list), ["visible-items", "help", "examples", "description-and-tip", "add-breakpoint", "string-palette", "dialog-and-user-interface-palette", "cluster-class-and-variant-palette", "create", "replace", "edit-format-string", "remove-and-rewire", "properties"]);
  assert.deepEqual(INV.hijos("context.format-into-string.visible-items").map((e) => e.etiqueta), ["Label"]);
  // The dialog is not built: its row is greyed and says why (DT-035).
  assert.ok(Object.fromEntries(list)["edit-format-string"]);
  assert.match(INV.explicacion(INV.entrada("context.format-into-string.edit-format-string")).solder, /formato|format/i);
  assert.deepEqual(INV.hijos("context.format-into-string.create").map((e) => e.etiqueta).slice(0, 3), ["Constant", "Control", "Indicator"]);
});

test("the menu of Scan From String has LabVIEW's rows in its order", () => {
  const d = place(ED.inicial(), "scan-from-string", { x: 400, y: 300 });
  assert.equal(D.menuDe(nodeOf(d), null, d.g), "context.scan-from-string");
  assert.equal(D.menuDe(nodeOf(d), "input-string", d.g), "context.scan-from-string", "a fixed terminal has the node's menu");
  assert.deepEqual(names(menuRows("context.scan-from-string")), ["visible-items", "help", "examples", "description-and-tip", "add-breakpoint", "string-palette", "numeric-palette", "create", "replace", "edit-scan-string", "remove-and-rewire", "properties"]);
});

test("the menu of a row of Scan From String adds Add and Remove Parameter", () => {
  let d = place(ED.inicial(), "scan-from-string", { x: 400, y: 300 });
  const id = d.g.nodos[0].id;
  for (const port of ["default-0", "output-0"]) assert.equal(D.menuDe(nodeOf(d), port, d.g), "context.scan-from-string-parameter", port);
  const root = "context.scan-from-string-parameter";
  assert.deepEqual(names(menuRows(root)), ["visible-items", "help", "examples", "description-and-tip", "add-breakpoint", "add-parameter", "remove-parameter", "string-palette", "numeric-palette", "create", "replace", "edit-scan-string", "remove-and-rewire", "properties"]);
  // With one row there is nothing to remove: the row is greyed.
  d = ED.abrirMenu(d, root, id, 50, 50, "default-0");
  assert.ok(ED.variantes(d, CTX).desactivados.has(`${root}.remove-parameter`));
  assert.ok(!ED.variantes(d, CTX).desactivados.has(`${root}.add-parameter`));
});

test("Add and Remove Parameter on a row of Scan From String keep the wires of the rest", () => {
  let d = place(ED.inicial(), "scan-from-string", { x: 400, y: 300 });
  const id = d.g.nodos[0].id;
  const root = "context.scan-from-string-parameter";
  d = stretch(d, id, STEP);
  d = wire(d, id, "default-1", "in", { block: "num-const", port: "result" });
  d = wire(d, id, "output-1", "out", { block: "indicator", port: "value" });
  const wiredPorts = (state) => state.g.cables.map((c) => (c.a.nodo === id ? c.a.puerto : c.de.puerto)).sort();
  assert.deepEqual(wiredPorts(d), ["default-1", "output-1"]);
  // Add Parameter on row 0: a new row 1 and the wired one moves down to row 2.
  d = ED.abrirMenu(d, root, id, 50, 50, "default-0");
  d = ED.orden(d, `${root}.add-parameter`, CTX);
  assert.equal(d.menu, null);
  assert.equal(rows(d, id), 3);
  assert.deepEqual(wiredPorts(d), ["default-2", "output-2"]);
  // Remove Parameter on row 1 (unwired): the wired row comes back up.
  d = ED.abrirMenu(d, root, id, 50, 50, "output-1");
  d = ED.orden(d, `${root}.remove-parameter`, CTX);
  assert.equal(rows(d, id), 2);
  assert.deepEqual(wiredPorts(d), ["default-1", "output-1"]);
  // Remove Parameter on the wired row takes its wires with it.
  d = ED.abrirMenu(d, root, id, 50, 50, "default-1");
  d = ED.orden(d, `${root}.remove-parameter`, CTX);
  assert.equal(rows(d, id), 1);
  assert.equal(d.g.cables.length, 0);
  // The last row stays.
  d = ED.abrirMenu(d, root, id, 50, 50, "default-0");
  assert.equal(rows(ED.orden(d, `${root}.remove-parameter`, CTX), id), 1);
});

test("a stretched Scan From String resolves the type of its new rows", () => {
  let d = place(ED.inicial(), "scan-from-string", { x: 400, y: 300 });
  d = stretch(d, d.g.nodos[0].id, 2 * STEP);
  assert.equal(Gr.tipos(d.g, CAT).salidas.get(`${d.g.nodos[0].id}.output-2`), DBL);
});

// labview-captures/format-scan/16-node-stretched.png: after input 1 became I8, stretching gave I8 rows.
test("a stretched or added row copies the type of the row above, and keeps it unwired", async () => {
  const Gr = await import("../../core/model/graph.mjs");
  const { CAT } = await import("../helpers.mjs");
  const F = await import("../../editor/src/block-diagram/format-nodes.mjs");
  let r = Gr.crearNodo(Gr.nuevo(), CAT, "format-into-string", 0, 0);
  const node = r.id;
  r = Gr.crearNodo(r.g, CAT, "num-const", 0, 0);
  let g = Gr.fijarConfig(r.g, r.id, { type: "i8", value: 1 });
  g = Gr.conectar(g, CAT, { nodo: r.id, puerto: "result", dir: "out" }, { nodo: node, puerto: "input-0", dir: "in" }).g;
  g = F.stretchedRows(g, node, CAT, 2);
  const types = () => [0, 1, 2].map((k) => Gr.tipos(g, CAT).entradas.get(`${node}.input-${k}`));
  assert.deepEqual(types(), ["i8", "i8", "i8"]);
  g = Gr.borrar(g, [r.id]);
  assert.deepEqual(types().slice(1), ["i8", "i8"], "the stretched rows keep their type without a wire");
  g = F.removedRow(g, node, CAT, 0);
  assert.deepEqual(g.nodos.find((n) => n.id === node).config.rowTypes, ["i8", "i8"]);
});

// When the handles of a stretchable node show (reports/2026-10-15-editor-wide.md Q1): a selected node while the mouse is
// over it; any node while the mouse is on a handle; nothing on a selected node with the mouse away, or on the body of an
// unselected one. The same rule holds for every stretchable node, Compound Arithmetic among them.
test("the stretch handles show while the mouse is over a selected node or on a handle", () => {
  for (const block of ["format-into-string", "compound-arithmetic"]) {
    const placed = place(ED.inicial(), block, { x: 400, y: 300 });
    const id = placed.g.nodos[0].id;
    const visible = (d) => /class="asa" /.test(D.contenido(d, CTX, Gr.tipos(d.g, CAT)));
    const selected = { ...placed, seleccion: [id] };
    const unselected = { ...placed, seleccion: [] };
    assert.equal(visible(ED.sobrevolar(selected, FONDO)), false, `${block}: selected, mouse away`);
    assert.equal(visible(ED.sobrevolar(selected, { tipo: "nodo", id })), true, `${block}: selected and hovered`);
    assert.equal(visible(ED.sobrevolar(selected, { tipo: "terminal", nodo: id, puerto: "result", dir: "out" })), true, `${block}: on a terminal of the selected node`);
    assert.equal(visible(ED.sobrevolar(unselected, { tipo: "nodo", id })), false, `${block}: the body of an unselected node`);
    assert.match(D.contenido(unselected, CTX, Gr.tipos(placed.g, CAT)), /class="asa oculta"/, `${block}: unseen, the handles are there to be found`);
    assert.equal(visible(ED.sobrevolar(unselected, { tipo: "asa", nodo: id, lado: "abajo" })), true, `${block}: on a handle of an unselected node`);
    const dragging = ED.pulsar(unselected, CTX, { tipo: "asa", nodo: id, lado: "abajo" }, { x: 100, y: 100 });
    assert.equal(visible(ED.sobrevolar(dragging, FONDO)), true, `${block}: while its handle is dragged`);
  }
});
