// Compiles a VI's diagram into a WebAssembly module (DT-039).
//
// The diagram is split into clumps, as LabVIEW does (DT-040): each node that
// takes time (Wait (ms)…) gets its own, and the instant ones are grouped by the
// time-taking nodes they depend on. Each clump is a function (`c0`, `c1`…), and
// the module's own scheduler (pool-scheduler.mjs, DT-063 §9) runs them by
// dataflow: each one once the ones it receives data from have finished, and in
// parallel those that do not depend on each other. Values passed from one clump
// to another travel through cells of the data space, which every thread shares;
// inside a clump, through locals.
//
// The panel is in the shared memory too (panel-memory.mjs, DT-063 §10): the
// diagram reads each control from its record and writes each indicator into its
// own, and the host fills the first and walks the second. The module imports
// only the clocks, the dialogs, the debugger and the functions written in
// JavaScript: it touches nothing it is not given.
//
// Types are the ones resolved by core/model/graph.mjs, with their coercions:
// each value is converted from the wire's type to the type of the terminal it
// enters, like LabVIEW's coercion dot. Whatever the compiler cannot emit yet is
// returned as an error, with its node; nothing is emitted halfway.

import { ejecutable, nodesWithUndefinedInput, orden, panelObjectType, requerido, tipos, undefinedArrayNodes } from "../model/graph.mjs";
import { CONSTANTES_MATEMATICAS } from "../model/math-constants.mjs";
import { DAQ_TASK_LAYOUT, isDaqTask } from "../model/daq-name.mjs";
import { OVI_CLASS, refnumOfClass } from "../model/vi-server-reference.mjs";
import { coversEveryError, isErrorFrameValue } from "../model/error-case.mjs";
import { HOST_IMPORTS, importIndex } from "./host-imports.mjs";
import { callMemory, callScheduler, CLUMP_TYPE, FIRST_COMPILED_FUNCTION, MAXIMUM_PAGES, pagesFor, PARK_PRIMITIVES, RUNTIME_FUNCTIONS, runtimeFunctionIndex, SHARED_MEMORY_IMPORT, THREAD_GLOBALS } from "./runtime-functions.mjs";
import { ARRAY_HEADER_BYTES, arrayElement, copyValue, copyValueTo, dimensionSize, elementCount, isByReference, loadElement, MAX_COMPILED_DIMENSIONS, reserveArray, SECOND_SIZE_OFFSET, storeElement } from "./memory-ops.mjs";
import { fullClusterLayout, panelData, panelDataOf, taskPanelData } from "./panel-data.mjs";
import { ERROR_FIELDS, constantOf, readClusterFields, setZeroClusterAddress } from "./constants.mjs";
import { callStringFunction, characterTest, concatenateStrings, numberToFloatString, numberToString, stringToNumber } from "./nodes/strings.mjs";
import { formatIntoString, scanFromString } from "./nodes/format-scan.mjs";
import { expressionNode } from "./nodes/expression-node.mjs";
import { FILE_DIALOG_CODES, SPREADSHEET_ELEMENTS, delimitedWriteFormat, fileFunction, fileInput, optionalHandle, readMode, spreadsheetCall, spreadsheetElementOfInput } from "./nodes/files.mjs";
import { visaFunction } from "./nodes/visa.mjs";
import { timeDelay } from "./nodes/timing.mjs";
import { propertyNode } from "./nodes/property-node.mjs";
import { callLibrary } from "./nodes/call-library.mjs";
import { arithmetic, compare, compareInstruction, compareWithZero, compoundArithmetic, inRangeAndCoerce, logical, maxAndMin, negate, rounding } from "./nodes/arithmetic.mjs";
import { addToArrayElement, arraySizes, asArray, buildArray2d, callArrayFunction, indexArray2d, initializeArrayNd, loadKindOf, reduceArray, refuseElementsByReference } from "./nodes/arrays.mjs";
import { gatherRowsInto2dArray, loopRowOfIteration } from "./array-rows.mjs";
import { callSubOVI, storeInSlot, subOVIControl, subOVIInstance } from "./subovi-calls.mjs";
import { mechanicalAction, readControl, writeIndicator } from "./panel-io.mjs";
import { joinNumbers, logicalShift, mantissaAndExponent, rotate, rotateWithCarry, splitNumber, swapBytes, swapWords } from "./nodes/data-manipulation.mjs";
import { EMPTY_PATH, NOT_A_PATH, PATH_KIND, encodePath } from "../model/paths.mjs";
import { ERROR, FILE_REFNUM, PATH, VISA_RESOURCE_LAYOUT, dimensionsOf, esArray, esCluster, esEnum, esError, esNumerico, esRefnum, flattenArrayValue, inMemory, limites, representacion } from "../model/types.mjs";
import { codificar } from "./wasm-encoder.mjs";
import { i32Const, ins, localGet } from "./instructions.mjs";
import { clusterLayout, convertValue, isFloat, isSigned, narrowInteger, wasmTypeOf } from "./wasm-types.mjs";
import { CELDAS, CIMA, EXPORTADAS, bloqueCadena, i32 } from "./linear-memory.mjs";
import { makeStackless } from "./stackless.mjs";
import { DEFAULT_CHART_HISTORY, recordBytes, slotBytes } from "./panel-memory.mjs";
import { SCHEDULER_EXPORTS, schedulerData } from "./pool-scheduler.mjs";

/** The VISA functions (DT-066): each waits for an instrument, and a Run that has one needs the I/O. */
const VISA_FUNCTIONS = new Set(["visa-open", "visa-write", "visa-read", "visa-close"]);
/** The file functions (DT-067): each waits for the disk, served by the same I/O as VISA. */
const FILE_FUNCTIONS = new Set(["open-create-replace-file", "close-file", "write-to-text-file", "read-from-text-file", "get-file-size", "delete", "write-delimited-spreadsheet-vi", "read-delimited-spreadsheet-vi", "file-dialog"]);
/** The nodes that take time: each runs in its own clump and yields while it waits. */
export const LARGOS = new Set(["wait-ms", "wait-until-next-ms-multiple", "time-delay", "simple-error-handler", "property-node", "call-library", ...VISA_FUNCTIONS, ...FILE_FUNCTIONS]);

/**
 * Lo que emite cada bloque. Recibe `e`: `e.entrada(i)` deja en la pila la
 * entrada i ya en el tipo de su terminal, `e.tIn(i)` y `e.tOut(j)` son esos
 * tipos, `e.temporal(vt)` reserva un local y `e.nodo` es el nodo. Devuelve las
 * instrucciones que dejan en la pila sus salidas, en orden.
 */
