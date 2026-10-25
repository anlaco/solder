// SubVIs (DT-045): every VI of a hierarchy is compiled into one module, each
// with its own data space; a non-reentrant subVI serves one call at a time and
// keeps its state between calls.

import assert from "node:assert/strict";
import { test } from "node:test";

import { compilar, runnableVI } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import { loadHierarchy } from "../../core/model/hierarchy.mjs";
import { CAT, buildVI, callerCatalog } from "../helpers.mjs";

async function run(vi, cat, values = {}, options = {}, compiled = compilar(vi.g, cat)) {
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  assert.ok(WebAssembly.validate(compiled.bytes), "the module is valid WebAssembly");
  const byId = Object.fromEntries(Object.entries(vi.id).map(([k, x]) => [x, k]));
  const written = await ejecutar(compiled, Object.fromEntries(Object.entries(values).map(([k, x]) => [vi.id[k], x])), options);
  return Object.fromEntries(Object.entries(written).map(([k, x]) => [byId[k], x]));
}

/** add2: x + y, with y's default value set to 10. */
const add2 = () =>
  buildVI(CAT, (b) => {
    b.node("x", "control");
    b.node("y", "control", { value: 10 });
    b.node("add", "add");
    b.node("sum", "indicator");
    b.wire("x.result", "add.a");
    b.wire("y.result", "add.b");
    b.wire("add.result", "sum.value");
    b.connector(["x", "y"], ["sum"]);
  });

test("a subVI node has the ports of the connector of the VI it calls", () => {
  const cat = callerCatalog({ "add2.qvi": add2() });
  const caller = buildVI(cat, (b) => b.node("call", "subvi", { vi: "add2.qvi" }));
  const ports = cat.puertos(caller.g.nodos[0]);
  assert.deepEqual(ports.in.map((p) => [p.name, p.type, !!p.optional]), [["control_1", "number", true], ["control_2", "number", true]]);
  assert.deepEqual(ports.out.map((p) => [p.name, p.type]), [["indicator_1", "number"]]);
});

test("a call runs the subVI and an unwired input takes the default value of its control", async () => {
  const cat = callerCatalog({ "add2.qvi": add2() });
  const caller = buildVI(cat, (b) => {
    b.node("two", "const", { value: 2 });
    b.node("three", "const", { value: 3 });
    b.node("call", "subvi", { vi: "add2.qvi" });
    b.node("alone", "subvi", { vi: "add2.qvi" });
    b.node("r", "indicator");
    b.node("r2", "indicator");
    b.wire("two.result", "call.control_1");
    b.wire("three.result", "call.control_2");
    b.wire("call.indicator_1", "r.value");
    b.wire("two.result", "alone.control_1");
    b.wire("alone.indicator_1", "r2.value");
  });
  assert.deepEqual(await run(caller, cat), { r: 5, r2: 12 });
});

test("a subVI passes strings and arrays by value", async () => {
  const join = buildVI(CAT, (b) => {
    b.node("s", "str-control");
    b.node("t", "str-const", { value: "!" });
    b.node("cat", "concatenate-strings");
    b.node("out", "str-indicator");
    b.node("a", "arr-control", { type: { array: "number" } });
    b.node("size", "array-size");
    b.node("n", "indicator", { type: "i32" });
    b.wire("s.result", "cat.string-0");
    b.wire("t.result", "cat.string-1");
    b.wire("cat.concatenated-string", "out.value");
    b.wire("a.result", "size.array");
    b.wire("size.size", "n.value");
    b.connector(["s", "a"], ["out", "n"]);
  });
  const cat = callerCatalog({ "join.qvi": join });
  const caller = buildVI(cat, (b) => {
    b.node("text", "str-const", { value: "hola" });
    b.node("arr", "arr-const", { type: { array: "number" }, value: [1, 2, 3] });
    b.node("call", "subvi", { vi: "join.qvi" });
    b.node("r", "str-indicator");
    b.node("rn", "indicator", { type: "i32" });
    b.wire("text.result", "call.str-control_1");
    b.wire("arr.result", "call.arr-control_1");
    b.wire("call.str-indicator_1", "r.value");
    b.wire("call.indicator_1", "rn.value");
  });
  assert.deepEqual(await run(caller, cat), { r: "hola!", rn: 3 });
});

