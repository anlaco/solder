// The automatic insertion of a Feedback Node (DT-109 §6): a wire finished from an output to an input that would close a cycle
// is replaced by the node, as LabVIEW does with the Connect Wire tool (labview-captures/reports/2026-11-26-feedback-node-insert.md
// Q1-Q3, local evidence never committed): the new wires are source -> node.input and node.output -> sink, no existing wire is cut,
// and the node sits in the structure and frame of the sink. Pure functions of a graph; the editor's way of joining two terminals
// calls `insertedFeedbackNode`.
//
// Measured: a closing wire that goes leftwards gives an arrow LEFT node centred horizontally between the source's output tip and
// the sink's input (x = centre - 16, rounded up), with its arrow row 15 px above the terminals (top = terminal row - 21), or 10 px
// below them when it would not fit under the top of its structure (Q1 S7); a forward closing wire gives an arrow RIGHT node whose
// arrow row is on the sink's input row (Q2).
// Not measured, and decided here (marked below): the terminal row of the leftward case when the two ends are on different rows,
// where the forward case's centre is, the threshold for going below, and a closing wire between two scopes (it keeps the old
// behaviour: a wire into a tunnel, which the type resolution reports as a cycle).

import * as Gr from "../../../core/model/graph.mjs";
import { storeHalfId, withFeedbackHalves } from "../../../core/model/feedback-node.mjs";
import { ARROW_WIRE_Y, BASE_WIDTH, DIRECTION_LEFT, DIRECTION_RIGHT, FEEDBACK_NODE, isFeedbackNode } from "./feedback-node-geometry.mjs";
import { MEDIDAS_ESTRUCTURA, MEDIDAS_SECUENCIA, codosPorDefecto, esSecuencia, extremos } from "./diagram-view.mjs";

/** The arrow row of a node placed above is 15 px over the terminals' row (Q1: "arrow row 15 px above the terminals"). */
const ARROW_ROW_ABOVE_TERMINALS = 15;
/** A node that goes below its terminals has its top 10 px under their row (Q1 S7: Increment y + 20, terminals at y + 10). */
const TOP_BELOW_TERMINALS = 10;
/** The forward case's centre is this fraction of the way from the source's tip to the sink's input (Q2: 0.31, 0.31 and 0.24; unverified). */
const FORWARD_CENTER_FRACTION = 0.3;

const STORE_PORTS = new Set(["input", "enable"]);
const nodeOf = (g, id) => g.nodos.find((candidate) => candidate.id === id);

/**
 * Whether a wire from the output `source` to the input `sink` closes a cycle: the sink's node reaches the source's node through
 * the wires there are, or they are the same node. A Feedback Node does not carry a wire from its input to its output (the
 * compiler splits it in two, DT-109), so a wire into one of those is never a cycle and one through it does not close one.
 */
export function closesCycle(g, source, sink) {
  const split = withFeedbackHalves(g);
  const sinkNode = isFeedbackNode(nodeOf(g, sink.nodo)) && STORE_PORTS.has(sink.puerto) ? storeHalfId(sink.nodo) : sink.nodo;
  const reached = new Set([sinkNode]);
  const pending = [sinkNode];
  while (pending.length) {
    const current = pending.pop();
    if (current === source.nodo) return true;
    for (const wire of split.cables) {
      if (!Gr.conectado(wire) || wire.de.nodo !== current || reached.has(wire.a.nodo)) continue;
      reached.add(wire.a.nodo);
      pending.push(wire.a.nodo);
    }
  }
  return false;
}

/** The top of the free space inside the structure `scope` (its border's thickness under its top edge), or -Infinity with none. */
function innerTop(g, scope) {
  const structure = scope && nodeOf(g, scope);
  if (!structure) return -Infinity;
  return structure.y + (esSecuencia(structure) ? MEDIDAS_SECUENCIA.banda : MEDIDAS_ESTRUCTURA.borde);
}

/** The node's place: `{ x, y, direction }` for a closing wire from the output tip `source` to the input point `sink` (both `{ x, y }`). */
export function insertionPlacement(source, sink, innerTopOfScope) {
  const goesLeft = source.x >= sink.x;
  // Leftward: centred between the tips. Forward: the centre is a fraction of the way (unverified).
  const centerX = goesLeft ? (source.x + sink.x) / 2 : source.x + FORWARD_CENTER_FRACTION * (sink.x - source.x);
  const x = Math.ceil(centerX - BASE_WIDTH / 2);
  if (!goesLeft) return { x, y: sink.y - ARROW_WIRE_Y, direction: DIRECTION_RIGHT };
  // Two ends on different rows: the sink's row, where the wire goes on (unverified; every measured scene has one row).
  const above = sink.y - ARROW_ROW_ABOVE_TERMINALS - ARROW_WIRE_Y;
  return { x, y: above < innerTopOfScope ? sink.y + TOP_BELOW_TERMINALS : above, direction: DIRECTION_LEFT };
}

/** The node placed in the sink's structure and frame, with the look the placement says. */
function placedNode(g, ctx, sink, placement) {
  const created = Gr.crearNodo(g, ctx.cat, FEEDBACK_NODE, placement.x, placement.y);
  const scope = Gr.ambitoDe(g, ctx.cat, sink.nodo, sink.puerto, "in");
  const frame = Gr.marcoDe(g, ctx.cat, sink.nodo, sink.puerto, "in");
  const inside = (node) => (node.id === created.id ? { ...node, ...(scope && { dentro: scope }), ...(frame !== undefined && { marco: frame }) } : node);
  const configured = Gr.fijarConfig(created.g, created.id, { direction: placement.direction });
  return { g: { ...configured, nodos: configured.nodos.map(inside) }, id: created.id };
}

/** Joins `from` to `to` as a new wire would be, with the bends the editor gives it. */
function wired(g, ctx, from, to) {
  const ends = extremos(g, ctx);
  return Gr.conectar(g, ctx.cat, from, to, codosPorDefecto(ends.get(`${from.nodo}.${from.puerto}`), ends.get(`${to.nodo}.${to.puerto}`)));
}

/**
 * The graph with a Feedback Node instead of the wire from `source` to `sink` (terminals with `nodo`, `puerto` and `dir`), and the id
 * of the node's second wire; `null` when that wire does not close a cycle, or the ends are in different scopes, or the wires cannot
 * be made (the caller then does what it always did).
 */
export function insertedFeedbackNode(g, ctx, source, sink) {
  const { cat } = ctx;
  if (Gr.ambitoDe(g, cat, source.nodo, source.puerto, "out") !== Gr.ambitoDe(g, cat, sink.nodo, sink.puerto, "in")) return null;
  if (!closesCycle(g, source, sink)) return null;
  const ends = extremos(g, ctx);
  const scope = Gr.ambitoDe(g, cat, sink.nodo, sink.puerto, "in");
  const placement = insertionPlacement(ends.get(`${source.nodo}.${source.puerto}`), ends.get(`${sink.nodo}.${sink.puerto}`), innerTop(g, scope));
  const node = placedNode(g, ctx, sink, placement);
  const into = wired(node.g, ctx, { nodo: source.nodo, puerto: source.puerto, dir: "out" }, { nodo: node.id, puerto: "input", dir: "in" });
  if (into.motivo) return null;
  const out = wired(into.g, ctx, { nodo: node.id, puerto: "output", dir: "out" }, { nodo: sink.nodo, puerto: sink.puerto, dir: "in" });
  return out.motivo ? null : { g: out.g, id: out.id };
}
