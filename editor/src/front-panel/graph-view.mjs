// How a Waveform Chart, a Waveform Graph and an XY Graph are drawn on the Front
// Panel, at 1:1. Everything is measured in LabVIEW 2026 Q3 on
// labview-captures/graphs/03-three-fresh-panel.png (the fresh objects) and 80,
// 89 (with data), pixel by pixel; the drawing is ours (DT-035 §8): rectangles,
// lines and text, not NI's bitmaps. What was not measured says "unverified".
//
// Pure: it returns the SVG of an object from its settings and its data
// (graph-state.mjs); the panel puts it in a box (front-panel.mjs). The SVG has
// classes, not colors: a panel style colors it (DT-058). LabVIEW's frame, the
// bevel of the plot area and of the legend's swatch are ornament parts, hidden
// in Plain; Old School colors them as measured (panel-styles/old-school.css).

import { ticks } from "./plot-data.mjs";
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

/**
 * The frame's bevel: 13 columns on the left and a dark bar of 13 on the right, 2 rows at the top and at the bottom
 * (03, row 200 of the chart); their colors are the style's.
 */
const FRAME = { sideColumns: 13, edgeRows: 2 };

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
const rect = (className, x, y, width, height) => `<rect class="${className}" x="${num(x)}" y="${num(y)}" width="${num(width)}" height="${num(height)}"/>`;
/** A group of shapes; `ornament` ones are hidden in Plain (html-controls.mjs, ORNAMENT_CLASSES). */
const group = (className, body, ornament = false) => `<g class="${className}"${ornament ? ` aria-hidden="true"` : ""}>${body}</g>`;

/** Half-down rounding: the grid lines of 03 fall where `Math.round` would put them one pixel off on a .5. */
const roundHalfDown = (n) => Math.ceil(n - 0.5);

/** The label of a tick as LabVIEW writes it: the shortest form, with the decimal separator of the system. */
export function tickLabel(value, separator) {
  return String(Number(value.toPrecision(12))).replace(".", separator);
}

// ——— The frame (ornament) ———

/**
 * LabVIEW's grey frame of a graph or a legend, one shape per row and column of its bevel, in the order they were
 * measured to overlap: the fill, the left columns, the right bar, the top rows and the bottom rows over all.
 */
function frameOrnament(width, height) {
  const { sideColumns, edgeRows } = FRAME;
  const barStart = width - sideColumns;
  const indices = (count) => Array.from({ length: count }, (_, index) => index);
  const pieces = [
    rect("sd-frame-fill", 0, 0, width, height),
    group("sd-frame-left", indices(sideColumns).map((column) => rect("sd-frame-line", column, 0, 1, height)).join("")),
    group("sd-frame-right", indices(sideColumns).map((column) => rect("sd-frame-line", barStart + column, 0, 1, height)).join("")),
    group("sd-frame-top", indices(edgeRows).map((row) => rect("sd-frame-line", sideColumns, row, barStart - sideColumns, 1)).join("")),
    group("sd-frame-top-over-bar", indices(edgeRows).map((row) => rect("sd-frame-line", barStart, row, sideColumns, 1)).join("")),
    group("sd-frame-bottom", indices(edgeRows).map((row) => rect("sd-frame-line", 0, height - edgeRows + row, width, 1)).join("")),
  ];
  return group("sd-frame", pieces.join(""), true);
}

