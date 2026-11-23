// Putting objects in and out of a user's cluster on the unfolded Front Panel (DT-106). An element is a panel object marked
// `inside` its cluster; it has no terminal on the diagram, so a free object that joins a cluster loses its terminal (and its
// wires), and an element that leaves it gets one, as any panel object has (`Gr.crearEnPanel`: the terminal is where the object is).
//
// Measured in LabVIEW 2026 Q3 (labview-captures/reports/2026-11-23-cluster-elements.md Q4): an element moved within its
// cluster keeps its place in the order; released with the mouse outside the cluster's interior it becomes a free control
// that keeps its label and value; a free control released over the interior joins as the last element and is renamed if its
// label is taken ("Numeric 3" with Numeric and Numeric 2 there). The mouse release point decides.
//
// Pure functions over the unfolded graph.

import * as Gr from "../../../core/model/graph.mjs";
import { canBeElement, clusterAt, elementBlock, elementConfig, freshLabel, interiorBox, isLinkedCluster, shellBox } from "./cluster-panel.mjs";

const nodeOf = (g, id) => g.nodos.find((node) => node.id === id);

/** The ids asked for and, of each cluster among them, everything inside it at any depth, in the graph's order. */
export function withDescendants(g, ids) {
  const all = new Set(ids);
  for (let grew = true; grew; ) {
    grew = false;
    for (const node of g.nodos) {
      if (node.inside !== undefined && all.has(node.inside) && !all.has(node.id)) {
        all.add(node.id);
        grew = true;
      }
    }
  }
  return g.nodos.filter((node) => all.has(node.id)).map((node) => node.id);
}

/** Is the node carried by one of the clusters in `ids` (inside one of them, at any depth)? */
function isCarriedBy(g, ids, node) {
  for (let holder = node.inside; holder !== undefined; holder = nodeOf(g, holder)?.inside) {
    if (ids.includes(holder)) return true;
  }
  return false;
}

/** The ids that move on their own: those not inside a cluster that moves too. */
export const movingOnTheirOwn = (g, ids) => ids.filter((id) => !isCarriedBy(g, ids, nodeOf(g, id)));

/** `g` with the objects `ids` and what is inside the clusters among them moved by (dx, dy) on the panel. */
export const movedWithTheirElements = (g, ids, dx, dy) => Gr.moverEnPanel(g, withDescendants(g, ids), dx, dy);

/** `g` after cluster `id`'s shell was set to `box`: the elements keep their place in it, so they follow its corner (as stored, they are relative to it). */
export function withShellAndElements(g, id, shellAfter) {
  const before = shellBox(nodeOf(g, id));
  const inside = withDescendants(g, [id]).filter((other) => other !== id);
  const moved = Gr.moverEnPanel(g, inside, shellAfter.x - before.x, shellAfter.y - before.y);
  return { ...moved, nodos: moved.nodos.map((node) => (node.id === id ? { ...node, panel: { ...node.panel, x: shellAfter.x, y: shellAfter.y, w: shellAfter.ancho, h: shellAfter.alto } } : node)) };
}

/**
 * The panel's top level alone, with no element: what a new object's label is numbered against ("Numeric 2" when a free
 * Numeric is there; an element named Numeric does not count, as a free Numeric kept its label when pasted, measured Q3).
 */
export const topLevelOf = (g) => ({ ...g, nodos: g.nodos.filter((node) => node.inside === undefined) });

/** `g` with what was added to its top level `top` (as `made` shows it, a graph after adding objects to `top`). */
export function graftedOnto(g, top, made) {
  const known = new Set(top.nodos.map((node) => node.id));
  return { ...made, nodos: [...g.nodos, ...made.nodos.filter((node) => !known.has(node.id))] };
}

/** An element's name for the cluster's type: the node name `block_k` of an object on the panel, the first free one. */
function freeNodeName(g, block) {
  const used = new Set(g.nodos.map((node) => node.name));
  let number = 1;
  while (used.has(`${block}_${number}`)) number++;
  return `${block}_${number}`;
}

/**
 * The element `id` as a free object, in its place on the panel: a new id and name and its terminal on the diagram, where
 * it is (`Gr.crearEnPanel`). It keeps its label and value (measured). Returns `{ g, id }` with the new id.
 */
export function takenOut(g, id) {
  const node = nodeOf(g, id);
  const { inside: _cluster, ...free } = node;
  const freeId = `n${g.siguiente}`;
  const placed = { ...free, id: freeId, name: freeNodeName(g, node.tipo), x: node.panel.x, y: node.panel.y };
  const nodos = g.nodos.map((other) => (other.id === id ? placed : other.inside === id ? { ...other, inside: freeId } : other));
  return { g: { ...g, nodos, siguiente: g.siguiente + 1 }, id: freeId };
}

