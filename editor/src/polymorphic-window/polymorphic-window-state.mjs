// The Polymorphic OVI window (DT-074 §5): what it holds and how each button changes it. Measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-05-polymorphic-window.md). Pure: the page only turns DOM events into these calls,
// so the list, the buttons and the dialog are tested without a browser.
//
// The state maps onto core/model/polymorphic.mjs: `fromText` reads a `.sdp`, `toText` writes one. An instance keeps the
// names as the user typed them: an empty name means "the default" and stores nothing in the file (a menu name left out is
// the instance's file name, a selector name left out is the menu name), and it goes on following its default when the
// other name changes.

import { DRAW_ICON, emptyPolymorphic, readPolymorphic, writePolymorphic } from "../../../core/model/polymorphic.mjs";
import { SELECTOR_LINE_HEIGHT, SELECTOR_LINE_SEPARATOR, selectorLines } from "../../../core/model/polymorphic-menu.mjs";
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
    listScroll: 0,
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

/**
 * The height of the row of `instance`: 18 px, and 15 more for each further line of its selector name (measured: about
 * 33 px for two lines).
 */
export const rowHeightOf = (instance, singleLineHeight) => singleLineHeight + (selectorLines(instance.selectorName).length - 1) * SELECTOR_LINE_HEIGHT;

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

// ——— Scrolling the list ———

/**
 * The list's box (measured: 418 x 145, header 17 px, rows 18 px; polymorphic-window.md). It holds seven rows below
 * its header; more than that scroll, as LabVIEW's listboxes do (S15-#1: with six or more instances the later rows
 * were out of reach). The 1 px border is the box's measured edge, taken off the room the rows have.
 */
export const LIST_BOX = Object.freeze({ height: 145, border: 1, headerHeight: 17, rowHeight: 18 });

/** The room the rows have, under the header and inside the border. */
const rowsViewportHeight = () => LIST_BOX.height - 2 * LIST_BOX.border - LIST_BOX.headerHeight;

/** The y of the top of each row inside the rows' area (not scrolled), and the height all of them take. */
function rowLayout(state) {
  let top = 0;
  const tops = state.instances.map((instance) => {
    const rowTop = top;
    top += rowHeightOf(instance, LIST_BOX.rowHeight);
    return rowTop;
  });
  return { tops, total: top };
}

/** The most the list scrolls: what its rows take beyond the room they have. */
export const maxListScroll = (state) => Math.max(0, rowLayout(state).total - rowsViewportHeight());

const clampScroll = (state, scroll) => Math.max(0, Math.min(maxListScroll(state), scroll));

/** The list scrolled by `deltaY` px (the mouse wheel), kept between its first row and its last. */
export const scrollList = (state, deltaY) => ({ ...state, listScroll: clampScroll(state, state.listScroll + deltaY) });

/** The list scrolled just enough for the selected row to be seen (after Add, Move, Remove or a click), and never past its end. */
export function keepSelectionInView(state) {
  const clamped = clampScroll(state, state.listScroll);
  if (state.selected === null) return { ...state, listScroll: clamped };
  const top = rowLayout(state).tops[state.selected];
  const bottom = top + rowHeightOf(state.instances[state.selected], LIST_BOX.rowHeight);
  const scroll = top < clamped ? top : bottom > clamped + rowsViewportHeight() ? bottom - rowsViewportHeight() : clamped;
  return { ...state, listScroll: clampScroll(state, scroll) };
}

/** The thumb never gets shorter than this, so that it can still be seen (unmeasured; the Edit Items list's). */
const MIN_THUMB_HEIGHT = 12;

/**
 * The thumb of the scrollbar, `{ top, height }` in px from the top of the rows' area, or `null` while every row fits. Its
 * width and look are unmeasured (LabVIEW's listbox was not captured with an overflowing list): the Edit Items list's.
 */
