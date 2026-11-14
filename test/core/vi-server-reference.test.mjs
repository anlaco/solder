// The VI Server Reference constant (DT-090), measured on 2026-11-14 (labview-captures/reports/2026-11-14-vi-server-reference.md):
// This OVI by default, This Application by Link to ▸, never Not A Refnum, wired to nothing it does not break the OVI,
// and into a Call Library Function Node's Adapt to Type parameter the library gets the address of its 4-byte value.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { before, test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import { defaultCallLibraryConfig } from "../../core/model/call-library.mjs";
import { DAQ_TASK } from "../../core/model/daq-name.mjs";
import { crearNodo } from "../../core/model/graph.mjs";
import { nombre } from "../../core/model/types.mjs";
import { THIS_APPLICATION_TYPE, THIS_OVI_TYPE, VI_SERVER_REFERENCE, refnumOfClass } from "../../core/model/vi-server-reference.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import { loadSolderIo } from "../../native/solder-io-node/solder-io.mjs";
import { CAT, buildVI } from "../helpers.mjs";

const LIBRARY_FILE = { linux: "libnilvaiu.so", darwin: "libnilvaiu.dylib", win32: "nilvaiu.dll" }[process.platform];

before(() => {
  const built = spawnSync("cargo", ["build", "-q", "-p", "nilvaiu"], { stdio: "inherit" });
  assert.equal(built.status, 0, "nilvaiu builds");
});

async function run(vi) {
  const compiled = compilar(vi.g, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const byId = Object.fromEntries(Object.entries(vi.id).map(([name, nodeId]) => [nodeId, name]));
  const written = await ejecutar(compiled, {}, { io: loadSolderIo() });
  return { compiled, shown: Object.fromEntries(Object.entries(written).map(([nodeId, value]) => [byId[nodeId], value])) };
}

test("a VI Server Reference is placed as This OVI, and each class's wire is named as LabVIEW's Context Help names it", () => {
  const { g, id } = crearNodo({ nodos: [], cables: [], siguiente: 1 }, CAT, VI_SERVER_REFERENCE, 0, 0);
  assert.deepEqual(g.nodos.find((node) => node.id === id).config.type, THIS_OVI_TYPE);
  assert.equal(nombre(THIS_APPLICATION_TYPE), "LabVIEW Application Reference");
  assert.equal(nombre(THIS_OVI_TYPE), "Generic OVI Reference");
});

test("This Application wired to nothing does not break the OVI, and is never Not A Refnum", async () => {
  const vi = buildVI(CAT, (b) => {
    b.node("alone", VI_SERVER_REFERENCE, { type: THIS_APPLICATION_TYPE });
    b.node("application", VI_SERVER_REFERENCE, { type: THIS_APPLICATION_TYPE });
    b.node("null?", "not-a-number-path-refnum");
    b.node("is null", "bool-indicator");
    b.wire("application.reference", "null?.number");
    b.wire("null?.result", "is null.value");
  });
  assert.equal((await run(vi)).shown["is null"], false);
});

test("into an Adapt to Type parameter, the library gets the address of the refnum's 4 bytes, as NI's lvAppReference", async () => {
  // DAQCreateTask140 with lvAppReference as NI's node has it: Adapt to Type, Handles by Value, from This Application.
  const createTask = {
    ...defaultCallLibraryConfig(),
    thread: "any",
    library: path.resolve("target/debug", LIBRARY_FILE),
    function: "DAQCreateTask140",
    "return-type": { type: "numeric", "data-type": "i32" },
    parameters: [
      { name: "lvAppReference", type: "adapt-to-type", "data-format": "handles-by-value" },
      { name: "taskRefObjectPtr", type: "adapt-to-type", "data-format": "handles-by-value" },
      ...["newTaskName", "taskToCopy"].map((name) => ({ name, type: "string", "string-format": "string-handle" })),
      { name: "autoCleanup", type: "numeric", "data-type": "u8", pass: "value" },
      ...["channels", "extendedErrorInfo"].map((name) => ({ name, type: "string", "string-format": "string-handle" })),
    ],
  };
  const vi = buildVI(CAT, (b) => {
    b.node("application", VI_SERVER_REFERENCE, { type: THIS_APPLICATION_TYPE });
    b.node("empty", "daq-name-constant", { type: DAQ_TASK, value: "" });
    b.node("nothing", "str-const", { value: "" });
    b.node("create", "call-library", createTask);
    b.node("created", "indicator", { type: "i32" });
    b.wire("application.reference", "create.arg-0-in");
    b.wire("empty.result", "create.arg-1-in");
    for (const index of [2, 3, 5, 6]) b.wire("nothing.result", `create.arg-${index}-in`);
    b.wire("create.return", "created.value");
  });
  const { compiled, shown } = await run(vi);
  assert.deepEqual(
    (({ type, dataType, pass }) => ({ type, dataType, pass }))(compiled.callLibraries[0].parameters[0]),
    { type: "numeric", dataType: "u32", pass: "pointer" },
  );
  assert.equal(shown.created, 0, "the library took the call");
  assert.notEqual(refnumOfClass(THIS_APPLICATION_TYPE.refnum), 0);
});
