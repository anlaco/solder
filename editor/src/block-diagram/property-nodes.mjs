// The Property Node (DT-072) as a node of the Block Diagram: its look, its terminals, the menus its catalog of
// properties fills, and the edits of its rows.
//
// Measured at 1:1 in LabVIEW 2026 Q3:
//   - implicit, linked to a panel control (labview-captures/reports/2026-10-30-panel-property-node.md Q2, v3.png,
//     n3_z.png): a 1 px #4c4c3d frame, an 8 px cream (#ffffcc) header with the error glyphs `?!` at both ends and a
//     12 x 5 bar in the control's type colour, the width of the node less 26; 16 px rows (15 px inside and a line);
//     38 x 26 with "Value", 72 x 154 with nine rows; the control's label drawn above the node.
//   - explicit, with a reference (Instr; reports/2026-10-26-visa-property-node.md §2-§5, dz.png): an 18 px header
//     with the reference and error glyphs at both ends, a key and "Instr"; 66 x 35 with one row.
//   - each row shows its property's short name centred, in the colour of its type, and a black arrow at the right
//     edge when it reads, at the left edge when it writes; the width follows the longest row and grows around the
//     node's centre; a row's wire leaves 8 px under the line above the row (y 309 under the line at 301).
//
// Pure geometry, drawing and menus, like unbundle-by-name.mjs: no DOM.

import { PROPERTY_NODE, isImplicit } from "../../../core/model/property-node.mjs";
import { COLORES, aspecto, esCluster, esEnum } from "../../../core/model/types.mjs";
import { fijarConfig, linkedControlType } from "../../../core/model/graph.mjs";
import { strictHeaderText } from "./control-references.mjs";

export { PROPERTY_NODE };

export const isPropertyNode = (node) => node?.tipo === PROPERTY_NODE;

/** The class of a node fresh from Functions ▸ VISA Advanced, and of Create ▸ Property for Instr Class. */
export const INSTR_CLASS = "Instr";

/** Whether the node's class is a panel control's (implicit, or explicit with a control reference), not Instr. */
export const isControlClass = (node) => node.config?.class !== INSTR_CLASS;

/** A row whose property has not been chosen yet (the Instr node fresh from the palette) says "Property" (§2). */
export const NO_PROPERTY = "";
const NO_PROPERTY_TEXT = "Property";

// ——— Geometry ———

const FRAME = 1;
/** The cream inside of the header: 8 px on an implicit node, 17 on an explicit one (18 with the frame above). */
const IMPLICIT_HEADER = 8;
const EXPLICIT_HEADER = 17;
export const ROW_PITCH = 16;
const ROW_INSIDE = ROW_PITCH - 1;
/** The narrowest node: an implicit one with "Value" is 38 px wide, an Instr one 66 (both measured). */
const IMPLICIT_MIN_WIDTH = 38;
const EXPLICIT_MIN_WIDTH = 66;
/**
 * The room a row's text leaves on each side for the arrows, so that "Caption.Text" makes the node 72 px wide
 * (measured), and "Value", 30 px in the editor's font, leaves it at 38 (with 5 px it was 40: compared on 2026-11-03,
 * labview-captures/property-node-panel/solder-compare/). Calibrated against the editor's font, as Unbundle By Name's names are.
 */
const TEXT_SIDE_ROOM = 4;
/** A row's wire leaves this far under the row's top inside pixel (y 309 for the row starting at 302). */
const WIRE_BELOW_ROW_TOP = 7;
/** Where the header's terminals take their wires, from the node's top (unverified: the middle of their glyphs). */
const IMPLICIT_ERROR_Y = 5;
const EXPLICIT_REFERENCE_Y = 4;
const EXPLICIT_ERROR_Y = 13;
/** The square clicked to wire a header terminal; a row's terminal is as tall as the row. */
const TERMINAL_ZONE = 8;

