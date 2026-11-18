// The Create Project dialog drawn as HTML. The rectangles are read off labview-captures/project-explorer/s3-b-dialog.png
// (802 x 632 with its title bar, whose 31 px the page does not hold): the banner, the tree, the list whose rows are 49 px
// high every 57, the separator and the three buttons. Colours are tokens of the theme.

import { esHueco } from "../common/labview-inventory.mjs";
import * as V from "../window/window-view.mjs";
import { BANNER, LIST, OPEN_ITEMS, OPEN_ITEMS_PREFIX, TREE, listEntryId, partId, treeEntryId } from "./create-project-state.mjs";

export const TITLE_BAR_HEIGHT = 31;
export const WINDOW_SIZE = Object.freeze({ width: 802, height: 632 });
const TREE_ROW_HEIGHT = 16;
const TREE_INDENT = 16;

/** Positions in the capture's coordinates, title bar included; `at` turns them into the page's. */
const LAYOUT = Object.freeze({
  banner: { x: 0, y: 31, width: 802, height: 26 },
  tree: { x: 1, y: 60, width: 206, height: 528 },
  additionalSearch: { x: 8, y: 545 },
  keyword: { x: 7, y: 562, width: 194, height: 21 },
  list: { x: 209, y: 60, width: 572, height: 528 },
  separator: { x: 0, y: 590, width: 802 },
  finish: { x: 456, y: 600, width: 106, height: 21 },
  cancel: { x: 573, y: 600, width: 104, height: 21 },
  help: { x: 688, y: 600, width: 104, height: 21 },
});

const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const px = (value) => `${value}px`;
const holeClass = (inventory, id) => (esHueco(inventory.resolver(id) ?? { estado: "todo" }) ? " hueco" : "");
const at = ({ x, y, width, height }) => `left:${px(x)};top:${px(y - TITLE_BAR_HEIGHT)}${width === undefined ? "" : `;width:${px(width)}`}${height === undefined ? "" : `;height:${px(height)}`}`;

/** The icon of a row: a sheet with a fold, drawn for this dialog (NI's bitmaps are not copied, rule 3). */
const ROW_ICON = `<svg viewBox="0 0 28 32" width="28" height="32" aria-hidden="true"><path d="M3 1h14l8 8v22H3z" fill="var(--project-explorer-icon-paper)" stroke="var(--project-explorer-icon-ink)"/><path d="M17 1v8h8" fill="var(--project-explorer-icon-fold)" stroke="var(--project-explorer-icon-ink)"/><rect x="7" y="16" width="14" height="3" fill="var(--project-explorer-icon-blue)"/><rect x="7" y="22" width="10" height="3" fill="var(--project-explorer-icon-green)"/></svg>`;

function treeRows(inventory, state) {
  return TREE.map((row, index) => {
    const id = treeEntryId(row.id);
    const selected = state.treeSelected === row.id ? " seleccionada" : "";
    return `<div class="cp-tree-row${selected}${holeClass(inventory, id)}" data-id="${id}" data-tree="${row.id}" style="top:${px(1 + index * TREE_ROW_HEIGHT)};height:${px(TREE_ROW_HEIGHT)};padding-left:${px(23 + row.depth * TREE_INDENT)}">${esc(row.label)}</div>`;
  }).join("");
}

function listRows(inventory, state) {
  return LIST.map((row) => {
    const id = listEntryId(row.id);
    const selected = state.selected === row.id ? " seleccionada" : "";
    return `<div class="cp-row${selected}${holeClass(inventory, id)}" data-id="${id}" data-row="${row.id}">${ROW_ICON}<div class="cp-text"><div class="cp-name"><strong>${esc(row.name)}</strong><em>${esc(row.category)}</em></div><div class="cp-description">${esc(row.description)}</div></div></div>`;
  }).join("");
}

const button = (inventory, name, label, box, isDefault = false) =>
  `<div class="pv-boton cp-button${isDefault ? " defecto" : ""}${holeClass(inventory, partId(name))}" data-id="${partId(name)}" style="${at(box)}">${label}</div>`;

function explanation(inventory, opened) {
  const entry = opened && inventory.resolver(opened.id);
  if (!entry) return "";
  return `<div class="explicacion cp-explanation" data-explicacion="${esc(opened.id)}" style="left:${opened.x}px;top:${opened.y}px">${V.explicacion(inventory, entry)}</div>`;
}

/** The Open Items question (s3 Q1) over the dialog: its text, the greyed box, Add as the default button, Don't Add and Cancel. */
function openItemsDialog(inventory) {
  const buttons = OPEN_ITEMS.buttons
    .map(({ id, label }) => `<button class="boton-dialogo${id === "add" ? " defecto" : ""}${holeClass(inventory, `${OPEN_ITEMS_PREFIX}.${id}`)}" data-id="${OPEN_ITEMS_PREFIX}.${id}">${esc(label)}</button>`)
    .join("");
  const checkboxId = `${OPEN_ITEMS_PREFIX}.do-not-show-again`;
  return `<div class="modal-error cp-open-items" data-dialogo="open-items"><div class="dialogo-error" style="width:420px">
  <div class="dialogo-barra"><span>${esc(OPEN_ITEMS.title)}</span><span class="dialogo-cerrar" aria-hidden="true">✕</span></div>
  <div class="dialogo-cuerpo"><div class="dialogo-texto"><p>${esc(OPEN_ITEMS.message)}</p></div></div>
  <div class="dialogo-pie"><span class="cp-check${holeClass(inventory, checkboxId)}" data-id="${checkboxId}"><span class="pv-casilla"></span>${esc(OPEN_ITEMS.checkbox)}</span><span class="dialogo-botones">${buttons}</span></div>
</div></div>`;
}

/** The whole dialog. */
export function createProjectDialog(inventory, state) {
  const L = LAYOUT;
  const keywordId = partId("keyword");
  const keywordHole = holeClass(inventory, keywordId);
  const searchLabel = `<div class="cp-additional-search${keywordHole}" data-id="${keywordId}" style="left:${px(L.additionalSearch.x - L.tree.x)};top:${px(L.additionalSearch.y - L.tree.y)}">Additional Search</div>`;
  const keywordBox = `<div class="cp-keyword${keywordHole}" data-id="${keywordId}" style="left:${px(L.keyword.x - L.tree.x)};top:${px(L.keyword.y - L.tree.y)};width:${px(L.keyword.width)};height:${px(L.keyword.height)}">Keyword</div>`;
  return `<div class="cp-window">
  <div class="cp-banner" style="${at(L.banner)}">${esc(BANNER)}</div>
  <div class="cp-tree" style="${at(L.tree)}">${treeRows(inventory, state)}${searchLabel}${keywordBox}</div>
  <div class="cp-list" style="${at(L.list)}">${listRows(inventory, state)}</div>
  <div class="cp-separator" style="${at({ ...L.separator, height: 1 })}"></div>
  ${button(inventory, "finish", "Finish", L.finish, true)}${button(inventory, "cancel", "Cancel", L.cancel)}${button(inventory, "help", "Help", L.help)}
  ${state.openItems ? openItemsDialog(inventory) : ""}
  ${explanation(inventory, state.abierta)}
</div>`;
}
