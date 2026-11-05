// The Polymorphic OVI window drawn as HTML (labview-captures/reports/2026-11-05-polymorphic-window.md, p1.png).
//
// The numbers are the measured rectangles in window pixels (the whole window, title bar included); the page below the
// title bar is the Electron window's content, so every y is taken from the title bar's bottom edge. The colours,
// fonts and what resizing does were not measured.

import * as D from "../block-diagram/diagram-view.mjs";
import { esHueco } from "../common/labview-inventory.mjs";
import { ownIconHtml } from "../block-diagram/polymorphic-nodes.mjs";
import * as V from "../window/window-view.mjs";
import { DRAW_ICON, buttonStates, rowCells, showsEmptyMarker } from "./polymorphic-window-state.mjs";

export const PREFIX = "window.polymorphic-ovi";
export const NAME_DIALOG = "dialog.edit-instance-name";

/** The height of the title bar the measured y's include (p1_s.png: its rows 0 to 32). */
export const TITLE_BAR_HEIGHT = 33;
/** The menu bar the page draws itself, as the Getting Started window's. */
export const MENU_BAR_HEIGHT = 20;
/** The window's size, title bar included (measured). */
export const WINDOW_SIZE = Object.freeze({ width: 482, height: 391 });

const BUTTON_SIZE = Object.freeze({ width: 108, height: 23 });
const ARROW_SIZE = Object.freeze({ width: 27, height: 25 });

/** Every rectangle of the window, `{ x, y, width, height }`, in window pixels (measured). */
export const LAYOUT = Object.freeze({
  emptyMarker: { x: 8, y: 68, ...ARROW_SIZE },
  editIcon: { x: 314, y: 75, ...BUTTON_SIZE },
  icon: { x: 427, y: 70, width: 32, height: 32 },
  listLabel: { x: 10, y: 101 },
  list: { x: 9, y: 114, width: 418, height: 145 },
  headerHeight: 17,
  rowHeight: 18,
  // The columns of the list: OVI Name 10-237, Menu Name 237-320, Selector Name 320-401, a blank one up to 427.
  columns: { fileName: [10, 237], menuName: [237, 320], selectorName: [320, 401] },
  fileNameIndent: 17,
  moveUp: { x: 432, y: 158, ...ARROW_SIZE },
  moveDown: { x: 432, y: 187, ...ARROW_SIZE },
  add: { x: 60, y: 265, ...BUTTON_SIZE },
  remove: { x: 176, y: 265, ...BUTTON_SIZE },
  editName: { x: 292, y: 265, ...BUTTON_SIZE },
  appearanceLabel: { x: 11, y: 302 },
  drawPolymorphicIcon: { x: 9, y: 320 },
  drawInstanceIcon: { x: 9, y: 340 },
  showSelector: { x: 201, y: 321 },
  allowAdapt: { x: 201, y: 341 },
  help: { x: 371, y: 329, width: 58, height: 21 },
});

/** The "Edit Instance Name" dialog: 353 x 237 with two 300 x 32 fields (measured); the rest is read off en1.png. */
export const NAME_DIALOG_LAYOUT = Object.freeze({
  width: 353,
  height: 237,
  menuLabel: { x: 18, y: 56 },
  menuField: { x: 17, y: 72, width: 300, height: 32 },
  selectorLabel: { x: 18, y: 114 },
  selectorField: { x: 17, y: 132, width: 300, height: 32 },
  ok: { x: 113, y: 180, width: 59, height: 21 },
  cancel: { x: 185, y: 180, width: 59, height: 21 },
  help: { x: 257, y: 180, width: 59, height: 21 },
});

const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const px = (value) => `${value}px`;
const holeClass = (inv, id) => (esHueco(inv.resolver(id) ?? { estado: "todo" }) ? " hueco" : "");
/** From window pixels to the page's: the title bar is not part of it. */
const pageY = (y) => y - TITLE_BAR_HEIGHT;
const place = ({ x, y, width, height }) => `left:${px(x)};top:${px(pageY(y))}${width === undefined ? "" : `;width:${px(width)};height:${px(height)}`}`;