const BLOQUES = {
  const: (e) => constantOf(e.tOut(0), e.nodo.config?.value ?? 0),
  "num-const": (e) => constantOf(e.tOut(0), e.nodo.config?.value ?? 0),
  "bool-const": (e) => [ins("i32.const", e.nodo.config?.value ? 1 : 0)],
  "enum-const": (e) => constantOf(e.tOut(0), e.nodo.config?.value ?? 0),
  "ring-const": (e) => constantOf(e.tOut(0), e.nodo.config?.value ?? 0),
  // Range Limits For Type: sólo importa el tipo cableado, no su valor.
  "range-limits-for-type": (e) => {
    const { min, max } = limites(e.tIn(0));
    return [...constantOf(e.tOut(0), max), ...constantOf(e.tOut(1), min)];
  },
  "positive-infinity": () => [ins("f64.const", Infinity)],
  "negative-infinity": () => [ins("f64.const", -Infinity)],
  "machine-epsilon": () => [ins("f64.const", Number.EPSILON)],
  ...Object.fromEntries(Object.entries(CONSTANTES_MATEMATICAS).map(([n, k]) => [n, () => [ins("f64.const", k.valor)]])),
  "not-a-number": () => [ins("f64.const", NaN)],
  "random-number": () => [ins("call", importIndex("random"))],
  // Cadenas (DT-042): la constantOf vive en la zona estática; las demás escriben en su celda.
  "str-const": (e) => [ins("i32.const", e.cadena(e.nodo.config?.value ?? ""))],
  "string-length": (e) => [...e.entrada(0), callMemory("longitud")],
  "concatenate-strings": concatenateStrings,
  "string-subset": (e) => callStringFunction(e, "sub", [0, 1, 2]),
  "to-upper-case": (e) => callStringFunction(e, "mayus", [0]),
  "to-lower-case": (e) => callStringFunction(e, "minus", [0]),
  "reverse-string": (e) => callStringFunction(e, "invertir", [0]),
  "rotate-string": (e) => callStringFunction(e, "rotar", [0]),
  "trim-whitespace": (e) => callStringFunction(e, "recortar", [1, 0]),
  "replace-substring": (e) => {
    // Sin cablear length, son los bytes de substring.
    const largo = e.cableada(3) ? e.entrada(3) : [...e.entrada(1), callMemory("longitud")];
    const [c1, c2] = [e.celda(), e.celda()];
    return [ins("i32.const", c1), ins("i32.const", c2), ...e.entrada(0), ...e.entrada(1), ...e.entrada(2), ...largo, ins("call", importIndex("reemplazar")), ins("i32.const", c1), ins("i32.const", c2)];
  },
  "format-into-string": (e) => formatIntoString(e),
  "array-to-spreadsheet-string": (e) => spreadsheetCall(e, "array_to_spreadsheet", [0, 1, 2], e.tIn(1)),
  "spreadsheet-string-to-array": (e) => spreadsheetCall(e, "spreadsheet_to_array", [0, 1, 3], e.tOut(0)),
  "scan-from-string": (e) => scanFromString(e),
  "search-and-replace-string": (e) => {
    const [celda, n] = [e.celda(), e.temporal("i32")];
    // ignore case? es el bit 0 y replace all?, el bit 1.
    return [
      ins("i32.const", celda), ...e.entrada(3), ...e.entrada(4), ...e.entrada(5), ...e.entrada(6),
      ...e.entrada(1), ...e.entrada(2), ins("i32.const", 1), ins("i32.shl"), ins("i32.or"),
      ins("call", importIndex("buscar")), ins("local.set", n),
      ins("i32.const", celda), ins("local.get", n), ins("call", importIndex("extra")),
      ...e.entrada(7), // error out: pasa el que entra (un aviso sigue su camino)
    ];
  },
  // Number/String Conversion. El número llega como f64 y el anfitrión lo formatea (DT-042 b).
  "number-to-decimal-string": (e) => numberToString(e, "dec"),
  "number-to-hexadecimal-string": (e) => numberToString(e, "hex"),
  "number-to-octal-string": (e) => numberToString(e, "oct"),
  "number-to-fractional-string": (e) => numberToFloatString(e, "frac"),
  "number-to-exponential-string": (e) => numberToFloatString(e, "exp"),
  "number-to-engineering-string": (e) => numberToFloatString(e, "eng"),
  "decimal-string-to-number": (e) => stringToNumber(e, "leer_dec", 0),
  "hexadecimal-string-to-number": (e) => stringToNumber(e, "leer_hex", 0),
  "octal-string-to-number": (e) => stringToNumber(e, "leer_oct", 0),
  "fract-exp-string-to-number": (e) => stringToNumber(e, "leer_frac", 1),
  // Las constantes de cadena fijas de la paleta String.
  ...Object.fromEntries(
    ["empty-string-constant", "space-constant", "tab-constant", "carriage-return-constant", "line-feed-constant", "end-of-line-constant"].map((n) => [n, (e) => [ins("i32.const", e.cadena(e.cat.bloque(n).value))]]),
  ),
  "empty-string-path": (e) => (e.logicalTIn(0) === PATH ? [...e.entrada(0), ins("call", importIndex("path_is_empty"))] : [...e.entrada(0), callMemory("longitud"), ins("i32.eqz")]),
  "decimal-digit": (e) => characterTest(e, (c) => [localGet(c), i32Const(48), ins("i32.sub"), i32Const(10), ins("i32.lt_u")]),
  "octal-digit": (e) => characterTest(e, (c) => [localGet(c), i32Const(48), ins("i32.sub"), i32Const(8), ins("i32.lt_u")]),
  "hex-digit": (e) => characterTest(e, (c) => [
    localGet(c), i32Const(48), ins("i32.sub"), i32Const(10), ins("i32.lt_u"),
    localGet(c), i32Const(32), ins("i32.or"), i32Const(97), ins("i32.sub"), i32Const(6), ins("i32.lt_u"), ins("i32.or"),
  ]),
  // Espacio, HT, LF, VT, FF y CR (la ayuda de NI: «space, h/v tab, cr, lf, ff»).
  "white-space": (e) => characterTest(e, (c) => [localGet(c), i32Const(32), ins("i32.eq"), localGet(c), i32Const(9), ins("i32.sub"), i32Const(5), ins("i32.lt_u"), ins("i32.or")]),
  // Clusters (DT-042): Bundle escribe sus campos en su bloque; Unbundle los lee sin copiar.
  bundle: (e) => {
    const d = clusterLayout(e.tOut(0));
    const b = e.bufer(d.tam);
    const r = [];
    d.campos.forEach((c, i) => {
      if (isByReference(c.tipo)) r.push(...copyValue(c.tipo, e.entrada(i), b + c.off, e.temporal));
      else r.push(ins("i32.const", b + c.off), ...e.entrada(i), ins(`${wasmTypeOf(c.tipo)}.store`));
    });
    return [...r, ins("i32.const", b)];
  },
  unbundle: (e) => readClusterFields(e, clusterLayout(e.tIn(0)).campos),
  // Bundle By Name: a copy of the input cluster with each named row's element written over (DT-083).
  "bundle-by-name": (e) => {
    const layout = clusterLayout(e.tIn(0));
    const buffer = e.bufer(layout.tam);
    const code = copyValue(e.tIn(0), e.entrada(0), buffer, e.temporal);
    const rows = (e.nodo.config?.items ?? []).filter((field) => field !== null);
    rows.forEach((name, row) => {
      const field = layout.campos.find((c) => c.nombre === name);
      const input = row + 1;
      if (isByReference(field.tipo)) code.push(...copyValue(field.tipo, e.entrada(input), buffer + field.off, e.temporal));
      else code.push(ins("i32.const", buffer + field.off), ...e.entrada(input), ins(`${wasmTypeOf(field.tipo)}.store`));
    });
    return [...code, ins("i32.const", buffer)];
  },
  // Unbundle By Name: the same reads, only the named rows and in their order (DT-050).
  "unbundle-by-name": (e) => {
    const fields = clusterLayout(e.tIn(0)).campos;
    const rows = (e.nodo.config?.items ?? []).filter((field) => field !== null);
    return readClusterFields(e, rows.map((field) => fields.find((c) => c.nombre === field)));
  },
  // El cluster de error (DT-043).
  "error-cluster-constant": (e) => [ins("i32.const", e.clusterConstante(ERROR, e.nodo.config?.value ?? {}))],
  "clear-errors": (e) => {
    // Sin código específico, todo a cero; con él, sólo si coincide (sin comprobar en LabVIEW).
    const [x, k, borra] = [e.temporal("i32"), e.temporal("i32"), e.temporal("i32")];
    const b = e.bufer(ERROR_FIELDS.tam);
    const g = (l) => ins("local.get", l);
    return [
      ...e.entrada(0), ins("local.set", k), ...e.entrada(1), ins("local.set", x),
      g(k), ins("i32.eqz"), g(x), ins("i32.load", ERROR_FIELDS.code), g(k), ins("i32.eq"), ins("i32.or"), ins("local.set", borra),
      g(borra), ins("if"),
      ins("i32.const", b), ins("i32.const", 0), ins("i32.store", ERROR_FIELDS.status), ins("i32.const", b), ins("i32.const", 0), ins("i32.store", ERROR_FIELDS.code),
      ...copyValue("string", [ins("i32.const", 0)], b + ERROR_FIELDS.source, e.temporal),
      ins("else"), ...copyValue(ERROR, [g(x)], b, e.temporal), ins("end"),
      g(k), ins("i32.const", 0), ins("i32.ne"), g(borra), ins("i32.and"),
      ins("i32.const", b),
    ];
  },
  "merge-errors": (e) => {
    // Los errores antes que los avisos; en cada clase, el primero de arriba. Sin ninguno, la primera entrada.
    const n = e.cat.puertos(e.nodo).in.length;
    const [r, hay] = [e.temporal("i32"), e.temporal("i32")];
    const ent = Array.from({ length: n }, () => e.temporal("i32"));
    const c = [];
    ent.forEach((l, i) => c.push(...e.entrada(i), ins("local.set", l)));
    c.push(ins("local.get", ent[0]), ins("local.set", r), ins("i32.const", 0), ins("local.set", hay));
    for (const campo of [ERROR_FIELDS.status, ERROR_FIELDS.code]) {
      for (const l of ent) {
        c.push(ins("local.get", hay), ins("i32.eqz"), ins("local.get", l), ins("i32.load", campo), ins("i32.const", 0), ins("i32.ne"), ins("i32.and"),
          ins("if"), ins("local.get", l), ins("local.set", r), ins("i32.const", 1), ins("local.set", hay), ins("end"));
      }
    }
    return [...c, ins("local.get", r)];
  },
  "error-cluster-from-error-code": (e) => {
    // Un código distinto de 0: un error (o un aviso) con el mensaje como source (sin comprobar en LabVIEW qué source pone).
    // Con 0, pasa el error que entra. El envoltorio de «pasa-error» ya trata un error a la entrada.
    const b = e.bufer(ERROR_FIELDS.tam);
    const [code, x] = [e.temporal("i32"), e.temporal("i32")];
    return [
      ...e.entrada(4), ins("local.set", x), ...e.entrada(2), ins("local.tee", code),
      ins("if"),
      ins("i32.const", b), ...e.entrada(0), ins("i32.eqz"), ins("i32.store", ERROR_FIELDS.status),
      ins("i32.const", b), ins("local.get", code), ins("i32.store", ERROR_FIELDS.code),
      ...copyValue("string", e.entrada(3), b + ERROR_FIELDS.source, e.temporal),
      ins("else"), ...copyValue(ERROR, [ins("local.get", x)], b, e.temporal), ins("end"),
      ins("i32.const", b),
    ];
  },
  // A DAQ task constant has a name and no record yet; the other kinds are their text (DT-076 §5, DT-087 §7).
  "daq-name-constant": (e) =>
    isDaqTask(e.logicalTOut(0))
      ? [ins("i32.const", e.clusterConstante(DAQ_TASK_LAYOUT, { name: e.nodo.config?.value ?? "", number: 0, record: 0 }))]
      : [ins("i32.const", e.cadena(e.nodo.config?.value ?? ""))],
  "visa-resource-constant": (e) => [ins("i32.const", e.clusterConstante(VISA_RESOURCE_LAYOUT, { "resource name": e.nodo.config?.value ?? "", session: 0 }))],
  "visa-open": (e) => visaFunction(e, "visa_open", [0, 1], { resourceOut: true }),
  "visa-write": (e) => visaFunction(e, "visa_write", [0, 1], { resourceOut: true, count: true }),
  "visa-read": (e) => visaFunction(e, "visa_read", [0, 1], { resourceOut: true, buffer: true, count: true }),
  "visa-close": (e) => visaFunction(e, "visa_close", [0], {}),
  "property-node": (e) => propertyNode(e),
  "call-library": (e) => callLibrary(e),
  // A control reference is the refnum the host knows its control by (DT-072 §2).
  "control-reference": (e) => [i32Const(e.registerControlReference(e.nodo.config?.link))],
  // This OVI or This Application: a fixed refnum of its class, never Not A Refnum (DT-090).
  "vi-server-reference": (e) => [i32Const(refnumOfClass(e.nodo.config?.type?.refnum ?? OVI_CLASS))],
  // The file functions (DT-067 §7), by the catalog's index. A wired prompt is the title of the dialog of an unwired path.
  "open-create-replace-file": (e) =>
    fileFunction(e, "file_open", [...optionalHandle(e, 0), ...(e.cableada(1) ? e.entrada(1) : [i32Const(0)]), i32Const(e.cableada(1) ? 1 : 0), ...e.entrada(2), ...e.entrada(3)], ["refnum", "boolean", "error"]),
  "close-file": (e) => fileFunction(e, "file_close", e.entrada(0), ["cell", "error"]),
  "write-to-text-file": (e) =>
    fileFunction(e, "file_write_text", [...optionalHandle(e, 0), ...fileInput(e, 1), ...e.entrada(2), i32Const(esArray(e.tIn(2)) ? 1 : 0), i32Const(e.nodo.config?.["convert-eol"] ?? true ? 1 : 0)], ["refnum", "boolean", "error"]),
  "read-from-text-file": (e) =>
    fileFunction(e, "file_read_text", [...optionalHandle(e, 0), ...fileInput(e, 1), ...e.entrada(2), i32Const(readMode(e)), i32Const(e.nodo.config?.["convert-eol"] ?? true ? 1 : 0)], ["refnum", "cell", "boolean", "error"]),
  "delete": (e) =>
    fileFunction(e, "file_delete", [...optionalHandle(e, 0), ...(e.cableada(1) ? e.entrada(1) : [i32Const(0)]), i32Const(e.cableada(1) ? 1 : 0), ...e.entrada(2), ...e.entrada(3)], ["cell", "boolean", "error"]),
  "get-file-size": (e) => fileFunction(e, "file_size", [...e.entrada(0), i32Const(e.logicalTIn(0) === PATH ? 1 : 0)], ["refnum", "size", "error"]),
  // The instance follows the data: 1D data's type when it is wired, the 2D's otherwise (measured: 1D wins when not empty).
  "write-delimited-spreadsheet-vi": (e) => {
    const instanceData = e.cableada(3) ? 3 : 2;
    return fileFunction(e, "file_write_spreadsheet", [
      ...optionalHandle(e, 0), ...delimitedWriteFormat(e, instanceData),
      ...optionalHandle(e, 2), i32Const(spreadsheetElementOfInput(e, 2)), ...optionalHandle(e, 3), i32Const(spreadsheetElementOfInput(e, 3)),
      ...e.entrada(4), ...e.entrada(6), ...e.entrada(7),
    ], ["cell", "error"]);
  },
  "read-delimited-spreadsheet-vi": (e) =>
    fileFunction(e, "file_read_spreadsheet", [
      ...optionalHandle(e, 0), ...e.entrada(1), ...e.entrada(2), ...e.entrada(3), ...e.entrada(4), ...e.entrada(6), ...e.entrada(7),
      i32Const(SPREADSHEET_ELEMENTS.indexOf(representacion(e.tOut(1).array) ?? e.tOut(1).array)),
    ], ["cell", "cell", "cell", "i32", "boolean", "error"]),
  // File Dialog (DT-069): the strings by handle (empty when unwired), its configuration as codes of FILE_DIALOG_CODES.
  "file-dialog": (e) => {
    const config = e.nodo.config ?? {};
    return fileFunction(e, "file_dialog", [
      ...optionalHandle(e, 0), ...e.entrada(1), ...e.entrada(3), ...e.entrada(4), ...e.entrada(5), ...e.entrada(6),
      i32Const(FILE_DIALOG_CODES.selection.indexOf(config.selection ?? "file")), i32Const(FILE_DIALOG_CODES.existence.indexOf(config.existence ?? "new-or-existing")), i32Const(config.multiple ? 1 : 0),
    ], ["cell", "boolean", "boolean", "error"]);
  },
  // Paths (DT-067): a constant is its block in the static zone, like a string's.
  "path-constant": (e) => [ins("i32.const", e.cadena(encodePath(e.nodo.config?.value ?? EMPTY_PATH)))],
  "empty-path-constant": (e) => [ins("i32.const", e.cadena(encodePath(EMPTY_PATH)))],
  "not-a-path-constant": (e) => [ins("i32.const", e.cadena(encodePath(NOT_A_PATH)))],
  "build-path": (e) => {
    const cell = e.celda();
    const nameIsPath = e.logicalTIn(1) === PATH ? 1 : 0;
    return [i32Const(cell), ...e.entrada(0), ...e.entrada(1), i32Const(nameIsPath), ins("call", importIndex("build_path")), i32Const(cell)];
  },
  "strip-path": (e) => {
    const [strippedCell, nameCell] = [e.celda(), e.celda()];
    return [i32Const(strippedCell), i32Const(nameCell), ...e.entrada(0), ins("call", importIndex("strip_path")), i32Const(strippedCell), i32Const(nameCell)];
  },
  "path-to-string": (e) => callStringFunction(e, "path_to_string", [0]),
  "string-to-path": (e) => callStringFunction(e, "string_to_path", [0]),
  "path-type": (e) => [...e.entrada(0), ins("call", importIndex("path_kind"))],
  "path-to-array-of-strings": (e) => {
    const [arrayCell, relative] = [e.celda(), e.temporal("i32")];
    return [i32Const(arrayCell), ...e.entrada(0), ins("call", importIndex("path_to_array")), ins("local.set", relative), i32Const(arrayCell), ins("local.get", relative)];
  },
  "array-of-strings-to-path": (e) => callStringFunction(e, "array_to_path", [0, 1]),
  "simple-error-handler": (e) => {
    // The host decides everything (core/runtime/runtime.mjs): the dialog waits for the user.
    const [b, src, msg] = [e.bufer(ERROR_FIELDS.tam), e.celda(), e.celda()];
    return [
      ...e.entrada(3), ...e.entrada(0), ...e.entrada(1), ...e.entrada(2),
      ins("i32.const", b), ins("i32.const", src), ins("i32.const", msg), ins("call", importIndex("dialogo_error")),
      ins("i32.const", b), ins("i32.load", ERROR_FIELDS.code), ins("i32.const", src), ins("i32.const", b), ins("i32.const", msg),
    ];
  },
  // Arrays de una dimensión (DT-042): un bloque [n][relleno][elementos]; cada nodo, en su celda.
  "array-size": (e) => (dimensionsOf(e.tIn(0)) === 1 ? [...e.entrada(0), callMemory("longitud")] : arraySizes(e)),
  "index-array": (e) => {
    if (dimensionsOf(e.tIn(0)) === 2) return indexArray2d(e);
    // Fuera de rango, el valor por defecto del tipo (spec/04 §6).
    const t = e.tOut(0);
    const el = arrayElement(t);
    const [h, i, r] = [e.temporal("i32"), e.temporal("i32"), e.temporal(wasmTypeOf(t))];
    const g = (l) => ins("local.get", l);
    return [
      ...e.entrada(0), ins("local.set", h), ...e.entrada(1), ins("local.set", i),
      ...constantOf(t, 0), ins("local.set", r),
      g(i), ins("i32.const", 0), ins("i32.ge_s"), g(i), g(h), callMemory("longitud"), ins("i32.lt_s"), ins("i32.and"),
      ins("if"), ...loadElement(t, [g(h), callMemory("datos8"), g(i), ins("i32.const", el.tam), ins("i32.mul"), ins("i32.add")]), ins("local.set", r), ins("end"),
      g(r),
    ];
  },
  "build-array": (e) => {
    // Un arrayElement se añade; un array se concatena; arrays que se apilan dan una dimensión más (DT-044).
    if (dimensionsOf(e.tOut(0)) === 2) return buildArray2d(e);
    if (dimensionsOf(e.tOut(0)) > 2) throw new Error("Build Array giving an array of more than 2 dimensions: not yet (DT-044).");
    const t = e.tOut(0).array;
    const el = arrayElement(t);
    const n = e.cat.puertos(e.nodo).in.length;
    const esArr = Array.from({ length: n }, (_, i) => esArray(e.tIn(i)));
    const celda = e.celda();
    const ent = esArr.map(() => e.temporal("i32"));
    const valores = esArr.map((a) => (a ? null : e.temporal(wasmTypeOf(t))));
    const [total, d] = [e.temporal("i32"), e.temporal("i32")];
    const g = (l) => ins("local.get", l);
    const c = [];
    esArr.forEach((a, i) => c.push(...e.entrada(i), ins("local.set", a ? ent[i] : valores[i])));
    c.push(ins("i32.const", 0), ins("local.set", total));
    esArr.forEach((a, i) => c.push(g(total), ...(a ? [g(ent[i]), callMemory("longitud")] : [ins("i32.const", 1)]), ins("i32.add"), ins("local.set", total)));
    c.push(ins("i32.const", celda), g(total), ins("i32.const", el.tam), ins("i32.const", el.ref ? 1 : 0), callMemory("nuevo_array"), ins("local.set", d));
    esArr.forEach((a, i) => {
      if (!a) {
        c.push(...storeElement(t, [g(d)], [g(valores[i])], e.temporal), g(d), ins("i32.const", el.tam), ins("i32.add"), ins("local.set", d));
        return;
      }
      // Un array entero: sus elementos, detrás de lo que ya hay.
      const [m, o, j] = [e.temporal("i32"), e.temporal("i32"), e.temporal("i32")];
      c.push(g(ent[i]), callMemory("longitud"), ins("local.set", m), g(ent[i]), callMemory("datos8"), ins("local.set", o));
      if (!el.ref) c.push(g(d), g(o), g(m), ins("i32.const", el.tam), ins("i32.mul"), ins("memory.copy"));
      else {
        const paso = (l) => [g(l), g(j), ins("i32.const", el.tam), ins("i32.mul"), ins("i32.add")];
        c.push(ins("i32.const", 0), ins("local.set", j), ins("block"), ins("loop"), g(j), g(m), ins("i32.ge_s"), ins("br_if", 1),
          ...copyValueTo(t, paso(o), paso(d), e.temporal), g(j), ins("i32.const", 1), ins("i32.add"), ins("local.set", j), ins("br", 0), ins("end"), ins("end"));
      }
      c.push(g(d), g(m), ins("i32.const", el.tam), ins("i32.mul"), ins("i32.add"), ins("local.set", d));
    });
    return [...c, ins("i32.const", celda)];
  },
  "initialize-array": (e) => {
    if (dimensionsOf(e.tOut(0)) > 1) return initializeArrayNd(e);
    const t = e.tIn(0);
    const el = arrayElement(t);
    const celda = e.celda();
    const [v, n, d, i] = [e.temporal(wasmTypeOf(t)), e.temporal("i32"), e.temporal("i32"), e.temporal("i32")];
    const g = (l) => ins("local.get", l);
    const sitio = [g(d), g(i), ins("i32.const", el.tam), ins("i32.mul"), ins("i32.add")];
    return [
      ...e.entrada(0), ins("local.set", v), ...e.entrada(1), ins("local.tee", n), ins("i32.const", 0), g(n), ins("i32.const", 0), ins("i32.gt_s"), ins("select"), ins("local.set", n),
      ins("i32.const", celda), g(n), ins("i32.const", el.tam), ins("i32.const", el.ref ? 1 : 0), callMemory("nuevo_array"), ins("local.set", d),
      ins("i32.const", 0), ins("local.set", i), ins("block"), ins("loop"), g(i), g(n), ins("i32.ge_s"), ins("br_if", 1),
      ...storeElement(t, sitio, [g(v)], e.temporal), g(i), ins("i32.const", 1), ins("i32.add"), ins("local.set", i), ins("br", 0), ins("end"), ins("end"),
      ins("i32.const", celda),
    ];
  },
  "array-subset": (e) => {
    // Desde `index` (recortado a [0, n]), `length` elementos (recortado a lo que queda; sin cablear, todo lo que queda).
    const t = e.tOut(0).array;
    const el = arrayElement(t);
    const celda = e.celda();
    const [h, n, a, l, o, d, i] = Array.from({ length: 7 }, () => e.temporal("i32"));
    const g = (x) => ins("local.get", x);
    const c = [
      ...e.entrada(0), ins("local.tee", h), callMemory("longitud"), ins("local.set", n),
      ...e.entrada(1), ins("local.set", a),
      g(a), ins("i32.const", 0), g(a), ins("i32.const", 0), ins("i32.gt_s"), ins("select"), ins("local.set", a),
      g(a), g(n), g(a), g(n), ins("i32.lt_s"), ins("select"), ins("local.set", a),
      ...(e.cableada(2) ? e.entrada(2) : [g(n)]), ins("local.set", l),
      g(l), ins("i32.const", 0), g(l), ins("i32.const", 0), ins("i32.gt_s"), ins("select"), ins("local.set", l),
      g(l), g(n), g(a), ins("i32.sub"), g(l), g(n), g(a), ins("i32.sub"), ins("i32.lt_s"), ins("select"), ins("local.set", l),
      g(h), callMemory("datos8"), g(a), ins("i32.const", el.tam), ins("i32.mul"), ins("i32.add"), ins("local.set", o),
      ins("i32.const", celda), g(l), ins("i32.const", el.tam), ins("i32.const", el.ref ? 1 : 0), callMemory("nuevo_array"), ins("local.set", d),
    ];
    if (!el.ref) c.push(g(d), g(o), g(l), ins("i32.const", el.tam), ins("i32.mul"), ins("memory.copy"));
    else {
      const paso = (x) => [g(x), g(i), ins("i32.const", el.tam), ins("i32.mul"), ins("i32.add")];
      c.push(ins("i32.const", 0), ins("local.set", i), ins("block"), ins("loop"), g(i), g(l), ins("i32.ge_s"), ins("br_if", 1),
        ...copyValueTo(t, paso(o), paso(d), e.temporal), g(i), ins("i32.const", 1), ins("i32.add"), ins("local.set", i), ins("br", 0), ins("end"), ins("end"));
    }
    return [...c, ins("i32.const", celda)];
  },
  "reverse-1d-array": (e) => {
    const t = e.tOut(0).array;
    const el = arrayElement(t);
    const celda = e.celda();
    const [h, n, o, d, i] = Array.from({ length: 5 }, () => e.temporal("i32"));
    const g = (x) => ins("local.get", x);
    const origen = [g(o), g(n), ins("i32.const", 1), ins("i32.sub"), g(i), ins("i32.sub"), ins("i32.const", el.tam), ins("i32.mul"), ins("i32.add")];
    const destino = [g(d), g(i), ins("i32.const", el.tam), ins("i32.mul"), ins("i32.add")];
    return [
      ...e.entrada(0), ins("local.tee", h), callMemory("longitud"), ins("local.set", n), g(h), callMemory("datos8"), ins("local.set", o),
      ins("i32.const", celda), g(n), ins("i32.const", el.tam), ins("i32.const", el.ref ? 1 : 0), callMemory("nuevo_array"), ins("local.set", d),
      ins("i32.const", 0), ins("local.set", i), ins("block"), ins("loop"), g(i), g(n), ins("i32.ge_s"), ins("br_if", 1),
      ...(el.ref ? copyValueTo(t, origen, destino, e.temporal) : [...destino, ...origen, ins(el.carga), ins(el.guarda)]),
      g(i), ins("i32.const", 1), ins("i32.add"), ins("local.set", i), ins("br", 0), ins("end"), ins("end"),
      ins("i32.const", celda),
    ];
  },
  "array-max-min": (e) => {
    // Medido en LabVIEW: el primero en caso de empate; un NaN no cuenta; vacío, 0 y −1.
    const t = e.tOut(0);
    const el = arrayElement(t);
    const vt = wasmTypeOf(t);
    const real = vt === "f64" || vt === "f32";
    const [h, n, o, i, mi, ni] = Array.from({ length: 6 }, () => e.temporal("i32"));
    const [x, mx, mn] = [e.temporal(vt), e.temporal(vt), e.temporal(vt)];
    const g = (l) => ins("local.get", l);
    return [
      ...e.entrada(0), ins("local.tee", h), callMemory("longitud"), ins("local.set", n), g(h), callMemory("datos8"), ins("local.set", o),
      ...constantOf(t, 0), ins("local.set", mx), ...constantOf(t, 0), ins("local.set", mn), ins("i32.const", -1), ins("local.set", mi), ins("i32.const", -1), ins("local.set", ni),
      ins("i32.const", 0), ins("local.set", i), ins("block"), ins("loop"), g(i), g(n), ins("i32.ge_s"), ins("br_if", 1),
      g(o), g(i), ins("i32.const", el.tam), ins("i32.mul"), ins("i32.add"), ins(el.carga), ins("local.set", x),
      ...(real ? [g(x), g(x), ins(`${vt}.eq`), ins("if")] : []),
      g(mi), ins("i32.const", 0), ins("i32.lt_s"), g(x), g(mx), compareInstruction(t, "gt"), ins("i32.or"), ins("if"), g(x), ins("local.set", mx), g(i), ins("local.set", mi), ins("end"),
      g(ni), ins("i32.const", 0), ins("i32.lt_s"), g(x), g(mn), compareInstruction(t, "lt"), ins("i32.or"), ins("if"), g(x), ins("local.set", mn), g(i), ins("local.set", ni), ins("end"),
      ...(real ? [ins("end")] : []),
      g(i), ins("i32.const", 1), ins("i32.add"), ins("local.set", i), ins("br", 0), ins("end"), ins("end"),
      g(mx), g(mi), g(mn), g(ni),
    ];
  },
  "search-1d-array": (e) => {
    const t = e.tIn(1);
    if (esCluster(t) || esArray(t)) throw new Error("Search 1D Array on clusters: not yet (M6).");
    const el = arrayElement(t);
    const [h, n, o, i, r] = Array.from({ length: 5 }, () => e.temporal("i32"));
    const v = e.temporal(wasmTypeOf(t));
    const g = (l) => ins("local.get", l);
    const actual = [g(o), g(i), ins("i32.const", el.tam), ins("i32.mul"), ins("i32.add")];
    const igual = t === "string" ? [...actual, g(v), ins("call", importIndex("cmp")), ins("i32.eqz")] : [...actual, ins(el.carga), g(v), compareInstruction(t, "eq")];
    return [
      ...e.entrada(0), ins("local.tee", h), callMemory("longitud"), ins("local.set", n), g(h), callMemory("datos8"), ins("local.set", o),
      ...e.entrada(1), ins("local.set", v), ...e.entrada(2), ins("local.set", i),
      g(i), ins("i32.const", 0), g(i), ins("i32.const", 0), ins("i32.gt_s"), ins("select"), ins("local.set", i),
      ins("i32.const", -1), ins("local.set", r),
      ins("block"), ins("loop"), g(i), g(n), ins("i32.ge_s"), ins("br_if", 1),
      ...igual, ins("if"), g(i), ins("local.set", r), ins("br", 2), ins("end"),
      g(i), ins("i32.const", 1), ins("i32.add"), ins("local.set", i), ins("br", 0), ins("end"), ins("end"),
      g(r),
    ];
  },
  // Las que cambian el array en sitio ajeno: JavaScript sobre los bytes de los elementos (nada de cadenas ni clusters).
  "replace-array-subset": (e) => callArrayFunction(e, "a_reemplazar", "Replace Array Subset", [() => e.entrada(1), () => asArray(e, 2)]),
  "insert-into-array": (e) => callArrayFunction(e, "a_insertar", "Insert Into Array", [() => (e.cableada(1) ? e.entrada(1) : [ins("i32.const", 0)]), () => asArray(e, 2), () => [ins("i32.const", e.cableada(1) ? 1 : 0)]]),
  "delete-from-array": (e) => {
    const t = e.tOut(0).array;
    refuseElementsByReference(t, "Delete From Array");
    const [c1, c2] = [e.celda(), e.celda()];
    return [
      ins("i32.const", c1), ins("i32.const", c2), ...e.entrada(0), ins("i32.const", arrayElement(t).tam),
      ...(e.cableada(2) ? e.entrada(2) : [ins("i32.const", 0)]), ...(e.cableada(1) ? e.entrada(1) : [ins("i32.const", 1)]),
      ins("i32.const", e.cableada(2) ? 1 : 0), ins("call", importIndex("a_borrar")), ins("i32.const", c1), ins("i32.const", c2),
    ];
  },
  "sort-1d-array": (e) => callArrayFunction(e, "a_ordenar", "Sort 1D Array", [() => [ins("i32.const", loadKindOf(e.tOut(0).array))]]),
  "rotate-1d-array": (e) => callArrayFunction(e, "a_rotar", "Rotate 1D Array", [() => (e.cableada(0) ? e.entrada(0) : [ins("i32.const", 1)])], 1),
  "split-1d-array": (e) => {
    const t = e.tOut(0).array;
    refuseElementsByReference(t, "Split 1D Array");
    const [c1, c2] = [e.celda(), e.celda()];
    return [ins("i32.const", c1), ins("i32.const", c2), ...e.entrada(0), ins("i32.const", arrayElement(t).tam), ...e.entrada(1), ins("call", importIndex("a_partir")), ins("i32.const", c1), ins("i32.const", c2)];
  },
  "increment-array-element": (e) => addToArrayElement(e, 1),
  "decrement-array-element": (e) => addToArrayElement(e, -1),
  "add-array-elements": (e) => reduceArray(e, "add", 0),
  "multiply-array-elements": (e) => reduceArray(e, "mul", 1),
  "and-array-elements": (e) => reduceArray(e, "and", 1),
  "or-array-elements": (e) => reduceArray(e, "or", 0),
  "arr-const": (e) => [ins("i32.const", e.arrayConstante(e.tOut(0), e.nodo.config?.value ?? []))],
  "arr-control": (e) => readControl(e),
  "cluster-control": (e) => readControl(e),
  "str-control": (e) => readControl(e),
  "visa-control": (e) => readControl(e),
  "daq-name-control": (e) => readControl(e),
  "path-control": (e) => readControl(e),
  "refnum-control": (e) => readControl(e),
  // Timing: el reloj de milisegundos de LabVIEW es un U32 que da la vuelta.
  "tick-count-ms": () => [ins("call", importIndex("reloj"))],
  "wait-ms": (e) => [...e.entrada(0), ...convertValue(e.tIn(0), "u32"), ins("f64.convert_i32_u"), callScheduler("wait")],
  "time-delay": (e) => timeDelay(e),
  "wait-until-next-ms-multiple": (e) => [...e.entrada(0), ...convertValue(e.tIn(0), "u32"), ins("f64.convert_i32_u"), callScheduler("wait_multiple")],
  control: (e) => readControl(e),
  // Un control booleano se lee igual: el booleano viaja como i32 0/1.
  "bool-control": (e) => readControl(e),

  add: (e) => arithmetic(e, "add"),
  sub: (e) => arithmetic(e, "sub"),
  mul: (e) => arithmetic(e, "mul"),
  div: (e) => {
    const t = e.tOut(0);
    return [...e.entrada(0), ...convertValue(e.tIn(0), t), ...e.entrada(1), ...convertValue(e.tIn(1), t), ins(`${wasmTypeOf(t)}.div`)];
  },
  increment: (e) => [...e.entrada(0), ...constantOf(e.tOut(0), 1), ins(`${wasmTypeOf(e.tOut(0))}.add`), ...narrowInteger(e.tOut(0))],
  decrement: (e) => [...e.entrada(0), ...constantOf(e.tOut(0), 1), ins(`${wasmTypeOf(e.tOut(0))}.sub`), ...narrowInteger(e.tOut(0))],
  negate: (e) => {
    const t = e.tOut(0);
    if (isFloat(t)) return [...e.entrada(0), ins(`${wasmTypeOf(t)}.neg`)];
    return [...constantOf(t, 0), ...e.entrada(0), ins(`${wasmTypeOf(t)}.sub`), ...narrowInteger(t)];
  },
  "absolute-value": (e) => {
    const t = e.tOut(0);
    const vt = wasmTypeOf(t);
    if (isFloat(t)) return [...e.entrada(0), ins(`${vt}.abs`)];
    if (!isSigned(t)) return e.entrada(0);
    const x = e.temporal(vt);
    return [...e.entrada(0), ins("local.set", x), ...constantOf(t, 0), ins("local.get", x), ins(`${vt}.sub`), ...narrowInteger(t), ins("local.get", x), ins("local.get", x), ...constantOf(t, 0), ins(`${vt}.lt_s`), ins("select")];
  },
  square: (e) => {
    const vt = wasmTypeOf(e.tOut(0));
    const x = e.temporal(vt);
    return [...e.entrada(0), ins("local.tee", x), ins("local.get", x), ins(`${vt}.mul`), ...narrowInteger(e.tOut(0))];
  },
  "square-root": (e) => [...e.entrada(0), ...convertValue(e.tIn(0), e.tOut(0)), ins(`${wasmTypeOf(e.tOut(0))}.sqrt`)],
  reciprocal: (e) => {
    const t = e.tOut(0);
    return [...constantOf(t, 1), ...e.entrada(0), ...convertValue(e.tIn(0), t), ins(`${wasmTypeOf(t)}.div`)];
  },
  "round-to-nearest": (e) => rounding(e, "nearest"),
  "round-toward-negative-infinity": (e) => rounding(e, "floor"),
  "round-toward-positive-infinity": (e) => rounding(e, "ceil"),
  sign: (e) => {
    const t = e.tOut(0);
    const vt = wasmTypeOf(t);
    const x = e.temporal(vt);
    const s = !isFloat(t) && !isSigned(t) ? "_u" : isFloat(t) ? "" : "_s";
    // (x > 0) − (x < 0), que da −1, 0 o 1, en el tipo de la entrada.
    return [...e.entrada(0), ins("local.set", x), ins("local.get", x), ...constantOf(t, 0), ins(`${vt}.gt${s}`), ins("local.get", x), ...constantOf(t, 0), ins(`${vt}.lt${s}`), ins("i32.sub"), ...convertValue("i32", t)];
  },
  "quotient-remainder": (e) => {
    // floor(x/y) y x − y·floor(x/y), calculados en DBL. Un I64 enorme pierde precisión.
    const t = e.tOut(0);
    const [x, y, q] = [e.temporal("f64"), e.temporal("f64"), e.temporal("f64")];
    return [
      ...e.entrada(0), ...convertValue(e.tIn(0), "number"), ins("local.set", x),
      ...e.entrada(1), ...convertValue(e.tIn(1), "number"), ins("local.set", y),
      ins("local.get", x), ins("local.get", y), ins("f64.div"), ins("f64.floor"), ins("local.set", q),
      ins("local.get", x), ins("local.get", y), ins("local.get", q), ins("f64.mul"), ins("f64.sub"), ...convertValue("number", t),
      ins("local.get", q), ...convertValue("number", t),
    ];
  },
  "scale-by-power-of-2": (e) => {
    const t = e.tOut(0);
    const vt = wasmTypeOf(t);
    if (isFloat(t)) return [...e.entrada(1), ins("f64.const", 2), ...e.entrada(0), ins("f64.convert_i32_s"), ins("call", importIndex("pow")), ...convertValue("number", t), ins(`${vt}.mul`)];
    // Con enteros, un desplazamiento: a la derecha si n < 0, a la izquierda si no.
    const [x, n] = [e.temporal(vt), e.temporal("i32")];
    const ext = vt === "i64" ? [ins("i64.extend_i32_s")] : [];
    return [
      ...e.entrada(1), ins("local.set", x), ...e.entrada(0), ins("local.set", n),
      ins("local.get", x), ins("i32.const", 0), ins("local.get", n), ins("i32.sub"), ...ext, ins(`${vt}.shr_${isSigned(t) ? "s" : "u"}`),
      ins("local.get", x), ins("local.get", n), ...ext, ins(`${vt}.shl`),
      ins("local.get", n), ins("i32.const", 0), ins("i32.lt_s"), ins("select"), ...narrowInteger(t),
    ];
  },
  "random-number-range": (e) => {
    const t = e.tOut(0);
    const [lo, hi] = [e.temporal("f64"), e.temporal("f64")];
    return [
      ...e.entrada(0), ...convertValue(e.tIn(0), "number"), ins("local.set", lo),
      ...e.entrada(1), ...convertValue(e.tIn(1), "number"), ins("local.set", hi),
      ins("local.get", lo), ins("call", importIndex("random")), ins("local.get", hi), ins("local.get", lo), ins("f64.sub"), ins("f64.mul"), ins("f64.add"),
      ...(isFloat(t) ? convertValue("number", t) : [ins("f64.floor"), ...convertValue("number", t)]),
    ];
  },
  "compound-arithmetic": (e) => compoundArithmetic(e),

  "and-op": (e) => logical(e, "and"),
  "or-op": (e) => logical(e, "or"),
  "xor-op": (e) => logical(e, "xor"),
  "nand-op": (e) => [...logical(e, "and"), ...negate(e.tOut(0))],
  "nor-op": (e) => [...logical(e, "or"), ...negate(e.tOut(0))],
  "nxor-op": (e) => [...logical(e, "xor"), ...negate(e.tOut(0))],
  "not-op": (e) => [...e.entrada(0), ...negate(e.tOut(0))],
  "implies-op": (e) => [...e.entrada(0), ...negate(e.tIn(0)), ...e.entrada(1), ins(`${wasmTypeOf(e.tOut(0))}.or`), ...narrowInteger(e.tOut(0))],
  "boolean-to-0-1": (e) => e.entrada(0),

  // La subpaleta Comparison. Los dos operandos llegan ya en el tipo común.
  equal: (e) => compare(e, "eq"),
  "not-equal": (e) => compare(e, "ne"),
  greater: (e) => compare(e, "gt"),
  less: (e) => compare(e, "lt"),
  "greater-or-equal": (e) => compare(e, "ge"),
  "less-or-equal": (e) => compare(e, "le"),
  "equal-to-0": (e) => compareWithZero(e, "eq"),
  "not-equal-to-0": (e) => compareWithZero(e, "ne"),
  "greater-than-0": (e) => compareWithZero(e, "gt"),
  "less-than-0": (e) => compareWithZero(e, "lt"),
  "greater-or-equal-to-0": (e) => compareWithZero(e, "ge"),
  "less-or-equal-to-0": (e) => compareWithZero(e, "le"),
  // t, s, f: `select` de WebAssembly da su primer operando si la condición es distinta de 0.
  select: (e) => [...e.entrada(0), ...e.entrada(2), ...e.entrada(1), ins("select")],
  "max-and-min": maxAndMin,
  "in-range-and-coerce": inRangeAndCoerce,
  "not-a-number-path-refnum": (e) => {
    if (e.logicalTIn(0) === PATH) return [...e.entrada(0), ins("call", importIndex("path_kind")), i32Const(PATH_KIND.NOT_A_PATH), ins("i32.eq")];
    // Not A Refnum is 0, a file's and a control reference's alike (measured, reports/2026-11-03-control-reference-run.md Q5).
    if (e.logicalTIn(0) === FILE_REFNUM || esRefnum(e.logicalTIn(0))) return [...e.entrada(0), ins("i32.eqz")];
    if (!isFloat(e.tIn(0))) return [ins("i32.const", 0)];
    const x = e.temporal(wasmTypeOf(e.tIn(0)));
    return [...e.entrada(0), ins("local.tee", x), ins("local.get", x), ins(`${wasmTypeOf(e.tIn(0))}.ne`)];
  },
  "expression-node": expressionNode,
  "split-number": splitNumber,
  "join-numbers": joinNumbers,
  "swap-bytes": swapBytes,
  "swap-words": swapWords,
  rotate: rotate,
  "logical-shift": logicalShift,
  "rotate-left-with-carry": rotateWithCarry(true),
  "rotate-right-with-carry": rotateWithCarry(false),
  "mantissa-and-exponent": mantissaAndExponent,
  // La subpaleta Conversion: el número llega en su tipo y sale en el de la función.
  ...Object.fromEntries(
    ["to-double-precision-float", "to-single-precision-float", "to-quad-integer", "to-long-integer", "to-word-integer", "to-byte-integer", "to-unsigned-quad-integer", "to-unsigned-long-integer", "to-unsigned-word-integer", "to-unsigned-byte-integer"].map((n) => [
      n,
      (e) => [...e.entrada(0), ...convertValue(e.tIn(0), e.tOut(0))],
    ]),
  ),
};

