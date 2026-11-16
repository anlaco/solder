// Programming ▸ Array: Array Size of several dimensions, Build Array and Initialize Array that give a 2D array, Index
// Array on a 2D array (DT-044), the reductions over a 1D array's elements, and the 1D functions the host runs in
// JavaScript over the same memory.
//
// Each emitter takes the node's emitting context (`node`, compile-ovi's `e`) and returns its instructions.

import { dimensionsOf, esArray } from "../../model/types.mjs";
import { constantOf } from "../constants.mjs";
import { importIndex } from "../host-imports.mjs";
import { ins } from "../instructions.mjs";
import { MAX_COMPILED_DIMENSIONS, NULL_HANDLE, SECOND_SIZE_OFFSET, arrayElement, copyElement, copyRow, copyValueTo, dimensionSize, loadElement, reserveArray, storeElement } from "../memory-ops.mjs";
import { callMemory } from "../runtime-functions.mjs";
import { narrowInteger, wasmTypeOf } from "../wasm-types.mjs";

/** Array Size of an array of several dimensions: a 1D array of I32 with the size of each one, rows first. */
export function arraySizes(node) {
  const dims = dimensionsOf(node.tIn(0));
  const [handle, data, size] = [node.temporal("i32"), node.temporal("i32"), node.temporal("i32")];
  const cell = node.celda();
  const code = [...node.entrada(0), ins("local.set", handle), ins("i32.const", dims), ins("local.set", size), ...reserveArray({ array: "i32" }, cell, [size], node.temporal), ins("local.set", data)];
  for (let dimension = 0; dimension < dims; dimension++) {
    code.push(ins("local.get", data), ...dimensionSize(handle, dimension, node.temporal), ins("i32.store", dimension * SECOND_SIZE_OFFSET));
  }
  return [...code, ins("i32.const", cell)];
}

/**
 * Build Array that gives a 2D array (DT-044, measured in LabVIEW 2026 Q3): each
 * 1D input is one row and each 2D input brings its rows. The array is as wide
 * as its longest row and the shorter ones are padded with the default value:
 * Build Array([1,2,3], [4,5]) gives [[1,2,3],[4,5,0]].
 */
export function buildArray2d(node) {
  const t = node.tOut(0);
  const element = arrayElement(t.array);
  const g = (local) => ins("local.get", local);
  const inputCount = node.cat.puertos(node.nodo).in.length;
  const [rows, columns, target, cell] = [node.temporal("i32"), node.temporal("i32"), node.temporal("i32"), node.celda()];
  const inputs = Array.from({ length: inputCount }, (_, i) => ({
    is2d: dimensionsOf(node.tIn(i)) === 2, handle: node.temporal("i32"), rows: node.temporal("i32"), columns: node.temporal("i32"), data: node.temporal("i32"),
  }));
  const code = [ins("i32.const", 0), ins("local.set", rows), ins("i32.const", 0), ins("local.set", columns)];
  inputs.forEach((input, i) => {
    code.push(...node.entrada(i), ins("local.set", input.handle), g(input.handle), callMemory("datos8"), ins("local.set", input.data));
    if (input.is2d) code.push(...dimensionSize(input.handle, 0, node.temporal), ins("local.set", input.rows), ...dimensionSize(input.handle, 1, node.temporal), ins("local.set", input.columns));
    else code.push(ins("i32.const", 1), ins("local.set", input.rows), g(input.handle), callMemory("longitud"), ins("local.set", input.columns));
    code.push(
      g(rows), g(input.rows), ins("i32.add"), ins("local.set", rows),
      g(input.columns), g(columns), g(input.columns), g(columns), ins("i32.gt_s"), ins("select"), ins("local.set", columns),
    );
  });
  code.push(...reserveArray(t, cell, [rows, columns], node.temporal), ins("local.set", target));
  const rowBytes = (count) => [g(count), ins("i32.const", element.tam), ins("i32.mul")];
  const defaultSource = element.ref ? (t.array === "string" ? NULL_HANDLE : node.bufer(element.tam)) : null;
  for (const input of inputs) {
    const [row, source] = [node.temporal("i32"), node.temporal("i32")];
    code.push(
      g(input.data), ins("local.set", source),
      ins("i32.const", 0), ins("local.set", row), ins("block"), ins("loop"), g(row), g(input.rows), ins("i32.ge_s"), ins("br_if", 1),
      ...copyRow(t.array, source, input.columns, target, columns, defaultSource, node.temporal),
      g(source), ...rowBytes(input.columns), ins("i32.add"), ins("local.set", source),
      g(target), ...rowBytes(columns), ins("i32.add"), ins("local.set", target),
      g(row), ins("i32.const", 1), ins("i32.add"), ins("local.set", row), ins("br", 0), ins("end"), ins("end"),
    );
  }
  return [...code, ins("i32.const", cell)];
}

