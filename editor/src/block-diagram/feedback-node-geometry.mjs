// The Feedback Node (DT-109) as a node of the Block Diagram: its configuration as the editor reads it, its size, its cells and
// its terminals. Pure numbers, no DOM; the picture is feedback-node-view.mjs.
//
// Measured at 1:1 in LabVIEW 2026 Q3 (labview-captures/reports/2026-11-26-feedback-node-look.md Q2-Q6; the captures are local
// evidence and are never committed):
//   - One box, 32 x 24, made of cells stacked from the top: the arrow cell (12 px counting the node's 2 px top border and the 1 px
//     divider under it) and the initializer cell (12 px counting the 2 px bottom border).
//   - Show Enable Terminal inserts a 12 px cell between them (36 high); the Z-transform header, a 24 px row (48 high).
//   - Delay above 1 writes the number in the arrow cell and widens the node: 32, 39 (3), 45 (12). Z-transform moves the number out
//     of the arrow row and the width goes back to 32.
//   - With the initializer moved out of its loop the node has only the arrow row, about 13 px high, and the initializer is a
//     16 x 12 terminal on the left border of the loop.
//   - Terminals (scripting, node at x, y, arrow left): input (x + 16, y) 16 x 12, output (x, y) 16 x 12, initializer (x, y + 12)
//     32 x 12, enable in the middle cell when shown. Arrow right swaps input and output; the cells are not mirrored.
//   - Wires attach at the middle of the arrow cell on its edge, the initializer's at the bottom centre.
//
// Not measured, and decided here (marked in the code): the widening of a delay of three digits or more, the order of the Z row
// and the enable cell, the height with the initializer moved out and another cell shown, where the enable wire attaches, where
// exactly the loop's border terminal sits, and where its wire attaches.

import { enclosingLoops, feedbackDelay } from "../../../core/model/feedback-node.mjs";

export const FEEDBACK_NODE = "feedback-node";
export const isFeedbackNode = (node) => node?.tipo === FEEDBACK_NODE;

/** The root of the node's right-click menu (reports/2026-11-26-feedback-node-behavior.md Q10 "Node menu"). */
export const MENU_ROOT = "context.feedback-node";

// ——— The configuration ———

export const DIRECTION_LEFT = "left";
export const DIRECTION_RIGHT = "right";
export const HEADER_ARROW = "arrow";
export const HEADER_Z_TRANSFORM = "z-transform";

/** The configuration that only changes the look (DT-109 §6), with the defaults of a node dropped from the palette. */
export function feedbackConfig(node) {
  const config = node.config ?? {};
  return {
    delay: feedbackDelay(node),
    direction: config.direction === DIRECTION_RIGHT ? DIRECTION_RIGHT : DIRECTION_LEFT,
    showEnable: config.showEnable === true,
    zTransform: config.header === HEADER_Z_TRANSFORM,
    loopsOut: Math.max(0, Math.trunc(Number(config.initializerLoopsOut ?? 0)) || 0),
  };
}

// ——— Size and cells ———

export const BASE_WIDTH = 32;
/** The pitch of the arrow, enable and initializer cells, their dividers or the bottom border included (Q2). */
export const CELL_HEIGHT = 12;
/** The row the Z-transform header adds (Q5). */
export const Z_ROW_HEIGHT = 24;
/** The arrow row alone: 2 px border, 9 px inside, 2 px border (Q6, "~13 tall, from pixels"). */
const ARROW_ONLY_HEIGHT = 13;
/** What the number of a delay of one digit and of two widens the node by (Q2, Q5); each further digit adds the second's step (unverified). */
const DIGIT_WIDENING = [7, 13];
const EXTRA_DIGIT_WIDENING = DIGIT_WIDENING[1] - DIGIT_WIDENING[0];

/** Whether the arrow row shows the delay: more than one, and not with the Z-transform header, which writes it as an exponent. */
export const showsDelayNumber = (config) => config.delay > 1 && !config.zTransform;

/** How much the number of `delay` widens the node. */
export function delayWidening(delay) {
  const digits = String(delay).length;
  return digits <= DIGIT_WIDENING.length ? DIGIT_WIDENING[digits - 1] : DIGIT_WIDENING[1] + EXTRA_DIGIT_WIDENING * (digits - DIGIT_WIDENING.length);
}

/** The cells from the top, each with its `top` and `height`, and the node's height. The initializer cell is gone when its terminal is on a loop. */
export function cellStack(config) {
  const kinds = [["arrow", CELL_HEIGHT]];
  if (config.zTransform) kinds.push(["z", Z_ROW_HEIGHT]);
  if (config.showEnable) kinds.push(["enable", CELL_HEIGHT]);
  if (config.loopsOut === 0) kinds.push(["initializer", CELL_HEIGHT]);
  let top = 0;
  const cells = {};
  for (const [name, height] of kinds) {
    cells[name] = { top, height };
    top += height;
  }
  // Without an initializer cell the last cell ends in the bottom border instead of a divider: one px more (13 for the arrow alone).
  const height = config.loopsOut === 0 ? top : top - CELL_HEIGHT + ARROW_ONLY_HEIGHT;
  return { cells, height };
}

