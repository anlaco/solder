// How a Waveform Chart, a Waveform Graph and an XY Graph are drawn on the Front
// Panel, at 1:1. Everything is measured in LabVIEW 2026 Q3 on
// labview-captures/graphs/03-three-fresh-panel.png (the fresh objects) and 80,
// 89 (with data), pixel by pixel; the drawing is ours (DT-035 §8): rectangles,
// lines and text, not NI's bitmaps. What was not measured says "unverified".
//
// Pure: it returns the SVG of an object from its settings and its data
// (graph-state.mjs); the panel puts it in a box (front-panel.mjs).

import { plotColor, ticks } from "./plot-data.mjs";
import { displayedGraph, isShown } from "./graph-state.mjs";

/**
 * The size of each object, with the plot area inside it (REPORT §2): frame
 * 328 × 218 with a plot of 232 × 166 for the chart and the graph, and 342 × 300
 * with 248 × 248 for the XY Graph. `plot.x` and `plot.y` are those of the
 * first black pixel from the corner of the frame (03: 190 − 118 and 117 − 107; 180 − 110 and 381 − 371).
 */
export const GRAPH_MEASURES = {
  "waveform-chart": { width: 328, height: 218, plot: { x: 72, y: 10, width: 232, height: 166 } },
  "waveform-graph": { width: 328, height: 218, plot: { x: 72, y: 10, width: 232, height: 166 } },
  "xy-graph": { width: 342, height: 300, plot: { x: 70, y: 10, width: 248, height: 248 } },
};

/** The legend: 100 × 22 (101 in the report: the 101st pixel of the capture is a line of the panel grid), right-aligned and 3 px above the frame (03: rows 82–103 over a frame from 107). */
export const LEGEND = { width: 100, height: 22, gap: 3, textX: 16, textBaseline: 15, swatch: { x: 57, y: 2, width: 28, height: 18 } };

/** Where the label goes: above the top left of the frame, 3 px over it and 8 px in (unverified: the three captured labels are 8–10 px in). */
export const LABEL_PLACEMENT = { indent: 8, gap: 3 };

/** How far the grid and the ticks go (REPORT §2: the graph 8 subdivisions on X and 5 on Y, 4 minor lines; the XY 5 and 5, from 03). */
const GRID_SUBDIVISIONS = { "waveform-graph": { x: 8, y: 5 }, "xy-graph": { x: 5, y: 5 } };
const GRID_COLORS = { "waveform-graph": { minor: "#003300", major: "#006600" }, "xy-graph": { minor: "#4c4c00", major: "#999900" } };

const FRAME_FILL = "#bfbfbf";
/** The columns of the bevel on the left of a frame and of the dark bar on its right, 13 px each (03, row 200 of the chart). */
const LEFT_BEVEL = ["#bbbbbb", "#cccccc", "#d0d0d0", "#d1d1d1", "#d3d3d3", "#d3d3d3", "#d3d3d3", "#d3d3d3", "#d2d2d2", "#d0d0d0", "#cecece", "#cacaca", "#c5c5c5"];
const RIGHT_BAR = ["#bababa", "#b4b4b4", "#aeaeae", "#aaaaaa", "#a6a6a6", "#a2a2a2", "#9d9d9d", "#999999", "#939393", "#8b8b8b", "#828282", "#707070", "#404040"];
const TOP_EDGE = ["#d0d0d0", "#d2d2d2"];
const TOP_EDGE_OVER_BAR = ["#cccccc", "#9a9a9a"];
const BOTTOM_EDGE = ["#a5a5a5", "#858585"];

const PLOT_BACKGROUND = "#000000";
const PLOT_BORDER_DARK = "#595959";
const PLOT_BORDER_LIGHT = "#d9d9d9";

/** The ticks: 5 px long, starting 7 px before the plot on Y and 3 px under it on X (03, chart: columns 183–187 and rows 285–289). */
const TICK = { length: 5, yBeforePlot: 7, xBelowPlot: 2 };
/** The tick labels (03): Y right-aligned 9 px before the plot, X with a baseline 20 px under the last row of the plot. */
const LABELS = { yGap: 9, xBaselineBelow: 19, yBaselineBelowTick: 5 };
/** The axis names: "Time" 37 px under the last row of the plot, "Amplitude" 18 px before the widest label (03). */
const NAMES = { xBaselineBelow: 36, yGapToLabels: 18 };
const X_AXIS_NAME = "Time";
const Y_AXIS_NAME = "Amplitude";

/** The width of a tick label, to place the name of the Y axis: the digits of the font are about 6 px, the minus 4 and the separator 3 ("-10" is 16 px in 03). */
const CHARACTER_WIDTHS = { "-": 4, ",": 3, ".": 3 };
const DIGIT_WIDTH = 6;
const textWidth = (text) => [...text].reduce((sum, character) => sum + (CHARACTER_WIDTHS[character] ?? DIGIT_WIDTH), 0);

