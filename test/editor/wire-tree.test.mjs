// The tree of a wire with several sinks (DT-068): its junctions are where the routes from one source part.

import assert from "node:assert/strict";
import { test } from "node:test";

import { junctionPoints, partingPoint, sharedSegmentCount } from "../../editor/src/block-diagram/wire-tree.mjs";

const toUpper = [[0, 50], [7, 50], [7, 20], [100, 20]];
const toLower = [[0, 50], [7, 50], [7, 90], [100, 90]];
const toFarBelow = [[0, 50], [7, 50], [7, 120], [80, 120]];

test("two routes part at the last point they share", () => {
  assert.deepEqual(partingPoint(toLower, toFarBelow), [7, 90], "one goes on down the trunk");
  assert.deepEqual(partingPoint(toUpper, toLower), [7, 50], "one up, one down from the elbow");
  assert.equal(partingPoint(toLower, toLower), null, "a route does not part from itself");
  assert.equal(partingPoint(toLower, [[1, 50], [100, 50]]), null, "routes from different points never meet");
});

test("a zero-length segment does not hide where routes part", () => {
  const straight = [[0, 50], [7, 50], [7, 50], [100, 50]];
  assert.deepEqual(partingPoint(straight, toLower), [7, 50]);
});

test("each parting point is one dot, and none on the source terminal", () => {
  assert.deepEqual(junctionPoints([toLower, toFarBelow, toUpper]), [[7, 90], [7, 50]]);
  const backwards = [[0, 50], [-10, 50], [-10, 0]];
  assert.deepEqual(junctionPoints([toLower, backwards]), []);
});

test("shared segments are counted from the source while they start together and run the same way", () => {
  assert.equal(sharedSegmentCount(toLower, toFarBelow), 2, "the stub and the trunk");
  assert.equal(sharedSegmentCount(toUpper, toLower), 1, "only the stub");
});
