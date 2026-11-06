// The Call Library Function Node running (DT-080): an OVI calls functions of the C library through Solder's own I/O,
// with numbers by value and by pointer, strings and arrays by their address, and LabVIEW's errors when the library or
// the function is missing (labview-captures/reports/2026-11-06-clfn-run.md). The C library's names are Linux's.

import assert from "node:assert/strict";
import { after, test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import { defaultCallLibraryConfig } from "../../core/model/call-library.mjs";
import { ERROR } from "../../core/model/types.mjs";
import { createNodePool } from "../../core/runtime/node-pool.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import { loadSolderIo } from "../../native/solder-io-node/solder-io.mjs";
import { CAT, buildVI } from "../helpers.mjs";

const ON_LINUX = process.platform === "linux";
const C_LIBRARY = "libc.so.6";
const MATH_LIBRARY = "libm.so.6";
const NO_ERROR = { status: false, code: 0, source: "" };

const pool = createNodePool(2);
after(() => pool.close());

const configured = (config) => ({ ...defaultCallLibraryConfig(), "calling-convention": "c", thread: "any", ...config });
const numeric = (name, dataType, pass = "value") => ({ name, type: "numeric", "data-type": dataType, pass });

/** Runs `vi` with Solder's I/O; the writes come back by the names `vi` gave its nodes. */
async function run(vi, options = {}) {
  const compiled = compilar(vi.g, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  assert.equal(compiled.usesInstrumentIo, true, "the editor starts its I/O process for it");
  const byId = Object.fromEntries(Object.entries(vi.id).map(([name, nodeId]) => [nodeId, name]));
  const written = await ejecutar(compiled, {}, { io: loadSolderIo(), ...options });
  return Object.fromEntries(Object.entries(written).map(([nodeId, value]) => [byId[nodeId], value]));
}

/** strlen of a string constant, with its return value and error out shown. */
const strlenOf = (text, { library = C_LIBRARY, functionName = "strlen", errorIn } = {}) =>
  buildVI(CAT, (b) => {
    b.node("text", "str-const", { value: text });
    b.node("call", "call-library", configured({ library, function: functionName, "return-type": { type: "numeric", "data-type": "uptr" }, parameters: [{ name: "arg1", type: "string" }] }));
    b.node("length", "indicator", { type: "u64" });
    b.node("error", "cluster-indicator", { type: ERROR, style: "error-out" });
    b.wire("text.result", "call.arg-0-in");
    b.wire("call.return", "length.value");
    b.wire("call.error-out", "error.value");
    if (errorIn) {
      b.node("incoming", "error-cluster-constant", { value: errorIn });
      b.wire("incoming.result", "call.error-in");
    }
  });

for (const [where, options] of [["on one thread", () => ({})], ["on a pool", () => ({ poolPorts: pool.connect() })]]) {
  test(`a C string goes by its address and a number comes back ${where}`, { skip: !ON_LINUX }, async () => {
    const shown = await run(strlenOf("hello"), options());
    assert.equal(shown.length, 5);
    assert.deepEqual(shown.error, NO_ERROR);
  });
}

test("a number goes by value and a double comes back", { skip: !ON_LINUX }, async () => {
  const vi = buildVI(CAT, (b) => {
    b.node("angle", "const", { value: 0, type: "number" });
    b.node("call", "call-library", configured({ library: MATH_LIBRARY, function: "cos", "return-type": { type: "numeric", "data-type": "dbl" }, parameters: [numeric("x", "dbl")] }));
    b.node("cosine", "indicator", { type: "number" });
    b.wire("angle.result", "call.arg-0-in");
    b.wire("call.return", "cosine.value");
  });
  assert.equal((await run(vi)).cosine, 1);
});

test("what the function writes through a pointer comes out of the parameter's output", { skip: !ON_LINUX }, async () => {
  const vi = buildVI(CAT, (b) => {
    b.node("x", "const", { value: 8, type: "number" });
    b.node("call", "call-library", configured({
      library: MATH_LIBRARY,
      function: "frexp",
      "return-type": { type: "numeric", "data-type": "dbl" },
      parameters: [numeric("x", "dbl"), numeric("exponent", "i32", "pointer")],
    }));
    b.node("mantissa", "indicator", { type: "number" });
    b.node("exponent", "indicator", { type: "i32" });
    b.wire("x.result", "call.arg-0-in");
    b.wire("call.return", "mantissa.value");
    b.wire("call.arg-1-out", "exponent.value");
  });
  const shown = await run(vi);
  assert.equal(shown.mantissa, 0.5);
  assert.equal(shown.exponent, 4);
});

test("an array goes by its data's address and what the function writes into it comes back", { skip: !ON_LINUX }, async () => {
  const vi = buildVI(CAT, (b) => {
    b.node("bytes", "arr-const", { type: { array: "u8" }, value: [0, 0, 0, 0] });
    b.node("fill", "const", { value: 65, type: "i32" });
    b.node("count", "const", { value: 4, type: "u64" });
    b.node("call", "call-library", configured({
      library: C_LIBRARY,
      function: "memset",
      parameters: [{ name: "s", type: "array", "data-type": "u8" }, numeric("c", "i32"), numeric("n", "uptr")],
    }));
    b.node("filled", "arr-indicator", { type: { array: "u8" } });
    b.wire("bytes.result", "call.arg-0-in");
    b.wire("fill.result", "call.arg-1-in");
    b.wire("count.result", "call.arg-2-in");
    b.wire("call.arg-0-out", "filled.value");
  });
  assert.deepEqual((await run(vi)).filled, [65, 65, 65, 65]);
});

test("a string's buffer takes its minimum size from another parameter, and what is written into it comes out", { skip: !ON_LINUX }, async () => {
  const vi = buildVI(CAT, (b) => {
    b.node("destination", "str-const", { value: "" });
    b.node("source", "str-const", { value: "solder" });
    b.node("size", "const", { value: 16, type: "u64" });
    b.node("call", "call-library", configured({
      library: C_LIBRARY,
      function: "strncpy",
      parameters: [{ name: "dest", type: "string", "minimum-size": "n" }, { name: "src", type: "string" }, numeric("n", "uptr")],
    }));
    b.node("copied", "str-indicator");
    b.wire("destination.result", "call.arg-0-in");
    b.wire("source.result", "call.arg-1-in");
    b.wire("size.result", "call.arg-2-in");
    b.wire("call.arg-0-out", "copied.value");
  });
  assert.equal((await run(vi)).copied, "solder");
});

test("a library that is not found is error 7, and one without the function error 15, with the node as source", { skip: !ON_LINUX }, async () => {
  const missing = await run(strlenOf("hello", { library: "/no/such/library.so" }));
  assert.equal(missing.length, 0);
  assert.deepEqual([missing.error.status, missing.error.code], [true, 7]);
  assert.match(missing.error.source, /^Call Library Function Node/);
  const noFunction = await run(strlenOf("hello", { functionName: "no_such_function_anywhere" }));
  assert.deepEqual([noFunction.error.status, noFunction.error.code], [true, 15]);
});

test("with an error in, nothing is called and the error passes", { skip: !ON_LINUX }, async () => {
  const errorIn = { status: true, code: 5000, source: "upstream" };
  const shown = await run(strlenOf("hello", { errorIn }));
  assert.equal(shown.length, 0);
  assert.deepEqual(shown.error, errorIn);
});

test("a node with no function does not compile, nor one with an unwired string", () => {
  const noFunction = buildVI(CAT, (b) => b.node("call", "call-library", configured({})));
  assert.match(JSON.stringify(compilar(noFunction.g, CAT).errores), /No function specified/);
  const unwired = buildVI(CAT, (b) => b.node("call", "call-library", configured({ library: C_LIBRARY, function: "strlen", parameters: [{ name: "arg1", type: "string" }] })));
  assert.match(JSON.stringify(compilar(unwired.g, CAT).errores), /missing a wire on its input \\"arg1\\"/);
});

test("a fault in the library's code, which ends the I/O process, is error 1097 and the Run goes on", async () => {
  const faultingIo = { callLibrary: () => Promise.reject(new Error("The instrument I/O process ended.")) };
  const shown = await run(strlenOf("hello"), { io: faultingIo });
  assert.equal(shown.length, 0);
  assert.deepEqual([shown.error.status, shown.error.code], [true, 1097]);
  assert.match(shown.error.source, /^Call Library Function Node/);
});