/** The node's size from its configuration. */
export function feedbackSize(node) {
  const config = feedbackConfig(node);
  const width = BASE_WIDTH + (showsDelayNumber(config) ? delayWidening(config.delay) : 0);
  return { ancho: width, alto: cellStack(config).height };
}

/** The node hangs from the cursor by its middle (unverified: as the Call Library Function Node's does). */
export function feedbackGrabPoint(node) {
  const { ancho, alto } = feedbackSize(node);
  return { x: Math.round(ancho / 2), y: Math.round(alto / 2) };
}

// ——— Terminals ———

/** The width of the input and output halves of the arrow cell (Q2). */
export const HALF_WIDTH = 16;
/** Where the wire runs in the arrow cell, from the node's top: the middle of the 2 px shaft (rows 5 and 6, Q2). */
export const ARROW_WIRE_Y = 6;
/** The loop's terminal: 16 x 12 with a 2 px border and a 6 x 6 diamond (Q6). */
export const LOOP_TERMINAL = Object.freeze({ width: 16, height: 12, border: 2, diamond: 6 });

/** The arrow's head is on the side the arrow points to, and the value enters at the other side (Q4): arrow left, input on the right half. */
export const inputIsOnRight = (config) => config.direction === DIRECTION_LEFT;

/** The loop that holds the initializer terminal: the `loopsOut`-th enclosing loop, innermost first, or undefined when there is none. */
export function initializerLoopId(graph, node) {
  const { loopsOut } = feedbackConfig(node);
  return loopsOut > 0 ? enclosingLoops(graph, node)[loopsOut - 1] : undefined;
}

/** How far the terminal's top sits above the top of the iteration terminal: about 3 px, read from labview-captures/feedback-node-look/q6oc.png (±1). */
const TERMINAL_TOP_ABOVE_ITERATION = 3;

/**
 * The box of the initializer's terminal on a loop's left border: 16 wide, level with the loop's bottom, just above and a little
 * to the left of the iteration terminal, whose top is `iterationTopFromBottom` above the loop's bottom edge (Q6; the vertical
 * place is read from the capture, and the horizontal one, flush with the loop's edge, is unverified).
 */
export const loopTerminalBox = (loopBox, iterationTopFromBottom) => ({
  x: loopBox.x,
  y: loopBox.y + loopBox.alto - iterationTopFromBottom - TERMINAL_TOP_ABOVE_ITERATION,
  ancho: LOOP_TERMINAL.width,
  alto: LOOP_TERMINAL.height,
});

/** The initializer cell, or, with the cell gone and no loop to hold the terminal, a strip along the bottom edge (unverified; only a stale configuration reaches it). */
const initializerZone = (box, cells) =>
  cells.initializer
    ? { x: box.x, y: box.y + cells.initializer.top, ancho: box.ancho, alto: CELL_HEIGHT }
    : { x: box.x, y: box.y + box.alto - STRIP_HEIGHT / 2, ancho: box.ancho, alto: STRIP_HEIGHT };
const STRIP_HEIGHT = 6;

const terminal = (puerto, dir, zona, wire) => ({ puerto, etiqueta: "", dir, x: wire.x, y: wire.y, zona, centro: { x: wire.x, y: wire.y } });

/**
 * The node's terminals, in the order of LabVIEW's `Terminals[]`: input, output, initializer, enable. `box` is the node's box.
 * `loopBox`, the box of the terminal on the loop, is given when the initializer has been moved out and the loop exists; without
 * it the initializer keeps the bottom of the node (the node's wire attach point).
 */
export function feedbackTerminals(node, box, loopBox) {
  const config = feedbackConfig(node);
  const { cells } = cellStack(config);
  const [left, right] = [box.x, box.x + box.ancho - HALF_WIDTH];
  const halves = inputIsOnRight(config) ? { input: right, output: left } : { input: left, output: right };
  const half = (name, dir) => {
    const x = halves[name];
    const edge = x === left ? box.x : box.x + box.ancho;
    return terminal(name, dir, { x, y: box.y, ancho: HALF_WIDTH, alto: CELL_HEIGHT }, { x: edge, y: box.y + ARROW_WIRE_Y });
  };
  const initializer = loopBox
    ? terminal("initializer", "in", loopBox, { x: loopBox.x, y: loopBox.y + loopBox.alto / 2 })
    : terminal("initializer", "in", initializerZone(box, cells), { x: box.x + box.ancho / 2, y: box.y + box.alto });
  const enableTop = cells.enable?.top ?? cells.arrow.height;
  const enable = terminal("enable", "in", { x: box.x, y: box.y + enableTop, ancho: box.ancho, alto: CELL_HEIGHT }, { x: box.x, y: box.y + enableTop + CELL_HEIGHT / 2 });
  return [half("input", "in"), half("output", "out"), initializer, enable];
}
