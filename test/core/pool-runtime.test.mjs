// A Run on a pool of threads (DT-063 §11): `ejecutar` coordinates and the pool's threads run the
// clumps. The pool lives across Runs, as the editor's does; each Run connects to it anew.

import assert from "node:assert/strict";
import { after, test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import { createNodePool } from "../../core/runtime/node-pool.mjs";
import { HOST_IMPORTS } from "../../core/compiler/host-imports.mjs";
import { FIRST_COMPILED_FUNCTION, runtimeFunctionIndex } from "../../core/compiler/runtime-functions.mjs";
import { CAT, buildOVI, callerCatalog } from "../helpers.mjs";

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
  buildOVI(CAT, (b) => {
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
  buildOVI(CAT, (b) => {
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

test("a non-reentrant subOVI keeps counting across Runs on the pool, one call at a time", async () => {
  const LOOPS = 4;
  const COUNT = 50;
  const cat = callerCatalog({ "counter.sdg": waitingCounter() });
  const caller = buildOVI(cat, (b) => {
    for (let loop = 0; loop < LOOPS; loop++) {
      b.loop(`l${loop}`, "for-loop");
      b.node(`n${loop}`, "const", { value: COUNT });
      b.wire(`n${loop}.result`, `l${loop}:N.count`);
      b.node(`call${loop}`, "subvi", { vi: "counter.sdg" }, `l${loop}`);
      b.node(`seen${loop}`, "indicator", { type: "i32" }, `l${loop}`);
      b.wire(`call${loop}.indicator_1`, `seen${loop}.value`);
    }
  });
  // The state an OVI keeps between Runs (DT-045) travels with its memory, from one pool Run to the next.
  const estado = {};
  const first = await runOnPool(caller, {}, { estado }, cat);
  assert.equal(Math.max(...Object.values(first)), LOOPS * COUNT);
  const second = await runOnPool(caller, {}, { estado }, cat);
  assert.equal(Math.max(...Object.values(second)), 2 * LOOPS * COUNT);
});

/** A subOVI that never waits: it gives back its input, through an Add, so that its call has slots to write and read. */
const echo = () =>
  buildOVI(CAT, (b) => {
    b.node("x", "control");
    b.node("zero", "const", { value: 0 });
    b.node("plus", "add");
    b.node("y", "indicator");
    b.wire("x.result", "plus.a");
    b.wire("zero.result", "plus.b");
    b.wire("plus.result", "y.value");
    b.connector(["x"], ["y"]);
  });

/** `loops` For Loops of `count` turns, each calling `echo.ovi` with a number of its own and counting the answers that are not it. */
const echoCallers = (cat, loops, count) =>
  buildOVI(cat, (b) => {
    for (let loop = 0; loop < loops; loop++) {
      b.loop(`l${loop}`, "for-loop");
      b.node(`n${loop}`, "const", { value: count });
      b.wire(`n${loop}.result`, `l${loop}:N.count`);
      b.node(`own${loop}`, "const", { value: (loop + 1) * 1000 }, `l${loop}`);
      b.node(`call${loop}`, "subvi", { vi: "echo.ovi" }, `l${loop}`);
      b.node(`differs${loop}`, "not-equal", null, `l${loop}`);
      b.node(`one-if-wrong${loop}`, "boolean-to-0-1", null, `l${loop}`);
      b.node(`sum${loop}`, "add", null, `l${loop}`);
      b.shiftRegister(`wrong${loop}`, `l${loop}`);
      b.node(`none${loop}`, "const", { value: 0 });
      b.node(`wrong-answers${loop}`, "indicator");
      b.wire(`none${loop}.result`, `wrong${loop}.left.init`);
      b.wire(`own${loop}.result`, `call${loop}.control_1`);
      b.wire(`call${loop}.indicator_1`, `differs${loop}.x`);
      b.wire(`own${loop}.result`, `differs${loop}.y`);
      b.wire(`differs${loop}.result`, `one-if-wrong${loop}.boolean`);
      b.wire(`one-if-wrong${loop}.result`, `sum${loop}.a`);
      b.wire(`wrong${loop}.left.value`, `sum${loop}.b`);
      b.wire(`sum${loop}.result`, `wrong${loop}.right.value`);
      b.wire(`wrong${loop}.right.result`, `wrong-answers${loop}.value`);
    }
  });

/** Whether any function of the compiled module calls the scheduler's function `name`. */
const callsScheduler = (compiled, name) => compiled.modulo.funciones.slice(FIRST_COMPILED_FUNCTION - HOST_IMPORTS.length).some((compiledFunction) => compiledFunction.cuerpo.some((instruction) => instruction.op === "call" && instruction.arg === runtimeFunctionIndex(name)));

// A non-reentrant OVI serves one call at a time (DT-045, DT-063 §2) whether it waits or not. One that never waits was
// called with no lock: two loops on two threads wrote its input slot at once and read each other's answer, some
// thousand times in two million calls.
test("a non-reentrant subOVI that never waits serves one call at a time on the pool", async () => {
  const LOOPS = 2;
  const cat = callerCatalog({ "echo.ovi": echo() });
  const caller = echoCallers(cat, LOOPS, 200_000);
  assert.ok(callsScheduler(compilar(caller.g, cat), "enter_subvi"), "the call enters the subOVI before it writes its inputs");
  const written = await runOnPool(caller, {}, {}, cat);
  assert.deepEqual(written, { "wrong-answers0": 0, "wrong-answers1": 0 });
});

// A preallocated clone belongs to its call site, which runs one call at a time: it needs no lock, and has none.
test("a reentrant subOVI that never waits is called with no lock", () => {
  const reentrantEcho = echo();
  reentrantEcho.g = { ...reentrantEcho.g, vi: { ...reentrantEcho.g.vi, execution: { reentrancy: "preallocated" } } };
  const cat = callerCatalog({ "echo.ovi": reentrantEcho });
  assert.ok(!callsScheduler(compilar(echoCallers(cat, 2, 1).g, cat), "enter_subvi"));
});

// Abort is pressed once a loop has shown a turn, and "at once" is counted in turns, not milliseconds, so that a loaded
// machine neither presses it before the Run starts nor makes the stop look slow (rule 6).
test("Abort stops a Run on the pool at once, and the pool serves the next Run", async () => {
  const TURNS = 1000;
  const vi = waitingLoops(4, TURNS, 5);
  const abort = new AbortController();
  let lastTurnShown = 0;
  const abortAfterATurn = (nodeId, value) => {
    if (nodeId !== vi.id.shown0) return;
    lastTurnShown = value;
    if (value > 0) abort.abort();
  };
  await assert.rejects(runOnPool(vi, {}, { senal: abort.signal, alEscribir: abortAfterATurn }), (error) => error.abortado);
  assert.ok(lastTurnShown < TURNS - 1, `stopped at once, at turn ${lastTurnShown} of ${TURNS}`);
  assert.deepEqual(await runOnPool(waitingLoops(2, 3, 1)), { shown0: 2, shown1: 2 });
});

test("a thread's automatic error dialog is shown by the coordinator, and the clump goes on with the answer", async () => {
  const vi = buildOVI(CAT, (b) => {
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
  const vi = buildOVI(CAT, (b) => {
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
  // Stop is pressed once the loop has shown a turn, not after a time: a pool that starts slowly (alone, or under load)
  // would otherwise see Stop before its first turn (rule 6).
  const pressStopAfterATurn = (nodeId, value) => {
    if (nodeId === vi.id.turns && value > 0) values[vi.id.stop] = true;
  };
  const written = await ejecutar(compiled, values, { poolPorts: pool.connect(), alSoltar: (nodeId) => released.push(nodeId), alEscribir: pressStopAfterATurn });
  assert.ok(written[vi.id.turns] > 0, "it went round until Stop");
  assert.deepEqual(released, [vi.id.stop]);
  assert.equal(values[vi.id.stop], false);
});

test("debugging turned on in the middle of a Run on the pool reaches its nodes and their values", async () => {
  const vi = waitingLoops(1, 300, 1);
  const compiled = compilar(vi.g, CAT);
  const nodes = [];
  const values = [];
  // Turned on once the loop has shown a turn and off after some nodes, not after fixed times: under load those times
  // fell before the threads had started (rule 6).
  const NODES_TO_SEE = 20;
  const turnOff = () => nodes.length >= NODES_TO_SEE && depurador.activar(false);
  const depurador = { alValor: (node, output, value) => values.push(value), alNodo: (node) => void (nodes.push(node), turnOff()), unoACadaVez: () => false };
  let turnedOn = false;
  // The panel is read at the display's pace, so the first turn it shows may be any.
  const turnOnAfterATurn = (nodeId, value) => {
    if (nodeId !== vi.id.shown0 || value === 0 || turnedOn) return;
    turnedOn = true;
    depurador.activar(true);
  };
  const written = await ejecutar(compiled, {}, { depurador, poolPorts: pool.connect(), alEscribir: turnOnAfterATurn });
  assert.equal(written[vi.id.shown0], 299);
  assert.ok(nodes.length > 0, "the debugger saw nodes run on the pool");
  assert.ok(values.some((value) => typeof value === "number" && value > 0), `and the values of their outputs: ${values.slice(0, 5)}`);
});

// An Abort pressed while the Run on the pool was still getting ready (compiling the module for the threads) was lost:
// the Run listened for it only afterwards, and preparing the Run cleared the abort flag, so the OVI ran to its end.
// Under load it happened by itself, about one Run in fifty; here the Abort comes exactly in that gap, every time.
test("Abort pressed while the Run on the pool is getting ready stops it", async () => {
  const abort = new AbortController();
  const compileModule = WebAssembly.compile;
  WebAssembly.compile = (bytes) => {
    abort.abort();
    return compileModule(bytes);
  };
  try {
    await assert.rejects(runOnPool(waitingLoops(4, 1000, 5), {}, { senal: abort.signal }), (error) => error.abortado);
  } finally {
    WebAssembly.compile = compileModule;
  }
});