const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (n) => Number(n.toFixed(2));
const rect = (x, y, width, height, fill) => `<rect x="${num(x)}" y="${num(y)}" width="${num(width)}" height="${num(height)}" fill="${fill}"/>`;

/** Half-down rounding: the grid lines of 03 fall where `Math.round` would put them one pixel off on a .5. */
const roundHalfDown = (n) => Math.ceil(n - 0.5);

/** The label of a tick as LabVIEW writes it: the shortest form, with the decimal separator of the system. */
export function tickLabel(value, separator) {
  return String(Number(value.toPrecision(12))).replace(".", separator);
}

// ——— The frame ———

/** The grey frame with its bevel on the left and its dark bar on the right (also the legend's). */
export function bevelFrame(width, height) {
  const barStart = width - RIGHT_BAR.length;
  let body = rect(0, 0, width, height, FRAME_FILL);
  LEFT_BEVEL.forEach((color, column) => (body += rect(column, 0, 1, height, color)));
  RIGHT_BAR.forEach((color, column) => (body += rect(barStart + column, 0, 1, height, color)));
  TOP_EDGE.forEach((color, row) => (body += rect(LEFT_BEVEL.length, row, barStart - LEFT_BEVEL.length, 1, color)));
  TOP_EDGE_OVER_BAR.forEach((color, row) => (body += rect(barStart, row, RIGHT_BAR.length, 1, color)));
  BOTTOM_EDGE.forEach((color, row) => (body += rect(0, height - BOTTOM_EDGE.length + row, width, 1, color)));
  return body;
}

function legend(measures) {
  const { width, height, gap, textX, textBaseline, swatch } = LEGEND;
  const origin = `translate(${measures.width - width} ${-(height + gap)})`;
  const zigzag = [[1, 11], [8, 2], [14, 10], [20, 3], [26, 9]].map(([x, y]) => `${x},${y}`).join(" ");
  const swatchBox =
    rect(0, 0, swatch.width, swatch.height, PLOT_BORDER_DARK) + rect(1, 1, swatch.width - 2, swatch.height - 2, PLOT_BACKGROUND) +
    rect(swatch.width - 1, 1, 1, swatch.height - 1, PLOT_BORDER_LIGHT) + rect(1, swatch.height - 1, swatch.width - 1, 1, PLOT_BORDER_LIGHT) +
    `<polyline points="${zigzag}" fill="none" stroke="${plotColor(0)}" stroke-width="1" transform="translate(1 1)"/>`;
  return `<g class="grafico-leyenda" data-parte="legend" transform="${origin}">${bevelFrame(width, height)}` +
    `<text class="grafico-texto" x="${textX}" y="${textBaseline}">Plot 0</text>` +
    `<g class="grafico-muestra" data-parte="plot-swatch" transform="translate(${swatch.x} ${swatch.y})">${swatchBox}</g></g>`;
}

// ——— The plot area ———

/** The pixel of `value` along an axis of `length` pixels (the first and last values fall on the first and last pixel, as the ticks do in 03). */
const along = (value, scale, length) => roundHalfDown(((value - scale.min) / (scale.max - scale.min)) * (length - 1));

function plotBox(plot) {
  return rect(plot.x - 1, plot.y - 1, plot.width + 1, 1, PLOT_BORDER_DARK) + rect(plot.x - 1, plot.y - 1, 1, plot.height + 1, PLOT_BORDER_DARK) +
    rect(plot.x - 1, plot.y + plot.height, plot.width + 1, 1, PLOT_BORDER_LIGHT) + rect(plot.x + plot.width, plot.y - 1, 1, plot.height + 2, PLOT_BORDER_LIGHT) +
    rect(plot.x, plot.y, plot.width, plot.height, PLOT_BACKGROUND);
}

/** The positions, in pixels along an axis, of the grid lines: `subdivisions` per step, not at the ends (they are black in 03). */
function gridPositions(scale, length, subdivisions) {
  const steps = Math.round((scale.max - scale.min) / scale.step);
  const total = steps * subdivisions;
  if (!(total > 1) || total > length) return { major: [], minor: [] };
  const positions = { major: [], minor: [] };
  for (let line = 1; line < total; line++) positions[line % subdivisions === 0 ? "major" : "minor"].push(roundHalfDown((line * (length - 1)) / total));
  return positions;
}

function grid(kind, scaleX, scaleY, plot) {
  const subdivisions = GRID_SUBDIVISIONS[kind];
  if (!subdivisions) return "";
  const colors = GRID_COLORS[kind];
  const columns = gridPositions(scaleX, plot.width, subdivisions.x);
  const rows = gridPositions(scaleY, plot.height, subdivisions.y);
  const lines = (class_, color) => {
    const vertical = columns[class_].map((position) => `M${plot.x + position + 0.5} ${plot.y}v${plot.height}`);
    const horizontal = rows[class_].map((position) => `M${plot.x} ${plot.y + plot.height - 1 - position + 0.5}h${plot.width}`);
    return vertical.length + horizontal.length ? `<path d="${[...vertical, ...horizontal].join("")}" stroke="${color}" stroke-width="1" fill="none"/>` : "";
  };
  return lines("minor", colors.minor) + lines("major", colors.major);
}

