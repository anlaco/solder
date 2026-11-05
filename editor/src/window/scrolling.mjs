// The scrollbars of the Front Panel and the Block Diagram, as LabVIEW 2026 Q3 draws and moves them
// (labview-captures/reports/2026-11-05-scrollbars-and-window-bounds.md). Pure functions over one axis at a
// time, so the rules are tested without a browser.
//
// The canvas is seen through its visible area, whose top left corner is the `origin`, a point of the canvas.
// The origin is free: the wheel, the arrows and the track move it past the content, and the range then grows to
// include the view. Only dragging the thumb is held inside the range.

/** The width of the strip at the right and at the bottom of a canvas, which stays even when nothing scrolls. */
export const STRIP_THICKNESS = 16;
/** The buttons at each end of a bar, where its arrows show on hover; the track runs between them (measured 17 px). */
export const ARROW_BUTTON_LENGTH = 17;
/** The range reaches a quarter of the visible size past each side of the content. */
const MARGIN_SHARE_OF_VIEW = 1 / 4;

/** One click on an arrow, by window: 32 px on the Front Panel, 30 px on the Block Diagram (one measurement). */
export const ARROW_STEP = { "front-panel": 32, "block-diagram": 30 };
/** One notch of the wheel scrolls 30 px vertically, in both windows. */
export const WHEEL_NOTCH_STEP = 30;
/** Shift and the wheel scrolled five notches at once, still vertically (measured through QEMU's keyboard). */
export const SHIFT_WHEEL_NOTCHES = 5;
/** What Chromium reports for one notch of the wheel, in pixels and in lines. */
const PIXELS_PER_NOTCH = 100;
const LINES_PER_NOTCH = 3;
const WHEEL_DELTA_MODE = { PIXEL: 0, LINE: 1 };

/** An arrow held down repeats: 1.5 s moved about ten steps after the first one (measured). */
export const ARROW_REPEAT = { firstDelay: 250, interval: 125 };

/**
 * Dragging an object out of the Front Panel scrolls towards it, faster the farther out the pointer is: about
 * 85 px/s 4 px out, 255 px/s 49 px out, never more than about 270 px/s (measured; left and up not measured).
 */
const AUTOSCROLL = { measuredDistance: 4, speedThere: 85, speedGrowth: 3.8, maximumSpeed: 270 };

/** The interval of origins an axis can scroll over: the content with its margins, joined with the current view. */
export function scrollRange(content, origin, visible) {
  if (!content) return { min: origin, max: origin };
  const margin = Math.floor(visible * MARGIN_SHARE_OF_VIEW);
  return { min: Math.min(content.min - margin, origin), max: Math.max(content.max + margin - visible, origin) };
}

/** Whether there is anything to scroll; when not, the strip is empty, as LabVIEW leaves it. */
export const isScrollable = (range) => range.max > range.min;

/** The thumb inside a track of `trackLength` px: its start and its length, in proportion to view and range. */
export function thumbOf(range, origin, visible, trackLength) {
  const extent = range.max - range.min + visible;
  return { start: (trackLength * (origin - range.min)) / extent, length: (trackLength * visible) / extent };
}

/** The origin a thumb dragged to `thumbStart` shows, held inside the range. */
export function originAtThumb(thumbStart, range, visible, trackLength) {
  const extent = range.max - range.min + visible;
  const origin = range.min + (thumbStart * extent) / trackLength;
  // `+ 0` turns a -0 into 0, which an origin is compared with.
  return Math.round(Math.min(range.max, Math.max(range.min, origin))) + 0;
}

/** How far a wheel event scrolls, in canvas pixels, from its `deltaY` and `deltaMode`. */
export function wheelScroll({ deltaY, deltaMode, shiftKey }) {
  const notches = deltaMode === WHEEL_DELTA_MODE.LINE ? deltaY / LINES_PER_NOTCH : deltaMode === WHEEL_DELTA_MODE.PIXEL ? deltaY / PIXELS_PER_NOTCH : deltaY;
  return Math.round(notches * WHEEL_NOTCH_STEP * (shiftKey ? SHIFT_WHEEL_NOTCHES : 1));
}

/** The speed of the autoscroll, in px per second, for a pointer `distance` px outside the canvas (0 inside). */
export function autoscrollSpeed(distance) {
  if (distance <= 0) return 0;
  const { measuredDistance, speedThere, speedGrowth, maximumSpeed } = AUTOSCROLL;
  return Math.min(maximumSpeed, speedThere + speedGrowth * (distance - measuredDistance));
}

/** How far outside `[start, end)` a pointer at `position` is: negative before it, positive after it, 0 inside. */
export function distanceOutside(position, start, end) {
  if (position < start) return position - start;
  if (position >= end) return position - end + 1;
  return 0;
}

/**
 * What a press in a bar does, from where it falls along the bar (`position`, from the bar's start): an arrow
 * at either end, the thumb, or the track before or after it.
 */
export function partOfBar(position, barLength, thumb) {
  if (position < ARROW_BUTTON_LENGTH) return "arrow-back";
  if (position >= barLength - ARROW_BUTTON_LENGTH) return "arrow-forward";
  const alongTrack = position - ARROW_BUTTON_LENGTH;
  if (alongTrack < thumb.start) return "track-back";
  if (alongTrack >= thumb.start + thumb.length) return "track-forward";
  return "thumb";
}

/** The bounding interval of a list of boxes `{ left, top, right, bottom }` on one axis, or null for none. */
export function contentExtent(boxes, axis) {
  if (!boxes.length) return null;
  const [low, high] = axis === "x" ? ["left", "right"] : ["top", "bottom"];
  return { min: Math.min(...boxes.map((box) => box[low])), max: Math.max(...boxes.map((box) => box[high])) };
}
