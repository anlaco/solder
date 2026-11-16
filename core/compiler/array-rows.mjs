// The rows of a 2D array that crosses a loop's border through an indexed tunnel (DT-044): the row of each iteration
// coming in, and the rows gathered going out packed into a 2D array. compile-ovi.mjs calls them for its tunnels.

import { ins } from "./instructions.mjs";
import { NULL_HANDLE, arrayElement, copyRow, reserveArray } from "./memory-ops.mjs";
import { callMemory } from "./runtime-functions.mjs";

/**
 * The row of iteration `i` of a 2D array that enters a loop through an indexed
 * tunnel, copied into the tunnel's own cell; past the last row, an empty array.
 */
export function loopRowOfIteration(x, i, temporal) {
  const element = arrayElement(x.t.array);
  const g = (local) => ins("local.get", local);
  const [count, source, target] = [temporal("i32"), temporal("i32"), temporal("i32")];
  return [
    g(x.fila.columnas), ins("i32.const", 0), g(i), g(x.m), ins("i32.lt_s"), ins("select"), ins("local.set", count),
    g(x.d), g(i), g(x.fila.columnas), ins("i32.mul"), ins("i32.const", element.tam), ins("i32.mul"), ins("i32.add"), ins("local.set", source),
    ...reserveArray(x.t, x.fila.celda, [count], temporal), ins("local.set", target),
    ...copyRow(x.t.array, source, count, target, count, NULL_HANDLE, temporal),
    ins("i32.const", x.fila.celda), ins("local.set", x.l),
  ];
}

/**
 * Packs the rows gathered by an indexed output tunnel —a 1D array whose
 * elements are the cells of 1D arrays— into the 2D array `t` in `cell`, as wide
 * as its longest row and the shorter ones padded with the default value, like
 * Build Array (padding not measured for a loop).
 */
export function gatherRowsInto2dArray(t, rowsCell, cell, temporal) {
  const element = arrayElement(t.array);
  const g = (local) => ins("local.get", local);
  const [rows, columns, rowCells, row, rowHandle, length, target, source] = Array.from({ length: 8 }, () => temporal("i32"));
  const defaultSource = element.ref && t.array === "string" ? NULL_HANDLE : null;
  if (element.ref && defaultSource === null) throw new Error("A loop that gathers rows of clusters into a 2D array: not yet (DT-044).");
  const eachRow = (body) => [
    ins("i32.const", 0), ins("local.set", row), ins("block"), ins("loop"), g(row), g(rows), ins("i32.ge_s"), ins("br_if", 1),
    g(rowCells), g(row), ins("i32.const", 4), ins("i32.mul"), ins("i32.add"), ins("local.set", rowHandle),
    ...body,
    g(row), ins("i32.const", 1), ins("i32.add"), ins("local.set", row), ins("br", 0), ins("end"), ins("end"),
  ];
  return [
    ins("i32.const", rowsCell), callMemory("longitud"), ins("local.set", rows),
    ins("i32.const", rowsCell), callMemory("datos8"), ins("local.set", rowCells),
    ins("i32.const", 0), ins("local.set", columns),
    ...eachRow([g(rowHandle), callMemory("longitud"), ins("local.tee", length), g(columns), g(length), g(columns), ins("i32.gt_s"), ins("select"), ins("local.set", columns)]),
    ...reserveArray(t, cell, [rows, columns], temporal), ins("local.set", target),
    ...eachRow([
      g(rowHandle), callMemory("longitud"), ins("local.set", length), g(rowHandle), callMemory("datos8"), ins("local.set", source),
      ...copyRow(t.array, source, length, target, columns, defaultSource, temporal),
      g(target), g(columns), ins("i32.const", element.tam), ins("i32.mul"), ins("i32.add"), ins("local.set", target),
    ]),
  ];
}
