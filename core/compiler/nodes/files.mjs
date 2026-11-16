// Programming ▸ File I/O (DT-067, DT-069): the file functions, which wait for the disk, served by the same I/O as VISA
// (core/runtime/file-io.mjs), and the spreadsheet functions on strings (DT-067 §9). Each file function's outputs get
// places of their own, which the host writes while the clump is parked.

import { ERROR, NUMERICOS, PATH, dimensionsOf, representacion } from "../../model/types.mjs";
import { importIndex } from "../host-imports.mjs";
import { i32Const, ins } from "../instructions.mjs";
import { clusterLayout } from "../wasm-types.mjs";

/** The element types the spreadsheet functions take, numbered as the host reads them (DT-067 §9). */
export const SPREADSHEET_ELEMENTS = Object.freeze(["number", "sgl", "i8", "i16", "i32", "i64", "u8", "u16", "u32", "u64", "string"]);

/** A spreadsheet function's call: the result's cell, its three inputs by index, the element type and dimensions of `arrayType`. */
export function spreadsheetCall(node, importName, inputs, arrayType) {
  const cell = node.celda();
  const element = SPREADSHEET_ELEMENTS.indexOf(representacion(arrayType.array) ?? arrayType.array);
  const delimiter = node.cableada(inputs[2]) ? node.entrada(inputs[2]) : [ins("i32.const", node.cadena(""))];
  return [i32Const(cell), ...node.entrada(inputs[0]), ...node.entrada(inputs[1]), ...delimiter, i32Const(element), i32Const(dimensionsOf(arrayType)), ins("call", importIndex(importName)), i32Const(cell)];
}

/** The bytes of each kind of place a file function's output takes, for those the host writes by address. */
const FILE_OUTPUT_BYTES = { refnum: 4, boolean: 4, i32: 4, size: 8 };

/**
 * A file function (DT-067 §7): `inputs` is the code that leaves the host's arguments up to the error in,
 * and `outputs` the kinds of its outputs in the catalog's order ("refnum", "boolean", "size", "cell" for a
 * string, path or array, and "error"). Each output gets a place of its own, the host writes them while the
 * clump is parked, and they are left on the stack in that order.
 */
export function fileFunction(node, importName, inputs, outputs) {
  const places = outputs.map((kind) => (kind === "cell" ? node.celda() : kind === "error" ? node.bufer(clusterLayout(ERROR).tam) : node.bufer(FILE_OUTPUT_BYTES[kind])));
  const load = (kind, place) => {
    if (kind === "refnum" || kind === "boolean" || kind === "i32") return [i32Const(place), ins("i32.load")];
    if (kind === "size") return [i32Const(place), ins("i64.load")];
    return [i32Const(place)];
  };
  return [
    ...inputs, ...node.entrada(node.cat.puertos(node.nodo).in.findIndex((port) => port.name === "error-in")),
    ...places.map(i32Const), i32Const(node.chainIndex), ins("call", importIndex(importName)), ins("drop"),
    ...outputs.flatMap((kind, index) => load(kind, places[index])),
  ];
}

/** How Read from Text File reads: bytes, lines with Read Lines and count wired, or the next line with count unwired (measured). */
export const READ_MODE = Object.freeze({ BYTES: 0, LINES: 1, NEXT_LINE: 2 });
export const readMode = (node) => (!node.nodo.config?.["read-lines"] ? READ_MODE.BYTES : node.cableada(2) ? READ_MODE.LINES : READ_MODE.NEXT_LINE);

/** An input that may be left unwired with no value to pass: its handle (0 unwired) and whether it is wired. */
export const optionalHandle = (node, index) => (node.cableada(index) ? [...node.entrada(index), i32Const(1)] : [i32Const(0), i32Const(0)]);

/** The SPREADSHEET_ELEMENTS number of an array input's element; DBL when it is unwired. */
export const spreadsheetElementOfInput = (node, index) => SPREADSHEET_ELEMENTS.indexOf(node.cableada(index) ? representacion(node.tIn(index).array) ?? node.tIn(index).array : DBL_ELEMENT);
const DBL_ELEMENT = "number";

/**
 * Write Delimited Spreadsheet's unwired format, by its instance (measured): %.3f for reals, though the label says
 * "%d"; %d for integers; %s for strings.
 */
export function delimitedWriteFormat(node, dataIndex) {
  if (node.cableada(1)) return node.entrada(1);
  const element = SPREADSHEET_ELEMENTS[spreadsheetElementOfInput(node, dataIndex)];
  return [i32Const(node.cadena(element === "string" ? "%s" : NUMERICOS[element].entero ? "%d" : "%.3f"))];
}

/** A file function's `file` input: the refnum or path handle (0 unwired), whether it is a path, and whether it is wired (unwired asks for a dialog). */
export function fileInput(node, index) {
  const wired = node.cableada(index);
  return [...(wired ? node.entrada(index) : [i32Const(0)]), i32Const(node.logicalTIn(index) === PATH ? 1 : 0), i32Const(wired ? 1 : 0)];
}

/** How File Dialog's configuration travels to its import: each setting by its index here. */
export const FILE_DIALOG_CODES = Object.freeze({ selection: ["file", "folder", "file-or-folder"], existence: ["existing", "new", "new-or-existing"] });
