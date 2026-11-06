// The Call Library Function Node (DT-080) as a node of the Block Diagram: its look, its terminals and its menu.
//
// Measured at 1:1 in LabVIEW 2026 Q3 (labview-captures/reports/2026-11-06-clfn.md, 2026-11-06-clfn-run.md; crops in
// labview-captures/clfn/, never copied, the picture is drawn anew):
//   - empty, the node is 40 x 27: a 1 px frame, an 18 px header with a books glyph in the middle and the error in and
//     out "?!" glyphs at both ends (always there, even with Error Checking Disabled), and under it the row of the
//     return value, two cells with a 2 px black divider, grey for void;
//   - Mean (DBL) is 40 x 51: the same, then a row of 8 px per parameter, white, with the type's glyph in each cell;
//   - the header is orange (#ffaf00) for Run in UI thread and pale yellow (#ffffcc) for Run in any thread;
//   - the terminals: path in and out at the top (y 0, 13 x 9, only with Specify path on diagram), error in and out at
//     y 9, then one in and one out per row from y 18, 8 px apart (the return value's row has only the output).
//
// Not measured, and decided here: where exactly the wire attaches (the outline pixel, as the VISA functions' do), the
// width of a terminal's hot zone, and the look of the cells of a type that Solder does not pass yet.
//
// Pure geometry, drawing and menus, like visa-nodes.mjs and property-nodes.mjs: no DOM.

import { CALL_LIBRARY, DATA_TYPES, callLibraryConfig, callLibraryPorts } from "../../../core/model/call-library.mjs";
import { aspecto, nombre } from "../../../core/model/types.mjs";
import { ERROR_GLYPH, pixels } from "./property-nodes.mjs";

export { CALL_LIBRARY };

export const isCallLibraryNode = (node) => node?.tipo === CALL_LIBRARY;

/** The right-click menu of the node (measured, 2026-11-06-clfn.md "Right-click"). */
export const MENU_ROOT = "context.call-library";

// ——— Geometry ———

export const NODE_WIDTH = 40;
/** The header: the frame, the path pins' band and the error pins' band (9 px each). */
export const HEADER_HEIGHT = 18;
const PIN_BAND = 9;
export const ROW_HEIGHT = 8;
const FRAME = 1;
/** The width of the hot zone of a terminal, centred on the node's edge: a pin is 13 x 9 (measured). */
const TERMINAL_ZONE_WIDTH = 13;
const PATH_BAND_TOP = 0;
const ERROR_BAND_TOP = PIN_BAND;
/** The wire's height in a band or a row, from its top. */
const WIRE_IN_BAND = PIN_BAND / 2;
const WIRE_IN_ROW = ROW_HEIGHT / 2;

/** The rows under the header: the return value's, then one per parameter. */
const rowCount = (node) => 1 + callLibraryConfig(node.config).parameters.length;

export const callLibrarySize = (node) => ({ ancho: NODE_WIDTH, alto: HEADER_HEIGHT + ROW_HEIGHT * rowCount(node) + FRAME });

/** The node hangs from the cursor by its middle (unverified: as the Property Node's does). */
export const callLibraryGrabPoint = (node) => {
  const { ancho, alto } = callLibrarySize(node);
  return { x: Math.round(ancho / 2), y: Math.round(alto / 2) };
};

const rowTop = (row) => HEADER_HEIGHT + ROW_HEIGHT * row;

/** The row a port is on: 0 is the return value's, 1 the first parameter's; -1 for the pins of the header. */
function rowOfPort(portName) {
  if (portName === "return") return 0;
  const parameter = /^arg-(\d+)-(?:in|out)$/.exec(portName);
  return parameter ? Number(parameter[1]) + 1 : -1;
}

/** Where a port's wire runs and how tall its hot zone is, from the node's top. */
function terminalSpot(portName) {
  if (portName.startsWith("path-")) return { top: PATH_BAND_TOP, height: PIN_BAND, wire: PATH_BAND_TOP + WIRE_IN_BAND };
  if (portName.startsWith("error-")) return { top: ERROR_BAND_TOP, height: PIN_BAND, wire: ERROR_BAND_TOP + WIRE_IN_BAND };
  const top = rowTop(rowOfPort(portName));
  return { top, height: ROW_HEIGHT, wire: top + WIRE_IN_ROW };
}

/** The terminals as the editor wants them (see `terminales` in diagram-view.mjs): inputs on the left edge, outputs on the right. */
export function callLibraryTerminals(node, box) {
  const { in: inputs, out: outputs } = callLibraryPorts(node);
  const place = (port, dir) => {
    const spot = terminalSpot(port.name);
    const x = box.x + (dir === "in" ? 0 : box.ancho - FRAME);
    const y = box.y + spot.wire;
    const zona = { x: x - TERMINAL_ZONE_WIDTH / 2, y: box.y + spot.top, ancho: TERMINAL_ZONE_WIDTH, alto: spot.height };
    return { puerto: port.name, etiqueta: port.label ?? port.name, dir, x, y, zona, centro: { x, y } };
  };
  return [...inputs.map((port) => place(port, "in")), ...outputs.map((port) => place(port, "out"))];
}

// ——— Drawing ———

/** The colours are tokens of the theme: Old School's are the measured ones (#ffaf00 and #ffffcc, #cccccc for void). */
const FRAME_COLOR = "var(--format-node-border)";
const UI_THREAD_FILL = "var(--call-library-ui-thread-fill)";
const ANY_THREAD_FILL = "var(--call-library-any-thread-fill)";
const VOID_CELL_FILL = "var(--call-library-void-cell-fill)";
const CELL_FILL = "#ffffff";
const DIVIDER_COLOR = "#000000";
const DIVIDER_WIDTH = 2;
/** The glyphs of the header are drawn in the frame's colour, as the Property Node's. */
const GLYPH_COLOR = FRAME_COLOR;

