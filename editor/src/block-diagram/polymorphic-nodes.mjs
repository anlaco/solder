// The polymorphic OVI nodes of a diagram (DT-074): a subOVI node that calls a `.sdp`. What the editor needs besides
// what any subOVI node has: its icon, the selector ring under it, the menu with Select Type ▸, and keeping the
// instance Automatic picks up to date as the diagram changes. Measured in LabVIEW 2026 Q3 on VISA Configure Serial
// Port (labview-captures/reports/2026-11-05-polymorphic-vi.md). Pure, over the graph and the catalog view of the OVI.

import * as Gr from "../../../core/model/graph.mjs";
import { DRAW_ICON, isAutomatic, isPolymorphicNode, selectedInstance } from "../../../core/model/polymorphic.mjs";
import { PANE_SIZE } from "../../../core/model/connector.mjs";
import * as G from "../common/glyphs.mjs";

export { isPolymorphicNode };

// ——— The selector ring ———

/** The ring sits 1 px under the icon (measured). */
export const SELECTOR_GAP = 1;
/** The ring is 19 px tall; the shadow it casts adds 2 px to the node's bounds (measured: VISA's ring 188 x 19, bounds 190 x 54). */
export const SELECTOR_HEIGHT = 19;
export const SELECTOR_SHADOW = 2;
/**
 * What the ring adds to the width of its text: the margin, the gap and the dropdown triangle. Only the total was
 * measured (188 px for "VISA Configure Serial Port (Instr)"), so this share is unverified; the ring follows its text.
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
 * below it, as wide as its text. `measureText` is the width of a text in the font the editor draws.
 */
export function selectorRing(text, measureText) {
  const width = Math.ceil(measureText(text)) + SELECTOR_TEXT_PADDING;
  return { x: Math.floor((PANE_SIZE - width) / 2), y: PANE_SIZE + SELECTOR_GAP, ancho: width, alto: SELECTOR_HEIGHT };
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
export const AUTOMATIC_ROW = `${SELECT_TYPE_ROW}.automatic`;
export const SELECTOR_ROW = `${MENU_ROOT}.visible-items.polymorphic-ovi-selector`;
const INSTANCE_ROW_PREFIX = `${SELECT_TYPE_ROW}.instance-`;
export const instanceRow = (index) => `${INSTANCE_ROW_PREFIX}${index}`;

/** What a click on a row of Select Type ▸ (or of the ring's list) chooses for Automatic; an instance is its index. */
export const AUTOMATIC = null;

/** The rows of Select Type ▸ (measured): Automatic, a separator, then each instance's menu name in order. */
export function selectTypeRows(polymorphic) {
  return [
    { id: AUTOMATIC_ROW, etiqueta: "Automatic", estado: "built" },
    ...polymorphic.instances.map(({ menuName }, index) => ({ id: instanceRow(index), etiqueta: menuName, estado: "built", ...(index === 0 ? { separado: true } : {}) })),
  ];
}

/** The choice a row id stands for: `{ choice }` (null for Automatic, else the index), or null when it is not one of the rows. */
export function choiceOfRow(rowId) {
  if (rowId === AUTOMATIC_ROW) return { choice: AUTOMATIC };
  if (!rowId.startsWith(INSTANCE_ROW_PREFIX)) return null;
  const index = Number(rowId.slice(INSTANCE_ROW_PREFIX.length));
  return Number.isInteger(index) ? { choice: index } : null;
}

/**
 * Which rows of Select Type ▸ carry the tick (measured): with Automatic on only Automatic, whatever it picked; with
 * an instance picked by hand, that instance.
 */
export function tickedRows(node, polymorphic) {
  return [isAutomatic(node, polymorphic) ? AUTOMATIC_ROW : instanceRow(selectedInstance(node, polymorphic))];
}

/** The ids of the rows of the node's menu that carry a tick, besides the general ones (View As Icon, Terminals). */
export function menuMarks(node, cat) {
  const callee = cat.polymorphicOf?.(node);
  if (!callee) return [];
  return [...tickedRows(node, callee.polymorphic), ...(node.config?.selector ? [SELECTOR_ROW] : [])];
}

/**
 * What the polymorphic node's menu fills in: the rows of Select Type ▸ from the `.sdp`, and Automatic greyed when the
 * `.sdp` does not let the OVI adapt to the data type (DT-074 §1).
 */
export function menuVariants(node, cat) {
  const callee = cat.polymorphicOf?.(node);
  if (!callee) return {};
  const greyed = callee.polymorphic.adaptToDataType ? [] : [AUTOMATIC_ROW];
  return { desactivados: new Set(greyed), submenus: new Map([[SELECT_TYPE_ROW, selectTypeRows(callee.polymorphic)]]) };
}

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