/** Initialize Array with two dimensions: rows × columns copies of the element; a negative size counts as 0. */
export function initializeArrayNd(node) {
  const t = node.tOut(0);
  if (dimensionsOf(t) > MAX_COMPILED_DIMENSIONS) throw new Error("Initialize Array of more than 2 dimensions: not yet (DT-044).");
  const element = arrayElement(t.array);
  const g = (local) => ins("local.get", local);
  const [value, rows, columns, target, count, k] = [node.temporal(wasmTypeOf(t.array)), node.temporal("i32"), node.temporal("i32"), node.temporal("i32"), node.temporal("i32"), node.temporal("i32")];
  const cell = node.celda();
  const atLeastZero = (local) => [g(local), ins("i32.const", 0), g(local), ins("i32.const", 0), ins("i32.gt_s"), ins("select"), ins("local.set", local)];
  const place = [g(target), g(k), ins("i32.const", element.tam), ins("i32.mul"), ins("i32.add")];
  return [
    ...node.entrada(0), ins("local.set", value),
    ...node.entrada(1), ins("local.set", rows), ...atLeastZero(rows),
    ...node.entrada(2), ins("local.set", columns), ...atLeastZero(columns),
    ...reserveArray(t, cell, [rows, columns], node.temporal), ins("local.set", target),
    g(rows), g(columns), ins("i32.mul"), ins("local.set", count),
    ins("i32.const", 0), ins("local.set", k), ins("block"), ins("loop"), g(k), g(count), ins("i32.ge_s"), ins("br_if", 1),
    ...storeElement(t.array, place, [g(value)], node.temporal), g(k), ins("i32.const", 1), ins("i32.add"), ins("local.set", k), ins("br", 0), ins("end"), ins("end"),
    ins("i32.const", cell),
  ];
}


/**
 * Index Array on a 2D array (DT-044, measured in LabVIEW 2026 Q3): with row and
 * column, the element (out of range, the default value); with only the row, that
 * row; with only the column, that column (out of range, an empty array); with
 * neither, the whole array.
 */
export function indexArray2d(node) {
  const t = node.tIn(0);
  const element = arrayElement(t.array);
  const [rowWired, columnWired] = [node.cableada(1), node.cableada(2)];
  const g = (local) => ins("local.get", local);
  const [handle, rows, columns, row, column, source, target, count, k] = Array.from({ length: 9 }, () => node.temporal("i32"));
  const code = [
    ...node.entrada(0), ins("local.set", handle),
    ...dimensionSize(handle, 0, node.temporal), ins("local.set", rows),
    ...dimensionSize(handle, 1, node.temporal), ins("local.set", columns),
  ];
  const inRange = (index, size) => [g(index), ins("i32.const", 0), ins("i32.ge_s"), g(index), g(size), ins("i32.lt_s"), ins("i32.and")];
  const addressOf = (rowIndex, columnIndex) => [g(handle), callMemory("datos8"), g(rowIndex), g(columns), ins("i32.mul"), g(columnIndex), ins("i32.add"), ins("i32.const", element.tam), ins("i32.mul"), ins("i32.add")];
  if (rowWired && columnWired) {
    const result = node.temporal(wasmTypeOf(t.array));
    return [
      ...code, ...node.entrada(1), ins("local.set", row), ...node.entrada(2), ins("local.set", column),
      ...constantOf(t.array, 0), ins("local.set", result),
      ...inRange(row, rows), ...inRange(column, columns), ins("i32.and"),
      ins("if"), ...loadElement(t.array, addressOf(row, column)), ins("local.set", result), ins("end"),
      g(result),
    ];
  }
  const cell = node.celda();
  if (!rowWired && !columnWired) return [...code, ...copyValueTo(t, [g(handle)], [ins("i32.const", cell)], node.temporal), ins("i32.const", cell)];
  // One line of the array: a row runs along the columns, a column along the rows.
  const [fixed, fixedSize, along, alongSize] = rowWired ? [row, rows, column, columns] : [column, columns, row, rows];
  code.push(...node.entrada(rowWired ? 1 : 2), ins("local.set", fixed));
  code.push(g(alongSize), ins("i32.const", 0), ...inRange(fixed, fixedSize), ins("select"), ins("local.set", count));
  code.push(...reserveArray({ array: t.array }, cell, [count], node.temporal), ins("local.set", target));
  code.push(
    ins("i32.const", 0), ins("local.set", k), ins("block"), ins("loop"), g(k), g(count), ins("i32.ge_s"), ins("br_if", 1),
    g(k), ins("local.set", along),
    ...addressOf(row, column), ins("local.set", source),
    ...copyElement(t.array, source, target, node.temporal),
    g(target), ins("i32.const", element.tam), ins("i32.add"), ins("local.set", target),
    g(k), ins("i32.const", 1), ins("i32.add"), ins("local.set", k), ins("br", 0), ins("end"), ins("end"),
  );
  return [...code, ins("i32.const", cell)];
}

