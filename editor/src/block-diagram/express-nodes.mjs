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

/** The expansion rows of the node, in order: the port, its side and its label. */
function rowsOf(node, cat) {
  const ports = cat.puertos(node);
  const byName = new Map([...ports.in.map((port) => [port.name, { port, dir: "in" }]), ...ports.out.map((port) => [port.name, { port, dir: "out" }])]);
  return expansionRowPorts(cat.bloque(node.tipo), node, ports).map((name) => ({ name, dir: byName.get(name).dir, label: byName.get(name).port.label ?? name }));
}

/** The vertical layout of the node: where the rows start, where the chevron is and how tall the node is. */
function layoutOf(node, cat) {
  if (!isConfigured(node)) return { iconTop: ICON_TOP, captionEnd: TOP_BLOCK, rowsTop: TOP_BLOCK, rows: [], height: UNCONFIGURED_HEIGHT, chevronTop: UNCONFIGURED_CHEVRON_TOP };
  const rows = rowsOf(node, cat);
  const rowsEnd = TOP_BLOCK + rows.length * ROW_PITCH;
  return { iconTop: ICON_TOP, captionEnd: TOP_BLOCK, rowsTop: TOP_BLOCK, rows, height: rowsEnd + BOTTOM_STRIP + BORDER, chevronTop: rowsEnd };
}

/** The box of the node, from the top left corner where it was placed: a configured node only grows downwards. */
export const expressBox = (node, cat) => ({ x: node.x, y: node.y, ancho: EXPRESS_NODE_WIDTH, alto: layoutOf(node, cat).height });

/** The point of the node that hangs from the cursor when it is picked from the palette: the middle of the unconfigured node. */
export const expressGrabPoint = () => ({ x: EXPRESS_NODE_WIDTH / 2, y: Math.round(UNCONFIGURED_HEIGHT / 2) });

/**
 * Where every terminal sits, from the node's top left corner: `side`, the top of its mark and where its wire attaches.
 * A terminal of a row is at the middle of its row, on the edge; one that stays on the icon is at its slot, spread
 * evenly down the icon for a block that has no measured slots.
 */
function spotsOf(node, cat) {
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

/** The terminals of the node as the editor wants them (see `terminales` in diagram-view.mjs), in the order of the catalog. */
export function expressTerminals(node, box, cat) {
  const labels = new Map([...cat.puertos(node).in, ...cat.puertos(node).out].map((port) => [port.name, port.label]));
  return spotsOf(node, cat).map((spot) => {
    const onLeft = spot.side === "left";
    const [x, y] = [box.x + (onLeft ? 0 : EXPRESS_NODE_WIDTH - 1), box.y + spot.markTop + MARK.height / 2];
    const zoneHeight = spot.row === undefined ? ICON_ZONE_HEIGHT : ROW_PITCH;
    const zona = { x: onLeft ? box.x : box.x + EXPRESS_NODE_WIDTH - ZONE_WIDTH, y: spot.row === undefined ? y - zoneHeight / 2 : box.y + spot.row, ancho: ZONE_WIDTH, alto: zoneHeight };
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

/** The inside of the node's element (the element itself is made by `nodo` in diagram-view.mjs). */
export function expressBody(node, box, cat, resolved) {
  const layout = layoutOf(node, cat);
  const icon = EXPRESS_ICONS[node.tipo] ?? "";
  const frame = `<div class="express-frame"></div>`;
  const iconBox = `<div class="express-icon" style="left:${px(ICON_LEFT)};top:${px(layout.iconTop)}">${icon}</div>`;
  const captionTop = layout.iconTop + ICON_SIZE;
  const caption = `<div class="express-caption" style="top:${px(captionTop)};height:${px(layout.captionEnd - captionTop)}">${esc(expressCaption(node, cat))}</div>`;
  const lastRow = layout.rows.length - 1;
  const rows = layout.rows
    .map((row, index) => `<div class="express-row ${row.dir}${index === lastRow ? " last" : ""}" style="top:${px(layout.rowsTop + index * ROW_PITCH)};height:${px(ROW_PITCH)}"><span style="${row.dir === "in" ? "left" : "right"}:${px(ROW_LABEL_INSET - BORDER)}">${esc(row.label)}</span></div>`)
    .join("");
  const chevron = `<div class="express-chevron" style="left:${px(CHEVRON_LEFT)};top:${px(layout.chevronTop)}">${CHEVRON}</div>`;
  const marks = spotsOf(node, cat)
    .map((spot) => {
      const color = spot.row === undefined ? markColor(node, cat, resolved, spot) : "var(--ink)";
      return `<div class="express-mark" style="left:${px(spot.side === "left" ? MARK_INSET : EXPRESS_NODE_WIDTH - MARK_INSET - MARK.width)};top:${px(spot.markTop)}">${markShape(color)}</div>`;
    })
    .join("");
  return frame + iconBox + caption + rows + chevron + marks;
}
