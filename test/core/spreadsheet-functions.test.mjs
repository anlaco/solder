// Array To Spreadsheet String and Spreadsheet String To Array in a compiled VI (DT-067 §9), with the end of line
// of Windows, where LabVIEW was measured (labview-captures/reports/2026-10-28-spreadsheet-strings.md).

import assert from "node:assert/strict";
import { test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import { tipos } from "../../core/model/graph.mjs";
import { CAT, buildVI } from "../helpers.mjs";

async function run(vi, values = {}) {
  const compiled = compilar(vi.g, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const byId = Object.fromEntries(Object.entries(vi.id).map(([name, nodeId]) => [nodeId, name]));
  const valuesById = Object.fromEntries(Object.entries(values).map(([name, value]) => [vi.id[name], value]));
  const written = await ejecutar(compiled, valuesById, { pathRules: "windows" });
  return Object.fromEntries(Object.entries(written).map(([nodeId, value]) => [byId[nodeId], value]));
}

/** An array control of `type` written with `format` and `delimiter`, read back as `readType`. */
const roundTrip = (type, readType, format, delimiter) =>
  buildVI(CAT, (b) => {
    b.node("data", "arr-control", { type });
    b.node("format", "str-const", { value: format });
    if (delimiter !== undefined) b.node("delimiter", "str-const", { value: delimiter });
    b.node("write", "array-to-spreadsheet-string");
    b.node("text", "str-indicator");
    b.node("read", "spreadsheet-string-to-array");
    b.node("back", "arr-indicator", { type: readType });
    b.wire("data.result", "write.array");
    b.wire("format.result", "write.format-string");
    b.wire("format.result", "read.format-string");
    if (delimiter !== undefined) {
      b.wire("delimiter.result", "write.delimiter");
      b.wire("delimiter.result", "read.delimiter");
    }
    b.wire("write.spreadsheet-string", "text.value");
    b.wire("write.spreadsheet-string", "read.spreadsheet-string");
    if (readType.dims !== 2 || readType.array !== "number") {
      b.node("type", "arr-control", { type: readType });
      b.wire("type.result", "read.array-type");
    }
    b.wire("read.array", "back.value");
  });

test("a 2D DBL array becomes a spreadsheet string and back, with a tab when the delimiter is unwired", async () => {
  const out = await run(roundTrip({ array: "number", dims: 2 }, { array: "number", dims: 2 }, "%.3f"), { data: [[1, 2.5], [3, 4]] });
  assert.equal(out.text, "1.000\t2.500\r\n3.000\t4.000\r\n");
  assert.deepEqual(out.back, [[1, 2.5], [3, 4]]);
});

test("a 1D I64 array keeps every digit in the text and reads back as integers", async () => {
  const exact = await run(roundTrip({ array: "i64" }, { array: "i64" }, "%d", ","), { data: [9007199254740993n, -2n] });
  assert.equal(exact.text, "9007199254740993,-2\r\n");
  // An indicator hands an I64 over as a JavaScript number, so the way back is checked with one that fits.
  const out = await run(roundTrip({ array: "i64" }, { array: "i64" }, "%d", ","), { data: [1234567890123n, -2n] });
  assert.deepEqual(out.back, [1234567890123, -2]);
});

test("a 2D string array is written as it is and read back into the type wired to array type", async () => {
  const out = await run(roundTrip({ array: "string", dims: 2 }, { array: "string", dims: 2 }, "%s", ","), { data: [["a", "b c"], ["", "d"]] });
  assert.equal(out.text, "a,b c\r\n,d\r\n");
  assert.deepEqual(out.back, [["a", "b c"], ["", "d"]]);
});

test("a U8 array saturates when it is read back", async () => {
  const vi = buildVI(CAT, (b) => {
    b.node("text", "str-const", { value: "300,-5\r\n2.5,3.5\r\n" });
    b.node("format", "str-const", { value: "%.3f" });
    b.node("delimiter", "str-const", { value: "," });
    b.node("type", "arr-control", { type: { array: "u8", dims: 2 } });
    b.node("read", "spreadsheet-string-to-array");
    b.node("back", "arr-indicator", { type: { array: "u8", dims: 2 } });
    b.wire("text.result", "read.spreadsheet-string");
    b.wire("format.result", "read.format-string");
    b.wire("delimiter.result", "read.delimiter");
    b.wire("type.result", "read.array-type");
    b.wire("read.array", "back.value");
  });
  assert.deepEqual((await run(vi)).back, [[255, 0], [2, 4]]);
});

test("a Boolean array breaks the wire into Array To Spreadsheet String, and format string is required", () => {
  const vi = buildVI(CAT, (b) => {
    b.node("data", "arr-control", { type: { array: "boolean" } });
    b.node("write", "array-to-spreadsheet-string");
    b.wire("data.result", "write.array");
  });
  const wire = vi.g.cables[0];
  assert.ok(tipos(vi.g, CAT).cables.get(wire.id).roto, "the Boolean array's wire is broken");
  assert.ok(compilar(vi.g, CAT).errores, "and the VI does not run");
});
