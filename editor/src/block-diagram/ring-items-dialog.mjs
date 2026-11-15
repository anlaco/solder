// Edit Items… of a ring (DT-091): the enum's tab (edit-items-dialog.mjs) with the Values column that a ring's values
// need. The window is the enum's plus the "Sequential values" checkbox, an editable Values column and the warning
// that greys OK while two items share a value. It serves the Text Ring, the Menu Ring and the Ring Constant.
//
// Pure, with the same interface as the enum's (`open`, `key`, `click`, `apply`, `view`), so that modal-dialog.mjs routes
// it by the dialog's state (`ring: true`). Measured in LabVIEW 2026 Q3: labview-captures/reports/2026-11-15-rings.md §1.

import * as Gr from "../../../core/model/graph.mjs";
import { hasDuplicateValues, ringItems, typedRingValue } from "../../../core/model/ring.mjs";
import { isRingConstant, ringType } from "../common/ring-editing.mjs";
import { DIALOG_ID, LAYOUT, bottomHtml, buttonsHtml, checkboxHtml, esc, px, revealed, scrollbarHtml, tabsHtml, wheel } from "./edit-items-dialog.mjs";

export { wheel };

/** Where the new parts sit; the rest is the enum's layout. Unverified: the report gives no pixels for them. */
const SEQUENTIAL_CHECKBOX = { x: 36, y: 84 };
const WARNING = { x: 36, y: 308 };

/**
 * The Values column, in px from the list's left edge: wide enough for the whole of an I32 such as -2147483648 (11
 * characters, about 70 px) and a float's digits. The column's width is unmeasured (the capture shows the values, not
 * the column's edges); the enum's 13 px column cannot hold more than one digit.
 */
const VALUES_COLUMN = { width: 110, textPadding: 6 };
const valuesDivider = () => LAYOUT.list.w - VALUES_COLUMN.width;

/** The warning when two items have one value. Our own words (NI's text is not copied). */
export const DUPLICATE_WARNING = "Two items have the same value. Give each item a value of its own, or delete one of them.";

/** Characters a value being typed may hold: the digits, the sign, the point and the exponent of a float. */
const VALUE_CHARACTERS = /^[0-9.+\-eE]$/;

const rowsOf = (items) => items.map((item) => ({ texto: item.text, valor: item.value }));

/**
 * The items the dialog holds. A blank row (`blank`: made by Enter and not yet given a text or a value) is the edit row
 * LabVIEW keeps at the end of the list, not an item (rings report §1): it is neither saved nor checked for duplicate
 * values. A ring keeps at least one item, as a freshly placed one has (an empty one).
 */
function itemsOf(dialog) {
  const items = dialog.filas.filter((row) => !row.blank).map((row) => ({ text: row.texto, value: row.valor }));
  return items.length > 0 ? items : [{ text: "", value: 0 }];
}

/** The dialog for a ring node. "Sequential values" starts ticked when the values are 0, 1, 2… by position (measured). */
export function open(node) {
  const items = ringItems(node.config);
  const value = isRingConstant(node) ? node.config?.value ?? 0 : node.currentValue ?? node.config?.value ?? 0;
  const chosen = Math.max(0, items.findIndex((item) => item.value === value));
  const label = node.label?.text ?? "Ring";
  return revealed({
    ring: true,
    nodo: node.id,
    // Measured: "Ring Properties: Ring (Ring)" and "Ring Constant Properties"; what the part in brackets is, was not.
    titulo: isRingConstant(node) ? "Ring Constant Properties" : `Ring Properties: ${label} (${label})`,
    type: ringType(node),
    filas: rowsOf(items),
    elegida: chosen,
    edicion: null,
    listFocused: false,
    scroll: 0,
    sequential: items.every((item, index) => item.value === index),
    allowUndefined: !!node.config?.["allow-undefined"],
    // Measured: enabled on the controls, greyed on the constant (its menu row works instead).
    canAllowUndefined: !isRingConstant(node),
  });
}

