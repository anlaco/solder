// A Cluster Constant and the Front Panel (DT-095 stage c2): Change to Control / Indicator, and Create ▸ Constant, Control and
// Indicator on it, as measured in LabVIEW 2026 Q3 (labview-captures/reports/2026-11-17-cluster-constant-elements.md Q6, Q7,
// local evidence never committed). What was not measured says "unverified".
//
// A constant's elements become the elements of a panel cluster, in cluster order, with empty labels (hidden). Pure
// functions over the graph; the menus that call them are cluster-constant-menus.mjs.

import * as Gr from "../../../core/model/graph.mjs";
import { setClusterElements } from "../../../core/model/user-cluster.mjs";
import { DBL } from "../../../core/model/types.mjs";
import { elementBlock, elementConfig, freshLabel, withShellBox } from "../front-panel/cluster-panel.mjs";
import { caja } from "./diagram-view.mjs";
import { nextPanelSlot } from "./terminal-creation.mjs";
import { clusterBox } from "./cluster-constant-geometry.mjs";

/** The label a new panel cluster is born with (report Q6, Q7: "Cluster"); a repeated one is numbered as the panel does. */
const PANEL_CLUSTER_LABEL = "Cluster";

/** Report Q7: Create ▸ Indicator puts the terminal 25 px right of the frame. */
export const INDICATOR_GAP = 25;

/** Report Q7: Create ▸ Constant puts the copy about 180 px to the left (read from a half-scale picture: unverified). */
export const COPY_OFFSET = 180;

/** The panel block each constant of an element becomes in a control; `elementBlock` gives the indicator's. */
const PANEL_BLOCK = { "num-const": "control", const: "control", "bool-const": "bool-control", "str-const": "str-control" };

/** The port of the terminal of a panel cluster: a control gives, an indicator receives. */
const TERMINAL_PORT = { control: "result", indicator: "value" };

/** What a constant's configuration gives the panel element: its representation and its value as the default. */
function panelConfig(element) {
  const value = element.config?.value;
  if (element.tipo === "str-const") return { value: value ?? "" };
  if (element.tipo === "bool-const") return { value: !!value };
  return { type: element.config?.type ?? DBL, value: value ?? 0 };
}

/** The panel element that `element` of a constant becomes inside a cluster of block `clusterBlock`: same place, an empty label. */
function panelElement(element, clusterBlock) {
  const block = elementBlock(PANEL_BLOCK[element.tipo], clusterBlock);
  return { tipo: block, label: { text: "" }, config: elementConfig(panelConfig(element), block), x: element.x, y: element.y };
}

/** The graph with node `id` at (x, y) on the diagram, in the structure `like` is in. */
const placedLike = (g, id, point, like) => ({
  ...g,
  nodos: g.nodos.map((node) => (node.id === id ? { ...node, ...point, ...(like.dentro !== undefined ? { dentro: like.dentro } : {}), ...(like.marco !== undefined ? { marco: like.marco } : {}) } : node)),
});

/**
 * A panel cluster of `kind` ("control" or "indicator") made from `constant`: its elements, its size, and the first free
 * place the panel gives a new object (the same slot Create ▸ Control gives any other). Its terminal is not placed on the
 * diagram yet. Returns `{ g, id }`.
 */
function panelClusterFrom(g, ctx, constant, kind) {
  const block = `cluster-${kind}`;
  const elements = constant.config.elements.map((element) => panelElement(element, block));
  const slot = nextPanelSlot(g, { tipo: block, config: { elements }, isControl: kind === "control", panelSize: ctx.panelSize });
  const created = Gr.crearEnPanel(g, ctx.cat, block, slot.x, slot.y, freshLabel(g, PANEL_CLUSTER_LABEL), { elements: [] });
  const withElements = setClusterElements(created.g, ctx.cat, created.id, elements);
  const size = clusterBox(constant);
  return { g: withShellBox(withElements, created.id, { x: slot.x, y: slot.y, ancho: size.ancho, alto: size.alto }), id: created.id };
}

