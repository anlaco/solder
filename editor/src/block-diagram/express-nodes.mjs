// The node of an Express VI on the Block Diagram (DT-069): a blue box 96 px wide with the 32 × 32 icon of the VI, its
// caption below and a chevron at the bottom. Measured at 100 % in LabVIEW 2026 Q3
// (labview-captures/reports/2026-10-29-express-vi-common.md §2, §3 and 2026-10-29-time-delay.md):
//   - Unconfigured, 96 × 67: the icon at (32, 4) and every terminal on the edge of the node, at fixed heights.
//   - Configured, 96 × 82: the terminals the dialog sets (`express-row` in the catalog) leave the icon and become
//     white rows 16 px apart, each with its label, below the caption, with #3366ff lines at y 57 and 72, a strip of 8 px
//     under them and the border at 81; the others stay on the icon, where they were.
//   - Dragging the bottom edge to grow the rows, and View As Icon, are not done yet (stage B of DT-069).
// What was NOT measured, and is a guess here: how the rows of a node with two or more of them join (a line between them,
// here a double one) and the look of an output's row. Measured in the editor-vs-LabVIEW comparison
// (reports/2026-10-29-editor-time-delay-compare.md): the icon, the caption and the terminals that stay on the icon do
// NOT move when Time Delay is configured; the node grows downwards only. (Simulate Signal grew 8 px upwards, but it gains
// icon terminals; for a node whose icon terminals do not change, the 8 px shift is unverified and not applied.)
//
// Pure geometry and drawing, like format-nodes.mjs: no DOM.

import { expansionRowPorts, isConfigured, isExpress } from "../../../core/model/express.mjs";
import { aspecto } from "../../../core/model/types.mjs";
import { EXPRESS_ICONS } from "../common/glyphs.mjs";

export const EXPRESS_NODE_WIDTH = 96;
/** The inventory id of the right-click menu every Express VI shares (DT-069 §6). */
export const EXPRESS_MENU = "context.express-vi";
/** The menu of the node in its icon view, whose rows are in another order (measured). */
export const EXPRESS_ICON_MENU = "context.express-vi-icon";
export const isExpressMenu = (root) => root === EXPRESS_MENU || root === EXPRESS_ICON_MENU;
const ICON_SIZE = 32;
const ICON_LEFT = 32;
const ICON_TOP = 4;
/** The node's height while unconfigured. */
const UNCONFIGURED_HEIGHT = 67;
/** Where the caption's area ends, and where the first row's top line is (the top block of the measured expansion). */
const TOP_BLOCK = 57;
export const ROW_PITCH = 16;
/** The strip under the last row, and the border under it. */
const BOTTOM_STRIP = 8;
const BORDER = 1;
const CHEVRON_SIZE = 7;
const CHEVRON_LEFT = 45;
/** The chevron's top: 58 while unconfigured, and 73 under the first row (measured). */
const UNCONFIGURED_CHEVRON_TOP = 58;
/** The mark of a terminal: a right-pointing triangle in a box 3 px wide and 5 tall (its columns are 5, 3 and 1 px tall). */
const MARK = { width: 3, height: 5 };
/** The mark is 1 px inside the border: its left edge at x 2 on the left, and its right edge at x 93 on the right. */
const MARK_INSET = 2;
/** From the top of a row to the top of its terminal's mark (measured: row line at 57, mark at 62). */
const ROW_MARK_OFFSET = 5;
/** The clickable zone of a terminal, wider than its mark so that a wire can be dropped on it. */
const ZONE_WIDTH = 10;
const ICON_ZONE_HEIGHT = 8;
/** From the node's edge to the label of a row. */
const ROW_LABEL_INSET = 14;
/** The leftmost x a label that does not fit moves to, the x its end is clipped at, and where an output's label is centred. */
const ROW_LABEL_LEAST = 7;
const ROW_LABEL_LIMIT = EXPRESS_NODE_WIDTH - 1 - BORDER;
const ROW_OUTPUT_LABEL_CENTRE = 45.5;

/**
 * Where each terminal that stays on the icon sits: its side and the top of its mark, from the top of the icon
 * (measured on Time Delay at y 4, 33 and 22 of the node, whose icon is 4 px down). They look like fixed
 * connector-pane slots.
 */
const ICON_SLOTS = {
  "time-delay": { "delay-time": { side: "left", y: 0 }, "error-in": { side: "left", y: 29 }, "error-out": { side: "right", y: 18 } },
};

/** Whether the node is an Express VI (its block says so in the catalog). */
export const isExpressNode = (node, cat) => isExpress(cat.bloque(node.tipo));

/** The caption of the node: its own, or the name of its Express VI. */
export const expressCaption = (node, cat) => node.config?.caption ?? cat.bloque(node.tipo).express.name;

