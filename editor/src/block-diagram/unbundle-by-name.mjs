// Unbundle By Name and Bundle By Name as nodes of the Block Diagram.
//
// A box with a yellow arrow cell on the left and one row per element picked from the cluster wired
// in; the rows grow by stretching the node by its bottom handle. Measured at 1:1 in LabVIEW 2026 Q3
// (labview-captures/reports/2026-10-15-cluster-palette.md, stage 1: the unwired look, and
// labview-captures/reports/2026-10-15-unbundle-by-name.md, stage 2: the wired behaviour):
//   - fresh and unwired: 30 x 17, the arrow cell and a plain white part, only the input terminal.
//   - wired: a 16 px arrow cell (1 px outline and 15 px yellow), a 1 px black divider and the names;
//     rows are 16 px apart with 1 px black dividers; the height is 16 x rows + 1; the width follows
//     the longest name (55 px with status and code, 58 once source is among them).
//   - each name has the colour of the type of its element; one output terminal per named row.
//   - the handle is 6 x 6 at the middle of the bottom edge, its top 3 px above it.
//
// Bundle By Name is its mirror (labview-captures/reports/2026-11-06-bundle-by-name.md): the same sizes,
// names and menus, with the names on the left, an input per row on the left edge, two 7 px yellow cells
// on the right (the input cluster enters the first from the top, the second holds the arrow) and the
// output cluster at the middle of the right edge.
//
// Pure geometry, drawing and the choices of its menus, like diagram-view.mjs: no DOM.

import { esCluster, esError, aspecto, esArray, esNumerico } from "../../../core/model/types.mjs";
import { resizeUnbundleRows, tipos } from "../../../core/model/graph.mjs";

export const BLOCK = "unbundle-by-name";
export const BUNDLE_BLOCK = "bundle-by-name";

/** Fresh and unwired, the node is this wide and one row tall (stage 1, d1.png). */
const UNWIRED_WIDTH = 30;
/** Rows are this far apart, divider to divider, and the node is one divider taller than its rows (stage 2, Q2). */
export const ROW_STEP = 16;
const ARROW_CELL_WIDTH = 16;
/** The black line between the arrow cell and the names. */
const DIVIDER_WIDTH = 1;
/**
 * The room around a name: the width of the node is the arrow cell, the divider, the widest name and this.
 * Calibrated in the running editor, whose font gives status 33 px and source 36 px, on LabVIEW's 55 and 58.
 */
const NAME_PADDING = { left: 3, right: 2 };
const BORDER_COLOR = "var(--format-node-border)";
const ARROW_CELL_COLOR = "var(--node-fill)";
const DIVIDER_COLOR = "#000000";
/**
 * The colour of a name whose element has no type (the cluster is not wired, or the name is no longer
 * in it). Unverified in LabVIEW: black is the colour of every other text of the node.
 */
const UNTYPED_NAME_COLOR = "#000000";
/** The clickable square of a terminal on an edge, centred on it. */
const TERMINAL_ZONE = 8;
/** The handle that stretches the node. */
export const HANDLE_SIZE = 6;
const HANDLE_OVERHANG = 3;

const f2 = (value) => Number(value.toFixed(2));

export const isUnbundleByName = (node) => node?.tipo === BLOCK;
export const isBundleByName = (node) => node?.tipo === BUNDLE_BLOCK;
/** Either node: both name their rows after the elements of the cluster wired in. */
export const isByName = (node) => isUnbundleByName(node) || isBundleByName(node);

/** Bundle By Name's right part: a divider, a 7 px cell, a divider and the 7 px arrow cell, border included (measured, g3.png). */
const BUNDLE_RIGHT_PART_WIDTH = 17;
/** The input cluster enters Bundle By Name from the top at the middle of its first yellow cell, this far from the right edge (Q1). */
const BUNDLE_CLUSTER_INSET = 12;
const BUNDLE_CELL_WIDTH = 7;

/** The name every row shows, or `null` for a row that has none yet. */
export const rowNames = (node, cat) => node.config?.items ?? cat.bloque(node.tipo).config.items.value;