/** Is OK allowed? Not while two items share a value (measured: the warning appears and OK is greyed; Cancel works). */
export const duplicateValues = (dialog) => hasDuplicateValues(itemsOf(dialog));

/** With "Sequential values" the values follow the positions; unticked they are the user's. */
function renumbered(dialog) {
  if (!dialog.sequential) return dialog;
  let position = 0;
  return { ...dialog, filas: dialog.filas.map((row) => (row.blank ? row : { ...row, valor: position++ })) };
}

const withRow = (dialog, index, changes) => ({ ...dialog, filas: dialog.filas.map((row, k) => (k === index ? { ...row, ...changes } : row)) });

/** What was being typed goes into its row: a text as it is; a value as the representation takes it (a typed -1 on U16 gives 0, measured). */
function commit(dialog) {
  const { edicion } = dialog;
  if (!edicion) return dialog;
  const closed = { ...dialog, edicion: null };
  // A text typed makes the blank row an item; one left empty stays the edit row.
  if (edicion.columna === "text") return withRow(closed, edicion.fila, { texto: edicion.texto, ...(edicion.texto !== "" && { blank: false }) });
  const typed = Number(edicion.texto);
  return edicion.texto.trim() === "" || Number.isNaN(typed) ? closed : withRow(closed, edicion.fila, { valor: typedRingValue(typed, dialog.type), blank: false });
}

const startEditing = (dialog, row, column) => ({
  ...dialog,
  elegida: row,
  edicion: { fila: row, columna: column, texto: column === "text" ? dialog.filas[row].texto : String(dialog.filas[row].valor), todo: true },
  listFocused: true,
});

/** A new empty item at `index`, with the value 0 (measured: Insert gives 0 and leaves the other values alone); ticked, the rows are renumbered. */
function insertAt(dialog, index, blank = false) {
  const base = commit(dialog);
  const filas = [...base.filas.slice(0, index), { texto: "", valor: 0, blank }, ...base.filas.slice(index)];
  return renumbered({ ...base, filas });
}

/**
 * What Enter does after a row: commits it and opens an edit row below with the editor in it, as the enum's (measured,
 * enum report 5a). That row is `blank` until it gets a text or a value, so one Enter too many leaves no item behind
 * (rings report §1: the blank last row is not an item). Enter on a row that is itself still blank adds no other.
 */
function enterAfter(dialog, row) {
  const base = commit(dialog);
  if (base.filas[row]?.blank) return startEditing(base, row, "text");
  return startEditing(insertAt(base, row + 1, true), row + 1, "text");
}

/** A key typed into the cell being edited. Enter on an item's text commits it and opens a new row below, as the enum's; on a value it commits only. */
export function type(dialog, key) {
  const { edicion } = dialog;
  if (!edicion) return dialog;
  if (key === "Escape") return { ...dialog, edicion: null };
  if (key === "Enter") return edicion.columna === "text" ? enterAfter(dialog, edicion.fila) : commit(dialog);
  const base = edicion.todo ? "" : edicion.texto;
  if (key === "Backspace") return { ...dialog, edicion: { ...edicion, texto: edicion.todo ? "" : edicion.texto.slice(0, -1), todo: false } };
  const allowed = edicion.columna === "text" ? key.length === 1 : VALUE_CHARACTERS.test(key);
  return allowed ? { ...dialog, edicion: { ...edicion, texto: base + key, todo: false } } : dialog;
}

/** Delete: the last item is only emptied, so a ring never has none (the enum's rule; unverified on a ring). */
function deleteRow(dialog) {
  const base = commit(dialog);
  if (base.filas.length === 1) return { ...base, filas: [{ ...base.filas[0], texto: "" }] };
  const filas = base.filas.filter((_, k) => k !== base.elegida);
  return renumbered({ ...base, filas, elegida: Math.min(base.elegida, filas.length - 1) });
}

