// Create ▸ Constant / Control / Indicator on a terminal, on a wire and on a whole node: where each object goes
// (labview-captures/create-paste/REPORT.md §A).

import assert from "node:assert/strict";
import { test } from "node:test";

import { caja, contexto, glifosPorBloque, terminales } from "../../editor/src/block-diagram/diagram-view.mjs";
import { ALL_KINDS, CONSTANT_GAP_BY_BLOCK, PANEL_GRID, createForNode, createForTerminal, createOnWire, nextPanelSlot } from "../../editor/src/block-diagram/terminal-creation.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { CAT, INV } from "../helpers.mjs";

const CTX = contexto(CAT, glifosPorBloque(INV), ",");

function nodeAt(block, x, y, g = Gr.nuevo()) {
  const r = Gr.crearNodo(g, CAT, block, x, y);
  return { g: r.g, id: r.id };
}
const box = (g, id) => caja(g.nodos.find((n) => n.id === id), CTX);
const terminalOf = (g, id, port) => terminales(g.nodos.find((n) => n.id === id), CTX).find((t) => t.puerto === port);

test("a constant created on Add's input sits 16 px to its left, centred on the terminal and wired", () => {
  const { g, id: add } = nodeAt("add", 300, 100);
  const r = createForTerminal(g, CTX, { nodo: add, puerto: "a", kind: "constant" });
  assert.ok(r.wired);
  const [constant, terminal] = [box(r.g, r.id), terminalOf(r.g, add, "a")];
  assert.equal(box(r.g, add).x - (constant.x + constant.ancho), 16, "gap from the constant's right edge to the node");
  assert.ok(Math.abs(constant.y + constant.alto / 2 - terminal.y) <= 0.5, "vertically centred on the terminal");
  assert.deepEqual(r.g.cables.map((c) => [c.de.nodo, c.a.nodo, c.a.puerto]), [[r.id, add, "a"]]);
});

test("the nodes measured at 8 px have that gap in the table, and the others use 16", () => {
  assert.deepEqual(Object.keys(CONSTANT_GAP_BY_BLOCK).sort(), ["array-size", "index-array", "simple-error-handler", "string-length", "unbundle"]);
  const { g, id: length } = nodeAt("string-length", 300, 100);
  const r = createForTerminal(g, CTX, { nodo: length, puerto: "string", kind: "constant" });
  const constant = box(r.g, r.id);
  assert.equal(box(r.g, length).x - (constant.x + constant.ancho), 8);
  assert.equal(r.g.nodos.find((n) => n.id === r.id).tipo, "str-const");
});

test("a second constant on the same input is pushed up until the boxes touch, and its wire turns inside the node", () => {
  const { g, id: add } = nodeAt("add", 300, 100);
  const first = createForTerminal(g, CTX, { nodo: add, puerto: "a", kind: "constant" });
  const second = createForTerminal(first.g, CTX, { nodo: add, puerto: "a", kind: "constant" });
  const [low, high] = [box(second.g, first.id), box(second.g, second.id)];
  assert.equal(high.y + high.alto, low.y, "the boxes touch");
  const wire = second.g.cables.find((c) => c.de.nodo === second.id);
  assert.deepEqual(wire.codos, [Math.round(terminalOf(second.g, add, "a").x + 5)]);
  assert.equal(second.g.cables.filter((c) => c.a.puerto === "a").length, 1, "the input keeps the last wire");
});

test("a control on an input is a 38 × 38 terminal 16 px left of the node, labelled with the terminal's name, with its panel object", () => {
  const { g, id: add } = nodeAt("add", 300, 100);
  const r = createForTerminal(g, CTX, { nodo: add, puerto: "a", kind: "control" });
  const control = r.g.nodos.find((n) => n.id === r.id);
  const size = box(r.g, r.id);
  assert.deepEqual([size.ancho, size.alto, box(r.g, add).x - (size.x + size.ancho)], [38, 38, 16]);
  assert.equal(control.label.text, "x");
  assert.deepEqual([control.panel.x, control.panel.y], [PANEL_GRID.originX, PANEL_GRID.originY]);
  const again = createForTerminal(r.g, CTX, { nodo: add, puerto: "a", kind: "control" });
  assert.equal(again.g.nodos.find((n) => n.id === again.id).label.text, "x 2", "the same name again is numbered");
});

test("the controls fill the panel's left column and the indicators start at its horizontal centre", () => {
  const { g, id: add } = nodeAt("add", 300, 100);
  let r = createForTerminal(g, CTX, { nodo: add, puerto: "a", kind: "control" });
  r = createForTerminal(r.g, CTX, { nodo: add, puerto: "b", kind: "control" });
  const [x, y] = [r.g.nodos[1], r.g.nodos[2]].map((n) => n.panel);
  assert.deepEqual([y.x, y.y - x.y], [x.x, PANEL_GRID.rowStep]);
  r = createForTerminal(r.g, CTX, { nodo: add, puerto: "result", kind: "indicator", panelSize: { width: 800, height: 480 } });
  const indicator = r.g.nodos.find((n) => n.id === r.id);
  assert.deepEqual([indicator.panel.x, indicator.panel.y], [400, PANEL_GRID.originY]);
  const next = nextPanelSlot(r.g, { tipo: "indicator", isControl: false, panelSize: { width: 800, height: 480 } });
  assert.equal(next.x, 400 + 54, "the next indicator goes 54 px to the right");
});

