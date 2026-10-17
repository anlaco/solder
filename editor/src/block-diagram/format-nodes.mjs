// Format Into String and Scan From String as nodes of the Block Diagram.
//
// Both are a small yellow box with one row per argument; the rows grow by stretching the node by
// its bottom handle (and, on Scan From String, from the menu of a row). The geometry is measured at
// 1:1 in LabVIEW 2026 Q3 (labview-captures/format-scan/):
//   - 03z.png, 03-fmt-placed.png: Format Into String is 32 x 29 px with one DBL row.
//   - 31z-scan-placed.png, 36z-scan-diagram.png: Scan From String is 32 x 37 px.
//   - 16-node-stretched.png, 36-scan-created.png: each added row makes the node 8 px taller.
//   - 30-scan-context-help.png, 02-qd.png: where each terminal sits and in what order.
// The vertical position of the fixed terminals is read from those captures to the pixel at the zoom
// they have (about 8x); it is a measurement, not a derived rule.
//
// Pure geometry and drawing, like diagram-view.mjs: no DOM.

import { tipos } from "../../../core/model/graph.mjs";
import { DBL, aspecto, nombre } from "../../../core/model/types.mjs";

export const FORMAT_NODE_WIDTH = 32;
/** Each row added by stretching makes the node this much taller (16-node-stretched.png, 36-scan-created.png). */
export const FORMAT_ROW_STEP = 8;
const BORDER_COLOR = "var(--format-node-border)";
const FILL_COLOR = "var(--node-fill)";
/** The top terminal (the format string) sits at the middle of the top edge (30-scan-context-help.png). */
const FORMAT_STRING_X = FORMAT_NODE_WIDTH / 2;
/** The clickable square of a terminal that sits on an edge, centred on it. */
const TERMINAL_ZONE = 8;
const TOP_TERMINAL_ZONE_HEIGHT = 6;
/** Height of the box that shows the type of a row, and its width (03z.png and 31z-scan-placed.png). */
const TYPE_BOX = { width: 16, height: 9 };

/**
 * Where each fixed terminal sits, from the top of the node, and where the first row does; the next
 * rows are `FORMAT_ROW_STEP` below. `typeBoxSide` is the side of the node the type boxes of the rows
 * sit on: the inputs of Format Into String (left) and the outputs of Scan From String (right).
 */
const LAYOUTS = {
  "format-into-string": {
    baseHeight: 29,
    firstRowCenter: 24,
    leftY: { "initial-string": 5.5, "error-in": 14.5 },
    rightY: { "resulting-string": 5.5, "error-out": 14.5 },
    typeBoxSide: "left",
  },
  "scan-from-string": {
    baseHeight: 37,
    firstRowCenter: 32,
    leftY: { "input-string": 5, "initial-scan-location": 14, "error-in": 23 },
    rightY: { "remaining-string": 5, "offset-past-scan": 14, "error-out": 23 },
    typeBoxSide: "right",
  },
};

/** Whether the node is one of the two with rows of arguments (their block says so in the catalog). */
export const isFormatNode = (node, cat) => cat.bloque(node.tipo).in === "dynamic:format-rows";

export function rowCount(node, cat) {
  return node.config?.inputs ?? cat.bloque(node.tipo).config.inputs.value;
}

const rowsOf = (node, cat) => cat.bloque(node.tipo).filas;

export function formatNodeSize(node, cat) {
  const layout = LAYOUTS[node.tipo];
  return { ancho: FORMAT_NODE_WIDTH, alto: layout.baseHeight + (rowCount(node, cat) - 1) * FORMAT_ROW_STEP };
}

/** The index of the row a port belongs to (`input-2`, `default-2` and `output-2` are row 2), or -1 if it is a fixed one. */
export function rowOfPort(node, cat, portName) {
  const { prefijo, prefijoSalida } = rowsOf(node, cat);
  for (const prefix of [prefijo, prefijoSalida]) {
    if (prefix && portName.startsWith(prefix)) return Number(portName.slice(prefix.length));
  }
  return -1;
}

