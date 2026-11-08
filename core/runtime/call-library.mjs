// The Call Library Function Node inside a Run (DT-080): an external wait, like VISA's. Its clump parks, the
// coordinator turns the parameters' values into the bytes C expects, asks the I/O to call the library
// (native/solder-io-node, `callLibrary`), writes back what the function returned and wrote into its buffers, and
// answers.
//
// The compiler lays out one record per parameter after the return value's, as a Property Node's rows
// (compiler.mjs, FORMAT_ROW_BYTES): a number in the value word, a string's or an array's handle in the value
// word and the cell its output goes to in the bits word.
//
// Measured (labview-captures/reports/2026-11-06-clfn-run.md): a path wired on the diagram that names no library
// is 7, a file that is not one 12, a library without the function 15, all with the source "Call Library
// Function Node in <OVI>" and a return value of 0; an empty path calls nothing and gives no error.

import { NOT_A_PATH, PATH_KIND, isEmptyPath, isNotAPath, pathToText } from "../model/paths.mjs";

/** The record of one value, as the compiler lays it out (compiler.mjs, FORMAT_ROW_BYTES). */
const RECORD_BYTES = 16;
const RECORD_CELL_OFFSET = 4;
const RECORD_VALUE_OFFSET = 8;

/** What the import answers its clump with: the work is in the outputs it wrote. */
const ANSWERED = 0;

/**
 * LabVIEW's code for a fault inside the library's code (measured on strlen(NULL)). In Solder the library runs in the
 * I/O process, so a fault ends that process instead of Solder, and the call answers this (DT-080 §2).
 */
export const EXTERNAL_CODE_EXCEPTION = 1097;

/** The name an error's source gives the node (measured). */
const NODE_NAME = "Call Library Function Node";

/** How each data type is read from and written to C's bytes. */
const DATA_TYPE_ACCESS = {
  i8: { size: 1, get: "getInt8", set: "setInt8" },
  i16: { size: 2, get: "getInt16", set: "setInt16" },
  i32: { size: 4, get: "getInt32", set: "setInt32" },
  i64: { size: 8, get: "getBigInt64", set: "setBigInt64", big: true },
  iptr: { size: 8, get: "getBigInt64", set: "setBigInt64", big: true },
  u8: { size: 1, get: "getUint8", set: "setUint8" },
  u16: { size: 2, get: "getUint16", set: "setUint16" },
  u32: { size: 4, get: "getUint32", set: "setUint32" },
  u64: { size: 8, get: "getBigUint64", set: "setBigUint64", big: true },
  uptr: { size: 8, get: "getBigUint64", set: "setBigUint64", big: true },
  sgl: { size: 4, get: "getFloat32", set: "setFloat32", float: true },
  dbl: { size: 8, get: "getFloat64", set: "setFloat64", float: true },
};

/** The C bytes of `values`, each of `dataType`. */
function bytesOf(values, dataType) {
  const access = DATA_TYPE_ACCESS[dataType];
  const bytes = new Uint8Array(values.length * access.size);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view[access.set](index * access.size, access.big ? BigInt.asIntN(64, BigInt(value)) : Number(value), true));
  return bytes;
}

/** The values of `dataType` in C's `bytes`; a 64-bit integer as a BigInt. */
function valuesOf(bytes, dataType) {
  const access = DATA_TYPE_ACCESS[dataType];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: Math.floor(bytes.byteLength / access.size) }, (_, index) => view[access.get](index * access.size, true));
}

/** The text of a C string: the bytes up to its first zero. */
const untilZero = (bytes) => {
  const end = bytes.indexOf(0);
  return end < 0 ? bytes : bytes.subarray(0, end);
};

/**
 * A string's handle block (DT-088), as LabVIEW's `LStr` is: its length as a 32-bit integer, then its bytes. A library
 * that fills the string resizes the block and changes the length.
 */