/** The top of the first row: the frame, the header and the line under it. */
const headerHeight = (node) => FRAME + (isImplicit(node) ? IMPLICIT_HEADER : EXPLICIT_HEADER) + FRAME;
const rowTop = (node, row) => headerHeight(node) + ROW_PITCH * row;

export const rowsOf = (node) => node.config?.rows ?? [];

/** The index of the row a port belongs to (`row-2` is row 2), or -1 for the reference and error terminals. */
export const rowOfPort = (portName) => (portName?.startsWith("row-") ? Number(portName.slice("row-".length)) : -1);
export const portOfRow = (row) => `row-${row}`;

/** The property of a row in the catalog, or undefined for a row with none (or one the catalog does not know). */
export function rowProperty(node, cat, row) {
  const id = rowsOf(node)[row]?.property;
  const className = node.config?.class;
  return id && cat.properties?.classes[className] ? cat.properties.find(className, id) : undefined;
}

/** What a row shows: its property's short name (`Label.Text`), or "Property" when it has none. */
export function rowText(node, cat, row) {
  const property = rowProperty(node, cat, row);
  if (!property) return NO_PROPERTY_TEXT;
  return property.short ?? property.name;
}

/**
 * What an explicit node's header says: "Instr", or the strict class of the control reference ("DigNum (strict)",
 * "Bool (strict)", reports/2026-11-03-control-references.md Q4, Q6).
 */
const headerText = (node) => (isControlClass(node) ? strictHeaderText(node.config?.class) : node.config?.class ?? "");
/** The header's text starts at x 29, after the key, and leaves room for the glyphs on the right: "DigNum (strict)" makes the node 118 px, "Bool (strict)" 96. */
const HEADER_TEXT = { left: 29, right: 12 };

export function propertyNodeSize(node, cat, measure) {
  // An Instr node is 66 px with "Instr" (measured); a control class's header text sets its width.
  const headerWidth = isControlClass(node) ? Math.ceil(HEADER_TEXT.left + measure(headerText(node)) + HEADER_TEXT.right) : 0;
  const minimum = isImplicit(node) ? IMPLICIT_MIN_WIDTH : Math.max(EXPLICIT_MIN_WIDTH, headerWidth);
  const widest = Math.max(0, ...rowsOf(node).map((_, row) => measure(rowText(node, cat, row))));
  return { ancho: Math.max(minimum, Math.ceil(widest) + 2 * TEXT_SIDE_ROOM), alto: headerHeight(node) + ROW_PITCH * rowsOf(node).length };
}

/** The point of the node that hangs from the cursor when it is placed: its centre (unverified: as Unbundle By Name's). */
export function propertyNodeGrabPoint(config, cat, measure) {
  const { ancho, alto } = propertyNodeSize({ tipo: PROPERTY_NODE, config }, cat, measure);
  return { x: Math.round(ancho / 2), y: Math.round(alto / 2) };
}

/** Where each terminal is, relative to the node: the header's at the middle of their glyphs, a row's at its wire. */
function terminalY(node, portName) {
  if (portName === "reference" || portName === "reference-out") return EXPLICIT_REFERENCE_Y;
  if (portName === "error-in" || portName === "error-out") return isImplicit(node) ? IMPLICIT_ERROR_Y : EXPLICIT_ERROR_Y;
  return rowTop(node, rowOfPort(portName)) + WIRE_BELOW_ROW_TOP;
}

