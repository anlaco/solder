// The pool of threads (DT-063 §1, §9): every worker instantiates the same module over one shared memory,
// so whatever passes from one clump to another must be in that memory, not in a WebAssembly global,
// which each thread has a copy of.

import assert from "node:assert/strict";
import { test } from "node:test";
import { Worker } from "node:worker_threads";

import * as Gr from "../../core/model/graph.mjs";
import { MAXIMUM_PAGES, SHARED_MEMORY_IMPORT, compilar, tipoWasm } from "../../core/compiler/compiler.mjs";
import { CIMA, MEMORY_FUNCTION_NAMES, funcionesMemoria } from "../../core/compiler/linear-memory.mjs";
import { codificar } from "../../core/compiler/wasm-encoder.mjs";
import { RUN_STATUS } from "../../core/compiler/pool-scheduler.mjs";
import { PANEL_RECORD } from "../../core/compiler/panel-memory.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import { CAT, buildVI, callerCatalog } from "../helpers.mjs";

// A thread that has not answered by then is stuck (a lock that never opens): it is ended, so the test
// fails instead of keeping the process alive.
const THREAD_DEADLINE_MS = 30_000;

/** Runs `source` on a worker thread with `workerData`; resolves to the one message it sends. */
function runWorker(source, workerData) {
  const worker = new Worker(source, { eval: true, workerData });
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error(`A thread did not finish in ${THREAD_DEADLINE_MS} ms.`)), THREAD_DEADLINE_MS);
    worker.once("message", resolve);
    worker.once("error", reject);
    worker.once("exit", () => clearTimeout(deadline));
  }).finally(() => worker.terminate());
}

// The globals of each thread: whether its clump is parking, the answer it resumes with, and the clump
// and thread it runs.
const PER_THREAD_GLOBALS = ["i32", "i32", "i32", "i32"];

/** One count wired to two parallel For Loops that wait 1 ms each turn: the count crosses into both loops' clumps. */
function sharedCountTwoLoops(count) {
  let g = Gr.nuevo();
  const ids = { shown: [] };
  const place = (block, config, loopId) => {
    const created = Gr.crearNodo(g, CAT, block, 0, 0);
    g = config ? Gr.fijarConfig(created.g, created.id, config) : created.g;
    if (loopId) g = Gr.meter(g, CAT, [created.id], loopId);
    return created.id;
  };
  const connect = (from, fromPort, to, toPort) => {
    const result = Gr.conectar(g, CAT, { nodo: from, puerto: fromPort, dir: "out" }, { nodo: to, puerto: toPort, dir: "in" });
    assert.ok(!result.motivo, result.motivo);
    g = result.g;
  };
  const countConstant = place("const", { value: count });
  for (let loopNumber = 0; loopNumber < 2; loopNumber++) {
    const loop = Gr.crearEstructura(g, CAT, "for-loop", 0, 0, 200, 150);
    g = loop.g;
    const terminal = (type) => g.nodos.find((node) => node.dentro === loop.id && node.tipo === type).id;
    connect(countConstant, "result", terminal("loop-count"), "count");
    const msConstant = place("const", { value: 1 }, loop.id);
    const wait = place("wait-ms", null, loop.id);
    connect(msConstant, "result", wait, "ms");
    const shown = place("indicator", null, loop.id);
    connect(terminal("loop-iteration"), "i", shown, "value");
    ids.shown.push(shown);
  }
  return { g, ids };
}

