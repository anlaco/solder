// A Cluster Constant on the Block Diagram (DT-095, stage c): how constants become its elements and how they are operated.
//
// Measured in LabVIEW 2026 Q3 (labview-captures/reports/2026-11-17-cluster-constant-geometry.md and -elements.md, local
// evidence never committed): a numeric, Boolean or string constant whose box CENTRE lands inside the interior becomes an
// element, appended in cluster order, centred where it was dropped and clipped, never pushed in; the cluster never grows.
// A press on an element selects it alone; double click types its value as a free constant's; Delete takes it out of
// the cluster; dragged out it becomes a free constant with its value. Resizing never moves the elements.
//
// Pure functions over the diagram's state `d` (see diagram-editing.mjs, which only calls them). The geometry is
// cluster-constant-geometry.mjs and the drawing cluster-constant-view.mjs.

import * as Gr from "../../../core/model/graph.mjs";
import { setClusterElements } from "../../../core/model/user-cluster.mjs";
import { leerNumero } from "../../../core/model/types.mjs";
import { CONSTANTES, caja, terminales } from "./diagram-view.mjs";
import {
  boxHolds,
  clusterBox,
  elementNode,
  interiorBox,
  isClusterConstant,
  parseElementId,
  resizedBox,
} from "./cluster-constant-geometry.mjs";

export { BLOCK, MEASURES, isClusterConstant, isElementId } from "./cluster-constant-geometry.mjs";

/** The constants a cluster takes as elements: the numerics, the Boolean and the string (report Q3; the others are unmeasured). */
const ELEMENT_BLOCKS = new Set(["num-const", "const", "str-const", "bool-const"]);
export const canBeElement = (node) => ELEMENT_BLOCKS.has(node?.tipo);

const nodeOf = (g, id) => g.nodos.find((node) => node.id === id);
const elementsOf = (cluster) => cluster.config.elements;
const interiorOrigin = (cluster) => interiorBox(clusterBox(cluster));
const center = (box) => ({ x: box.x + Math.floor(box.ancho / 2), y: box.y + Math.floor(box.alto / 2) });

/** The topmost Cluster Constant whose interior holds `point`, apart from the nodes in `except`, or undefined. */
function clusterHolding(g, point, except = []) {
  return g.nodos.filter((node) => isClusterConstant(node) && !except.includes(node.id) && boxHolds(interiorOrigin(node), point)).at(-1);
}

/** Element `index` of cluster `id` as a node on the diagram, or undefined. */
export function elementNodeAt(g, id) {
  const parsed = parseElementId(id);
  const cluster = parsed && nodeOf(g, parsed.clusterId);
  const element = cluster && isClusterConstant(cluster) ? elementsOf(cluster)[parsed.index] : undefined;
  return element && elementNode(cluster, element, parsed.index, interiorOrigin(cluster));
}

/** An element's box on the diagram, as the diagram measures that constant (also while it is typed into). */
export const elementBox = (g, ctx, id, typing) => caja(elementNodeAt(g, id), ctx, typing);

/** The graph with the elements of cluster `clusterId` replaced, its type and value derived again. */
const withElements = (g, ctx, clusterId, elements) => setClusterElements(g, ctx.cat, clusterId, elements);

/** The graph with element `id` mapped by `change`. */
export function withElementChanged(g, ctx, id, change) {
  const { clusterId, index } = parseElementId(id);
  const elements = elementsOf(nodeOf(g, clusterId)).map((element, position) => (position === index ? change(element) : element));
  return withElements(g, ctx, clusterId, elements);
}

// ——— Constants becoming elements ———

/** A constant as an element whose box's corner is (x, y) on the diagram: its type and value, no label (report Q3). */
const asElement = (cluster, node, corner) => {
  const origin = interiorOrigin(cluster);
  return { tipo: node.tipo, config: { ...node.config }, x: corner.x - origin.x, y: corner.y - origin.y };
};

/**
 * What a constant dropped from the palette at `point` becomes if `point` is inside a cluster's interior: its box is
 * centred on the drop point (Q3: a 13 x 19 numeric at (1000, 500) covers 994..1006 x 491..509). Returns the state with
 * the constant gone and the element in, in text edit as a free constant is after its drop, or null.
 */