/** What the dialog and the menu call the node: "Configure Time Delay [Time Delay]". */
export const configureTitle = (node, cat) => `Configure ${cat.bloque(node.tipo).express.name} [${expressCaption(node, cat)}]`;

/** Every terminal of the block in connector order (inputs, then outputs): the port, its side and its label. */
function connectorOrder(node, cat) {
  const ports = cat.puertos(node);
  return [...ports.in.map((port) => ({ name: port.name, dir: "in", label: port.label ?? port.name })), ...ports.out.map((port) => ({ name: port.name, dir: "out", label: port.label ?? port.name }))];
}

/** How many rows the configuration needs: the terminals its dialog sets (none until configured). */
const requiredRowCount = (node, cat) => expansionRowPorts(cat.bloque(node.tipo), node, cat.puertos(node)).length;

/**
 * The expansion rows of the node, in connector order: the terminals the configuration puts in rows (measured) and, when the
 * bottom edge was dragged down (`vista.rows`), the first ones of the connector that are not (measured on Time Delay
 * dragged to 3 rows: Delay Time, error in, error out). A terminal in a row leaves the icon.
 */
function rowsOf(node, cat) {
  const all = connectorOrder(node, cat);
  const chosen = new Set(expansionRowPorts(cat.bloque(node.tipo), node, cat.puertos(node)));
  const count = Math.min(all.length, Math.max(chosen.size, node.vista?.rows ?? 0));
  for (const port of all) if (chosen.size < count) chosen.add(port.name);
  return all.filter((port) => chosen.has(port.name));
}

/** Whether the node is drawn as its icon alone (View As Icon): 38 × 38, with no caption, rows or terminal marks. */
export const isIconView = (node) => Boolean(node.vista?.compacto);
const ICON_VIEW = { size: 38, iconOffset: 3 };
const ICON_VIEW_CHAMFER = 5;

/**
 * Where a terminal's wire meets the icon view, from the node's top, by block: measured on a configured wired Time Delay (the
 * wires meet at y 15 for Delay Time and 31 for error in and error out). A block with none measured spreads the terminals of
 * each side evenly.
 */
const ICON_VIEW_Y = { "time-delay": { "delay-time": 15, "error-in": 31, "error-out": 31 } };

/** The vertical layout of the node: where the rows start, where the chevron is and how tall the node is. */
function layoutOf(node, cat) {
  const rows = rowsOf(node, cat);
  if (!rows.length) return { iconTop: ICON_TOP, captionEnd: TOP_BLOCK, rowsTop: TOP_BLOCK, rows: [], height: UNCONFIGURED_HEIGHT, chevronTop: UNCONFIGURED_CHEVRON_TOP };
  const rowsEnd = TOP_BLOCK + rows.length * ROW_PITCH;
  return { iconTop: ICON_TOP, captionEnd: TOP_BLOCK, rowsTop: TOP_BLOCK, rows, height: rowsEnd + BOTTOM_STRIP + BORDER, chevronTop: rowsEnd };
}

/** The box of the node, from the top left corner where it was placed: it only grows downwards. */
export function expressBox(node, cat) {
  if (isIconView(node)) return { x: node.x, y: node.y, ancho: ICON_VIEW.size, alto: ICON_VIEW.size };
  return { x: node.x, y: node.y, ancho: EXPRESS_NODE_WIDTH, alto: layoutOf(node, cat).height };
}

/**
 * The graph with the node's rows changed by dragging its bottom edge `steps` rows (one row per 16 px) from the rows it had in
 * `graph`: never fewer than the configuration needs, never more than it has terminals. `vista.rows` is dropped when it adds nothing.
 */
export function stretchedRows(graph, nodeId, cat, steps) {
  const node = graph.nodos.find((candidate) => candidate.id === nodeId);
  const required = requiredRowCount(node, cat);
  const rows = Math.min(connectorOrder(node, cat).length, Math.max(required, rowsOf(node, cat).length + steps));
  const nodos = graph.nodos.map((candidate) => {
    if (candidate.id !== nodeId) return candidate;
    const { vista, ...rest } = candidate;
    const { rows: _previous, ...others } = vista ?? {};
    const next = rows > required ? { ...others, rows } : others;
    return Object.keys(next).length ? { ...rest, vista: next } : rest;
  });
  return { ...graph, nodos };
}

/** The handle along the bottom edge that is dragged to grow the rows (not drawn in the icon view). */
export const stretchHandle = (box) => ({ x: 0, y: box.alto - 3, ancho: box.ancho, alto: 4 });

/** The point of the node that hangs from the cursor when it is picked from the palette: the middle of the unconfigured node. */
export const expressGrabPoint = () => ({ x: EXPRESS_NODE_WIDTH / 2, y: Math.round(UNCONFIGURED_HEIGHT / 2) });

