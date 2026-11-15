// The polymorphic OVI nodes of a diagram (DT-074): a subOVI node that calls a `.sdp`. What the editor needs besides
// what any subOVI node has: its icon, the selector ring under it, the menu with Select Type ▸, and keeping the
// instance Automatic picks up to date as the diagram changes. Measured in LabVIEW 2026 Q3 on VISA Configure Serial
// Port (labview-captures/reports/2026-11-05-polymorphic-vi.md). Pure, over the graph and the catalog view of the OVI.

import * as Gr from "../../../core/model/graph.mjs";
import { DRAW_ICON, isPolymorphicNode, selectedInstance } from "../../../core/model/polymorphic.mjs";
import { PANE_SIZE } from "../../../core/model/connector.mjs";
import * as G from "../common/glyphs.mjs";
import { selectorHeight, selectorLines } from "../../../core/model/polymorphic-menu.mjs";
import * as SelectorMenu from "./polymorphic-selector-menu.mjs";

export { isPolymorphicNode };

// ——— The selector ring ———

/**
 * The ring sits 1 px under the icon: the node's bounds are the icon, this gap and the ring (measured: 54 = 32 + 1 + 19 +
 * the 2 px shadow, and 69 = 32 + 1 + 34 + 2 for a two-line ring). The 2 px of white that the capture saw between the
 * icon's last row and the ring's border are this 1 px and, presumably, a blank bottom row of the icon's own bitmap;
 * the bounds are what the layout follows, so the gap stays 1 (the blank row is not checked).
 */
export const SELECTOR_GAP = 1;
/** The ring is 19 px tall with one line and 15 px more for each further one (`selectorHeight`); its shadow adds 2 px to the node's bounds. */
export const SELECTOR_SHADOW = 2;
/**
 * What the ring adds to the width of its text: the margin, the gap and the dropdown triangle. Only the total was
 * measured (188 px for "VISA Configure Serial Port (Instr)"), so this share is unverified; the ring follows its text.
 * With two lines the ring is as wide as the widest one plus this (measured: lines 73 and 65 px wide in a ring 91 wide
 * on DAQmx Read, which this reproduces to within the font's rounding).
 */
export const SELECTOR_TEXT_PADDING = 26;

/** The name the selector shows: the selector name of the instance the node calls now (DT-074 details). */
export function selectorText(node, polymorphic) {
  return polymorphic.instances[selectedInstance(node, polymorphic)]?.selectorName ?? "";
}

/** Is the node's selector ring drawn? When it asks for it and its polymorphic OVI could be read. */
export const selectorShown = (node, cat) => !!node.config?.selector && !!cat.polymorphicOf?.(node);

/**
 * The ring from the icon's top-left corner: centred on the icon (measured: it can be wider than the icon), 1 px
 * below it, as wide as its widest line and as tall as its lines. `measureText` is the width of a text in the font the editor draws.
 */
export function selectorRing(text, measureText) {
  const widestLine = Math.max(...selectorLines(text).map(measureText));
  const width = Math.ceil(widestLine) + SELECTOR_TEXT_PADDING;
  return { x: Math.floor((PANE_SIZE - width) / 2), y: PANE_SIZE + SELECTOR_GAP, ancho: width, alto: selectorHeight(text) };
}

/**
 * The bounds of the node as LabVIEW reports them, from the icon's corner: the icon alone, or the icon with the ring and
 * its shadow (measured: 190 x 54 for a ring 188 wide). The icon does not move.
 */
export function nodeBounds(node, cat, measureText) {
  const icon = { x: 0, y: 0, ancho: PANE_SIZE, alto: PANE_SIZE };
  const callee = selectorShown(node, cat) && cat.polymorphicOf(node);
  if (!callee) return icon;
  const ring = selectorRing(selectorText(node, callee.polymorphic), measureText);
  const left = Math.min(icon.x, ring.x);
  const right = Math.max(icon.x + icon.ancho, ring.x + ring.ancho + SELECTOR_SHADOW);
  return { x: left, y: 0, ancho: right - left, alto: ring.y + ring.alto + SELECTOR_SHADOW };
}

// ——— The icon ———

/**
 * The node's icon (DT-074 §4): the polymorphic OVI's own, drawn as an image from a `data:` URI so that nothing inside
 * it runs; with `draw-icon: "instance"`, or no icon in the file, a generic one. Instances have no icons of their own
 * yet, so "instance" draws the generic subOVI icon.
 */
export function iconHtml(polymorphic) {
  return polymorphic.drawIcon === DRAW_ICON.INSTANCE ? G.iconoVI() : ownIconHtml(polymorphic.icon);
}