/** The marker of an empty list (a red no-entry sign; what it means was not measured). */
const EMPTY_MARKER = `<svg viewBox="0 0 27 25" width="27" height="25" aria-hidden="true"><circle cx="13.5" cy="12.5" r="10.5" fill="none" stroke="var(--polymorphic-window-marker)" stroke-width="2"/><line x1="6.5" y1="19.5" x2="20.5" y2="5.5" stroke="var(--polymorphic-window-marker)" stroke-width="2"/></svg>`;
const ARROW_UP = `<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M6 1 1 6.5h3V11h4V6.5h3z" class="po-arrow"/></svg>`;
const ARROW_DOWN = `<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M6 11 1 5.5h3V1h4v4.5h3z" class="po-arrow"/></svg>`;

function menuBar(inv, state) {
  const titles = inv
    .hijos(`${PREFIX}.menu`)
    .map((entry) => `<div class="menu${holeClass(inv, entry.id)}${state.menuBarra?.id === entry.id ? " abierto" : ""}" data-id="${esc(entry.id)}"><span class="medida">${esc(entry.etiqueta)}</span><span class="texto">${esc(entry.etiqueta)}</span></div>`)
    .join("");
  return `<div class="cabecera po-menubar" style="height:${MENU_BAR_HEIGHT}px"><div class="menus" style="height:${MENU_BAR_HEIGHT - 1}px">${titles}</div></div>`;
}

function openMenu(inv, state, measure, windowSize) {
  if (!state.menuBarra) return "";
  const { id, x, y, abierto } = state.menuBarra;
  return D.menuContextual(inv, { raiz: id, x, y, abierto }, new Set(), measure, {}, windowSize);
}

function button(inv, id, label, box, enabled = true) {
  const classes = `po-button${holeClass(inv, id)}${enabled ? "" : " desactivado"}`;
  return `<div class="${classes}" data-id="${id}" style="${place(box)}">${esc(label)}</div>`;
}

function arrowButton(inv, id, arrow, box, enabled) {
  return `<div class="po-arrow-button${enabled ? "" : " desactivado"}" data-id="${id}" style="${place(box)}">${arrow}</div>`;
}

function choice(inv, id, kind, label, box, checked) {
  return `<div class="po-choice po-${kind}${checked ? " marcada" : ""}${holeClass(inv, id)}" data-id="${id}" style="${place(box)}"><span class="pv-casilla${kind === "radio" ? " redonda" : ""}"></span><span class="po-choice-text">${label}</span></div>`;
}

/** The list: a header, a row per instance and empty striped rows down to the bottom of the box. */
function instanceList(state) {
  const { list, headerHeight, rowHeight, columns, fileNameIndent } = LAYOUT;
  const cell = ([left, right], text, indent = 0) => `<span class="po-cell" style="left:${px(left - list.x + indent)};width:${px(right - left - indent)}">${esc(text)}</span>`;
  const header = `<div class="po-header" style="height:${px(headerHeight)}">${cell(columns.fileName, "OVI Name", 0)}${cell(columns.menuName, "Menu Name")}${cell(columns.selectorName, "Selector Name")}</div>`;
  const rowCount = Math.max(state.instances.length, Math.floor((list.height - headerHeight) / rowHeight));
  const rows = Array.from({ length: rowCount }, (_, index) => {
    const instance = state.instances[index];
    const [fileName, menuName, selectorName] = instance ? rowCells(instance) : ["", "", ""];
    const selected = instance && state.selected === index ? " seleccionada" : "";
    const data = instance ? ` data-row="${index}"` : "";
    return `<div class="po-row${instance ? "" : " vacia"}${selected}"${data} style="top:${px(headerHeight + index * rowHeight)};height:${px(rowHeight)}">${cell(columns.fileName, fileName, fileNameIndent)}${cell(columns.menuName, menuName)}${cell(columns.selectorName, selectorName)}</div>`;
  }).join("");
  return `<div class="po-list" data-id="${PREFIX}.instances" style="${place(list)}">${header}${rows}</div>`;
}

