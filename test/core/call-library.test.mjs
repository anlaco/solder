// The Call Library Function Node's configuration, terminals and prototype (DT-080), as measured in LabVIEW
// 2026 Q3 (labview-captures/reports/2026-11-06-clfn.md and 2026-11-06-clfn-run.md).

import assert from "node:assert/strict";
import { test } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

import * as Gr from "../../core/model/graph.mjs";
import {
  DATA_TYPES,
  PARAMETER_TYPES,
  RETURN_TYPES,
  callLibraryPrototype,
  defaultCallLibraryConfig,
  newParameter,
  whyCallLibraryCannotRun,
} from "../../core/model/call-library.mjs";
import { aTexto, leer } from "../../core/model/qvi-format.mjs";
import { CAT, leer as leerJson } from "../helpers.mjs";

/** A graph with one Call Library Function Node configured with `config`. */
function nodeWith(config) {
  const node = Gr.crearNodo(Gr.nuevo(), CAT, "call-library", 100, 100);
  const g = Gr.fijarConfig(node.g, node.id, { ...defaultCallLibraryConfig(), ...config });
  return { g, node: g.nodos.find((candidate) => candidate.id === node.id) };
}

const numeric = (name, dataType, pass = "value") => ({ name, type: "numeric", "data-type": dataType, pass });

test("the dialog's rings list LabVIEW's items in its order", () => {
  assert.deepEqual(PARAMETER_TYPES, ["numeric", "array", "string", "waveform", "digital-waveform", "digital-data", "activex", "adapt-to-type", "instance-data-pointer"]);
  assert.deepEqual(RETURN_TYPES, ["void", "numeric", "string"]);
  assert.deepEqual(Object.values(DATA_TYPES).map((dataType) => dataType.label), [
    "Signed 8-bit Integer", "Signed 16-bit Integer", "Signed 32-bit Integer", "Signed 64-bit Integer", "Signed Pointer-sized Integer",
    "Unsigned 8-bit Integer", "Unsigned 16-bit Integer", "Unsigned 32-bit Integer", "Unsigned 64-bit Integer", "Unsigned Pointer-sized Integer",
    "4-byte Single", "8-byte Double",
  ]);
});

test("a new node runs in the UI thread with the C calling convention, and a new parameter is arg1, I32, by value", () => {
  const config = defaultCallLibraryConfig();
  assert.equal(config.thread, "ui");
  assert.equal(config["calling-convention"], "c");
  assert.equal(config["error-checking"], "default");
  assert.deepEqual(config["return-type"], { type: "void" });
  assert.deepEqual(newParameter([]), { name: "arg1", type: "numeric", "data-type": "i32", pass: "value" });
  assert.equal(newParameter([newParameter([])]).name, "arg2");
});

test("the prototypes are LabVIEW's, character for character", () => {
  assert.equal(callLibraryPrototype(defaultCallLibraryConfig()), "void  funcName(void );");
  assert.equal(callLibraryPrototype({ function: "GetTickCount", "return-type": { type: "numeric", "data-type": "u32" } }), "uint32_t GetTickCount(void );");
  assert.equal(
    callLibraryPrototype({ function: "strlen", "return-type": { type: "numeric", "data-type": "uptr" }, parameters: [{ name: "arg1", type: "string" }] }),
    "uintptr_t strlen(CStr arg1);",
  );
  assert.equal(
    callLibraryPrototype({
      function: "GetComputerNameA",
      "return-type": { type: "numeric", "data-type": "i32" },
      parameters: [{ name: "arg1", type: "string" }, numeric("arg2", "u32", "pointer")],
    }),
    "int32_t GetComputerNameA(CStr arg1, uint32_t *arg2);",
  );
  assert.equal(
    callLibraryPrototype({
      function: "RtlCompareMemory",
      "return-type": { type: "numeric", "data-type": "uptr" },
      parameters: [{ name: "arg1", type: "array", "data-type": "u8" }, { name: "arg2", type: "array", "data-type": "u8" }, numeric("arg3", "uptr")],
    }),
    "uintptr_t RtlCompareMemory(uint8_t *arg1, uint8_t *arg2, uintptr_t arg3);",
  );
  assert.equal(callLibraryPrototype({ function: "GetCommandLineA", "return-type": { type: "string" } }), "CStr GetCommandLineA(void );");
  assert.equal(
    callLibraryPrototype({
      function: "Mean_head",
      "return-type": { type: "numeric", "data-type": "i32" },
      parameters: [
        { name: "xH", type: "adapt-to-type", constant: true },
        { name: "mean", type: "adapt-to-type" },
        { name: "dsperr", type: "adapt-to-type" },
      ],
    }),
    "int32_t Mean_head(const void *xH, void *mean, void *dsperr);",
  );
});

