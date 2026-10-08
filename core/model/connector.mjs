// The connector pane of a VI: which cell of the pattern each control or
// indicator occupies, and how its terminal must be wired (DT-045, spec/02 §4.5).
//
// Pure functions over the graph. The connector lives in `g.vi.connector`, the
// same object the `.qvi` stores; a terminal is the name of a panel element or
// `{ name, cell, connection }`. Only LabVIEW's default pattern, 4-2-2-4, exists
// so far (measured in labview-captures/subvi/connector-assigned-zoom8x.png).

export const CONNECTOR_PATTERN = "4-2-2-4";
export const CELL_COUNT = 12;
/** The pane is a square of this side; its cells are multiples of CELL_UNIT. */
export const PANE_SIZE = 32;
const CELL_UNIT = 8;

export const CONNECTIONS = ["required", "recommended", "optional"];
/** A terminal that has just been assigned is Recommended (connector-menu.png, "This Connection Is"). */
export const DEFAULT_CONNECTION = "recommended";

const LEFT_COLUMN = [0, 1, 2, 3];
const RIGHT_COLUMN = [8, 9, 10, 11];
const MIDDLE_TOP = { 4: 8, 6: 16 };
const MIDDLE_BOTTOM = { 5: 8, 7: 16 };

/** Where a cell is inside the pane, in pane pixels. Left and right columns have four cells; the middle ones, two tall cells each. */
export function cellRect(cell) {
  if (LEFT_COLUMN.includes(cell)) return { x: 0, y: cell * CELL_UNIT, width: CELL_UNIT, height: CELL_UNIT };
  if (RIGHT_COLUMN.includes(cell)) return { x: PANE_SIZE - CELL_UNIT, y: (cell - 8) * CELL_UNIT, width: CELL_UNIT, height: CELL_UNIT };
  const half = PANE_SIZE / 2;
  if (cell in MIDDLE_TOP) return { x: MIDDLE_TOP[cell], y: 0, width: CELL_UNIT, height: half };
  if (cell in MIDDLE_BOTTOM) return { x: MIDDLE_BOTTOM[cell], y: half, width: CELL_UNIT, height: half };
  throw new Error(`The pattern ${CONNECTOR_PATTERN} has no cell ${cell}`);
}

/** The cell under a point of the pane, or `null` outside it. */
export function cellAt(point) {
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    const { x, y, width, height } = cellRect(cell);
    if (point.x >= x && point.x < x + width && point.y >= y && point.y < y + height) return cell;
  }
  return null;
}

/**
 * Where the terminal of a cell sits on the edge of a subVI node, which is the
 * 32 × 32 icon: left and right cells on their own edge, the middle ones on the
 * top or bottom edge, at the centre of their column. The edge for the middle
 * cells is unverified (not measured in LabVIEW).
 */
export function cellAnchor(cell) {
  const { x, y, width, height } = cellRect(cell);
  if (LEFT_COLUMN.includes(cell)) return { side: "left", x: 0, y: y + height / 2 };
  if (RIGHT_COLUMN.includes(cell)) return { side: "right", x: PANE_SIZE, y: y + height / 2 };
  return { side: cell in MIDDLE_TOP ? "top" : "bottom", x: x + width / 2, y: cell in MIDDLE_TOP ? 0 : PANE_SIZE };
}

const INPUT_CELL_ORDER = [0, 1, 2, 3, 4, 5, 6, 7];
const OUTPUT_CELL_ORDER = [8, 9, 10, 11, 7, 6, 5, 4];

const asTerminal = (entry) => (typeof entry === "string" ? { name: entry } : entry);

/**
 * Every terminal of a connector, with its cell and its connection filled in.
 * A terminal without a cell (a `.qvi` written by hand) takes the first free
 * cell on its side: inputs from the left column, outputs from the right one.
 * That default is ours, not LabVIEW's.
 */
