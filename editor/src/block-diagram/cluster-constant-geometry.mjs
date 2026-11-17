// A Cluster Constant on the Block Diagram (DT-095, stage c): where its box, interior, terminal and handles are.
//
// Measured in LabVIEW 2026 Q3 (labview-captures/reports/2026-11-17-cluster-constant-geometry.md, local evidence never
// committed): the empty constant is 100 x 100, its frame two 1 px lines at offsets 0 and 2 from the outside, so the
// interior starts 3 px in; its output wire leaves the right edge at the middle row; resizing shows eight 6 x 6 handles
// inside the frame's bounds and stops at 11 x 11. Pure functions: no graph, no drawing.

import { constantTerminalZone } from "./panel-terminal-zone.mjs";

export const BLOCK = "cluster-constant";

/** The inventory roots of the right-click menus: the frame's and an element's (reports 2026-11-16-cluster-diagram.md Q2, 2026-11-17-cluster-constant-elements.md Q2). */
export const FRAME_MENU = "context.cluster-constant";
export const ELEMENT_MENU = "context.cluster-constant-element";

/** Report Q1-Q3, Q5: `size` of the empty constant, `frameDepth` (line, white, line), `smallest` and `handle` as measured. */
export const MEASURES = { size: 100, frameDepth: 3, smallest: 11, handle: 6 };

/** The handles' places, clockwise from the top-left corner (the order of the structures' handles). */
export const SIDES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export const isClusterConstant = (node) => node?.tipo === BLOCK;

/** The constant's box on the diagram: its corner and the size it was given, or the measured 100 x 100. */
export const clusterBox = (node) => ({ x: node.x, y: node.y, ancho: node.tam?.ancho ?? MEASURES.size, alto: node.tam?.alto ?? MEASURES.size });

/** What lies inside the frame's two lines: where the elements are drawn, clipped, and where a dropped constant becomes one. */
export const interiorBox = (box) => ({
  x: box.x + MEASURES.frameDepth,
  y: box.y + MEASURES.frameDepth,
  ancho: box.ancho - 2 * MEASURES.frameDepth,
  alto: box.alto - 2 * MEASURES.frameDepth,
});

/** Does the box hold the point (the right and bottom edges excluded)? */
export const boxHolds = (box, point) => point.x >= box.x && point.x < box.x + box.ancho && point.y >= box.y && point.y < box.y + box.alto;

// ——— Elements' ids ———

/** An element has no node of its own; this is the id the selection and the drawing give it: `<cluster>.elements.<index>`. */
export const elementId = (clusterId, index) => `${clusterId}.elements.${index}`;

const ELEMENT_ID = /^(.+)\.elements\.(\d+)$/;

/** `{ clusterId, index }` of an element's id, or null for the id of anything else. */
export function parseElementId(id) {
  const match = typeof id === "string" ? ELEMENT_ID.exec(id) : null;
  return match ? { clusterId: match[1], index: Number(match[2]) } : null;
}

export const isElementId = (id) => parseElementId(id) !== null;

/** Is this pseudo-node (`elementNode`) an element drawn inside a cluster, with no terminal of its own? */
export const isElementNode = (node) => node?.elementOf !== undefined;

/** An element as a node, so that the diagram's own measures and drawing serve it; `origin` is where its place counts from. */
export const elementNode = (cluster, element, index, origin) => ({
  ...element,
  id: elementId(cluster.id, index),
  x: origin.x + element.x,
  y: origin.y + element.y,
  elementOf: cluster.id,
});

// ——— Terminal and handles ———

/**
 * The output terminal: the wire attaches at the right edge, `x = right edge + 1` as the report reads it (the first
 * pixel column outside the box, as the other constants' wires start), at `top + floor(height / 2)` (Q1: 50 for 100
 * tall, 101 for 203).
 */
export function outputTerminal(node, ctxPortLabel) {
  const box = clusterBox(node);
  const [x, y] = [box.x + box.ancho, box.y + Math.floor(box.alto / 2)];
  return { puerto: "result", etiqueta: ctxPortLabel, dir: "out", x, y, zona: constantTerminalZone(box), centro: { x, y } };
}

/** A handle's box, inside the frame's bounds (Q2): the corners and the middles of the edges. */
export function handleBox(side, box) {
  const size = MEASURES.handle;
  const x = side.includes("w") ? 0 : side.includes("e") ? box.ancho - size : Math.floor((box.ancho - size) / 2);
  const y = side.includes("n") ? 0 : side.includes("s") ? box.alto - size : Math.floor((box.alto - size) / 2);
  return { x, y, ancho: size, alto: size };
}

// ——— Resizing ———

/** One axis of a resize: the edge `start` (fixed) and the one being dragged to `edge`; the length stops at the smallest. */
function stretchAxis(start, length, movesStart, movesEnd, delta) {
  const end = start + length;
  const newStart = movesStart ? Math.min(start + delta, end - MEASURES.smallest) : start;
  const newEnd = movesEnd ? Math.max(end + delta, newStart + MEASURES.smallest) : end;
  return [newStart, newEnd - newStart];
}

/** The box that dragging handle `side` of `box` by (dx, dy) gives; no side goes below 11 (Q2: unmeasured for the edge handles). */
export function resizedBox(box, side, dx, dy) {
  const [x, ancho] = stretchAxis(box.x, box.ancho, side.includes("w"), side.includes("e"), dx);
  const [y, alto] = stretchAxis(box.y, box.alto, side.includes("n"), side.includes("s"), dy);
  return { x, y, ancho, alto };
}