test("the terminals are error in and out always, path in and out only with Specify path on diagram", () => {
  const plain = CAT.puertos(nodeWith({}).node);
  assert.deepEqual(plain.in.map((port) => port.name), ["error-in"]);
  assert.deepEqual(plain.out.map((port) => port.name), ["error-out"]);
  const withPath = CAT.puertos(nodeWith({ "specify-path-on-diagram": true }).node);
  assert.deepEqual(withPath.in.map((port) => port.name), ["path-in", "error-in"]);
  assert.deepEqual(withPath.out.map((port) => port.name), ["path-out", "error-out"]);
});

test("each parameter is an input and an output of its type, and the return value an output", () => {
  const { node } = nodeWith({
    function: "GetComputerNameA",
    "return-type": { type: "numeric", "data-type": "i32" },
    parameters: [{ name: "arg1", type: "string" }, numeric("arg2", "u32", "pointer"), { name: "arg3", type: "array", "data-type": "dbl" }, numeric("arg4", "uptr")],
  });
  const ports = CAT.puertos(node);
  assert.deepEqual(ports.in.map((port) => port.name)[0], "error-in");
  assert.deepEqual(ports.in.slice(1).map((port) => [port.name, port.label, port.type]), [
    ["arg-0-in", "arg1", "string"],
    ["arg-1-in", "arg2", "u32"],
    ["arg-2-in", "arg3", { array: "number" }],
    ["arg-3-in", "arg4", "u64"],
  ]);
  assert.deepEqual(ports.out[0].name, "error-out");
  assert.deepEqual(ports.out.slice(1).map((port) => [port.name, port.type]), [
    ["return", "i32"],
    ["arg-0-out", "string"],
    ["arg-1-out", "u32"],
    ["arg-2-out", { array: "number" }],
    ["arg-3-out", "u64"],
  ]);
});

test("Adapt to Type takes the type of what is wired to it", () => {
  const { node } = nodeWith({ function: "Mean_head", parameters: [{ name: "xH", type: "adapt-to-type" }] });
  const ports = CAT.puertos(node);
  assert.deepEqual(ports.in.find((port) => port.name === "arg-0-in").type, { var: "A0" });
  assert.deepEqual(ports.out.find((port) => port.name === "arg-0-out").type, { var: "A0" });
});

test("a node with no function cannot run, nor one with a parameter of a kind Solder does not pass yet", () => {
  assert.equal(whyCallLibraryCannotRun(defaultCallLibraryConfig()), "No function specified.");
  assert.match(whyCallLibraryCannotRun({ function: "f", parameters: [{ name: "w", type: "waveform" }] }), /"w"/);
  assert.equal(whyCallLibraryCannotRun({ function: "f", parameters: [numeric("a", "i32"), { name: "s", type: "string" }] }), undefined);
});

test("a Call Library Function Node is saved with its configuration and opens the same", () => {
  const { g } = nodeWith({
    library: "kernel32.dll",
    function: "GetComputerNameA",
    thread: "any",
    "calling-convention": "stdcall",
    "return-type": { type: "numeric", "data-type": "i32" },
    parameters: [{ name: "arg1", type: "string", "minimum-size": "arg2" }, numeric("arg2", "u32", "pointer")],
  });
  const text = aTexto(g, CAT);
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(leerJson("docs/schema/qvi.schema.json"));
  assert.ok(validate(JSON.parse(text)), JSON.stringify(validate.errors));
  assert.equal(aTexto(leer(text, CAT), CAT), text);
});
