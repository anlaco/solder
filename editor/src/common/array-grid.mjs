// What the editor knows about the cells of an array constant, control or
// indicator with one or two dimensions (DT-044). Pure module: no DOM, so the
// diagram, the panel and the tests share it.
//
// Addresses. A cell of a 1D array is addressed by its position (a number); a
// cell of a 2D array by "row,column" (a string). That keeps the 1D format that
// already exists untouched and lets the DOM carry the address in `data-*`.
//
// Presentation settings in `config`, next to the type and the value:
//   visibles  how many elements the box shows: a number for 1D, [rows, columns] for 2D
//   indice    the first position shown:        a number for 1D, [row, column] for 2D

import { arrayOf, dimensionsOf, elementoPorDefecto } from "../../../core/model/types.mjs";

/** The compiler handles two dimensions (DT-044); more would need a decision of their own. */
export const MAX_EDITOR_DIMENSIONS = 2;

/** Dimensions of the array a node holds; a node without a declared type is a 1D array of DBL. */
export const dimensionsOfNode = (config) => Math.max(1, dimensionsOf(config?.type));

const atLeastOne = (count) => Math.max(1, Math.trunc(Number(count) || 1));

/** How many rows and columns the box shows. A 1D array is one row. */
export function visibleGrid(config) {
  const visible = config?.visibles;
  if (Array.isArray(visible)) return { rows: atLeastOne(visible[0]), columns: atLeastOne(visible[1]) };
  return { rows: 1, columns: atLeastOne(visible) };
}

/** The first row and column shown. */
export function firstShown(config) {
  const index = config?.indice;
  if (Array.isArray(index)) return { row: Math.max(0, index[0] ?? 0), column: Math.max(0, index[1] ?? 0) };
  return { row: 0, column: Math.max(0, index ?? 0) };
}

/** The `visibles` setting for those rows and columns, in the format of the array's dimensions. */
export const visibleSetting = (dimensions, rows, columns) => (dimensions === 2 ? [rows, columns] : columns);

/** The `indice` setting for that first row and column. */
export const indexSetting = (dimensions, row, column) => (dimensions === 2 ? [row, column] : column);

export const cellAddress = (dimensions, row, column) => (dimensions === 2 ? `${row},${column}` : column);

/** The address a `data-*` attribute carries: "row,column" stays text and a position becomes a number. */
export const addressFromText = (text) => (String(text).includes(",") ? String(text) : Number(text));

/** The row and column an address names. */
export function parseCellAddress(address) {
  if (typeof address === "string" && address.includes(",")) {
    const [row, column] = address.split(",").map(Number);
    return { row, column };
  }
  return { row: 0, column: Number(address) };
}

/** The extent the value defines: its rows and its widest row. A 1D value has one row. */
export function definedExtent(value, dimensions) {
  const list = value ?? [];
  if (dimensions !== 2) return { rows: 1, columns: list.length };
  return { rows: list.length, columns: Math.max(0, ...list.map((row) => row.length)) };
}

/** Whether the value defines that cell; the rest are shown as the default and are not part of the array. */
export function isDefined(value, dimensions, address) {
  const { row, column } = parseCellAddress(address);
  const extent = definedExtent(value, dimensions);
  return dimensions === 2 ? row < extent.rows && column < extent.columns : column < extent.columns;
}

export function readCell(value, dimensions, address) {
  const { row, column } = parseCellAddress(address);
  return dimensions === 2 ? value?.[row]?.[column] : value?.[column];
}

/**
 * The value with one cell written. There are no gaps: a cell beyond the end
 * grows the array (every new row and column filled with the default of the
 * element type), so the result is always rectangular.
 */
export function writeCell(value, dimensions, address, element, elementType) {
  const { row, column } = parseCellAddress(address);
  const filler = elementoPorDefecto(elementType);
  if (dimensions !== 2) {
    const list = [...(value ?? [])];
    while (list.length < column) list.push(filler);
    list[column] = element;
    return list;
  }
  const extent = definedExtent(value, 2);
  const [rows, columns] = [Math.max(extent.rows, row + 1), Math.max(extent.columns, column + 1)];
  const grown = Array.from({ length: rows }, (_, r) => Array.from({ length: columns }, (_, c) => value?.[r]?.[c] ?? filler));
  grown[row][column] = element;
  return grown;
}

/**
 * Add Dimension: a 1D array becomes the single row of a 2D one (measured: [a, b, c] becomes [[a, b, c]]);
 * the box shows one row and the same columns. `null` when the array already has the most the editor allows.
 */
export function addDimensionPatch(config) {
  const dimensions = dimensionsOfNode(config);
  if (dimensions >= MAX_EDITOR_DIMENSIONS) return null;
  const { rows, columns } = visibleGrid(config);
  const { row, column } = firstShown(config);
  const value = config?.value ?? [];
  return {
    type: arrayOf((config?.type ?? { array: "number" }).array, dimensions + 1),
    value: value.length ? [value] : [],
    visibles: visibleSetting(dimensions + 1, rows, columns),
    indice: indexSetting(dimensions + 1, row, column),
  };
}

/**
 * Remove Dimension: keeps the first row (measured: [[1, 2, 3], [4, 5, 6]] becomes [1, 2, 3]).
 * `null` for a 1D array.
 */
export function removeDimensionPatch(config) {
  const dimensions = dimensionsOfNode(config);
  if (dimensions < 2) return null;
  const { columns } = visibleGrid(config);
  const { column } = firstShown(config);
  return {
    type: arrayOf(config.type.array, dimensions - 1),
    value: config?.value?.[0] ?? [],
    visibles: visibleSetting(dimensions - 1, 1, columns),
    indice: indexSetting(dimensions - 1, 0, column),
  };
}

/** A runtime value (an indicator after a run) only fits an array if it has that many levels of nesting. */
export function valueFitsDimensions(value, dimensions) {
  if (!Array.isArray(value)) return false;
  return dimensions === 2 ? value.every(Array.isArray) : !value.some(Array.isArray);
}
