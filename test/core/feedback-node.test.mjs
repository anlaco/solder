// The Feedback Node (DT-109), against what LabVIEW 2026 Q3 gives (labview-captures/reports/
// 2026-11-26-feedback-node-behavior.md): a For Loop of 5 iterations, a Feedback Node, an Increment from the node's
// output back to its input, and the outputs collected by an indexing tunnel.

import assert from "node:assert/strict";
import { test } from "node:test";
import * as Gr from "../../core/model/graph.mjs";
import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import { aTexto, leer } from "../../core/model/qvi-format.mjs";
import { CAT, buildOVI, callerCatalog } from "../helpers.mjs";

/** Runs `vi` (with `estado`, its memory from one Run to the next); the writes come back by the names `vi` gave its nodes. */
async function run(vi, { estado, cat = CAT, compiled = compilar(vi.g, cat) } = {}) {
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const nameOf = Object.fromEntries(Object.entries(vi.id).map(([name, nodeId]) => [nodeId, name]));
  const written = await ejecutar(compiled, {}, { estado });
  return Object.fromEntries(Object.entries(written).map(([nodeId, value]) => [nameOf[nodeId], value]));
}

/** Makes the tunnel `name` of `vi` index its values (a For Loop's output tunnel collects an array). */
const indexing = (vi, name) => ({ ...vi, g: Gr.fijarConfig(vi.g, vi.id[name], { indexado: true }) });

/**
 * The Feedback Node `fb` with an Add of an I32 1, `plus`, from its output back to its input, inside `structure` when
 * given. LabVIEW's case used Increment; an Add of an I32 constant gives the node a type with no initializer wired, as the
 * types are resolved forwards (unverified: which type LabVIEW gives the unwired case, integer or DBL).
 */
function addOne(b, structure, fbConfig) {
  b.node("fb", "feedback-node", fbConfig, structure);
  b.node("one", "const", { value: 1, type: "i32" }, structure);
  b.node("plus", "add", null, structure);
  b.wire("fb.output", "plus.a");
  b.wire("one.result", "plus.b");
  b.wire("plus.result", "fb.input");
}

/**
 * A loop `loop` of `count` iterations inside the loop `outer` when given, with the Feedback Node `fb` and its Increment
 * `plus` (I32), the node's outputs collected in the indexing tunnel `${loop}-out`. `steps` adds what a case needs.
 */
function countingLoop(b, { loop = "loop", count = 5, outer, fbConfig, steps } = {}) {
  b.loop(loop, "for-loop");
  if (outer) b.inside(loop, outer);
  b.node(`${loop}-count`, "const", { value: count, type: "i32" }, outer);
  b.wire(`${loop}-count.result`, `${loop}:N.count`);
  addOne(b, loop, fbConfig);
  b.tunnel(`${loop}-out`, loop, "out");
  b.wire("fb.output", `${loop}-out.x`);
  steps?.(b);
}

/** The case of Q1 to Q4: one loop, its outputs on the indicator `outputs`; the initializer `initial` when given. */
function feedbackLoop({ initial, fbConfig, steps } = {}) {
  const vi = buildOVI(CAT, (b) => {
    countingLoop(b, { fbConfig, steps });
    b.node("outputs", "arr-indicator", { type: { array: "i32" } });
    b.wire("loop-out.y", "outputs.value");
    if (initial !== undefined) {
      b.node("initial", "const", { value: initial, type: "i32" });
      b.wire("initial.result", "fb.initializer");
    }
  });
  return indexing(vi, "loop-out");
}

test("Q1: the first iteration gives the initializer, and each one after it what the one before stored", async () => {
  assert.deepEqual((await run(feedbackLoop({ initial: 0 }))).outputs, [0, 1, 2, 3, 4]);
});

test("Q2: with no initializer it keeps its value from one Run to the next, and a new load starts afresh", async () => {
  const vi = feedbackLoop();
  const compiled = compilar(vi.g, CAT);
  const estado = {};
  const runs = [];
  for (let index = 0; index < 3; index++) runs.push((await run(vi, { estado, compiled })).outputs);
  assert.deepEqual(runs, [[0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14]]);
  assert.deepEqual((await run(vi, { estado: {}, compiled })).outputs, [0, 1, 2, 3, 4], "a reload");
});

test("Q1 again: a wired initializer initializes it on the first call of every Run", async () => {
  const vi = feedbackLoop({ initial: 0 });
  const compiled = compilar(vi.g, CAT);
  const estado = {};
  for (let index = 0; index < 2; index++) assert.deepEqual((await run(vi, { estado, compiled })).outputs, [0, 1, 2, 3, 4]);
});