/** Move Up and Move Down: the item travels with its value; ticked, the values stay by position (measured). */
function moveRow(dialog, step) {
  const base = commit(dialog);
  const filas = [...base.filas];
  [filas[base.elegida], filas[base.elegida + step]] = [filas[base.elegida + step], filas[base.elegida]];
  return renumbered({ ...base, filas, elegida: base.elegida + step });
}

/**
 * Ticking "Sequential values" renumbers at once from 0 and loses the custom values; unticking keeps them and makes
 * them editable (measured).
 */
function toggleSequential(dialog) {
  const base = commit(dialog);
  return renumbered({ ...base, sequential: !base.sequential });
}

/**
 * A click on the row's cell. The first click on a row only selects it (measured for the Values cell); a second one on
 * its Values cell, when the values are editable, opens it. The same for the item's text, which is unmeasured: a click
 * on the cell of the selected row, or a double click, opens it.
 */
function clickCell(dialog, part, clicks) {
  const [, kind, number] = /^(row|value)-(\d+)$/.exec(part);
  const row = Number(number);
  const base = commit(dialog);
  if (kind === "row" && (clicks >= 2 || base.elegida === row)) return startEditing(base, row, "text");
  const opensValue = kind === "value" && !base.sequential && (base.elegida === row || clicks >= 2);
  return opensValue ? startEditing(base, row, "value") : { ...base, elegida: row, edicion: null, listFocused: true };
}

/** A click on a part of the dialog (`id`, from `data-id`; `clicks`, 2 for a double click). */
export function act(dialog, id, clicks = 1) {
  const part = id.slice(id.lastIndexOf(".") + 1);
  if (/^(row|value)-\d+$/.test(part)) return clickCell(dialog, part, clicks);
  if (part === "sequential-values") return toggleSequential(dialog);
  if (part === "allow-undefined") return dialog.canAllowUndefined ? { ...dialog, allowUndefined: !dialog.allowUndefined } : dialog;
  if (part === "insert") return startEditing(insertAt(dialog, dialog.elegida), dialog.elegida, "text");
  if (part === "delete" && enabled(dialog, "delete")) return deleteRow(dialog);
  if ((part === "move-up" || part === "move-down") && enabled(dialog, part)) return moveRow(dialog, part === "move-up" ? -1 : 1);
  return dialog;
}

/** When each button works: Move Up greyed on the first row and Move Down on the last (measured); Disable Item is not built. */
export function enabled(dialog, part) {
  if (part === "delete") return !(dialog.filas.length === 1 && dialog.filas[0].texto === "");
  if (part === "move-up") return dialog.elegida > 0;
  if (part === "move-down") return dialog.elegida < dialog.filas.length - 1;
  if (part === "disable-item") return false;
  return true;
}

/** What a key means, as the enum's dialog (edit-items-dialog.mjs `key`); Enter is OK only when OK is not greyed. */
export function key(dialog, event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (dialog.edicion) return { dialog: revealed(type(dialog, event.key)) };
  if (dialog.listFocused && event.key === "Enter") return { dialog: revealed(enterAfter(dialog, dialog.elegida)) };
  // Typing on a selected row edits its text, replacing it (unmeasured for rings; the enum's list ignores other keys, measured).
  if (dialog.listFocused && event.key.length === 1) return { dialog: type(startEditing(dialog, dialog.elegida, "text"), event.key) };
  if (dialog.listFocused && event.key !== "Escape") return { dialog };
  if (event.key === "Enter") return duplicateValues(dialog) ? null : { accept: true };
  return event.key === "Escape" ? { cancel: true } : null;
}

/** What a click on the part `id` means: OK writes the items (unless it is greyed), Cancel drops them, a greyed tab or Help explains, the rest edits. */
export function click(dialog, id, clicks = 1) {
  const part = id.slice(id.lastIndexOf(".") + 1);
  if (part === "ok") return duplicateValues(dialog) ? null : { accept: true };
  if (part === "cancel") return { cancel: true };
  if (part.startsWith("tab-") || part === "help") return { explain: true };
  return { dialog: revealed(act(dialog, id, clicks)) };
}

