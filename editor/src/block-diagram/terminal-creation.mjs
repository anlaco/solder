// Create ▸ Constant, Control and Indicator on a terminal or a wire, and Create ▸
// All Controls and Indicators / All Constants on a node: where each new object
// goes on the diagram and on the panel.
//
// What is created and wired is decided by core/model/create-on-terminal.mjs;
// this module only adds the placement LabVIEW gives, measured in
// labview-captures/create-paste/ (REPORT.md §A). Pure functions over the graph:
// the editor state (selection, text being typed) is set by diagram-editing.mjs.

import { caja, esBorde, esEstructura, terminales, visibles } from "./diagram-view.mjs";
import { ALTO_LINEA } from "../common/labels.mjs";
import { MEDIDAS_PANEL, cajaObjeto, caja as panelBox } from "../front-panel/front-panel.mjs";
import * as Gr from "../../../core/model/graph.mjs";
import { blockForTerminal, createOnTerminal } from "../../../core/model/create-on-terminal.mjs";

/**
 * Gap in px between a new constant and the node it is wired to (from the right
 * edge of the constant to the left edge of the node), by block. 16 px was
 * measured on Add, Quotient & Remainder and And; 8 px on Index Array's index,
 * String Length, Array Size, Unbundle and Simple Error Handler
 * (create-constant-on-*-result.png). Why those two differ is unknown, so the
 * blocks that were not measured use the 16 of the first group (unverified).
 */
export const CONSTANT_GAP_BY_BLOCK = { "index-array": 8, "string-length": 8, "array-size": 8, unbundle: 8, "simple-error-handler": 8 };
export const DEFAULT_CONSTANT_GAP = 16;

/** The gap of a new control or indicator, measured on Add only (create-control-on-x-diagram-result.png). */
export const TERMINAL_GAP = 16;

/** How far inside the node a pushed-up object's wire turns: create-two-constants-on-add-collision-avoidance.png. */
export const PUSHED_WIRE_BEND = 5;

/** Space between the objects of Create ▸ All Constants / All Controls and Indicators (about 2 px in the captures). */
export const STACK_GAP = 2;

/**
 * Where created controls and indicators go on the panel, measured on
 * panel-placement-of-created-controls-and-indicators.png: controls fill a grid
 * at the top left (66 px across, 42 down; the first box 2 px from the left edge
 * and 21 below the top), and indicators start at the horizontal centre of the
 * panel, side by side every 54 px for a 55 px wide box (one pixel less than the
 * box). Unverified: how many rows a column holds before the next one starts (ours:
 * as many as fit in the panel's height) and the order indicators fill.
 */
export const PANEL_GRID = { originX: 2, originY: 21, columnStep: 66, rowStep: 42, indicatorOverlap: 1 };

/** The size of the panel window the diagram assumes, since it cannot see the other window (unverified). */
export const ASSUMED_PANEL_SIZE = { width: 640, height: 480 };

/** The room above a panel object that its label takes. */
const LABEL_ROOM = ALTO_LINEA + MEDIDAS_PANEL.separacion;

const overlap = (a, b) => a.x < b.x + b.ancho && a.x + a.ancho > b.x && a.y < b.y + b.alto && a.y + a.alto > b.y;

/** The box of a panel object together with the label above it. */
const withLabelRoom = (box) => ({ ...box, y: box.y - LABEL_ROOM, alto: box.alto + LABEL_ROOM });

/** Neighbouring indicators overlap by a pixel in LabVIEW, so that much of an object's edge does not count as taken. */
const withoutEdge = (box) => ({ x: box.x + PANEL_GRID.indicatorOverlap, y: box.y, ancho: box.ancho - 2 * PANEL_GRID.indicatorOverlap, alto: box.alto });

/**
 * The first free place on the panel for a new object of block `tipo`: controls
 * go down the grid's left column and on to the next ones; indicators go along
 * the rows from the panel's centre.
 */
