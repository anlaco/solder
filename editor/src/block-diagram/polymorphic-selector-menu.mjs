// The rows of the menus that choose a polymorphic OVI's instance (DT-074): Select Type ▸ on the node's menu and the
// dropdown its selector ring opens. Both show the same tree (core/model/polymorphic-menu.mjs), as the right-click
// menus draw submenus: rows with an id, `submenus` by parent id, and the ids to tick. Measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-15-poly-selector.md). Pure.

import { isAutomatic, selectedInstance } from "../../../core/model/polymorphic.mjs";
import { selectorMenu } from "../../../core/model/polymorphic-menu.mjs";

/** What a click on Automatic chooses; an instance is its index. */
export const AUTOMATIC = null;

const AUTOMATIC_SUFFIX = ".automatic";
const INSTANCE_PART = "instance-";
const SUBMENU_PART = "submenu-";
const INSTANCE_ID_PATTERN = new RegExp(`\\.${INSTANCE_PART}(\\d+)$`);

/** The id of the row of `row` (the `position`th of its menu) in the menu `parentId`. */
function rowId(parentId, row, position) {
  if (row.children) return `${parentId}.${SUBMENU_PART}${position}`;
  return row.automatic ? `${parentId}${AUTOMATIC_SUFFIX}` : `${parentId}.${INSTANCE_PART}${row.instance}`;
}

/**
 * Fills `submenus` (by parent id) and `marks` with the menu `rows` under `parentId`. A separator becomes `separado` on
 * the row after it, and one with no row after it (or before it) is not drawn; that is what a name like "A::C" leaves
 * in a submenu, which LabVIEW draws as a separator line alone (seen), so the submenu here is empty (unverified).
 */
function addRows(parentId, rows, submenus, marks) {
  const entries = [];
  let separate = false;
  rows.forEach((row, position) => {
    if (row.separator) {
      separate = true;
      return;
    }
    const id = rowId(parentId, row, position);
    entries.push({ id, etiqueta: row.label, estado: "built", ...(separate && entries.length ? { separado: true } : {}) });
    separate = false;
    if (row.checked) marks.add(id);
    if (row.children) addRows(id, row.children, submenus, marks);
  });
  submenus.set(parentId, entries);
}

/**
 * The menu of `node`'s polymorphic OVI under `parentId`: `{ submenus, marks }`. Automatic and its separator come only
 * when the OVI adapts to the data type; the ticks are Automatic while it is on, otherwise the rows along the path to
 * the instance the node calls (measured).
 */
export function selectorMenuRows(node, polymorphic, parentId) {
  const rows = selectorMenu(polymorphic, { automatic: isAutomatic(node, polymorphic), instance: selectedInstance(node, polymorphic) });
  const submenus = new Map();
  const marks = new Set();
  addRows(parentId, rows, submenus, marks);
  return { submenus, marks };
}

/** The choice a row id stands for: `{ choice }` (`AUTOMATIC`, or the instance's index), or null when it is not one of these rows. */
export function choiceOfRow(rowIdText) {
  if (rowIdText.endsWith(AUTOMATIC_SUFFIX)) return { choice: AUTOMATIC };
  const index = INSTANCE_ID_PATTERN.exec(rowIdText)?.[1];
  return index === undefined ? null : { choice: Number(index) };
}
