// The spreadsheet nodes of the Block Diagram (DT-067 §10 (c)): Array To Spreadsheet String and Spreadsheet String To
// Array, and Write and Read Delimited Spreadsheet.
//
// Measured in LabVIEW 2026 Q3 by VI scripting: all four are 32 x 32 tiles and every terminal is a hot rectangle
// `x, y, w x h` from the node's top-left corner (labview-captures/reports/2026-10-28-spreadsheet-strings.md §1 and
// 2026-10-28-delimited-spreadsheet.md Q1). The string functions have three columns, the delimiter alone in the middle;
// the Delimited VIs have the cells of a 4 x 2 x 2 x 4 connector pane, 6 and 7 px wide. Read Delimited Spreadsheet shows
// its instance ring under the icon. Unverified: from which edge a wire reaches a middle-column terminal of the string
// functions; it is taken as the top.
//
// Pure geometry, like file-nodes.mjs: no DOM.

export const SPREADSHEET_NODE_SIZE = 32;
const LAST_PIXEL = SPREADSHEET_NODE_SIZE - 1;

export const SPREADSHEET_NODE_BLOCKS = ["array-to-spreadsheet-string", "spreadsheet-string-to-array", "write-delimited-spreadsheet-vi", "read-delimited-spreadsheet-vi"];
export const READ_DELIMITED = "read-delimited-spreadsheet-vi";
export const isSpreadsheetNode = (node) => SPREADSHEET_NODE_BLOCKS.includes(node?.tipo);

const spot = (side, x, y, w, h) => ({ side, x, y, w, h });
const delimiter = spot("top", 11, 0, 10, SPREADSHEET_NODE_SIZE);
// The cells of the Delimited VIs' connector pane: corners 7 x 7, side rows 7 x 6, top and bottom columns 6 x 16.
const corner = (side, x, y) => spot(side, x, y, 7, 7);
const sideRow = (side, x, y) => spot(side, x, y, 7, 6);
const column = (side, x, y) => spot(side, x, y, 6, 16);
const delimitedCommon = {
  "file-path": corner("left", 0, 0), format: column("top", 7, 0), "error-in": corner("left", 0, 25),
  transpose: column("bottom", 7, 16), delimiter: column("bottom", 13, 16), "new-file-path": corner("right", 25, 0), "error-out": corner("right", 25, 25),
};
const output = spot("right", 21, 0, 11, SPREADSHEET_NODE_SIZE);

/** The hot rectangle of each terminal, by port name (the report's table, node placed at its top-left corner). */
const SPOTS = {
  "array-to-spreadsheet-string": { "format-string": spot("left", 0, 0, 11, 16), array: spot("left", 0, 16, 11, 16), delimiter, "spreadsheet-string": output },
  "spreadsheet-string-to-array": {
    "format-string": spot("left", 0, 0, 11, 11), "spreadsheet-string": spot("left", 0, 11, 11, 10), "array-type": spot("left", 0, 21, 11, 11), delimiter, array: output,
  },
  "write-delimited-spreadsheet-vi": { ...delimitedCommon, "2d-data": sideRow("left", 0, 7), "1d-data": sideRow("left", 0, 13), append: sideRow("left", 0, 19) },
  [READ_DELIMITED]: {
    ...delimitedCommon,
    "number-of-rows": sideRow("left", 0, 7), "start-of-read-offset": sideRow("left", 0, 13), "max-characters": sideRow("left", 0, 19),
    "all-rows": sideRow("right", 25, 7), "first-row": sideRow("right", 25, 13), "mark-after-read": sideRow("right", 25, 19), eof: column("bottom", 19, 16),
  },
};

/**
 * Read Delimited Spreadsheet's instance ring, under the icon (measured: the node is 54 high with it, 22 px below the
 * icon, and reaches 11 px left of it; the width, 58, is the measured bounds'). Its rows, in LabVIEW's order, with the
 * config value each sets.
 */
export const INSTANCE_RING = Object.freeze({ x: -11, y: SPREADSHEET_NODE_SIZE, ancho: 58, alto: 22 });
export const READ_INSTANCES = Object.freeze([
  { value: "double", label: "Double" },
  { value: "integer", label: "Integer" },
  { value: "string", label: "System String" },
  { value: "utf-8-string", label: "UTF-8 String" },
]);
export const instanceLabel = (node) => READ_INSTANCES.find((instance) => instance.value === (node.config?.instance ?? "double")).label;

export const spreadsheetNodeSize = () => ({ ancho: SPREADSHEET_NODE_SIZE, alto: SPREADSHEET_NODE_SIZE });

/** Where the wire of a terminal attaches, from the node's top-left corner: the middle of its rectangle on its edge. */
function pinOf({ side, x, y, w, h }) {
  if (side === "left") return { x: 0, y: y + Math.floor(h / 2) };
  if (side === "right") return { x: LAST_PIXEL, y: y + Math.floor(h / 2) };
  return { x: x + Math.floor(w / 2), y: side === "top" ? 0 : LAST_PIXEL };
}

/** The terminals of the node as the editor wants them (see `terminales` in diagram-view.mjs), in the order of the catalog. */
export function spreadsheetNodeTerminals(node, box, cat) {
  const { in: inputs, out: outputs } = cat.puertos(node);
  const place = (port, dir) => {
    const hot = SPOTS[node.tipo][port.name];
    const pin = pinOf(hot);
    const [x, y] = [box.x + pin.x, box.y + pin.y];
    const zona = { x: box.x + hot.x, y: box.y + hot.y, ancho: hot.w, alto: hot.h };
    const vertical = hot.side === "top" || hot.side === "bottom";
    return { puerto: port.name, etiqueta: port.label ?? port.name, dir, ...(vertical ? { lado: hot.side } : {}), x, y, zona, centro: { x, y } };
  };
  return [...inputs.map((port) => place(port, "in")), ...outputs.map((port) => place(port, "out"))];
}
