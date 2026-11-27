// The picture of the Feedback Node (DT-109), drawn as measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-26-feedback-node-look.md Q2-Q6, local evidence never committed; the shapes are drawn anew):
//   - the border (2 px), the dividers (1 px), the arrow and the number are the colour of the type that goes through the node:
//     #0000ff an integer, #ff7f00 a DBL, #ff00ff a string, #007f00 a Boolean, black while it is not known; the inside is #ffffcc;
//   - the arrow (left): tip at x + 6, a head 6 px wide and 6 rows tall (rows 3 to 8) and a shaft 2 px thick (rows 5 and 6) up to
//     x + 25; mirrored when it points right (shaft from x + 7, tip at x + 26);
//   - a delay above 1 is written in the arrow cell, between the head and the end of the shaft, in 8 px tall digits about 6 px wide;
//   - the initializer cell shows a dotted stem 2 px wide (rows 14-15 and 17-18 of a 24 px node) over an up triangle 6 px wide
//     (rows 19-21), or an asterisk of about 7 x 7 while it is unwired; the enable cell a green "?" while unwired (#007f00);
//   - the Z-transform header: a large Z (about 9 x 10, left of the middle, in the lower half) and a small "-N" at the top right;
//   - moved out of its loop the initializer is a 16 x 12 terminal on the loop's left border: 2 px border, #ffffcc inside and a
//     solid 6 x 6 diamond in the type's colour.
//
// Not measured, and decided here: the font of the digits, the Z and the exponent (Arial, sized to the measured heights), where the
// number sits in a right arrow (the mirror of the left one's), the colour of the initializer's stem and asterisk (the type's),
// whether a wired enable cell shows anything (nothing) and the look of the enable cell's "?" (bold Arial).
//
// Pure drawing, like call-library-nodes.mjs: no DOM.

import { aspecto } from "../../../core/model/types.mjs";
import {
  BASE_WIDTH, CELL_HEIGHT, DIRECTION_LEFT, LOOP_TERMINAL, cellStack, feedbackConfig, showsDelayNumber,
} from "./feedback-node-geometry.mjs";

/** The colour of everything the type paints while the type is not known (measured: an unwired node is black). */
export const UNRESOLVED_COLOR = "#000000";
/** The inside is a token of the theme: Old School's is the measured #ffffcc. */
const INTERIOR_COLOR = "var(--feedback-node-fill)";
const ENABLE_MARK_COLOR = "#007f00";
const BORDER = 2;
const DIVIDER = 1;

/** The arrow's measures (Q2), from the node's left edge for an arrow pointing left. */
const ARROW = { tip: 6, headWidth: 6, headHalfHeight: 3, centerY: 6, shaftThickness: 2, shaftEndLeft: 26, shaftStartRight: 7 };
/** The number sits 16 px in from the head's side: the digit of a delay of 3 spans x + 16 to x + 22 (Q5). */
const NUMBER_FROM_TIP_SIDE = 16;
const DIGIT_WIDTH = 6.5;
/** Digits are 8 px tall (Q5): Arial's digits are 0.716 em tall, so the font is 11 px. */
const DIGIT_FONT_SIZE = 11;
const DIGIT_BASELINE = 10.5;
const FONT_FAMILY = `Arial, 'Liberation Sans', sans-serif`;

const f2 = (value) => Number(value.toFixed(2));

/** The colour the node's type is drawn in: its output's, else the one that comes to the initializer or the input, else black. */
export function typeColor(node, resolved) {
  const type = ["output", "initializer", "input"].map((port) => (port === "output" ? resolved?.salidas : resolved?.entradas)?.get(`${node.id}.${port}`)).find((found) => found !== undefined);
  return type === undefined ? UNRESOLVED_COLOR : aspecto(type).color;
}

const rect = (x, y, width, height, fill) => `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(width)}" height="${f2(height)}" fill="${fill}"/>`;
const polygon = (points, fill) => `<polygon points="${points.map(([x, y]) => `${f2(x)},${f2(y)}`).join(" ")}" fill="${fill}"/>`;
const text = (content, x, y, size, fill, extra = "") => `<text x="${f2(x)}" y="${f2(y)}" font-family="${FONT_FAMILY}" font-size="${size}" fill="${fill}"${extra}>${content}</text>`;

/** The head and the shaft of the arrow, in pieces so that the delay's number can sit in the shaft. */
function arrow(config, width, color) {
  const left = config.direction === DIRECTION_LEFT;
  const { tip, headWidth, headHalfHeight, centerY, shaftThickness } = ARROW;
  const shaftTop = centerY - shaftThickness / 2;
  const tipX = left ? tip : width - tip;
  const baseX = left ? tip + headWidth : width - tip - headWidth;
  const head = polygon([[tipX, centerY], [baseX, centerY - headHalfHeight], [baseX, centerY + headHalfHeight]], color);
  const shaftFrom = left ? baseX : ARROW.shaftStartRight;
  const shaftTo = left ? width - tip : baseX;
  if (!showsDelayNumber(config)) return head + rect(shaftFrom, shaftTop, shaftTo - shaftFrom, shaftThickness, color);
  return head + shaftAroundNumber(config, { width, shaftFrom, shaftTo, shaftTop, left }, color);
}