/** The terminals as the editor wants them (see `terminales` in diagram-view.mjs): inputs on the left edge, outputs on the right. */
export function propertyNodeTerminals(node, box, cat) {
  const { in: inputs, out: outputs } = cat.puertos(node);
  const half = TERMINAL_ZONE / 2;
  const place = (port, dir) => {
    const x = box.x + (dir === "in" ? 0 : box.ancho);
    const y = box.y + terminalY(node, port.name);
    const row = rowOfPort(port.name);
    const zona = row < 0 ? { x: x - half, y: y - half, ancho: TERMINAL_ZONE, alto: TERMINAL_ZONE } : { x: x - half, y: box.y + rowTop(node, row), ancho: TERMINAL_ZONE, alto: ROW_INSIDE };
    return { puerto: port.name, etiqueta: port.label ?? port.name, dir, x, y, zona, centro: { x, y } };
  };
  return [...inputs.map((port) => place(port, "in")), ...outputs.map((port) => place(port, "out"))];
}

/**
 * After an edit of the rows the node keeps its centre, as LabVIEW grows it (§3: 66 to 72 px, x 567 to 564): the
 * graph with the node moved by half of what its width changed.
 */
export function keepCentre(before, after, cat, measure, nodeId) {
  const [old, changed] = [before, after].map((graph) => graph.nodos.find((node) => node.id === nodeId));
  const growth = propertyNodeSize(changed, cat, measure).ancho - propertyNodeSize(old, cat, measure).ancho;
  const shift = Math.round(growth / 2);
  return shift ? { ...after, nodos: after.nodos.map((node) => (node.id === nodeId ? { ...node, x: node.x - shift } : node)) } : after;
}

// ——— Drawing ———

/** The frame (#4c4c3d) and the header (#ffffcc) are the nodes' colours of the theme (Old School: LabVIEW's). */
const FRAME_COLOR = "var(--format-node-border)";
const HEADER_COLOR = "var(--node-fill)";
const ROW_COLOR = "#ffffff";
const ARROW_COLOR = "#000000";
const GLYPH_COLOR = FRAME_COLOR;
/** "Instr" in the header of an Instr node (dz.png, read at 8x: a brownish red). */
const CLASS_NAME_COLOR = "#8d4c58";
/** The rows of Position and Bounds, clusters of numbers (n3_z.png). */
const CLUSTER_ROW_COLOR = "#993300";
/** A row whose property is not chosen or not known. */
const UNTYPED_ROW_COLOR = "#000000";
/**
 * The bar in the header of an implicit node: 12 x 5 px at x 13 on a 38 px node, so 26 px narrower than it, on a white
 * backing as wide and the header's whole height (y 1..8, v3_z.png).
 */
const BAR = { x: 13, y: 2, alto: 5, narrower: 26 };
const BAR_BACKING = { y: 1, alto: 8, color: "#ffffff" };

/** Draws a small picture given as rows of `#` (drawn anew, not NI's bitmaps) as one path of 1 px squares. */
function pixels(rows, x0, y0, color) {
  let path = "";
  rows.forEach((line, y) => [...line].forEach((cell, x) => (cell === "#" ? (path += `M${x0 + x} ${y0 + y}h1v1h-1z`) : null)));
  return `<path d="${path}" fill="${color}"/>`;
}

/** The error glyph, a question mark and an exclamation mark, 5 x 6 (read on v3_z.png at x 4..8, y 2..7). */
const ERROR_GLYPH = ["##.##", ".#.##", "##.##", "#..##", ".....", "#..##"];
/** The reference glyph of an explicit node: a sheet with a folded corner, 5 x 6 (dz.png). */
const REFERENCE_GLYPH = ["###..", "#.##.", "#.###", "#...#", "#...#", "#####"];
/** The instrument glyph before "Instr": a key, 11 x 6 at (14, 5) (dz.png). */
const KEY_GLYPH = [".......###.", ".......###.", "########..#", "#######....", "########..#", ".......###."];
const GLYPH_WIDTH = 5;
/** Where the implicit header's error glyphs sit: x 4 and 8 px in from the right edge, y 2 (v3_z.png). */
const ERROR_GLYPH_SPOT = { left: 4, fromRight: 8, top: 2 };

