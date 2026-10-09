// What a Waveform Chart, a Waveform Graph or an XY Graph holds besides its
// drawing: its settings (stored in the node's `config`, so they are saved in the
// `.qvi`), the history of a chart (kept by the window, never saved) and the
// scales that result from both. Measured in LabVIEW 2026 Q3
// (labview-captures/graphs/REPORT.md); what was not measured says "unverified".
//
// Pure functions: the window holds `charts` and the VI's last `valores`.

import { AXIS_MIN_SPACING, DEFAULT_CHART_HISTORY, DEFAULT_SCALES, autoscale, chartAppend, chartPlots, emptyHistory, graphPlots, stripXScale, xyPlots } from "./plot-data.mjs";

export const GRAPH_KINDS = ["waveform-chart", "waveform-graph", "xy-graph"];
export const isGraph = (node) => GRAPH_KINDS.includes(node?.tipo);

/** The parts of a graph that Visible Items can hide, and what each is called in `config.hidden`. */
export const HIDEABLE_ITEMS = ["label", "plot-legend", "x-scale", "y-scale", "x-scale-label", "y-scale-label"];

/**
 * The settings of a graph with LabVIEW's defaults (REPORT §3): every axis
 * autoscales with Loose Fit except the X of a chart, which is the Strip window.
 */
export function graphSettings(node) {
  const config = node.config ?? {};
  return {
    autoscaleX: config.autoscaleX ?? node.tipo !== "waveform-chart",
    autoscaleY: config.autoscaleY ?? true,
    looseFitX: config.looseFitX ?? true,
    looseFitY: config.looseFitY ?? true,
    scaleX: config.scaleX,
    scaleY: config.scaleY,
    historyLength: config.historyLength ?? DEFAULT_CHART_HISTORY,
    hidden: new Set(config.hidden ?? []),
  };
}

/** Whether an item of the graph is shown. */
export const isShown = (node, item) => !graphSettings(node).hidden.has(item);

/** Visible Items ▸ Label of a graph hides its label, on both canvases; every other object always shows it. */
export const labelShown = (node) => !isGraph(node) || isShown(node, "label");

/** The patch for `fijarConfig` that shows or hides `item`. */
export function toggledItem(node, item) {
  const hidden = new Set(graphSettings(node).hidden);
  if (!hidden.delete(item)) hidden.add(item);
  return { hidden: HIDEABLE_ITEMS.filter((name) => hidden.has(name)) };
}

// ——— The history of a chart ———

/** What identifies the data a chart can hold: a chart is cleared when the type of its wire changes (REPORT §4). */
export const typeKey = (type) => JSON.stringify(type ?? null);

/** The history of a chart that matches `type`, or an empty one. */
export const historyOf = (charts, nodeId, type) => {
  const state = charts?.[nodeId];
  return state && state.typeKey === typeKey(type) ? state.history : emptyHistory();
};

/** The charts after the chart `nodeId` was written the `values` (in order), each one a point, a row or a cluster. */
export function appendedToChart(charts, nodeId, values, type, historyLength) {
  let history = historyOf(charts, nodeId, type);
  for (const value of values) history = chartAppend(history, value, type, historyLength);
  return { ...charts, [nodeId]: { history, typeKey: typeKey(type) } };
}

/** Clear Chart: its history goes (REPORT §4, 75). */
export function clearedChart(charts, nodeId) {
  if (!charts?.[nodeId]) return charts ?? {};
  const { [nodeId]: _gone, ...rest } = charts;
  return rest;
}

/**
 * The charts that still make sense in `g`: a chart that was deleted, or whose
 * wire now carries another type, loses its history (REPORT §4: "rewiring its
 * terminal clears it"). Returns the same object when nothing changes.
 */
export function reconciledCharts(charts, g, resolvedTypes) {
  if (!charts) return charts;
  const kept = Object.entries(charts).filter(([nodeId, state]) => {
    const node = g.nodos.find((candidate) => candidate.id === nodeId);
    return node?.tipo === "waveform-chart" && state.typeKey === typeKey(wireTypeOf(g, resolvedTypes, nodeId));
  });
  return kept.length === Object.keys(charts).length ? charts : Object.fromEntries(kept);
}

// ——— What is drawn ———

/**
 * The type of the data a graph receives: the one its wire carries, if the graph
 * accepts it. A broken wire (a type the graph does not accept) gives no data.
 */
export function wireTypeOf(g, resolvedTypes, nodeId) {
  const wire = g.cables.find((candidate) => candidate.a.nodo === nodeId && candidate.a.puerto === "value");
  const resolved = wire && resolvedTypes.cables.get(wire.id);
  return resolved && !resolved.roto ? resolved.tipo : undefined;
}

/** The plots of a graph as points, from what the window knows now. */
function plotsOf(node, type, value, charts) {
  const settings = graphSettings(node);
  if (type === undefined) return { plots: [], history: emptyHistory() };
  if (node.tipo === "waveform-chart") {
    const history = historyOf(charts, node.id, type);
    const trimmed = { ...history, plots: history.plots.map((values) => values.slice(-settings.historyLength)) };
    return { plots: chartPlots(trimmed), history: trimmed };
  }
  if (value === undefined || value === null) return { plots: [], history: emptyHistory() };
  const plots = node.tipo === "xy-graph" ? xyPlots(value, type) : graphPlots(value, type);
  return { plots, history: emptyHistory() };
}

const valuesOf = (plots, axis) => plots.flatMap((plot) => plot.map((point) => point[axis]));

/**
 * The plots and the two scales a graph shows. The chart's X is the Strip window unless AutoScale X is on
 * (then it fits all the history: unverified); an axis with autoscale off keeps the last range it had
 * (`config.scaleX`, `config.scaleY`, set when it was switched off) or the defaults of a fresh graph.
 * The chart autoscales Y over the points it shows (unverified).
 */
export function displayedGraph(node, type, value, charts, plotSize) {
  const settings = graphSettings(node);
  const defaults = DEFAULT_SCALES[node.tipo];
  const { plots, history } = plotsOf(node, type, value, charts);
  const axisOf = (axis, length) => ({ length, minSpacing: AXIS_MIN_SPACING[axis] });

  let scaleX;
  if (node.tipo === "waveform-chart" && !settings.autoscaleX) scaleX = stripXScale(history);
  else scaleX = settings.autoscaleX ? autoscale(valuesOf(plots, "x"), settings.looseFitX, defaults.x, axisOf("x", plotSize.width)) : (settings.scaleX ?? defaults.x);

  const visible = node.tipo === "waveform-chart" ? plots.map((plot) => plot.filter((point) => point.x >= scaleX.min && point.x <= scaleX.max)) : plots;
  const scaleY = settings.autoscaleY ? autoscale(valuesOf(visible, "y"), settings.looseFitY, defaults.y, axisOf("y", plotSize.height)) : (settings.scaleY ?? defaults.y);
  return { plots, scaleX, scaleY };
}
