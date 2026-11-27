// The right-click menus of the string objects: the String Constant, the String Control and Indicator on the panel and
// their terminals (labview-captures/reports/2026-11-27-string-menus.md; local evidence, never committed). Their built
// rows are the display styles, Normal and '\' Codes (DT-110); the rest is greyed with its reason (DT-035).

import * as Gr from "../../../core/model/graph.mjs";
import { DISPLAY, displayOf } from "../../../core/model/backslash-codes.mjs";

export const CONSTANT_MENU = "context.string-constant";
const PANEL_MENUS = { "str-control": "context.string-control", "str-indicator": "context.string-indicator" };
const TERMINAL_MENUS = { "str-control": "context.string-control-terminal", "str-indicator": "context.string-indicator-terminal" };
const DISPLAY_MENUS = new Set([CONSTANT_MENU, ...Object.values(PANEL_MENUS)]);

/** The menu of a string object on the panel, or null when it is not one. */
export const panelMenuRoot = (node) => PANEL_MENUS[node?.tipo] ?? null;

/** The menu of a string control's or indicator's terminal on the diagram, or of a String Constant; null otherwise. */
export const diagramMenuRoot = (node) => (node?.tipo === "str-const" ? CONSTANT_MENU : TERMINAL_MENUS[node?.tipo] ?? null);

/** The display rows each menu ticks: Normal Display or '\' Codes Display, a radio group (measured, §5). */
const DISPLAY_ROWS = { [DISPLAY.normal]: "normal-display", [DISPLAY.codes]: "codes-display" };
const ROW_DISPLAY = Object.fromEntries(Object.entries(DISPLAY_ROWS).map(([display, row]) => [row, display]));

/**
 * The rows ticked by default in each menu (measured, §1, §2 and §4): Enable Wrapping, Caption and Text Overflow, the
 * System Encoding, the control's Allow Dropping and Enabled, the constant's Size To Text and Left Justify Text.
 */
const DEFAULT_MARKS = {
  "context.string-control": ["visible-items.caption", "visible-items.text-overflow", "advanced.allow-dropping", "representation.system-encoding", "enable-wrapping"],
  "context.string-indicator": ["visible-items.caption", "visible-items.text-overflow", "representation.system-encoding", "enable-wrapping"],
  [CONSTANT_MENU]: ["visible-items.text-overflow", "representation.system-encoding", "size-to-text", "left-justify-text", "enable-wrapping"],
  "context.string-control-terminal": ["visible-items.label"],
  "context.string-indicator-terminal": ["visible-items.label"],
};

/** The ticked rows of a string object's menu, with the root's prefix. */
export function menuMarks(root, node) {
  const rows = [...(DEFAULT_MARKS[root] ?? [])];
  if (DISPLAY_MENUS.has(root)) rows.push(DISPLAY_ROWS[displayOf(node?.config)]);
  return rows.map((row) => `${root}.${row}`);
}

/** A display row picked: the object shows its value in that style; the value itself never changes (DT-110). */
export function menuCommand(d, id) {
  const root = d.menu?.raiz;
  if (!DISPLAY_MENUS.has(root)) return null;
  const display = ROW_DISPLAY[id.slice(root.length + 1)];
  if (!display) return null;
  const node = d.g.nodos.find((candidate) => candidate.id === d.menu.nodo);
  const g = displayOf(node?.config) === display ? d.g : Gr.fijarConfig(d.g, node.id, { display: display === DISPLAY.codes ? DISPLAY.codes : undefined });
  return { ...d, g, menu: null };
}
