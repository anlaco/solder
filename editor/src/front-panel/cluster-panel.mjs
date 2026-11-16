// A user's cluster on the Front Panel (DT-095): its shell, where its elements sit and how a control becomes one.
//
// Measured in LabVIEW 2026 Q3 (labview-captures/reports/2026-11-16-cluster-panel.md §1-2): the empty shell is 100 × 100
// with a 4 px bevel, its label sits above it, left-aligned, 2 px away; AutoSizing is None, so the shell never grows when
// elements are dropped in; each element is centred on the drop point, pushed inside the inner left edge, and may overlap
// the others. The order of the elements is the drop order.
//
// Pure functions over the graph. The drawing is cluster-view.mjs; the press, drag and release are front-panel.mjs.

import * as Gr from "../../../core/model/graph.mjs";
import * as CV from "../../../core/model/control-values.mjs";
import { hasElements, setClusterElements } from "../../../core/model/user-cluster.mjs";
import { BOOLEANOS } from "../common/glyphs.mjs";

export { hasElements as isUserCluster };

/** The empty shell is 100 × 100 and its bevel 4 px (report §1). `smallest`: what a resize stops at (unmeasured: the bevel and a pixel). */
export const CLUSTER_MEASURES = { width: 100, height: 100, bevel: 4, smallest: 9 };

/** The shell's box on the panel: its place and the size it was given, or the measured 100 × 100. */
export const shellBox = (node) => ({ x: node.panel.x, y: node.panel.y, ancho: node.panel.w ?? CLUSTER_MEASURES.width, alto: node.panel.h ?? CLUSTER_MEASURES.height });

/** What lies inside the bevel: where the elements are drawn and clipped (AutoSizing None). */
export const interiorBox = (box) => ({
  x: box.x + CLUSTER_MEASURES.bevel,
  y: box.y + CLUSTER_MEASURES.bevel,
  ancho: box.ancho - 2 * CLUSTER_MEASURES.bevel,
  alto: box.alto - 2 * CLUSTER_MEASURES.bevel,
});

const contains = (box, point) => point.x >= box.x && point.x < box.x + box.ancho && point.y >= box.y && point.y < box.y + box.alto;

/** The topmost cluster of the panel whose interior holds the point, apart from the nodes in `except`, or undefined. */
export const clusterAt = (g, point, except = []) =>
  g.nodos.filter((node) => node.panel && hasElements(node) && !except.includes(node.id) && contains(interiorBox(shellBox(node)), point)).at(-1);

/**
 * The blocks a cluster takes as elements, by the kind of the cluster: numeric, Boolean and string objects (rings and
 * enums are numerics with their own configuration). The other kinds of panel object, arrays and graphs among them,
 * are not elements yet.
 */
const BLOCKS_BY_KIND = { control: { control: "control", indicator: "indicator" }, boolean: { control: "bool-control", indicator: "bool-indicator" }, string: { control: "str-control", indicator: "str-indicator" } };
const KIND_OF_BLOCK = { control: "control", indicator: "control", "bool-control": "boolean", "bool-indicator": "boolean", "str-control": "string", "str-indicator": "string" };

/** Can a panel object of this block become an element? */
export const canBeElement = (block) => block in KIND_OF_BLOCK;

/** The block an object of `block` takes inside a cluster of `clusterBlock`: all the elements of a cluster are controls or all indicators. */
export const elementBlock = (block, clusterBlock) => BLOCKS_BY_KIND[KIND_OF_BLOCK[block]][clusterBlock === "cluster-control" ? "control" : "indicator"];

/** A Boolean's style keeps to its kind: an LED is an indicator's, a button a control's. */
function booleanStyleFor(style, isControl) {
  if (BOOLEANOS[style] && BOOLEANOS[style].indicador === !isControl) return style;
  return isControl ? "push-button" : "round-led";
}

