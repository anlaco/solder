// VISA Open, Write, Read and Close as nodes of the Block Diagram.
//
// Measured at 1:1 in LabVIEW 2026 Q3 (labview-captures/reports/2026-10-26-visa-nodes.md, Q1 and Q2): each is a
// 32 x 32 tile, and its terminals are 6 x 6 dots that sit on rows 8 px apart (y 1, 9, 17 and 25 from the top of the
// tile), left for the inputs and right for the outputs; VISA Open's timeout is the only one on the top edge. The
// tile is a fixed size: the terminals do not spread with the number of rows, as most functions' do.
//
// Pure geometry, like format-nodes.mjs: no DOM.

export const VISA_NODE_SIZE = 32;

/** The blocks of the four functions. */
export const VISA_NODE_BLOCKS = ["visa-open", "visa-write", "visa-read", "visa-close"];

export const isVisaNode = (node) => VISA_NODE_BLOCKS.includes(node?.tipo);

/** The port every VISA function takes the resource name by; its terminal has a menu of its own (Q5). */
export const RESOURCE_PORT = "resource";

/** The right-click menus of a VISA function: of its body (Q4) and of its resource name terminal (Q5). */
export const BODY_MENU = "context.visa-function";
export const RESOURCE_TERMINAL_MENU = "context.visa-function-resource-terminal";

/** The rows of terminals are this far apart, the first one starting at `FIRST_ROW`. */
export const ROW_PITCH = 8;
export const FIRST_ROW = 1;
/** The side of a terminal's dot. */
export const DOT_SIZE = 6;
/** Where the wire attaches, from the top of its dot (left and right) or from the left of it (top). */
export const ATTACH_OFFSET = 3.5;
/** The dots stick out of the tile by this much (x -3..2 on the left, 29..34 on the right, y -3..2 on top). */
export const DOT_OUTSIDE = 3;
/** The wire attaches at the outline pixel of the tile: x 0 on the left and x 31 on the right. */
const RIGHT_ATTACH_X = VISA_NODE_SIZE - 1;
/** The left of the dot of the top terminal (x 9..14). */
const TOP_DOT_LEFT = 9;

const rowTop = (row) => FIRST_ROW + row * ROW_PITCH;

/** Where each terminal is, by port name: the side and, on the left and right, the row (0 to 3) it is on. */
const SPOTS = {
  "visa-open": {
    resource: { side: "left", row: 0 },
    "duplicate-session": { side: "left", row: 1 },
    "access-mode": { side: "left", row: 2 },
    "error-in": { side: "left", row: 3 },
    "open-timeout": { side: "top" },
    "resource-out": { side: "right", row: 0 },
    "error-out": { side: "right", row: 3 },
  },
  "visa-write": {
    resource: { side: "left", row: 0 },
    "write-buffer": { side: "left", row: 1 },
    "error-in": { side: "left", row: 3 },
    "resource-out": { side: "right", row: 0 },
    "return-count": { side: "right", row: 1 },
    "error-out": { side: "right", row: 3 },
  },
  "visa-read": {
    resource: { side: "left", row: 0 },
    "byte-count": { side: "left", row: 1 },
    "error-in": { side: "left", row: 3 },
    "resource-out": { side: "right", row: 0 },
    "read-buffer": { side: "right", row: 1 },
    "return-count": { side: "right", row: 2 },
    "error-out": { side: "right", row: 3 },
  },
  "visa-close": {
    resource: { side: "left", row: 0 },
    "error-in": { side: "left", row: 3 },
    "error-out": { side: "right", row: 3 },
  },
};

/**
 * The geometry of a terminal relative to the top-left corner of the tile: the point its wire attaches at and the
 * rectangle of its dot (which is what is clicked to wire it).
 */
export function terminalSpot(block, portName) {
  const spot = SPOTS[block][portName];
  if (spot.side === "top") {
    return { side: "top", x: TOP_DOT_LEFT + ATTACH_OFFSET, y: 0, dot: { x: TOP_DOT_LEFT, y: -DOT_OUTSIDE, ancho: DOT_SIZE, alto: DOT_SIZE } };
  }
  const top = rowTop(spot.row);
  const left = spot.side === "left";
  return {
    side: spot.side,
    x: left ? 0 : RIGHT_ATTACH_X,
    y: top + ATTACH_OFFSET,
    dot: { x: left ? -DOT_OUTSIDE : VISA_NODE_SIZE - DOT_SIZE + DOT_OUTSIDE, y: top, ancho: DOT_SIZE, alto: DOT_SIZE },
  };
}

/** The terminals of the node as the editor wants them (see `terminales` in diagram-view.mjs), in the order of the catalog. */
export function visaTerminals(node, box, cat) {
  const { in: inputs, out: outputs } = cat.puertos(node);
  const place = (port, dir) => {
    const spot = terminalSpot(node.tipo, port.name);
    const [x, y] = [box.x + spot.x, box.y + spot.y];
    const zona = { ...spot.dot, x: box.x + spot.dot.x, y: box.y + spot.dot.y };
    return { puerto: port.name, etiqueta: port.label ?? port.name, dir, ...(spot.side === "top" ? { lado: "top" } : {}), x, y, zona, centro: { x, y } };
  };
  return [...inputs.map((port) => place(port, "in")), ...outputs.map((port) => place(port, "out"))];
}