export function stringBlock(text) {
  const block = new Uint8Array(4 + text.length);
  new DataView(block.buffer).setInt32(0, text.length, true);
  block.set(text, 4);
  return block;
}

/**
 * The text a string's block holds after a call: the bytes its length says, and no more than the block has, since a
 * library may leave a length that its block does not back; a negative length is none.
 */
export function textOfStringBlock(block) {
  if (block.length < 4) return new Uint8Array(0);
  const declared = new DataView(block.buffer, block.byteOffset, block.byteLength).getInt32(0, true);
  return block.subarray(4, 4 + Math.max(0, Math.min(declared, block.length - 4)));
}

/** The bytes of one dimension size in an array's block: LabVIEW's `int32`. */
const DIMENSION_SIZE_BYTES = 4;

/**
 * Where an array's elements start in its block: after its dimension sizes, padded to the elements' alignment, which on a
 * 64-bit system is their size, since `extcode.h` packs to one byte only on 32-bit Windows (read on 2026-11-08,
 * `labview-captures/reports/2026-11-08-labview-memory-manager-imports.md`).
 */
function elementsOffset(dimensionCount, dataType) {
  const alignment = DATA_TYPE_ACCESS[dataType].size;
  return Math.ceil((DIMENSION_SIZE_BYTES * dimensionCount) / alignment) * alignment;
}

/**
 * An array's handle block: its dimension sizes, each a 32-bit integer, then, where their alignment puts them, its
 * elements in C's bytes, row by row.
 */
export function arrayBlock(dimensions, values, dataType) {
  const elements = bytesOf(values, dataType);
  const headerBytes = elementsOffset(dimensions.length, dataType);
  const block = new Uint8Array(headerBytes + elements.length);
  const view = new DataView(block.buffer);
  dimensions.forEach((size, index) => view.setInt32(DIMENSION_SIZE_BYTES * index, size, true));
  block.set(elements, headerBytes);
  return block;
}

/**
 * The dimension sizes and the values an array's block holds after a call. Elements that the block does not back are
 * left out: the first dimension shrinks to the rows there are, as a library that resized the block smaller leaves it.
 */
export function arrayOfBlock(block, dataType, dimensionCount) {
  const headerBytes = elementsOffset(dimensionCount, dataType);
  if (block.length < headerBytes) return { dimensions: Array(dimensionCount).fill(0), values: [] };
  const view = new DataView(block.buffer, block.byteOffset, block.byteLength);
  const dimensions = Array.from({ length: dimensionCount }, (_, index) => Math.max(0, view.getInt32(DIMENSION_SIZE_BYTES * index, true)));
  const elementSize = DATA_TYPE_ACCESS[dataType].size;
  const available = Math.floor((block.length - headerBytes) / elementSize);
  const rowSize = dimensions.slice(1).reduce((product, size) => product * size, 1);
  const rows = rowSize > 0 ? Math.min(dimensions[0], Math.floor(available / rowSize)) : 0;
  const count = rows * rowSize;
  return { dimensions: [rows, ...dimensions.slice(1)], values: valuesOf(block.subarray(headerBytes, headerBytes + count * elementSize), dataType) };
}

/** The dimension sizes of a nested array: the length at each level, zero where there is nothing to measure. */
export function dimensionsOf(nested, dimensionCount) {
  const sizes = [];
  let level = nested;
  for (let index = 0; index < dimensionCount; index++) {
    sizes.push(Array.isArray(level) ? level.length : 0);
    level = Array.isArray(level) && level.length ? level[0] : [];
  }
  return sizes;
}

/** A flat list nested again by dimension sizes, row by row. */
export function nestByDimensions(flat, dimensions) {
  if (dimensions.length <= 1) return flat;
  const rowSize = dimensions.slice(1).reduce((product, size) => product * size, 1);
  return Array.from({ length: dimensions[0] }, (_, row) => nestByDimensions(flat.slice(row * rowSize, (row + 1) * rowSize), dimensions.slice(1)));
}

