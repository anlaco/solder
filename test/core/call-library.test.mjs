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
import { compilar } from "../../core/compiler/compiler.mjs";
import { CAT, buildOVI, leer as leerJson } from "../helpers.mjs";

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
    // A pointer-sized integer by value is a U64, or the DAQ task wired to it (DT-087, amendment of 2026-11-13 §7).
    ["arg-3-in", "arg4", { numberOrTask: "A3", number: "u64" }],
  ]);
  assert.deepEqual(ports.out[0].name, "error-out");
  assert.deepEqual(ports.out.slice(1).map((port) => [port.name, port.type]), [
    ["return", "i32"],
    ["arg-0-out", "string"],
    ["arg-1-out", "u32"],
    ["arg-2-out", { array: "number" }],
    ["arg-3-out", { numberOrTask: "A3", number: "u64" }],
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

// The formats of strings and arrays, measured in LabVIEW 2026 Q3 on 2026-11-08 (DT-088,
// labview-captures/reports/2026-11-08-clfn-formats.md): the prototype each one prints.

const stringParameter = (name, format, constant) => ({ name, type: "string", "string-format": format, ...(constant && { constant: true }) });
const arrayParameter = (name, dataType, dimensions, format, constant) => ({ name, type: "array", "data-type": dataType, dimensions, "array-format": format, ...(constant && { constant: true }) });
const prototypeOf = (parameters, returnType = { type: "void" }) => callLibraryPrototype({ function: "funcName", "return-type": returnType, parameters });

test("a string prints as LabVIEW prints each of its four formats, with and without const", () => {
  assert.equal(
    prototypeOf([
      stringParameter("arg1", "c-string-pointer"), stringParameter("arg2", "c-string-pointer", true),
      stringParameter("arg3", "pascal-string-pointer"), stringParameter("arg4", "pascal-string-pointer", true),
      stringParameter("arg5", "string-handle"), stringParameter("arg6", "string-handle", true),
      stringParameter("arg7", "string-handle-pointer"), stringParameter("arg8", "string-handle-pointer", true),
    ]),
    "void  funcName(CStr arg1, const CStr arg2, PStr arg3, const PStr arg4, LStrHandle arg5, const LStrHandle arg6, LStrHandle *arg7, const LStrHandle *arg8);",
  );
});

test("a string return value is a C or a Pascal string pointer", () => {
  assert.equal(callLibraryPrototype({ function: "funcName", "return-type": { type: "string", "string-format": "c-string-pointer" } }), "CStr funcName(void );");
  assert.equal(callLibraryPrototype({ function: "funcName", "return-type": { type: "string", "string-format": "pascal-string-pointer" } }), "PStr funcName(void );");
});

test("an array prints a data pointer, a handle or a pointer to a handle, naming the dimensions and the element", () => {
  assert.equal(
    prototypeOf([
      arrayParameter("arg1", "dbl", 1, "array-data-pointer"), arrayParameter("arg2", "dbl", 1, "array-data-pointer", true),
      arrayParameter("arg3", "dbl", 1, "array-handle"), arrayParameter("arg4", "dbl", 1, "array-handle", true),
      arrayParameter("arg5", "dbl", 1, "array-handle-pointer"), arrayParameter("arg6", "dbl", 1, "array-handle-pointer", true),
    ]),
    "void  funcName(double *arg1, const double *arg2, Array1DDouble **arg3, const Array1DDouble **arg4, Array1DDouble ***arg5, const Array1DDouble ***arg6);",
  );
  // The data pointer ignores the dimensions; the handle forms name them.
  assert.equal(prototypeOf([arrayParameter("a", "dbl", 3, "array-data-pointer")]), "void  funcName(double *a);");
  assert.equal(prototypeOf([arrayParameter("a", "dbl", 2, "array-handle")]), "void  funcName(Array2DDouble **a);");
  assert.equal(prototypeOf([arrayParameter("a", "i32", 3, "array-handle")]), "void  funcName(Array3DInt32_t **a);");
  assert.equal(prototypeOf([arrayParameter("a", "u8", 1, "array-handle-pointer", true)]), "void  funcName(const Array1DUint8_t ***a);");
  assert.equal(prototypeOf([arrayParameter("a", "sgl", 1, "array-handle")]), "void  funcName(Array1DFloat **a);");
});

test("each element type names its array as LabVIEW does", () => {
  const names = Object.fromEntries(Object.entries(DATA_TYPES).map(([key, dataType]) => [key, dataType.arrayName]));
  assert.deepEqual(names, { i8: "Int8_t", i16: "Int16_t", i32: "Int32_t", i64: "Int64_t", iptr: "Intptr_t", u8: "Uint8_t", u16: "Uint16_t", u32: "Uint32_t", u64: "Uint64_t", uptr: "Uintptr_t", sgl: "Float", dbl: "Double" });
});

test("Adapt to Type prints void pointers, and Interface to Data an ILVData handle", () => {
  assert.equal(prototypeOf([{ name: "a", type: "adapt-to-type", "data-format": "handles-by-value" }]), "void  funcName(void *a);");
  assert.equal(prototypeOf([{ name: "a", type: "adapt-to-type", "data-format": "pointers-to-handles", constant: true }]), "void  funcName(const void *a);");
  assert.equal(prototypeOf([{ name: "a", type: "adapt-to-type", "data-format": "array-data-pointer" }]), "void  funcName(void *a);");
  assert.equal(prototypeOf([{ name: "a", type: "adapt-to-type", "data-format": "interface-to-data" }]), "void  funcName(ILVData **a);");
  assert.equal(prototypeOf([{ name: "a", type: "adapt-to-type", "data-format": "interface-to-data", constant: true }]), "void  funcName(const ILVData **a);");
});

test("the prototypes of two of nilvaiu's functions, which DAQmx's VIs call, come out as LabVIEW printed them", () => {
  // Measured in the DAQmx OVIs (labview-captures/reports/2026-11-08-daq-clfn-api.md): handles for strings and arrays.
  assert.equal(
    callLibraryPrototype({
      function: "DAQRead1ChanNSamp1DF64",
      "return-type": { type: "numeric", "data-type": "i32" },
      parameters: [numeric("taskID", "uptr"), numeric("numberOfSamples", "i32"), numeric("timeout", "dbl"), arrayParameter("data", "dbl", 1, "array-handle"), stringParameter("extendedErrorInfo", "string-handle")],
    }),
    "int32_t DAQRead1ChanNSamp1DF64(uintptr_t taskID, int32_t numberOfSamples, double timeout, Array1DDouble **data, LStrHandle extendedErrorInfo);",
  );
  assert.equal(
    callLibraryPrototype({
      function: "DAQCfgSampClkTiming",
      "return-type": { type: "numeric", "data-type": "i32" },
      parameters: [
        numeric("taskID", "uptr"), stringParameter("source", "string-handle", true), { ...numeric("rate", "dbl"), constant: true }, { ...numeric("activeEdge", "i32"), constant: true },
        { ...numeric("sampleMode", "i32"), constant: true }, { ...numeric("samplesPerChannel", "u64"), constant: true }, stringParameter("extendedErrorInfo", "string-handle"),
      ],
    }),
    "int32_t DAQCfgSampClkTiming(uintptr_t taskID, const LStrHandle source, const double rate, const int32_t activeEdge, const int32_t sampleMode, const uint64_t samplesPerChannel, LStrHandle extendedErrorInfo);",
  );
});

test("a parameter that is an array of two dimensions accepts a wire of a 2D array, and one of one dimension does not", () => {
  const parameters = [{ name: "data", type: "array", "data-type": "dbl", dimensions: 2, "array-format": "array-handle" }];
  const wiredFrom = (constant) =>
    buildOVI(CAT, (b) => {
      b.node("values", "arr-const", constant);
      b.node("call", "call-library", { ...defaultCallLibraryConfig(), library: "x", function: "f", parameters });
      b.wire("values.result", "call.arg-0-in");
    });
  assert.equal(compilar(wiredFrom({ type: { array: "number", dims: 2 }, value: [[1, 2], [3, 4]] }).g, CAT).errores, undefined, "a 2D wire fits a 2D parameter");
  assert.match(compilar(wiredFrom({ type: { array: "number" }, value: [1, 2] }).g, CAT).errores[0].motivo, /Incompatible types/, "a 1D wire does not");
});

test("a node runs with a string or an array in any of LabVIEW's formats, and not with one it does not know (DT-088 §2, §8)", () => {
  const withParameter = (parameter) => whyCallLibraryCannotRun({ function: "f", parameters: [parameter] });
  for (const format of ["c-string-pointer", "pascal-string-pointer", "string-handle", "string-handle-pointer"]) assert.equal(withParameter({ name: "s", type: "string", "string-format": format }), undefined, format);
  for (const format of ["array-data-pointer", "array-handle", "array-handle-pointer"]) assert.equal(withParameter({ name: "a", type: "array", "data-type": "dbl", "array-format": format }), undefined, format);
  assert.match(withParameter({ name: "s", type: "string", "string-format": "a-format-of-the-future" }), /"s".*format/);
  assert.match(withParameter({ name: "a", type: "array", "data-type": "dbl", "array-format": "a-format-of-the-future" }), /"a".*format/);
  assert.equal(withParameter({ name: "s", type: "string" }), undefined, "no format is the C string, as before");
  assert.equal(whyCallLibraryCannotRun({ function: "f", "return-type": { type: "string", "string-format": "pascal-string-pointer" } }), undefined, "a returned Pascal string is read");
  assert.equal(whyCallLibraryCannotRun({ function: "f", "return-type": { type: "string", "string-format": "c-string-pointer" } }), undefined);
});