/** The shaft cut around the delay's number, which sits NUMBER_FROM_TIP_SIDE px from the head's side (mirrored for a right arrow: unverified). */
function shaftAroundNumber(config, { width, shaftFrom, shaftTo, shaftTop, left }, color) {
  const numberWidth = String(config.delay).length * DIGIT_WIDTH;
  const numberLeft = left ? NUMBER_FROM_TIP_SIDE : width - NUMBER_FROM_TIP_SIDE - numberWidth;
  const stub = (from, to) => (to > from ? rect(from, shaftTop, to - from, ARROW.shaftThickness, color) : "");
  const number = text(config.delay, numberLeft, DIGIT_BASELINE, DIGIT_FONT_SIZE, color, ` class="feedback-delay"`);
  return number + stub(shaftFrom, numberLeft) + stub(numberLeft + numberWidth, shaftTo);
}

/** The glyph of the initializer cell: an asterisk while unwired, otherwise a dotted stem over an up triangle. */
function initializerGlyph(top, width, wired, color) {
  const middle = width / 2;
  if (!wired) {
    const arm = 3.5;
    const center = top + CELL_HEIGHT / 2 - 0.5;
    const stroke = (x1, y1, x2, y2) => `<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" stroke="${color}" stroke-width="1.4"/>`;
    return stroke(middle, center - arm, middle, center + arm) + stroke(middle - arm, center, middle + arm, center) +
      stroke(middle - arm * 0.7, center - arm * 0.7, middle + arm * 0.7, center + arm * 0.7) + stroke(middle - arm * 0.7, center + arm * 0.7, middle + arm * 0.7, center - arm * 0.7);
  }
  // Rows 14-15 and 17-18 and 19-21 of the 24 px node, whose initializer cell starts at row 12 (Q2).
  const stems = [2, 5].map((row) => rect(middle - 1, top + row, 2, 2, color)).join("");
  return stems + polygon([[middle, top + 7], [middle + 3, top + 10], [middle - 3, top + 10]], color);
}

/** The enable cell: a green "?" while the terminal is unwired; a wired one shows nothing (unverified). */
const enableMark = (top, width, wired) => (wired ? "" : text("?", width / 2, top + 9.5, 10, ENABLE_MARK_COLOR, ` text-anchor="middle" font-weight="bold"`));

/** The Z-transform row: a Z and, at the top right, the exponent "-N" (Q5). */
function zRow(top, config, color) {
  const exponent = `-${config.delay}`;
  return text("Z", 8, top + 20, 14, color, ` class="feedback-z"`) + text(exponent, 19, top + 11, 7, color, ` class="feedback-exponent"`);
}

/** The frame, then a divider under each cell but the last. */
function frame(width, height, cells, color) {
  const bottomOfCells = Object.values(cells).map(({ top, height: cellHeight }) => top + cellHeight);
  const dividers = bottomOfCells.slice(0, -1).map((bottom) => rect(BORDER, bottom - DIVIDER, width - 2 * BORDER, DIVIDER, color)).join("");
  return rect(0, 0, width, height, color) + rect(BORDER, BORDER, width - 2 * BORDER, height - 2 * BORDER, INTERIOR_COLOR) + dividers;
}

/** The terminal on the loop's border, `terminalBox` away from the node's `box`, both in diagram coordinates. */
export function loopTerminal(terminalBox, box, color) {
  const [x, y] = [terminalBox.x - box.x, terminalBox.y - box.y];
  const { width, height, border, diamond } = LOOP_TERMINAL;
  const [centerX, centerY, reach] = [x + width / 2, y + height / 2, diamond / 2];
  return rect(x, y, width, height, color) + rect(x + border, y + border, width - 2 * border, height - 2 * border, INTERIOR_COLOR) +
    polygon([[centerX, centerY - reach], [centerX + reach, centerY], [centerX, centerY + reach], [centerX - reach, centerY]], color);
}

/**
 * The node's picture. `wired` says which of its terminals have a wire (`{ initializer, enable }`); `loopTerminalBox`, where the
 * initializer's terminal is on its loop, when it has been moved out. The loop's terminal is drawn outside the node's box.
 */
export function feedbackBody(node, box, resolved, { wired = {}, loopTerminalBox } = {}) {
  const config = feedbackConfig(node);
  const color = typeColor(node, resolved);
  const { cells, height } = cellStack(config);
  const width = Math.max(box.ancho, BASE_WIDTH);
  let drawn = frame(width, height, cells, color) + arrow(config, width, color);
  if (cells.z) drawn += zRow(cells.z.top, config, color);
  if (cells.enable) drawn += enableMark(cells.enable.top, width, wired.enable);
  if (cells.initializer) drawn += initializerGlyph(cells.initializer.top, width, wired.initializer, color);
  if (loopTerminalBox) drawn += loopTerminal(loopTerminalBox, box, color);
  return `<svg class="formato feedback-node" viewBox="0 0 ${f2(box.ancho)} ${f2(box.alto)}" shape-rendering="crispEdges">${drawn}</svg>`;
}
