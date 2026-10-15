// Unbundle By Name as a node of the Block Diagram.
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
// Pure geometry, drawing and the choices of its menus, like diagram-view.mjs: no DOM.

import { esCluster, esError, aspecto, esArray, esNumerico } from "../../../core/model/types.mjs";
import { resizeUnbundleRows, tipos } from "../../../core/model/graph.mjs";

export const BLOCK = "unbundle-by-name";

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
const BORDER_COLOR = "#4C4C3D";
const ARROW_CELL_COLOR = "#FFFFCC";
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

/** The name every row shows, or `null` for a row that has none yet. */
export const rowNames = (node, cat) => node.config?.items ?? cat.bloque(BLOCK).config.items.value;

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
export function grabPoint(cat, measure) {
  const { ancho, alto } = unbundleSize({ tipo: BLOCK }, cat, measure);
  return { x: Math.round(ancho / 2), y: Math.round(alto / 2) };
}

const rowCenter = (row) => ROW_STEP * row + ROW_STEP / 2 + 0.5;

/** The terminals as the editor wants them (see `terminales` in diagram-view.mjs): the input at the middle of the left edge, one output per named row on the right edge. */
export function unbundleTerminals(node, box, cat) {
  const half = TERMINAL_ZONE / 2;
  const { in: inputs, out: outputs } = cat.puertos(node);
  const place = (port, dir) => {
    const x = box.x + (dir === "in" ? 0 : box.ancho);
    const y = box.y + (dir === "in" ? box.alto / 2 : rowCenter(rowOfPort(port.name)));
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

/** The type of the element of a row, from the resolved types of the diagram. */
const rowType = (node, resolved, row) => resolved?.salidas.get(`${node.id}.${portOfRow(row)}`);

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
    `<rect x="0.5" y="0.5" width="${f2(box.ancho - 1)}" height="${f2(box.alto - 1)}" fill="#fff" stroke="${BORDER_COLOR}" stroke-width="1"/>` +
    `<rect x="1" y="1" width="${ARROW_CELL_WIDTH - 1}" height="${f2(box.alto - 2)}" fill="${ARROW_CELL_COLOR}"/>` +
    `${arrow(box.alto)}` +
    `<g stroke="${DIVIDER_COLOR}" stroke-width="1">${divider}${lines}</g>${texts}</svg>`
  );
}

const escapeText = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The clickable strip of every named row (a click on it drops the list of names); coordinates relative to the node. */
export function nameRowZones(node, box, cat) {
  return rowNames(node, cat)
    .map((name, row) => (name === null ? "" : `<div class="fila-nombre" data-nodo="${node.id}" data-fila="${row}" style="left:${ARROW_CELL_WIDTH + DIVIDER_WIDTH}px;top:${ROW_STEP * row + 1}px;width:${f2(box.ancho - ARROW_CELL_WIDTH - DIVIDER_WIDTH)}px;height:${ROW_STEP - 1}px"></div>`))
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

/** The type of the element a row shows, from the resolved types of the diagram. */
export const elementTypeOfRow = (graph, cat, nodeId, row) => tipos(graph, cat).salidas.get(`${nodeId}.${portOfRow(row)}`);

/** The cluster wired into the node, from the resolved types of the diagram. */
export const wiredCluster = (graph, cat, nodeId) => {
  const wired = tipos(graph, cat).entradas.get(`${nodeId}.cluster`);
  return esCluster(wired) ? wired : undefined;
};
