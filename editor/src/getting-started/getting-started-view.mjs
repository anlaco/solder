// The Getting Started window drawn as HTML (labview-captures/reports/2026-10-15-getting-started.md).
//
// Positions are the measured ones, in client coordinates, below the menu bar. The left and middle panels share the
// extra width of a resized window and the carousel keeps its width at the right (CSS in getting-started.css, which
// takes the numbers from here as custom properties).

import * as D from "../block-diagram/diagram-view.mjs";
import { esHueco } from "../common/labview-inventory.mjs";
import * as V from "../window/window-view.mjs";
import { CAPTIONS, CAROUSEL_PAGES, LINK_LABEL } from "./carousel-pages.mjs";
import { fileName, pagerText, recentFileRows, releaseChannel, releaseNumber, visibleFiles } from "./getting-started-state.mjs";
import { RECENT_FILTERS } from "./start-state.mjs";

const PREFIX = "window.getting-started";
export const MENU_BAR_HEIGHT = 20;

/** The measured layout, in pixels of the client area under the menu bar. */
export const LAYOUT = {
  clientSize: { width: 837, height: 506 },
  panelsTop: 100,
  panelsHeight: 287,
  panelsLeft: 22,
  panelsGap: 15,
  carouselWidth: 294,
  filterComboWidth: 207,
  filterComboTop: 164,
  filterComboHeight: 20,
  rowHeight: 24,
};

const MENU_ITEM_HEIGHT = 19.3;
const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const greyClass = (inv, id) => (esHueco(inv.resolver(id) ?? { estado: "todo" }) ? " hueco" : "");

const CHEVRON = (direction) =>
  `<svg viewBox="0 0 8 12" width="8" height="12" aria-hidden="true"><path d="${direction === "left" ? "M6.5 1 1.5 6l5 5" : "M1.5 1l5 5-5 5"}" fill="none" stroke="#161617" stroke-width="1.3"/></svg>`;
const DOUBLE_CHEVRON = (direction) =>
  `<svg viewBox="0 0 14 12" width="14" height="12" aria-hidden="true"><path d="${direction === "left" ? "M6.5 1 1.5 6l5 5M12.5 1l-5 5 5 5" : "M1.5 1l5 5-5 5M7.5 1l5 5-5 5"}" fill="none" stroke="#161617" stroke-width="1.3"/></svg>`;
const PIN = `<svg viewBox="0 0 10 14" width="10" height="14" aria-hidden="true"><path d="M3 1h4v1l-1 .5V6l2 2v1H2V8l2-2V2.5L3 2z M5 9v4" fill="#6b6b6b" stroke="#6b6b6b" stroke-width="1"/></svg>`;
const COMBO_CARET = `<svg viewBox="0 0 12 8" width="12" height="8" aria-hidden="true"><path d="M1 1.5l5 5 5-5" fill="none" stroke="#161617" stroke-width="1.3"/></svg>`;

/** The title bar's own contents are the window's; the page draws the menu bar from the inventory. */
function menuBar(inv, state) {
  const titles = inv
    .hijos(`${PREFIX}.menu`)
    .map((entry) => `<div class="menu${greyClass(inv, entry.id)}${state.menuBarra?.id === entry.id ? " abierto" : ""}" data-id="${esc(entry.id)}"><span class="medida">${esc(entry.etiqueta)}</span><span class="texto">${esc(entry.etiqueta)}</span></div>`)
    .join("");
  return `<div class="cabecera gs-menubar" style="height:${MENU_BAR_HEIGHT}px"><div class="menus" style="height:${MENU_BAR_HEIGHT - 1}px">${titles}</div></div>`;
}

/** The drop-down of the open menu: the inventory's rows, with the recent files as the submenu of Recent Files. */
function openMenu(inv, state, measure, windowSize) {
  if (!state.menuBarra) return "";
  const recentId = `${PREFIX}.menu.file.recent-files`;
  const variant = {
    submenus: new Map([[recentId, recentFileRows(state.recentFiles)]]),
    desactivados: new Set(state.recentFiles.length ? [] : [recentId]),
  };
  const { id, x, y, abierto } = state.menuBarra;
  return D.menuContextual(inv, { raiz: id, x, y, abierto }, new Set(), measure, variant, windowSize);
}

