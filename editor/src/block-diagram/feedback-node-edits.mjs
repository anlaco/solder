// What the menu and the dialog of the Feedback Node (DT-109) do to the graph: the changes of its look-only configuration
// (`direction`, `showEnable`, `header`), its `delay`, and where its initializer is (`initializerLoopsOut`, DT-109 §1 and §6).
// Pure functions of a graph, like the other editing modules.

import { enclosingLoops } from "../../../core/model/feedback-node.mjs";
import * as Gr from "../../../core/model/graph.mjs";
import {
  DIRECTION_LEFT, DIRECTION_RIGHT, FEEDBACK_NODE, HEADER_Z_TRANSFORM, cellStack, feedbackConfig, initializerLoopId, isFeedbackNode,
} from "./feedback-node-geometry.mjs";

const nodeOf = (g, id) => g.nodos.find((candidate) => candidate.id === id);

export const toggledShowEnable = (g, id) => Gr.fijarConfig(g, id, { showEnable: !feedbackConfig(nodeOf(g, id)).showEnable });

export const flippedDirection = (g, id) => Gr.fijarConfig(g, id, { direction: feedbackConfig(nodeOf(g, id)).direction === DIRECTION_LEFT ? DIRECTION_RIGHT : DIRECTION_LEFT });

/** Whether the enable terminal has a wire: the node does not hide it then (what LabVIEW does is unverified). */
export const enableIsWired = (g, id) => g.cables.some((wire) => wire.a.nodo === id && wire.a.puerto === "enable");

// ——— The initializer's loop ———

/** How many loops the node is in: the most Move Initializer One Loop Out can take its initializer out by. */
export const loopsAround = (g, node) => enclosingLoops(g, node).length;

export const canMoveInitializerOut = (g, node) => feedbackConfig(node).loopsOut < loopsAround(g, node);
export const canMoveInitializerIn = (node) => feedbackConfig(node).loopsOut > 0;

/** The initializer one loop further out; the graph as it was when there is no loop left (the menu greys the row then). */
export const initializerMovedOut = (g, id) => (canMoveInitializerOut(g, nodeOf(g, id)) ? Gr.fijarConfig(g, id, { initializerLoopsOut: feedbackConfig(nodeOf(g, id)).loopsOut + 1 }) : g);

/** The initializer one loop further in, down to the node itself. */
export const initializerMovedIn = (g, id) => (canMoveInitializerIn(nodeOf(g, id)) ? Gr.fijarConfig(g, id, { initializerLoopsOut: feedbackConfig(nodeOf(g, id)).loopsOut - 1 }) : g);

/**
 * Every Feedback Node whose initializer is further out than the loops it is now in goes back to the outermost of them (the
 * node was dragged out of a loop, or one was deleted). The compiler already does the same (`initializingLoop`); this keeps
 * the look in step with it.
 */
export function initializersInTheirLoops(g) {
  let settled = g;
  for (const node of g.nodos.filter((candidate) => candidate.tipo === FEEDBACK_NODE)) {
    const { loopsOut } = feedbackConfig(node);
    const loops = loopsAround(g, node);
    if (loopsOut > loops) settled = Gr.fijarConfig(settled, node.id, { initializerLoopsOut: loops });
  }
  return settled;
}

// ——— The wire of an initializer moved out ———

/** The Feedback Node whose moved-out initializer the wire end `end` is, or undefined. */
function movedOutInitializerOf(g, end) {
  const node = end.puerto === "initializer" ? nodeOf(g, end.nodo) : undefined;
  return isFeedbackNode(node) && feedbackConfig(node).loopsOut > 0 ? node : undefined;
}

/**
 * Whether `wire` ends on the initializer of a Feedback Node moved out of its loop. Such a wire starts outside that loop and
 * crosses its border with no tunnel: the editor draws its end on the loop's terminal (DT-109 §6), so the repair that gives
 * every wire across a border a tunnel leaves it alone.
 */
export const isMovedOutInitializerWire = (g, wire) => Gr.conectado(wire) && !!movedOutInitializerOf(g, wire.a);

/**
 * The graph with a wire from the output `de` to the moved-out initializer `a`, made directly, when `de` is in the scope just
 * outside the initializer's loop; `null` when the wire is not that (the caller joins the terminals as it always did).
 */
export function connectedToMovedOutInitializer(g, cat, de, a) {
  const node = movedOutInitializerOf(g, a);
  const loop = node && nodeOf(g, initializerLoopId(g, node));
  if (!loop || Gr.ambitoDe(g, cat, de.nodo, de.puerto, "out") !== loop.dentro) return null;
  const id = `c${g.siguiente}`;
  const wire = { id, de: { nodo: de.nodo, puerto: de.puerto }, a: { nodo: a.nodo, puerto: a.puerto } };
  const others = g.cables.filter((candidate) => !(candidate.a.nodo === a.nodo && candidate.a.puerto === a.puerto));
  return { g: { ...g, cables: [...others, wire], siguiente: g.siguiente + 1 }, id };
}

// ——— The dialog's changes ———

/** The configuration keys the dialog writes; anything else of the node's configuration is left alone. */
export const DIALOG_KEYS = Object.freeze(["delay", "showEnable", "header", "direction"]);

/**
 * The node with the configuration `patch` and, when the header changed, its top moved so that the bottom stays where it was:
 * the Z-transform header makes the node grow upwards when applied from the dialog (look report Q5; the menu's changes and the
 * other keys are unverified and keep the top).
 */
export function configuredFromDialog(g, id, patch) {
  const before = nodeOf(g, id);
  const headerChanged = patch.header !== undefined && (patch.header === HEADER_Z_TRANSFORM) !== (before.config?.header === HEADER_Z_TRANSFORM);
  const withConfig = Gr.fijarConfig(g, id, patch);
  if (!headerChanged) return withConfig;
  const heightBefore = cellStack(feedbackConfig(before)).height;
  const heightAfter = cellStack(feedbackConfig(nodeOf(withConfig, id))).height;
  return Gr.mover(withConfig, [id], 0, heightBefore - heightAfter);
}