const PANEL_CONTROLS = ["control", "bool-control", "str-control", "cluster-control", "arr-control", "visa-control", "path-control", "refnum-control", "daq-name-control"];

/**
 * The panel objects whose value the editor holds as a VISA resource name's text alone (DT-066): the runtime
 * gives it a session of 0, which the first VISA function that uses it opens from the name.
 */
const RESOURCE_NAME_PANEL_OBJECTS = new Set(["visa-control", "visa-indicator"]);

const TOP_LEVEL_CHAIN_INDEX = 0;

/**
 * Los tipos que el compilador sabe llevar hoy por un cable: numéricos,
 * booleanos, cadenas, clusters de ellos y arrays de una o dos dimensiones de ellos.
 */
const escalar = (t) =>
  t === "boolean" || t === "string" || esNumerico(t) || (esCluster(t) && t.cluster.every((f) => escalar(f.type))) || (esArray(t) && dimensionsOf(t) <= MAX_COMPILED_DIMENSIONS && escalar(t.array));

/** Where a task's name lies in its memory (DT-087 §7). */
const daqTaskNameOffset = () => clusterLayout(DAQ_TASK_LAYOUT).campos.find((field) => field.nombre === "name").off;

/**
 * The coercion dot between a DAQ task and a string (measured, reports/2026-11-06-daqmx-types.md), or null for any other
 * pair: a task gives its name, the string field of its cluster. A string into a task, which LabVIEW looks up among the
 * tasks saved in MAX, is not built: no terminal takes a task yet but the DAQ plugin's.
 */