export function absorbDropped(d, ctx, id, point) {
  const node = nodeOf(d.g, id);
  const cluster = canBeElement(node) && clusterHolding(d.g, point, [id]);
  if (!cluster) return null;
  const box = caja(node, ctx);
  const element = asElement(cluster, node, { x: point.x - Math.floor(box.ancho / 2), y: point.y - Math.floor(box.alto / 2) });
  const g = withElements(Gr.borrar(d.g, [id]), ctx, cluster.id, [...elementsOf(cluster), element]);
  const elementId = `${cluster.id}.elements.${elementsOf(cluster).length}`;
  return { ...d, g, seleccion: [elementId], accion: null, aviso: null, edicion: typingAfterDrop(g, ctx, elementId) };
}

/** The text edit a numeric or string element starts in just after its drop (Q3: black fill, white selected text). */
function typingAfterDrop(g, ctx, id) {
  const node = elementNodeAt(g, id);
  if (node.tipo === "bool-const") return null;
  const isText = node.tipo === "str-const";
  return { nodo: id, texto: CONSTANTES[node.tipo].texto(node, ctx), todo: !isText, nuevo: true, ...(isText ? { cadena: true } : {}) };
}

/**
 * Free constants that were dragged so that their box's centre is inside a cluster's interior become its elements, in
 * selection order (Q4). Their wires stay, with a loose end where the terminal was (the broken wire). Returns the state, or
 * null when no constant of the selection ends up inside one.
 */
export function absorbDragged(d, ctx, ids = d.seleccion) {
  const draggedClusters = ids.filter((id) => isClusterConstant(nodeOf(d.g, id)));
  const placed = ids
    .map((id) => nodeOf(d.g, id))
    .filter((node) => canBeElement(node))
    .map((node) => ({ node, cluster: clusterHolding(d.g, center(caja(node, ctx)), [...draggedClusters, node.id]) }))
    .filter((entry) => entry.cluster);
  if (!placed.length) return null;
  const terminalPlace = (node, port) => {
    const terminal = terminales(node, ctx).find((candidate) => candidate.puerto === port);
    return terminal ? [terminal.x, terminal.y] : [node.x, node.y];
  };
  let g = d.g;
  let last;
  for (const { node, cluster } of placed) {
    const element = asElement(nodeOf(g, cluster.id), node, caja(node, ctx));
    const without = Gr.borrarDejandoCables(g, [node.id], terminalPlace);
    g = withElements(without, ctx, cluster.id, [...elementsOf(nodeOf(without, cluster.id)), element]);
    last = `${cluster.id}.elements.${elementsOf(nodeOf(g, cluster.id)).length - 1}`;
  }
  return { ...d, g, seleccion: [last], accion: null };
}

// ——— Operating an element ———

/** A press on an element selects it alone (report elements Q4); a Boolean toggles on release if it was not dragged. */
export function pressElement(d, id, point) {
  const node = elementNodeAt(d.g, id);
  return { ...d, seleccion: [id], accion: { tipo: "elemento", id, x: point.x, y: point.y, movido: false, alternar: node.tipo === "bool-const" } };
}

/** The element follows the pointer, clipped by the interior while it is outside. */
export function dragElement(d, ctx, point) {
  const { accion } = d;
  const [dx, dy] = [Math.round(point.x - accion.x), Math.round(point.y - accion.y)];
  if (!dx && !dy) return d;
  const g = withElementChanged(d.g, ctx, accion.id, (element) => ({ ...element, x: element.x + dx, y: element.y + dy }));
  return { ...d, g, accion: { ...accion, x: accion.x + dx, y: accion.y + dy, movido: true } };
}

/**
 * Releasing an element: a press without a drag on a Boolean toggles it; a drag that leaves the box's centre inside the
 * interior moves it there; one that leaves it outside makes it a free constant with its value, and the cluster's type
 * shrinks (Q3). A free constant let go inside another cluster's interior becomes that one's element. `nest(g, ctx, ids)`
 * puts a new free constant in the structure it lies in, if any (the diagram's `alojar`).
 */
export function releaseElement(d, ctx, nest) {
  const { accion } = d;
  if (!accion.movido) return { ...d, g: accion.alternar ? toggled(d.g, ctx, accion.id) : d.g, accion: null };
  const { clusterId } = parseElementId(accion.id);
  const box = elementBox(d.g, ctx, accion.id);
  if (boxHolds(interiorOrigin(nodeOf(d.g, clusterId)), center(box))) return { ...d, accion: null };
  return pulledOut(d, ctx, accion.id, box, nest);
}

const toggled = (g, ctx, id) => withElementChanged(g, ctx, id, (element) => ({ ...element, config: { ...element.config, value: !element.config?.value } }));

