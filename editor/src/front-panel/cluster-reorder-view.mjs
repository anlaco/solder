// Reorder Controls In Cluster... as the Front Panel draws it (DT-095), measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-17-cluster-reorder.md §1-2): each element framed 1 px black, label included, with a
// two-cell badge flush in the frame's bottom-right corner (the new number white on black, the current one black on
// white), and the toolbar replaced by ✓, ✗, "Click to set to" and the field. The colours are theme tokens (DT-056).

import { newNumbers, hasChanged } from "./cluster-reorder.mjs";

const escapeHtml = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const boxStyle = (box) => `left:${box.x}px;top:${box.y}px;width:${box.ancho}px;height:${box.alto}px`;

/** The smallest box holding both boxes. */
function union(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, ancho: Math.max(a.x + a.ancho, b.x + b.ancho) - x, alto: Math.max(a.y + a.alto, b.y + b.alto) - y };
}

/**
 * One element's frame and badge, at `box` inside the cluster's interior; a click on it gives it the field's number. On the
 * Block Diagram a 3 px bar in the element's type colour sits on top of the badge (reports/2026-11-17-cluster-constant-elements.md
 * Q5); the panel's has none.
 */
function frameHtml(index, box, newNumber, currentNumber, barColor) {
  const bar = barColor ? `<span class="sd-reorder-bar" style="background:${barColor}"></span>` : "";
  const badge = `<span class="sd-reorder-badge">${bar}<span class="sd-reorder-new">${newNumber}</span><span class="sd-reorder-current">${currentNumber}</span></span>`;
  return `<div class="sd-reorder-frame" data-reorder-element="${index}" style="${boxStyle(box)}">${badge}</div>`;
}

/**
 * The frames of a cluster's elements in reorder mode, drawn over them in cluster order. `boxes(index)` gives element
 * `index`'s box and its label's box (or null) inside the interior, and, on the diagram, the colour of its type.
 */
export function reorderFramesHtml(cluster, reorder, boxes) {
  const numbers = newNumbers(reorder);
  return cluster.config.elements
    .map((_, index) => {
      const { element, label, barColor } = boxes(index);
      return frameHtml(index, label ? union(element, label) : element, numbers[index], index, barColor);
    })
    .join("");
}

/**
 * Where the reorder toolbar's parts go, from the window's left edge and the toolbar's top, in px (report §2: ✓ 11 × 10,
 * ✗ 13 × 12, the text, the field 32 × 17).
 */
export const REORDER_TOOLBAR = {
  ok: { left: 57, top: 6, width: 11, height: 10 },
  cancel: { left: 77, top: 5, width: 13, height: 12 },
  text: { left: 103, top: 6 },
  field: { left: 201, top: 5, width: 32, height: 17 },
};

const CHECK_GLYPH = `<svg viewBox="0 0 11 10" width="11" height="10"><path d="M0.5 5.5 L4 9 L10.5 0.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
const CROSS_GLYPH = `<svg viewBox="0 0 13 12" width="13" height="12"><path d="M1 1 L12 11 M12 1 L1 11" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;

const placed = (part) => `left:${part.left}px;top:${part.top}px${part.width ? `;width:${part.width}px;height:${part.height}px` : ""}`;

/** The toolbar while the mode is on: ✓ always enabled, ✗ only once the order changed, and the field with its text. */
export function reorderToolbarHtml(reorder) {
  const cancelState = hasChanged(reorder) ? "" : " desactivado";
  const selected = reorder.typed ? "" : " seleccionado";
  return [
    `<div class="sd-reorder-button" data-reorder="ok" style="${placed(REORDER_TOOLBAR.ok)}">${CHECK_GLYPH}</div>`,
    `<div class="sd-reorder-button${cancelState}" data-reorder="cancel" style="${placed(REORDER_TOOLBAR.cancel)}">${CROSS_GLYPH}</div>`,
    `<div class="sd-reorder-text" style="${placed(REORDER_TOOLBAR.text)}">Click to set to</div>`,
    `<div class="sd-reorder-field" style="${placed(REORDER_TOOLBAR.field)}"><span class="sd-reorder-field-text${selected}">${escapeHtml(reorder.fieldText)}</span></div>`,
  ].join("");
}