/** The filter combo and, open, its four choices with a check mark on the current one. */
function filterCombo(state) {
  const width = LAYOUT.filterComboWidth;
  const choices = state.filterOpen
    ? `<div class="menu-contextual gs-filter-list" style="left:0;top:${LAYOUT.filterComboHeight}px;width:${width}px;height:${RECENT_FILTERS.length * MENU_ITEM_HEIGHT + 3.4}px">${RECENT_FILTERS.map(
        (filter, index) => `<div class="item-menu${filter === state.filter ? " marcado" : ""}" data-filter="${esc(filter)}" style="top:${1.7 + index * MENU_ITEM_HEIGHT}px;height:${MENU_ITEM_HEIGHT}px"><span class="texto-menu" style="left:18.6px">${esc(filter)}</span></div>`,
      ).join("")}</div>`
    : "";
  return `<div class="gs-combo-anchor"><div class="gs-combo" data-combo="filter"><span>${esc(state.filter)}</span>${COMBO_CARET}</div>${choices}</div>`;
}

function recentList(state) {
  return visibleFiles(state)
    .map((filePath) => `<div class="gs-recent" data-path="${esc(filePath)}" title="${esc(filePath)}">${PIN}<span>${esc(fileName(filePath))}</span></div>`)
    .join("");
}

function carousel(inv, state) {
  const toggle = `<button class="gs-collapse" data-action="collapse" aria-label="${state.collapsed ? "Show the carousel" : "Hide the carousel"}">${DOUBLE_CHEVRON(state.collapsed ? "left" : "right")}</button>`;
  if (state.collapsed) return `<div class="gs-carousel collapsed">${toggle}</div>`;
  const page = CAROUSEL_PAGES[state.carouselPage];
  return `<div class="gs-carousel">
    <div class="gs-pager"><button data-action="previous" aria-label="Previous page">${CHEVRON("left")}</button><span class="gs-pager-text">${pagerText(state)}</span><button data-action="next" aria-label="Next page">${CHEVRON("right")}</button></div>
    ${toggle}
    <h2 class="gs-carousel-heading">${esc(page.heading)}</h2>
    <p class="gs-carousel-body">${esc(page.body)}</p>
    <span class="gs-link${greyClass(inv, `${PREFIX}.carousel-link`)}" data-id="${PREFIX}.carousel-link">${LINK_LABEL}</span>
  </div>`;
}

function captions(inv) {
  return CAPTIONS.map(
    (caption) => `<div class="gs-caption"><h3 class="gs-link${greyClass(inv, `${PREFIX}.caption-link`)}" data-id="${PREFIX}.caption-link">${esc(caption.heading)}</h3><p>${esc(caption.body)}</p></div>`,
  ).join("");
}

/** The floating explanation of a greyed item (rule 54), the same one the VI windows show. */
function explanation(inv, opened) {
  const entry = opened && inv.resolver(opened.id);
  if (!entry) return "";
  return `<div class="explicacion" data-explicacion="${esc(opened.id)}" style="left:${opened.x}px;top:${opened.y}px">${V.explicacion(inv, entry)}</div>`;
}

/**
 * The whole window. `measure`: the width of a text in the window's font, for the menus; `windowSize`: the size
 * of the window, to keep a menu inside it.
 */
export function gettingStartedWindow(inv, state, measure, windowSize) {
  const { panelsTop, panelsHeight, panelsLeft, panelsGap, carouselWidth } = LAYOUT;
  const channel = releaseChannel(state.version);
  return `<div class="gs-window" style="--panels-top:${panelsTop}px;--panels-height:${panelsHeight}px;--panels-left:${panelsLeft}px;--panels-gap:${panelsGap}px;--carousel-width:${carouselWidth}px;--menu-bar:${MENU_BAR_HEIGHT}px">
  ${menuBar(inv, state)}
  <div class="gs-client">
    <header class="gs-header"><img src="src/getting-started/logo.svg" alt="" width="36" height="36"><span class="gs-product">Solder ${esc(releaseNumber(state.version))}</span><span class="gs-channel">${esc(channel)}</span></header>
    <div class="gs-panels">
      <section class="gs-panel gs-left">
        <div class="gs-strip"><button class="gs-button${greyClass(inv, `${PREFIX}.create-project`)}" data-id="${PREFIX}.create-project">Create Project</button></div>
        <div class="gs-body"><div class="gs-list-area"><div class="gs-templates-header">Recent Project Templates</div><div class="gs-template${greyClass(inv, `${PREFIX}.recent-project-templates.blank-project`)}" data-id="${PREFIX}.recent-project-templates.blank-project">Blank Project</div></div><div class="gs-track"></div></div>
      </section>
      <section class="gs-panel gs-middle">
        <div class="gs-strip"><button class="gs-button" data-action="open-existing">Open Existing</button></div>
        <div class="gs-body"><div class="gs-list-area">${filterCombo(state)}<div class="gs-recent-list">${recentList(state)}</div></div></div>
      </section>
    </div>
    <div class="gs-captions">${captions(inv)}</div>
    ${carousel(inv, state)}
  </div>
  ${openMenu(inv, state, measure, windowSize)}
  ${explanation(inv, state.abierta)}
</div>`;
}
