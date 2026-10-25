// Stackless clumps (DT-063 §8): a function that parks saves its locals and the point it parked at,
// returns, and goes on from there when called again, with the same values as if it had never stopped.

import assert from "node:assert/strict";
import { test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import { makeStackless } from "../../core/compiler/stackless.mjs";
import { codificar } from "../../core/compiler/wasm-encoder.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { CAT } from "../helpers.mjs";

const ins = (op, arg) => (arg === undefined ? { op } : { op, arg });
const RESULT_ADDRESS = 64;
const FIRST_FRAME = 128;
const PARK_TYPE = { params: ["i32"], results: ["i32"] };

/**
 * for i in 0..4: if i is odd, sum += park(i), else sum += 1; then the sum is stored at
 * RESULT_ADDRESS. The park point is inside an `if` inside a loop inside a block, so rewinding must
 * enter all three and take the branch it parked in.
 */
const loopThatParks = () => ({
  params: [],
  results: [],
  locales: ["i32", "i32", "i32"], // sum, i, answer
  cuerpo: [
    ins("block"), ins("loop"),
    ins("local.get", 1), ins("i32.const", 5), ins("i32.ge_s"), ins("br_if", 1),
    ins("local.get", 1), ins("i32.const", 1), ins("i32.and"),
    ins("if"),
    ins("local.get", 1), ins("call", 0), ins("local.set", 2),
    ins("local.get", 0), ins("local.get", 2), ins("i32.add"), ins("local.set", 0),
    ins("else"),
    ins("local.get", 0), ins("i32.const", 1), ins("i32.add"), ins("local.set", 0),
    ins("end"),
    ins("local.get", 1), ins("i32.const", 1), ins("i32.add"), ins("local.set", 1),
    ins("br", 0),
    ins("end"), ins("end"),
    ins("i32.const", RESULT_ADDRESS), ins("local.get", 0), ins("i32.store"),
  ],
});

function transform(functions) {
  let nextFrame = FIRST_FRAME;
  return makeStackless(functions, {
    importCount: 1,
    parkPrimitives: new Set([0]),
    typeOfCall: (index) => (index === 0 ? PARK_TYPE : functions[index - 1]),
    allocateFrame: (bytes) => {
      const frame = nextFrame;
      nextFrame += bytes;
      return frame;
    },
    parkingGlobal: 0,
    resumeValueGlobal: 1,
  });
}

/** Instantiates one rewritten function; `park(n)` either answers 10·n at once or parks for it. */
async function instantiate(f, { parks }) {
  const module = {
    tipos: [PARK_TYPE, { params: [], results: [] }],
    importaciones: [{ modulo: "m", nombre: "park", tipo: 0 }],
    funciones: [{ tipo: 1, locales: f.locales, cuerpo: f.cuerpo }],
    globales: ["i32", "i32"],
    globalesExportadas: [{ nombre: "parking", global: 0 }, { nombre: "resumeValue", global: 1 }],
    memoria: { paginas: 1 },
    exportaciones: [{ nombre: "run", funcion: 1 }],
  };
  const asked = [];
  let exports = null;
  const park = (n) => {
    asked.push(n);
    if (!parks) return 10 * n;
    exports.parking.value = 1;
    return 0;
  };
  ({ exports } = (await WebAssembly.instantiate(codificar(module), { m: { park } })).instance);
  /** Calls the function until it ends, answering each park with 10 times what it asked. */
  const runToEnd = () => {
    let calls = 0;
    do {
      exports.parking.value = 0;
      exports.run();
      calls++;
      exports.resumeValue.value = 10 * asked.at(-1);
    } while (exports.parking.value === 1);
    return { calls, result: new DataView(exports.memoria.buffer).getInt32(RESULT_ADDRESS, true), asked };
  };
  return runToEnd;
}

test("a loop that parks inside an if goes on after each park with the same values", async () => {
  const { functions, frames } = transform([loopThatParks()]);
  assert.equal(frames.length, 1);
  const parked = (await instantiate(functions[0], { parks: true }))();
  const atOnce = (await instantiate(functions[0], { parks: false }))();
  // 1 + 10 + 1 + 30 + 1
  assert.equal(atOnce.result, 43);
  assert.equal(parked.result, 43, "the same sum when every answer comes after a park");
  assert.equal(parked.calls, 3, "it parked at i = 1 and at i = 3, and was called once more for each");
  assert.deepEqual(parked.asked, [1, 3], "the import is not called again when the function resumes");
});

test("a function that never parks is left as it was and gets no frame", () => {
  const plain = { params: [], results: [], locales: ["i32"], cuerpo: [ins("i32.const", 1), ins("local.set", 0)] };
  const { functions, frames } = transform([plain]);
  assert.equal(functions[0], plain);
  assert.deepEqual(frames, []);
});

test("a park point with values under its arguments is refused, since they could not be put back", () => {
  const values = { params: [], results: [], locales: ["i32"], cuerpo: [ins("i32.const", 7), ins("i32.const", 1), ins("call", 0), ins("i32.add"), ins("local.set", 0)] };
  assert.throws(() => transform([values]), /values under the arguments/);
});

function waitThenWrite(ms) {
  let g = Gr.nuevo();
  const id = {};
  for (const [name, block, config] of [["k", "const", { value: ms }], ["w", "wait-ms"], ["a", "indicator"]]) {
    const created = Gr.crearNodo(g, CAT, block, 0, 0);
    g = config ? Gr.fijarConfig(created.g, created.id, config) : created.g;
    id[name] = created.id;
  }
  g = Gr.conectar(g, CAT, { nodo: id.k, puerto: "result", dir: "out" }, { nodo: id.w, puerto: "ms", dir: "in" }).g;
  g = Gr.conectar(g, CAT, { nodo: id.w, puerto: "result", dir: "out" }, { nodo: id.a, puerto: "value", dir: "in" }).g;
  return { g, id };
}

test("a Run after one aborted in the middle of a wait waits again: no clump starts half-way", async () => {
  const WAIT_MS = 60;
  const { g, id } = waitThenWrite(WAIT_MS);
  const compiled = compilar(g, CAT);
  // The state the VI keeps between Runs (DT-045) holds the whole memory, frames included.
  const estado = {};
  const abort = new AbortController();
  const aborted = ejecutar(compiled, {}, { estado, senal: abort.signal });
  setTimeout(() => abort.abort(), 10);
  await assert.rejects(aborted, (error) => error.abortado === true);
  const start = performance.now();
  const written = await ejecutar(compiled, {}, { estado });
  assert.ok(performance.now() - start >= WAIT_MS - 1, "the second Run waited the whole time");
  assert.ok(id.a in written);
});

/** For N { x = x·1.0000001 + 0.5 } with x in a shift register, then x to an indicator. */
function computeLoop(iterations) {
  let g = Gr.nuevo();
  const id = {};
  const put = (name, block, config, inside) => {
    const created = Gr.crearNodo(g, CAT, block, 0, 0);
    g = config ? Gr.fijarConfig(created.g, created.id, config) : created.g;
    id[name] = created.id;
    if (inside) g = Gr.meter(g, CAT, [created.id], id[inside]);
  };
  const loop = Gr.crearEstructura(g, CAT, "for-loop", 0, 0, 200, 150);
  g = loop.g;
  id.loop = loop.id;
  const count = g.nodos.find((n) => n.dentro === loop.id && n.tipo === "loop-count").id;
  const register = Gr.crearRegistro(g, CAT, loop.id, 0);
  g = register.g;
  put("n", "const", { value: iterations });
  put("start", "const", { value: 1 });
  put("factor", "const", { value: 1.0000001 }, "loop");
  put("half", "const", { value: 0.5 }, "loop");
  put("times", "mul", null, "loop");
  put("plus", "add", null, "loop");
  put("x", "indicator");
  const wire = (from, fromPort, to, toPort) => {
    g = Gr.conectar(g, CAT, { nodo: from, puerto: fromPort, dir: "out" }, { nodo: to, puerto: toPort, dir: "in" }).g;
  };
  wire(id.n, "result", count, "count");
  wire(id.start, "result", register.izquierdo, "init");
  wire(register.izquierdo, "value", id.times, "a");
  wire(id.factor, "result", id.times, "b");
  wire(id.times, "result", id.plus, "a");
  wire(id.half, "result", id.plus, "b");
  wire(id.plus, "result", register.derecho, "value");
  wire(register.derecho, "result", id.x, "value");
  return { g, id };
}

// A clump that allows debugging runs without the debugger's hooks while nobody debugs it, and takes
// the copy with them when it starts or resumes with debugging on: a loop yields every ~8 ms.
test("debugging turned on in the middle of a loop reaches the loop's nodes, and off again it stops them", async () => {
  const { g, id } = computeLoop(40_000_000);
  const compiled = compilar(g, CAT);
  const reported = [];
  const debuggerHooks = { alValor() {}, alNodo: (node) => void reported.push({ node: compiled.debugNodes[node].nodo, at: performance.now() }) };
  const run = ejecutar(compiled, {}, { depurador: debuggerHooks });
  const TURNED_ON_AT_MS = 20;
  const TURNED_OFF_AFTER_MS = 20;
  // The timers fire while the loop yields, so the moments are taken when they really fire.
  let turnedOnAt = 0;
  let turnedOffAt = Infinity;
  setTimeout(() => {
    turnedOnAt = performance.now();
    debuggerHooks.activar(true);
    setTimeout(() => {
      turnedOffAt = performance.now();
      debuggerHooks.activar(false);
    }, TURNED_OFF_AFTER_MS);
  }, TURNED_ON_AT_MS);
  await run;
  const inLoop = reported.filter((entry) => entry.node === id.times);
  assert.ok(inLoop.length > 0, "the loop's nodes reported once debugging was on");
  assert.ok(inLoop.every((entry) => entry.at >= turnedOnAt), "and not before");
  assert.ok(inLoop.every((entry) => entry.at <= turnedOffAt), "and not after it went off");
});
