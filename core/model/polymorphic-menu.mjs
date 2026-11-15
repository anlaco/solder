// The menu of a polymorphic OVI's instances (DT-074), which both the selector ring's dropdown and Select Type ▸ show,
// and the lines of the selector ring. Measured in LabVIEW 2026 Q3 on DAQmx Read and on a polymorphic VI of our own
// (labview-captures/reports/2026-11-15-poly-selector.md). Pure.

/** The separator between the levels of a menu name: "Analog:Single Channel:Single Sample:DBL" (measured). */
export const MENU_LEVEL_SEPARATOR = ":";

/** The separator between the lines of a selector name: Enter in the Selector Name field types a line break (measured). */
export const SELECTOR_LINE_SEPARATOR = "\n";

/** A one-line ring is 19 px tall and each further line adds 15 (measured: two lines are 34 = 19 + 15). */
export const SELECTOR_LINE_HEIGHT = 15;
export const SELECTOR_ONE_LINE_HEIGHT = 19;

/** The lines a selector ring shows: its selector name split at its line breaks. */
export const selectorLines = (selectorName) => String(selectorName ?? "").split(SELECTOR_LINE_SEPARATOR);

/** The height of the ring for a selector name, its shadow apart. */
export const selectorHeight = (selectorName) => SELECTOR_ONE_LINE_HEIGHT + (selectorLines(selectorName).length - 1) * SELECTOR_LINE_HEIGHT;

/**
 * The levels of a menu name. A trailing ":" is dropped ("A:" is the plain row "A", seen). An empty level in the middle
 * ("A::C") gives a separator at that level and nothing after it (seen: "A ▸" holding only a separator); what LabVIEW
 * means by it is unverified. An empty menu name is unverified too; the row shows nothing.
 */
export function menuLevels(menuName) {
  const levels = String(menuName ?? "").split(MENU_LEVEL_SEPARATOR);
  while (levels.length > 1 && levels.at(-1) === "") levels.pop();
  const firstEmpty = levels.indexOf("", 1);
  return firstEmpty < 0 ? { levels, endsInSeparator: false } : { levels: levels.slice(0, firstEmpty), endsInSeparator: true };
}

/** The row named `label` among `rows`, a submenu, made at the end when there is none yet (rows keep the list's order). */
function submenuIn(rows, label) {
  let row = rows.find((candidate) => candidate.children && candidate.label === label);
  if (!row) {
    row = { label, children: [] };
    rows.push(row);
  }
  return row.children;
}

/** Places instance `index` in `rows` by its menu name. */
function placeInstance(rows, menuName, index) {
  const { levels, endsInSeparator } = menuLevels(menuName);
  const parents = endsInSeparator ? levels : levels.slice(0, -1);
  const deepest = parents.reduce(submenuIn, rows);
  deepest.push(endsInSeparator ? { separator: true, instance: index } : { label: levels.at(-1), instance: index });
}

/**
 * The tree the dropdown and Select Type ▸ show: rows of `{ label, instance }` (an instance to pick), `{ label,
 * children }` (a submenu, one per distinct level name, in the order of the list) and `{ separator }`. Every row is in
 * the order the instances are listed (measured: A ▸ B, C for "A:B", "A:C").
 */
export function instanceMenuTree(polymorphic) {
  const rows = [];
  polymorphic.instances.forEach((instance, index) => placeInstance(rows, instance.menuName, index));
  return rows;
}

/** Does `row` lead to instance `index`: the row itself, or a submenu holding it? */
export function leadsTo(row, index) {
  if (row.children) return row.children.some((child) => leadsTo(child, index));
  return !row.separator && row.instance === index;
}

/**
 * The rows of the menu at the top level, with the Automatic row and its separator first when the polymorphic OVI
 * adapts to the data type (measured: DAQmx Read, which does not adapt, has none). `checked` is set on Automatic while
 * the node is on it, otherwise on every row along the path to the instance it calls (measured).
 */
export function selectorMenu(polymorphic, { automatic, instance }) {
  const mark = (row) => {
    if (row.separator) return row;
    const checked = !automatic && leadsTo(row, instance);
    return row.children ? { ...row, checked, children: row.children.map(mark) } : { ...row, checked };
  };
  const instances = instanceMenuTree(polymorphic).map(mark);
  if (!polymorphic.adaptToDataType) return instances;
  return [{ label: "Automatic", automatic: true, checked: automatic }, { separator: true }, ...instances];
}
