// Replace with Feedback Node (on a shift register) and Replace with Shift Register (on a Feedback Node), DT-109 §6. Measured in
// LabVIEW 2026 Q3 (labview-captures/reports/2026-11-26-feedback-node-insert.md Q4 and Q5, local evidence never committed):
//   - Q4: the node's y is the shift registers' y and its x is (left.x + right.x) / 2 - 10; arrow left, delay 1. The wire into the
//     right register goes to the node's input, the left register's inner wires start at its output, and the wire into the left
//     register's outer side goes to the initializer, moved one loop out; with none the initializer stays on the node. A wire from the
//     right register to the outside is left broken (one-ended).
//   - Q5: the pair goes on the n-th enclosing loop, n = the loops the initializer was moved out by (at least 1), at the node's y: the
//     left register at the loop's left border, the right one at its right border. The wire into the initializer goes to the left
//     register's outer side when it comes from outside that loop, and is left broken when it comes from inside it. Wires that cross
//     an inner loop get tunnels there, as every wire that crosses a border does (the editor's own repair, `repair`).
// Not measured, and decided here: the node's x when the two registers' x add up to an odd number (rounded), the loose end of a broken
// wire (at the terminal it had, as deleting a node leaves it), where the tunnels of an inner loop sit (at the ends of the wires, as
// the editor puts them, not at the node's row), what happens to a wire on the enable terminal (it goes with the node).
// Pure functions of a graph, like the other editing modules; `repair` is the editor's repair of a changed graph (tunnels, borders).

import { enclosingLoops } from "../../../core/model/feedback-node.mjs";
import * as Gr from "../../../core/model/graph.mjs";
import { loopsAround } from "./feedback-node-edits.mjs";
import { FEEDBACK_NODE, feedbackConfig } from "./feedback-node-geometry.mjs";
import { terminales } from "./diagram-view.mjs";

/** The node's x is this far left of the midpoint of the registers' x (Q4: "x = (leftSR.x + rightSR.x)/2 - 10, 4 samples exact"). */
const NODE_LEFT_OF_MIDPOINT = 10;

const nodeOf = (g, id) => g.nodos.find((candidate) => candidate.id === id);
const withoutBends = ({ codos, ...wire }) => wire;

/** The left and right shift registers of the pair `id` belongs to, or undefined when `id` is not one. */
export function shiftRegisterPair(g, id) {
  const node = nodeOf(g, id);
  if (node?.tipo !== "shift-register-left" && node?.tipo !== "shift-register-right") return undefined;
  const partner = nodeOf(g, node.config?.par);
  if (!partner) return undefined;
  return node.tipo === "shift-register-left" ? { left: node, right: partner } : { left: partner, right: node };
}

/** Where a terminal is drawn, for the loose end of a wire that loses it (as deleting a node leaves it). */
const placeAt = (ctx) => (node, port) => {
  const terminal = terminales(node, ctx).find((candidate) => candidate.puerto === port);
  return terminal ? [terminal.x, terminal.y] : [node.x ?? 0, node.y ?? 0];
};

// ——— Replace with Feedback Node ———

/** The wires of the pair moved onto the new node `nodeId`; those left on the pair are then loosened when the pair goes. */
function rewiredToNode(cables, pair, nodeId) {
  return cables.map((wire) => {
    if (wire.a.nodo === pair.right.id && wire.a.puerto === "value") return { ...withoutBends(wire), a: { nodo: nodeId, puerto: "input" } };
    if (wire.de.nodo === pair.left.id && wire.de.puerto === "value") return { ...withoutBends(wire), de: { nodo: nodeId, puerto: "output" } };
    if (wire.a.nodo === pair.left.id && wire.a.puerto === "init") return { ...withoutBends(wire), a: { nodo: nodeId, puerto: "initializer" } };
    return wire;
  });
}

/**
 * The graph with the shift register pair of `registerId` replaced by a Feedback Node (Q4), or the same graph when `registerId` is
 * not a shift register. Only a pair of one element exists in Solder (stacked elements are not built; LabVIEW greys the row for them).
 */
export function replacedWithFeedbackNode(g, ctx, registerId, repair) {
  const pair = shiftRegisterPair(g, registerId);
  if (!pair) return g;
  const created = Gr.crearNodo(g, ctx.cat, FEEDBACK_NODE, Math.round((pair.left.x + pair.right.x) / 2 - NODE_LEFT_OF_MIDPOINT), pair.left.y);
  // The node is in the register's loop, so the loop its initializer was wired outside of is one loop out.
  const initializerWired = g.cables.some((wire) => wire.a.nodo === pair.left.id && wire.a.puerto === "init");
  const placed = {
    ...created.g,
    nodos: created.g.nodos.map((node) => (node.id === created.id ? { ...node, dentro: pair.left.dentro, config: { ...node.config, initializerLoopsOut: initializerWired ? 1 : 0 } } : node)),
    cables: rewiredToNode(created.g.cables, pair, created.id),
  };
  return repair(Gr.borrarDejandoCables(placed, [pair.left.id, pair.right.id], placeAt(ctx)));
}

// ——— Replace with Shift Register ———

/** Whether the node is in a loop to put the registers on: LabVIEW greys the row outside any loop (Q5 c). */
export const canReplaceWithShiftRegister = (g, node) => loopsAround(g, node) > 0;

/** Whether `scope` is the structure `structureId` or inside it. */
function isInside(g, scope, structureId) {
  for (let current = scope; current; current = nodeOf(g, current)?.dentro) if (current === structureId) return true;
  return false;
}

/** The wires of the node moved onto the registers `left` and `right`; the initializer's, broken when it came from inside the loop. */
function rewiredToRegisters(g, ctx, node, loopId, registers) {
  const place = placeAt(ctx)(node, "initializer");
  return g.cables.flatMap((wire) => {
    if (wire.a.nodo === node.id && wire.a.puerto === "input") return [{ ...withoutBends(wire), a: { nodo: registers.right, puerto: "value" } }];
    if (wire.de.nodo === node.id) return [{ ...withoutBends(wire), de: { nodo: registers.left, puerto: "value" } }];
    if (wire.a.nodo === node.id && wire.a.puerto === "initializer") {
      const fromInside = Gr.esSuelto(wire.de) ? true : isInside(g, Gr.ambitoDe(g, ctx.cat, wire.de.nodo, wire.de.puerto, "out"), loopId);
      return [{ ...withoutBends(wire), a: fromInside ? { suelto: place } : { nodo: registers.left, puerto: "init" } }];
    }
    return wire.a.nodo === node.id || wire.de.nodo === node.id ? [] : [wire];
  });
}

/**
 * The graph with the Feedback Node `nodeId` replaced by a shift register pair on its n-th enclosing loop (Q5), or the same graph when
 * it is in no loop.
 */
export function replacedWithShiftRegister(g, ctx, nodeId, repair) {
  const node = nodeOf(g, nodeId);
  if (!node || !canReplaceWithShiftRegister(g, node)) return g;
  const loops = enclosingLoops(g, node);
  const loopId = loops[Math.min(Math.max(1, feedbackConfig(node).loopsOut), loops.length) - 1];
  const pair = Gr.crearRegistro(g, ctx.cat, loopId, node.y);
  const registers = { left: pair.izquierdo, right: pair.derecho };
  const cables = rewiredToRegisters(g, ctx, node, loopId, registers);
  return repair({ ...pair.g, nodos: pair.g.nodos.filter((candidate) => candidate.id !== nodeId), cables });
}
