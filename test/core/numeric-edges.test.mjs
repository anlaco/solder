// The edges of integer arithmetic: what a function gives when its result does not fit its type, or has no value.
// Each expected value is LabVIEW 2026 Q3's, measured on 2026-11-16 (labview-captures/reports/2026-11-16-numeric-edges.md).

import assert from "node:assert/strict";
import { test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { CAT, buildOVI } from "../helpers.mjs";

/**
 * Runs the function `block` once: `inputs` maps each input port to `[representation, value]`, `outputs` each output
 * port to the representation of the indicator that shows it. Gives the outputs by port name.
 */
async function apply(block, config, inputs, outputs) {
  const vi = buildOVI(CAT, (b) => {
    b.node("function", block, config);
    for (const port of Object.keys(inputs)) {
      b.node(`in:${port}`, "control");
      b.wire(`in:${port}.result`, `function.${port}`);
    }
    for (const port of Object.keys(outputs)) {
      b.node(port, "indicator");
      b.wire(`function.${port}`, `${port}.value`);
    }
  });
  let graph = vi.g;
  for (const [port, [representation]] of Object.entries(inputs)) graph = Gr.fijarRepresentacion(graph, vi.id[`in:${port}`], representation);
  for (const [port, representation] of Object.entries(outputs)) graph = Gr.fijarRepresentacion(graph, vi.id[port], representation);
  const compiled = compilar(graph, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const written = await ejecutar(compiled, Object.fromEntries(Object.entries(inputs).map(([port, [, value]]) => [vi.id[`in:${port}`], value])));
  return Object.fromEntries(Object.keys(outputs).map((port) => [port, written[vi.id[port]]]));
}

// The inverted output was negated in 32 bits and never cut back to the type's width: a U8 indicator showed -5.
test("Compound Arithmetic's inverted output wraps to the width of its integer type", async () => {
  const invertedSum = (representation, first, second) =>
    apply("compound-arithmetic", { inverted: ["result"] }, { "value-0": [representation, first], "value-1": [representation, second] }, { result: representation });
  assert.deepEqual(await invertedSum("u8", 3, 2), { result: 251 });
  assert.deepEqual(await invertedSum("i8", -128, 0), { result: -128 });
  assert.deepEqual(await invertedSum("u16", 1, 0), { result: 65535 });
  assert.deepEqual(await invertedSum("i32", 3, 2), { result: -5 });
});

// It was computed in the integer type with WebAssembly's division, which traps on a zero divisor: the Run died.
test("Compound Arithmetic that multiplies by an inverted input divides in DBL, also by zero", async () => {
  const timesReciprocal = (representation, first, second) =>
    apply("compound-arithmetic", { mode: "multiply", inverted: ["value-1"] }, { "value-0": [representation, first], "value-1": [representation, second] }, { result: "number" });
  assert.deepEqual(await timesReciprocal("i32", 6, 4), { result: 1.5 });
  assert.deepEqual(await timesReciprocal("i32", 6, -1), { result: -6 });
  assert.deepEqual(await timesReciprocal("i32", 6, 0), { result: Infinity });
  assert.deepEqual(await timesReciprocal("u32", 6, 4294967295), { result: 6 / 4294967295 });
});

const quotientAndRemainder = (representation, x, y) => apply("quotient-remainder", null, { x: [representation, x], y: [representation, y] }, { quotient: representation, remainder: representation });

// It was computed in DBL and converted back: a zero divisor gave the largest integer, and an I64 lost its last digits.
test("Quotient & Remainder of integers is exact, and by zero gives 0 and x", async () => {
  assert.deepEqual(await quotientAndRemainder("i32", 7, 0), { quotient: 0, remainder: 7 });
  assert.deepEqual(await quotientAndRemainder("i32", -7, 0), { quotient: 0, remainder: -7 });
  assert.deepEqual(await quotientAndRemainder("u32", 7, 0), { quotient: 0, remainder: 7 });
  assert.deepEqual(await quotientAndRemainder("i32", 7, 2), { quotient: 3, remainder: 1 });
  assert.deepEqual(await quotientAndRemainder("i32", -7, 2), { quotient: -4, remainder: 1 });
  assert.deepEqual(await quotientAndRemainder("i32", 7, -2), { quotient: -4, remainder: -1 }, "floor, as x − y·floor(x/y) says; not measured with a negative divisor");
  assert.deepEqual(await quotientAndRemainder("u32", 4000000000, 3), { quotient: 1333333333, remainder: 1 });
  assert.deepEqual(await quotientAndRemainder("i32", -2147483648, -1), { quotient: -2147483648, remainder: 0 });
  assert.deepEqual(await quotientAndRemainder("i8", -128, -1), { quotient: -128, remainder: 0 }, "the same wrap in 8 bits; not measured");
  // The panel hands an I64 over as a JavaScript number, so the quotient is checked by its remainder: 2^62 + 1 is odd.
  assert.equal((await quotientAndRemainder("i64", 2n ** 62n + 1n, 2n)).remainder, 1);
});

test("Quotient & Remainder of floats divides by zero as IEEE does", async () => {
  assert.deepEqual(await quotientAndRemainder("number", 7, 0), { quotient: Infinity, remainder: NaN });
  assert.deepEqual(await quotientAndRemainder("number", -7, 2), { quotient: -4, remainder: 1 });
});

// WebAssembly's saturating truncation gives 0 for a NaN.
test("a NaN converted to an integer gives the largest value of its type", async () => {
  const converted = async (block, representation, number) => (await apply(block, null, { number: ["number", number] }, { result: representation })).result;
  assert.equal(await converted("to-long-integer", "i32", NaN), 2147483647);
  assert.equal(await converted("to-long-integer", "i32", -Infinity), -2147483648);
  assert.equal(await converted("to-long-integer", "i32", 2.5), 2);
  assert.equal(await converted("to-long-integer", "i32", 3.5), 4);
  assert.equal(await converted("to-unsigned-byte-integer", "u8", NaN), 255);
  assert.equal(await converted("to-unsigned-byte-integer", "u8", -5), 0);
  assert.equal(await converted("to-unsigned-byte-integer", "u8", 255.5), 255);
  assert.equal(await converted("to-quad-integer", "i64", NaN), Number(2n ** 63n - 1n));
});

test("a NaN in an SGL converted to an integer gives the largest value too", async () => {
  assert.deepEqual(await apply("to-long-integer", null, { number: ["sgl", NaN] }, { result: "i32" }), { result: 2147483647 });
  assert.deepEqual(await apply("to-long-integer", null, { number: ["sgl", 2.5] }, { result: "i32" }), { result: 2 });
});

// WebAssembly shifts by the count modulo the width: 1·2^40 gave 256.
test("Scale By Power Of 2 of an integer shifts every bit out when the power is the width or more", async () => {
  const scaled = async (representation, x, n) => (await apply("scale-by-power-of-2", null, { x: [representation, x], n: ["i32", n] }, { result: representation })).result;
  const cases = [[1, 40, 0], [1, 32, 0], [1, 31, -2147483648], [1, 30, 1073741824], [-8, -40, -1], [-8, -2, -2], [-1, -31, -1], [7, -1, 3], [-7, -1, -4], [1, -2147483648, 0]];
  for (const [x, n, expected] of cases) assert.equal(await scaled("i32", x, n), expected, `I32 ${x}·2^${n}`);
  for (const [x, n, expected] of [[255, 1, 254], [255, -1, 127], [255, 8, 0], [255, -8, 0], [1, 7, 128]]) assert.equal(await scaled("u8", x, n), expected, `U8 ${x}·2^${n}`);
});