export function listThumb(state) {
  const { total } = rowLayout(state);
  const viewport = rowsViewportHeight();
  if (total <= viewport) return null;
  const height = Math.max(MIN_THUMB_HEIGHT, (viewport * viewport) / total);
  return { top: (state.listScroll / maxListScroll(state)) * (viewport - height), height };
}

export const select = (state, index) => (index === null || (index >= 0 && index < state.instances.length) ? keepSelectionInView({ ...state, selected: index }) : state);

/**
 * Add...: the instance is appended with empty names and selected (measured). `storedPath` is what the `.sdp` stores for it:
 * relative to the `.sdp`, or `<ovilib>/...`. Whether the same OVI may be added twice was not measured: it is allowed.
 */
export const addInstance = (state, storedPath) =>
  keepSelectionInView({
    ...state,
    instances: [...state.instances, { path: storedPath, menuName: "", selectorName: "" }],
    selected: state.instances.length,
  });

/** Remove: takes the selected row out. Which row is selected afterwards was not measured: none. */
export function removeSelected(state) {
  if (!buttonStates(state).remove) return state;
  return keepSelectionInView({ ...state, instances: state.instances.filter((_, index) => index !== state.selected), selected: null });
}

/** The arrows move the selected row by one and it stays selected (measured). */
export function moveSelected(state, step) {
  const target = state.selected === null ? null : state.selected + step;
  if (target === null || target < 0 || target >= state.instances.length) return state;
  const instances = [...state.instances];
  [instances[state.selected], instances[target]] = [instances[target], instances[state.selected]];
  return keepSelectionInView({ ...state, instances, selected: target });
}

// ——— Edit Name... ———

/**
 * What takes the keyboard in the "Edit Instance Name" dialog, in Tab order and wrapping (measured:
 * labview-captures/reports/2026-11-15-editing-small.md Q1).
 */
export const NAME_DIALOG_FOCUS_ORDER = Object.freeze(["menuName", "selectorName", "ok", "cancel", "help"]);
const TEXT_FIELDS = Object.freeze(["menuName", "selectorName"]);
const isTextField = (focus) => TEXT_FIELDS.includes(focus);

/**
 * The dialog "Edit Instance Name", opened over the selected row and filled with what it has. Measured: with or without
 * text, nothing is selected and the caret is at the start of Menu Name. `caret` is an offset into the focused field and
 * `selected` says its whole text is selected (typing replaces it), as after entering a field by Tab.
 */
export function openNameDialog(state) {
  if (!buttonStates(state).editName) return state;
  const { menuName, selectorName } = state.instances[state.selected];
  return { ...state, nameDialog: { index: state.selected, menuName, selectorName, focus: "menuName", caret: 0, selected: false } };
}

/** Sets a field's whole text (the caret goes to its end, nothing selected). */
export const typeInNameDialog = (state, field, text) =>
  state.nameDialog ? { ...state, nameDialog: { ...state.nameDialog, [field]: text, focus: field, caret: text.length, selected: false } } : state;

/** A click in a text field: it takes the keyboard with the caret at its end (where the click lands was not measured). */
export const focusNameDialogField = (state, field) =>
  state.nameDialog ? { ...state, nameDialog: { ...state.nameDialog, focus: field, caret: state.nameDialog[field].length, selected: false } } : state;

/** Tab (or Shift+Tab with `backwards`) moves the keyboard to the next control, wrapping; a text field it enters is all selected. */
export function moveNameDialogFocus(state, backwards = false) {
  const dialog = state.nameDialog;
  if (!dialog) return state;
  const count = NAME_DIALOG_FOCUS_ORDER.length;
  const focus = NAME_DIALOG_FOCUS_ORDER[(NAME_DIALOG_FOCUS_ORDER.indexOf(dialog.focus) + (backwards ? count - 1 : 1)) % count];
  const entersField = isTextField(focus);
  return { ...state, nameDialog: { ...dialog, focus, selected: entersField && dialog[focus].length > 0, caret: entersField ? dialog[focus].length : 0 } };
}