test("a value read by another clump crosses through the data space, not through a global", async () => {
  const COUNT = 3;
  const { g, ids } = sharedCountTwoLoops(COUNT);
  const compiled = compilar(g, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  assert.deepEqual(compiled.modulo.globales, PER_THREAD_GLOBALS);
  const module = new WebAssembly.Module(compiled.bytes);
  const imports = WebAssembly.Module.imports(module);
  assert.deepEqual(imports.filter((entry) => entry.kind === "memory"), [{ module: SHARED_MEMORY_IMPORT.modulo, name: SHARED_MEMORY_IMPORT.nombre, kind: "memory" }], "the memory is the host's, for every thread");
  const unsharedMemory = new WebAssembly.Memory({ initial: compiled.memoryPages, maximum: MAXIMUM_PAGES });
  const withUnsharedMemory = {};
  for (const entry of imports) (withUnsharedMemory[entry.module] ??= {})[entry.name] = entry.kind === "memory" ? unsharedMemory : () => 0;
  assert.throws(() => new WebAssembly.Instance(module, withUnsharedMemory), WebAssembly.LinkError, "and it must be shared");
  const written = await ejecutar(compiled, {});
  for (const shown of ids.shown) assert.equal(written[shown], COUNT - 1);
});

/**
 * A module with the memory functions over a shared memory and `churn(thread, times, locked)`: each turn
 * takes two blocks, writes the thread's number in them, checks that both still hold it and frees them;
 * it returns how many times a block held another thread's number. With `locked` 0 it uses the heap
 * without its lock, so the test can show that it sees a race when there is one.
 */
function churnModule() {
  const call = (name) => MEMORY_FUNCTION_NAMES.indexOf(name);
  const memoryFunctions = funcionesMemoria(call);
  const ins = (op, arg) => (arg === undefined ? { op } : { op, arg });
  const get = (local) => ins("local.get", local);
  const [THREAD, TIMES, LOCKED, TURN, FIRST, SECOND, ERRORS] = [0, 1, 2, 3, 4, 5, 6];
  const BLOCK_BYTES = 60;
  const allocate = (into) => [get(LOCKED), ins("if"), ins("i32.const", BLOCK_BYTES), ins("call", call("asignar")), ins("local.set", into), ins("else"), ins("i32.const", BLOCK_BYTES), ins("call", call("allocateUnlocked")), ins("local.set", into), ins("end")];
  const free = (block) => [get(LOCKED), ins("if"), get(block), ins("call", call("liberar")), ins("else"), get(block), ins("call", call("freeUnlocked")), ins("end")];
  const countIfForeign = (block) => [get(block), ins("i32.load"), get(THREAD), ins("i32.ne"), get(ERRORS), ins("i32.add"), ins("local.set", ERRORS)];
  const churn = {
    params: ["i32", "i32", "i32"],
    results: ["i32"],
    locales: ["i32", "i32", "i32", "i32"],
    cuerpo: [
      ins("block"), ins("loop"),
      get(TURN), get(TIMES), ins("i32.ge_s"), ins("br_if", 1),
      ...allocate(FIRST), get(FIRST), get(THREAD), ins("i32.store"),
      ...allocate(SECOND), get(SECOND), get(THREAD), ins("i32.store"),
      ...countIfForeign(FIRST), ...countIfForeign(SECOND),
      ...free(FIRST), ...free(SECOND),
      get(TURN), ins("i32.const", 1), ins("i32.add"), ins("local.set", TURN), ins("br", 0),
      ins("end"), ins("end"),
      get(ERRORS),
    ],
  };
  const functions = [...memoryFunctions, churn];
  const types = functions.map((f) => ({ params: f.params, results: f.results }));
  return codificar({
    tipos: types,
    importaciones: [],
    funciones: functions.map((f, index) => ({ tipo: index, locales: f.locales, cuerpo: f.cuerpo })),
    memoria: { paginas: 1, maximo: MAXIMUM_PAGES, compartida: true, importada: SHARED_MEMORY_IMPORT },
    exportaciones: [{ nombre: "churn", funcion: functions.length - 1 }],
  });
}

/** Runs `churn` on `threads` worker threads at once over one memory; resolves to the foreign blocks each saw. */
function churnOnThreads(threads, times, locked) {
  const bytes = churnModule();
  const memory = new WebAssembly.Memory({ initial: 1, maximum: MAXIMUM_PAGES, shared: true });
  const HEAP_START = 4096;
  new DataView(memory.buffer).setInt32(CIMA, HEAP_START, true);
  const start = new Int32Array(new SharedArrayBuffer(4));
  const source = `
    const { workerData, parentPort } = require("node:worker_threads");
    const { bytes, memory, start, thread, times, locked, importName } = workerData;
    const instance = new WebAssembly.Instance(new WebAssembly.Module(bytes), { [importName.modulo]: { [importName.nombre]: memory } });
    Atomics.wait(start, 0, 0);
    parentPort.postMessage(instance.exports.churn(thread, times, locked));`;
  const runs = Array.from({ length: threads }, (_, index) => {
    return runWorker(source, { bytes, memory, start, thread: index + 1, times, locked: locked ? 1 : 0, importName: SHARED_MEMORY_IMPORT });
  });
  // Every thread waits for the same start, so they really allocate at the same time.
  setTimeout(() => {
    Atomics.store(start, 0, 1);
    Atomics.notify(start, 0);
  }, 50);
  return Promise.all(runs);
}

test("the heap's lock lets threads allocate and free at once without sharing a block", async () => {
  const THREADS = 4;
  const TIMES = 200_000;
  const foreign = await churnOnThreads(THREADS, TIMES, true);
  assert.deepEqual(foreign, Array(THREADS).fill(0));
});

/**
 * `loops` parallel For Loops of `count` iterations; each iteration waits 0 ms twice in parallel (two
 * long nodes, so a subplan of their own clumps every iteration) and writes `i` to its indicator.
 * Every wait parks its clump, and with a pool it resumes on whichever thread takes it.
 */
function parallelWaitingLoops(loops, count) {
  let g = Gr.nuevo();
  const indicators = [];
  const place = (block, config, loopId) => {
    const created = Gr.crearNodo(g, CAT, block, 0, 0);
    g = config ? Gr.fijarConfig(created.g, created.id, config) : created.g;
    if (loopId) g = Gr.meter(g, CAT, [created.id], loopId);
    return created.id;
  };
  const connect = (from, fromPort, to, toPort) => {
    const result = Gr.conectar(g, CAT, { nodo: from, puerto: fromPort, dir: "out" }, { nodo: to, puerto: toPort, dir: "in" });
    assert.ok(!result.motivo, result.motivo);
    g = result.g;
  };
  for (let loopNumber = 0; loopNumber < loops; loopNumber++) {
    const loop = Gr.crearEstructura(g, CAT, "for-loop", 0, 0, 200, 150);
    g = loop.g;
    const terminal = (type) => g.nodos.find((node) => node.dentro === loop.id && node.tipo === type).id;
    connect(place("const", { value: count }), "result", terminal("loop-count"), "count");
    for (let wait = 0; wait < 2; wait++) connect(place("const", { value: 0 }, loop.id), "result", place("wait-ms", null, loop.id), "ms");
    const shown = place("indicator", null, loop.id);
    connect(terminal("loop-iteration"), "i", shown, "value");
    indicators.push(shown);
  }
  return { g, indicators };
}

/**
 * Runs a compiled VI on `threads` worker threads at once, each in `run_thread` blocking, over one
 * memory. Resolves to each thread's status and, for each indicator, how many times it was written and
 * its last value, from its record of the panel.
 */
async function runOnPool(compiled, threads, { duringRun } = {}) {
  const memory = new WebAssembly.Memory({ initial: compiled.memoryPages, maximum: MAXIMUM_PAGES, shared: true });
  const module = new WebAssembly.Module(compiled.bytes);
  const coordinator = new WebAssembly.Instance(module, poolImports(module, memory));
  coordinator.exports.initialize();
  coordinator.exports.prepare_run(threads, performance.timeOrigin + performance.now());
  const source = `
    const { workerData, parentPort } = require("node:worker_threads");
    const { module, memory, thread } = workerData;
    const now = () => performance.timeOrigin + performance.now();
    const imports = {};
    for (const entry of WebAssembly.Module.imports(module)) {
      const place = (imports[entry.module] ??= {});
      if (entry.kind === "memory") place[entry.name] = memory;
      else if (entry.name === "ahora" || entry.name === "reloj_real") place[entry.name] = now;
      else if (entry.name === "reloj") place[entry.name] = () => Math.floor(now()) >>> 0;
      else place[entry.name] = () => { throw new Error("unexpected import " + entry.name); };
    }
    const instance = new WebAssembly.Instance(module, imports);
    parentPort.postMessage(instance.exports.run_thread(thread, 1));`;
  // What the coordinator does while the threads run (it writes controls), until they have all ended.
  const stopCoordinator = duringRun?.(coordinator.exports, memory);
  const statuses = await Promise.all(
    Array.from({ length: threads }, (_, thread) => {
      return runWorker(source, { module, memory, thread });
    }),
  );
  await stopCoordinator?.();
  // Each indicator's record of the panel: how many times it was written and its last value.
  const view = new DataView(memory.buffer);
  const lastValue = (record, type) => (tipoWasm(type) === "f64" ? view.getFloat64(record + PANEL_RECORD.value, true) : view.getInt32(record + PANEL_RECORD.value, true));
  const indicators = compiled.indicadores.map(({ record, tipo }) => ({ writes: view.getInt32(record + PANEL_RECORD.version, true), last: lastValue(record, tipo) }));
  return { statuses, indicators };
}

/** The imports of the coordinating thread, which only prepares the Run here. */
function poolImports(module, memory) {
  const imports = {};
  for (const entry of WebAssembly.Module.imports(module)) (imports[entry.module] ??= {})[entry.name] = entry.kind === "memory" ? memory : () => 0;
  return imports;
}

test("a pool of threads runs every clump once, parks and resumes them on any thread, and ends", { timeout: 60_000 }, async () => {
  const LOOPS = 8;
  const COUNT = 300;
  const THREADS = 6;
  const { g, indicators } = parallelWaitingLoops(LOOPS, COUNT);
  const compiled = compilar(g, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  assert.ok(compiled.planes.length >= LOOPS, "each loop's body is a subplan");
  for (let repetition = 0; repetition < 3; repetition++) {
    const result = await runOnPool(compiled, THREADS);
    assert.deepEqual(result.statuses, Array(THREADS).fill(RUN_STATUS.done));
    const byNode = Object.fromEntries(compiled.indicadores.map((indicator, index) => [indicator.nodo, result.indicators[index]]));
    for (const shown of indicators) assert.deepEqual(byNode[shown], { writes: COUNT, last: COUNT - 1 });
  }
});

/** A functional global that counts its calls (an uninitialized shift register) and waits 0 ms while it is called. */
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

test("on a pool, a non-reentrant subVI called from parallel loops serves one call at a time", { timeout: 60_000 }, async () => {
  const LOOPS = 6;
  const COUNT = 200;
  const THREADS = 6;
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
  const compiled = compilar(caller.g, cat);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const result = await runOnPool(compiled, THREADS);
  assert.deepEqual(result.statuses, Array(THREADS).fill(RUN_STATUS.done));
  // The last call of all saw every call before it: no two calls ever counted at once.
  assert.equal(Math.max(...result.indicators.map((indicator) => indicator.last)), LOOPS * COUNT);
  assert.ok(result.indicators.every((indicator) => indicator.writes === COUNT));
});

/** `loops` parallel For Loops of `iterations` turns of x = x·1.0000001 + 0.5, each showing its x at the end. */
const computeLoops = (loops, iterations) =>
  buildVI(CAT, (b) => {
    for (let loop = 0; loop < loops; loop++) {
      b.loop(`l${loop}`, "for-loop");
      b.node(`n${loop}`, "const", { value: iterations });
      b.wire(`n${loop}.result`, `l${loop}:N.count`);
      b.shiftRegister(`x${loop}`, `l${loop}`);
      b.node(`zero${loop}`, "const", { value: 0 });
      b.wire(`zero${loop}.result`, `x${loop}.left.init`);
      b.node(`factor${loop}`, "const", { value: 1.0000001 }, `l${loop}`);
      b.node(`half${loop}`, "const", { value: 0.5 }, `l${loop}`);
      b.node(`times${loop}`, "mul", null, `l${loop}`);
      b.node(`plus${loop}`, "add", null, `l${loop}`);
      b.wire(`x${loop}.left.value`, `times${loop}.a`);
      b.wire(`factor${loop}.result`, `times${loop}.b`);
      b.wire(`times${loop}.result`, `plus${loop}.a`);
      b.wire(`half${loop}.result`, `plus${loop}.b`);
      b.wire(`plus${loop}.result`, `x${loop}.right.value`);
      b.node(`shown${loop}`, "indicator");
      b.wire(`x${loop}.right.result`, `shown${loop}.value`);
    }
  });

// DT-063 §1: two loops that only compute use two cores, as in LabVIEW (measured: 3.0 s alone and 3.0 s with
// two copies in parallel).
test("two loops that only compute run in parallel on two threads", { timeout: 60_000 }, async () => {
  const ITERATIONS = 1e8;
  const compiled = compilar(computeLoops(2, ITERATIONS).g, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const timeOn = async (threads) => {
    const start = performance.now();
    const result = await runOnPool(compiled, threads);
    assert.deepEqual(result.statuses, Array(threads).fill(RUN_STATUS.done));
    return performance.now() - start;
  };
  const oneThread = Math.min(await timeOn(1), await timeOn(1));
  const twoThreads = Math.min(await timeOn(2), await timeOn(2));
  assert.ok(twoThreads < oneThread * 0.75, `one thread ${oneThread.toFixed(0)} ms, two threads ${twoThreads.toFixed(0)} ms`);
});

const ins = (op, arg) => (arg === undefined ? { op } : { op, arg });
const k = (n) => ins("i32.const", n);
const get = (local) => ins("local.get", local);
const set = (local) => ins("local.set", local);
const ifThen = (condition, body) => [...condition, ins("if"), ...body, ins("end")];

// The phase-fair reader-writer lock of a large control of the panel (DT-063 §10).
const RW_LOCK = 1024;
const READERS_INSIDE = 1040;
const READERS_TOGETHER = 1044;
const WRITER_INSIDE = 1048;
const VALUE = 2048;
const VALUE_WORDS = 4096;

/**
 * A module with the memory functions and two exports over a shared memory: `reader(times)` takes the
 * read lock and checks that every word of the value is the same and that no writer is inside;
 * `writer(times)` takes the write lock, checks that no reader is inside and writes a new value into
 * every word. Each returns how many times what it checked was wrong.
 */
function readWriteModule() {
  const call = (name) => ins("call", MEMORY_FUNCTION_NAMES.indexOf(name));
  const [TIMES, TURN, WRONG, WORD, FIRST] = [0, 1, 2, 3, 4];
  const forWords = (body) => [k(0), set(WORD), ins("block"), ins("loop"), get(WORD), k(VALUE_WORDS), ins("i32.ge_s"), ins("br_if", 1), ...body, get(WORD), k(1), ins("i32.add"), set(WORD), ins("br", 0), ins("end"), ins("end")];
  const wordAddress = [get(WORD), k(4), ins("i32.mul"), k(VALUE), ins("i32.add")];
  const countWrongIf = (condition) => [...condition, get(WRONG), ins("i32.add"), set(WRONG)];
  const turns = (body) => [ins("block"), ins("loop"), get(TURN), get(TIMES), ins("i32.ge_s"), ins("br_if", 1), ...body, get(TURN), k(1), ins("i32.add"), set(TURN), ins("br", 0), ins("end"), ins("end"), get(WRONG)];
  const reader = {
    params: ["i32"],
    results: ["i32"],
    locales: ["i32", "i32", "i32", "i32"],
    cuerpo: turns([
      k(RW_LOCK), call("read_lock"),
      // Another reader inside at the same time: they share the lock.
      ...ifThen([k(READERS_INSIDE), k(1), ins("i32.atomic.rmw.add"), k(0), ins("i32.gt_s")], [k(READERS_TOGETHER), k(1), ins("i32.atomic.store")]),
      ...countWrongIf([k(WRITER_INSIDE), ins("i32.atomic.load")]),
      k(VALUE), ins("i32.load"), set(FIRST),
      ...forWords(countWrongIf([...wordAddress, ins("i32.load"), get(FIRST), ins("i32.ne")])),
      k(READERS_INSIDE), k(1), ins("i32.atomic.rmw.sub"), ins("drop"),
      k(RW_LOCK), call("read_unlock"),
    ]),
  };
  const writer = {
    params: ["i32"],
    results: ["i32"],
    locales: ["i32", "i32", "i32", "i32"],
    cuerpo: turns([
      k(RW_LOCK), call("write_lock"),
      k(WRITER_INSIDE), k(1), ins("i32.atomic.store"),
      ...countWrongIf([k(READERS_INSIDE), ins("i32.atomic.load"), k(0), ins("i32.ne")]),
      ...forWords([...wordAddress, get(TURN), ins("i32.store")]),
      k(WRITER_INSIDE), k(0), ins("i32.atomic.store"),
      k(RW_LOCK), call("write_unlock"),
    ]),
  };
  const functions = [...funcionesMemoria((name) => MEMORY_FUNCTION_NAMES.indexOf(name)), reader, writer];
  return codificar({
    tipos: functions.map((f) => ({ params: f.params, results: f.results })),
    importaciones: [],
    funciones: functions.map((f, index) => ({ tipo: index, locales: f.locales, cuerpo: f.cuerpo })),
    memoria: { paginas: 1, maximo: MAXIMUM_PAGES, compartida: true, importada: SHARED_MEMORY_IMPORT },
    exportaciones: [{ nombre: "reader", funcion: functions.length - 2 }, { nombre: "writer", funcion: functions.length - 1 }],
  });
}

/** Runs `roles` (each "reader" or "writer", with its times) on worker threads at once; resolves to what each counted wrong. */
function runRoles(bytes, memory, roles) {
  const start = new Int32Array(new SharedArrayBuffer(4));
  const source = `
    const { workerData, parentPort } = require("node:worker_threads");
    const { bytes, memory, start, role, times, importName } = workerData;
    const instance = new WebAssembly.Instance(new WebAssembly.Module(bytes), { [importName.modulo]: { [importName.nombre]: memory } });
    Atomics.wait(start, 0, 0);
    parentPort.postMessage(instance.exports[role](times));`;
  const runs = roles.map(({ role, times }) => {
    return runWorker(source, { bytes, memory, start, role, times, importName: SHARED_MEMORY_IMPORT });
  });
  setTimeout(() => {
    Atomics.store(start, 0, 1);
    Atomics.notify(start, 0);
  }, 50);
  return Promise.all(runs);
}

test("the read-write lock lets readers in together, never with a writer, and starves nobody", { timeout: 60_000 }, async () => {
  const READERS = 4;
  const WRITERS = 2;
  const READS = 20_000;
  const WRITES = 2_000;
  const memory = new WebAssembly.Memory({ initial: 1, maximum: MAXIMUM_PAGES, shared: true });
  const roles = [...Array(READERS).fill({ role: "reader", times: READS }), ...Array(WRITERS).fill({ role: "writer", times: WRITES })];
  // Each thread ends only after all its turns: a starved writer or reader would hit the timeout.
  const wrong = await runRoles(readWriteModule(), memory, roles);
  assert.deepEqual(wrong, Array(roles.length).fill(0), "no torn value, no reader beside a writer");
  assert.equal(new Int32Array(memory.buffer)[READERS_TOGETHER / 4], 1, "two readers were inside at once");
});

/**
 * `loops` parallel For Loops of `reads` turns; loop k reads the I32 array control `A<k>` every turn and
 * counts the reads whose first and last elements differ, which a value half old and half new would give.
 */
const readersOfArrayControls = (loops, reads) =>
  buildVI(CAT, (b) => {
    for (let loop = 0; loop < loops; loop++) {
      b.loop(`l${loop}`, "for-loop");
      b.node(`n${loop}`, "const", { value: reads });
      b.wire(`n${loop}.result`, `l${loop}:N.count`);
      b.shiftRegister(`torn${loop}`, `l${loop}`);
      b.node(`zero${loop}`, "const", { value: 0, type: "i32" });
      b.wire(`zero${loop}.result`, `torn${loop}.left.init`);
      b.node(`a${loop}`, "arr-control", { type: { array: "i32" } }, `l${loop}`);
      b.node(`firstIndex${loop}`, "const", { value: 0, type: "i32" }, `l${loop}`);
      b.node(`first${loop}`, "index-array", null, `l${loop}`);
      b.node(`size${loop}`, "array-size", null, `l${loop}`);
      b.node(`lastIndex${loop}`, "decrement", null, `l${loop}`);
      b.node(`last${loop}`, "index-array", null, `l${loop}`);
      b.node(`differ${loop}`, "not-equal", null, `l${loop}`);
      b.node(`count${loop}`, "boolean-to-0-1", null, `l${loop}`);
      b.node(`plus${loop}`, "add", null, `l${loop}`);
      b.wire(`a${loop}.result`, `first${loop}.array`);
      b.wire(`firstIndex${loop}.result`, `first${loop}.index`);
      b.wire(`a${loop}.result`, `size${loop}.array`);
      b.wire(`size${loop}.size`, `lastIndex${loop}.x`);
      b.wire(`a${loop}.result`, `last${loop}.array`);
      b.wire(`lastIndex${loop}.result`, `last${loop}.index`);
      b.wire(`first${loop}.element`, `differ${loop}.x`);
      b.wire(`last${loop}.element`, `differ${loop}.y`);
      b.wire(`differ${loop}.result`, `count${loop}.boolean`);
      b.wire(`torn${loop}.left.value`, `plus${loop}.a`);
      b.wire(`count${loop}.result`, `plus${loop}.b`);
      b.wire(`plus${loop}.result`, `torn${loop}.right.value`);
      b.node(`shown${loop}`, "indicator", { type: "i32" });
      b.wire(`torn${loop}.right.result`, `shown${loop}.value`);
    }
  });

// DT-063 §10, measured in LabVIEW (case 8: never torn): a control is read on any thread while the
// coordinator writes it.
test("an array control read on other threads while the coordinator writes it is never torn", { timeout: 60_000 }, async () => {
  const LOOPS = 4;
  const READS = 3000;
  const ELEMENTS = 100_000;
  const { g } = readersOfArrayControls(LOOPS, READS);
  const compiled = compilar(g, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  let writes = 0;
  // Each write puts ELEMENTS copies of a new number into every control, under its write lock.
  const writeEveryControl = (exports, memory) => {
    writes++;
    for (const { record } of compiled.controles) {
      exports.write_lock(record + PANEL_RECORD.lock);
      const elements = exports.nuevo_array(record + PANEL_RECORD.value, ELEMENTS, 4, 0);
      new Int32Array(memory.buffer, elements, ELEMENTS).fill(writes);
      exports.write_unlock(record + PANEL_RECORD.lock);
    }
  };
  const duringRun = (exports, memory) => {
    let running = true;
    const finished = (async () => {
      while (running) {
        writeEveryControl(exports, memory);
        await new Promise((resolve) => setImmediate(resolve));
      }
    })();
    return () => {
      running = false;
      return finished;
    };
  };
  const result = await runOnPool(compiled, LOOPS, { duringRun });
  assert.deepEqual(result.statuses, Array(LOOPS).fill(RUN_STATUS.done));
  assert.ok(writes > 10, `the coordinator wrote while they read (${writes} writes)`);
  assert.deepEqual(result.indicators.map((indicator) => indicator.last), Array(LOOPS).fill(0), "no read was torn");
});

test("a VI with nothing in it compiles to a valid module and its Run ends at once", async () => {
  const compiled = compilar(Gr.nuevo(), CAT);
  assert.ok(WebAssembly.validate(compiled.bytes), "the scheduler's call_indirect has its table, empty");
  assert.deepEqual(await ejecutar(compiled, {}), {});
});
