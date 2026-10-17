// From the value written to a Waveform Chart, Waveform Graph or XY Graph to
// what is drawn: the plots as (x, y) points and the range and step of each
// scale. Measured in LabVIEW 2026 Q3 (labview-captures/graphs/REPORT.md); what
// was not measured says "unverified".
//
// A pure module: the front panel calls it with the indicator's value and type.

import { dimensionsOf, esArray, esCluster } from "../../../core/model/types.mjs";

/** The chart history buffer: Chart History Length... shows 1024 by default (50-chart-history-length-dialog.png). */
export const DEFAULT_CHART_HISTORY = 1024;
/** A chart in Strip mode shows 100 points: 0..100, then it scrolls (70-chart-random-run-*.png). */
export const STRIP_SPAN = 100;
/** The default scales of a fresh graph (03-three-fresh-panel.png). */
export const DEFAULT_SCALES = {
  "waveform-chart": { x: { min: 0, max: 100, step: 100 }, y: { min: -10, max: 10, step: 5 } },
  "waveform-graph": { x: { min: 0, max: 100, step: 20 }, y: { min: -10, max: 10, step: 5 } },
  "xy-graph": { x: { min: 0, max: 10, step: 1 }, y: { min: 0, max: 10, step: 1 } },
};

// ——— Waveform Chart ———

/** An empty chart history: one list of values per plot, and how many points have ever been appended. */
export const emptyHistory = () => ({ plots: [], appended: 0 });

/**
 * The history after writing `value` of type `type` to the chart: a number adds
 * one point to Plot 0; a 1D array adds all its values at once (72); a cluster
 * of numbers adds one point to each plot (74); a 2D array adds each row as a
 * plot (unverified). The oldest points go beyond `historyLength`.
 */
export function chartAppend(history, value, type, historyLength = DEFAULT_CHART_HISTORY) {
  const additions = chartAdditions(value, type);
  const plots = additions.map((points, k) => [...(history.plots[k] ?? []), ...points].slice(-historyLength));
  for (let k = additions.length; k < history.plots.length; k++) plots.push(history.plots[k]);
  const longest = Math.max(0, ...additions.map((points) => points.length));
  return { plots, appended: history.appended + longest };
}

function chartAdditions(value, type) {
  if (esCluster(type)) return type.cluster.map((field) => [Number(value?.[field.name] ?? 0)]);
  if (esArray(type) && dimensionsOf(type) === 2) return (value ?? []).map((row) => row.map(Number));
  if (esArray(type)) return [(value ?? []).map(Number)];
  return [[Number(value ?? 0)]];
}

/**
 * The plots of a chart as points: each value at its index since the chart was
 * last cleared, so the X axis counts points, not time (70).
 */
export function chartPlots(history) {
  return history.plots.map((values) => {
    const first = history.appended - values.length;
    return values.map((y, i) => ({ x: first + i, y }));
  });
}

/** The X scale of a chart in Strip mode: 0..100 until 100 points are in, then the last 100 (0..100 → 5..105 → 26..126). */
export function stripXScale(history) {
  const last = Math.max(0, history.appended - 1);
  const min = Math.max(0, last - STRIP_SPAN);
  return { min, max: min + STRIP_SPAN, step: STRIP_SPAN };
}

// ——— Waveform Graph and XY Graph ———

/**
 * The plots of a Waveform Graph: a 1D array against its index (80), each row
 * of a 2D array as a plot (82), a cluster of x0, dx and an array placed at
 * x0 + i·dx (87), or an array of such clusters, one plot each (unverified).
 */
export function graphPlots(value, type) {
  if (esCluster(type)) return [timedPlot(value, type)];
  if (esArray(type) && esCluster(type.array)) return (value ?? []).map((item) => timedPlot(item, type.array));
  if (esArray(type) && dimensionsOf(type) === 2) return (value ?? []).map(indexedPlot);
  return [indexedPlot(value ?? [])];
}

const indexedPlot = (values) => values.map((y, x) => ({ x, y: Number(y) }));

function timedPlot(value, type) {
  const [x0, dx, values] = type.cluster.map((field) => value?.[field.name]);
  return (values ?? []).map((y, i) => ({ x: Number(x0 ?? 0) + i * Number(dx ?? 1), y: Number(y) }));
}

/**
 * The plots of an XY Graph: a cluster of an X array and a Y array (85), an
 * array of such clusters, one plot each, or an array of (X, Y) points as one
 * plot (the last two unverified). Unpaired values are left out.
 */
export function xyPlots(value, type) {
  const pairs = (xs = [], ys = []) => Array.from({ length: Math.min(xs.length, ys.length) }, (_, i) => ({ x: Number(xs[i]), y: Number(ys[i]) }));
  const fieldsOf = (cluster) => cluster.cluster.map((field) => field.name);
  if (esCluster(type)) {
    const [xName, yName] = fieldsOf(type);
    return [pairs(value?.[xName], value?.[yName])];
  }
  const item = type.array;
  const [xName, yName] = fieldsOf(item);
  if (esArray(item.cluster[0].type)) return (value ?? []).map((plot) => pairs(plot[xName], plot[yName]));
  return [(value ?? []).map((point) => ({ x: Number(point[xName]), y: Number(point[yName]) }))];
}

