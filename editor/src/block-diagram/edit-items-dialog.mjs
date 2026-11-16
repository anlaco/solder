// Edit Items…, the tab of the Properties dialog of an enum (DT-049): the items of
// the constant, control or indicator — one list for the three kinds. It edits the
// enum's type, so it also renames the frames of the Cases the enum feeds (through
// `Gr.editarItemsEnum`).
//
// Pure, like chart-history-dialog.mjs: `open` builds the dialog from the node, `type`
// and `act` edit it, `apply` writes it into the OVI and `view` draws it from the
// inventory (`dialog.enum-edit-items.*`).
//
// Measured in LabVIEW 2026 Q3 (labview-captures/enum-edit/41-eidialog.png, window
// 500 × 500; the capture is ≈1.62×, so the positions are derived at 1:1; reports
// 2026-10-14-enum-edit-items.md and -enum-edit-items-2.md).

import { esHueco } from "../common/labview-inventory.mjs";
import * as Gr from "../../../core/model/graph.mjs";

export const DIALOG_ID = "dialog.enum-edit-items";

/** The dialog in px from its top left corner. */
export const LAYOUT = {
  width: 500,
  height: 500,
  title: { height: 28 },
  tabs: { y: 59, height: 16, items: [
    { key: "appearance", label: "Appearance", x: 35, w: 68 },
    { key: "data-type", label: "Data Type", x: 104, w: 64 },
    { key: "display-format", label: "Display Format", x: 169, w: 94 },
    { key: "edit-items", label: "Edit Items", x: 264, w: 63 },
    { key: "documentation", label: "Documentation", x: 328, w: 97 },
  ] },
  headers: { y: 103, items: 37, values: 213 },
  list: { x: 32, y: 121, w: 327, h: 148, divider: 340, row: 29 },
  buttons: { x: 366, w: 103, h: 21, pitch: 31, first: 124, labels: ["Insert", "Delete", "Move Up", "Move Down", "Disable Item"] },
  checkbox: { x: 36, y: 282, box: 10, label: "Allow undefined values at run time" },
  bottom: { y: 468, h: 18, ok: 319, cancel: 377, help: 433, w: 56 },
};

/** Width of the scroll bar drawn at the list's right edge once the rows overflow. Unmeasured: the enum's list in LabVIEW was not captured with more rows than fit. */
const LIST_SCROLLBAR_WIDTH = 6;

/** The most the list scrolls: what the rows take beyond the list's height, in px. */
export const maxScroll = (rowCount) => Math.max(0, rowCount * LAYOUT.list.row - LAYOUT.list.h);

/** The list scrolled by `deltaY` px (the mouse wheel), kept between its top and its last row. */
export const scrolledBy = (dialog, deltaY) => ({ ...dialog, scroll: Math.max(0, Math.min(maxScroll(dialog.filas.length), (dialog.scroll ?? 0) + deltaY)) });

/** The list scrolled just enough for the chosen row to be seen, as it must be after Enter, Insert or a move reach a row below the visible ones. */
export function revealed(dialog) {
  const { row, h } = LAYOUT.list;
  const top = dialog.elegida * row;
  const scroll = dialog.scroll ?? 0;
  if (top < scroll) return { ...dialog, scroll: top };
  return top + row > scroll + h ? { ...dialog, scroll: Math.min(maxScroll(dialog.filas.length), top + row - h) } : dialog;
}

/** What the wheel over the list does to the dialog. */
export const wheel = scrolledBy;

/** A thin thumb at the list's right edge, only when the rows overflow. */
export function scrollbarHtml(dialog) {
  const { row, h, w } = LAYOUT.list;
  const total = dialog.filas.length * row;
  if (total <= h) return "";
  const thumbHeight = Math.max(12, (h * h) / total);
  const thumbTop = ((dialog.scroll ?? 0) / maxScroll(dialog.filas.length)) * (h - thumbHeight);
  return `<div class="ficha-lista-barra" style="left:${px(w - LIST_SCROLLBAR_WIDTH - 2)};top:${px(thumbTop)};width:${px(LIST_SCROLLBAR_WIDTH)};height:${px(thumbHeight)}"></div>`;
}

/**
 * A checkbox of the Edit Items tab. Only its box and its label take the click: the outer element lets every click
 * through and the inner one, as wide as the box and the label, carries the id.
 */
