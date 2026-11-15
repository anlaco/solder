// The Text Ring and the Menu Ring on the panel (DT-091): their boxes, their default labels and the list a click opens in
// operate mode. Measured in LabVIEW 2026 Q3 (labview-captures/reports/2026-11-15-rings.md §3, §6).

import { RING_STYLES, ringItems } from "../../../core/model/ring.mjs";
import { allowsUndefined, isPanelRing, ringValue } from "../common/ring-editing.mjs";
import { dropDownListHtml } from "../block-diagram/diagram-view.mjs";

/**
 * The box of a ring without its arrows: a Text Ring is 50 × 25 and a Menu Ring 115 × 21 (measured). A Text Ring
 * control has the up and down arrows to the left of its box, outside it, as the enum's (`arrows`).
 */
const RING_BOXES = {
  [RING_STYLES.TEXT]: { width: 50, height: 25 },
  [RING_STYLES.MENU]: { width: 115, height: 21 },
};

/** The default label of each ring when it is placed: the titles of its Properties dialog (measured: "Ring" and "Menu Ring"). */
const RING_LABELS = { [RING_STYLES.TEXT]: "Ring", [RING_STYLES.MENU]: "Menu Ring" };

/** The size of a ring block's box and whether it has arrows, or `null` if `block` with `config` is not a panel ring. */
export function ringMeasures(block, config) {
  if (!isPanelRing({ tipo: block, config })) return null;
  const box = RING_BOXES[config.style];
  return { ...box, arrows: block === "control" && config.style === RING_STYLES.TEXT };
}

/** The label a ring is born with, or `undefined` for what is not a ring. */
export const ringLabel = (block, config) => (isPanelRing({ tipo: block, config }) ? RING_LABELS[config.style] : undefined);

/** The row a ring with Allow Undefined Values adds at the end of its list; not built yet (DT-091 §5), so it is only drawn, greyed. */
const OTHER_ROW = "<Other>...";

/**
 * The list a click opens on a ring in operate mode (measured: anchored at the control's top left, the texts of the items,
 * the check mark on the current one; a Menu Ring's is as wide as the control, ≈ 115). `list`: `{ nodo, x, y }`.
 */
export function ringListHtml(node, list, runValues, ctx) {
  const current = ringValue(node, runValues);
  const rows = ringItems(node.config).map((item, index) => ({
    text: item.text,
    checked: item.value === current,
    className: "item-ring",
    attributes: `data-nodo="${node.id}" data-ring-item="${index}"`,
  }));
  if (allowsUndefined(node)) rows.push({ text: OTHER_ROW, className: "item-ring", grey: true, attributes: `data-nodo="${node.id}"` });
  const minWidth = node.config.style === RING_STYLES.MENU ? RING_BOXES[RING_STYLES.MENU].width : 0;
  return dropDownListHtml({ x: list.x, y: list.y, rows, minWidth }, ctx);
}