/** The text with `replacement` where the selection (all of it) or the caret is, and the caret after it. */
function insertAtCaret(dialog, replacement) {
  const field = dialog.focus;
  const [before, after] = dialog.selected ? ["", ""] : [dialog[field].slice(0, dialog.caret), dialog[field].slice(dialog.caret)];
  return { ...dialog, [field]: `${before}${replacement}${after}`, caret: before.length + replacement.length, selected: false };
}

const deleteBeforeCaret = (dialog) => {
  if (dialog.selected) return insertAtCaret(dialog, "");
  const field = dialog.focus;
  if (dialog.caret === 0) return dialog;
  return { ...dialog, [field]: dialog[field].slice(0, dialog.caret - 1) + dialog[field].slice(dialog.caret), caret: dialog.caret - 1 };
};

const moveCaret = (dialog, step) => ({ ...dialog, caret: Math.max(0, Math.min(dialog[dialog.focus].length, dialog.caret + step)), selected: false });

/** A key typed in the dialog: a printable character, Backspace or an arrow in the focused text field; nothing on a button. */
export function typeKeyInNameDialog(state, key) {
  const dialog = state.nameDialog;
  if (!dialog || !isTextField(dialog.focus)) return state;
  if (key === "Backspace") return { ...state, nameDialog: deleteBeforeCaret(dialog) };
  if (key === "ArrowLeft" || key === "ArrowRight") return { ...state, nameDialog: moveCaret(dialog, key === "ArrowLeft" ? -1 : 1) };
  return key.length === 1 ? { ...state, nameDialog: insertAtCaret(dialog, key) } : state;
}

/**
 * Enter (and Shift+Enter) in a text field types a line break and the dialog stays open, in Menu Name as in Selector Name
 * (measured, Q1; the field scrolls). On a focused button it presses it, as Space does. Returns the state with the dialog
 * still open, or closed when OK or Cancel was pressed.
 */
export function pressEnterInNameDialog(state) {
  const dialog = state.nameDialog;
  if (!dialog) return state;
  return isTextField(dialog.focus) ? { ...state, nameDialog: insertAtCaret(dialog, SELECTOR_LINE_SEPARATOR) } : pressFocusedNameDialogButton(state);
}

/** Space or Enter on the focused button. Help opens its explanation, which belongs to the page, so here it changes nothing. */
export function pressFocusedNameDialogButton(state) {
  const focus = state.nameDialog?.focus;
  if (focus === "ok") return acceptNameDialog(state);
  return focus === "cancel" ? cancelNameDialog(state) : state;
}

export const cancelNameDialog = (state) => ({ ...state, nameDialog: null });

/** OK: the names typed are the instance's; an empty one goes back to its default. */
export function acceptNameDialog(state) {
  const dialog = state.nameDialog;
  if (!dialog) return state;
  const instances = state.instances.map((instance, index) => (index === dialog.index ? { ...instance, menuName: dialog.menuName.trim(), selectorName: dialog.selectorName.trim() } : instance));
  return keepSelectionInView({ ...state, instances, nameDialog: null });
}

// ——— The options and the icon ———

export const setDrawIcon = (state, drawIcon) => (Object.values(DRAW_ICON).includes(drawIcon) ? { ...state, drawIcon } : state);
export const toggleShowSelectorByDefault = (state) => ({ ...state, showSelectorByDefault: !state.showSelectorByDefault });
export const toggleAdaptToDataType = (state) => ({ ...state, adaptToDataType: !state.adaptToDataType });

/** Edit Icon...: the icon is the SVG document chosen (a Solder deviation until there is an icon editor); anything else is refused. */
export const setIcon = (state, iconText) => (isIconDocument(iconText) ? { ...state, icon: iconText } : state);

// ——— The menu bar ———

/** What each built row of the window's File menu does, by the last segment of its id; the page runs it through window.solder. */
export const MENU_COMMANDS = Object.freeze({ "new-vi": "newOvi", new: "newDialog", "create-project": "createProject", "open-project": "openProject", open: "open", close: "close", save: "save", "save-as": "saveAs", exit: "exit" });