/** Element `id`, which lies in `box`, as a free constant there; or, if it lies in another cluster, that cluster's element. */
function pulledOut(d, ctx, id, box, nest) {
  const { clusterId, index } = parseElementId(id);
  const cluster = nodeOf(d.g, clusterId);
  const element = elementsOf(cluster)[index];
  const remaining = withElements(d.g, ctx, clusterId, elementsOf(cluster).filter((_, position) => position !== index));
  const created = Gr.crearNodo(remaining, ctx.cat, element.tipo, box.x, box.y);
  const withValue = Gr.fijarConfig(created.g, created.id, element.config);
  const free = { ...d, g: nest(withValue, ctx, [created.id]), seleccion: [created.id], accion: null };
  return absorbDragged(free, ctx, [created.id]) ?? free;
}

/** Double click on an element: a numeric or string one is typed into with its text selected; the Boolean toggles with its click. */
export function editElement(d, ctx, id) {
  const node = elementNodeAt(d.g, id);
  if (!isEditable(node)) return d;
  const isText = node.tipo === "str-const";
  return { ...d, edicion: { nodo: id, texto: CONSTANTES[node.tipo].texto(node, ctx), todo: true, ...(isText ? { cadena: true } : {}) }, seleccion: [id], accion: null, menu: null };
}

const isEditable = (node) => !!node && node.tipo !== "bool-const";

/** Can a double click on this id type into an element? */
export const isEditableElement = (g, id) => isEditable(elementNodeAt(g, id));

/**
 * What was typed into element `typing.nodo` becomes its value: a string as it is, a number as a free constant reads
 * it (a number with decimals turns an integer constant into a DBL one); what is not a number leaves it as it was. Its
 * right edge stays, as a free constant's does when its width changes (measured, B12 of real-programs-0.3.md).
 */
export function commitElementEdit(d, ctx, typing) {
  const node = elementNodeAt(d.g, typing.nodo);
  if (!node) return { ...d, edicion: null };
  const change = valueChange(node, typing.texto);
  if (!change) return { ...d, edicion: null };
  const changed = withElementChanged(d.g, ctx, typing.nodo, (element) => ({ ...element, config: { ...element.config, ...change } }));
  const growth = elementBox(changed, ctx, typing.nodo).ancho - elementBox(d.g, ctx, typing.nodo).ancho;
  const g = growth ? withElementChanged(changed, ctx, typing.nodo, (element) => ({ ...element, x: element.x - growth })) : changed;
  return { ...d, g, edicion: null };
}

/** The configuration a typed text gives an element, or null when it is not a value. */
function valueChange(node, text) {
  if (node.tipo === "str-const") return { value: text };
  const read = leerNumero(text, node.config?.type ?? "number");
  if (!read) return null;
  return { value: read.valor, ...(node.tipo === "num-const" ? { type: read.tipo } : {}) };
}

/** Delete on selected elements takes them out of their clusters (report elements Q4); null when none is selected. */
export function deleteSelectedElements(d, ctx) {
  const selected = d.seleccion.map(parseElementId).filter((parsed) => parsed && nodeOf(d.g, parsed.clusterId));
  if (!selected.length) return null;
  // Each cluster is filtered once, against its elements before any is taken out: its indices count from that list.
  const clusterIds = [...new Set(selected.map((parsed) => parsed.clusterId))];
  const g = clusterIds.reduce((graph, clusterId) => {
    const doomed = new Set(selected.filter((parsed) => parsed.clusterId === clusterId).map((parsed) => parsed.index));
    return withElements(graph, ctx, clusterId, elementsOf(nodeOf(d.g, clusterId)).filter((_, position) => !doomed.has(position)));
  }, d.g);
  return { ...d, g, seleccion: [], aviso: null };
}

// ——— Resizing ———

/**
 * The constant dragged by handle `side` by (dx, dy) from the graph as it was when the press landed. The elements keep
 * their place on the diagram (their place relative to the interior changes when the top-left moves) and one left outside
 * stays an element (report geometry Q2).
 */
export function resized(g0, ctx, id, side, dx, dy) {
  const cluster = nodeOf(g0, id);
  const before = clusterBox(cluster);
  const after = resizedBox(before, side, dx, dy);
  const elements = elementsOf(cluster).map((element) => ({ ...element, x: element.x - (after.x - before.x), y: element.y - (after.y - before.y) }));
  const moved = { ...g0, nodos: g0.nodos.map((node) => (node.id === id ? { ...node, x: after.x, y: after.y, tam: { ancho: after.ancho, alto: after.alto } } : node)) };
  return withElements(moved, ctx, id, elements);
}