/** The "Edit Instance Name" dialog, modal over the window: the two fields, with the caret in the one being typed. */
function nameDialog(inv, dialog) {
  const L = NAME_DIALOG_LAYOUT;
  const field = (name, box) => `<div class="pv-campo po-field${dialog.focus === name ? " activo" : ""}" data-field="${name}" style="left:${px(box.x)};top:${px(box.y)};width:${px(box.width)};height:${px(box.height)}"><span class="po-field-text">${esc(dialog[name])}</span>${dialog.focus === name ? '<span class="caret"></span>' : ""}</div>`;
  const dialogButton = (key, label, box, defaultButton = false) =>
    `<div class="pv-boton${defaultButton ? " defecto" : ""}${holeClass(inv, `${NAME_DIALOG}.${key}`)}" data-id="${NAME_DIALOG}.${key}" style="left:${px(box.x)};top:${px(box.y)};width:${px(box.width)};height:${px(box.height)}">${label}</div>`;
  return `<div class="pv-velo"><div class="pv-dialogo po-name-dialog" style="width:${px(L.width)};height:${px(L.height)}">` +
    `<div class="pv-titulo" style="height:${px(TITLE_BAR_HEIGHT - 2)}"><span>Edit Instance Name</span><span class="pv-cerrar" data-id="${NAME_DIALOG}.cancel">✕</span></div>` +
    `<div class="pv-etiqueta" style="left:${px(L.menuLabel.x)};top:${px(L.menuLabel.y)}">Menu Name</div>${field("menuName", L.menuField)}` +
    `<div class="pv-etiqueta" style="left:${px(L.selectorLabel.x)};top:${px(L.selectorLabel.y)}">Polymorphic OVI Selector Name</div>${field("selectorName", L.selectorField)}` +
    `${dialogButton("ok", "OK", L.ok, true)}${dialogButton("cancel", "Cancel", L.cancel)}${dialogButton("help", "Help", L.help)}</div></div>`;
}

function explanation(inv, opened) {
  const entry = opened && inv.resolver(opened.id);
  if (!entry) return "";
  return `<div class="explicacion" data-explicacion="${esc(opened.id)}" style="left:${opened.x}px;top:${opened.y}px">${V.explicacion(inv, entry)}</div>`;
}

/** The whole window. `measure`: the width of a text in the window's font; `windowSize`: the page's size, to keep a menu inside it. */
export function polymorphicWindow(inv, state, measure, windowSize) {
  const L = LAYOUT;
  const buttons = buttonStates(state);
  const id = (name) => `${PREFIX}.${name}`;
  return `<div class="po-window" style="--menu-bar:${MENU_BAR_HEIGHT}px">
  ${menuBar(inv, state)}
  <div class="po-client">
    ${showsEmptyMarker(state) ? `<div class="po-empty-marker" data-id="${id("empty-marker")}" style="${place(L.emptyMarker)}">${EMPTY_MARKER}</div>` : ""}
    ${button(inv, id("edit-icon"), "Edit Icon...", L.editIcon)}
    <div class="po-icon" data-id="${id("icon")}" style="${place(L.icon)}">${ownIconHtml(state.icon)}</div>
    <div class="po-label" style="${place(L.listLabel)}">Instance OVIs</div>
    ${instanceList(state)}
    ${arrowButton(inv, id("move-up"), ARROW_UP, L.moveUp, buttons.moveUp)}
    ${arrowButton(inv, id("move-down"), ARROW_DOWN, L.moveDown, buttons.moveDown)}
    ${button(inv, id("add"), "Add...", L.add)}
    ${button(inv, id("remove"), "Remove", L.remove, buttons.remove)}
    ${button(inv, id("edit-name"), "Edit Name...", L.editName, buttons.editName)}
    <div class="po-label" style="${place(L.appearanceLabel)}">Block Diagram Appearance:</div>
    ${choice(inv, id("draw-polymorphic-icon"), "radio", "Draw Polymorphic OVI Icon", L.drawPolymorphicIcon, state.drawIcon === DRAW_ICON.POLYMORPHIC)}
    ${choice(inv, id("draw-instance-icon"), "radio", "Draw Instance OVI Icon", L.drawInstanceIcon, state.drawIcon === DRAW_ICON.INSTANCE)}
    ${choice(inv, id("show-selector-by-default"), "check", "Show Selector by Default", L.showSelector, state.showSelectorByDefault)}
    ${choice(inv, id("allow-adapt"), "check", "Allow Polymorphic OVI<br>to Adapt to Data Type", L.allowAdapt, state.adaptToDataType)}
    ${button(inv, id("help"), "Help", L.help)}
  </div>
  ${state.nameDialog ? nameDialog(inv, state.nameDialog) : ""}
  ${openMenu(inv, state, measure, windowSize)}
  ${explanation(inv, state.abierta)}
</div>`;
}