/**
 * The place of every terminal of the node, relative to its top-left corner, in the order of the
 * catalog: `{ name, dir, side, x, y }`; `side` is "left", "right" or "top".
 */
export function formatNodeTerminalSpots(node, cat) {
  const layout = LAYOUTS[node.tipo];
  const { ancho } = formatNodeSize(node, cat);
  const ports = cat.puertos(node);
  const spot = (port, dir) => {
    const row = rowOfPort(node, cat, port.name);
    const side = dir === "in" ? "left" : "right";
    const x = dir === "in" ? 0 : ancho;
    if (row >= 0) return { name: port.name, dir, side, x, y: layout.firstRowCenter + row * FORMAT_ROW_STEP };
    if (port.name === "format-string") return { name: port.name, dir, side: "top", x: FORMAT_STRING_X, y: 0 };
    const y = (dir === "in" ? layout.leftY : layout.rightY)[port.name];
    return { name: port.name, dir, side, x, y };
  };
  return [...ports.in.map((port) => spot(port, "in")), ...ports.out.map((port) => spot(port, "out"))];
}

/** The terminals of the node as the editor wants them (see `terminales` in diagram-view.mjs). */
export function formatNodeTerminals(node, box, cat) {
  const labels = new Map([...cat.puertos(node).in, ...cat.puertos(node).out].map((port) => [port.name, port.label]));
  const half = TERMINAL_ZONE / 2;
  return formatNodeTerminalSpots(node, cat).map((spot) => {
    const [x, y] = [box.x + spot.x, box.y + spot.y];
    const vertical = spot.side === "top";
    const zone = vertical ? { x: x - half, y: y - TOP_TERMINAL_ZONE_HEIGHT / 2, ancho: TERMINAL_ZONE, alto: TOP_TERMINAL_ZONE_HEIGHT } : { x: x - half, y: y - half, ancho: TERMINAL_ZONE, alto: TERMINAL_ZONE };
    return { puerto: spot.name, etiqueta: labels.get(spot.name) ?? spot.name, dir: spot.dir, ...(vertical ? { lado: "top" } : {}), x, y, zona: zone, centro: { x, y } };
  });
}

/** The point of the node that hangs from the cursor when it is picked from the palette: its centre (31-scan-placed.png, 03-fmt-placed.png). */
export function formatNodeGrabPoint(block, cat) {
  const { ancho, alto } = formatNodeSize({ tipo: block }, cat);
  return { x: Math.round(ancho / 2), y: Math.round(alto / 2) };
}

/** Where the bottom handle that stretches the node sits (its middle, on the bottom edge). */
export const formatNodeHandle = (box) => ({ x: box.ancho / 2 - 3, y: box.alto - 3 });

// ——— Rows ———

/** The ports of a row that a wire can reach: the inputs and, in Scan From String, the output. */
const rowPortNames = (node, cat, row) => {
  const { prefijo, prefijoSalida } = rowsOf(node, cat);
  return [`${prefijo}${row}`, ...(prefijoSalida ? [`${prefijoSalida}${row}`] : [])];
};

/** The index of the last row with a wire on any of its ports, or -1 if none has one. */
export function lastWiredRow(graph, node, cat) {
  let last = -1;
  for (const wire of graph.cables) {
    for (const [end, dir] of [[wire.a, "in"], [wire.de, "out"]]) {
      if (end.nodo === node.id && rowOfPort(node, cat, end.puerto) >= 0 && cat.puertos(node)[dir].some((port) => port.name === end.puerto)) {
        last = Math.max(last, rowOfPort(node, cat, end.puerto));
      }
    }
  }
  return last;
}

/**
 * The type each row has now: the one of its wire, or the one it keeps in `config.rowTypes`
 * (DBL by default). Read from the resolved types of the diagram.
 */
