// Create ▸ Constant, Control and Indicator on the terminals of a loop: the
// condition of a While Loop, the count of a For Loop and the iteration. Their
// menus have the Create rows directly (not in a submenu), measured in
// labview-captures/editor-checks/REPORT.md §5.

import assert from "node:assert/strict";
import { test } from "node:test";

import { caja, contexto, glifosPorBloque, terminales } from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import { CAT, INV } from "../helpers.mjs";

const CTX = contexto(CAT, glifosPorBloque(INV), ",");
const FONDO = { tipo: "fondo" };

/** A diagram with one loop of `kind` ("while-loop" or "for-loop") from (100, 100) to (400, 300). */
function withLoop(kind) {
  let d = ED.moverA(ED.coger(ED.inicial(), kind), CTX, { x: 100, y: 100 });
  d = ED.soltar(ED.pulsar(d, CTX, FONDO, { x: 100, y: 100 }), CTX, FONDO, { x: 100, y: 100 });
  d = ED.pulsar(ED.moverA(d, CTX, { x: 400, y: 300 }), CTX, FONDO, { x: 400, y: 300 });
  const loop = d.g.nodos.find((n) => n.tipo === kind).id;
  return { d, loop, border: (type) => d.g.nodos.find((n) => n.dentro === loop && n.tipo === type) };
}

/** Right-click on a border node of the loop and choose one of its Create rows. */
const chooseCreate = (d, root, borderId, row) => ED.orden(ED.abrirMenu(d, root, borderId, 0, 0, null, { x: 380, y: 290 }), `${root}.${row}`, CTX);

const created = (before, after) => after.g.nodos.filter((n) => !before.g.nodos.some((k) => k.id === n.id));

test("the Create rows of the loop terminals are done, except Create Channel Writer, which says why it is not", () => {
  for (const root of ["context.loop-condition", "context.loop-iteration", "context.loop-count"]) {
    for (const row of ["create-constant", "create-control", "create-indicator"]) assert.equal(INV.entrada(`${root}.${row}`).estado, "built", `${root}.${row}`);
  }
  assert.equal(INV.entrada("context.loop-condition.create-channel-writer").estado, "todo");
  assert.deepEqual(
    INV.hijos("context.loop-condition").map((e) => e.id.split(".").pop()),
    ["create-constant", "create-control", "create-indicator", "create-channel-writer", "stop-if-true", "continue-if-true", "boolean-palette", "properties"],
    "the menu of the condition terminal has LabVIEW's rows in its order",
  );
});

test("Create Control on the condition of a While Loop makes a Stop button inside the loop, wired, with its label stop in edit mode", () => {
  const { d, loop, border } = withLoop("while-loop");
  const condition = border("loop-condition");
  const made = chooseCreate(d, "context.loop-condition", condition.id, "create-control");
  const [stop] = created(d, made);
  assert.equal(stop.tipo, "bool-control");
  assert.equal(stop.config.style, "stop-button", "the Stop Boolean of the palette");
  assert.equal(stop.config.mechanical, "latch-when-released");
  assert.equal(stop.label.text, "stop");
  assert.equal(stop.dentro, loop, "inside the loop");
  assert.ok(stop.panel, "and on the Front Panel too");
  const terminal = terminales(condition, CTX)[0];
  assert.ok(caja(stop, CTX).x + caja(stop, CTX).ancho < terminal.x, "left of the condition terminal");
  assert.deepEqual(made.g.cables.map((c) => [c.de.nodo, c.de.puerto, c.a.nodo, c.a.puerto]), [[stop.id, "result", condition.id, "stop"]]);
  assert.deepEqual(made.edicion, { nodo: stop.id, etiqueta: true, texto: "stop", todo: true, nuevo: true }, "the label is waiting to be typed over");
  assert.equal(made.menu, null);
});

test("Create Constant on the condition makes a Boolean constant inside the loop, wired", () => {
  const { d, loop, border } = withLoop("while-loop");
  const condition = border("loop-condition");
  const made = chooseCreate(d, "context.loop-condition", condition.id, "create-constant");
  const [constant] = created(d, made);
  assert.equal(constant.tipo, "bool-const");
  assert.equal(constant.dentro, loop);
  assert.deepEqual(made.g.cables.map((c) => [c.de.nodo, c.a.nodo, c.a.puerto]), [[constant.id, condition.id, "stop"]]);
});

test("Create Indicator on the condition makes a Boolean indicator, left unwired because the condition is an input", () => {
  const { d, border } = withLoop("while-loop");
  const made = chooseCreate(d, "context.loop-condition", border("loop-condition").id, "create-indicator");
  const [indicator] = created(d, made);
  assert.equal(indicator.tipo, "bool-indicator");
  assert.equal(made.g.cables.length, 0);
});

test("on the count of a For Loop and the iteration terminal the same rows make an I32 constant, control and indicator", () => {
  const { d, loop, border } = withLoop("for-loop");
  const count = border("loop-count");
  const constant = created(d, chooseCreate(d, "context.loop-count", count.id, "create-constant"))[0];
  assert.equal(constant.tipo, "num-const");
  assert.equal(constant.dentro, undefined, "the count is wired from outside the loop: the constant goes outside");
  assert.equal(loop, count.dentro);
  const control = chooseCreate(d, "context.loop-count", count.id, "create-control");
  assert.deepEqual(control.g.cables.map((c) => c.a.puerto), ["count"], "a control is wired to the count");
  const iteration = border("loop-iteration");
  const indicator = chooseCreate(d, "context.loop-iteration", iteration.id, "create-indicator");
  assert.deepEqual(indicator.g.cables.map((c) => [c.de.nodo, c.de.puerto]), [[iteration.id, "i"]], "an indicator is wired to i");
});