export function nextPanelSlot(g, { tipo, config, isControl, panelSize = ASSUMED_PANEL_SIZE }) {
  const G = PANEL_GRID;
  const taken = g.nodos.filter((n) => n.panel).map((n) => withoutEdge(withLabelRoom(panelBox(n))));
  const isFree = (x, y) => !taken.some((box) => overlap(withLabelRoom(cajaObjeto(tipo, x, y, config)), box));
  const rowsPerColumn = Math.max(1, Math.floor((panelSize.height - G.originY) / G.rowStep));
  const { ancho: width } = cajaObjeto(tipo, 0, 0, config);
  const centre = Math.round(panelSize.width / 2);
  const columns = isControl ? Infinity : Math.max(1, Math.floor((panelSize.width - centre) / (width - G.indicatorOverlap)));
  for (let step = 0; step < 10000; step++) {
    // Controls fill a column from the top; indicators fill a row from the left.
    const [column, row] = isControl ? [Math.floor(step / rowsPerColumn), step % rowsPerColumn] : [step % columns, Math.floor(step / columns)];
    const x = isControl ? G.originX + column * G.columnStep : centre + column * (width - G.indicatorOverlap);
    const y = G.originY + row * G.rowStep;
    if (isFree(x, y)) return { x, y };
  }
  return { x: G.originX, y: G.originY };
}

/**
 * What Create ▸ Control makes on the condition terminal of a While Loop: the
 * Stop button of the Boolean palette, labelled "stop", with its label in edit
 * mode (labview-captures/editor-checks/REPORT.md §5, 05-create-control-result.png).
 */
export const LOOP_CONDITION_CONTROL = { configOverride: { style: "stop-button" }, label: "stop" };

/** The only terminal of a loop's border node (condition, count or iteration): its Create rows have no terminal under the pointer to name it. */
export const borderTerminalPort = (node, ctx) => (node.tipo.startsWith("loop-") ? terminales(node, ctx)[0]?.puerto : undefined);

/** The type that reaches or leaves a terminal, or undefined when it is not known yet. */
const terminalType = (g, cat, terminal) => (terminal.dir === "in" ? Gr.tipos(g, cat).entradas : Gr.tipos(g, cat).salidas).get(`${terminal.nodo}.${terminal.puerto}`);

const nodeOf = (g, id) => g.nodos.find((n) => n.id === id);

/**
 * Where an object wired to `terminal` of `node` goes: in the structure the node is in or, for a terminal that
 * faces out of its border (the count of a For Loop), in the one around that structure, so the wire crosses no border.
 */
function scopeOfTerminal(g, cat, node, terminal) {
  const port = cat.puertos(node)[terminal.dir].find((candidate) => candidate.name === terminal.puerto);
  const placedBy = port?.lado === "fuera" ? nodeOf(g, node.dentro) : node;
  return { dentro: placedBy.dentro, marco: placedBy.marco };
}

/** Nodes a new object must not sit on: everything but structures (they hold what is inside) and their border nodes. */
const obstacles = (g, ctx, ignored) => visibles(g).nodos.filter((n) => n.id !== ignored && !esEstructura(n, ctx) && !esBorde(n)).map((n) => caja(n, ctx));

/**
 * Pushes `box` up until it touches the first object it would otherwise sit on
 * (create-two-constants-on-add-collision-avoidance.png: the second constant
 * wired to Add's x goes above the first and its boxes touch).
 */
function pushUp(box, others, gap) {
  let pushed = false;
  for (let attempts = 0; attempts < 200; attempts++) {
    const blockers = others.filter((other) => overlap(box, other));
    if (!blockers.length) break;
    const top = Math.min(...blockers.map((other) => other.y));
    box = { ...box, y: top - box.alto - gap };
    pushed = true;
  }
  return { box, pushed };
}

/** The place of a new object wired to `terminal`: centred on it, `gap` px away on the side the wire leaves. */
function wiredBox(size, terminal, gap) {
  const x = terminal.dir === "in" ? terminal.x - gap - size.ancho : terminal.x + gap;
  return { x: Math.round(x), y: Math.round(terminal.y - size.alto / 2), ancho: size.ancho, alto: size.alto };
}

