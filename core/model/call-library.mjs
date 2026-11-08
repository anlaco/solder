// The Call Library Function Node (DT-080): one block whose configuration names a library, a function and its
// parameters, and whose terminals are a row per parameter, an input on the left and an output on the right, as
// LabVIEW draws them; the return value is a row of its own with only an output. Its dialog shows the C prototype
// the configuration makes, in LabVIEW's words.
//
// Measured: labview-captures/reports/2026-11-06-clfn.md (the node and the dialog) and 2026-11-06-clfn-run.md
// (running it, and the prototypes LabVIEW printed). A pure module, shared by the editor, the compiler and the tests.

import { arrayOf } from "./types.mjs";

export const CALL_LIBRARY = "call-library";

/** The kinds of parameter in the order of the dialog's Type ring (measured, stage 1 Q3). */
export const PARAMETER_TYPES = Object.freeze([
  "numeric",
  "array",
  "string",
  "waveform",
  "digital-waveform",
  "digital-data",
  "activex",
  "adapt-to-type",
  "instance-data-pointer",
]);

/** The kinds a return value may be: Void, Numeric or String (measured). */
export const RETURN_TYPES = Object.freeze(["void", "numeric", "string"]);

/**
 * The numeric data types of the dialog's Data type ring, in its order, with the C name the prototype prints, the name
 * it takes inside the type of an array handle (`Array1D<arrayName>`, measured 2026-11-08) and the Solder type a terminal
 * carries. A pointer-sized integer is 64 bits wide: Solder runs on 64-bit systems only.
 */
export const DATA_TYPES = Object.freeze({
  i8: { label: "Signed 8-bit Integer", c: "int8_t", type: "i8", arrayName: "Int8_t" },
  i16: { label: "Signed 16-bit Integer", c: "int16_t", type: "i16", arrayName: "Int16_t" },
  i32: { label: "Signed 32-bit Integer", c: "int32_t", type: "i32", arrayName: "Int32_t" },
  i64: { label: "Signed 64-bit Integer", c: "int64_t", type: "i64", arrayName: "Int64_t" },
  iptr: { label: "Signed Pointer-sized Integer", c: "intptr_t", type: "i64", arrayName: "Intptr_t" },
  u8: { label: "Unsigned 8-bit Integer", c: "uint8_t", type: "u8", arrayName: "Uint8_t" },
  u16: { label: "Unsigned 16-bit Integer", c: "uint16_t", type: "u16", arrayName: "Uint16_t" },
  u32: { label: "Unsigned 32-bit Integer", c: "uint32_t", type: "u32", arrayName: "Uint32_t" },
  u64: { label: "Unsigned 64-bit Integer", c: "uint64_t", type: "u64", arrayName: "Uint64_t" },
  uptr: { label: "Unsigned Pointer-sized Integer", c: "uintptr_t", type: "u64", arrayName: "Uintptr_t" },
  sgl: { label: "4-byte Single", c: "float", type: "sgl", arrayName: "Float" },
  dbl: { label: "8-byte Double", c: "double", type: "number", arrayName: "Double" },
});

/** The kinds of parameter Solder runs so far; the others are configured and saved, and keep the node from running. */
export const RUNNABLE_PARAMETER_TYPES = new Set(["numeric", "array", "string"]);

/** The function name the dialog shows while none is given (measured: `void  funcName(void );`). */
export const PLACEHOLDER_FUNCTION_NAME = "funcName";

/** A new node's configuration: no library, Run in UI thread, the C calling convention, Default error checking. */
export const defaultCallLibraryConfig = () => ({
  library: "",
  "specify-path-on-diagram": false,
  function: "",
  thread: "ui",
  "calling-convention": "c",
  "error-checking": "default",
  "return-type": { type: "void" },
  parameters: [],
});

/** A new parameter as the dialog's + button adds it: `arg<n>`, Numeric, Signed 32-bit Integer, by value. */
export const newParameter = (existing) => ({ name: `arg${existing.length + 1}`, type: "numeric", "data-type": "i32", pass: "value" });

/** The configuration with every field present, so older or partial configurations read the same. */
export const callLibraryConfig = (config = {}) => ({ ...defaultCallLibraryConfig(), ...config });

/** The Solder type of a parameter's terminals; Adapt to Type takes whatever is wired, through a type variable. */
function parameterType(parameter, index) {
  const element = DATA_TYPES[parameter["data-type"] ?? "i32"]?.type ?? "i32";
  switch (parameter.type) {
    case "numeric":
      return element;
    case "array":
      return arrayOf(element, parameter.dimensions ?? 1);
    case "string":
      return "string";
    case "adapt-to-type":
      return { var: `A${index}` };
    default:
      return undefined;
  }
}

/** The Solder type of the return value's terminal, or undefined for void. */
function returnType(returnValue) {
  if (returnValue.type === "numeric") return DATA_TYPES[returnValue["data-type"] ?? "i32"].type;
  if (returnValue.type === "string") return "string";
  return undefined;
}

/**
 * The ports of the node, in LabVIEW's order: path in and out with Specify path on diagram, error in and out
 * always (measured: even with Error Checking Disabled), the return value's output, then an input and an output
 * per parameter. A parameter of a kind Solder does not run yet has no terminal.
 */