const nodeOf = (g, id) => g.nodos.find((node) => node.id === id);

/**
 * Change to Control / Change to Indicator (report Q6): the constant is replaced by the terminal of a panel cluster whose
 * elements are its constants. The terminal's right edge is where the constant's was, on its middle row (unverified: the
 * report gives the terminal's size, 36 x 38, not its corner), and the constant's wires go to it with the port renamed, so
 * an indicator is left with wires facing the wrong way, broken, as for any panel object flipped (`flipArrayKind`).
 */
export function changeToPanelCluster(g, ctx, clusterId, kind) {
  const constant = nodeOf(g, clusterId);
  const made = panelClusterFrom(g, ctx, constant, kind);
  const [box, size] = [clusterBox(constant), caja(nodeOf(made.g, made.id), ctx)];
  const corner = { x: box.x + box.ancho - size.ancho, y: box.y + Math.floor(box.alto / 2) - Math.floor(size.alto / 2) };
  const placed = placedLike(made.g, made.id, corner, constant);
  const moveEnd = (end) => (end.nodo === clusterId ? { ...end, nodo: made.id, puerto: TERMINAL_PORT[kind] } : end);
  const cables = placed.cables.map((wire) => ({ ...wire, de: moveEnd(wire.de), a: moveEnd(wire.a) }));
  return { g: { ...placed, nodos: placed.nodos.filter((node) => node.id !== clusterId), cables }, id: made.id };
}

/**
 * Create ▸ Indicator (report Q7): a cluster indicator 25 px right of the frame, on the output's row, wired to the
 * constant, whose elements become its indicators. Returns `{ g, id }`.
 */
export function createIndicator(g, ctx, clusterId) {
  const constant = nodeOf(g, clusterId);
  const made = panelClusterFrom(g, ctx, constant, "indicator");
  const [box, size] = [clusterBox(constant), caja(nodeOf(made.g, made.id), ctx)];
  const corner = { x: box.x + box.ancho + INDICATOR_GAP, y: box.y + Math.floor(box.alto / 2) - Math.floor(size.alto / 2) };
  const placed = placedLike(made.g, made.id, corner, constant);
  const wired = Gr.conectar(placed, ctx.cat, { nodo: clusterId, puerto: "result", dir: "out" }, { nodo: made.id, puerto: TERMINAL_PORT.indicator, dir: "in" });
  return { g: wired.motivo ? placed : wired.g, id: made.id };
}

/**
 * Create ▸ Control: LabVIEW crashed on it (Fatal Internal Error on the placing click, report Q7), so it is what Solder's
 * Create ▸ Control does on the output of any other constant: a control made unwired, above the node's upper left corner
 * (terminal-creation.mjs `unwiredBox`; unverified for LabVIEW), whose elements are controls. Returns `{ g, id }`.
 */
export function createControl(g, ctx, clusterId) {
  const constant = nodeOf(g, clusterId);
  const made = panelClusterFrom(g, ctx, constant, "control");
  const [box, size] = [clusterBox(constant), caja(nodeOf(made.g, made.id), ctx)];
  return { g: placedLike(made.g, made.id, { x: box.x, y: box.y - size.alto }, constant), id: made.id };
}

/** Create ▸ Constant (report Q7): a copy with its elements, values and size, no label, `COPY_OFFSET` to the left, not wired. */
export function createConstantCopy(g, ctx, clusterId) {
  const constant = nodeOf(g, clusterId);
  const box = clusterBox(constant);
  const created = Gr.crearNodo(g, ctx.cat, constant.tipo, box.x - COPY_OFFSET, box.y);
  const sized = { ...created.g, nodos: created.g.nodos.map((node) => (node.id === created.id ? { ...node, ...(constant.tam ? { tam: { ...constant.tam } } : {}) } : node)) };
  const withElements = setClusterElements(sized, ctx.cat, created.id, structuredClone(constant.config.elements));
  return { g: placedLike(withElements, created.id, { x: box.x - COPY_OFFSET, y: box.y }, constant), id: created.id };
}
