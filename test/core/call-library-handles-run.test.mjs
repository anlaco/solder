// Handles running (DT-088): an OVI passes a string and arrays to a library as LabVIEW's handles and gets back what the
// library left in them, through the compiler, the Run, Node's addon and the Rust that calls the library. The library is
// the small one the Rust tests use (native/solder-io/tests/fixtures/handle_functions.rs), compiled here with `rustc`.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import { defaultCallLibraryConfig } from "../../core/model/call-library.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import { loadSolderIo } from "../../native/solder-io-node/solder-io.mjs";
import { CAT, buildVI } from "../helpers.mjs";

const FIXTURE_SOURCE = path.resolve("native/solder-io/tests/fixtures/handle_functions.rs");
let temporaryFolder;
let library;

before(() => {
  temporaryFolder = mkdtempSync(path.join(os.tmpdir(), "solder-handle-fixture-"));
  library = path.join(temporaryFolder, "handle_fixture.so");
  const compiled = spawnSync("rustc", ["--edition", "2024", "--crate-type", "cdylib", "--crate-name", "handle_fixture", FIXTURE_SOURCE, "-o", library], { stdio: "inherit" });
  assert.equal(compiled.status, 0, "the fixture library compiles");
});
after(() => rmSync(temporaryFolder, { recursive: true, force: true }));

const ON_LINUX = process.platform === "linux";
const configured = (config) => ({ ...defaultCallLibraryConfig(), "calling-convention": "c", thread: "any", library, ...config });
const numeric = (name, dataType, pass = "value") => ({ name, type: "numeric", "data-type": dataType, pass });
const stringHandle = { name: "text", type: "string", "string-format": "string-handle" };
const doubleHandle = (dimensions) => ({ name: "data", type: "array", "data-type": "dbl", dimensions, "array-format": "array-handle" });

async function run(vi) {
  const compiled = compilar(vi.g, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const byId = Object.fromEntries(Object.entries(vi.id).map(([name, nodeId]) => [nodeId, name]));
  const written = await ejecutar(compiled, {}, { io: loadSolderIo() });
  return Object.fromEntries(Object.entries(written).map(([nodeId, value]) => [byId[nodeId], value]));
}

test("a string handle reaches the library with its length, and the library's changes to it come out", { skip: !ON_LINUX }, async () => {
  const vi = buildVI(CAT, (b) => {
    b.node("text", "str-const", { value: "hello" });
    b.node("upper", "call-library", configured({ function: "fixture_string_to_upper", parameters: [stringHandle] }));
    b.node("length", "call-library", configured({ function: "fixture_string_length", "return-type": { type: "numeric", "data-type": "i32" }, parameters: [stringHandle] }));
    b.node("shown", "str-indicator", {});
    b.node("count", "indicator", { type: "i32" });
    b.wire("text.result", "upper.arg-0-in");
    b.wire("upper.arg-0-out", "shown.value");
    b.wire("text.result", "length.arg-0-in");
    b.wire("length.return", "count.value");
  });
  const shown = await run(vi);
  assert.equal(shown.shown, "HELLO");
  assert.equal(shown.count, 5);
});

test("an empty string is a handle too", { skip: !ON_LINUX }, async () => {
  const vi = buildVI(CAT, (b) => {
    b.node("text", "str-const", { value: "" });
    b.node("length", "call-library", configured({ function: "fixture_string_length", "return-type": { type: "numeric", "data-type": "i32" }, parameters: [stringHandle] }));
    b.node("count", "indicator", { type: "i32" });
    b.wire("text.result", "length.arg-0-in");
    b.wire("length.return", "count.value");
  });
  assert.equal((await run(vi)).count, 0);
});

test("an array handle carries the elements and its size, and the library's changes come out", { skip: !ON_LINUX }, async () => {
  const vi = buildVI(CAT, (b) => {
    b.node("values", "arr-const", { type: { array: "number" }, value: [1, 2, 3] });
    b.node("factor", "const", { value: 2, type: "number" });
    b.node("scale", "call-library", configured({ function: "fixture_array_scale_f64", parameters: [doubleHandle(1), numeric("factor", "dbl")] }));
    b.node("sum", "call-library", configured({ function: "fixture_array_sum_f64", "return-type": { type: "numeric", "data-type": "dbl" }, parameters: [doubleHandle(1)] }));
    b.node("scaled", "arr-indicator", { type: { array: "number" } });
    b.node("total", "indicator", { type: "number" });
    b.wire("values.result", "scale.arg-0-in");
    b.wire("factor.result", "scale.arg-1-in");
    b.wire("scale.arg-0-out", "scaled.value");
    b.wire("values.result", "sum.arg-0-in");
    b.wire("sum.return", "total.value");
  });
  const shown = await run(vi);
  assert.deepEqual(shown.scaled, [2, 4, 6]);
  assert.equal(shown.total, 6);
});

test("a two-dimensional array handle carries both sizes", { skip: !ON_LINUX }, async () => {
  const vi = buildVI(CAT, (b) => {
    b.node("matrix", "arr-const", { type: { array: "number", dims: 2 }, value: [[1, 2, 3], [4, 5, 6]] });
    b.node("shape", "call-library", configured({ function: "fixture_array2d_shape", parameters: [doubleHandle(2), numeric("rows", "i32", "pointer"), numeric("columns", "i32", "pointer")] }));
    b.node("rows", "indicator", { type: "i32" });
    b.node("columns", "indicator", { type: "i32" });
    b.wire("matrix.result", "shape.arg-0-in");
    b.wire("shape.arg-1-out", "rows.value");
    b.wire("shape.arg-2-out", "columns.value");
  });
  const shown = await run(vi);
  assert.deepEqual([shown.rows, shown.columns], [2, 3]);
});