/** The legend: a box with the plot's name and its swatch; the swatch's bevel is ornament. */
function legend(measures) {
  const { width, height, gap, textX, textBaseline, swatch } = LEGEND;
  const zigzag = [[1, 11], [8, 2], [14, 10], [20, 3], [26, 9]].map(([x, y]) => `${x},${y}`).join(" ");
  const swatchFrame = group(
    "sd-swatch-frame",
    rect("sd-swatch-dark", 0, 0, swatch.width, swatch.height) + rect("sd-swatch-inner", 1, 1, swatch.width - 2, swatch.height - 2) +
      rect("sd-swatch-light", swatch.width - 1, 1, 1, swatch.height - 1) + rect("sd-swatch-light", 1, swatch.height - 1, swatch.width - 1, 1),
    true,
  );
  return `<g class="sd-legend" data-parte="legend" transform="translate(${measures.width - width} ${-(height + gap)})">` +
    frameOrnament(width, height) +
    `<rect class="sd-legend-box" x="0.5" y="0.5" width="${width - 1}" height="${height - 1}"/>` +
    `<text class="sd-legend-text" x="${textX}" y="${textBaseline}">Plot 0</text>` +
    `<g class="sd-swatch" data-parte="plot-swatch" transform="translate(${swatch.x} ${swatch.y})">${swatchFrame}` +
    `<rect class="sd-swatch-box" x="0.5" y="0.5" width="${swatch.width - 1}" height="${swatch.height - 1}"/>` +
    `<polyline class="sd-trace" data-plot="0" points="${zigzag}" transform="translate(1 1)"/></g></g>`;
}

// ——— The plot area ———

/** The pixel of `value` along an axis of `length` pixels (the first and last values fall on the first and last pixel, as the ticks do in 03). */
const along = (value, scale, length) => roundHalfDown(((value - scale.min) / (scale.max - scale.min)) * (length - 1));

/** The plot area, with its 1 px bevel as ornament: dark above and on the left, light below and on the right. */
function plotArea(plot) {
  const bevel = group(
    "sd-plot-frame",
    group("sd-plot-frame-dark", rect("sd-plot-frame-line", plot.x - 1, plot.y - 1, plot.width + 1, 1) + rect("sd-plot-frame-line", plot.x - 1, plot.y - 1, 1, plot.height + 1)) +
      group("sd-plot-frame-light", rect("sd-plot-frame-line", plot.x - 1, plot.y + plot.height, plot.width + 1, 1) + rect("sd-plot-frame-line", plot.x + plot.width, plot.y - 1, 1, plot.height + 2)),
    true,
  );
  return bevel + rect("sd-plot", plot.x, plot.y, plot.width, plot.height);
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

/** The grid: one path per weight of line, `sd-grid-minor` and `sd-grid-major`. */
function grid(kind, xScale, yScale, plot) {
  const subdivisions = GRID_SUBDIVISIONS[kind];
  if (!subdivisions) return "";
  const columns = gridPositions(xScale, plot.width, subdivisions.x);
  const rows = gridPositions(yScale, plot.height, subdivisions.y);
  return ["minor", "major"]
    .map((weight) => {
      const vertical = columns[weight].map((position) => `M${plot.x + position + 0.5} ${plot.y}v${plot.height}`);
      const horizontal = rows[weight].map((position) => `M${plot.x} ${plot.y + plot.height - 1 - position + 0.5}h${plot.width}`);
      return vertical.length + horizontal.length ? `<path class="sd-grid-line sd-grid-${weight}" d="${[...vertical, ...horizontal].join("")}"/>` : "";
    })
    .join("");
}

const COORDINATE_LIMIT = 100000;
const clamp = (n) => Math.max(-COORDINATE_LIMIT, Math.min(COORDINATE_LIMIT, n));

/** One plot as a 1 px polyline, with no antialiasing and no point style (REPORT §5); a point that is not a number breaks the line. */
function plotPath(points, xScale, yScale, plot) {
  let path = "";
  let drawing = false;
  for (const { x, y } of points) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      drawing = false;
      continue;
    }
    const pixelX = clamp(((x - xScale.min) / (xScale.max - xScale.min)) * (plot.width - 1) + 0.5);
    const pixelY = clamp(plot.height - 1 - ((y - yScale.min) / (yScale.max - yScale.min)) * (plot.height - 1) + 0.5);
    path += `${drawing ? "L" : "M"}${num(pixelX)} ${num(pixelY)}`;
    drawing = true;
  }
  return path;
}

