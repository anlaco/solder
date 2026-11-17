// Bundle and Unbundle as nodes of the Block Diagram (DT-095 stage d, DT-098), measured at 1:1 in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-16-cluster-diagram.md Q3-Q4 and 2026-11-17-bundle-unbundle.md Q1-Q5, local evidence
// never committed; the pixel layout below was read from labview-captures/cluster/bu_c1.png and bu_c3.png):
//   - 32 px wide; 9, 17, 25, 33, 41 px tall for 1 to 5 rows (a 1 px frame and 8 px a row).
//   - Bundle: a white cell 14 px wide on the left, one 7 px row each, 1 px black separators between them; then a black
//     divider, a yellow cell the cluster enters from the top, a divider and the arrow cell, as Bundle By Name's right part.
//   - Unbundle is its mirror: the arrow cell on the left and the white cell on the right, with no cell for the cluster.
//   - A type mark in each white cell, 5 px high, no labels: I32 blue, DBL orange, TF green, abc magenta, a small cluster
//     glyph for a cluster; on the input side of Bundle and the output side of Unbundle.
//   - An unwired Bundle shows two rows and is stretched by a handle at the middle of its bottom edge; one wired at the top
//     cannot be stretched, and an Unbundle has no handle.
//
// Pure geometry, drawing and stretching, like unbundle-by-name.mjs: no DOM. The terminals' names and types come from
// core/model/cluster-node-ports.mjs; keeping them in step with the cluster wired to them is the editor window's
// `settleEdit`, which calls `followWiredClusters` after every change of the graph.

import { aspecto, esCluster, esNumerico, NUMERICOS } from "../../../core/model/types.mjs";
import { bundleRowCount, rowOfPort, rowPort } from "../../../core/model/cluster-node-ports.mjs";
import { fijarConfig } from "../../../core/model/graph.mjs";

export const BUNDLE = "bundle";
export const UNBUNDLE = "unbundle";

export const isBundle = (node) => node?.tipo === BUNDLE;
export const isUnbundle = (node) => node?.tipo === UNBUNDLE;
/** Either node: both show one row per element of the cluster they follow. */
export const isBundleNode = (node) => isBundle(node) || isUnbundle(node);

/** Always 32 wide; 8 px a row and one frame line more (Q1). */
export const WIDTH = 32;
export const ROW_PITCH = 8;
/** An unwired Unbundle is 32 x 17 (2026-11-16 Q4); it has no output to draw, so it shows two empty cells. */
const UNWIRED_UNBUNDLE_ROWS = 2;

/** The white cell of the marks, 14 px wide: on the left of Bundle (x 1 to 14) and on the right of Unbundle (x 17 to 30). */
const MARK_CELL_WIDTH = 14;
const BUNDLE_CELL_LEFT = 1;
const UNBUNDLE_CELL_LEFT = 17;
/** The black column between the white cell and the rest: x 15 on Bundle, x 16 on Unbundle (bu_c1.png). */
const BUNDLE_DIVIDER_X = 15;
const UNBUNDLE_DIVIDER_X = 16;
/** Bundle's yellow cell for the cluster (x 16 to 22) and its divider (x 23); its arrow cell starts at x 24. */
const CLUSTER_CELL_LEFT = 16;
const CLUSTER_CELL_WIDTH = 7;
const BUNDLE_ARROW_LEFT = 24;
const UNBUNDLE_ARROW_LEFT = 1;
/** The cluster enters the top edge over the middle of the yellow cell, as Bundle By Name's does (x 20 of 32). */
const CLUSTER_INSET_FROM_RIGHT = WIDTH - (CLUSTER_CELL_LEFT + CLUSTER_CELL_WIDTH / 2 + 0.5);
/** The clickable square of a terminal on an edge, centred on it. */
const TERMINAL_ZONE = 8;
/** The handle that stretches an unwired Bundle: 6 x 6 at the middle of its bottom edge, its top 3 px above it (as Unbundle By Name's). */
export const HANDLE_SIZE = 6;
const HANDLE_OVERHANG = 3;

