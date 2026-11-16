// The values that structures hold or pass on: what an input tunnel gives to frames that run as subplans, and what a
// shift register of a type kept by reference (a string, an array) holds from one turn to the next. Each case is what
// dataflow requires and LabVIEW does: a wire carries a value, never a place that someone else may rewrite.

import assert from "node:assert/strict";
import { test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import { CAT, buildOVI } from "../helpers.mjs";

/** Runs `vi`; the writes come back by the names `vi` gave its nodes. */
async function run(vi, values = {}) {
  const compiled = compilar(vi.g, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const nameOf = Object.fromEntries(Object.entries(vi.id).map(([name, nodeId]) => [nodeId, name]));
  const written = await ejecutar(compiled, Object.fromEntries(Object.entries(values).map(([name, value]) => [vi.id[name], value])));
  return Object.fromEntries(Object.entries(written).map(([nodeId, value]) => [nameOf[nodeId], value]));
}

// Two nodes that take time in one frame make its body a subplan (DT-041), whose clumps read the tunnel through a cell
// of the data space. The cell was written only in the branch of the first frame compiled, so the other frame read 0.
test("every frame of a Case that runs as a subplan reads its input tunnel", async () => {
  const ADDED_IN_FRAME = [100, 200];
  const vi = buildOVI(CAT, (b) => {
    b.loop("case", "case-structure");
    b.node("selector", "bool-control");
    b.node("x", "control");
    b.tunnel("in", "case", "in");
    b.tunnel("out", "case", "out");
    ADDED_IN_FRAME.forEach((added, frame) => {
      b.node(`ms${frame}`, "num-const", { value: 1 }, "case", frame);
      for (const wait of [`wait${frame}a`, `wait${frame}b`]) {
        b.node(wait, "wait-ms", null, "case", frame);
        b.wire(`ms${frame}.result`, `${wait}.ms`);
      }
      b.node(`added${frame}`, "const", { value: added }, "case", frame);
      b.node(`sum${frame}`, "add", null, "case", frame);
      b.wire("in.y", `sum${frame}.a`);
      b.wire(`added${frame}.result`, `sum${frame}.b`);
      b.wire(`sum${frame}.result`, `out.x-${frame}`);
    });
    b.node("result", "indicator");
    b.wire("selector.result", "case:sel.selector");
    b.wire("x.result", "in.x");
    b.wire("out.y", "result.value");
  });
  assert.deepEqual(await run(vi, { selector: false, x: 5 }), { result: 105 });
  assert.deepEqual(await run(vi, { selector: true, x: 5 }), { result: 205 });
});

/** A For Loop of `turns` turns whose two shift registers, started with `first` and `second`, exchange their values every turn. */
const swappingRegisters = (turns, constant, first, second, indicator, indicatorConfig) =>
  buildOVI(CAT, (b) => {
    b.loop("loop", "for-loop");
    b.node("turns", "num-const", { value: turns });
    b.wire("turns.result", "loop:N.count");
    b.shiftRegister("a", "loop");
    b.shiftRegister("b", "loop");
    b.node("first", constant, first);
    b.node("second", constant, second);
    b.wire("first.result", "a.left.init");
    b.wire("second.result", "b.left.init");
    b.wire("a.left.value", "b.right.value");
    b.wire("b.left.value", "a.right.value");
    b.node("a-out", indicator, indicatorConfig);
    b.node("b-out", indicator, indicatorConfig);
    b.wire("a.right.result", "a-out.value");
    b.wire("b.right.result", "b-out.value");
  });

// A register of a string or an array keeps its value in a place of its own. Each register's new value was copied
// into its place one after the other, so the second copy read what the first had just overwritten.
test("two shift registers of strings exchange their values", async () => {
  const strings = (turns) => swappingRegisters(turns, "str-const", { value: "A" }, { value: "B" }, "str-indicator");
  assert.deepEqual(await run(strings(1)), { "a-out": "B", "b-out": "A" });
  assert.deepEqual(await run(strings(2)), { "a-out": "A", "b-out": "B" });
});

test("two shift registers of arrays exchange their values", async () => {
  const type = { array: "number" };
  const arrays = (turns) => swappingRegisters(turns, "arr-const", { type, value: [1, 2] }, { type, value: [3, 4] }, "arr-indicator", { type });
  assert.deepEqual(await run(arrays(1)), { "a-out": [3, 4], "b-out": [1, 2] });
  assert.deepEqual(await run(arrays(2)), { "a-out": [1, 2], "b-out": [3, 4] });
});

/** A For Loop of `turns` turns that appends "x" to a string shift register started with `initial` (unwired when null). */
function appendingLoop(b, name, turns, initial, inside) {
  b.loop(name, "for-loop");
  if (inside) b.inside(name, inside);
  b.node(`${name}-turns`, "num-const", { value: turns }, inside);
  b.wire(`${name}-turns.result`, `${name}:N.count`);
  b.shiftRegister(`${name}-text`, name);
  if (initial !== null) {
    b.node(`${name}-initial`, "str-const", { value: initial }, inside);
    b.wire(`${name}-initial.result`, `${name}-text.left.init`);
  }
  b.node(`${name}-x`, "str-const", { value: "x" }, name);
  b.node(`${name}-append`, "concatenate-strings", null, name);
  b.wire(`${name}-text.left.value`, `${name}-append.string-0`);
  b.wire(`${name}-x.result`, `${name}-append.string-1`);
  b.wire(`${name}-append.concatenated-string`, `${name}-text.right.value`);
}

// The left terminal gives what the register held when the turn began. The tunnel kept the address of the register's
// place, which the end of the turn rewrote with the new value.
test("an output tunnel wired to a string shift register's left terminal gives what the last turn began with", async () => {
  const vi = buildOVI(CAT, (b) => {
    appendingLoop(b, "loop", 3, "");
    b.tunnel("out", "loop", "out");
    b.wire("loop-text.left.value", "out.x");
    b.node("before-last-turn", "str-indicator");
    b.node("final", "str-indicator");
    b.wire("out.y", "before-last-turn.value");
    b.wire("loop-text.right.result", "final.value");
  });
  assert.deepEqual(await run(vi), { "before-last-turn": "xx", final: "xxx" });
});

// An uninitialized register starts each entry with what it held when the loop last ended (DT-045).
test("an uninitialized string shift register keeps its value from one entry of its loop to the next", async () => {
  const vi = buildOVI(CAT, (b) => {
    b.loop("outer", "for-loop");
    b.node("entries", "num-const", { value: 3 });
    b.wire("entries.result", "outer:N.count");
    appendingLoop(b, "inner", 1, null, "outer");
    b.tunnel("last", "outer", "out");
    b.node("final", "str-indicator");
    b.wire("inner-text.right.result", "last.x");
    b.wire("last.y", "final.value");
  });
  assert.deepEqual(await run(vi), { final: "xxx" });
});
