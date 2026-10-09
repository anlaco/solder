// What the graphs draw (editor/src/front-panel/plot-data.mjs), with the cases
// measured in LabVIEW 2026 Q3 (labview-captures/graphs/REPORT.md).

import assert from "node:assert/strict";
import { test } from "node:test";

import { AXIS_MIN_SPACING, autoscale, chartAppend, chartPlots, emptyHistory, graphPlots, stripXScale, ticks, xyPlots } from "../../editor/src/front-panel/plot-data.mjs";

test("a chart appends numbers, arrays and clusters, and scrolls after 100 points", () => {
  let history = emptyHistory();
  for (let i = 0; i < 50; i++) history = chartAppend(history, i, "number");
  assert.deepEqual(stripXScale(history), { min: 0, max: 100, step: 100 });
  history = chartAppend(history, Array.from({ length: 56 }, (_, i) => i), { array: "number" });
  assert.equal(history.appended, 106);
  assert.deepEqual(stripXScale(history), { min: 5, max: 105, step: 100 }, "0..100 → 5..105 as measured");
  assert.deepEqual(chartPlots(history)[0].at(-1), { x: 105, y: 55 });
  const two = chartAppend(emptyHistory(), { a: 1, b: 2 }, { cluster: [{ name: "a", type: "number" }, { name: "b", type: "number" }] });
  assert.deepEqual(two.plots, [[1], [2]], "a cluster of two numbers is two plots");
});

test("the chart history keeps the last 1024 points and the X index keeps counting", () => {
  const history = chartAppend(emptyHistory(), Array.from({ length: 1500 }, (_, i) => i), { array: "number" });
  assert.equal(history.plots[0].length, 1024);
  assert.deepEqual(chartPlots(history)[0][0], { x: 476, y: 476 });
});

test("a graph plots an array by index, rows of a 2D array, and a timed array from x0 by dx", () => {
  assert.deepEqual(graphPlots([5, 6], { array: "number" }), [[{ x: 0, y: 5 }, { x: 1, y: 6 }]]);
  assert.equal(graphPlots([[1, 2], [3, 4]], { array: "number", dims: 2 }).length, 2);
  const timed = { cluster: [{ name: "x0", type: "u32" }, { name: "dx", type: "u32" }, { name: "Y", type: { array: "number" } }] };
  assert.deepEqual(graphPlots({ x0: 10, dx: 2, Y: [7, 8] }, timed), [[{ x: 10, y: 7 }, { x: 12, y: 8 }]]);
});

test("an XY graph pairs an X array with a Y array", () => {
  const xy = { cluster: [{ name: "X", type: { array: "number" } }, { name: "Y", type: { array: "number" } }] };
  assert.deepEqual(xyPlots({ X: [0, 1, 2], Y: [5, 6] }, xy), [[{ x: 0, y: 5 }, { x: 1, y: 6 }]]);
  const points = { array: { cluster: [{ name: "X", type: "number" }, { name: "Y", type: "number" }] } };
  assert.deepEqual(xyPlots([{ X: 1, Y: 2 }], points), [[{ x: 1, y: 2 }]]);
});

test("autoscale with Loose Fit rounds out to whole steps; without it keeps the data's range", () => {
  const fallback = { min: 0, max: 10, step: 1 };
  assert.deepEqual(autoscale([0, 127], true, fallback), { min: 0, max: 140, step: 20 }, "80-graph-1d-sine-128.png");
  assert.deepEqual(autoscale([10, 264], true, fallback), { min: 0, max: 300, step: 50 }, "87-graph-cluster-x0-dx-array-run.png");
  assert.deepEqual(autoscale([-1, 1], true, fallback), { min: -1, max: 1, step: 0.5 });
  assert.deepEqual(autoscale([-1, 1], false, fallback), { min: -1, max: 1, step: 0.2 }, "85-xy-graph-cluster-two-arrays.png");
  assert.deepEqual(autoscale([], true, fallback), fallback);
  assert.deepEqual(ticks({ min: -1, max: 1, step: 0.5 }), [-1, -0.5, 0, 0.5, 1]);
});

test("autoscale keeps the labels apart on an axis of known length, as in every measured plot", () => {
  const fallback = { min: 0, max: 10, step: 1 };
  const [x, y] = [(length) => ({ length, minSpacing: AXIS_MIN_SPACING.x }), (length) => ({ length, minSpacing: AXIS_MIN_SPACING.y })];
  assert.deepEqual(autoscale([0, 127], true, fallback, x(232)), { min: 0, max: 140, step: 20 }, "80-graph-1d-sine-128.png");
  assert.deepEqual(autoscale([10, 264], true, fallback, x(232)), { min: 0, max: 300, step: 50 }, "87-graph-cluster-x0-dx-array-run.png");
  assert.deepEqual(autoscale([-1, 1], true, fallback, y(166)), { min: -1, max: 1, step: 0.5 }, "80: Y of the Waveform Graph");
  assert.deepEqual(autoscale([0, 1], true, fallback, y(166)), { min: 0, max: 1, step: 0.2 }, "80: Y of the chart");
  assert.deepEqual(autoscale([-1, 1], false, fallback, y(248)), { min: -1, max: 1, step: 0.2 }, "89: Y of the XY Graph");
  assert.deepEqual(autoscale([-1, 1], false, fallback, x(248)), { min: -1, max: 1, step: 0.5 }, "89: X of the XY Graph, whose labels are wider");
});
