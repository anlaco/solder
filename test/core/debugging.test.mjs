// Debugging hooks (DT-047): the compiled VI reports each node and its output
// values only while debugging is on, and can stop at a node until it is told
// to go on.

import assert from "node:assert/strict";
import { test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { CAT } from "../helpers.mjs";

/** 2 + 3 → indicator, and a string constant → string indicator. */
function addVI(execution) {
  let g = Gr.nuevo();
  const id = {};
  const put = (name, block, config) => {
    const r = Gr.crearNodo(g, CAT, block, 0, 0);
    g = config ? Gr.fijarConfig(r.g, r.id, config) : r.g;
    id[name] = r.id;
  };
  put("two", "const", { value: 2 });
  put("three", "const", { value: 3 });
  put("add", "add");
  put("sum", "indicator");
  put("text", "str-const", { value: "hola" });
  put("shown", "str-indicator");
  for (const [a, pa, b, pb] of [["two", "result", "add", "a"], ["three", "result", "add", "b"], ["add", "result", "sum", "value"], ["text", "result", "shown", "value"]]) {
    g = Gr.conectar(g, CAT, { nodo: id[a], puerto: pa, dir: "out" }, { nodo: id[b], puerto: pb, dir: "in" }).g;
  }
  if (execution) g = { ...g, vi: { ...g.vi, execution } };
  return { g, id };
}

/** A debugger that records what it is told; `pauseAt` makes it stop at that node until `resume()`. */
function recorder({ on = true, pauseAt = null } = {}) {
  const log = { nodes: [], values: [] };
  let resume = null;
  const debuggerHooks = {
    alConectar() {
      debuggerHooks.activar(on);
    },
    alValor: (node, output, value) => log.values.push([node, output, value]),
    alNodo(node) {
      log.nodes.push(node);
      if (node === pauseAt) return new Promise((go) => (resume = go));
    },
  };
  return { debuggerHooks, log, resume: () => resume?.() };
}

const nodeOf = (compiled, index) => compiled.debugNodes[index].nodo;

test("while debugging, every node reports itself and the values of its outputs", async () => {
  const { g, id } = addVI();
  const compiled = compilar(g, CAT);
  const { debuggerHooks, log } = recorder();
  const written = await ejecutar(compiled, {}, { depurador: debuggerHooks });
  assert.equal(written[id.sum], 5);
  const reported = log.nodes.map((index) => nodeOf(compiled, index));
  assert.ok([id.two, id.three, id.add, id.sum, id.text, id.shown].every((node) => reported.includes(node)));
  const addValues = log.values.filter(([index]) => nodeOf(compiled, index) === id.add).map(([, , value]) => value);
  assert.deepEqual(addValues, [5]);
  assert.ok(log.values.some(([index, , value]) => nodeOf(compiled, index) === id.text && value === "hola"), "a string travels by address and arrives decoded");
});

test("with debugging off, or Allow Debugging unchecked, nothing is reported", async () => {
  const quiet = recorder({ on: false });
  await ejecutar(compilar(addVI().g, CAT), {}, { depurador: quiet.debuggerHooks });
  assert.deepEqual(quiet.log.nodes, []);
  const noHooks = compilar(addVI({ "allow-debugging": false }).g, CAT);
  assert.deepEqual(noHooks.debugNodes, []);
});

test("a node that stops holds the VI until it is told to go on", async () => {
  const { g, id } = addVI();
  const compiled = compilar(g, CAT);
  const addIndex = compiled.debugNodes.findIndex((n) => n.nodo === id.add);
  const paused = recorder({ pauseAt: addIndex });
  let finished = false;
  const run = ejecutar(compiled, {}, { depurador: paused.debuggerHooks }).then((written) => {
    finished = true;
    return written;
  });
  await new Promise((done) => setTimeout(done, 50));
  assert.equal(finished, false, "the VI waits at the breakpoint");
  paused.resume();
  assert.equal((await run)[id.sum], 5);
});