/** A flat list of elements laid out again in the sizes of a nested array (rows of a 2D array). */
function nestLike(elements, shape) {
  if (!Array.isArray(shape[0])) return elements;
  let offset = 0;
  return shape.map((row) => {
    const rowLength = row.flat(Infinity).length;
    const nested = nestLike(elements.slice(offset, offset + rowLength), row);
    offset += rowLength;
    return nested;
  });
}

/**
 * The node's import, `call_library(index, records, path, errorIn, errorOut, chainIndex) → ANSWERED | Promise`.
 * `compilado.callLibraries[index]` describes the node; `host` is the Run's createHostFunctions over `memory`;
 * `pathRules` turns a path wired on the diagram into the system's name. Without `io` the Run fails.
 */
export function createCallLibraryFunction({ io, host, memory, compilado, pathRules }) {
  const { leerCluster, ponerCluster, putBytes, readBytes, leerArray, ponerArray, readPath, functionSource } = host;
  const errorLayout = compilado.disposicionError;
  const view = () => new DataView(memory.buffer);
  const recordAt = (records, slot) => records + slot * RECORD_BYTES;
  const handleIn = (record) => view().getInt32(record + RECORD_VALUE_OFFSET, true);
  const cellOut = (record) => view().getInt32(record + RECORD_CELL_OFFSET, true);
  const requireIo = () => {
    if (!io) throw new Error("Instrument I/O is not available in this Run.");
    return io;
  };

  /** A number's value as the compiler wrote it: a float in an f64, an integer in an i64. */
  const readNumber = (record, dataType) =>
    DATA_TYPE_ACCESS[dataType].float ? view().getFloat64(record + RECORD_VALUE_OFFSET, true) : view().getBigInt64(record + RECORD_VALUE_OFFSET, true);
  const writeNumber = (record, dataType, value) => {
    if (DATA_TYPE_ACCESS[dataType].float) view().setFloat64(record + RECORD_VALUE_OFFSET, Number(value), true);
    else view().setBigInt64(record + RECORD_VALUE_OFFSET, BigInt.asIntN(64, BigInt(value)), true);
  };

  /** Each parameter as the I/O takes it: `{ kind, bytes }`, a number by value or a buffer by its address. */
  const argumentsOf = (node, records) =>
    node.parameters.map((parameter, index) => {
      const record = recordAt(records, index + 1);
      if (parameter.type === "numeric") {
        const bytes = bytesOf([readNumber(record, parameter.dataType)], parameter.dataType);
        return { kind: parameter.pass === "pointer" ? "buffer" : parameter.dataType, bytes };
      }
      if (parameter.type === "string" && parameter.format === "string-handle") {
        return { kind: "handle", bytes: stringBlock(readBytes(handleIn(record))) };
      }
      if (parameter.type === "string") {
        const text = readBytes(handleIn(record));
        const minimumSize = parameter.minimumSize >= 0 ? Number(readNumber(recordAt(records, parameter.minimumSize + 1), node.parameters[parameter.minimumSize].dataType)) : 0;
        const bytes = new Uint8Array(Math.max(text.length + 1, minimumSize));
        bytes.set(text);
        return { kind: "buffer", bytes };
      }
      const nested = leerArray(handleIn(record), parameter.array.elemento, parameter.array.dims);
      if (parameter.format === "array-handle") {
        return { kind: "handle", bytes: arrayBlock(dimensionsOf(nested, parameter.array.dims), nested.flat(Infinity), parameter.dataType) };
      }
      return { kind: "buffer", bytes: bytesOf(nested.flat(Infinity), parameter.dataType) };
    });

  /** Writes what the call gave back: the return value, and what the function wrote into each buffer. */
  const writeOutputs = (node, records, answer) => {
    const returnRecord = recordAt(records, 0);
    if (node.returnKind === "cstring") putBytes(cellOut(returnRecord), answer.returned);
    else if (node.returnKind !== "void") writeNumber(returnRecord, node.returnKind, valuesOf(answer.returned, node.returnKind)[0]);
    node.parameters.forEach((parameter, index) => {
      const record = recordAt(records, index + 1);
      const bytes = answer.arguments[index];
      if (parameter.type === "numeric") {
        if (parameter.pass === "pointer") writeNumber(record, parameter.dataType, valuesOf(bytes, parameter.dataType)[0]);
      } else if (parameter.type === "string") putBytes(cellOut(record), parameter.format === "string-handle" ? textOfStringBlock(bytes) : untilZero(bytes));
      else if (parameter.format === "array-handle") {
        // The library may have resized the array: its dimensions are read from the block, not from what went in.
        const { dimensions, values } = arrayOfBlock(bytes, parameter.dataType, parameter.array.dims);
        ponerArray(cellOut(record), parameter.array.elemento, nestByDimensions(values, dimensions), parameter.array.dims);
      } else {
        const shape = leerArray(handleIn(record), parameter.array.elemento, parameter.array.dims);
        ponerArray(cellOut(record), parameter.array.elemento, nestLike(valuesOf(bytes, parameter.dataType), shape), parameter.array.dims);
      }
    });
  };

  /** The outputs when no call is made: the return value 0, and each buffer's output what came in. */
  const writeUntouched = (node, records) => {
    const returnRecord = recordAt(records, 0);
    if (node.returnKind === "cstring") putBytes(cellOut(returnRecord), new Uint8Array(0));
    else if (node.returnKind !== "void") writeNumber(returnRecord, node.returnKind, 0);
    node.parameters.forEach((parameter, index) => {
      const record = recordAt(records, index + 1);
      if (parameter.type === "string") putBytes(cellOut(record), readBytes(handleIn(record)));
      else if (parameter.type === "array") ponerArray(cellOut(record), parameter.array.elemento, leerArray(handleIn(record), parameter.array.elemento, parameter.array.dims), parameter.array.dims);
    });
  };

  /** The library to call: the dialog's, or the path wired on the diagram; null for an empty path, which calls nothing. */
  const libraryOf = (node, pathHandle) => {
    if (!node.specifyPathOnDiagram) return node.library;
    const path = readPath(pathHandle);
    if (isEmptyPath(path)) return null;
    if (isNotAPath(path) || path.kind === PATH_KIND.RELATIVE) return pathToText(NOT_A_PATH, pathRules);
    return pathToText(path, pathRules);
  };

  return {
    call_library: (index, records, pathHandle, errorIn, errorOut, chainIndex) => {
      const node = compilado.callLibraries[index];
      const incoming = leerCluster(errorIn, errorLayout);
      // With an error in, nothing is called and the error passes (unverified in LabVIEW).
      if (incoming.status) {
        writeUntouched(node, records);
        ponerCluster(errorOut, errorLayout, incoming);
        return ANSWERED;
      }
      const library = libraryOf(node, pathHandle);
      if (library === null) {
        writeUntouched(node, records);
        ponerCluster(errorOut, errorLayout, incoming);
        return ANSWERED;
      }
      const request = { library, function: node.function, returnKind: node.returnKind, arguments: argumentsOf(node, records), uiThread: node.uiThread };
      const failWith = (code) => {
        writeUntouched(node, records);
        ponerCluster(errorOut, errorLayout, { status: true, code, source: functionSource(NODE_NAME, chainIndex) });
        return ANSWERED;
      };
      return Promise.resolve(requireIo().callLibrary(request)).then(
        (answer) => {
          if (answer.status) return failWith(answer.status);
          writeOutputs(node, records, answer);
          ponerCluster(errorOut, errorLayout, incoming);
          return ANSWERED;
        },
        // The I/O process ended during the call: the library's code faulted.
        () => failWith(EXTERNAL_CODE_EXCEPTION),
      );
    },
  };
}

/** The name of the node's import, the one a pool thread hands to the coordinator. */
export const CALL_LIBRARY_FUNCTION_NAMES = ["call_library"];
