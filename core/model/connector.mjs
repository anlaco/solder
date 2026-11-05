// The connector pane of a VI: which cell of the pattern each control or
// indicator occupies, and how its terminal must be wired (DT-045, spec/02 §4.5).
//
// Pure functions over the graph. The connector lives in `g.vi.connector`, the
// same object the `.sdg` stores: its LabVIEW pattern number and its terminals,
// each the name of a panel element or `{ name, cell, connection }`. A cell is
// LabVIEW's connector index in that pattern (DT-075, core/model/connector-patterns.mjs).

import { DEFAULT_PATTERN, patternNumbered } from "./connector-patterns.mjs";

export { DEFAULT_PATTERN };
/** The pane is a square of this side. */
export const PANE_SIZE = 32;

export const CONNECTIONS = ["required", "recommended", "optional"];
/** A terminal that has just been assigned is Recommended (connector-menu.png, "This Connection Is"). */
export const DEFAULT_CONNECTION = "recommended";

/** The pattern a connector uses: the one it names, else LabVIEW's default. */
export const connectorPattern = (connector) => connector?.pattern ?? DEFAULT_PATTERN;

/** The pattern of a VI's connector pane. */
export const patternOf = (g) => connectorPattern(g.vi?.connector);

/** How many terminals a pattern has. */
export const cellCount = (pattern = DEFAULT_PATTERN) => patternNumbered(pattern).terminals.length;

/** Where a cell (a connector index) is inside the pane, in pane pixels. */
export function cellRect(cell, pattern = DEFAULT_PATTERN) {
  const rect = patternNumbered(pattern)?.terminals[cell];
  if (!rect) throw new Error(`The pattern ${pattern} has no cell ${cell}`);
  return rect;
}

/** The cell under a point of the pane, or `null` outside it. */
export function cellAt(point, pattern = DEFAULT_PATTERN) {
  const index = patternNumbered(pattern).terminals.findIndex(({ x, y, width, height }) => point.x >= x && point.x < x + width && point.y >= y && point.y < y + height);
  return index < 0 ? null : index;
}

/**
 * Where the terminal of a cell sits on the edge of a subVI node, which is the
 * 32 × 32 icon: a cell on the left or right edge on that edge, at its middle;
 * a middle cell on the top or bottom edge, at the centre of its column. The
 * edge for the middle cells, and the left edge for a cell as wide as the pane,
 * are unverified (not measured in LabVIEW).
 */
export function cellAnchor(cell, pattern = DEFAULT_PATTERN) {
  const { x, y, width, height } = cellRect(cell, pattern);
  const touchesLeft = x === 0;
  const touchesRight = x + width === PANE_SIZE;
  if (touchesLeft) return { side: "left", x: 0, y: y + height / 2 };
  if (touchesRight) return { side: "right", x: PANE_SIZE, y: y + height / 2 };
  return { side: y === 0 ? "top" : "bottom", x: x + width / 2, y: y === 0 ? 0 : PANE_SIZE };
}

/**
 * The cells a terminal with no cell takes, in order (a `.sdg` written by hand): inputs from the left column down,
 * outputs from the right column down. That default is ours, not LabVIEW's. For 4-2-2-4 it is the order Solder has
 * always used; for any other pattern, cells sorted from the left (inputs) or from the right (outputs), then down.
 */
const DEFAULT_PATTERN_INPUT_ORDER = [11, 10, 9, 8, 7, 6, 5, 4];
const DEFAULT_PATTERN_OUTPUT_ORDER = [3, 2, 1, 0, 4, 5, 6, 7];

function defaultCellOrder(pattern, dir) {
  if (pattern === DEFAULT_PATTERN) return dir === "in" ? DEFAULT_PATTERN_INPUT_ORDER : DEFAULT_PATTERN_OUTPUT_ORDER;
  const cells = patternNumbered(pattern).terminals.map((rect, cell) => ({ ...rect, cell }));
  const fromTheSide = dir === "in" ? (a, b) => a.x - b.x : (a, b) => b.x + b.width - (a.x + a.width);
  return cells.sort((a, b) => fromTheSide(a, b) || a.y - b.y).map(({ cell }) => cell);
}

const asTerminal = (entry) => (typeof entry === "string" ? { name: entry } : entry);

/**
 * Every terminal of a connector, with its cell and its connection filled in.
 * A terminal without a cell (a `.qvi` written by hand) takes the first free
 * cell on its side: inputs from the left column, outputs from the right one.
 * That default is ours, not LabVIEW's.
 */
export function connectorTerminals(connector) {
  const pattern = connectorPattern(connector);
  const terminals = [];
  const taken = new Set();
  const all = [
    ...(connector?.inputs ?? []).map((entry) => ({ ...asTerminal(entry), dir: "in" })),
    ...(connector?.outputs ?? []).map((entry) => ({ ...asTerminal(entry), dir: "out" })),
  ];
  for (const terminal of all) if (terminal.cell !== undefined) taken.add(terminal.cell);
  for (const terminal of all) {
    const order = defaultCellOrder(pattern, terminal.dir);
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
  const pattern = patternOf(g);
  const { connector: _removed, ...rest } = g.vi ?? {};
  // A pane with nothing connected keeps a pattern of its own, as LabVIEW does; the default one needs no connector.
  if (!terminals.length && pattern === DEFAULT_PATTERN) return { ...g, vi: Object.keys(rest).length ? rest : undefined };
  return { ...g, vi: { ...rest, connector: { pattern, inputs, outputs } } };
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