const withoutNumber = (text) => text.replace(/ \d+$/, "");

/** The label an object takes in a cluster: its own, or numbered ("Numeric 2") when the panel already has it. */
function labelInCluster(g, node) {
  const others = { ...g, nodos: g.nodos.filter((other) => other.id !== node.id) };
  const text = node.label?.text ?? "";
  return freshLabel(others, text) === text ? text : freshLabel(others, withoutNumber(text));
}

/** Where in the graph's order an element of `clusterId` goes to be the last one: after the cluster and all that is inside it. */
function afterLastInside(nodos, clusterId) {
  const holders = new Set([clusterId]);
  let last = nodos.findIndex((node) => node.id === clusterId);
  nodos.forEach((node, index) => {
    if (node.inside !== undefined && holders.has(node.inside)) {
      holders.add(node.id);
      last = Math.max(last, index);
    }
  });
  return last + 1;
}

/** The object as an element of `cluster`: an element's block (all the elements of a cluster are controls or all indicators), no terminal, pushed inside the interior's left edge (measured). */
function asElement(cluster, node, label) {
  const { x: _x, y: _y, name: _name, vista: _view, etiqueta: _place, ...kept } = node;
  const block = elementBlock(node.tipo, cluster.tipo);
  const interior = interiorBox(shellBox(cluster));
  const panel = { ...node.panel, x: Math.max(interior.x, node.panel.x) };
  delete panel.etiqueta;
  return { ...kept, tipo: block, label: { ...node.label, text: label }, config: elementConfig(node.config, block), panel, inside: cluster.id };
}

/**
 * The free object `id` as the last element of cluster `clusterId`: its terminal and its wires go (an element has none,
 * DT-095 §1), its label is made unique if it is taken, and it takes the cluster's kind.
 */
export function joinedTo(g, id, clusterId) {
  const cluster = nodeOf(g, clusterId);
  const node = nodeOf(g, id);
  const element = asElement(cluster, node, labelInCluster(g, node));
  const others = g.nodos.filter((other) => other.id !== id);
  const at = afterLastInside(others, clusterId);
  const cables = g.cables.filter((wire) => wire.de.nodo !== id && wire.a.nodo !== id);
  return { ...g, nodos: [...others.slice(0, at), element, ...others.slice(at)], cables };
}

/** An object newly made with `Gr.crearEnPanel` at `corner`, put in cluster `clusterId` as its last element. Returns `{ g, id }`. */
export function createdInCluster(g, cat, clusterId, { block, config, label, corner }) {
  const elementTipo = elementBlock(block, nodeOf(g, clusterId).tipo);
  const created = Gr.crearEnPanel(g, cat, elementTipo, corner.x, corner.y, label, elementConfig(config, elementTipo));
  return { g: joinedTo(created.g, created.id, clusterId), id: created.id };
}

/** The cluster that takes an object of `block` released at `point`: a user's cluster whose interior holds it, never one of `moving` nor one that follows a type definition. */
export const clusterTaking = (g, block, point, moving = []) => (canBeElement(block) ? clusterAt(g, point, moving) : undefined);

/** Where the objects of the selection go when the mouse is released at `point`. */
function settleOne(g, id, point, moving) {
  const node = nodeOf(g, id);
  if (!node?.panel) return { g, id };
  const holder = node.inside === undefined ? undefined : nodeOf(g, node.inside);
  // The elements of a cluster that follows a type definition are the definition's: they stay in it.
  if (holder && isLinkedCluster(holder)) return { g, id };
  const target = clusterTaking(g, node.tipo, point, moving);
  if (target) return target.id === node.inside ? { g, id } : { g: joinedTo(g, id, target.id), id };
  return holder ? takenOut(g, id) : { g, id };
}

/**
 * The graph after the objects `ids` were moved and the mouse released at `point` (measured, Q4): each one that was moved
 * on its own joins the cluster under the mouse as its last element, or becomes a free object if it was an element and
 * the mouse is not over its cluster's interior; one released over its own cluster stays where it is in the order.
 * `renamed`: the ids that changed, old to new.
 */
export function settleDrop(g, ids, point) {
  const moving = withDescendants(g, ids);
  const renamed = new Map();
  const settled = movingOnTheirOwn(g, ids).reduce((graph, id) => {
    const done = settleOne(graph, id, point, moving);
    if (done.id !== id) renamed.set(id, done.id);
    return done.g;
  }, g);
  return { g: settled, renamed };
}