/** The type of the value a row reads or writes: the property's, or the linked control's for Value. */
function rowType(graph, cat, node, row) {
  const property = rowProperty(node, cat, row);
  if (!property?.done) return undefined;
  return property.type?.of === "control" ? linkedControlType(graph, cat, node) ?? "number" : property.type;
}

/** The colour of a row's text: its type's, as the wire's (§Q4). */
export function rowColor(graph, cat, node, row) {
  const type = rowType(graph, cat, node, row);
  if (type === undefined) return UNTYPED_ROW_COLOR;
  if (esEnum(type)) return COLORES.entero;
  if (esCluster(type)) return CLUSTER_ROW_COLOR;
  return aspecto(type).color;
}

/** The colour of the bar of an implicit node: the linked control's type. */
const barColor = (graph, cat, node) => aspecto(linkedControlType(graph, cat, node) ?? "number").color;

function arrow(node, box, row) {
  const middle = rowTop(node, row) + ROW_INSIDE / 2;
  const left = rowsOf(node)[row].write ? 2 : box.ancho - 5;
  return `<path d="M${left} ${middle - 3.5}L${left + 3} ${middle}L${left} ${middle + 3.5}Z" fill="${ARROW_COLOR}"/>`;
}

function implicitHeader(graph, cat, node, box) {
  const barWidth = Math.max(0, box.ancho - BAR.narrower);
  return (
    pixels(ERROR_GLYPH, ERROR_GLYPH_SPOT.left, ERROR_GLYPH_SPOT.top, GLYPH_COLOR) +
    `<rect x="${BAR.x}" y="${BAR_BACKING.y}" width="${barWidth}" height="${BAR_BACKING.alto}" fill="${BAR_BACKING.color}"/>` +
    `<rect x="${BAR.x}" y="${BAR.y}" width="${barWidth}" height="${BAR.alto}" fill="${barColor(graph, cat, node)}"/>` +
    pixels(ERROR_GLYPH, box.ancho - ERROR_GLYPH_SPOT.fromRight, ERROR_GLYPH_SPOT.top, GLYPH_COLOR)
  );
}

/** An explicit header's glyphs (dz.png): the sheet over the error glyph at x 4 and 8 px in from the right, y 2 and 11. */
const EXPLICIT_GLYPH_SPOT = { left: 4, fromRight: 8, referenceTop: 2, errorTop: 11 };

function explicitHeader(node, box) {
  const { left, fromRight, referenceTop, errorTop } = EXPLICIT_GLYPH_SPOT;
  const right = box.ancho - fromRight;
  return (
    pixels(REFERENCE_GLYPH, left, referenceTop, GLYPH_COLOR) +
    pixels(ERROR_GLYPH, left, errorTop, GLYPH_COLOR) +
    pixels(KEY_GLYPH, 14, 5, GLYPH_COLOR) +
    `<text class="clase-nodo" x="${HEADER_TEXT.left}" y="9" fill="${isControlClass(node) ? FRAME_COLOR : CLASS_NAME_COLOR}">${escapeText(headerText(node))}</text>` +
    pixels(REFERENCE_GLYPH, right, referenceTop, GLYPH_COLOR) +
    pixels(ERROR_GLYPH, right, errorTop, GLYPH_COLOR)
  );
}

/** The body of the node: frame, header, rows with their texts and arrows. */
export function propertyNodeBody(graph, cat, node, box) {
  const header = headerHeight(node);
  let rows = "";
  rowsOf(node).forEach((_, row) => {
    const top = rowTop(node, row);
    rows += `<line x1="1" y1="${top - 0.5}" x2="${box.ancho - 1}" y2="${top - 0.5}" stroke="${FRAME_COLOR}"/>`;
    rows += `<text class="nombre-propiedad" x="${box.ancho / 2}" y="${top + ROW_INSIDE / 2}" fill="${rowColor(graph, cat, node, row)}">${escapeText(rowText(node, cat, row))}</text>`;
    rows += arrow(node, box, row);
  });
  return (
    `<svg class="formato" viewBox="0 0 ${box.ancho} ${box.alto}">` +
    `<rect x="0.5" y="0.5" width="${box.ancho - 1}" height="${box.alto - 1}" fill="${ROW_COLOR}" stroke="${FRAME_COLOR}" stroke-width="1"/>` +
    `<rect x="1" y="1" width="${box.ancho - 2}" height="${header - 2}" fill="${HEADER_COLOR}"/>` +
    `<g shape-rendering="crispEdges">${isImplicit(node) ? implicitHeader(graph, cat, node, box) : explicitHeader(node, box)}${rows}</g></svg>`
  );
}