/** A mark is 5 px high, its top 2 px below the row's first line; the font that draws its letters is sized to that cap height. */
const MARK_TOP = 2;
const MARK_HEIGHT = 5;
const MARK_FONT_SIZE = 7;
const MARK_BASELINE = MARK_TOP + MARK_HEIGHT;
/** The widths measured in LabVIEW of the marks that were (I32 about 10, DBL 13, TF 11, abc 13, a cluster 13: Q5). */
const MARK_WIDTHS = { I32: 10, DBL: 13, TF: 11, abc: 13 };
const CLUSTER_MARK_WIDTH = 13;
/** Another representation's mark is its name; its width is estimated, a letter being about this wide (unverified). */
const MARK_LETTER_WIDTH = 3.4;

const BORDER = "var(--format-node-border)";
const FILL = "var(--node-fill)";
const CELL = "var(--paper)";
const SEPARATOR = "var(--bundle-separator)";
const MARK_COLORS = { integer: "var(--bundle-mark-integer)", float: "var(--bundle-mark-float)", boolean: "var(--bundle-mark-boolean)", string: "var(--bundle-mark-string)" };

const f2 = (value) => Number(value.toFixed(2));

// ——— Rows and size ———

/** How many rows the node shows: those of the cluster it follows, those it was stretched to, or two empty ones for an unwired Unbundle. */
export function rowCount(node) {
  const copied = node.config?.type?.cluster;
  if (copied) return Math.max(1, copied.length);
  return isBundle(node) ? bundleRowCount(node) : UNWIRED_UNBUNDLE_ROWS;
}

/** The node's size: 32 wide, one frame line and 8 px a row. */
export const size = (node) => ({ ancho: WIDTH, alto: ROW_PITCH * rowCount(node) + 1 });

/** The point of the node that hangs from the cursor when it is picked from the palette: its centre (unverified, as Unbundle By Name's was). */
export function grabPoint(block) {
  const { ancho, alto } = size({ tipo: block });
  return { x: Math.round(ancho / 2), y: Math.round(alto / 2) };
}

const rowCenter = (row) => ROW_PITCH * row + ROW_PITCH / 2 + 0.5;

// ——— Terminals ———

/**
 * The terminals as the editor wants them (see `terminales` in diagram-view.mjs). Bundle: the cluster on the top edge, one
 * input per row on the left edge and the output at the middle of the right edge. Unbundle: the cluster at the middle of the
 * left edge and one output per row on the right edge (Q3, Q4).
 */
