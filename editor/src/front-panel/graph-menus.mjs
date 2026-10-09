// The right-click menus of the graphs (labview-captures/graphs/10..45, 88, 89)
// and what their rows do: which ones carry a check mark, which are greyed by the
// state of the object and what the ones that are done change. The rows
// themselves are in the inventory (`context.waveform-chart`, `context.waveform-graph`,
// `context.xy-graph`; in Run mode `context.run-chart` and `context.run-graph`).
//
// Pure, over the panel state `d`: `{ g, menu, valores, charts, graphDialog }`.

import * as Gr from "../../../core/model/graph.mjs";
import { clearedChart, displayedGraph, graphSettings, isGraph, toggledItem, wireTypeOf } from "./graph-state.mjs";
import { GRAPH_MEASURES } from "./graph-view.mjs";
import { open as openHistoryDialog } from "./chart-history-dialog.mjs";

const lastSegment = (id) => id.slice(id.lastIndexOf(".") + 1);

/** The Run mode menus: the one of the chart and the one of the graph (and, unverified, of the XY Graph). */
export const runMenuRoot = (node) => (node.tipo === "waveform-chart" ? "context.run-chart" : "context.run-graph");

/** The node a graph menu was opened on, or nothing if the open menu is not a graph's. */
function menuNode(d) {
  const node = d.menu && d.g.nodos.find((candidate) => candidate.id === d.menu.nodo);
  return isGraph(node) ? node : undefined;
}

/** Whether a menu belongs to a graph: its root is one of theirs. */
export const isGraphMenu = (d) => !!menuNode(d) && /^context\.(waveform-chart|waveform-graph|xy-graph|run-chart|run-graph)$/.test(d.menu.raiz);

/** The rows with a check mark: what is shown, which axes autoscale, and what LabVIEW has on by default and Solder does not do yet. */
export function graphMenuMarks(d) {
  const node = menuNode(d);
  if (!node) return new Set();
  const root = d.menu.raiz;
  const settings = graphSettings(node);
  const marks = new Set();
  const shown = (item) => !settings.hidden.has(item);
  for (const item of ["label", "plot-legend", "x-scale", "y-scale"]) if (shown(item)) marks.add(`${root}.visible-items.${item}`);
  if (root.startsWith("context.run-")) {
    if (settings.autoscaleX) marks.add(`${root}.autoscale-x`);
    if (settings.autoscaleY) marks.add(`${root}.autoscale-y`);
    // 88 and 89: the chart's legend is autosized, the graph's is not; the graph smooths its updates.
    if (root === "context.run-chart") marks.add(`${root}.autosize-plot-legend`);
    else marks.add(`${root}.smooth-updates`);
    return marks;
  }
  if (settings.autoscaleX) marks.add(`${root}.x-scale.autoscale-x`);
  // Loose Fit is only in force (and checked) while its axis autoscales (14: greyed and unchecked on the chart's X).
  if (settings.autoscaleX && settings.looseFitX) marks.add(`${root}.x-scale.loose-fit`);
  if (shown("x-scale-label")) marks.add(`${root}.x-scale.visible-scale-label`);
  if (settings.autoscaleY) marks.add(`${root}.y-scale.autoscale-y`);
  if (settings.autoscaleY && settings.looseFitY) marks.add(`${root}.y-scale.loose-fit`);
  if (shown("y-scale-label")) marks.add(`${root}.y-scale.visible-scale-label`);
  marks.add(`${root}.autosize-plot-legend`);
  marks.add(`${root}.advanced.auto-adjust-scales`);
  if (node.tipo !== "waveform-chart") {
    marks.add(`${root}.advanced.smooth-updates`);
    marks.add(`${root}.advanced.cursors-scroll-graph`);
  }
  if (node.tipo === "xy-graph") marks.add(`${root}.optional-plane.none`);
  return marks;
}

/** Loose Fit is greyed while its axis does not autoscale (14: chart X, with AutoScale X unchecked). */
export function graphMenuVariants(d) {
  const node = menuNode(d);
  if (!node || d.menu.raiz.startsWith("context.run-")) return {};
  const settings = graphSettings(node);
  const root = d.menu.raiz;
  return { desactivados: new Set([...(settings.autoscaleX ? [] : [`${root}.x-scale.loose-fit`]), ...(settings.autoscaleY ? [] : [`${root}.y-scale.loose-fit`])]) };
}

/**
 * The patch that switches the autoscale of an axis. Switching it off keeps the range the axis showed
 * (REPORT §4: it stays where it was); the X of a chart is the Strip window, which has no range to keep.
 */
function autoscalePatch(node, axis, d, ctx) {
  const key = axis === "x" ? "autoscaleX" : "autoscaleY";
  const turningOff = graphSettings(node)[key];
  if (!turningOff) return { [key]: true };
  const patch = { [key]: false };
  if (axis === "x" && node.tipo === "waveform-chart") return patch;
  const type = wireTypeOf(d.g, Gr.tipos(d.g, ctx.cat), node.id);
  const shown = displayedGraph(node, type, d.valores?.[node.id], d.charts, GRAPH_MEASURES[node.tipo].plot);
  return { ...patch, [axis === "x" ? "scaleX" : "scaleY"]: axis === "x" ? shown.scaleX : shown.scaleY };
}

/** A boolean setting of the node, toggled. */
const toggledSetting = (node, key) => ({ [key]: !graphSettings(node)[key] });

/**
 * Runs the row `id` of a graph's menu. Returns the new state, or nothing if the row is not a graph's
 * or is one of those that are not done (the window explains them).
 */
export function graphCommand(d, id, ctx) {
  const node = menuNode(d);
  if (!node || !isGraphMenu(d)) return undefined;
  const closed = (extra) => ({ ...d, ...extra, menu: null });
  const setConfig = (patch) => closed({ g: Gr.fijarConfig(d.g, node.id, patch) });
  const last = lastSegment(id);
  const visible = /\.visible-items\.(label|plot-legend|x-scale|y-scale)$/.exec(id);
  if (visible) return setConfig(toggledItem(node, visible[1]));
  const scaleLabel = /\.(x|y)-scale\.visible-scale-label$/.exec(id);
  if (scaleLabel) return setConfig(toggledItem(node, `${scaleLabel[1]}-scale-label`));
  const autoscale = /\.autoscale-(x|y)$/.exec(id);
  if (autoscale) return setConfig(autoscalePatch(node, autoscale[1], d, ctx));
  const looseFit = /\.(x|y)-scale\.loose-fit$/.exec(id);
  if (looseFit) {
    const settings = graphSettings(node);
    return settings[`autoscale${looseFit[1].toUpperCase()}`] ? setConfig(toggledSetting(node, `looseFit${looseFit[1].toUpperCase()}`)) : d;
  }
  if (last === "clear-chart") return closed({ charts: clearedChart(d.charts, node.id) });
  if (last === "clear-graph") {
    const { [node.id]: _cleared, ...valores } = d.valores ?? {};
    return closed({ valores });
  }
  if (last === "chart-history-length") return closed({ graphDialog: openHistoryDialog(node) });
  return undefined;
}
