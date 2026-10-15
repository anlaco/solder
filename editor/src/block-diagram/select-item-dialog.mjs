// Select Item…, the window an enum's right-click menu opens to choose its item by name
// (finding C5): a filter field over the list of items. It works the same for the enum
// constant, control and indicator.
//
// Pure, like edit-items-dialog.mjs: `open` builds it from the node, `key` and `click` turn
// what the user does into an intent, `apply` writes the chosen item into the VI and `view`
// draws it. Measured in LabVIEW 2026 Q3 (labview-captures/reports/2026-10-15-select-item.md).

import * as CV from "../../../core/model/control-values.mjs";
import * as Gr from "../../../core/model/graph.mjs";

export const DIALOG_ID = "dialog.select-item";

/**
 * The window at 1:1 (select-item/a1.png). The outer size counts its 1 px edge; the field and the
 * list are placed from inside that edge (1 px less than from the outer corner), and the rows from
 * inside the list's border: the highlight starts 1 px below it and 3 px right, the text 3 px further.
 */
export const LAYOUT = {
  width: 304,
  height: 215,
  title: { height: 30, text: "Select Item" },
  field: { x: 1, y: 31, width: 300, height: 19 },
  list: { x: 1, y: 55, width: 300, height: 157, firstRow: 1, row: 16, textX: 6, highlightPadding: 3, scrollWidth: 16 },
};

const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const px = (n) => `${Number(n.toFixed(2))}px`;

/** The window for an enum node: the field empty and no row highlighted, not even the current item (measured). */
export const open = (node) => ({ nodo: node.id, items: node.config?.type?.enum ?? [], filtro: "", resaltado: null, ultimoResaltado: null });

/** The indices of the items whose name contains the filter, ignoring case (measured: "o" keeps Hold, Cool, Done). */
export function shownItems(dialog) {
  const wanted = dialog.filtro.toLowerCase();
  return dialog.items.map((name, index) => ({ name, index })).filter(({ name }) => name.toLowerCase().includes(wanted)).map(({ index }) => index);
}

/**
 * With no item matching, LabVIEW keeps one greyed row, the item highlighted last or else the
 * first one, and Enter still picks it (measured; the exact rule is unverified).
 */
export const greyedItem = (dialog) => (shownItems(dialog).length ? null : (dialog.ultimoResaltado ?? 0));

const highlight = (dialog, index) => ({ ...dialog, resaltado: index, ultimoResaltado: index ?? dialog.ultimoResaltado });

/** The filter changed: the first item that still matches is highlighted (measured). */
function withFilter(dialog, filtro) {
  const changed = { ...dialog, filtro };
  return highlight(changed, shownItems(changed)[0] ?? null);
}

/** Up or Down: the highlight moves within the shown rows and wraps around at the ends (measured). */
function moveHighlight(dialog, step) {
  const shown = shownItems(dialog);
  if (!shown.length) return dialog;
  const at = shown.indexOf(dialog.resaltado);
  const next = at < 0 ? (step > 0 ? 0 : shown.length - 1) : (at + step + shown.length) % shown.length;
  return highlight(dialog, shown[next]);
}

/** The item Enter or a double click would pick: the highlighted one, or the greyed one when nothing matches. */
export const pickedItem = (dialog) => dialog.resaltado ?? greyedItem(dialog);

/**
 * What a key means: the characters and Backspace edit the filter, Up and Down move the
 * highlight, Enter picks and closes, Escape closes with no change. Enter with nothing
 * highlighted (the window just opened) closes with no change: unverified in LabVIEW.
 */
export function key(dialog, event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.key === "Escape") return { cancel: true };
  if (event.key === "Enter") return pickedItem(dialog) === null ? { cancel: true } : { accept: true };
  if (event.key === "ArrowDown") return { dialog: moveHighlight(dialog, 1) };
  if (event.key === "ArrowUp") return { dialog: moveHighlight(dialog, -1) };
  if (event.key === "Backspace") return { dialog: withFilter(dialog, dialog.filtro.slice(0, -1)) };
  if (event.key.length === 1) return { dialog: withFilter(dialog, dialog.filtro + event.key) };
  return { dialog };
}

/** What a click means: a row is highlighted, and with a double click (`clicks` 2) picked; the X closes with no change. */
export function click(dialog, id, clicks = 1) {
  const part = id.slice(id.lastIndexOf(".") + 1);
  if (part === "close") return { cancel: true };
  const row = /^item-(\d+)$/.exec(part)?.[1];
  if (row === undefined) return null;
  const highlighted = highlight(dialog, Number(row));
  return clicks >= 2 ? { dialog: highlighted, accept: true } : { dialog: highlighted };
}

/**
 * The VI with the picked item. On the constant it is its value, which marks the VI modified;
 * on a control or an indicator it is its current value, which does not (measured, DT-053).
 */
export function apply(g, dialog) {
  const picked = pickedItem(dialog);
  const node = g.nodos.find((candidate) => candidate.id === dialog.nodo);
  if (picked === null || !node) return g;
  return node.tipo === "enum-const" ? Gr.fijarValor(g, node.id, picked) : CV.setCurrentValue(g, node.id, picked);
}

/** The window, modal over the VI like the other dialogs. */
export function view(inv, dialog) {
  const L = LAYOUT;
  const greyed = greyedItem(dialog);
  const rows = greyed === null ? shownItems(dialog) : [greyed];
  const list = rows
    .map((index, k) => {
      const classes = `seleccion-item-fila${index === dialog.resaltado ? " resaltada" : ""}${index === greyed ? " gris" : ""}`;
      const text = `<span class="seleccion-item-texto" style="margin-left:${px(L.list.textX - L.list.highlightPadding)};padding:0 ${px(L.list.highlightPadding)}">${esc(dialog.items[index])}</span>`;
      return `<div class="${classes}" data-id="${DIALOG_ID}.item-${index}" style="top:${px(L.list.firstRow + k * L.list.row)};height:${px(L.list.row)};width:${px(L.list.width - L.list.scrollWidth - 2)}">${text}</div>`;
    })
    .join("");
  return `<div class="pv-velo"><div class="pv-dialogo dialogo-seleccion-item" data-dialogo="${DIALOG_ID}" style="width:${px(L.width)};height:${px(L.height)}">` +
    `<div class="pv-titulo" style="height:${px(L.title.height)}"><span>${L.title.text}</span><span class="pv-cerrar" data-id="${DIALOG_ID}.close">✕</span></div>` +
    `<div class="pv-campo seleccion-item-filtro" style="left:${px(L.field.x)};top:${px(L.field.y)};width:${px(L.field.width)};height:${px(L.field.height)}"><span>${esc(dialog.filtro)}</span><span class="caret"></span></div>` +
    `<div class="seleccion-item-lista" style="left:${px(L.list.x)};top:${px(L.list.y)};width:${px(L.list.width)};height:${px(L.list.height)}">${list}<div class="seleccion-item-scroll" style="width:${px(L.list.scrollWidth)}"></div></div>` +
    `</div></div>`;
}