export function checkboxHtml(inv, part, label, { ticked = false, greyed = false, place }) {
  const box = LAYOUT.checkbox.box;
  return `<div class="ficha-casilla${ticked ? " marcada" : ""}${greyed ? " desactivada" : ""}${holeClass(inv, `${DIALOG_ID}.${part}`)}" style="left:${px(place.x)};top:${px(place.y)}"><span class="ficha-casilla-parte" data-id="${DIALOG_ID}.${part}"><span class="cuadro${ticked ? " marcado" : ""}" style="width:${px(box)};height:${px(box)}"></span>${esc(label)}</span></div>`;
}

export const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const px = (n) => `${Number(n.toFixed(2))}px`;

/**
 * The dialog for an enum node. Each row keeps the name it had when the dialog opened
 * (`original`; the new ones carry none): that is what tells a rename — which reaches the
 * Case frames — from an addition or a deletion, which do not rewrite anything (measured).
 */
export const open = (node) => {
  const items = node.config?.type?.enum ?? [];
  const current = items[node.config?.value ?? 0];
  const elegida = Math.max(0, items.indexOf(current));
  return { nodo: node.id, titulo: title(node), filas: items.map((name) => ({ texto: name, original: name })), elegida: Math.min(elegida, items.length - 1), edicion: null, listFocused: false, scroll: 0 };
};

/** The title of the window: measured for the constant; the panel ones are unverified. */
export const title = (node) => (node.tipo === "enum-const" ? "Enum Constant Properties" : "Enum Properties");

/**
 * A key typed into the row being edited. Enter commits the name and creates an empty
 * row below with the editor in it — one Enter too many leaves an empty item if OK
 * follows, as in LabVIEW (measured); Escape cancels the row and keeps the dialog.
 */
export function type(dialog, key) {
  if (!dialog.edicion) return dialog;
  const fila = dialog.filas[dialog.edicion.fila];
  if (key === "Escape") return { ...dialog, edicion: null };
  if (key === "Enter") return editarFila(insertar(dialog, dialog.edicion.fila + 1), dialog.edicion.fila + 1);
  if (key === "Backspace") return { ...dialog, edicion: { ...dialog.edicion, texto: dialog.edicion.todo ? "" : dialog.edicion.texto.slice(0, -1), todo: false } };
  if (key.length !== 1) return dialog;
  return { ...dialog, edicion: { ...dialog.edicion, texto: (dialog.edicion.todo ? "" : dialog.edicion.texto) + key, todo: false } };
}

const conFila = (dialog, fila, cambios) => ({ ...dialog, filas: dialog.filas.map((f, k) => (k === fila ? { ...f, ...cambios } : f)) });
const editarFila = (dialog, fila) => ({ ...dialog, elegida: fila, edicion: { fila, texto: dialog.filas[fila].texto, todo: true }, listFocused: true });
const commit = (dialog) => (dialog.edicion ? conFila(dialog, dialog.edicion.fila, { texto: dialog.edicion.texto }) : dialog);

/** An empty row where `k` is: what Insert does, and what Enter does below the row being edited. */
function insertar(dialog, k) {
  const base = commit(dialog);
  return { ...base, filas: [...base.filas.slice(0, k), { texto: "", original: undefined }, ...base.filas.slice(k)] };
}

/**
 * A click on a part of the dialog (`id`, from `data-id`; `clicks`, 2 for a double click).
 * A row commits what was being written (measured: clicking another row commits without
 * adding one); a single click only selects it and a double click opens its editor with the
 * name selected (measured, `reports/2026-10-15-editor-b12-b13-b7.md` §2). The buttons edit
 * the list.
 */