export function callLibraryPorts(node) {
  const config = callLibraryConfig(node.config);
  const inputs = [];
  const outputs = [];
  if (config["specify-path-on-diagram"]) {
    inputs.push({ name: "path-in", label: "path in", type: "path" });
    outputs.push({ name: "path-out", label: "path out", type: "path" });
  }
  inputs.push({ name: "error-in", label: "error in (no error)", type: "error", default: 0 });
  outputs.push({ name: "error-out", label: "error out", type: "error" });
  const returned = returnType(config["return-type"]);
  if (returned) outputs.push({ name: "return", label: "return type", type: returned });
  config.parameters.forEach((parameter, index) => {
    const type = parameterType(parameter, index);
    if (!type) return;
    // An unwired number goes as 0; an unwired string breaks the OVI (measured: "Contains unwired or bad terminal").
    const unwiredDefault = parameter.type === "numeric" ? { default: 0 } : {};
    inputs.push({ name: `arg-${index}-in`, label: parameter.name, type, ...unwiredDefault });
    outputs.push({ name: `arg-${index}-out`, label: parameter.name, type });
  });
  return { in: inputs, out: outputs };
}

/** How a string is written in a prototype, by its format (measured 2026-11-08, DT-088). */
const STRING_FORMAT_TEXT = Object.freeze({
  "c-string-pointer": "CStr",
  "pascal-string-pointer": "PStr",
  "string-handle": "LStrHandle",
  "string-handle-pointer": "LStrHandle *",
});

/** The `*` that follow the type of an array, by its format: a data pointer, a handle, a pointer to a handle. */
const ARRAY_FORMAT_STARS = Object.freeze({ "array-data-pointer": "*", "array-handle": "**", "array-handle-pointer": "***" });

/** The C text of a parameter, as the prototype prints it. */
function parameterText(parameter) {
  const constant = parameter.constant ? "const " : "";
  const dataType = DATA_TYPES[parameter["data-type"] ?? "i32"];
  const cType = dataType?.c ?? "int32_t";
  switch (parameter.type) {
    case "numeric":
      return parameter.pass === "pointer" ? `${constant}${cType} *${parameter.name}` : `${constant}${cType} ${parameter.name}`;
    case "array": {
      const format = parameter["array-format"] ?? "array-data-pointer";
      // A data pointer is the element's own pointer whatever the dimensions; the handle forms name the array's type.
      const elementType = format === "array-data-pointer" ? cType : `Array${parameter.dimensions ?? 1}D${dataType?.arrayName ?? "Int32_t"}`;
      return `${constant}${elementType} ${ARRAY_FORMAT_STARS[format]}${parameter.name}`;
    }
    case "string": {
      const text = STRING_FORMAT_TEXT[parameter["string-format"] ?? "c-string-pointer"];
      // The `*` of a pointer to a handle sticks to the name, as LabVIEW prints it.
      return `${constant}${text}${text.endsWith("*") ? "" : " "}${parameter.name}`;
    }
    case "adapt-to-type":
      // Interface to Data is a handle to LabVIEW's own data; the other three formats are all `void *` (measured).
      return parameter["data-format"] === "interface-to-data" ? `${constant}ILVData **${parameter.name}` : `${constant}void *${parameter.name}`;
    default:
      return `${constant}void *${parameter.name}`;
  }
}

/** The C text of the return value; void is followed by a second space, as LabVIEW prints it. */
function returnText(returnValue) {
  if (returnValue.type === "numeric") return DATA_TYPES[returnValue["data-type"] ?? "i32"].c;
  // A returned string is a C or a Pascal string pointer; the two handle formats are greyed out for it (measured).
  if (returnValue.type === "string") return returnValue["string-format"] === "pascal-string-pointer" ? "PStr" : "CStr";
  return "void ";
}

/**
 * The prototype the dialog shows, character for character as LabVIEW prints it (measured):
 * `void  funcName(void );`, `uint32_t GetTickCount(void );`, `int32_t GetComputerNameA(CStr arg1, uint32_t *arg2);`.
 */
export function callLibraryPrototype(config) {
  const { function: functionName, parameters } = callLibraryConfig(config);
  const name = functionName || PLACEHOLDER_FUNCTION_NAME;
  const argumentsText = parameters.length ? parameters.map(parameterText).join(", ") : "void ";
  return `${returnText(callLibraryConfig(config)["return-type"])} ${name}(${argumentsText});`;
}

/**
 * Why the node cannot run, or undefined when it can: LabVIEW breaks the OVI when no function is named, and Solder
 * also while a parameter is of a kind it does not run yet.
 */
export function whyCallLibraryCannotRun(config) {
  const { function: functionName, parameters } = callLibraryConfig(config);
  if (!functionName) return "No function specified.";
  const notRunnable = parameters.find((parameter) => !RUNNABLE_PARAMETER_TYPES.has(parameter.type));
  if (notRunnable) return `The parameter "${notRunnable.name}" is of a type Solder does not pass to a library yet.`;
  return undefined;
}