/** A functional global variable: a While that runs once with an uninitialized shift register that counts the calls. */
const counter = (execution) =>
  buildVI(CAT, (b) => {
    b.loop("w", "while-loop");
    b.shiftRegister("sr", "w");
    b.node("one", "const", { value: 1, type: "i32" }, "w");
    b.node("plus", "add", null, "w");
    b.node("true", "bool-const", { value: true }, "w");
    b.node("count", "indicator", { type: "i32" });
    b.wire("sr.left.value", "plus.a");
    b.wire("one.result", "plus.b");
    b.wire("plus.result", "sr.right.value");
    b.wire("true.result", "w:stop.stop");
    b.wire("sr.right.result", "count.value");
    b.connector([], ["count"]);
    if (execution) b.execution(execution);
  });

/** Two calls to the same subVI from one caller. */
function twoCalls(cat, path) {
  return buildVI(cat, (b) => {
    b.node("first", "subvi", { vi: path });
    b.node("second", "subvi", { vi: path });
    b.node("r1", "indicator", { type: "i32" });
    b.node("r2", "indicator", { type: "i32" });
    b.wire("first.indicator_1", "r1.value");
    b.wire("second.indicator_1", "r2.value");
  });
}

test("a non-reentrant subVI keeps its uninitialized shift register between calls (functional global)", async () => {
  const cat = callerCatalog({ "counter.qvi": counter() });
  const caller = twoCalls(cat, "counter.qvi");
  const r = await run(caller, cat);
  assert.deepEqual([r.r1, r.r2].sort(), [1, 2], "both calls share one data space");
});

test("a preallocated-clone reentrant subVI has one data space per call site", async () => {
  const cat = callerCatalog({ "counter.qvi": counter({ reentrancy: "preallocated" }) });
  const caller = twoCalls(cat, "counter.qvi");
  const r = await run(caller, cat);
  assert.deepEqual([r.r1, r.r2], [1, 1]);
});

/** A subVI that waits `ms` milliseconds. */
const waiter = (execution) =>
  buildVI(CAT, (b) => {
    b.node("ms", "const", { value: 150, type: "i32" });
    b.node("wait", "wait-ms");
    b.node("done", "indicator", { type: "u32" });
    b.wire("ms.result", "wait.ms");
    b.wire("wait.result", "done.value");
    b.connector([], ["done"]);
    if (execution) b.execution(execution);
  });

async function timeTwoParallelCalls(execution) {
  const cat = callerCatalog({ "wait.qvi": waiter(execution) });
  const caller = buildVI(cat, (b) => {
    b.node("a", "subvi", { vi: "wait.qvi" });
    b.node("b", "subvi", { vi: "wait.qvi" });
    b.node("ra", "indicator", { type: "u32" });
    b.node("rb", "indicator", { type: "u32" });
    b.wire("a.indicator_1", "ra.value");
    b.wire("b.indicator_1", "rb.value");
  });
  const start = performance.now();
  await run(caller, cat);
  return performance.now() - start;
}

test("two parallel calls to a non-reentrant subVI that waits take turns; reentrant ones overlap", async () => {
  const serialized = await timeTwoParallelCalls();
  assert.ok(serialized >= 290, `non-reentrant: ${serialized} ms, expected about 300`);
  const overlapped = await timeTwoParallelCalls({ reentrancy: "preallocated" });
  assert.ok(overlapped < 250, `preallocated clones: ${overlapped} ms, expected about 150`);
});