test("Q3: a delay of 3 gives the value stored three iterations before, the initializer in every slot", async () => {
  assert.deepEqual((await run(feedbackLoop({ initial: 0, fbConfig: { delay: 3 } }))).outputs, [0, 0, 0, 1, 1]);
});

test("Q3: a delay of 0 or less is taken as 1, as LabVIEW ignores it", async () => {
  for (const delay of [0, -1]) assert.deepEqual((await run(feedbackLoop({ initial: 0, fbConfig: { delay } }))).outputs, [0, 1, 2, 3, 4]);
});

test("Q4: with its enable FALSE it gives what it holds and does not store", async () => {
  // enable = (i mod 2 = 0)
  const vi = feedbackLoop({
    initial: 0,
    steps: (b) => {
      b.node("two", "const", { value: 2, type: "i32" }, "loop");
      b.node("mod", "quotient-remainder", null, "loop");
      b.node("even", "equal-to-0", null, "loop");
      b.wire("loop:i.i", "mod.x");
      b.wire("two.result", "mod.y");
      b.wire("mod.remainder", "even.x");
      b.wire("even.result", "fb.enable");
    },
  });
  assert.deepEqual((await run(vi)).outputs, [0, 1, 1, 2, 2]);
});

/** The values the indicator `shown` of `vi` gives on three Runs in a row, the OVI staying loaded. */
async function shownOnThreeRuns(vi) {
  const compiled = compilar(vi.g, CAT);
  const estado = {};
  const values = [];
  for (let index = 0; index < 3; index++) values.push((await run(vi, { estado, compiled })).shown);
  return values;
}

/** Q5's diagram: a Feedback Node with no loop, its output on the indicator `shown`; the initializer `initial` when given. */
const withNoLoop = (initial) =>
  buildOVI(CAT, (b) => {
    addOne(b);
    b.node("shown", "indicator", { type: "i32" });
    b.wire("fb.output", "shown.value");
    if (initial === undefined) return;
    b.node("initial", "const", { value: initial, type: "i32" });
    b.wire("initial.result", "fb.initializer");
  });

test("Q5: outside any loop it keeps its value from one Run to the next", async () => {
  assert.deepEqual(await shownOnThreeRuns(withNoLoop()), [0, 1, 2]);
});

test("Q5: outside any loop a wired initializer initializes it again on every Run", async () => {
  assert.deepEqual(await shownOnThreeRuns(withNoLoop(100)), [100, 100, 100]);
});

/**
 * Q6's diagram: an outer For Loop of 2 iterations around the counting loop of 3, the initializer 10 wired from outside
 * both, `loopsOut` loops out; the outputs of every inner iteration collected as a 2D array.
 */
function nestedLoops(loopsOut) {
  const vi = buildOVI(CAT, (b) => {
    b.loop("outer", "for-loop");
    b.node("outer-count", "const", { value: 2, type: "i32" });
    b.wire("outer-count.result", "outer:N.count");
    countingLoop(b, { loop: "inner", count: 3, outer: "outer", fbConfig: { initializerLoopsOut: loopsOut } });
    b.tunnel("outer-out", "outer", "out");
    b.wire("inner-out.y", "outer-out.x");
    b.node("ten", "const", { value: 10, type: "i32" });
    b.wire("ten.result", "fb.initializer");
    b.node("outputs", "arr-indicator", { type: { array: "i32", dims: 2 } });
    b.wire("outer-out.y", "outputs.value");
  });
  return indexing(indexing(vi, "inner-out"), "outer-out");
}

test("Q6: an initializer on the node initializes it once per Run, not at each start of its loop", async () => {
  const vi = nestedLoops(0);
  const compiled = compilar(vi.g, CAT);
  const estado = {};
  for (let index = 0; index < 2; index++) assert.deepEqual((await run(vi, { estado, compiled })).outputs, [[10, 11, 12], [13, 14, 15]]);
});

test("Q6: an initializer moved one loop out initializes it at each start of that loop", async () => {
  assert.deepEqual((await run(nestedLoops(1))).outputs, [[10, 11, 12], [10, 11, 12]]);
});

test("Q6: an initializer moved two loops out initializes it at each start of the outer loop", async () => {
  assert.deepEqual((await run(nestedLoops(2))).outputs, [[10, 11, 12], [13, 14, 15]]);
});