/**
 * The place of a new object left unwired because it does not fit the terminal
 * (a constant or control on an output, an indicator on an input): constants and
 * controls above the node's upper left corner, indicators touching its right
 * edge. The exact offsets were not measured (unverified).
 */
function unwiredBox(size, nodeBox, kind) {
  if (kind === "indicator") return { x: Math.round(nodeBox.x + nodeBox.ancho), y: Math.round(nodeBox.y + (nodeBox.alto - size.alto) / 2), ancho: size.ancho, alto: size.alto };
  return { x: Math.round(nodeBox.x), y: Math.round(nodeBox.y - size.alto), ancho: size.ancho, alto: size.alto };
}

/** Moves a diagram node (not its panel object) so that its box starts at (x, y). */
const moveTo = (g, id, x, y) => ({ ...g, nodos: g.nodos.map((n) => (n.id === id ? { ...n, x, y } : n)) });

/**
 * Create ▸ `kind` ("constant", "control" or "indicator") on one terminal of a
 * node. Returns `{ g, id, wired }` or `{ g, motivo }` when nothing can be made.
 * `stackGap` is the space left when the object has to be pushed up.
 */
export function createForTerminal(g, ctx, { nodo, puerto, kind, panelSize, stackGap = 0 }) {
  const node = nodeOf(g, nodo);
  const terminal = { ...terminales(node, ctx).find((t) => t.puerto === puerto), nodo };
  const type = terminalType(g, ctx.cat, terminal);
  if (type === undefined) return { g, motivo: "The type of this terminal is not known yet: wire it first." };
  const block = blockForTerminal(type, kind);
  if (!block) return { g, motivo: `There is no ${kind} for this type yet.` };
  const isPanelObject = kind !== "constant";
  const special = kind === "control" && node.tipo === "loop-condition" ? LOOP_CONDITION_CONTROL : null;
  const slot = isPanelObject ? nextPanelSlot(g, { tipo: block.tipo, config: { ...block.config, ...special?.configOverride }, isControl: kind === "control", panelSize }) : {};
  const scope = scopeOfTerminal(g, ctx.cat, node, terminal);
  const created = createOnTerminal(g, ctx.cat, { terminal: { nodo, puerto, dir: terminal.dir }, type, kind, x: 0, y: 0, panelX: slot.x, panelY: slot.y, label: special?.label ?? terminal.etiqueta, scope, configOverride: special?.configOverride });
  if (created.motivo) return created;
  const size = caja(nodeOf(created.g, created.id), ctx);
  const gap = kind === "constant" ? (CONSTANT_GAP_BY_BLOCK[node.tipo] ?? DEFAULT_CONSTANT_GAP) : TERMINAL_GAP;
  const wantedBox = created.wired ? wiredBox(size, terminal, gap) : unwiredBox(size, caja(node, ctx), kind);
  const { box, pushed } = pushUp(wantedBox, obstacles(created.g, ctx, created.id), stackGap);
  let result = moveTo(created.g, created.id, box.x, box.y);
  if (created.wired && pushed) result = bendWire(result, created.id, terminal);
  return { g: result, id: created.id, wired: created.wired };
}

/** The wire of a pushed-up object turns just inside the node, as LabVIEW draws it. */
function bendWire(g, id, terminal) {
  const wire = g.cables.find((c) => c.de.nodo === id || c.a.nodo === id);
  const bend = terminal.dir === "in" ? terminal.x + PUSHED_WIRE_BEND : terminal.x - PUSHED_WIRE_BEND;
  return Gr.fijarCodos(g, wire.id, [Math.round(bend)]);
}

/** Does a wire end at this terminal? */
const isWired = (g, terminal) => g.cables.some((c) => (terminal.dir === "in" ? c.a : c.de).nodo === terminal.nodo && (terminal.dir === "in" ? c.a : c.de).puerto === terminal.puerto);

/**
 * Create ▸ All Controls and Indicators ("controls") and All Constants
 * ("constants") on a node: one object per terminal that has no wire yet, the
 * last terminal first so that the stack keeps the terminals' order. Only the
 * inputs get a constant; outputs get an indicator. Whether LabVIEW skips the
 * wired terminals is unverified (ours does).
 */
