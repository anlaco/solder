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
import { ERROR } from "../../core/model/types.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import { loadSolderIo } from "../../native/solder-io-node/solder-io.mjs";
import { CAT, buildVI } from "../helpers.mjs";

const FIXTURE_SOURCE = path.resolve("native/solder-io/tests/fixtures/handle_functions.rs");
let temporaryFolder;
let library;

const BRIDGE_SOURCE = path.resolve("native/solder-memory-bridge/src/lib.rs");
const ON_WINDOWS = process.platform === "win32";

/** `rustc` building `source` as a `cdylib` named `crateName` at `output`. */
function compileLibrary(source, crateName, output, linkArguments = []) {
  const compiled = spawnSync("rustc", ["--edition", "2024", "--crate-type", "cdylib", "--crate-name", crateName, source, "-o", output, ...linkArguments], { stdio: "inherit" });
  assert.equal(compiled.status, 0, `${crateName} compiles`);
}

/**
 * On Windows the fixture imports LabVIEW's memory functions from `lvrt.dll`, as a library built with `labview.lib` does
 * (DT-088 §4), so it is linked with the import library of a bridge compiled under that name, as
 * native/solder-io/tests/handle_library.rs does; at run time the loader finds the `lvrt.dll` the I/O already loaded.
 * Elsewhere it finds them in the bridge loaded with `RTLD_GLOBAL`, and needs nothing.
 */
function bridgeLinkArguments() {
  if (!ON_WINDOWS) return [];
  compileLibrary(BRIDGE_SOURCE, "lvrt", path.join(temporaryFolder, "lvrt.dll"));
  // rustc names the import library of `lvrt.dll` `lvrt.dll.lib`, which `-l dylib=lvrt.dll` links.
  return ["-L", temporaryFolder, "-l", "dylib=lvrt.dll"];
}

before(() => {
  temporaryFolder = mkdtempSync(path.join(os.tmpdir(), "solder-handle-fixture-"));
  library = path.join(temporaryFolder, ON_WINDOWS ? "handle_fixture.dll" : "handle_fixture.so");
  compileLibrary(FIXTURE_SOURCE, "handle_fixture", library, bridgeLinkArguments());
});
after(() => {
  // Windows keeps a loaded library's file locked until the process ends, so there the folder stays behind.
  try {
    rmSync(temporaryFolder, { recursive: true, force: true });
  } catch (error) {
    if (error.code !== "EPERM" && error.code !== "EBUSY") throw error;
  }
});

/** Where the memory bridge is built and these runs were tried: Linux, and Windows with `lvrt.dll` (DT-088 §4). */
const BRIDGE_BUILT_HERE = ["linux", "win32"].includes(process.platform);
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

