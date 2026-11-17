// A Cluster Constant on the Block Diagram (DT-095, stage c): its drawing. The geometry is cluster-constant-geometry.mjs.
//
// Measured in LabVIEW 2026 Q3 (reports/2026-11-17-cluster-constant-geometry.md Q1, Q2, Q5): a white interior inside a
// frame of two 1 px lines, brown for numbers only (or none) and magenta for anything else; the frame does not change
// colour when selected; the terminal glyph is drawn only while the pointer is over the frame; eight handles while
// selected. The elements are drawn by the diagram as it draws that constant, with no label, clipped by the interior.

import { MEASURES, SIDES, elementNode, handleBox, interiorBox } from "./cluster-constant-geometry.mjs";

const px = (value) => `${Number(value.toFixed(2))}px`;
const escapeHtml = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The hover glyph of the output (Q1): 9 x 6 px, a black diamond 6 x 6 centred on the right edge and, right of it, a
 * 3 x 3 ring in the frame's colour with a white centre. Which of the two is the terminal itself is unverified.
 */
const GLYPH = { width: 9, height: 6, diamondCentre: 3, ringFrom: 6, ringSize: 3 };
const terminalGlyph = (box, mixed) =>
  `<svg class="cc-terminal-glyph${mixed ? " cc-mixed" : ""}" width="${GLYPH.width}" height="${GLYPH.height}" viewBox="0 0 ${GLYPH.width} ${GLYPH.height}" style="left:${px(box.ancho - GLYPH.diamondCentre)};top:${px(Math.floor(box.alto / 2) - GLYPH.height / 2)}" shape-rendering="crispEdges" aria-hidden="true">` +
  `<path class="cc-glyph-diamond" d="M3 0 L6 3 L3 6 L0 3 Z"/>` +
  `<rect class="cc-glyph-ring" x="${GLYPH.ringFrom}" y="1.5" width="${GLYPH.ringSize}" height="${GLYPH.ringSize}"/></svg>`;

/** The four bands that take the press (the interior does not: a drag there is a rubber band, as on the empty diagram). */
function frameBands(box) {
  const depth = MEASURES.frameDepth;
  const band = (side, left, top, width, height) => `<div class="cc-band cc-band-${side}" style="left:${px(left)};top:${px(top)};width:${px(width)};height:${px(height)}"></div>`;
  return band("n", 0, 0, box.ancho, depth) + band("s", 0, box.alto - depth, box.ancho, depth) + band("w", 0, 0, depth, box.alto) + band("e", box.ancho - depth, 0, depth, box.alto);
}

/**
 * The frame, the interior with its elements and the bands. `drawElement(node)` is the diagram's own drawing of a
 * constant given as a node; `origin` of the elements is the interior's corner, so they come out relative to it.
 */
export function clusterConstantBody(node, box, { mixed, drawElement, hovered }) {
  const inner = interiorBox({ x: 0, y: 0, ancho: box.ancho, alto: box.alto });
  const elements = (node.config?.elements ?? []).map((element, index) => drawElement(elementNode(node, element, index, { x: 0, y: 0 }))).join("");
  return (
    `<div class="cc-frame${mixed ? " cc-mixed" : ""}" style="width:${px(box.ancho)};height:${px(box.alto)}"><div class="cc-line"></div></div>` +
    `<div class="cc-interior" style="left:${px(inner.x)};top:${px(inner.y)};width:${px(inner.ancho)};height:${px(inner.alto)}">${elements}</div>` +
    frameBands(box) +
    (hovered ? terminalGlyph(box, mixed) : "")
  );
}

/** The eight handles of a selected constant, 6 x 6 inside the frame's bounds. */
export function clusterConstantHandles(node, box) {
  return SIDES.map((side) => {
    const handle = handleBox(side, box);
    return `<div class="asa asa-estructura" data-nodo="${escapeHtml(node.id)}" data-asa="${side}" style="left:${px(handle.x)};top:${px(handle.y)}"></div>`;
  }).join("");
}
