// Copy, cut and paste of diagram fragments (core/model/clipboard.mjs).

import assert from "node:assert/strict";
import { test } from "node:test";

import * as Gr from "../../core/model/graph.mjs";
import { copyFragment, cutFragment, pasteFragment } from "../../core/model/clipboard.mjs";
import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import { CAT } from "../helpers.mjs";

/** const 2 → add.a, const 3 → add.b, add → indicator "Sum". */
function adder() {
  let g = Gr.nuevo();
  const put = (tipo, config) => {
    const r = Gr.crearNodo(g, CAT, tipo, 100, 100);
    g = config ? Gr.fijarConfig(r.g, r.id, config) : r.g;
    return r.id;
  };
  const two = put("const", { value: 2 });
  const three = put("const", { value: 3 });
  const add = put("add");
  const r = Gr.crearEnPanel(g, CAT, "indicator", 300, 50, "Sum");
  g = r.g;
  const sum = r.id;
  for (const [a, pa, b, pb] of [[two, "result", add, "a"], [three, "result", add, "b"], [add, "result", sum, "value"]]) {
    g = Gr.conectar(g, CAT, { nodo: a, puerto: pa, dir: "out" }, { nodo: b, puerto: pb, dir: "in" }).g;
  }
  return { g, two, three, add, sum };
}

test("copying keeps the wires inside the selection and drops the ones to the rest", () => {
  const { g, two, add } = adder();
  const fragment = copyFragment(g, [two, add]);
  assert.equal(fragment.nodes.length, 2);
  assert.equal(fragment.wires.length, 1, "only const 2 → add");
});

test("pasting gives new ids and names, moves the copy and selects it", () => {
  const { g, two, add } = adder();
  const { g: pasted, ids } = pasteFragment(g, copyFragment(g, [two, add]), { dx: 40, dy: 30 });
  assert.equal(pasted.nodos.length, g.nodos.length + 2);
  assert.equal(pasted.cables.length, g.cables.length + 1);
  assert.equal(ids.length, 2);
  const copies = pasted.nodos.filter((n) => ids.includes(n.id));
  assert.ok(copies.every((n) => n.x === 140 && n.y === 130));
  assert.equal(new Set(pasted.nodos.map((n) => n.name)).size, pasted.nodos.length, "names stay unique");
  const wire = pasted.cables.at(-1);
  assert.ok(ids.includes(wire.de.nodo) && ids.includes(wire.a.nodo), "the copied wire joins the copies");
});

test("a pasted indicator gets a free label and its own place on the panel", () => {
  const { g, sum } = adder();
  const { g: pasted, ids } = pasteFragment(g, copyFragment(g, [sum]), { dx: 10, dy: 10, panelDx: 0, panelDy: 40 });
  const copy = pasted.nodos.find((n) => n.id === ids[0]);
  assert.equal(copy.label.text, "Sum 2");
  assert.deepEqual([copy.panel.x, copy.panel.y], [300, 90]);
  const again = pasteFragment(pasted, copyFragment(pasted, [copy.id]));
  assert.equal(again.g.nodos.find((n) => n.id === again.ids[0]).label.text, "Sum 3");
});

test("cutting removes the nodes and their wires to the rest", () => {
  const { g, add } = adder();
  const { fragment, g: cut } = cutFragment(g, [add]);
  assert.equal(fragment.nodes.length, 1);
  assert.equal(cut.nodos.length, g.nodos.length - 1);
  assert.equal(cut.cables.length, 0);
});

test("a structure is copied with what it holds and its shift registers stay paired", async () => {
  let g = Gr.nuevo();
  let r = Gr.crearEstructura(g, CAT, "for-loop", 0, 0, 200, 150);
  g = r.g;
  const loop = r.id;
  const sr = Gr.crearRegistro(g, CAT, loop, 0);
  g = sr.g;
  r = Gr.crearNodo(g, CAT, "add", 50, 50);
  g = Gr.meter(r.g, CAT, [r.id], loop);
  const add = r.id;
  const node = (tipo) => g.nodos.find((n) => n.dentro === loop && n.tipo === tipo).id;
  r = Gr.crearNodo(g, CAT, "const", 0, 0);
  g = Gr.fijarConfig(r.g, r.id, { value: 0, type: "i32" });
  const zero = r.id;
  r = Gr.crearNodo(g, CAT, "const", 0, 0);
  g = Gr.fijarConfig(r.g, r.id, { value: 4, type: "i32" });
  const four = r.id;
  const wire = (a, pa, b, pb) => {
    g = Gr.conectarCruzando(g, CAT, { nodo: a, puerto: pa, dir: "out" }, { nodo: b, puerto: pb, dir: "in" }).g;
  };
  wire(zero, "result", sr.izquierdo, "init");
  wire(four, "result", node("loop-count"), "count");
  wire(sr.izquierdo, "value", add, "a");
  wire(node("loop-iteration"), "i", add, "b");
  wire(add, "result", sr.derecho, "value");
  const { g: pasted, ids } = pasteFragment(g, copyFragment(g, [loop, zero, four]), { dx: 0, dy: 300 });
  const copyLoop = ids.find((id) => pasted.nodos.find((n) => n.id === id).tipo === "for-loop");
  const inside = pasted.nodos.filter((n) => n.dentro === copyLoop);
  assert.equal(inside.length, g.nodos.filter((n) => n.dentro === loop).length);
  const [left, right] = ["shift-register-left", "shift-register-right"].map((t) => inside.find((n) => n.tipo === t));
  assert.equal(left.config.par, right.id);
  assert.equal(right.config.par, left.id);
  // Both loops run: 0 + 1 + 2 + 3 = 6 each.
  r = Gr.crearNodo(pasted, CAT, "indicator", 0, 0);
  let withIndicators = Gr.fijarConfig(r.g, r.id, { type: "i32" });
  withIndicators = Gr.conectar(withIndicators, CAT, { nodo: right.id, puerto: "result", dir: "out" }, { nodo: r.id, puerto: "value", dir: "in" }).g;
  const compiled = compilar(withIndicators, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  assert.deepEqual(Object.values(await ejecutar(compiled, {})), [6]);
});