/** The label of the control an implicit node is linked to, drawn above the node (§Q2), or nothing. */
export const linkedLabel = (graph, node) => (isImplicit(node) ? labelAbove(graph, node.config.link) : "");

/** The label of the control `linkName`, drawn above a node that stands for it (an implicit node, a control reference). */
export function labelAbove(graph, linkName) {
  const linked = graph.nodos.find((candidate) => candidate.name === linkName);
  const text = linked?.label?.text;
  return text ? `<div class="etiqueta-enlace">${escapeText(text)}</div>` : "";
}

/** The strip of every row, whose right-click is the row's menu; coordinates relative to the node. */
export function rowZones(node, box) {
  return rowsOf(node)
    .map((_, row) => `<div class="fila-propiedad" data-nodo="${node.id}" data-fila-propiedad="${row}" style="left:1px;top:${rowTop(node, row)}px;width:${box.ancho - 2}px;height:${ROW_INSIDE}px"></div>`)
    .join("");
}

const escapeText = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ——— The menus the catalog fills ———

/** The right-click menu of an implicit node (§Q2: `hm`, `rm`) and of an Instr node (visa report §3). */
export const IMPLICIT_MENU = "context.property-node";
export const INSTR_MENU = "context.instr-property-node";
export const menuRoot = (node) => (isControlClass(node) ? IMPLICIT_MENU : INSTR_MENU);

/** The inventory entry a property not done yet explains itself with: the catalog's hole (DT-072 §8). */
export const PROPERTY_HOLE = "context.property-not-done";

/** The rows of the menu that only a row has: they are hidden on the header (§Q2, `hm` against `rm`). */
export const ROW_ONLY_ROWS = ["help-for-property", "select-property", "change-to-write", "add-element", "remove-element", "type-palette"];

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";

/**
 * The rows of a menu of properties (Create ▸ Property Node ▸, Select Property ▸, Create ▸ Property for Instr Class ▸),
 * as the inventory's entries the menu draws, under `parentId`. Returns the submenus by parent id, the property id each
 * row picks, the rows that are holes, and the rows to tick for `current` (the property and the submenus it is in).
 * `browse` puts LabVIEW's "Browse..." row first, greyed: its dialog is not done.
 */
export function propertyMenu(cat, className, parentId, { browse = false, current } = {}) {
  const submenus = new Map();
  const properties = new Map();
  const holes = new Set();
  const marks = new Set();
  const addList = (parent, groups, path, wholeParentPath) => {
    const entries = [];
    const used = new Map();
    let separate = false;
    const idFor = (name) => {
      const base = slug(name);
      const count = (used.get(base) ?? 0) + 1;
      used.set(base, count);
      return `${parent}.${count > 1 ? `${base}-${count}` : base}`;
    };
    groups.forEach((group, groupIndex) => {
      if (groupIndex > 0) separate = true;
      for (const item of group) {
        if (item.separator) {
          separate = true;
          continue;
        }
        const id = idFor(item.name);
        const entry = { id, etiqueta: item.name, estado: "built", ...(separate && entries.length ? { separado: true } : {}) };
        separate = false;
        entries.push(entry);
        if (item.reference) {
          holes.add(id);
          continue;
        }
        const itemPath = item.whole ? wholeParentPath : [...path, item.name];
        const children = item.of ? cat.properties.textObjectMenu(item.of) : item.submenu?.length ? [item.submenu] : null;
        if (children) {
          addList(id, children, itemPath, itemPath);
          if (current && current.startsWith(`${itemPath.join(":")}:`)) marks.add(id);
          if (current === itemPath.join(":")) marks.add(id);
          continue;
        }
        const propertyId = itemPath.join(":");
        if (cat.properties.find(className, propertyId)?.done) properties.set(id, propertyId);
        else holes.add(id);
        if (current === propertyId) marks.add(id);
      }
    });
    submenus.set(parent, entries);
  };
  const groups = cat.properties.menu(className);
  addList(parentId, browse ? [[{ name: "Browse..." }], ...groups] : groups, [], []);
  if (browse) holes.add(`${parentId}.browse`);
  return { submenus, properties, holes, marks };
}

