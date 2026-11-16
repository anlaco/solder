// What a compiled module imports from its host (DT-039): the functions written in JavaScript, the clocks, the
// dialogs, the debugger and the outside world (VISA, files, the Property Node, the Call Library Function Node). The
// order is the module's import section, so a function's index is its position here. The field names (`modulo`,
// `nombre`, `params`, `results`) are read by the encoder and the runtime, so they stay.

import { FUNCIONES } from "./expression-parser.mjs";

/**
 * What the module imports from its host, always in this order: the string, array and math functions
 * written in JavaScript, the clocks, the dialogs and the debugger. The panel is not imported: it is in
 * the memory (panel-memory.mjs, DT-063 §10).
 */
export const HOST_IMPORTS = [
  // The string functions that depend on LabVIEW's format, in JavaScript over the same memory (DT-042 b): they take
  // handles and the cell where they leave their result.
  ...[["sub", 4], ["reemplazar", 6]].map(([nombre, n]) => ({ modulo: "cad", nombre, params: Array(n).fill("i32"), results: [] })),
  ...["mayus", "minus", "invertir", "rotar"].map((nombre) => ({ modulo: "cad", nombre, params: ["i32", "i32"], results: [] })),
  { modulo: "cad", nombre: "recortar", params: ["i32", "i32", "i32"], results: [] },
  { modulo: "cad", nombre: "buscar", params: Array(6).fill("i32"), results: ["i32"] },
  { modulo: "cad", nombre: "extra", params: [], results: ["i32"] },
  { modulo: "cad", nombre: "cmp", params: ["i32", "i32"], results: ["i32"] },
  // The same comparison ignoring ASCII case, for a Case with Case Insensitive Match (spec/04 Rule 17d).
  { modulo: "cad", nombre: "cmp_ci", params: ["i32", "i32"], results: ["i32"] },
  // Format Into String and Scan From String (spec/04 Rule 21j): the rows go through a buffer of
  // FORMAT_ROW_BYTES per row; the host writes the result and the error cluster.
  { modulo: "cad", nombre: "formatear", params: Array(9).fill("i32"), results: [] },
  // Array To Spreadsheet String and Spreadsheet String To Array (DT-067 §9): the result's cell, the format, the
  // array (or the text), the delimiter, the element type (SPREADSHEET_ELEMENTS) and the dimensions.
  { modulo: "cad", nombre: "array_to_spreadsheet", params: Array(6).fill("i32"), results: [] },
  { modulo: "cad", nombre: "spreadsheet_to_array", params: Array(6).fill("i32"), results: [] },
  { modulo: "cad", nombre: "escanear", params: Array(10).fill("i32"), results: ["i32"] },
  // The cell, the number, the width and its type's bits (a negative hexadecimal is its two's complement).
  ...["dec", "hex", "oct"].map((nombre) => ({ modulo: "cad", nombre, params: ["i32", "f64", "i32", "i32"], results: [] })),
  ...["frac", "exp", "eng"].map((nombre) => ({ modulo: "cad", nombre, params: ["i32", "f64", "i32", "i32", "i32"], results: [] })),
  ...["leer_dec", "leer_hex", "leer_oct", "leer_frac"].map((nombre) => ({ modulo: "cad", nombre, params: ["i32", "i32"], results: ["f64"] })),
  // The functions on one-dimensional arrays of fixed-size elements, in JavaScript over the memory.
  { modulo: "arr", nombre: "a_reemplazar", params: Array(5).fill("i32"), results: [] },
  { modulo: "arr", nombre: "a_insertar", params: Array(6).fill("i32"), results: [] },
  { modulo: "arr", nombre: "a_borrar", params: Array(7).fill("i32"), results: [] },
  { modulo: "arr", nombre: "a_ordenar", params: Array(4).fill("i32"), results: [] },
  { modulo: "arr", nombre: "a_rotar", params: Array(4).fill("i32"), results: [] },
  { modulo: "arr", nombre: "a_partir", params: Array(5).fill("i32"), results: [] },
  { modulo: "arr", nombre: "a_sumar", params: Array(6).fill("i32"), results: [] },
  { modulo: "math", nombre: "random", params: [], results: ["f64"] },
  { modulo: "math", nombre: "pow", params: ["f64", "f64"], results: ["f64"] },
  // The Expression Node's functions that WebAssembly lacks, with their number of arguments.
  ...Object.entries(FUNCIONES)
    .filter(([, f]) => f.js)
    .map(([nombre, f]) => ({ modulo: "math", nombre: `fn_${nombre}`, params: Array(f.args).fill("f64"), results: ["f64"] })),
  // The millisecond timer (U32), the Run's clock for timers (the host's, virtual in the reference
  // traces) and the real clock in milliseconds for the budget of a loop's iterations. The waits,
  // yields, subplans and subOVI turns are the module's own scheduler (pool-scheduler.mjs).
  { modulo: "tiempo", nombre: "reloj", params: [], results: ["i32"] },
  { modulo: "tiempo", nombre: "ahora", params: [], results: ["f64"] },
  { modulo: "tiempo", nombre: "reloj_real", params: [], results: ["f64"] },
  // Debugging (DT-047): the value of each output of a node that just ran, by its wasm type
  // (a string, array or cluster goes by address), and then the node itself, which may
  // suspend the clump (a breakpoint, a step, Highlight Execution's pace).
  ...["i32", "i64", "f32", "f64"].map((vt) => ({ modulo: "dep", nombre: `valor_${vt}`, params: ["i32", "i32", vt], results: [] })),
  { modulo: "dep", nombre: "nodo", params: ["i32"], results: ["i32"] },
  // Automatic error handling (DT-043): the error of a node whose error out is unwired; the host shows the dialog and
  // waits for Continue or Stop (it parks).
  { modulo: "tiempo", nombre: "error_automatico", params: ["i32", "i32"], results: ["i32"] },
  // Simple Error Handler (DT-043): decides the error (error in's, or the one of the code and source), shows its
  // dialog if there is one and waits, and leaves error out, source out and message in their places; it returns
  // error?. Parameters: error in, code, the source's handle, the dialog type, error out's buffer, source out's cell,
  // message's cell.
  { modulo: "tiempo", nombre: "dialogo_error", params: ["i32", "i32", "i32", "i32", "i32", "i32", "i32"], results: ["i32"] },
  // Solder's VISA (DT-065 §4, DT-066): each function parks its clump while the Run's coordinator talks to the
  // instrument, which writes the outputs into their places (core/runtime/instrument-io.mjs). By address:
  // the resource name in, the error in, then the outputs; the last parameter is the call chain's index.
  { modulo: "io", nombre: "visa_open", params: ["i32", "i32", "i32", "i32", "i32", "i32"], results: ["i32"] },
  { modulo: "io", nombre: "visa_write", params: ["i32", "i32", "i32", "i32", "i32", "i32", "i32"], results: ["i32"] },
  { modulo: "io", nombre: "visa_read", params: ["i32", "i32", "i32", "i32", "i32", "i32", "i32", "i32"], results: ["i32"] },
  { modulo: "io", nombre: "visa_close", params: ["i32", "i32", "i32", "i32"], results: ["i32"] },
  // The file functions (DT-067 §7), external waits like VISA's (core/runtime/file-io.mjs). By value or
  // handle the inputs and whether the file is a path and is wired, then the error in by address, the
  // outputs' places and the call chain's index.
  { modulo: "io", nombre: "file_open", params: Array(11).fill("i32"), results: ["i32"] },
  { modulo: "io", nombre: "file_close", params: Array(5).fill("i32"), results: ["i32"] },
  { modulo: "io", nombre: "file_write_text", params: Array(13).fill("i32"), results: ["i32"] },
  { modulo: "io", nombre: "file_read_text", params: Array(14).fill("i32"), results: ["i32"] },
  { modulo: "io", nombre: "file_size", params: Array(7).fill("i32"), results: ["i32"] },
  { modulo: "io", nombre: "file_delete", params: Array(11).fill("i32"), results: ["i32"] },
  // Write and Read Delimited Spreadsheet (DT-067 §9): the spreadsheet string and the file in one wait.
  { modulo: "io", nombre: "file_write_spreadsheet", params: Array(16).fill("i32"), results: ["i32"] },
  { modulo: "io", nombre: "file_read_spreadsheet", params: Array(17).fill("i32"), results: ["i32"] },
  // File Dialog (DT-069): its inputs, its configuration as codes, the error in, its outputs' places, the chain.
  { modulo: "io", nombre: "file_dialog", params: Array(16).fill("i32"), results: ["i32"] },
  // The Property Node (DT-072): its index in `propertyNodes`, its rows' records, the reference in (0 for an implicit
  // node), the error in, the reference out's and the error out's places and the call chain's index. The host runs
  // the rows top to bottom and writes what they read.
  { modulo: "io", nombre: "property_node", params: Array(7).fill("i32"), results: ["i32"] },
  // The Call Library Function Node (DT-080): its index in `callLibraries`, its records (the return value's, then one
  // per parameter), the path in (0 without Specify path on diagram), the error in, the error out's place and the
  // call chain's index. The host calls the library and writes what it gave back.
  { modulo: "io", nombre: "call_library", params: Array(6).fill("i32"), results: ["i32"] },
  // The path functions (DT-067): the host reads each path's block, applies the rules of the system it runs
  // on (core/model/paths.mjs) and writes the result into its cell. The first parameters are the output cells.
  { modulo: "pth", nombre: "build_path", params: ["i32", "i32", "i32", "i32"], results: [] },
  { modulo: "pth", nombre: "strip_path", params: ["i32", "i32", "i32"], results: [] },
  { modulo: "pth", nombre: "path_to_string", params: ["i32", "i32"], results: [] },
  { modulo: "pth", nombre: "string_to_path", params: ["i32", "i32"], results: [] },
  { modulo: "pth", nombre: "path_kind", params: ["i32"], results: ["i32"] },
  { modulo: "pth", nombre: "path_to_array", params: ["i32", "i32"], results: ["i32"] },
  { modulo: "pth", nombre: "array_to_path", params: ["i32", "i32", "i32"], results: [] },
  { modulo: "pth", nombre: "path_is_empty", params: ["i32"], results: ["i32"] },
  { modulo: "pth", nombre: "paths_equal", params: ["i32", "i32"], results: ["i32"] },
];

/** The index of the import named `name`, as a `call` names it. */
export const importIndex = (name) => HOST_IMPORTS.findIndex((hostImport) => hostImport.nombre === name);

/** The imports that may park the clump that calls them (DT-063 §8): the dialogs, the debugger, VISA and files, which wait for the outside. */
export const PARKING_IMPORT_INDICES = ["nodo", "error_automatico", "dialogo_error", "visa_open", "visa_write", "visa_read", "visa_close", "file_open", "file_close", "file_write_text", "file_read_text", "file_size", "file_delete", "file_write_spreadsheet", "file_read_spreadsheet", "file_dialog", "property_node", "call_library"].map(importIndex);