/** Whether any row has a name: a node that still has none looks as fresh from the palette. */
const hasNames = (node, cat) => rowNames(node, cat).some((name) => name !== null);

export const rowCount = (node, cat) => rowNames(node, cat).length;

/** The index of the row a port belongs to (`element-2` is row 2), or -1 for the input. */
export const rowOfPort = (portName) => (portName?.startsWith("element-") ? Number(portName.slice("element-".length)) : -1);

/** Whether the row exists and shows a name: only then it has an output terminal and a menu of its own. */
export const rowHasName = (node, row) => typeof node.config?.items?.[row] === "string";

/** The right-click menus: the one of a name row or its output terminal, and the one of the arrow cell. */
export const ROW_MENU = "context.unbundle-by-name-row";
export const BODY_MENU = "context.unbundle-by-name";

export const portOfRow = (row) => `element-${row}`;

export function unbundleSize(node, cat, measure) {
  const rows = rowCount(node, cat);
  const height = ROW_STEP * rows + 1;
  if (!hasNames(node, cat)) return { ancho: UNWIRED_WIDTH, alto: height };
  const widest = Math.max(0, ...rowNames(node, cat).filter((name) => name !== null).map((name) => measure(name)));
  return { ancho: ARROW_CELL_WIDTH + DIVIDER_WIDTH + Math.ceil(widest) + NAME_PADDING.left + NAME_PADDING.right, alto: height };
}

/** The point of the node that hangs from the cursor when it is picked from the palette: its centre, as LabVIEW drops it (d1.png). */
export function grabPoint(cat, measure, block = BLOCK) {
  const { ancho, alto } = unbundleSize({ tipo: block }, cat, measure);
  return { x: Math.round(ancho / 2), y: Math.round(alto / 2) };
}

const rowCenter = (row) => ROW_STEP * row + ROW_STEP / 2 + 0.5;

/**
 * The terminals as the editor wants them (see `terminales` in diagram-view.mjs). Unbundle By Name: the
 * input at the middle of the left edge, one output per named row on the right edge. Bundle By Name: the
 * input cluster on the top edge, one input per named row on the left edge, the output at the middle of
 * the right edge.
 */
export function unbundleTerminals(node, box, cat) {
  const half = TERMINAL_ZONE / 2;
  const { in: inputs, out: outputs } = cat.puertos(node);
  const bundle = isBundleByName(node);
  const pointOf = (port, dir) => {
    const row = rowOfPort(port.name);
    if (bundle && row < 0 && dir === "in") return { x: box.ancho - BUNDLE_CLUSTER_INSET, y: 0 };
    if (bundle) return dir === "in" ? { x: 0, y: rowCenter(row) } : { x: box.ancho, y: box.alto / 2 };
    return dir === "in" ? { x: 0, y: box.alto / 2 } : { x: box.ancho, y: rowCenter(row) };
  };
  const place = (port, dir) => {
    const point = pointOf(port, dir);
    const x = box.x + point.x;
    const y = box.y + point.y;
    return { puerto: port.name, etiqueta: port.label ?? port.name, dir, x, y, zona: { x: x - half, y: y - half, ancho: TERMINAL_ZONE, alto: TERMINAL_ZONE }, centro: { x, y } };
  };
  return [...inputs.map((port) => place(port, "in")), ...outputs.map((port) => place(port, "out"))];
}

/** Where the bottom handle that stretches the node sits, in the coordinates of its box. */
export const unbundleHandle = (box) => ({ x: box.ancho / 2 - HANDLE_SIZE / 2, y: box.alto - HANDLE_OVERHANG });

/** The node stretched by `steps` rows more (or fewer) than it had, never fewer than one. */
export function stretchedRows(graph, nodeId, cat, steps) {
  const node = graph.nodos.find((candidate) => candidate.id === nodeId);
  return resizeUnbundleRows(graph, cat, nodeId, Math.max(1, rowCount(node, cat) + steps));
}

// ——— The names of the cluster wired in ———

/** The names of the elements of the cluster wired in, in the order of the cluster; none if nothing is wired. */
export function clusterElementNames(graph, cat, nodeId) {
  const wired = tipos(graph, cat).entradas.get(`${nodeId}.cluster`);
  return esCluster(wired) ? wired.cluster.map((field) => field.name) : [];
}