export function act(dialog, id, clicks = 1) {
  const parte = id.slice(id.lastIndexOf(".") + 1);
  const fila = /^row-(\d+)$/.exec(parte)?.[1];
  if (fila !== undefined && clicks >= 2) return editarFila(commit(dialog), Number(fila));
  if (fila !== undefined) return { ...commit(dialog), elegida: Number(fila), edicion: null, listFocused: true };
  if (parte === "insert") return editarFila(insertar(dialog, dialog.elegida + 1), dialog.elegida + 1);
  if (parte === "delete" && enabled(dialog, "delete")) {
    const base = commit(dialog);
    // The last row is not removed: Delete empties its name and the item stays, so an enum never
    // has zero items (measured 2026-10-15). Whether that empty name reaches the frames of the
    // Cases the enum feeds, as a rename does, is unverified; `original` is kept so it does.
    if (base.filas.length === 1) return { ...base, filas: [{ ...base.filas[0], texto: "" }], edicion: null };
    const filas = base.filas.filter((_, k) => k !== base.elegida);
    return { ...base, filas, elegida: Math.min(base.elegida, filas.length - 1), edicion: null };
  }
  if ((parte === "move-up" || parte === "move-down") && enabled(dialog, parte)) {
    const paso = parte === "move-up" ? -1 : 1;
    const base = commit(dialog);
    const filas = [...base.filas];
    [filas[base.elegida], filas[base.elegida + paso]] = [filas[base.elegida + paso], filas[base.elegida]];
    return { ...base, filas, elegida: base.elegida + paso, edicion: null };
  }
  return dialog;
}

/**
 * What a key means in the dialog, as an intent the window only applies: while a row is being
 * written it goes to that row — Enter commits it and opens an empty one below, Escape drops
 * what was written and the dialog stays (measured). With a row selected by a click and none
 * being written, Enter opens an empty row below it and the other keys do nothing (measured,
 * `reports/2026-10-15-editor-b12-b13-b7.md` §2). Otherwise Enter is OK and Escape is Cancel,
 * which are the window's default buttons (unverified in LabVIEW).
 */
export function key(dialog, event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (dialog.edicion) return { dialog: revealed(type(dialog, event.key)) };
  if (dialog.listFocused && event.key === "Enter") return { dialog: revealed(editarFila(insertar(dialog, dialog.elegida + 1), dialog.elegida + 1)) };
  if (dialog.listFocused && event.key !== "Escape") return { dialog };
  if (event.key === "Enter") return { accept: true };
  if (event.key === "Escape") return { cancel: true };
  return null;
}

/**
 * What a click (or, with `clicks` 2, a double click) on the part `id` means: OK writes the items, Cancel drops them, a greyed tab or
 * Help explains why it is not done (DT-035), the enum's own greyed checkbox does nothing because
 * LabVIEW greys it too, and the rest edits the list.
 */
export function click(dialog, id, clicks = 1) {
  const parte = id.slice(id.lastIndexOf(".") + 1);
  if (parte === "ok") return { accept: true };
  if (parte === "cancel") return { cancel: true };
  if (parte === "allow-undefined") return null;
  if (parte.startsWith("tab-") || parte === "help") return { explain: true };
  return { dialog: revealed(act(dialog, id, clicks)) };
}

/**
 * When each button works. Delete goes by the name, not by the row count: it is greyed only when
 * the single row left has an empty name, and otherwise it empties that row (measured 2026-10-15,
 * `reports/2026-10-15-enum-delete.md`; LabVIEW also greys it with nothing selected, which this
 * dialog cannot be — a row is always the chosen one). Move Up/Down need a row on that side, and
 * Disable Item never works on an enum (measured: greyed).
 */
export function enabled(dialog, parte) {
  if (parte === "delete") return !(dialog.filas.length === 1 && dialog.filas[0].texto === "");
  if (parte === "move-up") return dialog.elegida > 0;
  if (parte === "move-down") return dialog.elegida < dialog.filas.length - 1;
  if (parte === "disable-item") return false;
  return true;
}

/** The OVI with the items of the dialog: one rename map for the frames (DT-049), no rewrites
 * for additions and deletions. */
export function apply(g, dialog) {
  const committed = commit(dialog);
  const renombres = Object.fromEntries(committed.filas.filter((f) => f.original !== undefined && f.texto !== f.original).map((f) => [f.original, f.texto]));
  return Gr.editarItemsEnum(g, dialog.nodo, committed.filas.map((f) => f.texto), renombres);
}

export const holeClass = (inv, id) => (esHueco(inv.resolver(id) ?? { estado: "todo" }) ? " hueco" : "");