// ——— Placing and editing ———

/** The configuration of the implicit node Create ▸ Property Node ▸ makes from a panel object, with one read row. */
export const implicitConfig = (className, linkName, propertyId) => ({ class: className, link: linkName, rows: [{ property: propertyId, write: false }], "ignore-errors": false });

/** The configuration of an explicit node of a control's class, as Create ▸ Property for <class> Class ▸ makes it. */
export const explicitConfig = (className, propertyId) => ({ class: className, link: null, rows: [{ property: propertyId, write: false }], "ignore-errors": false });

/** The configuration of an Instr node: from the palette with one row and no property, or with the one picked. */
export const instrConfig = (propertyId = NO_PROPERTY) => ({ class: INSTR_CLASS, link: null, rows: [{ property: propertyId, write: false }], "ignore-errors": false });

/** Whether a row may be turned to the other direction: a read-only property cannot write, a write-only one cannot read. */
export function canFlip(node, cat, row) {
  const property = rowProperty(node, cat, row);
  if (!property?.done) return true;
  return property.access === "read-write";
}

/** The direction a property's row takes when it is chosen: a write-only property writes (Value (Signaling)). */
const directionFor = (property, wanted) => (property.access === "write" ? true : property.access === "read" ? false : wanted);

/**
 * The wires of the node with each row's terminal renamed by `rename` (old row → new row, or -1 to drop the wire), as
 * rows are added and removed.
 */
function renumberWires(graph, nodeId, rename) {
  const cables = [];
  for (const wire of graph.cables) {
    const end = wire.de.nodo === nodeId ? "de" : wire.a.nodo === nodeId ? "a" : null;
    const row = end ? rowOfPort(wire[end].puerto) : -1;
    if (row < 0) {
      cables.push(wire);
      continue;
    }
    const to = rename(row);
    if (to >= 0) cables.push(to === row ? wire : { ...wire, [end]: { ...wire[end], puerto: portOfRow(to) } });
  }
  return { ...graph, cables };
}

const nodeOf = (graph, nodeId) => graph.nodos.find((node) => node.id === nodeId);
const withRows = (graph, nodeId, rows) => fijarConfig(graph, nodeId, { rows });

/** Select Property ▸ a property: the row shows it; a property that only reads or only writes turns the row so. */
export function selectProperty(graph, cat, nodeId, row, propertyId) {
  const node = nodeOf(graph, nodeId);
  const property = cat.properties.find(node.config.class, propertyId);
  const rows = rowsOf(node).map((current, index) => (index === row ? { property: propertyId, write: directionFor(property, !!current.write) } : current));
  const flipped = rows[row].write !== !!rowsOf(node)[row].write;
  return withRows(flipped ? renumberWires(graph, nodeId, (wired) => (wired === row ? -1 : wired)) : graph, nodeId, rows);
}

