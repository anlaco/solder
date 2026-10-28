// A Run on a pool of threads (DT-063 §11): `ejecutar` coordinates and the pool's threads run the
// clumps. The pool lives across Runs, as the editor's does; each Run connects to it anew.

import assert from "node:assert/strict";
import { after, test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import { createNodePool } from "../../core/runtime/node-pool.mjs";
import { CAT, buildVI, callerCatalog } from "../helpers.mjs";

const THREADS = 4;
const pool = createNodePool(THREADS);
after(() => pool.close());

/** Runs `vi` on the pool; the writes come back by the names `vi` gave its nodes. */
async function runOnPool(vi, values = {}, options = {}, cat = CAT) {
  const compiled = compilar(vi.g, cat);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const byId = Object.fromEntries(Object.entries(vi.id).map(([name, nodeId]) => [nodeId, name]));
  const ids = Object.fromEntries(Object.entries(values).map(([name, value]) => [vi.id[name], value]));
  const written = await ejecutar(compiled, ids, { ...options, poolPorts: pool.connect() });
  return Object.fromEntries(Object.entries(written).map(([nodeId, value]) => [byId[nodeId], value]));
}

/**
 * `loops` For Loops in parallel, each of `count` turns of Wait (ms) `ms`, showing its "i"; with `timers`, each
 * also hands out the millisecond timer after each of its waits, through an indexing tunnel, to `timers<loop>`.
 */
const waitingLoops = (loops, count, ms, { timers = false } = {}) =>
  buildVI(CAT, (b) => {
    for (let loop = 0; loop < loops; loop++) {
      b.loop(`l${loop}`, "for-loop");
      b.node(`n${loop}`, "const", { value: count });
      b.wire(`n${loop}.result`, `l${loop}:N.count`);
      b.node(`ms${loop}`, "const", { value: ms }, `l${loop}`);
      b.node(`wait${loop}`, "wait-ms", null, `l${loop}`);
      b.wire(`ms${loop}.result`, `wait${loop}.ms`);
      b.node(`shown${loop}`, "indicator", null, `l${loop}`);
      b.wire(`l${loop}:i.i`, `shown${loop}.value`);
      if (timers) {
        b.node(`timers${loop}`, "arr-indicator", { type: { array: "u32" } });
        b.wire(`wait${loop}.result`, `timers${loop}.value`);
      }
    }
  });

test("parallel loops that wait run on the pool, at the same time, and give their values", async () => {
  const loops = 4;
  const written = await runOnPool(waitingLoops(loops, 40, 2, { timers: true }));
  for (let loop = 0; loop < loops; loop++) assert.equal(written[`shown${loop}`], 39);
  // At the same time: every loop started waiting before any loop finished. Unlike a wall-clock bound, this
  // holds however loaded the machine is.
  const timers = Array.from({ length: loops }, (_, loop) => written[`timers${loop}`]);
  const latestFirstWait = Math.max(...timers.map((loopTimers) => loopTimers[0]));
  const earliestLastWait = Math.min(...timers.map((loopTimers) => loopTimers.at(-1)));
  assert.ok(latestFirstWait < earliestLastWait, `the loops overlap: ${latestFirstWait} < ${earliestLastWait}`);
});

/** A functional global that counts its calls and waits 0 ms while it is called. */
const waitingCounter = () =>
  buildVI(CAT, (b) => {
    b.loop("w", "while-loop");
    b.shiftRegister("sr", "w");
    b.node("one", "const", { value: 1, type: "i32" }, "w");
    b.node("plus", "add", null, "w");
    b.node("true", "bool-const", { value: true }, "w");
    b.node("count", "indicator", { type: "i32" });
    b.node("ms", "const", { value: 0, type: "i32" });
    b.node("wait", "wait-ms");
    b.node("waited", "indicator", { type: "u32" });
    b.wire("sr.left.value", "plus.a");
    b.wire("one.result", "plus.b");
    b.wire("plus.result", "sr.right.value");
    b.wire("true.result", "w:stop.stop");
    b.wire("sr.right.result", "count.value");
    b.wire("ms.result", "wait.ms");
    b.wire("wait.result", "waited.value");
    b.connector([], ["count"]);
  });

test("a non-reentrant subVI keeps counting across Runs on the pool, one call at a time", async () => {
  const LOOPS = 4;
  const COUNT = 50;
  const cat = callerCatalog({ "counter.sdg": waitingCounter() });
  const caller = buildVI(cat, (b) => {
    for (let loop = 0; loop < LOOPS; loop++) {
      b.loop(`l${loop}`, "for-loop");
      b.node(`n${loop}`, "const", { value: COUNT });
      b.wire(`n${loop}.result`, `l${loop}:N.count`);
      b.node(`call${loop}`, "subvi", { vi: "counter.sdg" }, `l${loop}`);
      b.node(`seen${loop}`, "indicator", { type: "i32" }, `l${loop}`);
      b.wire(`call${loop}.indicator_1`, `seen${loop}.value`);
    }
  });
  // The state a VI keeps between Runs (DT-045) travels with its memory, from one pool Run to the next.
  const estado = {};
  const first = await runOnPool(caller, {}, { estado }, cat);
  assert.equal(Math.max(...Object.values(first)), LOOPS * COUNT);
  const second = await runOnPool(caller, {}, { estado }, cat);
  assert.equal(Math.max(...Object.values(second)), 2 * LOOPS * COUNT);
});

test("Abort stops a Run on the pool at once, and the pool serves the next Run", async () => {
  const abort = new AbortController();
  setTimeout(() => abort.abort(), 30);
  const start = performance.now();
  await assert.rejects(runOnPool(waitingLoops(4, 1000, 5), {}, { senal: abort.signal }), (error) => error.abortado);
  assert.ok(performance.now() - start < 300, "at once");
  assert.deepEqual(await runOnPool(waitingLoops(2, 3, 1)), { shown0: 2, shown1: 2 });
});

test("a thread's automatic error dialog is shown by the coordinator, and the clump goes on with the answer", async () => {
  const vi = buildVI(CAT, (b) => {
    b.node("reply", "str-const", { value: "FOO" });
    b.node("format", "str-const", { value: "%f" });
    b.node("zero", "const", { value: 0 });
    b.node("scan", "scan-from-string");
    b.node("value", "indicator");
    b.wire("reply.result", "scan.input-string");
    b.wire("format.result", "scan.format-string");
    b.wire("zero.result", "scan.default-0");
    b.wire("scan.output-0", "value.value");
  });
  const shown = [];
  const written = await runOnPool(vi, {}, { alErrorAutomatico: async (error) => (shown.push(error.code), "continuar") });
  assert.deepEqual(shown, [85]);
  assert.deepEqual(written, { value: 0 });
});

test("a Stop button pressed while a loop runs on the pool stops it and is released", async () => {
  const vi = buildVI(CAT, (b) => {
    b.loop("w", "while-loop");
    b.node("stop", "bool-control", { style: "stop-button", mechanical: "latch-when-released" }, "w");
    b.node("ms", "const", { value: 2 }, "w");
    b.node("wait", "wait-ms", null, "w");
    b.node("turns", "indicator", null, "w");
    b.wire("ms.result", "wait.ms");
    b.wire("stop.result", "w:stop.stop");
    b.wire("w:i.i", "turns.value");
  });
  const released = [];
  const compiled = compilar(vi.g, CAT);
  const values = { [vi.id.stop]: false };
  setTimeout(() => (values[vi.id.stop] = true), 40);
  const written = await ejecutar(compiled, values, { poolPorts: pool.connect(), alSoltar: (nodeId) => released.push(nodeId) });
  assert.ok(written[vi.id.turns] > 0, "it went round until Stop");
  assert.deepEqual(released, [vi.id.stop]);
  assert.equal(values[vi.id.stop], false);
});

test("debugging turned on in the middle of a Run on the pool reaches its nodes and their values", async () => {
  const vi = waitingLoops(1, 300, 1);
  const compiled = compilar(vi.g, CAT);
  const nodes = [];
  const values = [];
  const depurador = { alValor: (node, output, value) => values.push(value), alNodo: (node) => void nodes.push(node), unoACadaVez: () => false };
  setTimeout(() => depurador.activar(true), 30);
  setTimeout(() => depurador.activar(false), 80);
  const written = await ejecutar(compiled, {}, { depurador, poolPorts: pool.connect() });
  assert.equal(written[vi.id.shown0], 299);
  assert.ok(nodes.length > 0, "the debugger saw nodes run on the pool");
  assert.ok(values.some((value) => typeof value === "number" && value > 0), `and the values of their outputs: ${values.slice(0, 5)}`);
});