export function connectorTerminals(connector) {
  const terminals = [];
  const taken = new Set();
  const all = [
    ...(connector?.inputs ?? []).map((entry) => ({ ...asTerminal(entry), dir: "in" })),
    ...(connector?.outputs ?? []).map((entry) => ({ ...asTerminal(entry), dir: "out" })),
  ];
  for (const terminal of all) if (terminal.cell !== undefined) taken.add(terminal.cell);
  for (const terminal of all) {
    const order = terminal.dir === "in" ? INPUT_CELL_ORDER : OUTPUT_CELL_ORDER;
    const cell = terminal.cell ?? order.find((candidate) => !taken.has(candidate));
    taken.add(cell);
    terminals.push({ name: terminal.name, dir: terminal.dir, cell, connection: terminal.connection ?? DEFAULT_CONNECTION });
  }
  return terminals;
}

/** The terminal assigned to a cell, or `undefined`. */
export const terminalAt = (g, cell) => connectorTerminals(g.vi?.connector).find((terminal) => terminal.cell === cell);

/** Does this node stand for a control, which feeds an input of the connector? */
const isControl = (g, cat, node) => cat.puertos(node).out.length > 0;

/** A graph with this terminal list written as `vi.connector`; with no terminals left there is no connector at all. */
function withTerminals(g, terminals) {
  const entry = ({ name, cell, connection }) => ({ name, cell, ...(connection === DEFAULT_CONNECTION ? {} : { connection }) });
  const sorted = [...terminals].sort((a, b) => a.cell - b.cell);
  const inputs = sorted.filter((t) => t.dir === "in").map(entry);
  const outputs = sorted.filter((t) => t.dir === "out").map(entry);
  const { connector: _removed, ...rest } = g.vi ?? {};
  if (!terminals.length) return { ...g, vi: Object.keys(rest).length ? rest : undefined };
  return { ...g, vi: { ...rest, connector: { pattern: CONNECTOR_PATTERN, inputs, outputs } } };
}

/**
 * Puts a control or an indicator of the panel on a cell. The element leaves
 * the cell it had and takes over the terminal that was in the new one, as
 * LabVIEW does when a cell is clicked and then an object (an element is wired
 * to one cell). It keeps its connection if it had one.
 */
export function assignPanelElement(g, cat, nodeId, cell) {
  const node = g.nodos.find((n) => n.id === nodeId);
  if (!node || !cat.bloque(node.tipo).panel) return g;
  const terminals = connectorTerminals(g.vi?.connector);
  const previous = terminals.find((t) => t.name === node.name);
  const kept = terminals.filter((t) => t.name !== node.name && t.cell !== cell);
  const dir = isControl(g, cat, node) ? "in" : "out";
  const connection = dir === "out" && previous?.connection === "required" ? DEFAULT_CONNECTION : previous?.connection ?? DEFAULT_CONNECTION;
  return withTerminals(g, [...kept, { name: node.name, dir, cell, connection }]);
}

export const disconnectCell = (g, cell) => withTerminals(g, connectorTerminals(g.vi?.connector).filter((t) => t.cell !== cell));

export const disconnectAll = (g) => withTerminals(g, []);

/** This Connection Is ▸ Required, Recommended or Optional; an output cannot be Required (measured: it is greyed). */
export function setConnection(g, cell, connection) {
  const terminals = connectorTerminals(g.vi?.connector);
  const target = terminals.find((t) => t.cell === cell);
  if (!target || !CONNECTIONS.includes(connection) || (connection === "required" && target.dir === "out")) return g;
  return withTerminals(g, terminals.map((t) => (t === target ? { ...t, connection } : t)));
}

/**
 * Drops the terminals whose panel element no longer exists (it was deleted).
 * Returns the same graph when nothing has to go, so callers can compare by identity.
 */
export function pruneConnector(g, cat) {
  const connector = g.vi?.connector;
  if (!connector) return g;
  const panelNames = new Set(g.nodos.filter((n) => cat.bloque(n.tipo).panel).map((n) => n.name));
  const terminals = connectorTerminals(connector);
  const kept = terminals.filter((t) => panelNames.has(t.name));
  return kept.length === terminals.length ? g : withTerminals(g, kept);
}