/** The five tabs of the Properties dialog, Edit Items the active one. */
export function tabsHtml(inv) {
  const L = LAYOUT;
  return L.tabs.items
    .map((tab) => `<div class="ficha${tab.key === "edit-items" ? " activa" : holeClass(inv, `${DIALOG_ID}.tab-${tab.key}`)}" data-id="${DIALOG_ID}.tab-${tab.key}" style="left:${px(tab.x)};top:${px(L.tabs.y)};width:${px(tab.w)};height:${px(L.tabs.height)}">${esc(tab.label)}</div>`)
    .join("");
}

/** Insert, Delete, Move Up, Move Down and Disable Item; a greyed one has no id to click. `isEnabled(part)` says which work. */
export function buttonsHtml(inv, isEnabled) {
  const L = LAYOUT;
  return L.buttons.labels
    .map((label, k) => {
      const parte = ["insert", "delete", "move-up", "move-down", "disable-item"][k];
      const activo = isEnabled(parte);
      return `<div class="pv-boton${activo ? "" : " desactivado"}${holeClass(inv, `${DIALOG_ID}.${parte}`)}" data-id="${activo ? `${DIALOG_ID}.${parte}` : ""}" style="left:${px(L.buttons.x)};top:${px(L.buttons.first + k * L.buttons.pitch)};width:${px(L.buttons.w)};height:${px(L.buttons.h)}">${esc(label)}</div>`;
    })
    .join("");
}

/** OK, Cancel and Help; `okEnabled` false greys OK (a ring with two items of one value). */
export function bottomHtml(inv, okEnabled = true) {
  const L = LAYOUT;
  return [{ key: "ok", label: "OK", x: L.bottom.ok, defecto: true }, { key: "cancel", label: "Cancel", x: L.bottom.cancel }, { key: "help", label: "Help", x: L.bottom.help }]
    .map(({ key, label, x, defecto }) => {
      const greyed = key === "ok" && !okEnabled;
      const id = key === "help" || greyed ? "" : `${DIALOG_ID}.${key}`;
      return `<div class="pv-boton${defecto ? " defecto" : ""}${greyed ? " desactivado" : ""}${key === "help" ? holeClass(inv, `${DIALOG_ID}.help`) : ""}" data-id="${id}" style="left:${px(x)};top:${px(L.bottom.y)};width:${px(L.bottom.w)};height:${px(L.bottom.h)}">${label}</div>`;
    })
    .join("");
}

/** The dialog, modal over the window, like the OVI Properties one. */
export function view(inv, dialog) {
  const L = LAYOUT;
  const filas = dialog.filas
    .map((fila, k) => {
      const editando = dialog.edicion?.fila === k;
      const nombre = editando
        ? dialog.edicion.todo
          ? `<span class="texto-elegido">${esc(dialog.edicion.texto)}</span>`
          : `<span>${esc(dialog.edicion.texto)}</span><span class="caret"></span>`
        : esc(fila.texto);
      return `<div class="ficha-lista-fila${k === dialog.elegida ? " elegida" : ""}" data-id="${DIALOG_ID}.row-${k}" style="top:${px(k * L.list.row - (dialog.scroll ?? 0))};height:${px(L.list.row)}"><span class="celda" style="left:${px(L.headers.items - L.list.x)}">${nombre}</span><span class="celda valor" style="left:${px(L.list.divider - L.list.x + 6)}">${k}</span></div>`;
    })
    .join("");
  const lista = `<div class="ficha-lista-cabecera" style="top:${px(L.headers.y)}"><span style="left:${px(L.headers.items)}">Items</span><span style="left:${px(L.headers.values)}">Values</span></div>` +
    `<div class="ficha-lista" style="left:${px(L.list.x)};top:${px(L.list.y)};width:${px(L.list.w)};height:${px(L.list.h)}"><div class="ficha-lista-separador" style="left:${px(L.list.divider - L.list.x)}"></div>${filas}${scrollbarHtml(dialog)}</div>`;
  const casilla = checkboxHtml(inv, "allow-undefined", L.checkbox.label, { greyed: true, place: L.checkbox });
  return `<div class="pv-velo"><div class="pv-dialogo dialogo-edit-items" data-dialogo="${DIALOG_ID}" style="width:${px(L.width)};height:${px(L.height)}"><div class="pv-titulo" style="height:${px(L.title.height)}">${esc(dialog.titulo)}</div>${tabsHtml(inv)}${lista}${buttonsHtml(inv, (part) => enabled(dialog, part))}${casilla}${bottomHtml(inv)}</div></div>`;
}
