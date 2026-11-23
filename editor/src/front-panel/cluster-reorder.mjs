// Reorder Controls In Cluster... (DT-095): the Front Panel's mode in which the cluster order is set by clicking the
// elements, as measured in LabVIEW 2026 Q3 (labview-captures/reports/2026-11-17-cluster-reorder.md §4-5).
//
// A click on an element gives it the number in the toolbar's field; the others renumber keeping their relative order,
// and the field advances by one, stopping at the last number (it does not wrap). ✗ brings back the order the mode
// began with and stays in the mode; ✓ leaves it, applying the new order. A click on empty background does nothing, and
// neither do Escape and Enter.
//
// Pure functions. The state lives on the panel as `reorder`: { cluster, order, fieldText, typed }, where `order` lists
// the elements' indices (their place when the mode began) in the new order, `fieldText` is what the field shows and
// `typed` says whether it was typed into since it was last selected. The Front Panel's graph is unfolded while it is
// edited (DT-106) and the mode reorders the cluster's own list, so the panel folds its graph on entering and, with
// `unfoldAfter`, unfolds it when ✓ leaves the mode.

import { setClusterElements } from "../../../core/model/user-cluster.mjs";
import { unfoldClusters } from "./cluster-unfolding.mjs";

/** The state on entering the mode for cluster node `cluster`: its order as it is, and the field at 0 with its text selected (report §2). */
export function startReorder(cluster) {
  const order = cluster.config.elements.map((_, index) => index);
  return { cluster: cluster.id, order, fieldText: "0", typed: false };
}

/** The number each element has now in the new order, by its index when the mode began. */
export function newNumbers(reorder) {
  const numbers = [];
  reorder.order.forEach((elementIndex, position) => (numbers[elementIndex] = position));
  return numbers;
}

/** Has the order changed since the mode began? ✗ is enabled only then (report §2, §4). */
export const hasChanged = (reorder) => reorder.order.some((elementIndex, position) => elementIndex !== position);

const lastNumber = (reorder) => Math.max(0, reorder.order.length - 1);

/**
 * The number a click gives: the field's, read from its text. A value above the last number is taken as the last, and an
 * empty field as 0 (both unverified: report "Not verified").
 */
function fieldNumber(reorder) {
  const typed = Number.parseInt(reorder.fieldText, 10);
  return Math.min(Number.isNaN(typed) ? 0 : typed, lastNumber(reorder));
}

const withField = (reorder, number) => ({ ...reorder, fieldText: String(number), typed: false });

/** A click on the element whose index, when the mode began, is `elementIndex`. */
export function clickElement(reorder, elementIndex) {
  const number = fieldNumber(reorder);
  const others = reorder.order.filter((index) => index !== elementIndex);
  const order = [...others.slice(0, number), elementIndex, ...others.slice(number)];
  return withField({ ...reorder, order }, Math.min(number + 1, lastNumber(reorder)));
}

/** ✗: the order the mode began with; the mode stays, and the field keeps its text (report §5). */
export const discardReorder = (reorder) => ({ ...reorder, order: reorder.order.map((_, index) => index) });

/**
 * A key typed while the mode is on: a digit goes into the field (replacing its text while it is selected, as on entry),
 * Backspace and Delete take away a digit, or all of the text while it is selected (measured on a one-digit field; with
 * more digits, which one goes is unverified). Any other key does nothing, Escape and Enter among them (report §4-5).
 */
export function typeInField(reorder, key) {
  if (/^[0-9]$/.test(key)) return { ...reorder, fieldText: reorder.typed ? reorder.fieldText + key : key, typed: true };
  if (key === "Backspace" || key === "Delete") return { ...reorder, fieldText: reorder.typed ? reorder.fieldText.slice(0, -1) : "", typed: true };
  return reorder;
}

/** ✓: the graph with the cluster's elements in the new order, whose type and value follow them. */
export function applyReorder(g, cat, reorder) {
  const cluster = g.nodos.find((node) => node.id === reorder.cluster);
  if (!cluster || !hasChanged(reorder)) return g;
  const elements = reorder.order.map((index) => cluster.config.elements[index]);
  return setClusterElements(g, cat, cluster.id, elements);
}

const unfoldedAfter = (reorder, g) => (reorder.unfoldAfter ? unfoldClusters(g) : g);

/**
 * A press while the mode is on, on `hit`: { element } (an element's index when the mode began), { button: "ok" } or
 * { button: "cancel" }, or nothing (anywhere else, which does nothing). ✗ answers only once the order changed.
 */
export function pressInReorder(p, cat, hit) {
  const { reorder } = p;
  if (hit?.element !== undefined) return { ...p, reorder: clickElement(reorder, hit.element) };
  if (hit?.button === "ok") return { ...p, g: unfoldedAfter(reorder, applyReorder(p.g, cat, reorder)), reorder: null };
  if (hit?.button === "cancel" && hasChanged(reorder)) return { ...p, reorder: discardReorder(reorder) };
  return p;
}
