// The table from each node kind of the catalog to the function that emits it (DT-089). The emitters of whole families
// live in nodes/; the short ones are still written here inline.

import { CONSTANTES_MATEMATICAS } from "../model/math-constants.mjs";
import { DAQ_TASK_LAYOUT, isDaqTask } from "../model/daq-name.mjs";
import { OVI_CLASS, refnumOfClass } from "../model/ovi-server-reference.mjs";
import { importIndex } from "./host-imports.mjs";
import { callMemory, callScheduler } from "./runtime-functions.mjs";
import { arrayElement, copyValue, copyValueTo, isByReference, loadElement, storeElement } from "./memory-ops.mjs";
import { ERROR_FIELDS, constantOf, readClusterFields } from "./constants.mjs";
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
import { readControl } from "./panel-io.mjs";
import { joinNumbers, logicalShift, mantissaAndExponent, rotate, rotateWithCarry, splitNumber, swapBytes, swapWords } from "./nodes/data-manipulation.mjs";
import { EMPTY_PATH, NOT_A_PATH, PATH_KIND, encodePath } from "../model/paths.mjs";
import { ERROR, FILE_REFNUM, PATH, VISA_RESOURCE_LAYOUT, dimensionsOf, esArray, esCluster, esRefnum, limites, representacion } from "../model/types.mjs";
import { i32Const, ins, localGet } from "./instructions.mjs";
import { clusterLayout, convertValue, isFloat, isSigned, narrowInteger, wasmTypeOf } from "./wasm-types.mjs";
import { i32 } from "./linear-memory.mjs";

/**
 * What each node kind emits. Each emitter receives the node's emitting context `e`: `e.entrada(i)` leaves input i on
 * the stack, already in its terminal's type; `e.tIn(i)` and `e.tOut(j)` are those types; `e.temporal(wasmType)`
 * reserves a local; `e.nodo` is the node. It returns the instructions that leave its outputs on the stack, in order.
 */
export const NODE_EMITTERS = {
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