// ——— Drawing ———

/** The type of the element a row names, looked up in the cluster wired in (resolved types of the diagram). */
function rowType(node, resolved, row) {
  const wired = resolved?.entradas.get(`${node.id}.cluster`);
  return esCluster(wired) ? wired.cluster.find((field) => field.name === node.config?.items?.[row])?.type : undefined;
}

/** The black arrow of the arrow cell, centred on the node (drawn anew). */
function arrow(height) {
  const middle = f2(height / 2);
  return `<path d="M4 ${middle}H11M8.5 ${f2(height / 2 - 2.5)}L12 ${middle}L8.5 ${f2(height / 2 + 2.5)}Z" fill="#000" stroke="#000" stroke-width="1" stroke-linejoin="round"/>`;
}

/**
 * The body of the node: border, the yellow arrow cell, and, once the rows have names, the black
 * divider, the dividers between rows and each name in the colour of the type of its element.
 */
export function unbundleBody(node, box, cat, resolved) {
  if (isBundleByName(node)) return bundleBody(node, box, cat, resolved);
  const names = rowNames(node, cat);
  const named = hasNames(node, cat);
  let lines = "";
  let texts = "";
  names.forEach((name, row) => {
    if (row > 0) lines += `<line x1="${ARROW_CELL_WIDTH}" y1="${ROW_STEP * row + 0.5}" x2="${f2(box.ancho - 1)}" y2="${ROW_STEP * row + 0.5}"/>`;
    if (name === null) return;
    const type = rowType(node, resolved, row);
    const color = type === undefined ? UNTYPED_NAME_COLOR : aspecto(type).color;
    texts += `<text class="nombre-fila" x="${ARROW_CELL_WIDTH + DIVIDER_WIDTH + NAME_PADDING.left}" y="${rowCenter(row)}" fill="${color}">${escapeText(name)}</text>`;
  });
  const divider = named ? `<line x1="${ARROW_CELL_WIDTH - 0.5}" y1="1" x2="${ARROW_CELL_WIDTH - 0.5}" y2="${f2(box.alto - 1)}"/>` : "";
  return (
    `<svg class="formato" viewBox="0 0 ${f2(box.ancho)} ${f2(box.alto)}">` +
    `<rect x="0.5" y="0.5" width="${f2(box.ancho - 1)}" height="${f2(box.alto - 1)}" fill="var(--paper)" stroke="${BORDER_COLOR}" stroke-width="1"/>` +
    `<rect x="1" y="1" width="${ARROW_CELL_WIDTH - 1}" height="${f2(box.alto - 2)}" fill="${ARROW_CELL_COLOR}"/>` +
    `${arrow(box.alto)}` +
    `<g stroke="${DIVIDER_COLOR}" stroke-width="1">${divider}${lines}</g>${texts}</svg>`
  );
}

/** The colour of a row's name: that of the type of its element, or black with no type. */
const nameColor = (node, resolved, row) => {
  const type = rowType(node, resolved, row);
  return type === undefined ? UNTYPED_NAME_COLOR : aspecto(type).color;
};

/**
 * Bundle By Name's body: the names on the left, then a divider, the yellow cell the input cluster enters
 * (a small dark mark at its middle) and the yellow arrow cell. Fresh, the name part is a plain white cell.
 */
