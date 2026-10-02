// What the editor knows about the cells of a 1D or 2D array constant, control or
// indicator (DT-044): addresses, defined cells, growing on write, and Add and
// Remove Dimension. Pure functions: no DOM.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_EDITOR_DIMENSIONS, addDimensionPatch, addressFromText, definedExtent, dimensionsOfNode, firstShown, isDefined,
  parseCellAddress, readCell, removeDimensionPatch, valueFitsDimensions, visibleGrid, visibleSetting, writeCell,
} from "../../editor/src/common/array-grid.mjs";

const ARRAY_2D = { type: { array: "number", dims: 2 }, value: [[1, 2, 3], [4, 5, 6]] };

test("the visible grid and the first position shown read both formats", () => {
  assert.deepEqual(visibleGrid({}), { rows: 1, columns: 1 }, "an array shows one element by default");
  assert.deepEqual(visibleGrid({ visibles: 4 }), { rows: 1, columns: 4 }, "1D: a number");
  assert.deepEqual(visibleGrid({ visibles: [4, 9] }), { rows: 4, columns: 9 }, "2D: rows then columns");
  assert.deepEqual(visibleGrid({ visibles: [0, -2] }), { rows: 1, columns: 1 }, "never fewer than one");
  assert.deepEqual(firstShown({ indice: 3 }), { row: 0, column: 3 });
  assert.deepEqual(firstShown({ indice: [2, 5] }), { row: 2, column: 5 });
  assert.deepEqual(firstShown({}), { row: 0, column: 0 });
  assert.equal(dimensionsOfNode({ type: { array: "i32" } }), 1);
  assert.equal(dimensionsOfNode(ARRAY_2D), 2);
  assert.equal(dimensionsOfNode({}), 1, "no declared type: a 1D array of DBL");
  assert.deepEqual([visibleSetting(1, 3, 7), visibleSetting(2, 3, 7)], [7, [3, 7]]);
});

test("a cell is addressed by its position in 1D and by row and column in 2D", () => {
  assert.deepEqual(parseCellAddress(4), { row: 0, column: 4 });
  assert.deepEqual(parseCellAddress("2,5"), { row: 2, column: 5 });
  assert.equal(addressFromText("7"), 7, "a data attribute of a 1D cell is a number");
  assert.equal(addressFromText("1,2"), "1,2", "and of a 2D cell stays text");
  assert.equal(readCell([9, 8, 7], 1, 1), 8);
  assert.equal(readCell(ARRAY_2D.value, 2, "1,2"), 6);
  assert.equal(readCell(ARRAY_2D.value, 2, "5,5"), undefined);
});

test("the value defines the cells inside its rows and columns, and the rest are only shown", () => {
  assert.deepEqual(definedExtent(ARRAY_2D.value, 2), { rows: 2, columns: 3 });
  assert.deepEqual(definedExtent([1, 2], 1), { rows: 1, columns: 2 });
  assert.deepEqual(definedExtent([], 2), { rows: 0, columns: 0 });
  assert.ok(isDefined(ARRAY_2D.value, 2, "1,2"));
  assert.ok(!isDefined(ARRAY_2D.value, 2, "2,0"), "a row beyond the value");
  assert.ok(!isDefined(ARRAY_2D.value, 2, "0,3"), "a column beyond the value");
  assert.ok(isDefined([1, 2], 1, 1) && !isDefined([1, 2], 1, 2));
});

test("writing a cell beyond the value grows it without gaps, as in 1D", () => {
  assert.deepEqual(writeCell([4.5], 1, 3, 7, "number"), [4.5, 0, 0, 7]);
  assert.deepEqual(writeCell([], 2, "1,2", 9, "number"), [[0, 0, 0], [0, 0, 9]], "rows and columns are padded with the default");
  assert.deepEqual(writeCell(ARRAY_2D.value, 2, "0,1", 20, "number"), [[1, 20, 3], [4, 5, 6]]);
  assert.deepEqual(writeCell(ARRAY_2D.value, 2, "2,3", 7, "number"), [[1, 2, 3, 0], [4, 5, 6, 0], [0, 0, 0, 7]]);
  assert.deepEqual(writeCell([["a"]], 2, "1,1", "z", "string"), [["a", ""], ["", "z"]], "strings pad with the empty string");
  assert.deepEqual(writeCell([], 2, "0,0", true, "boolean"), [[true]]);
  assert.deepEqual(ARRAY_2D.value, [[1, 2, 3], [4, 5, 6]], "the original is not changed");
});

// labview-captures/array-2d/constant-remove-dimension-2x3-to-1d.png: [[1,2,3],[4,5,6]] becomes [1,2,3].
test("Add Dimension makes the array the single row of a 2D one and Remove Dimension keeps the first row", () => {
  const added = addDimensionPatch({ type: { array: "i32" }, value: [1, 2, 3], visibles: 3, indice: 1 });
  assert.deepEqual(added, { type: { array: "i32", dims: 2 }, value: [[1, 2, 3]], visibles: [1, 3], indice: [0, 1] });
  assert.deepEqual(addDimensionPatch({ type: { array: "number" }, value: [] }).value, [], "an empty array stays empty");
  assert.equal(addDimensionPatch(ARRAY_2D), null, `the editor allows ${MAX_EDITOR_DIMENSIONS} dimensions`);

  const removed = removeDimensionPatch({ ...ARRAY_2D, visibles: [2, 4], indice: [1, 2] });
  assert.deepEqual(removed, { type: { array: "number" }, value: [1, 2, 3], visibles: 4, indice: 2 });
  assert.equal(removeDimensionPatch({ type: { array: "number" }, value: [1] }), null, "nothing to remove from a 1D array");
  assert.deepEqual(removeDimensionPatch({ type: { array: "number", dims: 2 } }).value, [], "an empty 2D array gives an empty row");
});

test("a value left by a run only fits an indicator with the same dimensions", () => {
  assert.ok(valueFitsDimensions([1, 2], 1) && valueFitsDimensions([[1], [2]], 2) && valueFitsDimensions([], 2));
  assert.ok(!valueFitsDimensions([[1]], 1) && !valueFitsDimensions([1, 2], 2) && !valueFitsDimensions(undefined, 1));
});