/**
 * Add, Multiply, And or Or Array Elements: starts from `identity` and applies `operation` element by element, in the
 * elements' type (an integer wraps around, as in LabVIEW).
 */
export function reduceArray(node, operation, identity) {
  const type = node.tOut(0);
  const element = arrayElement(type);
  const wasmType = wasmTypeOf(type);
  const [handle, length, data, index] = [node.temporal("i32"), node.temporal("i32"), node.temporal("i32"), node.temporal("i32")];
  const result = node.temporal(wasmType);
  const get = (local) => ins("local.get", local);
  return [
    ...node.entrada(0), ins("local.tee", handle), callMemory("longitud"), ins("local.set", length), get(handle), callMemory("datos8"), ins("local.set", data),
    ...constantOf(type, identity), ins("local.set", result),
    ins("i32.const", 0), ins("local.set", index), ins("block"), ins("loop"), get(index), get(length), ins("i32.ge_s"), ins("br_if", 1),
    get(result), get(data), get(index), ins("i32.const", element.tam), ins("i32.mul"), ins("i32.add"), ins(element.carga), ins(`${wasmType}.${operation}`), ...narrowInteger(type), ins("local.set", result),
    get(index), ins("i32.const", 1), ins("i32.add"), ins("local.set", index), ins("br", 0), ins("end"), ins("end"),
    get(result),
  ];
}

/** How the host loads a scalar element: its position in this list. */
const LOAD_KINDS = ["f32.load", "f64.load", "i64.load", "i32.load", "i32.load16_s", "i32.load16_u", "i32.load8_s", "i32.load8_u"];
export const loadKindOf = (type) => LOAD_KINDS.indexOf(arrayElement(type).carga);

/** The host's 1D functions take elements of a fixed size only. */
export function refuseElementsByReference(type, functionName) {
  if (arrayElement(type).ref) throw new Error(`${functionName} with strings, clusters or arrays as elements cannot be compiled yet (M6).`);
}

/** The array header the host's `nuevo_array` writes before the elements, in bytes. */
const NEW_ARRAY_HEADER_BYTES = 8;

/** Leaves on the stack the handle of an array with what comes in through input `input`: the array itself, or an array of that one element. */
export function asArray(node, input) {
  const type = node.tOut(0).array;
  if (esArray(node.tIn(input))) return node.entrada(input);
  const [cell, value] = [node.celda(), node.temporal(wasmTypeOf(type))];
  const element = arrayElement(type);
  return [
    ...node.entrada(input), ins("local.set", value),
    ins("i32.const", cell), ins("i32.const", 1), ins("i32.const", element.tam), ins("i32.const", 0), callMemory("nuevo_array"), ins("drop"),
    ...storeElement(type, [ins("i32.const", cell), ins("i32.load"), ins("i32.const", NEW_ARRAY_HEADER_BYTES), ins("i32.add")], [ins("local.get", value)], node.temporal),
    ins("i32.const", cell),
  ];
}

/** A 1D function the host runs in JavaScript: the output cell, the array (input `arrayInput`), the element size and its own arguments. */
export function callArrayFunction(node, importName, functionName, args, arrayInput = 0) {
  const type = node.tOut(0).array;
  refuseElementsByReference(type, functionName);
  const cell = node.celda();
  return [ins("i32.const", cell), ...node.entrada(arrayInput), ins("i32.const", arrayElement(type).tam), ...args.flatMap((argument) => argument()), ins("call", importIndex(importName)), ins("i32.const", cell)];
}

/** Increment or Decrement Array Element: the host adds `delta` to the element at the index. */
export function addToArrayElement(node, delta) {
  const type = node.tOut(0).array;
  const cell = node.celda();
  return [ins("i32.const", cell), ...node.entrada(0), ins("i32.const", arrayElement(type).tam), ins("i32.const", loadKindOf(type)), ...node.entrada(1), ins("i32.const", delta), ins("call", importIndex("a_sumar")), ins("i32.const", cell)];
}