/**
 * The plots, clipped to the plot area by a nested svg. Each one is a path, even an empty one, so the n-th path is the
 * n-th plot and a style can color them in turn (`:nth-child`); `data-plot` says which plot it is.
 */
function plotsLayer(plots, xScale, yScale, plot) {
  const paths = plots.map((points, index) => `<path class="sd-trace" data-plot="${index}" d="${plotPath(points, xScale, yScale, plot)}"/>`).join("");
  return `<svg class="sd-traces" x="${plot.x}" y="${plot.y}" width="${plot.width}" height="${plot.height}">${paths}</svg>`;
}

// ——— The scales ———

/** Where the tick labels of the Y axis go: their text and the row of their tick. */
const yTicks = (scale, plot, separator) => ticks(scale).map((value) => ({ text: tickLabel(value, separator), row: plot.y + plot.height - 1 - along(value, scale, plot.height) }));
/** Where the tick labels of the X axis go: their text and the column of their tick. */
const xTicks = (scale, plot, separator) => ticks(scale).map((value) => ({ text: tickLabel(value, separator), column: plot.x + along(value, scale, plot.width) }));
const widestLabel = (labels) => Math.max(0, ...labels.map(({ text }) => textWidth(text)));

function scaleY(scale, plot, separator) {
  const labels = yTicks(scale, plot, separator);
  const marks = labels.map(({ row }) => rect("sd-tick", plot.x - TICK.yBeforePlot, row, TICK.length, 1)).join("");
  const texts = labels.map(({ text, row }) => `<text class="sd-tick-text sd-tick-y" x="${plot.x - LABELS.yGap}" y="${row + LABELS.yBaselineBelowTick}" text-anchor="end">${esc(text)}</text>`).join("");
  return { body: marks + texts, widest: widestLabel(labels) };
}

function scaleX(scale, plot, separator) {
  const labels = xTicks(scale, plot, separator);
  const marks = labels.map(({ column }) => rect("sd-tick", column, plot.y + plot.height + TICK.xBelowPlot, 1, TICK.length)).join("");
  const texts = labels.map(({ text, column }) => `<text class="sd-tick-text sd-tick-x" x="${column + 0.5}" y="${plot.y + plot.height + LABELS.xBaselineBelow}" text-anchor="middle">${esc(text)}</text>`).join("");
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

  let body = frameOrnament(measures.width, measures.height) + plotArea(plot) + grid(node.tipo, xScale, yScale, plot) + plotsLayer(plots, xScale, yScale, plot);
  let yLabelsWidth = 0;
  if (isShown(node, "y-scale")) {
    const y = scaleY(yScale, plot, separator);
    body += y.body;
    yLabelsWidth = y.widest;
  }
  if (isShown(node, "x-scale")) body += scaleX(xScale, plot, separator);
  if (isShown(node, "x-scale-label") && isShown(node, "x-scale")) {
    body += `<text class="sd-axis-name sd-axis-x" x="${plot.x + plot.width / 2}" y="${plot.y + plot.height + NAMES.xBaselineBelow}" text-anchor="middle">${X_AXIS_NAME}</text>`;
  }
  if (isShown(node, "y-scale-label") && isShown(node, "y-scale")) {
    const baseline = plot.x - NAMES.yGapToLabels - yLabelsWidth + 0.5;
    body += `<text class="sd-axis-name sd-axis-y" transform="translate(${baseline} ${plot.y + plot.height / 2}) rotate(-90)" text-anchor="middle">${Y_AXIS_NAME}</text>`;
  }
  if (isShown(node, "plot-legend")) body += legend(measures);
  return `<svg class="sd-graph-art" width="${measures.width}" height="${measures.height}" viewBox="0 0 ${measures.width} ${measures.height}" aria-hidden="true">${body}</svg>`;
}