test("a string handle reaches the library with its length, and the library's changes to it come out", { skip: !BRIDGE_BUILT_HERE }, async () => {
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

test("an empty string is a handle too", { skip: !BRIDGE_BUILT_HERE }, async () => {
  const vi = buildVI(CAT, (b) => {
    b.node("text", "str-const", { value: "" });
    b.node("length", "call-library", configured({ function: "fixture_string_length", "return-type": { type: "numeric", "data-type": "i32" }, parameters: [stringHandle] }));
    b.node("count", "indicator", { type: "i32" });
    b.wire("text.result", "length.arg-0-in");
    b.wire("length.return", "count.value");
  });
  assert.equal((await run(vi)).count, 0);
});

test("an array handle carries the elements and its size, and the library's changes come out", { skip: !BRIDGE_BUILT_HERE }, async () => {
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

test("a two-dimensional array handle carries both sizes", { skip: !BRIDGE_BUILT_HERE }, async () => {
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

// The library resizes the handles with LabVIEW's memory functions (DT-088 §4), which Solder's I/O process offers by
// LabVIEW's names through its memory bridge.

test("a library that grows a string handle with DSSetHandleSize gives the OVI the longer string", { skip: !BRIDGE_BUILT_HERE }, async () => {
  const vi = buildVI(CAT, (b) => {
    b.node("text", "str-const", { value: "ab" });
    b.node("letter", "const", { value: 122, type: "u8" });
    b.node("count", "const", { value: 7, type: "i32" });
    b.node("repeat", "call-library", configured({
      function: "fixture_string_repeat",
      "return-type": { type: "numeric", "data-type": "i32" },
      parameters: [stringHandle, numeric("letter", "u8"), numeric("count", "i32")],
    }));
    b.node("shown", "str-indicator", {});
    b.node("error", "indicator", { type: "i32" });
    b.wire("text.result", "repeat.arg-0-in");
    b.wire("letter.result", "repeat.arg-1-in");
    b.wire("count.result", "repeat.arg-2-in");
    b.wire("repeat.arg-0-out", "shown.value");
    b.wire("repeat.return", "error.value");
  });
  const shown = await run(vi);
  assert.equal(shown.error, 0);
  assert.equal(shown.shown, "zzzzzzz");
});

test("a library that fills an empty array with NumericArrayResize gives the OVI every element", { skip: !BRIDGE_BUILT_HERE }, async () => {
  const vi = buildVI(CAT, (b) => {
    b.node("values", "arr-const", { type: { array: "number" }, value: [] });
    b.node("count", "const", { value: 500, type: "i32" });
    b.node("ramp", "call-library", configured({
      function: "fixture_array_ramp_f64",
      "return-type": { type: "numeric", "data-type": "i32" },
      parameters: [doubleHandle(1), numeric("count", "i32")],
    }));
    b.node("filled", "arr-indicator", { type: { array: "number" } });
    b.wire("values.result", "ramp.arg-0-in");
    b.wire("count.result", "ramp.arg-1-in");
    b.wire("ramp.arg-0-out", "filled.value");
  });
  const shown = await run(vi);
  assert.deepEqual(shown.filled, Array.from({ length: 500 }, (_, index) => index));
});

// Pascal strings (DT-088 §7): a length byte and the letters, in 256 bytes, cut to 255 letters as LabVIEW cuts them.
const pascal = { name: "text", type: "string", "string-format": "pascal-string-pointer" };

test("a Pascal string reaches the library with its length byte, cut to 255 letters", { skip: !BRIDGE_BUILT_HERE }, async () => {
  const vi = buildVI(CAT, (b) => {
    b.node("text", "str-const", { value: "a".repeat(300) });
    b.node("length", "call-library", configured({ function: "fixture_pascal_length", "return-type": { type: "numeric", "data-type": "i32" }, parameters: [pascal] }));
    b.node("count", "indicator", { type: "i32" });
    b.node("shown", "str-indicator", {});
    b.wire("text.result", "length.arg-0-in");
    b.wire("length.return", "count.value");
    b.wire("length.arg-0-out", "shown.value");
  });
  const shown = await run(vi);
  assert.equal(shown.count, 255);
  assert.equal(shown.shown, "a".repeat(255));
});

test("a library may leave a longer Pascal string than it was given, up to 255 letters, and the OVI gets it", { skip: !BRIDGE_BUILT_HERE }, async () => {
  const vi = buildVI(CAT, (b) => {
    b.node("text", "str-const", { value: "abc" });
    b.node("count", "const", { value: 200, type: "u8" });
    b.node("letter", "const", { value: 122, type: "u8" });
    b.node("set", "call-library", configured({ function: "fixture_pascal_set", parameters: [pascal, numeric("count", "u8"), numeric("letter", "u8")] }));
    b.node("shown", "str-indicator", {});
    b.wire("text.result", "set.arg-0-in");
    b.wire("count.result", "set.arg-1-in");
    b.wire("letter.result", "set.arg-2-in");
    b.wire("set.arg-0-out", "shown.value");
  });
  assert.equal((await run(vi)).shown, "z".repeat(200));
});

test("a returned Pascal string comes out whole", { skip: !BRIDGE_BUILT_HERE }, async () => {
  const vi = buildVI(CAT, (b) => {
    b.node("long", "call-library", configured({ function: "fixture_pascal_return_long", "return-type": { type: "string", "string-format": "pascal-string-pointer" }, parameters: [] }));
    b.node("shown", "str-indicator", {});
    b.wire("long.return", "shown.value");
  });
  assert.equal((await run(vi)).shown, "x".repeat(200));
});

// Pointers to handles (DT-088 §8, measured 2026-11-12, labview-captures/reports/2026-11-12-clfn-handle-pointers.md): an
// empty value is a null handle, and the library may replace the handle or leave the cell null.
const stringHandlePointer = { name: "text", type: "string", "string-format": "string-handle-pointer" };

/** An OVI that passes `text` to `functionName` through a pointer to a string handle, with the string and error out shown. */
const throughStringHandlePointer = (text, functionName, extraParameters = [], extraConstants = []) =>
  buildVI(CAT, (b) => {
    b.node("text", "str-const", { value: text });
    b.node("call", "call-library", configured({ function: functionName, "return-type": { type: "numeric", "data-type": "i32" }, parameters: [stringHandlePointer, ...extraParameters] }));
    b.node("shown", "str-indicator", {});
    b.node("returned", "indicator", { type: "i32" });
    b.node("error", "cluster-indicator", { type: ERROR, style: "error-out" });
    b.wire("text.result", "call.arg-0-in");
    extraConstants.forEach(([value, type], index) => {
      b.node(`extra${index}`, "const", { value, type });
      b.wire(`extra${index}.result`, `call.arg-${index + 1}-in`);
    });
    b.wire("call.arg-0-out", "shown.value");
    b.wire("call.return", "returned.value");
    b.wire("call.error-out", "error.value");
  });

test("an empty string reaches a pointer to a string handle as a null handle, and a full one as a handle", { skip: !BRIDGE_BUILT_HERE }, async () => {
  assert.equal((await run(throughStringHandlePointer("", "fixture_handle_pointer_is_null"))).returned, 1);
  const shown = await run(throughStringHandlePointer("abc", "fixture_handle_pointer_is_null"));
  assert.equal(shown.returned, 0);
  assert.equal(shown.shown, "abc");
});

test("a library that puts a new handle in the cell gives the OVI its string, whether the cell held one or not", { skip: !BRIDGE_BUILT_HERE }, async () => {
  const letterAndCount = [numeric("letter", "u8"), numeric("count", "i32")];
  for (const text of ["abc", ""]) {
    const shown = await run(throughStringHandlePointer(text, "fixture_string_pointer_replace", letterAndCount, [[110, "u8"], [3, "i32"]]));
    assert.equal(shown.shown, "nnn", JSON.stringify(text));
  }
});

test("a cell the library leaves null gives the OVI an empty string, with no error", { skip: !BRIDGE_BUILT_HERE }, async () => {
  const shown = await run(throughStringHandlePointer("abc", "fixture_handle_pointer_clear"));
  assert.equal(shown.shown, "");
  assert.equal(shown.error.status, false);
});

test("an address left in the cell that is not a handle is not read, and the node gives error 1097", { skip: !BRIDGE_BUILT_HERE }, async () => {
  const shown = await run(throughStringHandlePointer("abc", "fixture_handle_pointer_stranger"));
  assert.equal(shown.error.status, true);
  assert.equal(shown.error.code, 1097);
});

test("a library makes an array in a pointer to an array handle that came empty", { skip: !BRIDGE_BUILT_HERE }, async () => {
  const vi = buildVI(CAT, (b) => {
    b.node("values", "arr-const", { type: { array: "number" }, value: [] });
    b.node("count", "const", { value: 4, type: "i32" });
    b.node("ramp", "call-library", configured({
      function: "fixture_array_pointer_ramp_f64",
      "return-type": { type: "numeric", "data-type": "i32" },
      parameters: [{ ...doubleHandle(1), "array-format": "array-handle-pointer" }, numeric("count", "i32")],
    }));
    b.node("filled", "arr-indicator", { type: { array: "number" } });
    b.wire("values.result", "ramp.arg-0-in");
    b.wire("count.result", "ramp.arg-1-in");
    b.wire("ramp.arg-0-out", "filled.value");
  });
  assert.deepEqual((await run(vi)).filled, [0, 1, 2, 3]);
});