function daqTaskCoercion(from, to, read) {
  if (isDaqTask(from) && to === "string") return [...read, ins("i32.const", daqTaskNameOffset()), ins("i32.add")];
  if (from === "string" && isDaqTask(to)) throw new Error("A string wired to a DAQ task cannot run yet: Solder has no saved tasks to look it up in.");
  return null;
}

/**
 * Orden topológico (Kahn) de los nodos de un ámbito, uniendo cada nodo a su
 * representante en él (el propio nodo, o la estructura del ámbito que lo
 * contiene). Lo que no es del ámbito —el borde de su estructura— ya está.
 */
function ordenArriba(g, arriba, raiz, cadenas = []) {
  const entran = new Map(arriba.map((id) => [id, 0]));
  const salen = new Map(arriba.map((id) => [id, new Set()]));
  for (const [de, a] of [...g.cables.map((c) => [raiz(c.de.nodo), raiz(c.a.nodo)]), ...cadenas]) {
    if (de === a || !salen.has(de) || !salen.has(a) || salen.get(de).has(a)) continue;
    salen.get(de).add(a);
    entran.set(a, entran.get(a) + 1);
  }
  const listos = arriba.filter((id) => entran.get(id) === 0);
  const r = [];
  while (listos.length) {
    const id = listos.shift();
    r.push(id);
    for (const d of salen.get(id)) if (entran.set(d, entran.get(d) - 1).get(d) === 0) listos.push(d);
  }
  return r;
}

/**
 * Parte el diagrama del VI en clumps. Una estructura, con todo lo suyo, cuenta
 * como un solo nodo (`raiz`), y es larga (DT-041). Un nodo largo va solo en el suyo; un instantáneo,
 * con los demás instantáneos que dependen de los mismos nodos largos (directa o
 * indirectamente). Así un instantáneo corre en cuanto acaba el último nodo largo
 * del que depende, que es cuando le llegan sus datos: lo que se ve en el panel
 * (cuándo se escribe un indicador, cuándo se lee un control) es lo mismo que si
 * cada nodo corriera por su cuenta. Cada clump lleva los índices de los clumps
 * de los que recibe algo (`deps`).
 */
function partir(g, ids, raiz, largo, cadenas = []) {
  const entran = new Map(ids.map((id) => [id, []]));
  for (const [de, a] of [...g.cables.map((c) => [raiz(c.de.nodo), raiz(c.a.nodo)]), ...cadenas]) {
    if (de !== a && entran.has(a) && entran.has(de)) entran.get(a).push(de);
  }
  const dependeDe = new Map(); // nodo → los nodos largos de los que depende
  const clumpDe = new Map();
  const porClave = new Map();
  const clumps = [];
  for (const id of ids) {
    const L = new Set();
    for (const p of entran.get(id)) {
      for (const x of dependeDe.get(p)) L.add(x);
      if (largo(p)) L.add(p);
    }
    dependeDe.set(id, L);
    const clave = largo(id) ? `largo:${id}` : [...L].sort().join(",");
    if (!porClave.has(clave)) porClave.set(clave, clumps.push({ largo: largo(id), deps: new Set(), locales: [], cuerpo: [] }) - 1);
    clumpDe.set(id, porClave.get(clave));
  }
  for (const [x, y] of [...g.cables.map((c) => [raiz(c.de.nodo), raiz(c.a.nodo)]), ...cadenas]) {
    const [de, a] = [clumpDe.get(x), clumpDe.get(y)];
    if (de !== undefined && a !== undefined && de !== a) clumps[a].deps.add(de);
  }
  return { clumpDe, clumps };
}

/**
 * Compila un VI. Devuelve `{ bytes, modulo, controles, indicadores, clumps }`,
 * con los controles y los indicadores en el orden de sus índices y, por cada
 * clump (la función exportada `c<i>`), de cuáles depende y si tarda; o
 * `{ errores }`: los motivos por los que no se puede, cada uno con su nodo si lo
 * tiene. With a catalog from a hierarchy (`conSubVIs`), its subVIs are compiled
 * into the same module (DT-045).
 */
export function compilar(g, cat, { name } = {}) {
  const module = newModule();
  module.callChain.push({ name: name ?? null, callerCell: null });
  const vi = compileOVI(g, cat, module, null, "", TOP_LEVEL_CHAIN_INDEX);
  if (vi.errores) return { errores: vi.errores };
  return assemble(module, vi);
}

/**
 * What the VIs of one module share: the data space and its static data, the
 * globals, the subplans run by the host, the nodes that may raise the automatic
 * error dialog and the functions of synchronous subVIs, called directly.
 */
function newModule() {
  const module = {
    space: 0, // bytes of the data space already reserved
    globales: [],
    constantes: [], // { celda, bytes }
    datosFijos: [], // { desde, bytes }: escalares de las constantes de cluster
    planes: [], // los subplanes: por cada uno, sus clumps
    automaticos: [], // los nodos que pueden sacar el diálogo, por índice
    directFunctions: [], // the single clump of each synchronous subVI instance
    debugNodes: [], // DT-047: the nodes that report to the debugger, by index: { vi, nodo, outputs }
    instances: new Map(), // instance key → compiled subVI instance
    propertyNodes: [], // DT-072: what the host needs to run each Property Node, by index
    callLibraries: [], // DT-080: what the host needs to make each Call Library Function Node's call, by index
    controlReferences: [], // DT-072 §2: the panel control each control reference names; a refnum is its index + 1
    // The VIs an error source names (spec/04 Rule 21k): by chain index, the VI's name and the cell
    // where each call to it writes the chain index of its caller; the top-level VI has no cell.
    callChain: [],
  };
  // El data space (DT-042): una celda por búfer; las constantes, aparte.
  module.bufer = (tam, al = 8) => {
    module.space = (module.space + al - 1) & ~(al - 1);
    const d = CELDAS + module.space;
    module.space += tam;
    return d;
  };
  // DT-047: the host writes 1 here while debugging; the hooks read it after each node.
  module.debugFlag = module.bufer(4, 4);
  return module;
}

/** The resolved types of a VI with each terminal's type as it is laid out in memory (`inMemory`). */
function laidOutInMemory(resolved) {
  const mapTypes = (types) => new Map([...types].map(([terminal, type]) => [terminal, inMemory(type)]));
  return { ...resolved, entradas: mapTypes(resolved.entradas), salidas: mapTypes(resolved.salidas) };
}

/**
 * Compiles one VI into `module`. `asSubVI` is null for the top-level VI, whose
 * controls and indicators are the panel's; for a subVI it maps the name of each
 * connector control and indicator to its slot in the data space, through which
 * the caller passes inputs and reads outputs (DT-045).
 */