/** The VI with the items of the dialog. Allow undefined values is written only where the dialog lets it be changed (the controls). */
export function apply(graph, dialog) {
  const committed = commit(dialog);
  const withItems = Gr.fijarConfig(graph, committed.nodo, { items: itemsOf(committed) });
  return committed.canAllowUndefined ? Gr.fijarConfig(withItems, committed.nodo, { "allow-undefined": committed.allowUndefined }) : withItems;
}

function cell(dialog, row, k, column) {
  const editing = dialog.edicion?.fila === k && dialog.edicion.columna === column;
  const shown = column === "text" ? row.texto : row.blank ? "" : String(row.valor);
  if (!editing) return esc(shown);
  return dialog.edicion.todo ? `<span class="texto-elegido">${esc(dialog.edicion.texto)}</span>` : `<span>${esc(dialog.edicion.texto)}</span><span class="caret"></span>`;
}

/** The dialog, modal over the window: the enum's, with the checkbox of Sequential values, the editable values and the warning. */
export function view(inv, dialog) {
  const L = LAYOUT;
  const divider = valuesDivider();
  const scroll = dialog.scroll ?? 0;
  const rows = dialog.filas
    .map((row, k) => {
      const valueClass = dialog.sequential ? "celda valor" : "celda valor editable";
      // The Values cell takes the click over its whole width and height, not only over its digits.
      const valueCell = `<span class="${valueClass}" data-id="${DIALOG_ID}.value-${k}" style="left:${px(divider + 1)};width:${px(L.list.w - divider - 2)};height:${px(L.list.row)};padding-left:${px(VALUES_COLUMN.textPadding)}">${cell(dialog, row, k, "value")}</span>`;
      return `<div class="ficha-lista-fila${k === dialog.elegida ? " elegida" : ""}" data-id="${DIALOG_ID}.row-${k}" style="top:${px(k * L.list.row - scroll)};height:${px(L.list.row)}"><span class="celda" style="left:${px(L.headers.items - L.list.x)}">${cell(dialog, row, k, "text")}</span>${valueCell}</div>`;
    })
    .join("");
  const list = `<div class="ficha-lista-cabecera" style="top:${px(L.headers.y)}"><span style="left:${px(L.headers.items)}">Items</span><span style="left:${px(L.list.x + divider + VALUES_COLUMN.textPadding)}">Values</span></div>` +
    `<div class="ficha-lista" style="left:${px(L.list.x)};top:${px(L.list.y)};width:${px(L.list.w)};height:${px(L.list.h)}"><div class="ficha-lista-separador" style="left:${px(divider)}"></div>${rows}${scrollbarHtml(dialog)}</div>`;
  const duplicates = duplicateValues(dialog);
  const warning = duplicates ? `<div class="ficha-aviso" style="left:${px(WARNING.x)};top:${px(WARNING.y)}">${esc(DUPLICATE_WARNING)}</div>` : "";
  return `<div class="pv-velo"><div class="pv-dialogo dialogo-edit-items" data-dialogo="${DIALOG_ID}" style="width:${px(L.width)};height:${px(L.height)}"><div class="pv-titulo" style="height:${px(L.title.height)}">${esc(dialog.titulo)}</div>` +
    `${tabsHtml(inv)}${checkboxHtml(inv, "sequential-values", "Sequential values", { ticked: dialog.sequential, place: SEQUENTIAL_CHECKBOX })}${list}${buttonsHtml(inv, (part) => enabled(dialog, part))}` +
    `${checkboxHtml(inv, "allow-undefined", L.checkbox.label, { ticked: dialog.allowUndefined, greyed: !dialog.canAllowUndefined, place: L.checkbox })}${warning}${bottomHtml(inv, !duplicates)}</div></div>`;
}