export function createForNode(g, ctx, { nodo, kinds, panelSize }) {
  const node = nodeOf(g, nodo);
  const wanted = terminales(node, ctx).filter((t) => kinds.has(t.dir) && !isWired(g, { ...t, nodo }));
  const ids = [];
  let firstReason;
  for (const terminal of [...wanted].reverse()) {
    const made = createForTerminal(g, ctx, { nodo, puerto: terminal.puerto, kind: kinds.get(terminal.dir), panelSize, stackGap: STACK_GAP });
    if (made.motivo) firstReason ??= made.motivo;
    else {
      g = made.g;
      ids.push(made.id);
    }
  }
  if (!ids.length) return { g, motivo: firstReason ?? "There is nothing to create: every terminal of this node is already wired." };
  return { g, ids };
}

/** The terminal kinds of the two "All" items, keyed by the direction they apply to. */
export const ALL_KINDS = {
  "all-controls-and-indicators": new Map([["in", "control"], ["out", "indicator"]]),
  "all-constants": new Map([["in", "constant"]]),
};

/**
 * Create ▸ Constant, Control or Indicator on a wire: the object is made of the
 * wire's type but left unwired (create-control-from-wire-menu-result.png), at
 * the point where the menu was opened (unverified). Returns `{ g, id }` or
 * `{ g, motivo }`.
 */
export function createOnWire(g, ctx, { cable, kind, point, panelSize }) {
  const wire = g.cables.find((c) => c.id === cable);
  const type = Gr.tipos(g, ctx.cat).cables.get(cable)?.tipo;
  if (type === undefined) return { g, motivo: "The type of this wire is not known." };
  const block = blockForTerminal(type, kind);
  if (!block) return { g, motivo: `There is no ${kind} for this type yet.` };
  const slot = kind === "constant" ? {} : nextPanelSlot(g, { tipo: block.tipo, config: block.config, isControl: kind === "control", panelSize });
  const source = nodeOf(g, wire.de.nodo);
  const label = ctx.cat.puertos(source).out.find((p) => p.name === wire.de.puerto)?.label ?? wire.de.puerto;
  // A constant or control does not fit the wire's input end and an indicator does not fit its output end: createOnTerminal leaves it unwired.
  const terminal = { nodo: wire.de.nodo, puerto: wire.de.puerto, dir: kind === "indicator" ? "in" : "out" };
  const created = createOnTerminal(g, ctx.cat, { terminal, type, kind, x: 0, y: 0, panelX: slot.x, panelY: slot.y, label, scope: { dentro: source.dentro, marco: source.marco } });
  if (created.motivo) return created;
  const size = caja(nodeOf(created.g, created.id), ctx);
  return { g: moveTo(created.g, created.id, Math.round(point.x - size.ancho / 2), Math.round(point.y - size.alto / 2)), id: created.id };
}

/**
 * Gives every pasted or duplicated control and indicator its own free place on
 * the panel, the first free one of the left column for a control (REPORT.md §B:
 * "placed in the first free row of the left column of the panel"; for an
 * indicator, the indicators' rule: unverified). `newIds` are the ids of the new nodes.
 */
export function placePastedPanelObjects(g, ctx, newIds, panelSize) {
  const pending = new Set(newIds);
  // The new objects are placed one by one, so that each sees the places the earlier ones took.
  let placed = { ...g, nodos: g.nodos.map((n) => (pending.has(n.id) && n.panel ? { ...n, panel: { ...n.panel, x: -10000, y: -10000 } } : n)) };
  for (const node of g.nodos.filter((n) => pending.has(n.id) && n.panel)) {
    const isControl = ctx.cat.puertos(node).out.length > 0;
    const slot = nextPanelSlot(placed, { tipo: node.tipo, config: node.config, isControl, panelSize });
    placed = { ...placed, nodos: placed.nodos.map((n) => (n.id === node.id ? { ...n, panel: { ...n.panel, x: slot.x, y: slot.y } } : n)) };
  }
  return placed;
}
