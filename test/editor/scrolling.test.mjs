// The scrollbars of the Front Panel and the Block Diagram, against the numbers measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-05-scrollbars-and-window-bounds.md).

import assert from "node:assert/strict";
import { test } from "node:test";

import * as Scroll from "../../editor/src/window/scrolling.mjs";

/** The Front Panel of a new VI shows 1073 x 600 px of its canvas. */
const PANEL_VIEW = { width: 1073, height: 600 };

test("the range reaches a quarter of the view past the content and always includes the view (measured origins)", () => {
  // One numeric at x 85..150, y 67..109: LabVIEW let the origin go to (-183, -83) and no farther.
  assert.equal(Scroll.scrollRange({ min: 85, max: 150 }, 0, PANEL_VIEW.width).min, -183);
  assert.equal(Scroll.scrollRange({ min: 67, max: 109 }, 0, PANEL_VIEW.height).min, -83);
  // With another numeric out at (2292, 1787)..(2350, 1812), the far end was (1545, 1362).
  assert.equal(Scroll.scrollRange({ min: 85, max: 2350 }, 0, PANEL_VIEW.width).max, 1545);
  assert.equal(Scroll.scrollRange({ min: 67, max: 1812 }, 0, PANEL_VIEW.height).max, 1362);
  // The wheel takes the view past the content: the range grows to include it.
  assert.deepEqual(Scroll.scrollRange({ min: 67, max: 109 }, -400, PANEL_VIEW.height), { min: -400, max: -341 });
  assert.deepEqual(Scroll.scrollRange({ min: 67, max: 109 }, 900, PANEL_VIEW.height), { min: -83, max: 900 });
});

test("nothing to scroll leaves the strip empty: an empty canvas, or one whose margins fit in the view", () => {
  assert.equal(Scroll.isScrollable(Scroll.scrollRange(null, 0, PANEL_VIEW.height)), false);
  // At origin y = -83 one numeric and its margins fit, and LabVIEW's vertical bar went away.
  assert.equal(Scroll.isScrollable(Scroll.scrollRange({ min: 67, max: 109 }, -83, PANEL_VIEW.height)), false);
  assert.equal(Scroll.isScrollable(Scroll.scrollRange({ min: 67, max: 109 }, 0, PANEL_VIEW.height)), true);
});

test("the thumb is to its track as the view is to the range, and dragging it stays inside the range", () => {
  // Measured: a 1039 px horizontal track over a 2801 px range drew a 398 px thumb.
  const range = Scroll.scrollRange({ min: 85, max: 2350 }, 0, PANEL_VIEW.width);
  const thumb = Scroll.thumbOf(range, 0, PANEL_VIEW.width, 1039);
  assert.ok(Math.abs(thumb.length - 398) < 1, `thumb ${thumb.length}`);
  const atTheEnd = Scroll.thumbOf(range, range.max, PANEL_VIEW.width, 1039);
  assert.ok(Math.abs(atTheEnd.start + atTheEnd.length - 1039) < 1e-9);
  assert.equal(Scroll.originAtThumb(-50, range, PANEL_VIEW.width, 1039), range.min);
  assert.equal(Scroll.originAtThumb(5000, range, PANEL_VIEW.width, 1039), range.max);
  assert.equal(Scroll.originAtThumb(thumb.start, range, PANEL_VIEW.width, 1039), 0);
});

test("a wheel notch scrolls 30 px, Shift and the wheel 150 px vertically, and an arrow 32 px on the panel and 30 on the diagram", () => {
  assert.equal(Scroll.wheelScroll({ deltaY: 100, deltaMode: 0 }), 30);
  assert.equal(Scroll.wheelScroll({ deltaY: -3, deltaMode: 1 }), -30);
  assert.equal(Scroll.wheelScroll({ deltaY: 100, deltaMode: 0, shiftKey: true }), 150);
  assert.deepEqual(Scroll.ARROW_STEP, { "front-panel": 32, "block-diagram": 30 });
});

test("a press falls on an arrow at either end, on the thumb, or on the track before or after it", () => {
  const thumb = { start: 100, length: 50 };
  const bar = 400;
  assert.equal(Scroll.partOfBar(5, bar, thumb), "arrow-back");
  assert.equal(Scroll.partOfBar(bar - 5, bar, thumb), "arrow-forward");
  assert.equal(Scroll.partOfBar(Scroll.ARROW_BUTTON_LENGTH + 50, bar, thumb), "track-back");
  assert.equal(Scroll.partOfBar(Scroll.ARROW_BUTTON_LENGTH + 120, bar, thumb), "thumb");
  assert.equal(Scroll.partOfBar(Scroll.ARROW_BUTTON_LENGTH + 200, bar, thumb), "track-forward");
});

test("dragging out of the canvas scrolls faster the farther out, up to about 270 px/s (measured)", () => {
  assert.equal(Scroll.autoscrollSpeed(0), 0);
  assert.equal(Scroll.autoscrollSpeed(4), 85);
  assert.ok(Math.abs(Scroll.autoscrollSpeed(49) - 255) < 5);
  assert.equal(Scroll.autoscrollSpeed(99), 270);
  assert.deepEqual([Scroll.distanceOutside(5, 10, 100), Scroll.distanceOutside(50, 10, 100), Scroll.distanceOutside(103, 10, 100)], [-5, 0, 4]);
});

test("the content is the box around everything drawn", () => {
  const boxes = [{ left: 85, top: 67, right: 150, bottom: 109 }, { left: -20, top: 300, right: 10, bottom: 320 }];
  assert.deepEqual(Scroll.contentExtent(boxes, "x"), { min: -20, max: 150 });
  assert.deepEqual(Scroll.contentExtent(boxes, "y"), { min: 67, max: 320 });
  assert.equal(Scroll.contentExtent([], "x"), null);
});