function currentRowTypes(graph, node, cat) {
  const resolved = tipos(graph, cat);
  const { prefijo } = rowsOf(node, cat);
  return Array.from({ length: rowCount(node, cat) }, (_, row) => resolved.entradas.get(`${node.id}.${prefijo}${row}`) ?? DBL);
}

/** The node with `rowTypes` as its rows: as many rows as types. */
const withRowTypes = (graph, nodeId, rowTypes) => ({
  ...graph,
  nodos: graph.nodos.map((node) => (node.id === nodeId ? { ...node, config: { ...node.config, inputs: rowTypes.length, rowTypes } } : node)),
});

/**
 * Stretching the node: `steps` rows more (or fewer) than it had. A row that goes away must have no
 * wire (16-node-stretched.png: shrinking only removes unwired rows), so the node stops at the last
 * wired one; there is always at least one row.
 */
export function stretchedRows(graph, nodeId, cat, steps) {
  const node = graph.nodos.find((candidate) => candidate.id === nodeId);
  const smallest = Math.max(1, lastWiredRow(graph, node, cat) + 1);
  const rows = Math.max(smallest, rowCount(node, cat) + steps);
  // A new row takes the type of the row above it (16-node-stretched.png: I8 rows after an I8 one).
  const types = currentRowTypes(graph, node, cat);
  while (types.length < rows) types.push(types.at(-1));
  return withRowTypes(graph, nodeId, types.slice(0, rows));
}

/** Moves the wires of the ports of a row to another row (`toRow` -1: the wires are dropped). */
function renumberWires(graph, node, cat, mapRow) {
  const { prefijo, prefijoSalida } = rowsOf(node, cat);
  const move = (end, prefix) => {
    if (end.nodo !== node.id || !prefix || !end.puerto.startsWith(prefix)) return end;
    const target = mapRow(Number(end.puerto.slice(prefix.length)));
    return target < 0 ? null : { ...end, puerto: `${prefix}${target}` };
  };
  const cables = graph.cables.flatMap((wire) => {
    const a = move(wire.a, prefijo);
    const de = move(wire.de, prefijoSalida);
    return a && de ? [{ ...wire, a, de }] : [];
  });
  return { ...graph, cables };
}

/** Add Parameter on a row: a new row right below it; the rows below keep their wires and move down. */
export function addedRow(graph, nodeId, cat, row) {
  const node = graph.nodos.find((candidate) => candidate.id === nodeId);
  const types = currentRowTypes(graph, node, cat);
  types.splice(row + 1, 0, types[row]);
  const renumbered = renumberWires(graph, node, cat, (index) => (index > row ? index + 1 : index));
  return withRowTypes(renumbered, nodeId, types);
}

/** Remove Parameter on a row: it goes with its wires and the rows below move up. The last row stays (there is always one). */
export function removedRow(graph, nodeId, cat, row) {
  const node = graph.nodos.find((candidate) => candidate.id === nodeId);
  if (rowCount(node, cat) <= 1) return graph;
  const types = currentRowTypes(graph, node, cat);
  types.splice(row, 1);
  const renumbered = renumberWires(graph, node, cat, (index) => (index === row ? -1 : index > row ? index - 1 : index));
  return withRowTypes(renumbered, nodeId, types);
}

// ——— Drawing ———

const f2 = (value) => Number(value.toFixed(2));

/** The text inside the box of a type: its name, "abc" for strings and "TF" for Booleans. */
const typeBoxText = (type) => (type === "string" ? "abc" : type === "boolean" ? "TF" : nombre(type));

/**
 * The box with the type of a row, in the colour of the type: a black rule on the side that faces the
 * inside of the node, as in 03z.png (left box of Format Into String) and 31z-scan-placed.png (right
 * box of Scan From String), and the name of the type on it.
 */