test("an indicator on an output is wired 16 px to its right and labelled with the output's name", () => {
  const { g, id: add } = nodeAt("add", 300, 100);
  const r = createForTerminal(g, CTX, { nodo: add, puerto: "result", kind: "indicator" });
  const indicator = r.g.nodos.find((n) => n.id === r.id);
  const node = box(r.g, add);
  assert.equal(box(r.g, r.id).x - (node.x + node.ancho), 16);
  assert.equal(indicator.label.text, "x+y");
  assert.ok(r.wired);
});

test("a constant on an output and an indicator on an input are created unwired, near the node", () => {
  const { g, id: add } = nodeAt("add", 300, 100);
  const constant = createForTerminal(g, CTX, { nodo: add, puerto: "result", kind: "constant" });
  assert.deepEqual([constant.wired, constant.g.cables.length], [false, 0]);
  const above = box(constant.g, constant.id);
  assert.equal(above.y + above.alto, box(constant.g, add).y, "above the node's upper left corner");
  const indicator = createForTerminal(g, CTX, { nodo: add, puerto: "a", kind: "indicator" });
  assert.equal(box(indicator.g, indicator.id).x, box(indicator.g, add).x + box(indicator.g, add).ancho, "touching the node's right edge");
});

test("a type without a block explains it instead of creating anything", () => {
  const { g, id: bundle } = nodeAt("unbundle", 300, 100);
  const r = createForTerminal(g, CTX, { nodo: bundle, puerto: "campo-0", kind: "constant" });
  assert.ok(r.motivo);
});

test("All Controls and Indicators makes a control per input and an indicator per output, keeping the terminals' order", () => {
  const { g, id: quotient } = nodeAt("quotient-remainder", 400, 200);
  const r = createForNode(g, CTX, { nodo: quotient, kinds: ALL_KINDS["all-controls-and-indicators"] });
  const made = r.ids.map((id) => r.g.nodos.find((n) => n.id === id));
  assert.equal(made.length, 4);
  assert.equal(r.g.cables.length, 4, "all wired");
  const byLabel = (text) => made.find((n) => n.label.text === text);
  assert.ok(byLabel("x").y < byLabel("y").y, "x above y");
  assert.ok(box(r.g, byLabel("x").id).y + 38 <= box(r.g, byLabel("y").id).y, "stacked without overlapping");
});

test("All Constants makes a constant per input only", () => {
  const { g, id: add } = nodeAt("add", 300, 100);
  const r = createForNode(g, CTX, { nodo: add, kinds: ALL_KINDS["all-constants"] });
  assert.equal(r.ids.length, 2);
  assert.ok(r.ids.every((id) => r.g.nodos.find((n) => n.id === id).tipo === "num-const"));
  const [a, b] = r.ids.map((id) => box(r.g, id));
  assert.ok(a.y + a.alto <= b.y || b.y + b.alto <= a.y, "no overlap");
  const again = createForNode(r.g, CTX, { nodo: add, kinds: ALL_KINDS["all-constants"] });
  assert.ok(again.motivo, "nothing left to create when every input is wired");
});

test("Create on a wire makes an unwired object of the wire's type", () => {
  let { g, id: add } = nodeAt("add", 300, 100);
  const constant = createForTerminal(g, CTX, { nodo: add, puerto: "a", kind: "constant" });
  const wire = constant.g.cables[0].id;
  const r = createOnWire(constant.g, CTX, { cable: wire, kind: "control", point: { x: 100, y: 300 } });
  assert.equal(r.g.cables.length, 1, "no new wire");
  const control = r.g.nodos.find((n) => n.id === r.id);
  assert.deepEqual([control.tipo, control.config.type], ["control", "number"]);
  const size = box(r.g, r.id);
  assert.deepEqual([size.x + size.ancho / 2, size.y + size.alto / 2], [100, 300], "centred on the click");
});

test("an object created next to a node inside a loop belongs to the loop", () => {
  let g = Gr.nuevo();
  const loop = Gr.crearEstructura(g, CAT, "while-loop", 100, 100, 300, 200);
  const add = Gr.crearNodo(loop.g, CAT, "add", 200, 150);
  const inside = Gr.meter(add.g, CAT, [add.id], loop.id);
  const r = createForTerminal(inside, CTX, { nodo: add.id, puerto: "a", kind: "constant" });
  assert.ok(!r.motivo, r.motivo);
  assert.equal(r.g.nodos.find((n) => n.id === r.id).dentro, loop.id);
  assert.equal(r.g.cables.length, 1, "no tunnel needed");
});