/** A loop of 3 with a Feedback Node of `initial`'s type, `body` from its output back to its input; the last output on `last`. */
function threeTimes({ initial, body, indicator }) {
  return buildOVI(CAT, (b) => {
    b.loop("loop", "for-loop");
    b.node("count", "const", { value: 3, type: "i32" });
    b.wire("count.result", "loop:N.count");
    b.node("fb", "feedback-node", null, "loop");
    initial(b);
    // Through a tunnel of its own: an array wired straight across a For Loop's border would be indexed.
    b.tunnel("initial-in", "loop", "in");
    b.wire("initial.result", "initial-in.x");
    b.wire("initial-in.y", "fb.initializer");
    body(b);
    b.tunnel("last-out", "loop", "out");
    b.wire("fb.output", "last-out.x");
    b.node("last", ...indicator);
    b.wire("last-out.y", "last.value");
  });
}

/** Concatenate Strings `name` of `first` and `second`, inside the loop. */
function concatenate(b, name, first, second) {
  b.node(name, "concatenate-strings", null, "loop");
  b.wire(first, `${name}.string-0`);
  b.wire(second, `${name}.string-1`);
}

// The last output is taken by the loop's output tunnel when the iteration ends, after the store half has run: it must
// still be the value given, not the one stored over it (a wire carries a value, never a place).
test("Q9: a string's Feedback Node gives its own copy, which the value stored after it does not change", async () => {
  const vi = indexing(threeTimes({
    initial: (b) => b.node("initial", "str-const", { value: "x" }),
    body: (b) => {
      b.node("a", "str-const", { value: "a" }, "loop");
      concatenate(b, "append", "fb.output", "a.result");
      b.wire("append.concatenated-string", "fb.input");
      b.tunnel("all-out", "loop", "out");
      b.wire("fb.output", "all-out.x");
      b.node("all", "arr-indicator", { type: { array: "string" } });
      b.wire("all-out.y", "all.value");
    },
    indicator: ["str-indicator"],
  }), "all-out");
  assert.deepEqual(await run(vi), { all: ["x", "xa", "xaa"], last: "xaa" });
});

test("Q9: an array's Feedback Node keeps its own copy", async () => {
  const vi = threeTimes({
    initial: (b) => b.node("initial", "arr-const", { type: { array: "number" }, value: [9.5, 1] }),
    body: (b) => {
      b.node("half", "const", { value: 0.5 }, "loop");
      b.node("append", "build-array", { inputs: 2 }, "loop");
      b.wire("fb.output", "append.element-0");
      b.wire("half.result", "append.element-1");
      b.wire("append.result", "fb.input");
    },
    indicator: ["arr-indicator", { type: { array: "number" } }],
  });
  assert.deepEqual((await run(vi)).last, [9.5, 1, 0.5, 0.5]);
});

test("Q9: a cluster's Feedback Node keeps its own copy, its string too", async () => {
  const POINT = { cluster: [{ name: "n", type: "i32" }, { name: "s", type: "string" }] };
  const vi = threeTimes({
    initial: (b) => {
      b.node("five", "const", { value: 5, type: "i32" });
      b.node("x", "str-const", { value: "x" });
      b.node("initial", "bundle", { type: POINT });
      b.wire("five.result", "initial.campo-0");
      b.wire("x.result", "initial.campo-1");
    },
    body: (b) => {
      b.node("parts", "unbundle", { type: POINT }, "loop");
      b.node("plus", "increment", null, "loop");
      b.node("a", "str-const", { value: "a" }, "loop");
      b.node("whole", "bundle", { type: POINT }, "loop");
      b.wire("fb.output", "parts.value");
      b.wire("parts.campo-0", "plus.x");
      concatenate(b, "append", "parts.campo-1", "a.result");
      b.wire("plus.result", "whole.campo-0");
      b.wire("append.concatenated-string", "whole.campo-1");
      b.wire("whole.result", "fb.input");
    },
    indicator: ["cluster-indicator", { type: POINT }],
  });
  assert.deepEqual((await run(vi)).last, [7, "xaa"]);
});

// Q5 with a subOVI: a non-reentrant subOVI's Feedback Node keeps its value from call to call and from Run to Run.
test("Q5: a non-reentrant subOVI's Feedback Node counts its calls across the caller's Runs", async () => {
  const counter = buildOVI(CAT, (b) => {
    addOne(b);
    b.node("count", "indicator", { type: "i32" });
    b.wire("fb.output", "count.value");
    b.connector([], ["count"]);
  });
  const cat = callerCatalog({ "counter.ovi": counter });
  const caller = indexing(buildOVI(cat, (b) => {
    b.loop("loop", "for-loop");
    b.node("calls", "const", { value: 3, type: "i32" });
    b.wire("calls.result", "loop:N.count");
    b.node("call", "subvi", { vi: "counter.ovi" }, "loop");
    b.tunnel("out", "loop", "out");
    b.wire("call.indicator_1", "out.x");
    b.node("counts", "arr-indicator", { type: { array: "i32" } });
    b.wire("out.y", "counts.value");
  }), "out");
  const compiled = compilar(caller.g, cat);
  const estado = {};
  assert.deepEqual((await run(caller, { estado, cat, compiled })).counts, [0, 1, 2]);
  assert.deepEqual((await run(caller, { estado, cat, compiled })).counts, [3, 4, 5]);
});