/** A polymorphic OVI's own icon from the text of its SVG document, or the generic polymorphic icon when it has none. */
export function ownIconHtml(iconText) {
  if (!iconText) return G.polymorphicOviIcon();
  const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconText)}`;
  return `<img src="${uri}" width="${PANE_SIZE}" height="${PANE_SIZE}" alt="" draggable="false">`;
}

// ——— The menu ———

export const MENU_ROOT = "context.polymorphic-subvi";
export const SELECT_TYPE_ROW = `${MENU_ROOT}.select-type`;
/** The menu the selector ring opens: the same rows as Select Type ▸, as a menu of its own over the ring (measured). */
export const RING_MENU_ROOT = "context.polymorphic-selector-ring";
export const SELECTOR_ROW = `${MENU_ROOT}.visible-items.polymorphic-ovi-selector`;
export const AUTOMATIC = SelectorMenu.AUTOMATIC;
/** The id of a first-level row that calls instance `index` in Select Type ▸ (deeper rows have the ids of their submenus). */
export const instanceRow = (index) => `${SELECT_TYPE_ROW}.instance-${index}`;
export const AUTOMATIC_ROW = `${SELECT_TYPE_ROW}.automatic`;

/**
 * The ring's dropdown opens with its left edge on the ring's and its top 2 px above the ring's top, so that its first row
 * lies over the ring (measured: 245 against 247).
 */
export const RING_MENU_OVERLAP = 2;

/** The choice a row id stands for: `{ choice }` (null for Automatic, else the index), or null when it is not one of the rows of these menus. */
export function choiceOfRow(rowId) {
  const inThese = [SELECT_TYPE_ROW, RING_MENU_ROOT].some((root) => rowId.startsWith(`${root}.`));
  return inThese ? SelectorMenu.choiceOfRow(rowId) : null;
}

/** The rows of Select Type ▸ (or of the ring's menu, from `RING_MENU_ROOT`) of the node's polymorphic OVI. */
const menuRowsOf = (node, cat, root) => {
  const callee = cat.polymorphicOf?.(node);
  return callee && SelectorMenu.selectorMenuRows(node, callee.polymorphic, root);
};

/** The ids of the rows of Select Type ▸ (or of the ring's menu, by `root`) that carry a tick: Automatic, or the path to the instance (measured). */
export const tickedRows = (node, cat, root = SELECT_TYPE_ROW) => menuRowsOf(node, cat, root)?.marks ?? new Set();

/** The ids of the rows of the node's menu that carry a tick, besides the general ones (View As Icon, Terminals). */
export function menuMarks(node, cat) {
  return [...tickedRows(node, cat), ...(cat.polymorphicOf?.(node) && node.config?.selector ? [SELECTOR_ROW] : [])];
}

/**
 * What the menus of the polymorphic node fill in: the rows of Select Type ▸ (or, for `RING_MENU_ROOT`, of the ring's
 * menu) with their submenus, from the `.sdp`. Automatic is a row only when the OVI adapts to the data type (measured).
 */
export function menuVariants(node, cat, root = SELECT_TYPE_ROW) {
  return { submenus: menuRowsOf(node, cat, root)?.submenus ?? new Map() };
}

/**
 * The state of the menu the ring opens at the ring's top-left corner (`ringX`, `ringY` in window pixels), the
 * dropdown that LabVIEW opens over the ring (measured).
 */
export const ringMenuPlace = (ringX, ringY) => ({ x: ringX, y: ringY - RING_MENU_OVERLAP });

// ——— Changing the node ———

/**
 * Keeps every node on Automatic calling the instance its wires pick, and loosens the wires that end on a terminal the
 * new instance lacks (as `Gr.aflojarCablesHuerfanos` does for a subOVI whose connector changed). Called each time the
 * graph changes, from one place; the result belongs to the edit that caused it, not to an undo step of its own.
 * `before` is the graph as it was, whose terminals the loose ends are drawn at; `after` is the edited one, returned
 * itself when nothing changes. `forceLoosening` is for a choice made by hand, which changes ports with no Automatic pass.
 */
export function settlePolymorphicNodes(before, after, cat, placeOfTerminal, { forceLoosening = false } = {}) {
  if (!after.nodos.some(isPolymorphicNode)) return after;
  const adapted = Gr.adaptPolymorphicNodes(after, cat);
  if (adapted === after && !forceLoosening) return after;
  const nodesBefore = new Map(before.nodos.map((node) => [node.id, node]));
  const placeAsItWas = (node, port) => placeOfTerminal(nodesBefore.get(node.id) ?? node, port);
  const loosened = Gr.aflojarCablesHuerfanos(adapted, cat, placeAsItWas);
  return JSON.stringify(loosened.cables) === JSON.stringify(adapted.cables) ? adapted : loosened;
}

/**
 * Select Type ▸: `choice` is `AUTOMATIC` (null) or an instance index. An instance turns Automatic off and a wire it
 * does not take breaks (the core says why); Automatic runs again at once.
 */
export function setType(g, nodeId, choice, cat, placeOfTerminal) {
  const after = Gr.fijarConfig(g, nodeId, { instance: choice });
  return settlePolymorphicNodes(g, after, cat, placeOfTerminal, { forceLoosening: true });
}

/**
 * The commands of the node's menu that are done here: Select Type ▸ rows and Polymorphic OVI Selector. Returns
 * the new graph, or null when the row is not one of these.
 */
export function menuCommand(g, nodeId, rowId, cat, placeOfTerminal) {
  if (rowId === SELECTOR_ROW) {
    const node = g.nodos.find((candidate) => candidate.id === nodeId);
    return Gr.fijarConfig(g, nodeId, { selector: !node.config?.selector });
  }
  const chosen = choiceOfRow(rowId);
  return chosen ? setType(g, nodeId, chosen.choice, cat, placeOfTerminal) : null;
}
