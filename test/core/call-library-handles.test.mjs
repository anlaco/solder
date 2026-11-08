// LabVIEW's handles in the Call Library Function Node (DT-088): the block a string or an array is packed into for a
// handle, and read back from after the call. The layout is `extcode.h`'s: a string is `{ int32 length; bytes }` and an
// array `{ int32 dimension sizes[N]; elements }`, all little-endian.

import assert from "node:assert/strict";
import { test } from "node:test";

import { arrayBlock, arrayOfBlock, dimensionsOf, nestByDimensions, stringBlock, textOfStringBlock } from "../../core/runtime/call-library.mjs";

const bytes = (...values) => Uint8Array.from(values);

test("a string's block is its length as a 32-bit integer and then its bytes", () => {
  assert.deepEqual(stringBlock(bytes(72, 105)), bytes(2, 0, 0, 0, 72, 105));
  assert.deepEqual(stringBlock(bytes()), bytes(0, 0, 0, 0), "an empty string is only its length");
});

test("the text of a string's block is the bytes its length says, whatever the block holds after them", () => {
  assert.deepEqual(textOfStringBlock(bytes(2, 0, 0, 0, 72, 105)), bytes(72, 105));
  assert.deepEqual(textOfStringBlock(bytes(2, 0, 0, 0, 72, 105, 99, 99)), bytes(72, 105), "bytes past the length are not text");
});

test("a block that is shorter than its length says, or has no room for a length, gives what it holds and no more", () => {
  assert.deepEqual(textOfStringBlock(bytes(9, 0, 0, 0, 72, 105)), bytes(72, 105), "a library that lied about the length");
  assert.deepEqual(textOfStringBlock(bytes(1, 0)), bytes());
  assert.deepEqual(textOfStringBlock(bytes()), bytes());
  assert.deepEqual(textOfStringBlock(bytes(0xff, 0xff, 0xff, 0xff, 1, 2)), bytes(), "a negative length is none");
});

test("an array's block is its dimension sizes and then its elements, each in C's bytes", () => {
  const block = arrayBlock([3], [1.5, 2.5, 3], "dbl");
  assert.equal(new DataView(block.buffer).getInt32(0, true), 3);
  assert.deepEqual(arrayOfBlock(block, "dbl", 1), { dimensions: [3], values: [1.5, 2.5, 3] });
  const matrix = arrayBlock([2, 3], [1, 2, 3, 4, 5, 6], "i16");
  assert.equal(matrix.byteLength, 8 + 6 * 2);
  assert.deepEqual(arrayOfBlock(matrix, "i16", 2), { dimensions: [2, 3], values: [1, 2, 3, 4, 5, 6] });
  assert.deepEqual(arrayOfBlock(arrayBlock([2], [1n, 2n], "u64"), "u64", 1).values, [1n, 2n], "a 64-bit integer is a BigInt");
});

test("an array block that holds fewer elements than its sizes say gives the elements it holds", () => {
  const block = arrayBlock([4], [1, 2, 3, 4], "i32").subarray(0, 4 + 2 * 4);
  assert.deepEqual(arrayOfBlock(block, "i32", 1), { dimensions: [2], values: [1, 2] }, "the first dimension shrinks to what is there");
  assert.deepEqual(arrayOfBlock(bytes(), "i32", 1), { dimensions: [0], values: [] });
});

test("the dimension sizes of a nested array are the length at each level", () => {
  assert.deepEqual(dimensionsOf([1, 2, 3], 1), [3]);
  assert.deepEqual(dimensionsOf([[1, 2, 3], [4, 5, 6]], 2), [2, 3]);
  assert.deepEqual(dimensionsOf([], 2), [0, 0], "an empty array has zero in each dimension");
  assert.deepEqual(dimensionsOf([[], []], 2), [2, 0]);
});

test("a flat list is nested again by dimension sizes, row by row", () => {
  assert.deepEqual(nestByDimensions([1, 2, 3], [3]), [1, 2, 3]);
  assert.deepEqual(nestByDimensions([1, 2, 3, 4, 5, 6], [2, 3]), [[1, 2, 3], [4, 5, 6]]);
  assert.deepEqual(nestByDimensions([1, 2, 3, 4, 5, 6, 7, 8], [2, 2, 2]), [[[1, 2], [3, 4]], [[5, 6], [7, 8]]]);
  assert.deepEqual(nestByDimensions([], [0]), []);
});