/** An element's configuration for the block it takes: a Boolean changes style if its kind changed. */
function elementConfig(config, block) {
  const isBoolean = KIND_OF_BLOCK[block] === "boolean";
  return isBoolean ? { ...config, style: booleanStyleFor(config?.style, block === "bool-control") } : config;
}

/** The labels in use on the panel, the elements' too: LabVIEW numbers a repeated label ("Numeric 2") whatever holds it. */
function labelsInUse(g) {
  return new Set(g.nodos.flatMap((node) => [node.label?.text, ...(node.config?.elements ?? []).map((element) => element.label?.text)]));
}

/** `base`, or `base 2`, `base 3`… the first not yet used on the panel. */
export function freshLabel(g, base) {
  const used = labelsInUse(g);
  if (!used.has(base)) return base;
  let number = 2;
  while (used.has(`${base} ${number}`)) number++;
  return `${base} ${number}`;
}

/** A new element for `block` with the catalog's defaults and the palette's `config`, placed at (x, y) inside the interior. */
export function newElement(g, cat, clusterId, block, config, label, place) {
  const clusterBlock = g.nodos.find((node) => node.id === clusterId).tipo;
  const elementTipo = elementBlock(block, clusterBlock);
  const made = Gr.crearEnPanel(Gr.nuevo(), cat, elementTipo, 0, 0, freshLabel(g, label), elementConfig(config, elementTipo)).g.nodos[0];
  return { tipo: elementTipo, label: made.label, config: made.config, x: place.x, y: place.y };
}

/** The cluster with `element` appended: the drop order is the cluster order (report §3). */
export const withElement = (g, cat, clusterId, element) =>
  setClusterElements(g, cat, clusterId, [...g.nodos.find((node) => node.id === clusterId).config.elements, element]);

/** Where an element's box goes so that its corner is `corner` on the panel: relative to the interior, pushed inside its left edge (report §2). */
export function placeInside(cluster, corner) {
  const interior = interiorBox(shellBox(cluster));
  return { x: Math.max(0, corner.x - interior.x), y: corner.y - interior.y };
}

/** A panel object as an element of `cluster`: the same label and configuration, its current value as its value. */
function objectAsElement(cluster, node) {
  const block = elementBlock(node.tipo, cluster.tipo);
  const value = CV.currentValue(node);
  const config = elementConfig({ ...node.config, ...(value !== undefined && { value }) }, block);
  return { tipo: block, label: node.label, config, ...placeInside(cluster, node.panel) };
}

/**
 * Dropping controls that were moved on the panel onto the interior of a cluster: each becomes an element where it lies
 * and is removed from the panel's top level and from the diagram, with its wires, since an element has no terminal of
 * its own (DT-095 §1). Returns the graph, or null when `point` is not over a cluster or nothing dragged can be an element.
 */
export function dropObjects(g, cat, ids, point) {
  const cluster = clusterAt(g, point, ids);
  const dropped = g.nodos.filter((node) => ids.includes(node.id) && node.panel && canBeElement(node.tipo));
  if (!cluster || !dropped.length) return null;
  const elements = dropped.map((node) => objectAsElement(cluster, node));
  const without = Gr.borrar(g, dropped.map((node) => node.id));
  return { g: setClusterElements(without, cat, cluster.id, [...cluster.config.elements, ...elements]), id: cluster.id };
}

/** The graph with the shell of cluster `id` in `box`: its corner and its size. */
export const withShellBox = (g, id, box) => ({
  ...g,
  nodos: g.nodos.map((node) => (node.id === id ? { ...node, panel: { ...node.panel, x: box.x, y: box.y, w: box.ancho, h: box.alto } } : node)),
});

/** A cluster's element as a node of the panel, so that the objects' drawing and measures serve it: its id says where it is. */
export const elementNode = (cluster, element, index) => ({ ...element, id: `${cluster.id}.elements.${index}`, panel: { x: element.x, y: element.y } });
