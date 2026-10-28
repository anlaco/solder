// The file functions as nodes of the Block Diagram: Open/Create/Replace File, Close File, Write to Text File, Read from
// Text File, Get File Size and Delete (DT-067 §10 (b)).
//
// Measured at 100 % in LabVIEW 2026 Q3 (labview-captures/reports/2026-10-28-file-nodes-look.md §1): all six are 32 x 32 tiles,
// and every terminal has a hot rectangle `x, y, w x h` from the node's top-left corner. The side terminals sit on rows 8 px
// apart (y 0, 8, 16, 24); Close File's and Get File Size's are 16 wide; the prompt is a top terminal and Open's disable
// buffering a bottom one, each 8 x 16 inside the node. The pin is drawn at the edge: x 0 on the left, x 31 on the right and
// x 12 on the top and bottom.
//
// Pure geometry, like visa-nodes.mjs: no DOM.

export const FILE_NODE_SIZE = 32;
/** Where the pin of a top or bottom terminal is, from the node's left edge. */
const VERTICAL_PIN_X = 12;
/** The wire of a side terminal attaches at the middle of its 8 px row. */
const SIDE_PIN_OFFSET = 4;
/** The right edge's outline pixel, where the wire of an output attaches. */
const RIGHT_PIN_X = FILE_NODE_SIZE - 1;

/** The blocks of the six functions. */
export const FILE_NODE_BLOCKS = ["open-create-replace-file", "close-file", "write-to-text-file", "read-from-text-file", "get-file-size", "delete"];

export const isFileNode = (node) => FILE_NODE_BLOCKS.includes(node?.tipo);

const left = (y, width = 8) => ({ side: "left", x: 0, y, w: width, h: 8 });
const right = (y, width = 8) => ({ side: "right", x: FILE_NODE_SIZE - width, y, w: width, h: 8 });
const top = { side: "top", x: 8, y: 0, w: 8, h: 16 };
const bottom = { side: "bottom", x: 8, y: 16, w: 8, h: 16 };

/** The hot rectangle of each terminal, by port name (the table of the report, §1). */
const SPOTS = {
  "open-create-replace-file": {
    "file-path": left(0), operation: left(8), access: left(16), "error-in": left(24), prompt: top, "disable-buffering": bottom,
    "refnum-out": right(0), cancelled: right(16), "error-out": right(24),
  },
  "close-file": { refnum: left(0, 16), "error-in": left(24, 16), path: right(0, 16), "error-out": right(24, 16) },
  "write-to-text-file": {
    file: left(0), text: left(8), "error-in": left(24), prompt: top,
    "refnum-out": right(0), cancelled: right(16), "error-out": right(24),
  },
  "read-from-text-file": {
    file: left(0), count: left(8), "error-in": left(24), prompt: top,
    "refnum-out": right(0), text: right(8), cancelled: right(16), "error-out": right(24),
  },
  "get-file-size": { file: left(0, 16), "error-in": left(24, 16), "refnum-out": right(0, 16), size: right(8, 16), "error-out": right(24, 16) },
  delete: {
    path: left(0), "entire-hierarchy": left(8), confirm: left(16), "error-in": left(24), prompt: top,
    "deleted-path": right(0), cancelled: right(16), "error-out": right(24),
  },
};

/** The size of the node, the same for the six. */
export const fileNodeSize = () => ({ ancho: FILE_NODE_SIZE, alto: FILE_NODE_SIZE });

/** Where the wire of a terminal attaches, from the node's top-left corner. */
function pinOf(spot) {
  if (spot.side === "left") return { x: 0, y: spot.y + SIDE_PIN_OFFSET };
  if (spot.side === "right") return { x: RIGHT_PIN_X, y: spot.y + SIDE_PIN_OFFSET };
  return { x: VERTICAL_PIN_X, y: spot.side === "top" ? 0 : RIGHT_PIN_X };
}

/** The terminals of the node as the editor wants them (see `terminales` in diagram-view.mjs), in the order of the catalog. */
export function fileNodeTerminals(node, box, cat) {
  const { in: inputs, out: outputs } = cat.puertos(node);
  const place = (port, dir) => {
    const spot = SPOTS[node.tipo][port.name];
    const pin = pinOf(spot);
    const [x, y] = [box.x + pin.x, box.y + pin.y];
    const zona = { x: box.x + spot.x, y: box.y + spot.y, ancho: spot.w, alto: spot.h };
    const vertical = spot.side === "top" || spot.side === "bottom";
    return { puerto: port.name, etiqueta: port.label ?? port.name, dir, ...(vertical ? { lado: spot.side } : {}), x, y, zona, centro: { x, y } };
  };
  return [...inputs.map((port) => place(port, "in")), ...outputs.map((port) => place(port, "out"))];
}

// ——— The right-click menus (measured: file-io-behavior.md §2, §3) ———

/**
 * The menu root of each node: Write and Read have their own (Convert EOL, Read Lines); Open and Close share one, and Get File Size and
 * Delete another whose palette row says "Advanced File Functions Palette" (file-nodes-look.md §4; Write's: file-io-behavior.md §2).
 */
export const MENU_ROOTS = {
  "open-create-replace-file": "context.file-function",
  "close-file": "context.file-function",
  "write-to-text-file": "context.write-to-text-file",
  "read-from-text-file": "context.read-from-text-file",
  "get-file-size": "context.advanced-file-function",
  delete: "context.advanced-file-function",
};

/** The checkable rows of each node's menu, as keys of its config, and the value each has when the node never set it (the measured defaults). */
const CHECKABLE_ROWS_OF = { "write-to-text-file": ["convert-eol"], "read-from-text-file": ["read-lines", "convert-eol"] };
export const CHECKABLE_ROWS = { "convert-eol": true, "read-lines": false };

/** The config key a menu row id toggles, or undefined when it is not one of the checkable rows. */
export function toggledConfigKey(rowId) {
  const key = rowId.slice(rowId.lastIndexOf(".") + 1);
  return /^context\.(write|read)-(to|from)-text-file\./.test(rowId) && key in CHECKABLE_ROWS ? key : undefined;
}

/** The checkable rows that are ticked on `node`, as keys of its config. */
export const tickedKeys = (node) => (CHECKABLE_ROWS_OF[node.tipo] ?? []).filter((key) => node.config?.[key] ?? CHECKABLE_ROWS[key]);
