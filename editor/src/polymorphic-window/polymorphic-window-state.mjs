// The Polymorphic OVI window (DT-074 §5): what it holds and how each button changes it. Measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-05-polymorphic-window.md). Pure: the page only turns DOM events into these calls,
// so the list, the buttons and the dialog are tested without a browser.
//
// The state maps onto core/model/polymorphic.mjs: `fromText` reads a `.sdp`, `toText` writes one. An instance keeps the
// names as the user typed them: an empty name means "the default" and stores nothing in the file (a menu name left out is
// the instance's file name, a selector name left out is the menu name), and it goes on following its default when the
// other name changes.

import { DRAW_ICON, emptyPolymorphic, readPolymorphic, writePolymorphic } from "../../../core/model/polymorphic.mjs";
import { inicial as windowState } from "../window/window-state.mjs";

export { DRAW_ICON };

/** The largest icon document the window takes: the icon is kept in the `.sdp`, which is one small file. */
export const MAX_ICON_TEXT_LENGTH = 64 * 1024;

/** The text of an icon the window accepts: an SVG document of a reasonable size (it is drawn as an image, so nothing in it runs). */
export const isIconDocument = (text) => typeof text === "string" && text.length <= MAX_ICON_TEXT_LENGTH && /<svg[\s>]/i.test(text);

/** The menu name an instance has when none is typed: the one `readPolymorphic` gives it (its file name without extension). */
const defaultMenuName = (path) => readPolymorphic({ "solder-polymorphic": 1, instances: [{ ovi: path }] }).instances[0].menuName;

/** An instance as the window keeps it: the names are what was typed, empty for the default. */
const rawInstance = ({ path, menuName, selectorName }) => ({
  path,
  menuName: menuName === defaultMenuName(path) ? "" : menuName,
  selectorName: selectorName === menuName ? "" : selectorName,
});

const menuNameOf = (instance) => instance.menuName || defaultMenuName(instance.path);

/** The instance as the core reads it, defaults filled in. */
const resolvedInstance = (instance) => ({ path: instance.path, menuName: menuNameOf(instance), selectorName: instance.selectorName || menuNameOf(instance) });

function fromPolymorphic(polymorphic) {
  return {
    instances: polymorphic.instances.map(rawInstance),
    showSelectorByDefault: polymorphic.showSelectorByDefault,
    adaptToDataType: polymorphic.adaptToDataType,
    drawIcon: polymorphic.drawIcon,
    icon: polymorphic.icon,
    selected: null,
    nameDialog: null,
    ...windowState(),
  };
}

/** A new polymorphic OVI: no instances, the options as LabVIEW opens them (measured: Draw Polymorphic Icon, selector off, adapt on). */
export const emptyState = () => fromPolymorphic(emptyPolymorphic());

/** The window for the text of a `.sdp`; throws `PolymorphicFileError` when it cannot be read. */
export const fromText = (text) => fromPolymorphic(readPolymorphic(text));

/** The text the window would save. */
export const toText = (state) =>
  writePolymorphic({
    instances: state.instances.map(resolvedInstance),
    showSelectorByDefault: state.showSelectorByDefault,
    adaptToDataType: state.adaptToDataType,
    drawIcon: state.drawIcon,
    icon: state.icon,
  });

// ——— The list ———

/** The file name of an instance as the list shows it: with its extension (measured). */
export const instanceFileName = (instance) => instance.path.replaceAll("\\", "/").split("/").pop();

/** The three cells of a row: the file name, the menu name and the selector name, the last two empty when left to their defaults (measured). */
export const rowCells = (instance) => [instanceFileName(instance), instance.menuName, instance.selectorName];

/** Is the empty-list marker shown? (measured: until an instance is added.) */
export const showsEmptyMarker = (state) => state.instances.length === 0;

/** Which buttons are enabled (measured: Remove and Edit Name... need a row, and the arrows stop at the ends of the list). */
export function buttonStates(state) {
  const { selected } = state;
  const hasRow = selected !== null;
  return {
    moveUp: hasRow && selected > 0,
    moveDown: hasRow && selected < state.instances.length - 1,
    remove: hasRow,
    editName: hasRow,
  };
}

export const select = (state, index) => (index === null || (index >= 0 && index < state.instances.length) ? { ...state, selected: index } : state);

/**
 * Add...: the instance is appended with empty names and selected (measured). `storedPath` is what the `.sdp` stores for it:
 * relative to the `.sdp`, or `<ovilib>/...`. Whether the same OVI may be added twice was not measured: it is allowed.
 */
export const addInstance = (state, storedPath) => ({
  ...state,
  instances: [...state.instances, { path: storedPath, menuName: "", selectorName: "" }],
  selected: state.instances.length,
});

/** Remove: takes the selected row out. Which row is selected afterwards was not measured: none. */
export function removeSelected(state) {
  if (!buttonStates(state).remove) return state;
  return { ...state, instances: state.instances.filter((_, index) => index !== state.selected), selected: null };
}

/** The arrows move the selected row by one and it stays selected (measured). */
export function moveSelected(state, step) {
  const target = state.selected === null ? null : state.selected + step;
  if (target === null || target < 0 || target >= state.instances.length) return state;
  const instances = [...state.instances];
  [instances[state.selected], instances[target]] = [instances[target], instances[state.selected]];
  return { ...state, instances, selected: target };
}

// ——— Edit Name... ———

/** The dialog "Edit Instance Name": two fields, opened over the selected row and filled with what it has. */
export function openNameDialog(state) {
  if (!buttonStates(state).editName) return state;
  const { menuName, selectorName } = state.instances[state.selected];
  return { ...state, nameDialog: { index: state.selected, menuName, selectorName, focus: "menuName" } };
}

export const typeInNameDialog = (state, field, text) => (state.nameDialog ? { ...state, nameDialog: { ...state.nameDialog, [field]: text, focus: field } } : state);

export const cancelNameDialog = (state) => ({ ...state, nameDialog: null });

/** OK: the names typed are the instance's; an empty one goes back to its default. */
export function acceptNameDialog(state) {
  const dialog = state.nameDialog;
  if (!dialog) return state;
  const instances = state.instances.map((instance, index) => (index === dialog.index ? { ...instance, menuName: dialog.menuName.trim(), selectorName: dialog.selectorName.trim() } : instance));
  return { ...state, instances, nameDialog: null };
}

// ——— The options and the icon ———

export const setDrawIcon = (state, drawIcon) => (Object.values(DRAW_ICON).includes(drawIcon) ? { ...state, drawIcon } : state);
export const toggleShowSelectorByDefault = (state) => ({ ...state, showSelectorByDefault: !state.showSelectorByDefault });
export const toggleAdaptToDataType = (state) => ({ ...state, adaptToDataType: !state.adaptToDataType });

/** Edit Icon...: the icon is the SVG document chosen (a Solder deviation until there is an icon editor); anything else is refused. */
export const setIcon = (state, iconText) => (isIconDocument(iconText) ? { ...state, icon: iconText } : state);

// ——— The menu bar ———

/** What each built row of the window's File menu does, by the last segment of its id; the page runs it through window.solder. */
export const MENU_COMMANDS = Object.freeze({ "new-vi": "newOvi", new: "newDialog", open: "open", close: "close", save: "save", "save-as": "saveAs", exit: "exit" });

/** The keys that type into a field of the name dialog: one printable character, or Backspace. */
export function typedText(text, key) {
  if (key === "Backspace") return text.slice(0, -1);
  return key.length === 1 ? text + key : text;
}