/**
 * Where every terminal sits, from the node's top left corner: `side`, the top of its mark and where its wire attaches.
 * A terminal of a row is at the middle of its row, on the edge; one that stays on the icon is at its slot, spread
 * evenly down the icon for a block that has no measured slots.
 */
function spotsOf(node, cat) {
  if (isIconView(node)) return iconViewSpots(node, cat);
  const layout = layoutOf(node, cat);
  const ports = cat.puertos(node);
  const slots = ICON_SLOTS[node.tipo] ?? {};
  const rowIndex = new Map(layout.rows.map((row, index) => [row.name, index]));
  const spot = (port, dir, position, count) => {
    const inRow = rowIndex.get(port.name);
    const side = dir === "in" ? "left" : "right";
    if (inRow !== undefined) {
      const rowTop = layout.rowsTop + inRow * ROW_PITCH;
      return { name: port.name, dir, side, markTop: rowTop + ROW_MARK_OFFSET, row: rowTop };
    }
    const slotY = slots[port.name]?.y ?? Math.round(((position + 0.5) * ICON_SIZE) / count - MARK.height / 2);
    return { name: port.name, dir, side: slots[port.name]?.side ?? side, markTop: layout.iconTop + slotY };
  };
  const stay = (list) => list.filter((port) => !rowIndex.has(port.name));
  const place = (list, dir) => list.map((port) => spot(port, dir, stay(list).indexOf(port), stay(list).length));
  return [...place(ports.in, "in"), ...place(ports.out, "out")];
}

/** The terminals of the icon view: on the edges of the 38 px box, at the heights of `ICON_VIEW_Y` (`y` is the wire's). */
function iconViewSpots(node, cat) {
  const heights = ICON_VIEW_Y[node.tipo] ?? {};
  const sideOf = (port) => ICON_SLOTS[node.tipo]?.[port.name]?.side ?? (port.dir === "in" ? "left" : "right");
  const all = connectorOrder(node, cat).map((port) => ({ ...port, side: sideOf(port) }));
  return all.map((port) => {
    const sameSide = all.filter((other) => other.side === port.side);
    const y = heights[port.name] ?? ((sameSide.indexOf(port) + 0.5) * ICON_VIEW.size) / sameSide.length;
    return { name: port.name, dir: port.dir, side: port.side, markTop: y - MARK.height / 2, iconView: true };
  });
}

/** The terminals of the node as the editor wants them (see `terminales` in diagram-view.mjs), in the order of the catalog. */
export function expressTerminals(node, box, cat) {
  const labels = new Map([...cat.puertos(node).in, ...cat.puertos(node).out].map((port) => [port.name, port.label]));
  return spotsOf(node, cat).map((spot) => {
    const onLeft = spot.side === "left";
    const [x, y] = [box.x + (onLeft ? 0 : box.ancho - 1), box.y + spot.markTop + MARK.height / 2];
    const zoneHeight = spot.row === undefined ? ICON_ZONE_HEIGHT : ROW_PITCH;
    const zona = { x: onLeft ? box.x : box.x + box.ancho - ZONE_WIDTH, y: spot.row === undefined ? y - zoneHeight / 2 : box.y + spot.row, ancho: ZONE_WIDTH, alto: zoneHeight };
    return { puerto: spot.name, etiqueta: labels.get(spot.name) ?? spot.name, dir: spot.dir, x, y, zona, centro: { x, y } };
  });
}

const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const px = (n) => `${Number(n.toFixed(2))}px`;
/** Two stacked Vs, grey (measured: #8496a5, 7 × 7). */
const CHEVRON = `<svg viewBox="0 0 ${CHEVRON_SIZE} ${CHEVRON_SIZE}" aria-hidden="true"><path d="M0.5 0.5L3.5 3.5L6.5 0.5M0.5 3.5L3.5 6.5L6.5 3.5" fill="none" stroke="var(--express-chevron)" stroke-width="1"/></svg>`;
/** A terminal's mark: the triangle of 3 columns 5, 3 and 1 px tall, pointing right, in `color`. */
const markShape = (color) => `<svg width="${MARK.width}" height="${MARK.height}" viewBox="0 0 3 5" shape-rendering="crispEdges" aria-hidden="true"><path d="M0 0h1v5h-1zM1 1h1v3h-1zM2 2h1v1h-1z" fill="${color}"/></svg>`;

/** The colour of a terminal's mark: the one of its resolved type, or of the type its block declares. */
function markColor(node, cat, resolved, spot) {
  const port = [...cat.puertos(node).in, ...cat.puertos(node).out].find((candidate) => candidate.name === spot.name);
  const type = (spot.dir === "in" ? resolved?.entradas : resolved?.salidas)?.get(`${node.id}.${spot.name}`) ?? port?.type ?? "number";
  return aspecto(type).color;
}