function typeBox(type, side, centerY) {
  const top = centerY - TYPE_BOX.height / 2;
  const left = side === "left" ? 0 : FORMAT_NODE_WIDTH - TYPE_BOX.width;
  const [outerEdgeX, innerEdgeX] = side === "left" ? [left, left + TYPE_BOX.width] : [left + TYPE_BOX.width, left];
  const color = aspecto(type ?? DBL).color;
  return (
    `<g class="caja-tipo">` +
    `<polyline points="${f2(outerEdgeX)},${f2(top)} ${f2(innerEdgeX)},${f2(top)} ${f2(innerEdgeX)},${f2(top + TYPE_BOX.height)}" fill="none" stroke="#000" stroke-width="1.5"/>` +
    `<text x="${f2(left + TYPE_BOX.width / 2)}" y="${f2(centerY + 0.4)}" fill="${color}">${typeBoxText(type ?? DBL)}</text>` +
    `</g>`
  );
}

/** The 4 x 4 checkerboard that stands for the format (drawn anew, at the corner of the icon). */
function checkerboard(x, y) {
  let cells = "";
  for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) if ((row + column) % 2 === 0) cells += `<rect x="${x + column * 1.5}" y="${y + row * 1.5}" width="1.5" height="1.5"/>`;
  return `<g fill="${BORDER_COLOR}"><rect x="${x - 1}" y="${y - 1}" width="8" height="8" fill="none" stroke="${BORDER_COLOR}" stroke-width="0.8"/>${cells}</g>`;
}

/** The icon of each node on the top rows of its body: the percent sign, the checkerboard and an arrow toward or away from the string. */
function icon(blockType) {
  const arrow = (x1, x2) => `<path d="M${x1} 6.5H${x2}M${x2 - 2} 4.5L${x2} 6.5L${x2 - 2} 8.5" fill="none" stroke="${BORDER_COLOR}" stroke-width="1"/>`;
  const percent = `<text class="porciento" x="16" y="9" fill="${BORDER_COLOR}">%</text>`;
  return blockType === "scan-from-string" ? `${checkerboard(3.5, 3)}${percent}${arrow(23, 29)}` : `${arrow(3, 9)}${percent}${checkerboard(22.5, 3)}`;
}

/** The mark of the default value of a row of Scan From String, on the left of the row. */
const defaultMark = (centerY) => `<circle cx="6" cy="${f2(centerY)}" r="2.6" fill="none" stroke="${BORDER_COLOR}" stroke-width="0.9"/><circle cx="6" cy="${f2(centerY)}" r="0.9" fill="${BORDER_COLOR}"/>`;

/**
 * The body of the node: border, fill, the icon and, for each row, the box with its type. The type of
 * each row is the one `resolved` (the types resolved from the wires, as `Gr.tipos` returns them)
 * gives to the input of Format Into String and to the output of Scan From String.
 */
export function formatNodeBody(node, box, cat, resolved) {
  const layout = LAYOUTS[node.tipo];
  const { prefijo, prefijoSalida } = rowsOf(node, cat);
  const scan = node.tipo === "scan-from-string";
  let rows = "";
  for (let row = 0; row < rowCount(node, cat); row++) {
    const centerY = layout.firstRowCenter + row * FORMAT_ROW_STEP;
    const type = scan ? resolved?.salidas.get(`${node.id}.${prefijoSalida}${row}`) : resolved?.entradas.get(`${node.id}.${prefijo}${row}`);
    rows += typeBox(type, layout.typeBoxSide, centerY) + (scan ? defaultMark(centerY) : "");
  }
  return (
    `<svg class="formato" viewBox="0 0 ${f2(box.ancho)} ${f2(box.alto)}">` +
    `<rect x="0.5" y="0.5" width="${f2(box.ancho - 1)}" height="${f2(box.alto - 1)}" fill="${FILL_COLOR}" stroke="${BORDER_COLOR}" stroke-width="1"/>` +
    `${icon(node.tipo)}${rows}</svg>`
  );
}
