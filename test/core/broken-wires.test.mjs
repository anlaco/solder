// Broken wires with a loose end (DT-046): deleting a panel object leaves its
// wires broken, a VI whose subVI lost a terminal still opens, and Ctrl+B
// removes broken wires.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as Gr from "../../core/model/graph.mjs";
import { aTexto, leer } from "../../core/model/qvi-format.mjs";
import { compilar } from "../../core/compiler/compiler.mjs";
import { CAT } from "../helpers.mjs";

/** A control x → Add.a, constant 3 → Add.b, Add → indicator. */
function adder() {
  let g = Gr.nuevo();
  let r = Gr.crearEnPanel(g, CAT, "control", 20, 20, "x");
  g = r.g;
  const x = r.id;
  r = Gr.crearNodo(g, CAT, "const", 0, 60);
  g = Gr.fijarConfig(r.g, r.id, { value: 3 });
  const three = r.id;
  r = Gr.crearNodo(g, CAT, "add", 100, 40);
  g = r.g;
  const add = r.id;
  r = Gr.crearEnPanel(g, CAT, "indicator", 200, 20, "sum");
  g = r.g;
  const sum = r.id;
  for (const [a, pa, b, pb] of [[x, "result", add, "a"], [three, "result", add, "b"], [add, "result", sum, "value"]]) {
    g = Gr.conectar(g, CAT, { nodo: a, puerto: pa, dir: "out" }, { nodo: b, puerto: pb, dir: "in" }).g;
  }
  return { g, x, three, add, sum };
}

test("deleting a control keeps its wire, broken, with a loose end where the terminal was", () => {
  const { g, x, add } = adder();
  const deleted = Gr.borrarDejandoCables(g, [x], () => [20, 25]);
  const wire = deleted.cables.find((c) => c.a.nodo === add && c.a.puerto === "a");
  assert.deepEqual(wire.de, { suelto: [20, 25] });
  const resolved = Gr.tipos(deleted, CAT);
  assert.equal(resolved.cables.get(wire.id).roto, Gr.LOOSE_WIRE_REASONS.noSource, "the wire lost its source");
  assert.equal(Gr.ejecutable(deleted, CAT, resolved), false);
  assert.ok(compilar(deleted, CAT).errores, "a VI with a loose wire does not compile");
});

test("a loose end is saved and read back", () => {
  const { g, x } = adder();
  const deleted = Gr.borrarDejandoCables(g, [x], () => [20, 25]);
  const text = aTexto(deleted, CAT);
  assert.match(text, /"loose": \[\s*20,\s*25\s*\]/);
  const read = leer(text, CAT);
  assert.equal(aTexto(read, CAT), text);
  assert.equal(read.cables.filter((c) => Gr.esSuelto(c.de)).length, 1);
});

test("Ctrl+B removes broken wires: all, or only those selected", () => {
  const { g, x } = adder();
  const deleted = Gr.borrarDejandoCables(g, [x]);
  const loose = deleted.cables.find((c) => Gr.esSuelto(c.de));
  assert.equal(Gr.quitarCablesRotos(deleted, CAT).cables.length, deleted.cables.length - 1);
  assert.equal(Gr.quitarCablesRotos(deleted, CAT, []).cables.length, deleted.cables.length, "with an empty selection, nothing");
  assert.equal(Gr.quitarCablesRotos(deleted, CAT, [loose.id]).cables.length, deleted.cables.length - 1);
});

test("a caller whose subVI lost a connector terminal still opens, with that wire broken", () => {
  let sub = Gr.nuevo();
  let r = Gr.crearEnPanel(sub, CAT, "control", 0, 0, "a");
  sub = r.g;
  const a = r.id;
  r = Gr.crearEnPanel(sub, CAT, "indicator", 100, 0, "b");
  sub = r.g;
  const b = r.id;
  sub = Gr.conectar(sub, CAT, { nodo: a, puerto: "result", dir: "out" }, { nodo: b, puerto: "value", dir: "in" }).g;
  const nameOf = (id) => sub.nodos.find((n) => n.id === id).name;
  const withBoth = { ...sub, vi: { connector: { inputs: [nameOf(a)], outputs: [nameOf(b)] } } };
  const catWith = (callee) => Gr.conSubVIs(CAT, (path) => (path === "sub.qvi" ? { key: "sub.qvi", g: callee, cat: CAT } : null));
  let caller = Gr.nuevo();
  r = Gr.crearNodo(caller, catWith(withBoth), "subvi", 50, 50);
  caller = Gr.fijarConfig(r.g, r.id, { vi: "sub.qvi" });
  const call = r.id;
  r = Gr.crearNodo(caller, CAT, "const", 0, 50);
  caller = r.g;
  caller = Gr.conectar(caller, catWith(withBoth), { nodo: r.id, puerto: "result", dir: "out" }, { nodo: call, puerto: nameOf(a), dir: "in" }).g;
  const text = aTexto(caller, catWith(withBoth));
  const withoutInput = { ...sub, vi: { connector: { inputs: [], outputs: [nameOf(b)] } } };
  const reopened = leer(text, catWith(withoutInput));
  const wire = reopened.cables[0];
  assert.ok(Gr.esSuelto(wire.a), "the wire to the lost terminal is loose");
  assert.equal(Gr.tipos(reopened, catWith(withoutInput)).cables.get(wire.id).roto, Gr.LOOSE_WIRE_REASONS.looseEnd, "it has a source but reaches nothing");
  const refreshed = Gr.aflojarCablesHuerfanos(caller, catWith(withoutInput));
  assert.ok(Gr.esSuelto(refreshed.cables[0].a), "an open caller loosens it too when its subVI changes");
});

// labview-captures/windows-install/test.qvi: a loop's output tunnel wired back into its own input tunnel
// passed `check` and the compiler emitted invalid WebAssembly.
test("a wire from a loop's output back into the same loop closes a cycle and is broken", () => {
  let g = Gr.nuevo();
  let r = Gr.crearEstructura(g, CAT, "while-loop", 0, 0, 200, 150);
  g = r.g;
  const loop = r.id;
  r = Gr.crearNodo(g, CAT, "bool-control", 50, 50);
  g = Gr.meter(r.g, CAT, [r.id], loop);
  const stop = r.id;
  const condition = g.nodos.find((n) => n.dentro === loop && n.tipo === "loop-condition").id;
  g = Gr.conectar(g, CAT, { nodo: stop, puerto: "result", dir: "out" }, { nodo: condition, puerto: "stop", dir: "in" }).g;
  const out = Gr.crearTunel(g, CAT, loop, "out", 40);
  g = out.g;
  const into = Gr.crearTunel(g, CAT, loop, "in", 80);
  g = into.g;
  g = Gr.conectar(g, CAT, { nodo: stop, puerto: "result", dir: "out" }, { nodo: out.id, puerto: "x", dir: "in" }).g;
  const back = Gr.conectar(g, CAT, { nodo: out.id, puerto: "y", dir: "out" }, { nodo: into.id, puerto: "x", dir: "in" });
  const resolved = Gr.tipos(back.g, CAT);
  assert.equal(resolved.cables.get(back.id).roto, Gr.STRUCTURE_CYCLE_REASON);
  assert.equal(Gr.ejecutable(back.g, CAT, resolved), false);
  assert.ok(compilar(back.g, CAT).errores, "the compiler refuses it instead of emitting invalid WebAssembly");
});