function compileOVI(withDecorations, cat, module, asSubVI, instanceKey, chainIndex) {
  // Free labels and other decorations (DT-085) are presentation: they have no ports and nothing to emit.
  const g = { ...withDecorations, nodos: withDecorations.nodos.filter((n) => !cat.bloque(n.tipo).decoracion) };
  // A path is laid out as a string's handle, so the functions that take a path or a string, and the
  // panel, look at the types as the graph has them.
  const logicalTypes = tipos(g, cat);
  const resueltos = laidOutInMemory(logicalTypes);
  if (!ejecutable(g, cat, resueltos)) {
    const errores = [...resueltos.cables.entries()].filter(([, c]) => c.roto).map(([id, c]) => ({ cable: id, motivo: c.roto }));
    const llegan = new Set(g.cables.map((c) => `${c.a.nodo}.${c.a.puerto}`));
    for (const n of g.nodos) {
      if (cat.bloque(n.tipo).panel) continue;
      for (const p of cat.puertos(n).in) {
        if (requerido(g, n, p) && !llegan.has(`${n.id}.${p.name}`)) errores.push({ nodo: n.id, motivo: `"${n.label?.text ?? n.name}" is missing a wire on its input "${p.label ?? p.name}".` });
      }
    }
    // DT-060: an array with no element has no type to emit, nor has whatever receives it.
    for (const n of undefinedArrayNodes(g)) errores.push({ nodo: n.id, motivo: `"${n.label?.text ?? n.name}" is an array with no element: its type is undefined.` });
    for (const id of nodesWithUndefinedInput(g, resueltos)) {
      const n = g.nodos.find((node) => node.id === id);
      errores.push({ nodo: id, motivo: `"${n.label?.text ?? n.name}" receives an array with no element: its type is undefined.` });
    }
    return { errores };
  }
  // The subVIs first, each into its own instance, before this VI claims the zero zone (DT-045).
  const calls = new Map(); // subvi node id → compiled instance
  for (const n of g.nodos.filter((x) => x.tipo === "subvi")) {
    // A polymorphic OVI is called as the instance the node has chosen (DT-074 §2).
    const callee = cat.calleeOf ? cat.calleeOf(n) : cat.findSubVI?.(n.config?.vi);
    if (!callee) return { errores: [{ nodo: n.id, motivo: `The subOVI "${n.config?.vi}" is not loaded.` }] };
    const instance = subOVIInstance(callee, n, module, instanceKey, compileOVI);
    if (instance.errores) return { errores: instance.errores };
    calls.set(n.id, instance);
  }
  const { orden: ids } = orden(g);
  const porId = new Map(g.nodos.map((n) => [n.id, n]));
  const llegaA = new Map(g.cables.map((c) => [`${c.a.nodo}.${c.a.puerto}`, c]));
  const esEstructura = (id) => !!cat.bloque(porId.get(id).tipo).estructura;
  // Un bucle tarda; un Case, sólo si algo suyo tarda (si no, es instantáneo y va
  // en el clump de lo que le rodea, como cualquier nodo).
  // Cada marco de una Flat Sequence es, para el flujo de datos, un arrayElement
  // propio (`secuencia#k`), encadenado al anterior: en LabVIEW lo que sale de un
  // marco sale al acabar ese marco, no la secuencia (comprobado en 2026 Q3,
  // labview-captures/structures/secuencia-*.png). La Stacked es un solo nodo.
  const deMarco = (item) => (typeof item === "string" && item.includes("#") ? item.split("#") : null);
  const esFlat = (id) => porId.get(id)?.tipo === "flat-sequence";
  const esLargo = (id) => {
    const m = deMarco(id);
    if (m) return g.nodos.some((k) => k.dentro === m[0] && k.marco === Number(m[1]) && esLargo(k.id));
    const n = porId.get(id);
    if (LARGOS.has(n.tipo) || n.tipo === "while-loop" || n.tipo === "for-loop") return true;
    if (n.tipo === "subvi") return calls.get(n.id).plan !== null;
    // Un «error out» sin cablear puede sacar el diálogo del manejo automático, que espera al usuario.
    if (g.vi?.["automatic-error-handling"] !== false && n.tipo !== "simple-error-handler" && cat.puertos(n).out.some((p) => p.name === "error-out") && !g.cables.some((c) => c.de.nodo === id && c.de.puerto === "error-out")) return true;
    return esEstructura(id) && g.nodos.some((k) => k.dentro === id && esLargo(k.id));
  };
  /** El marco de una Flat al que pertenece un hijo suyo: el suyo, el del primero que lee un túnel de entrada o el del que alimenta uno de salida. */
  const marcoEnFlat = (d, seq) => {
    if (d.marco !== undefined) return d.marco;
    const hijo = (x) => {
      let n = porId.get(x);
      while (n && n.dentro !== seq) n = porId.get(n.dentro);
      return n;
    };
    if (d.tipo === "tunnel-in") {
      const ks = g.cables.filter((c) => c.de.nodo === d.id).map((c) => hijo(c.a.nodo)?.marco).filter((k) => k !== undefined);
      return ks.length ? Math.min(...ks) : 0;
    }
    const c = llegaA.get(`${d.id}.x`);
    const k = c && hijo(c.de.nodo)?.marco;
    return k ?? porId.get(seq).config.marcos.length - 1;
  };
  // El representante de un nodo en un ámbito: él mismo, la estructura de ese
  // ámbito que lo contiene o, en una Flat, el marco; `raiz`, en el del VI.
  const representante = (id, ambito) => {
    let n = porId.get(id);
    let hijo = null;
    while (n && n.dentro !== ambito) {
      hijo = n;
      n = porId.get(n.dentro);
    }
    if (n && esFlat(n.id) && hijo) {
      while (hijo.dentro !== n.id) hijo = porId.get(hijo.dentro);
      return `${n.id}#${marcoEnFlat(hijo, n.id)}`;
    }
    return n?.id;
  };
  const raiz = (id) => representante(id, undefined);
  /** Una lista de un ámbito con cada Flat cambiada por sus marcos, y las cadenas que los ordenan. */
  const conMarcos = (lista) => {
    const r = [];
    const cadenas = [];
    for (const id of lista) {
      if (!esFlat(id)) {
        r.push(id);
        continue;
      }
      const n = porId.get(id).config.marcos.length;
      for (let k = 0; k < n; k++) {
        r.push(`${id}#${k}`);
        if (k) cadenas.push([`${id}#${k - 1}`, `${id}#${k}`]);
      }
    }
    return { lista: r, cadenas };
  };
  // El diagrama del VI en orden, con cada estructura como un bloque: va después
  // de lo que entra por sus túneles y antes de lo que lee sus salidas.
  const deArriba = conMarcos(ids.filter((id) => !porId.get(id).dentro));
  const arriba = ordenArriba(g, deArriba.lista, raiz, deArriba.cadenas);
  const { clumpDe: clumpRaiz, clumps } = partir(g, arriba, raiz, esLargo, deArriba.cadenas);
  const clumpDe = (id) => clumpRaiz.get(raiz(id));
  const { constantes, datosFijos, planes, automaticos, bufer } = module;
  const nuevaCelda = () => bufer(4, 4);
  // El cluster «cero»: tan grande como el mayor cluster del VI; no se escribe nunca.
  const tamMax = Math.max(0, ...[...resueltos.entradas.values(), ...resueltos.salidas.values()].filter(esCluster).map((t) => clusterLayout(t).tam));
  setZeroClusterAddress(bufer(Math.max(tamMax, 8)));
  const cadena = (texto) => {
    const celda = nuevaCelda();
    constantes.push({ celda, bytes: bloqueCadena(texto) });
    return celda;
  };
  /**
   * Una constantOf de array: su bloque [n][relleno][elementos] en el data space,
   * ya escrito al instanciar, y la celda que lo apunta. Sus cadenas, en la zona
   * estática; sus clusters, con clusterConstante.
   */
  const arrayConstante = (t, valoresAnidados) => {
    const el = arrayElement(t.array);
    const celda = nuevaCelda();
    const { sizes, elements: valores } = flattenArrayValue(valoresAnidados, dimensionsOf(t), undefined);
    if (!valores.length) return celda;
    const b = bufer(ARRAY_HEADER_BYTES + valores.length * el.tam);
    sizes.forEach((size, dimension) => datosFijos.push({ desde: b + dimension * SECOND_SIZE_OFFSET, bytes: i32(size) }));
    datosFijos.push({ desde: celda, bytes: i32(b) });
    valores.forEach((v, i) => {
      const dir = b + ARRAY_HEADER_BYTES + i * el.tam;
      if (t.array === "string") constantes.push({ celda: dir, bytes: bloqueCadena(String(v ?? "")) });
      else if (esCluster(t.array)) clusterConstante(t.array, v, dir);
      else {
        const bytes = new Uint8Array(el.tam);
        const dv = new DataView(bytes.buffer);
        const x = t.array === "boolean" ? (v ? 1 : 0) : Number(v ?? 0);
        ({ 1: () => dv.setInt8(0, x), 2: () => dv.setInt16(0, x, true), 4: () => (el.carga === "f32.load" ? dv.setFloat32(0, x, true) : dv.setInt32(0, x, true)), 8: () => (el.carga === "f64.load" ? dv.setFloat64(0, x, true) : dv.setBigInt64(0, BigInt(Math.trunc(x)), true)) })[el.tam]();
        datosFijos.push({ desde: dir, bytes });
      }
    });
    return celda;
  };
  /** Una constantOf de cluster: su bloque en el data space, ya escrito al instanciar; sus cadenas, en la zona estática. */
  const clusterConstante = (t, v, dir = null) => {
    const d = clusterLayout(t);
    const b = dir ?? bufer(d.tam);
    for (const c of d.campos) {
      const x = v?.[c.nombre];
      if (esCluster(c.tipo)) clusterConstante(c.tipo, x, b + c.off);
      else if (c.tipo === "string") constantes.push({ celda: b + c.off, bytes: bloqueCadena(String(x ?? "")) });
      else {
        const vt = wasmTypeOf(c.tipo);
        const bytes = new Uint8Array(vt === "f64" || vt === "i64" ? 8 : 4);
        const dv = new DataView(bytes.buffer);
        if (vt === "f64") dv.setFloat64(0, Number(x ?? 0), true);
        else if (vt === "f32") dv.setFloat32(0, Number(x ?? 0), true);
        else if (vt === "i64") dv.setBigInt64(0, BigInt(Math.trunc(Number(x ?? 0))), true);
        else dv.setInt32(0, c.tipo === "boolean" ? (x ? 1 : 0) : Number(x ?? 0) | 0, true);
        datosFijos.push({ desde: b + c.off, bytes });
      }
    }
    return b;
  };
  // Manejo automático de errores, activo de fábrica (VI Properties ▸ Execution).
  const autoErrores = g.vi?.["automatic-error-handling"] !== false;
  const valor = new Map(); // `${nodo}.${puerto}` → { local, wasmType, clump, cell }
  const controles = [];
  const indicadores = [];
  const errores = [];
  // The panel's records, by node id (DT-063 §10): made when a control or a wired indicator is emitted, or
  // earlier by a Property Node linked to it (DT-072), which may come first and may link an unwired indicator.
  const panelRecords = new Map();
  /** The record of panel object `id`, whose value is of `type` (a chart keeps `historyLength` of them). */
  function panelRecordOf(id, type, historyLength = null) {
    if (!panelRecords.has(id)) {
      const slot = slotBytes(type, esCluster(type) ? clusterLayout(type).tam : undefined);
      panelRecords.set(id, { record: module.bufer(recordBytes(slot, historyLength ?? 1), 8), slot });
    }
    return panelRecords.get(id);
  }
  /** An indicator of the top-level VI, listed once for the host to walk; returns its record. */
  function registerIndicator(id, type, logicalType, historyLength = null) {
    const { record, slot } = panelRecordOf(id, type, historyLength);
    if (!indicadores.some((indicator) => indicator.nodo === id)) {
      const n = porId.get(id);
      indicadores.push({ nodo: id, name: n.name, tipo: type, record, ...(historyLength && { historyLength, slot }), ...panelDataOf(type, logicalType), ...(RESOURCE_NAME_PANEL_OBJECTS.has(n.tipo) && { resourceName: true }), ...(logicalType === PATH && { path: true }), ...taskPanelData(logicalType) });
    }
    return { record, slot };
  }
  /**
   * The panel control or indicator named `linkName`, as the host reaches it: a control gets its record here, and an
   * unwired indicator is listed so that what a Property Node writes reaches the panel.
   */
  function linkPanelObject(linkName) {
    const node = g.nodos.find((candidate) => candidate.name === linkName);
    if (!node) throw new Error(`The control "${linkName}" this Property Node is linked to is not on the panel.`);
    if (asSubVI) throw new Error("A Property Node linked to a control of a subOVI cannot run yet.");
    // The object's own type: linkedControlType answers for a Property Node, not for the object it links to.
    const logicalType = panelObjectType(cat, node);
    const type = inMemory(logicalType);
    const isControl = PANEL_CONTROLS.includes(node.tipo);
    if (isControl) panelRecordOf(node.id, type);
    else registerIndicator(node.id, type, logicalType);
    return { nodo: node.id, control: isControl, mecanica: mechanicalAction(cat, node) ?? null, label: node.label?.text ?? "" };
  }
  /** Records what the host needs to run a Property Node and returns its index. */
  function registerPropertyNode(entry) {
    return module.propertyNodes.push({ ...entry, link: entry.link === null ? null : linkPanelObject(entry.link) }) - 1;
  }
  /** Records what the host needs to make a Call Library Function Node's call and returns its index. */
  function registerCallLibrary(entry) {
    return module.callLibraries.push(entry) - 1;
  }
  /** Records the panel control a control reference names and returns the reference's refnum, never 0 (Not A Refnum). */
  function registerControlReference(linkName) {
    return module.controlReferences.push(linkPanelObject(linkName));
  }
  // Allow Debugging (VI Properties ▸ Execution), on by default as in LabVIEW (DT-047).
  const allowDebugging = g.vi?.execution?.["allow-debugging"] !== false;

  /**
   * The debug hook after node `id` (DT-047): only while the host has set the
   * debug flag, the value of each output and then the node, which may suspend.
   */
  function debugHook(id, outputs, { border = false, frame = null, frameIndex = null } = {}) {
    if (!allowDebugging) return [];
    const entry = { vi: instanceKey, nodo: id, outputs: outputs.map(({ port, type }) => ({ port, tipo: type, ...panelData(type) })) };
    const index = module.debugNodes.push({ ...entry, ...(border && { border: true }), ...(frame && { frame }), ...(frameIndex !== null && { frameIndex }) }) - 1;
    const values = outputs.flatMap(({ type, local }, j) => [ins("i32.const", index), ins("i32.const", j), ins("local.get", local), ins("call", importIndex(`valor_${wasmTypeOf(type)}`))]);
    return [ins("i32.const", module.debugFlag), ins("i32.load"), ins("if"), ...values, ins("i32.const", index), ins("call", importIndex("nodo")), ins("drop"), ins("end")];
  }
  /**
   * The debug hook of a border element of a structure —a tunnel, a shift register, the
   * loop's "i"— whose one output `port` is in `local`: it shows its value on the wire that
   * leaves it, but the debugger never stops before it, since it is not a node.
   */
  function borderHook(id, port, local, k) {
    return debugHook(id, [{ port, type: contexto(id, k).tOut(0), local }], { border: true });
  }

  /**
   * The debug hook of a structure's frame, where single stepping stops (labview-captures/reports/
   * 2026-10-16-warnings-frame-stops.md §B): `phase` is "start" (before a structure runs), "iteration" (the end of
   * a loop's iteration), "end" (a Case's frame finished), "between" (a Flat Sequence going to its next frame),
   * "frame-end" and "last-frame-end" (a Flat Sequence's frame finished).
   */
  const frameHook = (sid, phase, frameIndex = null) => debugHook(sid, [], { frame: phase, frameIndex });

  // The outputs another clump reads need a crossing cell.
  const cruzan = new Set(g.cables.filter((c) => clumpDe(c.de.nodo) !== clumpDe(c.a.nodo)).map((c) => `${c.de.nodo}.${c.de.puerto}`));

  /** Lo que hace falta para emitir un nodo en el clump `k`. */
  function contexto(id, k) {
    const n = porId.get(id);
    const { in: entradas, out: salidas } = cat.puertos(n);
    const tIn = (i) => resueltos.entradas.get(`${id}.${entradas[i].name}`);
    const tOut = (j) => resueltos.salidas.get(`${id}.${salidas[j].name}`);
    const logicalTIn = (i) => logicalTypes.entradas.get(`${id}.${entradas[i].name}`);
    const logicalTOut = (j) => logicalTypes.salidas.get(`${id}.${salidas[j].name}`);
    const nuevoLocal = (vt) => k.locales.push(vt) - 1;
    const entrada = (i) => {
      const c = llegaA.get(`${id}.${entradas[i].name}`);
      if (!c) return constantOf(tIn(i), entradas[i].default ?? 0);
      const t = resueltos.salidas.get(`${c.de.nodo}.${c.de.puerto}`);
      const v = valor.get(`${c.de.nodo}.${c.de.puerto}`);
      // El nodo de origen ya dio un error: no hay valor, y el VI no se emitirá.
      if (!v) return [];
      // Read from another function —a clump of a subplan, or the loop that calls it—: the value
      // goes through a cell of the data space. Each output is assigned once per execution, so it
      // is enough to store it at the end of what its function has emitted so far: in the loop,
      // that comes before the call to the subplan.
      if (v.clump !== k && v.cell === undefined) {
        v.wasmType ??= wasmTypeOf(t);
        v.cell = crossingCell(v.wasmType);
        v.clump.cuerpo.push(...storeCrossing(v));
      }
      const leer = v.clump === k ? [ins("local.get", v.local)] : loadCrossing(v);
      // Un array con otro tipo de arrayElement se convierte entero en un búfer propio:
      // el punto de coerción de LabVIEW (DT-042).
      if (esArray(t) && esArray(tIn(i)) && JSON.stringify(t.array) !== JSON.stringify(tIn(i).array)) return convertirArray(t, tIn(i), leer);
      const daqCoercion = daqTaskCoercion(logicalTypes.salidas.get(`${c.de.nodo}.${c.de.puerto}`), logicalTIn(i), leer);
      return daqCoercion ?? [...leer, ...convertValue(t, tIn(i))];
    };
    /** Copia el array que deja `origen` a una celda nueva, convirtiendo cada arrayElement de `desde.array` a `hacia.array`. */
    const convertirArray = (desde, hacia, origen) => {
      const [ed, eh] = [desde.array, hacia.array];
      const conv = convertValue(ed, eh);
      if (isByReference(ed) || isByReference(eh) || conv === null) throw new Error(`An array of ${JSON.stringify(ed)} cannot be converted into one of ${JSON.stringify(eh)}.`);
      const [elD, elH] = [arrayElement(ed), arrayElement(eh)];
      const celda = nuevaCelda();
      const [h, n, o, d, j] = Array.from({ length: 5 }, () => nuevoLocal("i32"));
      const g = (l) => ins("local.get", l);
      // The converted array keeps the sizes of the original, whatever its dimensions.
      const tamanos = Array.from({ length: dimensionsOf(desde) }, () => nuevoLocal("i32"));
      return [
        ...origen, ins("local.set", h), ...elementCount(desde, h, nuevoLocal), ins("local.set", n), g(h), callMemory("datos8"), ins("local.set", o),
        ...tamanos.flatMap((tamano, dimension) => [...dimensionSize(h, dimension, nuevoLocal), ins("local.set", tamano)]),
        ...reserveArray(hacia, celda, tamanos, nuevoLocal), ins("local.set", d),
        ins("i32.const", 0), ins("local.set", j), ins("block"), ins("loop"), g(j), g(n), ins("i32.ge_s"), ins("br_if", 1),
        g(d), g(j), ins("i32.const", elH.tam), ins("i32.mul"), ins("i32.add"),
        g(o), g(j), ins("i32.const", elD.tam), ins("i32.mul"), ins("i32.add"), ins(elD.carga), ...conv, ins(elH.guarda),
        g(j), ins("i32.const", 1), ins("i32.add"), ins("local.set", j), ins("br", 0), ins("end"), ins("end"),
        ins("i32.const", celda),
      ];
    };
    const cableada = (i) => llegaA.has(`${id}.${entradas[i].name}`);
    return { n, entradas, salidas, tIn, tOut, logicalTIn, logicalTOut, nuevoLocal, entrada, cableada, nombre: n.label?.text ?? n.name };
  }

  /**
   * A cell of the data space for a value that crosses from one clump to another. It is memory and
   * not a WebAssembly global because every thread of the pool has globals of its own but shares
   * the memory (DT-063 §1): the clump that reads the value may run on another thread.
   */
  const crossingCell = (wasmType) => {
    const bytes = wasmType === "i64" || wasmType === "f64" ? 8 : 4;
    return bufer(bytes, bytes);
  };
  const storeCrossing = (v) => [ins("i32.const", v.cell), ins("local.get", v.local), ins(`${v.wasmType}.store`)];
  const loadCrossing = (v) => [ins("i32.const", v.cell), ins(`${v.wasmType}.load`)];

  /** The value of an output is in the local `l`; if another clump reads it, also in a crossing cell. */
  function dejar(k, id, puerto, l, vt) {
    const v = { local: l, clump: k, wasmType: vt };
    if (cruzan.has(`${id}.${puerto}`)) {
      v.cell = crossingCell(vt);
      k.cuerpo.push(...storeCrossing(v));
    }
    valor.set(`${id}.${puerto}`, v);
  }

  function emitirNodo(id, k) {
    const { n, entradas, salidas, tIn, tOut, logicalTIn, logicalTOut, nuevoLocal, entrada, cableada, nombre } = contexto(id, k);
    const tiposNodo = [...entradas.map((_, i) => tIn(i)), ...salidas.map((_, j) => tOut(j))];
    if (tiposNodo.some((t) => !escalar(t))) return errores.push({ nodo: id, motivo: `"${nombre}" carries a type the compiler cannot emit yet.` });
    // Un indicador sin cable no se escribe: conserva su valor, como en LabVIEW.
    if (["indicator", "bool-indicator", "str-indicator", "cluster-indicator", "arr-indicator", "visa-indicator", "path-indicator", "refnum-indicator", "daq-name-indicator", "waveform-chart", "waveform-graph", "xy-graph"].includes(n.tipo)) {
      if (!llegaA.has(`${id}.value`)) return;
      // In a subVI, a connector indicator leaves its value in its slot for the caller; any other one, nowhere.
      if (asSubVI) {
        const slot = asSubVI.get(n.name);
        if (slot) k.cuerpo.push(...storeInSlot(tIn(0), slot, entrada(0), nuevoLocal));
        return;
      }
      const historyLength = n.tipo === "waveform-chart" ? (n.config?.historyLength ?? DEFAULT_CHART_HISTORY) : null;
      const { record, slot } = registerIndicator(id, tIn(0), logicalTIn(0), historyLength);
      k.cuerpo.push(...writeIndicator(record, slot, tIn(0), entrada(0), nuevoLocal, historyLength), ...debugHook(id, []));
      return;
    }
    // VISA and the file functions are served by the same I/O (the editor's I/O process).
    // VISA's Property Node too (DT-072 §5).
    if (VISA_FUNCTIONS.has(n.tipo) || FILE_FUNCTIONS.has(n.tipo) || (n.tipo === "property-node" && n.config?.class === "Instr") || n.tipo === "call-library") module.usesInstrumentIo = true;
    const emitir = n.tipo === "subvi" ? (e) => callSubOVI(e, calls.get(id)) : asSubVI && PANEL_CONTROLS.includes(n.tipo) ? (e) => subOVIControl(e, asSubVI.get(n.name)) : BLOQUES[n.tipo];
    if (!emitir) return errores.push({ nodo: id, motivo: `The compiler cannot emit "${nombre}" (${n.tipo}) yet.` });
    const e = { nodo: n, cat, tIn, tOut, logicalTIn, logicalTOut, entrada, cableada, temporal: nuevoLocal, indice: controles.length, celda: nuevaCelda, cadena, bufer, clusterConstante, arrayConstante, chainIndex, registerPropertyNode, registerCallLibrary, registerControlReference };
    if (!asSubVI && PANEL_CONTROLS.includes(n.tipo)) {
      e.controlRecord = panelRecordOf(id, tOut(0)).record;
      controles.push({ nodo: id, name: n.name, tipo: tOut(0), mecanica: mechanicalAction(cat, n), record: e.controlRecord, ...panelDataOf(tOut(0), logicalTOut(0)), ...(RESOURCE_NAME_PANEL_OBJECTS.has(n.tipo) && { resourceName: true }), ...(logicalTOut(0) === PATH && { path: true }), ...taskPanelData(logicalTOut(0)) });
    }
    try {
      const b = cat.bloque(n.tipo);
      const ie = entradas.findIndex((p) => p.name === "error-in");
      const oe = salidas.findIndex((p) => p.name === "error-out");
      if (b["pasa-error"] && ie >= 0 && oe >= 0) k.cuerpo.push(...pasaError(e, salidas, ie, oe, emitir(e)));
      else k.cuerpo.push(...emitir(e));
    } catch (fallo) {
      return errores.push({ nodo: id, motivo: fallo.message });
    }
    const locs = salidas.map((_, j) => nuevoLocal(wasmTypeOf(tOut(j))));
    for (let j = locs.length - 1; j >= 0; j--) k.cuerpo.push(ins("local.set", locs[j]));
    salidas.forEach((p, j) => dejar(k, id, p.name, locs[j], wasmTypeOf(tOut(j))));
    k.cuerpo.push(...debugHook(id, salidas.map((p, j) => ({ port: p.name, type: tOut(j), local: locs[j] }))));
    // Manejo automático de errores (DT-043): un «error out» sin cablear que lleva un error para el VI y lo cuenta.
    const oe = salidas.findIndex((p) => p.name === "error-out");
    if (oe >= 0 && autoErrores && n.tipo !== "simple-error-handler" && !g.cables.some((c) => c.de.nodo === id && c.de.puerto === "error-out")) {
      k.cuerpo.push(ins("local.get", locs[oe]), ins("i32.load", ERROR_FIELDS.status), ins("if"),
        ins("i32.const", automaticos.push(id) - 1), ins("local.get", locs[oe]), ins("call", importIndex("error_automatico")), ins("drop"), ins("end"));
    }
  }

  /**
   * El envoltorio de una función con «error in» y «error out» (DT-043, medido en
   * LabVIEW): con status TRUE a la entrada no trabaja, sus salidas dan el valor
   * por defecto y «error out» es el mismo cluster; si no, trabaja (`trabajo`
   * deja sus salidas en la pila, «error out» incluido).
   */
  function pasaError(e, salidas, ie, oe, trabajo) {
    const locs = salidas.map((_, j) => e.temporal(wasmTypeOf(e.tOut(j))));
    const x = e.temporal("i32");
    const c = [...e.entrada(ie), ins("local.tee", x), ins("i32.load", ERROR_FIELDS.status), ins("if")];
    salidas.forEach((_, j) => c.push(...(j === oe ? [ins("local.get", x)] : constantOf(e.tOut(j), 0)), ins("local.set", locs[j])));
    c.push(ins("else"), ...trabajo);
    for (let j = locs.length - 1; j >= 0; j--) c.push(ins("local.set", locs[j]));
    c.push(ins("end"), ...locs.map((l) => ins("local.get", l)));
    return c;
  }

  /**
   * Un While o un For, en línea en la función de su clump (DT-041): los túneles
   * de entrada se leen una vez; cada vuelta corre el cuerpo en orden
   * topológico, guarda lo de los shift registers y los túneles de salida, mira
   * la condición y cede si se le acaba el presupuesto; al acabar, los túneles
   * de salida dan el valor de la última vuelta. Un For con N ≤ 0 no corre: sus
   * túneles dan el valor por defecto y sus shift registers el inicial.
   */
  function emitirEstructura(sid, k) {
    const s = porId.get(sid);
    const deAqui = ids.filter((id) => porId.get(id).dentro === sid);
    const BORDE = new Set(["tunnel-in", "tunnel-out", "shift-register-left", "shift-register-right", "loop-iteration", "loop-condition", "loop-count"]);
    // El cuerpo, en orden con cada estructura de dentro como un bloque; el borde, aparte.
    const hijos = [...deAqui.filter((id) => BORDE.has(porId.get(id).tipo)), ...ordenArriba(g, deAqui.filter((id) => !BORDE.has(porId.get(id).tipo)), (id) => representante(id, sid))];
    const de = (tipo) => hijos.filter((id) => porId.get(id).tipo === tipo);
    const L = (vt) => k.locales.push(vt) - 1;
    const c = k.cuerpo;
    // Antes de la primera vuelta: lo que entra por el borde. Un túnel indexado
    // guarda su array (handle, longitud, datos) y da su arrayElement en cada vuelta.
    const indexados = [];
    for (const id of de("tunnel-in")) {
      const x = contexto(id, k);
      const l = L(wasmTypeOf(x.tOut(0)));
      if (porId.get(id).config?.indexado) {
        // `m` is the length of a 1D array or the rows of a 2D one: the first word of the block either way.
        const [h, m, d] = [L("i32"), L("i32"), L("i32")];
        c.push(...x.entrada(0), ins("local.tee", h), callMemory("longitud"), ins("local.set", m), ins("local.get", h), callMemory("datos8"), ins("local.set", d));
        const fila = esArray(x.tOut(0)) ? { celda: nuevaCelda(), columnas: L("i32") } : null;
        if (fila) c.push(...dimensionSize(h, 1, L), ins("local.set", fila.columnas));
        indexados.push({ t: x.tOut(0), l, m, d, fila });
      } else c.push(...x.entrada(0), ins("local.set", l));
      valor.set(`${id}.y`, { local: l, clump: k });
    }
    const registros = de("shift-register-left").map((id) => {
      const x = contexto(id, k);
      const vt = wasmTypeOf(x.tOut(0));
      const [ahora, nuevo] = [L(vt), L(vt)];
      // Una cadena: el shift register tiene su propia celda y se guarda una copia,
      // para que quien la produjo pueda reescribir su búfer en la vuelta siguiente.
      const t = x.tOut(0);
      const celda = t === "string" || esArray(t) ? nuevaCelda() : esCluster(t) ? bufer(clusterLayout(t).tam) : null;
      // Uninitialized, it starts with what it held when the loop last ended, kept in
      // the data space: a functional global variable relies on it (DT-045).
      const inicializado = x.cableada(0);
      const guardado = !inicializado && celda === null ? bufer(8) : null;
      if (celda !== null && inicializado) c.push(...copyValue(t, x.entrada(0), celda, x.nuevoLocal));
      if (celda !== null) c.push(ins("i32.const", celda), ins("local.set", ahora));
      else if (guardado !== null) c.push(ins("i32.const", guardado), ins(`${vt}.load`), ins("local.set", ahora));
      else c.push(...x.entrada(0), ins("local.set", ahora));
      valor.set(`${id}.value`, { local: ahora, clump: k });
      return { izq: id, der: porId.get(id).config.par, ahora, nuevo, vt, celda, t, guardado };
    });
    // La cuenta de un For: la cableada, recortada a la longitud de cada array indexado.
    let n = null;
    for (const id of de("loop-count")) {
      n = L("i32");
      const cableada = llegaA.has(`${id}.count`);
      c.push(...(cableada ? contexto(id, k).entrada(0) : indexados.length ? [ins("local.get", indexados[0].m)] : [ins("i32.const", 0)]), ins("local.set", n));
      for (const x of indexados) c.push(ins("local.get", x.m), ins("local.get", n), ins("local.get", x.m), ins("local.get", n), ins("i32.lt_s"), ins("select"), ins("local.set", n));
      // N shows the count it was given on its own terminal, once (measured); it has no wire inside to carry it.
      if (cableada) c.push(...debugHook(id, [{ port: "count", type: "i32", local: n }], { border: true }));
    }
    const i = L("i32");
    for (const id of de("loop-iteration")) valor.set(`${id}.i`, { local: i, clump: k });
    const presupuesto = L("i32");
    const salidas = de("tunnel-out").map((id) => {
      const x = contexto(id, k);
      // Un túnel de salida indexado va llenando el array de su celda, una vuelta cada vez.
      if (porId.get(id).config?.indexado) return { id, l: L("i32"), indexado: { celda: nuevaCelda(), n: L("i32"), t: x.tIn(0) } };
      return { id, l: L(wasmTypeOf(x.tOut(0))) };
    });
    const parada = L("i32");

    // Cada vez que se entra en la estructura —un bucle dentro de otro entra
    // muchas—, i vuelve a 0 y los túneles de salida al valor por defecto.
    c.push(ins("i32.const", 0), ins("local.set", i));
    for (const t of salidas) {
      if (t.indexado) {
        const el = arrayElement(t.indexado.t);
        c.push(ins("i32.const", 0), ins("local.set", t.indexado.n), ins("i32.const", t.indexado.celda), ins("i32.const", 0), ins("i32.const", el.tam), ins("i32.const", el.ref ? 1 : 0), callMemory("nuevo_array"), ins("drop"));
      } else c.push(...constantOf(contexto(t.id, k).tOut(0), 0), ins("local.set", t.l));
    }
    c.push(...frameHook(sid, "start"), ins("block"));
    if (n !== null) c.push(ins("local.get", n), ins("i32.const", 0), ins("i32.le_s"), ins("br_if", 0));
    c.push(ins("loop"));
    // El arrayElement de cada túnel indexado en esta vuelta (fuera del array, el valor por defecto).
    for (const x of indexados) {
      if (x.fila) {
        c.push(...loopRowOfIteration(x, i, L));
        continue;
      }
      const el = arrayElement(x.t);
      c.push(...constantOf(x.t, 0), ins("local.set", x.l), ins("local.get", i), ins("local.get", x.m), ins("i32.lt_s"),
        ins("if"), ...loadElement(x.t, [ins("local.get", x.d), ins("local.get", i), ins("i32.const", el.tam), ins("i32.mul"), ins("i32.add")]), ins("local.set", x.l), ins("end"));
    }
    // Each iteration the values enter again by the border, as Highlight Execution shows them.
    for (const id of de("tunnel-in")) c.push(...borderHook(id, "y", valor.get(`${id}.y`).local, k));
    for (const r of registros) c.push(...borderHook(r.izq, "value", r.ahora, k));
    for (const id of de("loop-iteration")) c.push(...borderHook(id, "i", i, k));
    emitirCuerpo(deAqui.filter((id) => !BORDE.has(porId.get(id).tipo)), sid, k);
    for (const t of salidas) {
      if (!t.indexado) {
        c.push(...contexto(t.id, k).entrada(0), ins("local.set", t.l));
        continue;
      }
      const { celda, n: m, t: te } = t.indexado;
      const el = arrayElement(te);
      const d = L("i32");
      c.push(
        ins("i32.const", celda), ins("local.get", m), ins("i32.const", 1), ins("i32.add"), ins("i32.const", el.tam), ins("i32.const", el.ref ? 1 : 0), callMemory("nuevo_array"), ins("local.set", d),
        ...storeElement(te, [ins("local.get", d), ins("local.get", m), ins("i32.const", el.tam), ins("i32.mul"), ins("i32.add")], contexto(t.id, k).entrada(0), L),
        ins("local.get", m), ins("i32.const", 1), ins("i32.add"), ins("local.set", m),
      );
    }
    for (const r of registros) c.push(...contexto(r.der, k).entrada(0), ins("local.set", r.nuevo));
    for (const id of de("loop-condition")) {
      c.push(...contexto(id, k).entrada(0));
      if (porId.get(id).config?.mode === "continue-if-true") c.push(ins("i32.eqz"));
      c.push(ins("local.set", parada));
    }
    for (const r of registros) {
      if (r.celda !== null) c.push(...copyValue(r.t, [ins("local.get", r.nuevo)], r.celda, L));
      else c.push(ins("local.get", r.nuevo), ins("local.set", r.ahora));
    }
    c.push(...frameHook(sid, "iteration"));
    // i + 1, sin pasar de 2^31 − 1: LabVIEW lo deja ahí.
    c.push(ins("local.get", i), ins("local.get", i), ins("i32.const", 0x7fffffff), ins("i32.ne"), ins("i32.add"), ins("local.set", i));
    c.push(
      ins("local.get", presupuesto), ins("i32.const", 1), ins("i32.sub"), ins("local.tee", presupuesto), ins("i32.const", 0), ins("i32.le_s"),
      ins("if"), callScheduler("yield_point"), ins("local.set", presupuesto), ins("end"),
    );
    if (n !== null) c.push(ins("local.get", i), ins("local.get", n), ins("i32.lt_s"), ins("br_if", 0));
    else c.push(ins("local.get", parada), ins("i32.eqz"), ins("br_if", 0));
    c.push(ins("end"), ins("end"));
    // Al acabar: lo que sale por el borde.
    for (const t of salidas) {
      // Rows that come out of an indexed tunnel make a 2D array: one block, not an array of arrays (DT-044).
      if (t.indexado && esArray(t.indexado.t)) {
        const celda = nuevaCelda();
        c.push(...gatherRowsInto2dArray(contexto(t.id, k).tOut(0), t.indexado.celda, celda, L), ins("i32.const", celda), ins("local.set", t.l));
      } else if (t.indexado) c.push(ins("i32.const", t.indexado.celda), ins("local.set", t.l));
      dejar(k, t.id, "y", t.l, wasmTypeOf(contexto(t.id, k).tOut(0)));
      c.push(...borderHook(t.id, "y", t.l, k));
    }
    for (const r of registros) if (r.guardado !== null) c.push(ins("i32.const", r.guardado), ins("local.get", r.ahora), ins(`${r.vt}.store`));
    for (const r of registros) {
      dejar(k, r.der, "result", r.ahora, r.vt);
      c.push(...borderHook(r.der, "result", r.ahora, k));
    }
    void s;
  }

  /**
   * Un Case, en línea (DT-041): los túneles de entrada se leen una vez; el
   * selector, redondeado a entero si es decimal, elige un marco por una cadena
   * de if/else (sus valores y rangos, en orden; el Default, al final); sólo corre
   * lo de ese marco, y cada túnel de salida toma lo que le llega en él, o el
   * valor por defecto con Use Default If Unwired.
   */
  /**
   * Whether the frames give every item of the enum `t` a frame; ranges include both ends
   * (spec/04 Rule 17e). A frame's values are item names (DT-049); a name that is not an
   * item covers nothing.
   */
  function coversEveryItem(t, frames) {
    const at = (name) => (name === undefined ? undefined : t.enum.indexOf(name));
    const covered = (item) =>
      frames.some((frame) => (frame.valores ?? []).some((v) => {
        if (typeof v === "string") return at(v) === item;
        if (v && typeof v === "object") {
          const lo = v.min === undefined ? 0 : at(v.min);
          const hi = v.max === undefined ? t.enum.length - 1 : at(v.max);
          return lo <= item && item <= hi;
        }
        return false;
      }));
    return t.enum.every((_, item) => covered(item));
  }

  function emitirCase(sid, k) {
    const s = porId.get(sid);
    const marcos = s.config?.marcos ?? [];
    const deAqui = ids.filter((id) => porId.get(id).dentro === sid);
    const c = k.cuerpo;
    const L = (vt) => k.locales.push(vt) - 1;
    for (const id of deAqui.filter((x) => porId.get(x).tipo === "tunnel-in")) {
      const x = contexto(id, k);
      const l = L(wasmTypeOf(x.tOut(0)));
      c.push(...x.entrada(0), ins("local.set", l));
      valor.set(`${id}.y`, { local: l, clump: k });
    }
    // The selector: a Boolean or an integer as an i32, or a string by its handle.
    const sel = L("i32");
    let stringSelector = false;
    // An enum selector travels as its item index (U16) and names its frames by item (DT-049).
    let enumSelector = null;
    // An error cluster selector keeps its code in `sel` and its status here.
    let errorSelector = false;
    const errorStatus = L("i32");
    // Lo que rompe la flecha de Run en LabVIEW: un selector numérico sin Default,
    // uno booleano sin sus dos marcos, o un valor en dos marcos.
    const nombre = s.label?.text ?? s.name;
    const vistos = new Set();
    for (const m of marcos) {
      for (const v of m.valores ?? []) {
        const clave = JSON.stringify(v);
        if (vistos.has(clave)) errores.push({ nodo: sid, motivo: `In "${nombre}", the value ${clave} is in two frames.` });
        vistos.add(clave);
      }
    }
    for (const id of deAqui.filter((x) => porId.get(x).tipo === "case-selector")) {
      const x = contexto(id, k);
      const t = x.tIn(0);
      // An error cluster selects by its status and code (DT-083): No Error when status is F, a warning
      // included, and otherwise the frame whose codes hold the code ("Error 7", "Error .." for any code).
      errorSelector = esError(t);
      if (esCluster(t) && !errorSelector) errores.push({ nodo: sid, motivo: `The selector of "${nombre}" is a cluster: only an error cluster can select a frame.` });
      if (errorSelector && marcos.some((m) => (m.valores ?? []).some((v) => !isErrorFrameValue(v)))) errores.push({ nodo: sid, motivo: "Case Structure: Selector values have wrong type" });
      if (errorSelector && !marcos.some((m) => m.default) && !coversEveryError(marcos)) errores.push({ nodo: sid, motivo: "Case Structure: No case for some selector values" });
      if (t === "boolean" && !(vistos.has("true") && vistos.has("false")) && !marcos.some((m) => m.default)) errores.push({ nodo: sid, motivo: `"${nombre}" needs a True frame and a False frame.` });
      if (t !== "boolean" && !errorSelector && !marcos.some((m) => m.default) && !(esEnum(t) && coversEveryItem(t, marcos))) errores.push({ nodo: sid, motivo: `"${nombre}" needs a Default frame: some selector values have no frame.` });
      if (t === "string" && marcos.some((m) => !m.default && !m.valores?.length)) errores.push({ nodo: sid, motivo: `In "${nombre}", a frame has no selector value.` });
      stringSelector = t === "string";
      enumSelector = esEnum(t) ? t : null;
      c.push(...x.entrada(0));
      if (errorSelector) {
        const cluster = L("i32");
        c.push(ins("local.tee", cluster), ins("i32.load", ERROR_FIELDS.status), ins("local.set", errorStatus), ins("local.get", cluster), ins("i32.load", ERROR_FIELDS.code));
      }
      else if (t !== "boolean" && !stringSelector && !esCluster(t)) c.push(...convertValue(t, "i32"));
      c.push(ins("local.set", sel));
    }
    // A frame value that no longer names an item — a stale name left by deleting the item in
    // Edit Items — breaks the Case, as in LabVIEW; the wire stays whole (measured, DT-049).
    if (enumSelector) {
      const esItem = (name) => enumSelector.enum.includes(name);
      for (const m of marcos) {
        for (const v of m.valores ?? []) {
          const wrongType = typeof v === "string" ? !esItem(v) : v && typeof v === "object" ? (v.min !== undefined && !esItem(v.min)) || (v.max !== undefined && !esItem(v.max)) : true;
          if (wrongType) errores.push({ nodo: sid, motivo: "Case Structure: Selector values have wrong type" });
        }
      }
    }
    // Its input tunnels show their values once the selector has arrived, as the frame starts (measured).
    for (const id of deAqui.filter((x) => porId.get(x).tipo === "tunnel-in")) c.push(...borderHook(id, "y", valor.get(`${id}.y`).local, k));
    c.push(...frameHook(sid, "start"));
    const salidas = deAqui.filter((x) => porId.get(x).tipo === "case-tunnel-out").map((id) => {
      const x = contexto(id, k);
      const l = L(wasmTypeOf(x.tOut(0)));
      c.push(...constantOf(x.tOut(0), 0), ins("local.set", l));
      return { id, l, x };
    });
    const marco = (m) => {
      emitirCuerpo(deAqui.filter((id) => porId.get(id).marco === m), sid, k);
      for (const t of salidas) {
        if (!llegaA.has(`${t.id}.x-${m}`)) continue;
        c.push(...t.x.entrada(m), ins("local.set", t.l));
      }
    };
    const valorI32 = (v) => (v === true ? 1 : v === false ? 0 : Math.round(v));
    // A string selector compares on the host: equal to a value, or min ≤ selector < max in a range.
    const compareSelectorTo = (text) => [ins("local.get", sel), ins("i32.const", cadena(text)), ins("call", importIndex(s.config?.caseInsensitive ? "cmp_ci" : "cmp"))];
    const stringCondition = (v) => {
      if (typeof v === "string") return [...compareSelectorTo(v), ins("i32.eqz")];
      const bounds = [];
      if (typeof v.min === "string") bounds.push([...compareSelectorTo(v.min), ins("i32.const", 0), ins("i32.ge_s")]);
      if (typeof v.max === "string") bounds.push([...compareSelectorTo(v.max), ins("i32.const", 0), ins("i32.lt_s")]);
      return bounds.length === 2 ? [...bounds.flat(), ins("i32.and")] : bounds.length ? bounds[0] : [ins("i32.const", 1)];
    };
    // An enum value is an item name: it selects by the item's index. A stale name (already
    // reported above) selects nothing.
    const enumIndex = (name) => (name === undefined ? null : enumSelector.enum.indexOf(name));
    const enumCondition = (v) => {
      if (typeof v === "string") {
        const i = enumIndex(v);
        return i >= 0 ? [ins("local.get", sel), ins("i32.const", i), ins("i32.eq")] : [];
      }
      if (v && typeof v === "object") {
        const lo = v.min === undefined ? null : enumIndex(v.min);
        const hi = v.max === undefined ? null : enumIndex(v.max);
        const partes = [];
        if (lo !== null && lo >= 0) partes.push([ins("local.get", sel), ins("i32.const", lo), ins("i32.ge_s")]);
        if (hi !== null && hi >= 0) partes.push([ins("local.get", sel), ins("i32.const", hi), ins("i32.le_s")]);
        return partes.length === 2 ? [...partes.flat(), ins("i32.and")] : partes.length ? partes[0] : [];
      }
      return [];
    };
    // An integer value or range over the code, held only when the status is T; No Error, only when it is F.
    const errorCondition = (v) => {
      if (v?.noError) return [ins("local.get", errorStatus), ins("i32.eqz")];
      const partes = [];
      if (v && typeof v === "object") {
        if (v.min !== undefined && v.min !== null) partes.push([ins("local.get", sel), ins("i32.const", v.min), ins("i32.ge_s")]);
        if (v.max !== undefined && v.max !== null) partes.push([ins("local.get", sel), ins("i32.const", v.max), ins("i32.le_s")]);
      } else partes.push([ins("local.get", sel), ins("i32.const", valorI32(v)), ins("i32.eq")]);
      partes.push([ins("local.get", errorStatus), ins("i32.const", 0), ins("i32.ne")]);
      return [...partes.flat(), ...partes.slice(1).map(() => ins("i32.and"))];
    };
    const condicion = (valores) => {
      // Each value leaves one boolean on the stack, joined with or; a value that matches
      // nothing (a stale enum name) contributes none.
      const trozos = valores
        .map((v) => {
          if (stringSelector) return stringCondition(v);
          if (enumSelector) return enumCondition(v);
          if (errorSelector) return errorCondition(v);
          if (v && typeof v === "object") {
            const partes = [];
            if (v.min !== undefined && v.min !== null) partes.push([ins("local.get", sel), ins("i32.const", v.min), ins("i32.ge_s")]);
            if (v.max !== undefined && v.max !== null) partes.push([ins("local.get", sel), ins("i32.const", v.max), ins("i32.le_s")]);
            return [...partes.flat(), ...(partes.length === 2 ? [ins("i32.and")] : partes.length ? [] : [ins("i32.const", 1)])];
          }
          return [ins("local.get", sel), ins("i32.const", valorI32(v)), ins("i32.eq")];
        })
        .filter((trozo) => trozo.length);
      const r = trozos.flatMap((trozo, j) => (j ? [...trozo, ins("i32.or")] : trozo));
      return r.length ? r : [ins("i32.const", 0)];
    };
    const conValores = marcos.map((m, i) => ({ m, i })).filter(({ m }) => m.valores?.length);
    const porDefecto = marcos.findIndex((m) => m.default);
    // if (marco 0) … else if (marco 1) … else (Default)
    for (const { m, i } of conValores) {
      // Un marco con valores que además es el Default: sus valores van al Default.
      if (i === porDefecto) continue;
      c.push(...condicion(m.valores), ins("if"));
      marco(i);
      c.push(ins("else"));
    }
    if (porDefecto >= 0) marco(porDefecto);
    for (const { i } of conValores) if (i !== porDefecto) c.push(ins("end"));
    c.push(...frameHook(sid, "end"));
    for (const t of salidas) {
      dejar(k, t.id, "y", t.l, wasmTypeOf(t.x.tOut(0)));
      c.push(...borderHook(t.id, "y", t.l, k));
    }
  }

  /**
   * El cuerpo de una estructura (o de un marco). Con menos de dos nodos largos,
   * en línea y en orden. Con más, como LabVIEW los corre a la vez —dos Wait en
   * el mismo bucle se solapan—, se parte en clumps (un subplan): cada uno es una
   * función, y la estructura llama a `correr_plan`, que los corre por flujo de
   * datos y espera a todos (DT-041).
   */
  function emitirCuerpo(cuerpo, sid, k) {
    const rep = (id) => representante(id, sid);
    const { lista, cadenas } = conMarcos(cuerpo);
    const orden = ordenArriba(g, lista, rep, cadenas);
    if (orden.filter(esLargo).length < 2) {
      for (const id of orden) emitirEn(id, k);
      return;
    }
    const { clumpDe: deSub, clumps: sub } = partir(g, orden, rep, esLargo, cadenas);
    const p = planes.push(sub) - 1;
    for (const id of orden) emitirEn(id, sub[deSub.get(id)]);
    k.cuerpo.push(ins("i32.const", p), callScheduler("run_plan"), ins("drop"));
  }

  /**
   * Un marco de una Flat Sequence: los túneles de entrada que lee primero, su
   * cuerpo y los túneles de salida que alimenta, que dan su valor al acabar el
   * marco. Lo que pasa de un marco a otro, si van en clumps distintos, viaja por
   * una celda del data space (DT-041, DT-063 §1).
   */
  function emitirMarcoFlat(seq, m, k) {
    const deAqui = ids.filter((id) => porId.get(id).dentro === seq);
    const c = k.cuerpo;
    const lastFrame = m === porId.get(seq).config.marcos.length - 1;
    c.push(...frameHook(seq, m === 0 ? "start" : "between"));
    for (const id of deAqui.filter((x) => porId.get(x).tipo === "tunnel-in" && marcoEnFlat(porId.get(x), seq) === m)) {
      const x = contexto(id, k);
      const vt = wasmTypeOf(x.tOut(0));
      const l = k.locales.push(vt) - 1;
      c.push(...x.entrada(0), ins("local.set", l), ...borderHook(id, "y", l, k));
      valor.set(`${id}.y`, { local: l, clump: k });
    }
    emitirCuerpo(deAqui.filter((id) => porId.get(id).marco === m), seq, k);
    c.push(...frameHook(seq, lastFrame ? "last-frame-end" : "frame-end", m));
    for (const id of deAqui.filter((x) => porId.get(x).tipo === "tunnel-out" && marcoEnFlat(porId.get(x), seq) === m)) {
      const x = contexto(id, k);
      const vt = wasmTypeOf(x.tOut(0));
      const l = k.locales.push(vt) - 1;
      c.push(...x.entrada(0), ins("local.set", l));
      dejar(k, id, "y", l, vt);
      c.push(...borderHook(id, "y", l, k));
    }
  }

  /**
   * Una Stacked Sequence, en línea: los túneles de entrada se leen una vez;
   * cada marco corre entero, en orden, y sus datos llegan a los marcos de
   * después como locales; los túneles de salida dan su valor cuando acaba el
   * último marco, porque la secuencia es un nodo (de la ayuda de NI: es lo que
   * la distingue de la Flat).
   */
  function emitirSecuencia(sid, k) {
    const s = porId.get(sid);
    const deAqui = ids.filter((id) => porId.get(id).dentro === sid);
    const c = k.cuerpo;
    for (const id of deAqui.filter((x) => porId.get(x).tipo === "tunnel-in")) {
      const x = contexto(id, k);
      const l = k.locales.push(wasmTypeOf(x.tOut(0))) - 1;
      c.push(...x.entrada(0), ins("local.set", l), ...borderHook(id, "y", l, k));
      valor.set(`${id}.y`, { local: l, clump: k });
    }
    (s.config?.marcos ?? []).forEach((_, m) => emitirCuerpo(deAqui.filter((id) => porId.get(id).marco === m), sid, k));
    for (const id of deAqui.filter((x) => porId.get(x).tipo === "tunnel-out")) {
      const x = contexto(id, k);
      const vt = wasmTypeOf(x.tOut(0));
      const l = k.locales.push(vt) - 1;
      c.push(...x.entrada(0), ins("local.set", l));
      dejar(k, id, "y", l, vt);
      c.push(...borderHook(id, "y", l, k));
    }
  }

  const emitirEn = (id, k) => {
    const m = deMarco(id);
    if (m) return emitirMarcoFlat(m[0], Number(m[1]), k);
    const tipo = porId.get(id).tipo;
    if (tipo === "case-structure") return emitirCase(id, k);
    if (tipo === "flat-sequence" || tipo === "stacked-sequence") return emitirSecuencia(id, k);
    return esEstructura(id) ? emitirEstructura(id, k) : emitirNodo(id, k);
  };
  for (const id of arriba) emitirEn(id, clumps[clumpRaiz.get(id)]);
  if (errores.length) return { errores };
  return { clumps, controles, indicadores };
}