function bundleBody(node, box, cat, resolved) {
  const names = rowNames(node, cat);
  const rightPart = box.ancho - BUNDLE_RIGHT_PART_WIDTH;
  const arrowCell = rightPart + 1 + BUNDLE_CELL_WIDTH;
  let lines = "";
  let texts = "";
  names.forEach((name, row) => {
    if (row > 0) lines += `<line x1="1" y1="${ROW_STEP * row + 0.5}" x2="${rightPart}" y2="${ROW_STEP * row + 0.5}"/>`;
    if (name !== null) texts += `<text class="nombre-fila" x="${NAME_PADDING.left}" y="${rowCenter(row)}" fill="${nameColor(node, resolved, row)}">${escapeText(name)}</text>`;
  });
  const middle = f2(box.alto / 2);
  const mark = `<rect x="${rightPart + 2.5}" y="${f2(box.alto / 2 - 2)}" width="4" height="4" fill="${BORDER_COLOR}" stroke="${BORDER_COLOR}" stroke-width="1"/>`;
  const arrowShape = `<path d="M${arrowCell} ${middle}H${arrowCell + 6}M${arrowCell + 3.5} ${f2(box.alto / 2 - 2.5)}L${arrowCell + 7} ${middle}L${arrowCell + 3.5} ${f2(box.alto / 2 + 2.5)}Z" fill="#000" stroke="#000" stroke-width="1" stroke-linejoin="round"/>`;
  return (
    `<svg class="formato" viewBox="0 0 ${f2(box.ancho)} ${f2(box.alto)}">` +
    `<rect x="0.5" y="0.5" width="${f2(box.ancho - 1)}" height="${f2(box.alto - 1)}" fill="var(--paper)" stroke="${BORDER_COLOR}" stroke-width="1"/>` +
    `<rect x="${rightPart + 1}" y="1" width="${BUNDLE_RIGHT_PART_WIDTH - 2}" height="${f2(box.alto - 2)}" fill="${ARROW_CELL_COLOR}"/>` +
    `${mark}${arrowShape}` +
    `<g stroke="${DIVIDER_COLOR}" stroke-width="1"><line x1="${rightPart + 0.5}" y1="1" x2="${rightPart + 0.5}" y2="${f2(box.alto - 1)}"/><line x1="${arrowCell - 0.5}" y1="1" x2="${arrowCell - 0.5}" y2="${f2(box.alto - 1)}"/>${lines}</g>${texts}</svg>`
  );
}

const escapeText = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The clickable strip of every named row (a click on it drops the list of names); coordinates relative to the node. */
export function nameRowZones(node, box, cat) {
  const left = isBundleByName(node) ? 1 : ARROW_CELL_WIDTH + DIVIDER_WIDTH;
  const width = isBundleByName(node) ? box.ancho - BUNDLE_RIGHT_PART_WIDTH - 1 : box.ancho - ARROW_CELL_WIDTH - DIVIDER_WIDTH;
  return rowNames(node, cat)
    .map((name, row) => (name === null ? "" : `<div class="fila-nombre" data-nodo="${node.id}" data-fila="${row}" style="left:${left}px;top:${ROW_STEP * row + 1}px;width:${f2(width)}px;height:${ROW_STEP - 1}px"></div>`))
    .join("");
}

// ——— Menus ———

/**
 * What the "<type> Palette" row of a row's menu is called: the palette the type of the element comes
 * from. Measured for Boolean and String (stage 2, Q4); Numeric is the same row by analogy and the
 * others (an array, the error cluster) are unverified. A type with no palette of its own has no row.
 */
export function typePaletteLabel(type) {
  if (type === undefined) return null;
  if (type === "boolean") return "Boolean Palette";
  if (type === "string") return "String Palette";
  if (esNumerico(type)) return "Numeric Palette";
  if (esArray(type)) return "Array Palette";
  if (esError(type)) return "Dialog & User Interface Palette";
  return null;
}

/**
 * The palette row of the body menu, named after the cluster wired in. Measured only on the error
 * cluster (stage 2, Q5: "Dialog & User Interface Palette"); that it is the palette of the wired
 * cluster is an interpretation, unverified. Any other cluster has no such row.
 */
export const bodyPaletteLabel = (wiredCluster) => (esError(wiredCluster) ? "Dialog & User Interface Palette" : null);

/** The type of the element a row shows, looked up by name in the cluster wired in. */
export const elementTypeOfRow = (graph, cat, nodeId, row) => rowType(graph.nodos.find((node) => node.id === nodeId), tipos(graph, cat), row);

/** The cluster wired into the node, from the resolved types of the diagram. */
export const wiredCluster = (graph, cat, nodeId) => {
  const wired = tipos(graph, cat).entradas.get(`${nodeId}.cluster`);
  return esCluster(wired) ? wired : undefined;
};
