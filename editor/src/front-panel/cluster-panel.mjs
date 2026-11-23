// A user's cluster on the Front Panel (DT-095): its shell, where its elements sit and how a control becomes one.
//
// Measured in LabVIEW 2026 Q3 (labview-captures/reports/2026-11-16-cluster-panel.md §1-2): the empty shell is 100 × 100
// with a 4 px bevel, its label sits above it, left-aligned, 2 px away; AutoSizing is None, so the shell never grows when
// elements are dropped in; each element is centred on the drop point, pushed inside the inner left edge, and may overlap
// the others. The order of the elements is the drop order.
//
// Pure functions over the graph. The drawing is cluster-view.mjs; the press, drag and release are front-panel.mjs.

import { hasElements, setClusterElements } from "../../../core/model/user-cluster.mjs";
import { typeDefinitionLink } from "../../../core/model/type-definition.mjs";
import { BOOLEANOS } from "../common/glyphs.mjs";
import { flipArrayKind } from "../common/array-typing.mjs";

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

/** Does this cluster follow a type definition? Its elements are the definition's (reports/2026-11-23-typedef-instances.md Q4). */
export const isLinkedCluster = (node) => hasElements(node) && typeof typeDefinitionLink(node)?.path === "string";

/**
 * The topmost cluster of the panel whose interior holds the point, apart from the nodes in `except`, or undefined. A
 * cluster that follows a type definition takes no new element: an object dropped on it lands on the panel, outside it,
 * and the link is untouched (measured, Q4).
 */
export const clusterAt = (g, point, except = []) =>
  g.nodos.filter((node) => node.panel && hasElements(node) && !isLinkedCluster(node) && !except.includes(node.id) && contains(interiorBox(shellBox(node)), point)).at(-1);

/**
 * Whether the selection holds an element of a linked cluster (an unfolded element is `inside` its cluster, DT-106): it
 * cannot be cut, copied or deleted, the elements being the definition's (measured: Edit ▸ Cut, Copy and Delete greyed and
 * the Delete key doing nothing, Q4). Its label can still be renamed.
 */
export const selectsLockedElement = (g, selection) =>
  selection.some((id) => {
    const holder = g.nodos.find((node) => node.id === id)?.inside;
    return holder !== undefined && isLinkedCluster(g.nodos.find((node) => node.id === holder));
  });

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
export function elementConfig(config, block) {
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

/** The graph with the shell of cluster `id` in `box`: its corner and its size. */
export const withShellBox = (g, id, box) => ({
  ...g,
  nodos: g.nodos.map((node) => (node.id === id ? { ...node, panel: { ...node.panel, x: box.x, y: box.y, w: box.ancho, h: box.alto } } : node)),
});

/** A cluster's element as a node of the panel, so that the objects' drawing and measures serve it: its id says where it is. */
export const elementNode = (cluster, element, index) => ({ ...element, id: `${cluster.id}.elements.${index}`, panel: { x: element.x, y: element.y } });

/** An element, folded or unfolded, as the block it takes when its cluster is a control or an indicator. */
function flippedElement(element, clusterBlock) {
  const block = elementBlock(element.tipo, clusterBlock);
  return { ...element, tipo: block, config: elementConfig(element.config, block) };
}

/**
 * Change to Indicator (or to Control) of cluster `id`: the shell and every element in it flip together, since all the
 * elements of a cluster are controls or all indicators (reports/2026-11-16-cluster-panel.md §6). The terminal flips and
 * its wires keep their node with the port renamed, as for any panel object (`flipArrayKind`). The elements are the
 * cluster's own (folded) or the objects inside it (unfolded, DT-106), at any depth.
 */
export function flipCluster(g, cat, id) {
  const flipped = flipArrayKind(g, id);
  const cluster = flipped.nodos.find((node) => node.id === id);
  const insideIds = new Set([id]);
  const nodos = flipped.nodos.map((node) => {
    if (node.id === id || !insideIds.has(node.inside)) return node;
    insideIds.add(node.id);
    return flippedElement(node, cluster.tipo);
  });
  const withObjects = { ...flipped, nodos };
  return setClusterElements(withObjects, cat, id, cluster.config.elements.map((element) => flippedElement(element, cluster.tipo)));
}