/** echo: a subVI that waits, then returns its input `x` unchanged. */
const echoAfterWait = () =>
  buildVI(CAT, (b) => {
    b.node("x", "control");
    b.node("echo", "indicator");
    b.node("ms", "const", { value: 50, type: "i32" });
    b.node("wait", "wait-ms");
    b.node("waited", "indicator", { type: "u32" });
    b.wire("ms.result", "wait.ms");
    b.wire("wait.result", "waited.value");
    b.wire("x.result", "echo.value");
    b.connector(["x"], ["echo"]);
  });

// Bug #30 (docs/design/real-programs-0.2.md): the second call wrote its input into the shared slot
// while the first one was still waiting for its turn, so both answered the second input. LabVIEW
// serializes the whole call, inputs included (measured in labview-captures/two-calls/).
test("two parallel calls to a non-reentrant subVI that waits each get their own inputs", async () => {
  const cat = callerCatalog({ "echo.qvi": echoAfterWait() });
  const caller = buildVI(cat, (b) => {
    b.node("one", "const", { value: 1 });
    b.node("two", "const", { value: 2 });
    b.node("a", "subvi", { vi: "echo.qvi" });
    b.node("b", "subvi", { vi: "echo.qvi" });
    b.node("ra", "indicator");
    b.node("rb", "indicator");
    b.wire("one.result", "a.control_1");
    b.wire("two.result", "b.control_1");
    b.wire("a.indicator_1", "ra.value");
    b.wire("b.indicator_1", "rb.value");
  });
  assert.deepEqual(await run(caller, cat), { ra: 1, rb: 2 });
});

const ERROR_TYPE = { cluster: [{ name: "status", type: "boolean" }, { name: "code", type: "i32" }, { name: "source", type: "string" }] };

/** Parse Reply: Scan From String `%f` of the input `reply`, with its value and its error out. */
const parseReply = () =>
  buildVI(CAT, (b) => {
    b.node("reply", "str-control");
    b.node("format", "str-const", { value: "%f" });
    b.node("zero", "const", { value: 0 });
    b.node("scan", "scan-from-string");
    b.node("value", "indicator");
    b.node("error", "cluster-indicator", { type: ERROR_TYPE, style: "error-out" });
    b.wire("reply.result", "scan.input-string");
    b.wire("format.result", "scan.format-string");
    b.wire("zero.result", "scan.default-0");
    b.wire("scan.output-0", "value.value");
    b.wire("scan.error-out", "error.value");
    b.connector(["reply"], ["value", "error"]);
  });

// spec/04 Rule 21k, measured in LabVIEW 2026 Q3 (examples/README.md, Instrument Protocol with FOO): the
// source of an error raised inside a subVI names the function and then the VIs, callee first.
test("the source of an error raised in a subVI names the call chain", async () => {
  const cat = callerCatalog({ "examples/Parse Reply.qvi": parseReply() });
  const caller = buildVI(cat, (b) => {
    b.node("command", "str-const", { value: "FOO" });
    b.node("parse", "subvi", { vi: "examples/Parse Reply.qvi" });
    b.node("error", "cluster-indicator", { type: ERROR_TYPE, style: "error-out" });
    b.wire("command.result", "parse.str-control_1");
    b.wire("parse.cluster-indicator_1", "error.value");
  });
  const { error } = await run(caller, cat, {}, {}, compilar(caller.g, cat, { name: "Instrument Protocol.qvi" }));
  assert.deepEqual(error, { status: true, code: 85, source: "Scan From String (arg 1) in Parse Reply.qvi->Instrument Protocol.qvi" });
});