export function terminals(node, box, cat) {
  const half = TERMINAL_ZONE / 2;
  const { in: inputs, out: outputs } = cat.puertos(node);
  const pointOf = (port, dir) => {
    const row = rowOfPort(port.name);
    if (isBundle(node)) {
      if (dir === "out") return { x: box.ancho, y: box.alto / 2 };
      return row < 0 ? { x: box.ancho - CLUSTER_INSET_FROM_RIGHT, y: 0 } : { x: 0, y: rowCenter(row) };
    }
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

/** The index of the row a port belongs to (`campo-2` is row 2), or -1 for the cluster terminals. */
export { rowOfPort };

// ——— Types of the rows ———

/** The type each row shows: the copied cluster's elements, or for an unwired Bundle what is wired to each row (undefined if nothing). */
export function rowTypes(node, resolved) {
  const copied = node.config?.type?.cluster;
  if (copied) return copied.map((field) => field.type);
  if (!isBundle(node)) return [];
  return Array.from({ length: bundleRowCount(node) }, (_, row) => resolved?.entradas.get(`${node.id}.${rowPort(row)}`));
}

/** Is the Bundle wired at the top, so that it follows a cluster and cannot be stretched (Q1)? */
export const followsCluster = (node) => !!node.config?.type;

// ——— Drawing ———

/** The mark of a scalar type: its text, and the colour token of the family; undefined for a type with no mark of its own. */
function scalarMark(type) {
  if (type === "boolean") return { text: "TF", color: MARK_COLORS.boolean };
  if (type === "string") return { text: "abc", color: MARK_COLORS.string };
  if (!esNumerico(type) || !NUMERICOS[type]) return undefined;
  return { text: NUMERICOS[type].abrev, color: NUMERICOS[type].entero ? MARK_COLORS.integer : MARK_COLORS.float };
}

const markWidth = (text) => MARK_WIDTHS[text] ?? text.length * MARK_LETTER_WIDTH;

/** A cluster's mark: a small box of three cells, in the colour of the cluster's wire (brown for numbers only, magenta otherwise). */
function clusterMark(type, left, top) {
  const color = aspecto(type).color;
  const [x, y] = [left + (MARK_CELL_WIDTH - CLUSTER_MARK_WIDTH) / 2, top + MARK_TOP];
  const [width, height, third] = [CLUSTER_MARK_WIDTH - 1, MARK_HEIGHT - 1, (CLUSTER_MARK_WIDTH - 1) / 3];
  return `<g fill="none" stroke="${color}" stroke-width="1"><rect x="${f2(x + 0.5)}" y="${f2(y + 0.5)}" width="${width}" height="${height}"/><line x1="${f2(x + 0.5 + third)}" y1="${f2(y + 0.5)}" x2="${f2(x + 0.5 + third)}" y2="${f2(y + 0.5 + height)}"/><line x1="${f2(x + 0.5 + 2 * third)}" y1="${f2(y + 0.5)}" x2="${f2(x + 0.5 + 2 * third)}" y2="${f2(y + 0.5 + height)}"/></g>`;
}

/** The type mark of row `row` in the white cell whose left edge is `left`, or "" while the row has no type. */
function typeMark(type, left, row) {
  if (type === undefined) return "";
  const top = ROW_PITCH * row + 1;
  if (esCluster(type)) return clusterMark(type, left, top);
  const mark = scalarMark(type);
  if (!mark) return `<rect x="${f2(left + (MARK_CELL_WIDTH - MARK_HEIGHT) / 2 + 0.5)}" y="${f2(top + MARK_TOP + 0.5)}" width="${MARK_HEIGHT - 1}" height="${MARK_HEIGHT - 1}" fill="none" stroke="${aspecto(type).color}"/>`;
  const width = markWidth(mark.text);
  const x = left + (MARK_CELL_WIDTH - width) / 2;
  return `<text class="marca-tipo" x="${f2(x)}" y="${top + MARK_BASELINE}" font-size="${MARK_FONT_SIZE}" textLength="${width}" lengthAdjust="spacingAndGlyphs" fill="${mark.color}">${mark.text}</text>`;
}

/** The thick arrow of the arrow cell, pointing right (drawn anew): a 3 px shaft and a head 7 px tall that tapers off. */
function arrow(left, middle) {
  const [shaft, head, tip, half] = [6, 6, 10, 3.5];
  const points = [[0, -1.5], [shaft, -1.5], [head, -half], [tip, 0], [head, half], [shaft, 1.5], [0, 1.5]];
  return `<polygon points="${points.map(([dx, dy]) => `${f2(left + dx)},${f2(middle + dy)}`).join(" ")}" fill="${BORDER}"/>`;
}

const verticalLine = (x, alto) => `<line x1="${x}" y1="1" x2="${x}" y2="${f2(alto - 1)}"/>`;

/** The black lines between the rows of the white cell, from its left edge to the divider. */
function separators(rows, left, right) {
  return Array.from({ length: rows - 1 }, (_, index) => `<line x1="${left}" y1="${ROW_PITCH * (index + 1) + 0.5}" x2="${right}" y2="${ROW_PITCH * (index + 1) + 0.5}"/>`).join("");
}

const frame = (box) => `<rect x="0.5" y="0.5" width="${f2(box.ancho - 1)}" height="${f2(box.alto - 1)}" fill="${FILL}" stroke="${BORDER}" stroke-width="1"/>`;

/** Bundle: the white cell with the marks on the left, then the yellow cell the cluster enters and the arrow cell. */
function bundleBody(node, box, resolved) {
  const middle = f2(box.alto / 2);
  const rows = rowCount(node);
  const cell = `<rect x="${BUNDLE_CELL_LEFT}" y="1" width="${MARK_CELL_WIDTH}" height="${f2(box.alto - 2)}" fill="${CELL}"/>`;
  const clusterMark = `<rect x="${CLUSTER_CELL_LEFT + 2}" y="${f2(box.alto / 2 - 2.5)}" width="${MARK_HEIGHT}" height="${MARK_HEIGHT}" fill="${BORDER}"/>`;
  const lines = `<g stroke="${SEPARATOR}" stroke-width="1">${verticalLine(BUNDLE_DIVIDER_X + 0.5, box.alto)}${verticalLine(BUNDLE_ARROW_LEFT - 0.5, box.alto)}${separators(rows, BUNDLE_CELL_LEFT, BUNDLE_DIVIDER_X + 0.5)}</g>`;
  const marks = rowTypes(node, resolved).map((type, row) => typeMark(type, BUNDLE_CELL_LEFT, row)).join("");
  return `${frame(box)}${cell}${clusterMark}${arrow(BUNDLE_ARROW_LEFT, middle)}${lines}${marks}`;
}

/** Unbundle: the arrow cell on the left, then the white cell with the marks on the right. */
function unbundleBody(node, box, resolved) {
  const rows = rowCount(node);
  const cell = `<rect x="${UNBUNDLE_CELL_LEFT}" y="1" width="${MARK_CELL_WIDTH}" height="${f2(box.alto - 2)}" fill="${CELL}"/>`;
  const lines = `<g stroke="${SEPARATOR}" stroke-width="1">${verticalLine(UNBUNDLE_DIVIDER_X + 0.5, box.alto)}${separators(rows, UNBUNDLE_DIVIDER_X + 0.5, WIDTH - 1)}</g>`;
  const marks = rowTypes(node, resolved).map((type, row) => typeMark(type, UNBUNDLE_CELL_LEFT, row)).join("");
  return `${frame(box)}${cell}${arrow(UNBUNDLE_ARROW_LEFT, f2(box.alto / 2))}${lines}${marks}`;
}

/** The body of the node as an SVG: `resolved` is the diagram's resolved types, which give an unwired Bundle's rows their marks. */
export function body(node, box, resolved) {
  const drawn = isBundle(node) ? bundleBody(node, box, resolved) : unbundleBody(node, box, resolved);
  return `<svg class="formato" viewBox="0 0 ${f2(box.ancho)} ${f2(box.alto)}">${drawn}</svg>`;
}

/** Where the bottom handle that stretches a Bundle sits, in the coordinates of its box. An Unbundle has none. */
export const handle = (box) => ({ x: box.ancho / 2 - HANDLE_SIZE / 2, y: box.alto - HANDLE_OVERHANG });

// ——— Stretching ———

/**
 * The Bundle stretched by `steps` rows more (or fewer) than it had, never fewer than one; the wires of the rows that go
 * away go with them (unverified in LabVIEW, as for Unbundle By Name). One wired at the top is not stretched at all: the
 * cursor shows but nothing happens (Q1); nor is an Unbundle, which has no handle.
 */
export function stretchedRows(g, nodeId, steps) {
  const node = g.nodos.find((candidate) => candidate.id === nodeId);
  if (!isBundle(node) || followsCluster(node)) return g;
  const rows = Math.max(1, bundleRowCount(node) + steps);
  const resized = fijarConfig(g, nodeId, { rows });
  return { ...resized, cables: resized.cables.filter((wire) => wire.a.nodo !== nodeId || rowOfPort(wire.a.puerto) < rows) };
}

// ——— Add Input and Remove Input ———

/** The wires into `nodeId`'s rows below `row` (or from it, when `row` itself goes), moved by `delta` rows; the wires of `row` are dropped when asked. */
function shiftedWires(g, nodeId, row, delta, dropRow) {
  const rowOfWire = (wire) => (wire.a.nodo === nodeId ? rowOfPort(wire.a.puerto) : -1);
  return g.cables
    .filter((wire) => !(dropRow && rowOfWire(wire) === row))
    .map((wire) => (rowOfWire(wire) > row ? { ...wire, a: { ...wire.a, puerto: rowPort(rowOfWire(wire) + delta) } } : wire));
}

/** Can the rows of this Bundle be added or removed one by one? Only an unwired-top one can (Add Input did nothing on a wired one, Q6). */
const hasFreeRows = (node) => isBundle(node) && !followsCluster(node);

/** Add Input on row `row`: a new row right after it, the wires of the rows below moving down with theirs (the new row's place is unverified). */
export function addedRow(g, nodeId, row) {
  const node = g.nodos.find((candidate) => candidate.id === nodeId);
  if (!hasFreeRows(node)) return g;
  return fijarConfig({ ...g, cables: shiftedWires(g, nodeId, row, +1, false) }, nodeId, { rows: bundleRowCount(node) + 1 });
}

/** Remove Input on row `row`: the row goes with its wire and the rows below move up with theirs; the last row is never removed (unverified). */
export function removedRow(g, nodeId, row) {
  const node = g.nodos.find((candidate) => candidate.id === nodeId);
  if (!hasFreeRows(node) || bundleRowCount(node) <= 1) return g;
  return fijarConfig({ ...g, cables: shiftedWires(g, nodeId, row, -1, true) }, nodeId, { rows: bundleRowCount(node) - 1 });
}
