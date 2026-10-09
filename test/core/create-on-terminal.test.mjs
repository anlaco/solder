// Create ▸ Constant / Control / Indicator on a terminal (core/model/create-on-terminal.mjs).

import assert from "node:assert/strict";
import { test } from "node:test";

import * as Gr from "../../core/model/graph.mjs";
import { blockForTerminal, createOnTerminal } from "../../core/model/create-on-terminal.mjs";
import { ERROR } from "../../core/model/types.mjs";
import { CAT } from "../helpers.mjs";

test("each type gets the constant, control and indicator of its own type", () => {
  assert.deepEqual(blockForTerminal("i32", "constant"), { tipo: "num-const", config: { type: "i32", value: 0 } });
  assert.deepEqual(blockForTerminal("number", "control"), { tipo: "control", config: { type: "number" } });
  assert.deepEqual(blockForTerminal("boolean", "indicator"), { tipo: "bool-indicator" });
  assert.deepEqual(blockForTerminal("string", "constant"), { tipo: "str-const", config: { value: "" } });
  assert.deepEqual(blockForTerminal({ array: "u8", dims: 2 }, "constant"), { tipo: "arr-const", config: { type: { array: "u8", dims: 2 }, value: [] } });
  assert.deepEqual(blockForTerminal(ERROR, "constant"), { tipo: "error-cluster-constant" });
  assert.equal(blockForTerminal(ERROR, "control").config.style, "error-in");
  assert.equal(blockForTerminal({ cluster: [{ name: "a", type: "i32" }] }, "constant"), null, "no cluster constant block yet");
});

function addNode() {
  const r = Gr.crearNodo(Gr.nuevo(), CAT, "add", 200, 100);
  return { g: r.g, add: r.id };
}

test("Create ▸ Constant on an input wires a constant of the terminal's type", () => {
  const { g, add } = addNode();
  const r = createOnTerminal(g, CAT, { terminal: { nodo: add, puerto: "a", dir: "in" }, type: "number", kind: "constant", x: 150, y: 100 });
  assert.ok(!r.motivo, r.motivo);
  const constant = r.g.nodos.find((n) => n.id === r.id);
  assert.equal(constant.tipo, "num-const");
  assert.equal(constant.config.type, "number");
  assert.deepEqual(r.g.cables.map((c) => [c.de.nodo, c.a.nodo, c.a.puerto]), [[r.id, add, "a"]]);
  assert.equal(Gr.tipos(r.g, CAT).salidas.get(`${r.id}.result`), "number");
});

test("Create ▸ Control and Indicator put a labelled panel object wired to the terminal", () => {
  const { g, add } = addNode();
  const control = createOnTerminal(g, CAT, { terminal: { nodo: add, puerto: "a", dir: "in" }, type: "number", kind: "control", x: 120, y: 100, panelX: 40, panelY: 60, label: "x" });
  const indicator = createOnTerminal(control.g, CAT, { terminal: { nodo: add, puerto: "result", dir: "out" }, type: "number", kind: "indicator", x: 280, y: 100, panelX: 200, panelY: 60, label: "x+y" });
  const [c, i] = [control, indicator].map((r) => indicator.g.nodos.find((n) => n.id === r.id));
  assert.deepEqual([c.tipo, c.label.text, c.panel.x, c.x], ["control", "x", 40, 120]);
  assert.deepEqual([i.tipo, i.label.text], ["indicator", "x+y"]);
  assert.equal(indicator.g.cables.length, 2);
  const again = createOnTerminal(indicator.g, CAT, { terminal: { nodo: add, puerto: "b", dir: "in" }, type: "number", kind: "control", x: 0, y: 0, label: "x" });
  assert.equal(again.g.nodos.find((n) => n.id === again.id).label.text, "x 2", "a second control with the same name is numbered");
});

// labview-captures/create-paste/: nothing is greyed; Constant on String Length's output gives an unwired I32 constant.
test("an indicator on an input, or a constant on an output, is created unwired, as in LabVIEW", () => {
  const { g, add } = addNode();
  const indicator = createOnTerminal(g, CAT, { terminal: { nodo: add, puerto: "a", dir: "in" }, type: "number", kind: "indicator", x: 0, y: 0, label: "x" });
  assert.deepEqual([indicator.wired, indicator.g.cables.length, indicator.g.nodos.find((n) => n.id === indicator.id).tipo], [false, 0, "indicator"]);
  const constant = createOnTerminal(g, CAT, { terminal: { nodo: add, puerto: "result", dir: "out" }, type: "i32", kind: "constant", x: 0, y: 0 });
  assert.deepEqual([constant.wired, constant.g.nodos.find((n) => n.id === constant.id).config.type], [false, "i32"]);
});

test("a node created for a terminal inside a structure joins that structure, so its wire does not cross a border", () => {
  const loop = Gr.crearEstructura(Gr.nuevo(), CAT, "while-loop", 100, 100, 300, 200);
  const placed = Gr.crearNodo(loop.g, CAT, "add", 200, 150);
  const g = Gr.meter(placed.g, CAT, [placed.id], loop.id);
  const terminal = { nodo: placed.id, puerto: "a", dir: "in" };
  const outside = createOnTerminal(g, CAT, { terminal, type: "number", kind: "constant", x: 150, y: 150 });
  assert.ok(outside.motivo, "without the scope the wire would cross the loop's border");
  const inside = createOnTerminal(g, CAT, { terminal, type: "number", kind: "constant", x: 150, y: 150, scope: { dentro: loop.id } });
  assert.ok(!inside.motivo, inside.motivo);
  assert.equal(inside.g.nodos.find((n) => n.id === inside.id).dentro, loop.id);
});