// ——— Scales ———

const NICE_STEPS = [1, 2, 5];
/** Divisions aimed at: with Loose Fit about 7 (0..127 gives 0..140 by 20, 0..264 gives 0..300 by 50); tight about 10 (−1..1 by 0.2). */
const LOOSE_DIVISIONS = 7;
const TIGHT_DIVISIONS = 10;

/** The smallest step of the 1-2-5 series that is at least `rough`. */
function niceStep(rough) {
  if (!(rough > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = NICE_STEPS.map((n) => n * power).find((candidate) => candidate >= rough * (1 - 1e-9));
  return step ?? 10 * power;
}

/**
 * A chart of a constant 5 autoscaled to 4.4..5.6 in LabVIEW (examples/README.md,
 * Instrument Protocol): 5 ± 10 % is 4.5..5.5, which Loose Fit rounds out to whole
 * steps of 0.2. Unverified for other values, and for a constant 0, which keeps the fallback.
 */
const FLAT_RANGE_MARGIN = 0.1;

/**
 * The autoscaled range of `values`: with Loose Fit the ends move out to whole
 * steps (0..127 → 0..140, step 20; −1..1 → −1..1, step 0.5); without it the
 * range is the data's own (XY Graph: −1..1, step 0.2). With no data `fallback`
 * is kept; when every value is the same the range is widened by a tenth of it
 * each way (see `FLAT_RANGE_MARGIN`). The exact algorithm of LabVIEW is
 * unverified; these cases are the measured ones.
 *
 * Given `axis` ({ length, minSpacing }: the axis in pixels and the least
 * distance between two labels) the step is the smallest of the 1-2-5 series
 * that keeps the labels `minSpacing` apart, which explains every measured
 * case at the size of each plot (232 and 166 px, and 248 px in the XY Graph;
 * see `AXIS_MIN_SPACING`). Without it, the divisions of the first cases are aimed at.
 */
export function autoscale(values, looseFit, fallback, axis) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return fallback;
  let [low, high] = [Math.min(...finite), Math.max(...finite)];
  if (low === high) {
    if (low === 0) return fallback;
    [low, high] = [low - Math.abs(low) * FLAT_RANGE_MARGIN, high + Math.abs(high) * FLAT_RANGE_MARGIN];
  }
  const step = axis ? stepKeepingLabelsApart(low, high, looseFit, axis) : niceStep((high - low) / (looseFit ? LOOSE_DIVISIONS : TIGHT_DIVISIONS));
  if (!looseFit) return { min: low, max: high, step };
  return { min: Math.floor(low / step + 1e-9) * step, max: Math.ceil(high / step - 1e-9) * step, step };
}

/**
 * The least distance in pixels between two labels of an axis. Bounded by the
 * measured steps: Y labels were accepted 24.8 px apart (XY Graph, −1..1 every 0.2)
 * and refused 16.6 px apart (Waveform Graph, −1..1 every 0.1 became 0.5); X labels
 * were accepted 33 px apart (0..140 every 20) and refused 24.8 px apart (XY
 * Graph, −1..1 every 0.2 became 0.5), as they are wider. 20 and 30 are inside
 * those bounds; LabVIEW's own values are unverified.
 */
export const AXIS_MIN_SPACING = { x: 30, y: 20 };

const MAX_STEP_CANDIDATES = 60;

/** The smallest step of the 1-2-5 series whose labels end up `minSpacing` px apart on an axis `length` px long. */
function stepKeepingLabelsApart(low, high, looseFit, { length, minSpacing }) {
  const spacingOf = (step) => {
    const [min, max] = looseFit ? [Math.floor(low / step + 1e-9) * step, Math.ceil(high / step - 1e-9) * step] : [low, high];
    return (step / (max - min)) * length;
  };
  const smallestExponent = Math.floor(Math.log10(high - low)) - 2;
  for (let candidate = 0; candidate < MAX_STEP_CANDIDATES; candidate++) {
    const step = NICE_STEPS[candidate % NICE_STEPS.length] * 10 ** (smallestExponent + Math.floor(candidate / NICE_STEPS.length));
    if (spacingOf(step) >= minSpacing * (1 - 1e-9)) return step;
  }
  return niceStep((high - low) / LOOSE_DIVISIONS);
}

/** The tick values of a scale, from its minimum to its maximum, one per step. */
export function ticks({ min, max, step }) {
  const count = Math.round((max - min) / step);
  return Array.from({ length: count + 1 }, (_, i) => Number((min + i * step).toPrecision(12)));
}
