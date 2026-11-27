// The right-click menu of the Feedback Node (DT-109), its rows in LabVIEW's order (reports/2026-11-26-feedback-node-behavior.md
// Q10, "Node menu") and the capture labview-captures/feedback-node-look/menu2c.png, a String node outside any loop: Visible
// Items, Help, Examples, Description and Tip..., a separator, Add Breakpoint, a separator, Structures Palette, the palette of the
// node's type (String Palette there), Create, a separator, Show Enable Terminal, Globally Initialize (ticked), Move Initializer One
// Loop Out and In (greyed there), Change Direction, Appearance, a separator, Replace with Shift Register (greyed there), a separator,
// Remove and Rewire, a separator, Properties; Show Initializer comes only while the initializer is hidden. The rows are the
// inventory's (`context.feedback-node.*`); this module says which are greyed, renamed or ticked and what the done ones do.
//
// Not measured: what Appearance holds, whether Show Enable Terminal is ticked when it is on (it is here), the names of the type
// palettes other than String's and Numeric's, and whether Show Initializer exists at all in Solder (it is never shown: the
// initializer is never hidden here).

import * as Gr from "../../../core/model/graph.mjs";
import * as FD from "./feedback-node-dialog.mjs";
import {
  canMoveInitializerIn, canMoveInitializerOut, enableIsWired, flippedDirection, initializerMovedIn, initializerMovedOut, toggledShowEnable,
} from "./feedback-node-edits.mjs";
import { MENU_ROOT, feedbackConfig, isFeedbackNode } from "./feedback-node-geometry.mjs";
import { canReplaceWithShiftRegister, replacedWithFeedbackNode, replacedWithShiftRegister } from "./feedback-node-replace.mjs";

const row = (name) => `${MENU_ROOT}.${name}`;

export const isFeedbackMenu = (root) => root === MENU_ROOT;

/** The shift register's row that swaps it for a Feedback Node (`context.shift-register`, reports/2026-11-26-feedback-node-insert.md Q4). */
export const SHIFT_REGISTER_ROW = "context.shift-register.replace-with-feedback-node";

/**
 * The rows the menu greys by what the node is: Move Initializer One Loop Out with no loop left, In with the initializer on the node,
 * and Replace with Shift Register outside any loop (measured, insert report Q5 c).
 */
export function menuVariants(d, ctx) {
  const node = d.g.nodos.find((candidate) => candidate.id === d.menu.nodo);
  const greyed = [];
  if (!canMoveInitializerOut(d.g, node)) greyed.push(row("move-initializer-one-loop-out"));
  if (!canMoveInitializerIn(node)) greyed.push(row("move-initializer-one-loop-in"));
  if (!canReplaceWithShiftRegister(d.g, node)) greyed.push(row("replace-with-shift-register"));
  return { desactivados: new Set(greyed), ocultos: new Set([row("show-initializer")]), rotulos: new Map([[row("type-palette"), typePaletteLabel(d, ctx, node)]]) };
}

/** The palette row is named after the type of the node: String Palette (measured), Boolean Palette (unverified), Numeric Palette otherwise. */
const TYPE_PALETTE_LABELS = new Map([["string", "String Palette"], ["boolean", "Boolean Palette"]]);
function typePaletteLabel(d, ctx, node) {
  const type = ctx && Gr.tipos(d.g, ctx.cat).salidas.get(`${node.id}.output`);
  return TYPE_PALETTE_LABELS.get(type) ?? "Numeric Palette";
}

/**
 * The rows that carry a tick: Globally Initialize (seen ticked on the row itself) with Initialize On First Call inside it, always
 * (what a node dropped from the palette does, and the only initialization that is built), and Show Enable Terminal while the terminal shows.
 */
export function menuMarks(node) {
  const marks = [row("globally-initialize"), row("globally-initialize.initialize-on-first-call")];
  if (feedbackConfig(node).showEnable) marks.push(row("show-enable-terminal"));
  return new Set(marks);
}

/**
 * What the row `id` of the open menu does, as the new state; `null` when the row is not one of this module's. `repair` is the editor's
 * repair of a changed graph, which the swaps with a shift register need (tunnels on the loops they cross, the registers' borders).
 */
export function menuCommand(d, id, ctx, repair) {
  const node = d.menu && d.g.nodos.find((candidate) => candidate.id === d.menu.nodo);
  if (!isFeedbackNode(node) || !id.startsWith(`${MENU_ROOT}.`)) return null;
  const closed = (g) => ({ ...d, g, menu: null });
  switch (id.slice(MENU_ROOT.length + 1)) {
    case "show-enable-terminal":
      return showEnableCommand(d, node);
    case "change-direction":
      return closed(flippedDirection(d.g, node.id));
    case "move-initializer-one-loop-out":
      return closed(initializerMovedOut(d.g, node.id));
    case "move-initializer-one-loop-in":
      return closed(initializerMovedIn(d.g, node.id));
    case "globally-initialize.initialize-on-first-call":
      return closed(d.g);
    case "replace-with-shift-register":
      return canReplaceWithShiftRegister(d.g, node) ? { ...closed(replacedWithShiftRegister(d.g, ctx, node.id, repair)), seleccion: [] } : null;
    case "properties":
      return { ...d, menu: null, accion: null, edicion: null, seleccion: [node.id], feedbackDialog: FD.open(node) };
    default:
      return null;
  }
}

/** Show Enable Terminal turns the terminal on and off; it does not go away under a wire, so a wired one stays and says so. */
function showEnableCommand(d, node) {
  if (feedbackConfig(node).showEnable && enableIsWired(d.g, node.id)) {
    return { ...d, menu: null, aviso: { texto: "The enable terminal is wired.", x: d.menu.x, y: d.menu.y } };
  }
  return { ...d, g: toggledShowEnable(d.g, node.id), menu: null };
}

/** Replace with Feedback Node on a shift register's menu: the whole pair becomes one node; `null` when `id` is another row. */
export function shiftRegisterCommand(d, id, ctx, repair) {
  if (id !== SHIFT_REGISTER_ROW || !d.menu) return null;
  return { ...d, g: replacedWithFeedbackNode(d.g, ctx, d.menu.nodo, repair), menu: null, seleccion: [] };
}