/** Change To Write or Change To Read: the row's terminal changes side, so its wire goes (unverified: LabVIEW's was not looked at). */
export function flipRow(graph, cat, nodeId, row) {
  const node = nodeOf(graph, nodeId);
  if (!canFlip(node, cat, row)) return graph;
  const rows = rowsOf(node).map((current, index) => (index === row ? { ...current, write: !current.write } : current));
  return withRows(renumberWires(graph, nodeId, (wired) => (wired === row ? -1 : wired)), nodeId, rows);
}

/** Whether every row writes: the node's menu then says Change All To Read. */
export const allWrite = (node) => rowsOf(node).length > 0 && rowsOf(node).every((row) => row.write);

/** Change All To Write (or Read, when every row writes): the rows that can turn do; their wires go. */
export function flipAllRows(graph, cat, nodeId) {
  const node = nodeOf(graph, nodeId);
  const write = !allWrite(node);
  const turned = new Set();
  const rows = rowsOf(node).map((current, index) => {
    if (!!current.write === write || !canFlip(node, cat, index)) return current;
    turned.add(index);
    return { ...current, write };
  });
  return withRows(renumberWires(graph, nodeId, (wired) => (turned.has(wired) ? -1 : wired)), nodeId, rows);
}

/** Add Element: a new row under this one, with its property and direction (visa report §4). */
export function addRow(graph, nodeId, row) {
  const rows = [...rowsOf(nodeOf(graph, nodeId))];
  rows.splice(row + 1, 0, { ...rows[row] });
  return withRows(renumberWires(graph, nodeId, (wired) => (wired > row ? wired + 1 : wired)), nodeId, rows);
}

/** Remove Element: the row goes with its wire, never the last one (greyed with one row, §Q2). */
export function removeRow(graph, nodeId, row) {
  const rows = rowsOf(nodeOf(graph, nodeId));
  if (rows.length <= 1) return graph;
  const rewired = renumberWires(graph, nodeId, (wired) => (wired === row ? -1 : wired > row ? wired - 1 : wired));
  return withRows(rewired, nodeId, rows.filter((_, index) => index !== row));
}

/**
 * Link to ▸ Pane ▸ a control: the node is linked to it by its node name and takes its class; its rows stay
 * (unverified: what LabVIEW does with a row the new class has not).
 */
export const linkTo = (graph, nodeId, linkName, className) => fijarConfig(graph, nodeId, { link: linkName, class: className });

/**
 * Disconnect From Control: the implicit node becomes an explicit one of the same class, unwired, in place; it keeps its
 * centre and its bottom edge, so its taller header grows upwards (reports/2026-11-03-control-references.md Q5).
 */
export function disconnectFromControl(graph, cat, measure, nodeId) {
  const before = nodeOf(graph, nodeId);
  const after = { ...before, config: { ...before.config, link: null } };
  const [oldSize, newSize] = [before, after].map((node) => propertyNodeSize(node, cat, measure));
  const moved = { ...after, x: before.x - Math.round((newSize.ancho - oldSize.ancho) / 2), y: before.y - (newSize.alto - oldSize.alto) };
  return { ...graph, nodos: graph.nodos.map((node) => (node.id === nodeId ? moved : node)) };
}

/** Ignore Errors inside Node, ticked or not. */
export const toggleIgnoreErrors = (graph, nodeId) => fijarConfig(graph, nodeId, { "ignore-errors": !nodeOf(graph, nodeId).config?.["ignore-errors"] });

/**
 * The panel objects Link to ▸ Pane ▸ lists, sorted by their label as LabVIEW lists them (`hm-pane`: Boolean, Numeric,
 * Numeric 2, String): the ones whose class has a catalog, with the class each gives the node.
 */
export function linkablePanelObjects(graph, classOf) {
  return graph.nodos
    .filter((node) => classOf(node.tipo) && node.label?.text !== undefined)
    .map((node) => ({ name: node.name, label: node.label.text, class: classOf(node.tipo) }))
    .sort((a, b) => a.label.localeCompare(b.label, "en"));
}