/**
 * What a Run needs of a compiled VI, to send it to a worker: everything but the module's tree.
 * Only the tree is left out, so a field the runtime reads is never lost on the way (the call
 * chain of an error source was, once; the parked frames must go too, DT-063 §8).
 */
export const runnableOVI = ({ modulo: _moduleTree, ...runnable }) => runnable;

/** The module with the top-level VI `vi`, its subVIs, the memory functions and the scheduler, ready to instantiate. */
function assemble(module, vi) {
  const { clumps, controles, indicadores } = vi;
  const { globales, constantes, datosFijos, planes, automaticos, directFunctions } = module;

  const tiposF = [];
  const tipo = (params, results) => {
    const clave = JSON.stringify([params, results]);
    let i = tiposF.findIndex((t) => JSON.stringify([t.params, t.results]) === clave);
    if (i < 0) i = tiposF.push({ params, results }) - 1;
    return i;
  };
  if (tipo([], []) !== CLUMP_TYPE) throw new Error("The type of a clump must be the module's first.");
  if (globales.length) throw new Error("The globals of a module are only its threads'.");
  globales.push(...Object.keys(THREAD_GLOBALS).map(() => "i32"));
  // Every clump that may park saves its state and returns instead (DT-063 §8): its frame is in the
  // data space, so it is reserved before the static zone is placed behind it.
  const bodies = [...directFunctions, ...clumps, ...planes.flat()].map((k) => ({ params: [], results: [], locales: k.locales, cuerpo: k.cuerpo }));
  const allFunctions = [...RUNTIME_FUNCTIONS, ...bodies];
  const { functions: stackless, frames } = makeStackless(allFunctions, {
    importCount: HOST_IMPORTS.length,
    parkPrimitives: PARK_PRIMITIVES,
    typeOfCall: (index) => (index < HOST_IMPORTS.length ? HOST_IMPORTS[index] : allFunctions[index - HOST_IMPORTS.length]),
    allocateFrame: (bytes) => module.bufer(bytes, 8),
    parkingGlobal: THREAD_GLOBALS.parking,
    resumeValueGlobal: THREAD_GLOBALS.resumeValue,
    debugFlagAddress: module.debugFlag,
  });
  // The scheduler's tables (DT-063 §9): every clump by id —the top-level VI's, then each plan's— with
  // its group and the clumps it waits for; group 0 is the top-level VI, group p + 1 is plan p.
  const groups = [clumps, ...planes];
  let firstOfGroup = 0;
  const schedulerGroups = groups.map((members) => {
    const group = { first: firstOfGroup, count: members.length };
    firstOfGroup += members.length;
    return group;
  });
  const schedulerClumps = groups.flatMap((members, group) => members.map((k) => ({ group, deps: [...k.deps].map((index) => schedulerGroups[group].first + index) })));
  const schedulerTables = schedulerData({ clumps: schedulerClumps, groups: schedulerGroups, reserve: (bytes) => module.bufer(bytes, 8) });
  // La zona estática, detrás del data space; el montón, detrás (alineado a 8).
  const datos = [];
  let libre = CELDAS + ((module.space + 7) & ~7);
  for (const { celda, bytes } of constantes) {
    datos.push({ desde: libre, bytes }, { desde: celda, bytes: i32(libre) });
    libre = (libre + bytes.length + 3) & ~3;
  }
  datos.push(...datosFijos, ...schedulerTables);
  const heapStart = (libre + 7) & ~7;
  datos.push({ desde: CIMA, bytes: i32(heapStart) });
  const firstClumpFunction = FIRST_COMPILED_FUNCTION + directFunctions.length;
  // The memory is the host's, shared by every thread of the Run, so the data is passive and this
  // function writes it, once per Run, before any clump (DT-063 §1).
  const initialize = {
    params: [],
    results: [],
    locales: [],
    cuerpo: datos.flatMap(({ desde, bytes }, segment) => [ins("i32.const", desde), ins("i32.const", 0), ins("i32.const", bytes.length), ins("memory.init", segment)]),
  };
  const modulo = {
    tipos: tiposF,
    importaciones: HOST_IMPORTS.map((im) => ({ modulo: im.modulo, nombre: im.nombre, tipo: tipo(im.params, im.results) })),
    funciones: [...stackless, initialize].map((f) => ({ tipo: tipo(f.params, f.results), locales: f.locales, cuerpo: f.cuerpo })),
    globales,
    globalesExportadas: [{ nombre: "parking", global: THREAD_GLOBALS.parking }, { nombre: "resumeValue", global: THREAD_GLOBALS.resumeValue }],
    // call_indirect reaches clump `id` at position `id`.
    tabla: schedulerClumps.map((_, id) => firstClumpFunction + id),
    memoria: { paginas: pagesFor(heapStart), maximo: MAXIMUM_PAGES, compartida: true, importada: SHARED_MEMORY_IMPORT },
    datos,
    datosPasivos: true,
    exportaciones: [
      { nombre: "initialize", funcion: HOST_IMPORTS.length + stackless.length },
      ...[...EXPORTADAS, ...SCHEDULER_EXPORTS].map((nombre) => ({ nombre, funcion: runtimeFunctionIndex(nombre) })),
      ...[...clumps.map((_, i) => `c${i}`), ...planes.flatMap((sub, p) => sub.map((_, i) => `p${p}c${i}`))].map((nombre, i) => ({ nombre, funcion: firstClumpFunction + i })),
    ],
  };
  const plan = (lista) => lista.map((k) => ({ deps: [...k.deps], largo: k.largo }));
  return { bytes: codificar(modulo), memoryPages: modulo.memoria.paginas, modulo, controles, indicadores, clumps: plan(clumps), planes: planes.map(plan), automaticos, disposicionError: fullClusterLayout(ERROR), disposicionVisa: fullClusterLayout(VISA_RESOURCE_LAYOUT), usesInstrumentIo: !!module.usesInstrumentIo, debugFlag: module.debugFlag, debugNodes: module.debugNodes, callChain: module.callChain, propertyNodes: module.propertyNodes, callLibraries: module.callLibraries, controlReferences: module.controlReferences, frames };
}
