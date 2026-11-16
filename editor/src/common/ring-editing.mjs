// What the editor does with a ring (DT-091): telling one apart, the edits its menus make, and the list it opens. The
// model (items as pairs, the text a ring shows, how values wrap) is core/model/ring.mjs; this is the graph's side.
// Measured in LabVIEW 2026 Q3: labview-captures/reports/2026-11-15-rings.md.

import * as CV from "../../../core/model/control-values.mjs";
import * as Gr from "../../../core/model/graph.mjs";
import { POR_ABREVIATURA } from "../../../core/model/types.mjs";
import { RING_REPRESENTATION, RING_REPRESENTATIONS, RING_STYLES, itemsInRepresentation, ringItems, ringText } from "../../../core/model/ring.mjs";

const RING_CONSTANT = "ring-const";
const PANEL_NUMERIC_BLOCKS = new Set(["control", "indicator"]);

/** The menus of the rings (inventory: `context.ring-*`). The Text Ring and the Menu Ring share them (measured: identical). */
export const RING_MENUS = { control: "context.ring-control", indicator: "context.ring-indicator", constant: "context.ring-constant" };
const RING_MENU_ROOTS = new Set(Object.values(RING_MENUS));
export const isRingMenu = (root) => RING_MENU_ROOTS.has(root);

export const isRingConstant = (node) => node?.tipo === RING_CONSTANT;

/** A Text Ring or a Menu Ring on the panel: a numeric control or indicator whose style says so (DT-091 §2). */
export const isPanelRing = (node) => PANEL_NUMERIC_BLOCKS.has(node?.tipo) && Object.values(RING_STYLES).includes(node.config?.style);

export const isRing = (node) => isRingConstant(node) || isPanelRing(node);

/** The right-click menu of a ring, by what it is. */
export const ringMenuRoot = (node) => (isRingConstant(node) ? RING_MENUS.constant : node.tipo === "control" ? RING_MENUS.control : RING_MENUS.indicator);

/** A ring's representation (a numeric type of Solder): U16 unless it was changed. */
export const ringType = (node) => node.config?.type ?? RING_REPRESENTATION;

/** The representations the menu offers, as Solder's types: the 11 LabVIEW allows less those Solder has not (EXT). */
export const RING_TYPES = RING_REPRESENTATIONS.map((abbreviation) => POR_ABREVIATURA[abbreviation]).filter((type) => type !== undefined);

/** What a ring holds: its constant value, or the current value of a panel ring; `runValues` has what the last run left. */
export const ringValue = (node, runValues) => runValues?.[node.id] ?? (isRingConstant(node) ? node.config?.value : CV.currentValue(node)) ?? 0;

/** What a ring shows now: the text of the item with its value, or `<value>` (measured). */
export const shownRingText = (node, runValues) => ringText(ringItems(node.config), ringValue(node, runValues));

/** The OVI with the ring's items replaced; the value stays as it is, even if no item has it any more (measured). */
export const withRingItems = (graph, id, items) => Gr.fijarConfig(graph, id, { items });

/** Allow Undefined Values: ticked or not (off by default, measured). */
export const allowsUndefined = (node) => !!node.config?.["allow-undefined"];
export const toggledAllowUndefined = (graph, id) => Gr.fijarConfig(graph, id, { "allow-undefined": !allowsUndefined(graph.nodos.find((node) => node.id === id)) });

/**
 * Representation ▸ on a ring: its type changes and the values of its items wrap modulo 2^n (measured). The value it
 * holds wraps the same way, so that it keeps showing the item it showed (the value's own conversion was not measured).
 */
export function withRingRepresentation(graph, id, type) {
  const node = graph.nodos.find((candidate) => candidate.id === id);
  const wrapped = (value) => itemsInRepresentation([{ text: "", value }], type)[0].value;
  const retyped = Gr.fijarRepresentacion(graph, id, type);
  const converted = Gr.fijarConfig(retyped, id, { items: itemsInRepresentation(ringItems(node.config), type), value: wrapped(node.config?.value ?? 0) });
  return CV.hasCurrentValue(node) ? CV.setCurrentValue(converted, id, wrapped(node.currentValue)) : converted;
}

/** Picking the item at `index` of the list (or in Select Item): the ring takes its value; a constant's is its own value, a control's its current one. */
export function withPickedRingItem(graph, id, index) {
  const node = graph.nodos.find((candidate) => candidate.id === id);
  const item = node && ringItems(node.config)[index];
  if (!item) return graph;
  return isRingConstant(node) ? Gr.fijarValor(graph, id, item.value) : CV.setCurrentValue(graph, id, item.value);
}

/**
 * The value the arrows of a Text Ring give. The up arrow (`step` 1) goes to the item above in the list, the down arrow
 * to the one below (measured: from a value with no item the up arrow went to the last item, then to the one above it,
 * and the down arrow to the one below). From a value with no item the down arrow goes to the first item (unverified:
 * only the up arrow was tried) and at the ends the value stays (unverified: whether LabVIEW wraps was not tried).
 */
export function arrowRingValue(items, value, step) {
  const position = items.findIndex((item) => item.value === value);
  const last = items.length - 1;
  const target = position < 0 ? (step > 0 ? last : 0) : Math.max(0, Math.min(last, position - Math.sign(step)));
  return items[target]?.value ?? value;
}
