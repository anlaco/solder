// Array To Spreadsheet String and Spreadsheet String To Array as nodes of the Block Diagram (DT-067 §10 (c)).
//
// Measured in LabVIEW 2026 Q3 by VI scripting (labview-captures/reports/2026-10-28-spreadsheet-strings.md §1): both are
// 32 x 32 tiles in three columns of terminals, the inputs on the left column, the delimiter alone in the middle one
// and the output alone on the right. Each terminal is a hot rectangle `x, y, w x h` from the node's top-left corner.
// Unverified: from which edge a wire reaches the delimiter's middle column; it is taken as the top, where an optional
// middle terminal of LabVIEW's connector panes is wired.
//
// Pure geometry, like file-nodes.mjs: no DOM.

export const SPREADSHEET_NODE_SIZE = 32;
const LAST_PIXEL = SPREADSHEET_NODE_SIZE - 1;

export const SPREADSHEET_NODE_BLOCKS = ["array-to-spreadsheet-string", "spreadsheet-string-to-array"];
export const isSpreadsheetNode = (node) => SPREADSHEET_NODE_BLOCKS.includes(node?.tipo);

const spot = (side, x, y, w, h) => ({ side, x, y, w, h });
const delimiter = spot("top", 11, 0, 10, SPREADSHEET_NODE_SIZE);
const output = spot("right", 21, 0, 11, SPREADSHEET_NODE_SIZE);

/** The hot rectangle of each terminal, by port name (the report's table, node placed at its top-left corner). */
const SPOTS = {
  "array-to-spreadsheet-string": { "format-string": spot("left", 0, 0, 11, 16), array: spot("left", 0, 16, 11, 16), delimiter, "spreadsheet-string": output },
  "spreadsheet-string-to-array": {
    "format-string": spot("left", 0, 0, 11, 11), "spreadsheet-string": spot("left", 0, 11, 11, 10), "array-type": spot("left", 0, 21, 11, 11), delimiter, array: output,
  },
};

export const spreadsheetNodeSize = () => ({ ancho: SPREADSHEET_NODE_SIZE, alto: SPREADSHEET_NODE_SIZE });

/** Where the wire of a terminal attaches, from the node's top-left corner: the middle of its rectangle on its edge. */
function pinOf({ side, x, y, w, h }) {
  if (side === "left") return { x: 0, y: y + Math.floor(h / 2) };
  if (side === "right") return { x: LAST_PIXEL, y: y + Math.floor(h / 2) };
  return { x: x + Math.floor(w / 2), y: 0 };
}

/** The terminals of the node as the editor wants them (see `terminales` in diagram-view.mjs), in the order of the catalog. */
export function spreadsheetNodeTerminals(node, box, cat) {
  const { in: inputs, out: outputs } = cat.puertos(node);
  const place = (port, dir) => {
    const hot = SPOTS[node.tipo][port.name];
    const pin = pinOf(hot);
    const [x, y] = [box.x + pin.x, box.y + pin.y];
    const zona = { x: box.x + hot.x, y: box.y + hot.y, ancho: hot.w, alto: hot.h };
    return { puerto: port.name, etiqueta: port.label ?? port.name, dir, ...(hot.side === "top" ? { lado: "top" } : {}), x, y, zona, centro: { x, y } };
  };
  return [...inputs.map((port) => place(port, "in")), ...outputs.map((port) => place(port, "out"))];
}