/** The header's fill: orange while the function runs in the UI thread, pale yellow in any thread (measured, clfn-run Q7). */
export const headerFill = (node) => (callLibraryConfig(node.config).thread === "any" ? ANY_THREAD_FILL : UI_THREAD_FILL);

/** The books glyph, drawn anew: three books standing, of different heights, 9 x 9 at the middle of the header's top band. */
const BOOKS_GLYPH = [
  "..#......",
  "..#.###..",
  "###.#.#.#",
  "#.#.#.#.#",
  "#.#.###.#",
  "#.#.#.#.#",
  "#.#.#.#.#",
  "#########",
  ".........",
];
/** The path pins' glyph, a sheet with a folded corner (drawn anew), 5 x 6. */
const PATH_GLYPH = ["###..", "#.##.", "#.###", "#...#", "#...#", "#####"];
const GLYPH_WIDTH = 5;
const ERROR_GLYPH_SPOT = { left: 4, fromRight: 9, top: 10 };
const PATH_GLYPH_SPOT = { left: 4, fromRight: 9, top: 1 };
const BOOKS_SPOT = { top: 4 };

/** What a cell shows for a parameter: its glyph's text and colour, from the type its terminals carry. */
function cellGlyph(parameter) {
  const element = DATA_TYPES[parameter["data-type"] ?? "i32"]?.type;
  switch (parameter.type) {
    case "numeric":
      return { text: nombre(element), color: aspecto(element).color };
    case "array":
      return { text: "[]", color: aspecto(element).color };
    case "string":
      return { text: "abc", color: aspecto("string").color };
    case "adapt-to-type":
      return { text: "*", color: "#000000" };
    default:
      return { text: "?", color: "#000000" };
  }
}

/** The glyph of the return value's output cell, or none for void. */
function returnGlyph(returnValue) {
  if (returnValue.type === "numeric") return cellGlyph({ type: "numeric", "data-type": returnValue["data-type"] ?? "i32" });
  if (returnValue.type === "string") return cellGlyph({ type: "string" });
  return null;
}

const escapeText = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function cell(x, row, width, fill, glyph) {
  const top = rowTop(row);
  const text = glyph ? `<text class="glifo-celda" x="${x + width / 2}" y="${top + ROW_HEIGHT / 2}" fill="${glyph.color}">${escapeText(glyph.text)}</text>` : "";
  return `<rect x="${x}" y="${top}" width="${width}" height="${ROW_HEIGHT}" fill="${fill}"/>${text}`;
}

/** One row: the input cell, the divider, the output cell. The return value's row has no input: its left cell is grey. */
function row(row, left, right) {
  const half = (NODE_WIDTH - DIVIDER_WIDTH) / 2;
  const divider = `<rect x="${half}" y="${rowTop(row)}" width="${DIVIDER_WIDTH}" height="${ROW_HEIGHT}" fill="${DIVIDER_COLOR}"/>`;
  return cell(FRAME, row, half - FRAME, left.fill, left.glyph) + divider + cell(half + DIVIDER_WIDTH, row, half - FRAME, right.fill, right.glyph);
}

/** The node's picture: frame, header with its glyphs, the return value's row and the parameters'. */
export function callLibraryBody(node, box) {
  const config = callLibraryConfig(node.config);
  const header = `<rect x="${FRAME}" y="${FRAME}" width="${box.ancho - 2 * FRAME}" height="${HEADER_HEIGHT - FRAME}" fill="${headerFill(node)}"/>`;
  const books = pixels(BOOKS_GLYPH, Math.round((box.ancho - BOOKS_GLYPH[0].length) / 2), BOOKS_SPOT.top, GLYPH_COLOR);
  const errors = pixels(ERROR_GLYPH, ERROR_GLYPH_SPOT.left, ERROR_GLYPH_SPOT.top, GLYPH_COLOR) +
    pixels(ERROR_GLYPH, box.ancho - ERROR_GLYPH_SPOT.fromRight, ERROR_GLYPH_SPOT.top, GLYPH_COLOR);
  const paths = config["specify-path-on-diagram"]
    ? pixels(PATH_GLYPH, PATH_GLYPH_SPOT.left, PATH_GLYPH_SPOT.top, GLYPH_COLOR) + pixels(PATH_GLYPH, box.ancho - PATH_GLYPH_SPOT.fromRight, PATH_GLYPH_SPOT.top, GLYPH_COLOR)
    : "";
  const returned = returnGlyph(config["return-type"]);
  const rows = row(0, { fill: VOID_CELL_FILL }, returned ? { fill: CELL_FILL, glyph: returned } : { fill: VOID_CELL_FILL }) +
    config.parameters.map((parameter, index) => {
      const glyph = cellGlyph(parameter);
      return row(index + 1, { fill: CELL_FILL, glyph }, { fill: CELL_FILL, glyph });
    }).join("");
  return (
    `<svg class="formato call-library" viewBox="0 0 ${box.ancho} ${box.alto}">` +
    `<rect x="0.5" y="0.5" width="${box.ancho - 1}" height="${box.alto - 1}" fill="${CELL_FILL}" stroke="${FRAME_COLOR}" stroke-width="1"/>` +
    `<g shape-rendering="crispEdges">${header}${books}${paths}${errors}${rows}</g></svg>`
  );
}

// ——— The menu ———

/** The rows of the menu with a submenu whose rows are done by the editor: Name Format's, where No Names is ticked (measured). */
export const NAME_FORMAT_MARKS = Object.freeze([`${MENU_ROOT}.name-format.no-names`]);