// Nothing wired into the node depends on its output here, so only the order that is not a wire keeps the store half
// after the first one: stored first, the output would be the new value.
test("a Feedback Node whose input does not come from its output still gives the value stored before", async () => {
  const vi = indexing(buildOVI(CAT, (b) => {
    b.loop("loop", "for-loop");
    b.node("count", "const", { value: 3, type: "i32" });
    b.wire("count.result", "loop:N.count");
    b.node("fb", "feedback-node", null, "loop");
    b.node("initial", "const", { value: -1, type: "i32" });
    b.wire("initial.result", "fb.initializer");
    b.wire("loop:i.i", "fb.input");
    b.tunnel("out", "loop", "out");
    b.wire("fb.output", "out.x");
    b.node("outputs", "arr-indicator", { type: { array: "i32" } });
    b.wire("out.y", "outputs.value");
  }), "out");
  assert.deepEqual((await run(vi)).outputs, [-1, 0, 1]);
});

test("a wire from a Feedback Node's output back to its input is not a cycle, and its terminals have their types", () => {
  const vi = buildOVI(CAT, (b) => {
    b.node("fb", "feedback-node");
    b.node("plus", "increment");
    b.wire("fb.output", "plus.x");
    b.wire("plus.result", "fb.input");
    b.node("initial", "num-const", { value: 0, type: "i32" });
    b.wire("initial.result", "fb.initializer");
  });
  const resolved = Gr.tipos(vi.g, CAT);
  assert.ok(Gr.ejecutable(vi.g, CAT, resolved));
  assert.deepEqual([resolved.entradas.get(`${vi.id.fb}.input`), resolved.salidas.get(`${vi.id.fb}.output`)], ["i32", "i32"]);
});

test("a wire of another type into a Feedback Node's input is coerced to the initializer's type, or broken", () => {
  const into = (source) =>
    buildOVI(CAT, (b) => {
      b.node("fb", "feedback-node");
      b.node("initial", "num-const", { value: 0, type: "i32" });
      b.wire("initial.result", "fb.initializer");
      source(b);
      b.wire("source.result", "fb.input");
    });
  const wireInto = (vi) => Gr.tipos(vi.g, CAT).cables.get(vi.g.cables.find((wire) => wire.a.nodo === vi.id.fb && wire.a.puerto === "input").id);
  const coerced = wireInto(into((b) => b.node("source", "const", { value: 2.5 })));
  assert.deepEqual([coerced.roto, coerced.coercion], [null, true]);
  assert.match(wireInto(into((b) => b.node("source", "str-const", { value: "x" }))).roto, /Incompatible types/);
});

test("a Feedback Node with nothing wired into its input breaks the OVI", () => {
  const vi = buildOVI(CAT, (b) => {
    b.node("fb", "feedback-node");
    b.node("initial", "const", { value: 0, type: "i32" });
    b.wire("initial.result", "fb.initializer");
  });
  assert.equal(Gr.ejecutable(vi.g, CAT, Gr.tipos(vi.g, CAT)), false);
  assert.match(JSON.stringify(compilar(vi.g, CAT).errores), /missing a wire on its input/);
});

test("a Feedback Node is saved as one node, with its delay and where its initializer is, and runs the same once opened", async () => {
  const vi = feedbackLoop({ initial: 0, fbConfig: { delay: 3, initializerLoopsOut: 1 } });
  const file = JSON.parse(aTexto(vi.g, CAT));
  const saved = file["block-diagram"].structures[0].body.nodes.filter((node) => node.type.startsWith("feedback"));
  assert.deepEqual(saved.map((node) => [node.type, node.config]), [["feedback-node", { delay: 3, initializerLoopsOut: 1 }]]);
  const opened = leer(file, CAT);
  const outputsOf = async (graph) => {
    const written = await ejecutar(compilar(graph, CAT), {});
    const indicator = graph.nodos.find((node) => node.tipo === "arr-indicator").id;
    return written[indicator];
  };
  assert.deepEqual(await outputsOf(opened), await outputsOf(vi.g));
  assert.deepEqual(await outputsOf(opened), [0, 0, 0, 1, 1]);
});