const COORDINATE_LIMIT = 100000;
const clamp = (n) => Math.max(-COORDINATE_LIMIT, Math.min(COORDINATE_LIMIT, n));

/** One plot as a 1 px polyline, with no antialiasing and no point style (REPORT §5); a point that is not a number breaks the line. */
function plotPath(points, scaleX, scaleY, plot) {
  let path = "";
  let drawing = false;
  for (const { x, y } of points) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      drawing = false;
      continue;
    }
    const pixelX = clamp(((x - scaleX.min) / (scaleX.max - scaleX.min)) * (plot.width - 1) + 0.5);
    const pixelY = clamp(plot.height - 1 - ((y - scaleY.min) / (scaleY.max - scaleY.min)) * (plot.height - 1) + 0.5);
    path += `${drawing ? "L" : "M"}${num(pixelX)} ${num(pixelY)}`;
    drawing = true;
  }
  return path;
}

/** The plots, clipped to the plot area by a nested svg. */
function plotsLayer(plots, scaleX, scaleY, plot) {
  const paths = plots
    .map((points, index) => ({ path: plotPath(points, scaleX, scaleY, plot), color: plotColor(index) }))
    .filter(({ path }) => path)
    .map(({ path, color }) => `<path d="${path}" fill="none" stroke="${color}" stroke-width="1" stroke-linejoin="miter"/>`)
    .join("");
  return `<svg class="grafico-trazos" x="${plot.x}" y="${plot.y}" width="${plot.width}" height="${plot.height}">${paths}</svg>`;
}

// ——— The scales ———

function scaleY(scale, plot, separator) {
  const labels = ticks(scale).map((value) => ({ text: tickLabel(value, separator), row: plot.y + plot.height - 1 - along(value, scale, plot.height) }));
  const marks = labels.map(({ row }) => rect(plot.x - TICK.yBeforePlot, row, TICK.length, 1, "#000000")).join("");
  const texts = labels.map(({ text, row }) => `<text class="grafico-texto marca-y" x="${plot.x - LABELS.yGap}" y="${row + LABELS.yBaselineBelowTick}" text-anchor="end">${esc(text)}</text>`).join("");
  return { marks, texts, widest: Math.max(0, ...labels.map(({ text }) => textWidth(text))) };
}

function scaleX(scale, plot, separator) {
  const labels = ticks(scale).map((value) => ({ text: tickLabel(value, separator), column: plot.x + along(value, scale, plot.width) }));
  const marks = labels.map(({ column }) => rect(column, plot.y + plot.height + TICK.xBelowPlot, 1, TICK.length, "#000000")).join("");
  const texts = labels.map(({ text, column }) => `<text class="grafico-texto marca-x" x="${column + 0.5}" y="${plot.y + plot.height + LABELS.xBaselineBelow}" text-anchor="middle">${esc(text)}</text>`).join("");
  return marks + texts;
}

/**
 * The SVG of an object, from its node, the type its wire carries (nothing, if it is not wired or the wire is broken),
 * the last value written to it and the histories of the charts. `separator` is the decimal separator of the system.
 */
export function graphSvg(node, { type, value, charts, separator }) {
  const measures = GRAPH_MEASURES[node.tipo];
  const { plot } = measures;
  const { plots, scaleX: xScale, scaleY: yScale } = displayedGraph(node, type, value, charts, plot);

  let body = bevelFrame(measures.width, measures.height) + plotBox(plot) + grid(node.tipo, xScale, yScale, plot) + plotsLayer(plots, xScale, yScale, plot);
  let yLabelsWidth = 0;
  if (isShown(node, "y-scale")) {
    const y = scaleY(yScale, plot, separator);
    body += y.marks + y.texts;
    yLabelsWidth = y.widest;
  }
  if (isShown(node, "x-scale")) body += scaleX(xScale, plot, separator);
  if (isShown(node, "x-scale-label") && isShown(node, "x-scale")) {
    body += `<text class="grafico-texto nombre-x" x="${plot.x + plot.width / 2}" y="${plot.y + plot.height + NAMES.xBaselineBelow}" text-anchor="middle">${X_AXIS_NAME}</text>`;
  }
  if (isShown(node, "y-scale-label") && isShown(node, "y-scale")) {
    const baseline = plot.x - NAMES.yGapToLabels - yLabelsWidth + 0.5;
    body += `<text class="grafico-texto nombre-y" transform="translate(${baseline} ${plot.y + plot.height / 2}) rotate(-90)" text-anchor="middle">${Y_AXIS_NAME}</text>`;
  }
  if (isShown(node, "plot-legend")) body += legend(measures);
  return `<svg class="grafico-dibujo" width="${measures.width}" height="${measures.height}" viewBox="0 0 ${measures.width} ${measures.height}" shape-rendering="crispEdges" aria-hidden="true">${body}</svg>`;
}