/**
 * Where a row's label starts, from the row's left edge (the row is 1 px inside the node). An input's starts at x 14 of the node, but
 * when it does not fit LabVIEW moves it left, down to x 7, and clips the end (measured on "error in (no error)", which starts at
 * x 7 and reads "error in (no error"; "Delay Time (s)" fits at 14). An output's is centred on x 45.5 of the node (measured on
 * "error out", 23–68). Both are one case each: other widths are unverified.
 */
function labelLeft(row, measure) {
  if (row.dir === "out") return ROW_OUTPUT_LABEL_CENTRE - BORDER;
  const start = ROW_LABEL_INSET;
  const left = start + measure(row.label) > ROW_LABEL_LIMIT ? Math.max(ROW_LABEL_LEAST, ROW_LABEL_LIMIT - measure(row.label)) : start;
  return left - BORDER;
}

/** The colour of a row's text: its terminal's type colour (measured on Delay Time (s), orange). Unverified for the error rows and for an output's. */
const rowColor = (node, cat, resolved, row) => markColor(node, cat, resolved, { name: row.name, dir: row.dir });

/**
 * The icon view's box: 38 × 38 with its four corners cut by a hard 45° staircase of 5 px (measured: the bottom row starts at x 5, the
 * next at x 4, … the sixth at x 0; the same at every corner), not a rounded arc.
 */
function chamferedFrame() {
  const [size, cut] = [ICON_VIEW.size, ICON_VIEW_CHAMFER];
  const pixel = (x, y, width = 1, height = 1) => `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="var(--express-node-border)"/>`;
  const edges = pixel(cut, 0, size - 2 * cut) + pixel(cut, size - 1, size - 2 * cut) + pixel(0, cut, 1, size - 2 * cut) + pixel(size - 1, cut, 1, size - 2 * cut);
  let steps = "";
  for (let step = 0; step < cut; step++) {
    const [near, far] = [cut - 1 - step, size - cut + step];
    steps += pixel(near, step + 1) + pixel(far, step + 1) + pixel(near, size - 2 - step) + pixel(far, size - 2 - step);
  }
  const outline = [[cut, 0], [size - cut, 0], [size, cut], [size, size - cut], [size - cut, size], [cut, size], [0, size - cut], [0, cut]].map(([x, y]) => `${x},${y}`).join(" ");
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" aria-hidden="true"><polygon points="${outline}" fill="var(--express-node-fill)"/>${edges}${steps}</svg>`;
}

/** The inside of the node's element (the element itself is made by `nodo` in diagram-view.mjs). */
export function expressBody(node, box, cat, resolved, measure = (text) => text.length * 6) {
  if (isIconView(node)) {
    const icon = `<div class="express-icon" style="left:${px(ICON_VIEW.iconOffset)};top:${px(ICON_VIEW.iconOffset)}">${EXPRESS_ICONS[node.tipo] ?? ""}</div>`;
    return `<div class="express-frame icon-view">${chamferedFrame()}</div>${icon}`;
  }
  const layout = layoutOf(node, cat);
  const icon = EXPRESS_ICONS[node.tipo] ?? "";
  const frame = `<div class="express-frame"></div>`;
  const iconBox = `<div class="express-icon" style="left:${px(ICON_LEFT)};top:${px(layout.iconTop)}">${icon}</div>`;
  const captionTop = layout.iconTop + ICON_SIZE;
  const caption = `<div class="express-caption" style="top:${px(captionTop)};height:${px(layout.captionEnd - captionTop)}">${esc(expressCaption(node, cat))}</div>`;
  const lastRow = layout.rows.length - 1;
  const rows = layout.rows
    .map((row, index) => `<div class="express-row ${row.dir}${index === lastRow ? " last" : ""}" style="top:${px(layout.rowsTop + index * ROW_PITCH)};height:${px(ROW_PITCH)}"><span style="left:${px(labelLeft(row, measure))};color:${rowColor(node, cat, resolved, row)}"${row.dir === "out" ? ` class="centred"` : ""}>${esc(row.label)}</span></div>`)
    .join("");
  // Measured: no chevron once every terminal is a row (Time Delay dragged to 3 rows); with one row configured it is drawn.
  const chevron = layout.rows.length >= connectorOrder(node, cat).length ? "" : `<div class="express-chevron" style="left:${px(CHEVRON_LEFT)};top:${px(layout.chevronTop)}">${CHEVRON}</div>`;
  const marks = spotsOf(node, cat)
    .map((spot) => {
      const color = spot.row === undefined ? markColor(node, cat, resolved, spot) : "var(--express-black)";
      return `<div class="express-mark" style="left:${px(spot.side === "left" ? MARK_INSET : EXPRESS_NODE_WIDTH - MARK_INSET - MARK.width)};top:${px(spot.markTop)}">${markShape(color)}</div>`;
    })
    .join("");
  return frame + iconBox + caption + rows + chevron + marks;
}