// The editor sends the worker only what a Run needs (runnableVI), through a structured clone.
test("the call chain of an error source reaches the editor's worker", async () => {
  const cat = callerCatalog({ "examples/Parse Reply.qvi": parseReply() });
  const caller = buildVI(cat, (b) => {
    b.node("command", "str-const", { value: "FOO" });
    b.node("parse", "subvi", { vi: "examples/Parse Reply.qvi" });
    b.node("error", "cluster-indicator", { type: ERROR_TYPE, style: "error-out" });
    b.wire("command.result", "parse.str-control_1");
    b.wire("parse.cluster-indicator_1", "error.value");
  });
  const sent = structuredClone(runnableVI(compilar(caller.g, cat, { name: "Instrument Protocol.qvi" })));
  const { error } = await run(caller, cat, {}, {}, sent);
  assert.equal(error.source, "Scan From String (arg 1) in Parse Reply.qvi->Instrument Protocol.qvi");
});

test("the source of an error raised in the top-level VI names that VI", async () => {
  const vi = parseReply();
  const { error } = await run(vi, CAT, { reply: "FOO" }, {}, compilar(vi.g, CAT, { name: "Parse Reply.qvi" }));
  assert.equal(error.source, "Scan From String (arg 1) in Parse Reply.qvi");
});

test("the hierarchy is loaded from relative paths and a recursive cycle is an error", () => {
  const leaf = add2();
  const cat = callerCatalog({ "add2.qvi": leaf });
  const top = buildVI(cat, (b) => b.node("call", "subvi", { vi: "add2.qvi" }));
  const files = new Map([["lib/top.qvi", top.g], ["lib/add2.qvi", leaf.g]]);
  const resolvePath = (caller, relative) => `${caller.slice(0, caller.lastIndexOf("/") + 1)}${relative}`;
  const loaded = loadHierarchy("lib/top.qvi", CAT, { resolvePath, loadVI: (key) => files.get(key) ?? null });
  assert.deepEqual(loaded.errors, []);
  assert.deepEqual([...loaded.vis.keys()], ["lib/add2.qvi", "lib/top.qvi"], "callees before callers");
  assert.equal(loaded.vis.get("lib/top.qvi").cat.puertos(top.g.nodos[0]).in.length, 2);

  const itself = buildVI(CAT, (b) => b.node("call", "subvi", { vi: "self.qvi" }));
  const recursive = loadHierarchy("self.qvi", CAT, { resolvePath, loadVI: () => itself.g });
  assert.match(recursive.errors[0].motivo, /recursion/);
  const missing = loadHierarchy("lib/top.qvi", CAT, { resolvePath, loadVI: (key) => (key === "lib/top.qvi" ? top.g : null) });
  assert.match(missing.errors[0].motivo, /cannot be found/);
});

// labview-captures/subvi/functional-global-*: non-reentrant, Run 1 gives 1 and 2 and Run 2 gives 3 and 4;
// preallocated clones, 1 and 1 and then 2 and 2.
test("a subVI keeps its state from one Run to the next while it stays loaded", async () => {
  for (const [execution, runs] of [[undefined, [[1, 2], [3, 4]]], [{ reentrancy: "preallocated" }, [[1, 1], [2, 2]]]]) {
    const cat = callerCatalog({ "counter.qvi": counter(execution) });
    const caller = twoCalls(cat, "counter.qvi");
    const compiled = compilar(caller.g, cat);
    const estado = {};
    for (const expected of runs) {
      const r = await run(caller, cat, {}, { estado }, compiled);
      assert.deepEqual([r.r1, r.r2].sort(), expected, JSON.stringify(execution));
    }
    const edited = buildVI(cat, (b) => {
      b.node("first", "subvi", { vi: "counter.qvi" });
      b.node("second", "subvi", { vi: "counter.qvi" });
      b.node("r1", "indicator", { type: "i32" });
      b.node("r2", "indicator", { type: "i32" });
      b.node("seven", "const", { value: 7 });
      b.node("extra", "indicator");
      b.wire("first.indicator_1", "r1.value");
      b.wire("second.indicator_1", "r2.value");
      b.wire("seven.result", "extra.value");
    });
    const recompiled = await run(edited, cat, {}, { estado }, compilar(edited.g, cat));
    assert.deepEqual([recompiled.r1, recompiled.r2].sort(), runs[0], "an edited VI is another module and starts afresh");
  }
});
