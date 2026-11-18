// The Project Explorer window drawn as HTML (DT-099 §6; labview-captures/reports/2026-11-17-project-explorer-s1.md and
// -s2.md). The title is the main process's. From the top: the menu bar, the toolbar, the Items and Files tabs and the tree.
// The sizes of the bars and of a row were read off the captures, not measured; the order of everything is measured.

import * as D from "../block-diagram/diagram-view.mjs";
import { esHueco, ultimo } from "../common/labview-inventory.mjs";
import { MENU_BAR_HEIGHT, menuBarHtml } from "../common/window-menu-bar.mjs";
import * as V from "../window/window-view.mjs";
import { TOOLBAR_ICONS, TREE_ICONS } from "./project-explorer-icons.mjs";
import { PREFIX, ROW_KINDS, TABS, disabledButtons, visibleRows } from "./project-explorer-state.mjs";

export { MENU_BAR_HEIGHT, PREFIX };

/** A new project's window, title bar included (measured: 374 x 434). */
export const WINDOW_SIZE = Object.freeze({ width: 374, height: 434 });

/** How far each level of the tree is indented, and the width of the + and − box, in pixels (read off the capture). */
const INDENT = 16;
const EXPANDER_SIZE = 9;

/** The toolbar's buttons in the measured order, one list per group (s1 Q1, s2 Q7); each name is the last segment of an inventory id under `toolbar`. */
export const TOOLBAR_GROUPS = Object.freeze([
  ["standard.new", "standard.open", "standard.save-all"],
  ["standard.cut", "standard.copy", "standard.paste", "standard.remove-from-project"],
  ["project.open-project", "project.save-project"],
  ["project.filter-project-view", "project.project-properties", "project.resolve-conflicts"],
  ["unit-tests.run-unit-tests", "unit-tests.results"],
  ["build.build-selected"],
]);

/** The rows of the menus that open a submenu whose rows are not declared yet; they show the arrow and explain themselves when clicked. */
const SUBMENU_ROWS = new Set(["recent-projects", "recent-files", "browse-relationships", "toolbars", "add-to-project", "filter-view", "instrumentation", "real-time-module", "compare", "merge", "profile", "security", "source-control", "vi-analyzer", "import", "shared-variable", "control-and-simulation", "hobbyist", "advanced", "new", "add", "export", "find", "unit-tests", "view", "arrange-by"]);

/** Arrange By's default, as LabVIEW marks it with a tick (s2 Q1). */
const ARRANGE_BY_TICKED = "arrange-by.name";

const escapeHtml = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const holeClass = (inventory, id) => (esHueco(inventory.resolver(id) ?? { estado: "todo" }) ? " hueco" : "");

/** The rows under `menuId` that show an arrow without declared contents. */
function rowsWithArrow(inventory, menuId) {
  return new Set(
    inventory.entradas.filter((entry) => entry.id.startsWith(`${menuId}.`) && SUBMENU_ROWS.has(ultimo(entry.id)) && !entry.etiqueta.endsWith("...") && !inventory.tieneContenido(entry.id)).map((entry) => entry.id),
  );
}

function openMenu(inventory, state, measure, windowSize) {
  if (!state.menuBarra) return "";
  const { id, x, y, abierto } = state.menuBarra;
  const ticked = new Set(inventory.entradas.filter((entry) => entry.id.startsWith(`${id}.`) && entry.id.endsWith(`.${ARRANGE_BY_TICKED}`)).map((entry) => entry.id));
  return D.menuContextual(inventory, { raiz: id, x, y, abierto }, ticked, measure, { conFlecha: rowsWithArrow(inventory, id) }, { ...windowSize, top: MENU_BAR_HEIGHT });
}

function toolbarButton(inventory, disabled, name) {
  const id = `${PREFIX}.toolbar.${name}`;
  const entry = inventory.entrada(id);
  const classes = `pe-button${holeClass(inventory, id)}${disabled.has(ultimo(id)) ? " desactivado" : ""}`;
  return `<div class="${classes}" data-id="${id}" title="${escapeHtml(entry.etiqueta)}">${TOOLBAR_ICONS[ultimo(id)]}</div>`;
}

function toolbar(inventory, state) {
  const disabled = disabledButtons(state);
  const groups = TOOLBAR_GROUPS.map((names) => `<div class="pe-group">${names.map((name) => toolbarButton(inventory, disabled, name)).join("")}</div>`);
  return `<div class="pe-toolbar">${groups.join('<div class="pe-separator"></div>')}</div>`;
}

function tabs(inventory, state) {
  const tab = (name, label) => {
    const id = `${PREFIX}.${name}`;
    const selected = state.tab === name ? " seleccionada" : "";
    return `<div class="pe-tab${selected}${holeClass(inventory, id)}" data-tab="${name}" data-id="${id}">${label}</div>`;
  };
  return `<div class="pe-tabs">${tab(TABS.ITEMS, "Items")}${tab(TABS.FILES, "Files")}</div>`;
}

/** The inventory entries of the rows that are always there. */
const FIXED_ROW_IDS = Object.freeze({
  [ROW_KINDS.PROJECT]: `${PREFIX}.items.project`,
  [ROW_KINDS.TARGET]: `${PREFIX}.items.project.my-computer`,
  [ROW_KINDS.DEPENDENCIES]: `${PREFIX}.items.project.my-computer.dependencies`,
  [ROW_KINDS.BUILD]: `${PREFIX}.items.project.my-computer.build-specifications`,
});

function treeRow(state, row) {
  const expander = row.expandable
    ? `<span class="pe-expander" data-expander="${row.key}" style="width:${EXPANDER_SIZE}px;height:${EXPANDER_SIZE}px">${row.expanded ? "−" : "+"}</span>`
    : `<span class="pe-expander-space" style="width:${EXPANDER_SIZE}px"></span>`;
  const selected = state.selected === row.key ? " seleccionada" : "";
  const fixedId = FIXED_ROW_IDS[row.kind];
  return `<div class="pe-row${selected}" data-key="${row.key}" data-kind="${row.kind}"${fixedId ? ` data-row-id="${fixedId}"` : ""} style="padding-left:${row.depth * INDENT + 4}px">${expander}<span class="pe-icon">${TREE_ICONS[row.kind]}</span><span class="pe-label">${escapeHtml(row.label)}</span></div>`;
}

const tree = (state) => `<div class="pe-tree" data-id="${PREFIX}.items">${visibleRows(state).map((row) => treeRow(state, row)).join("")}</div>`;

function explanation(inventory, opened) {
  const entry = opened && inventory.resolver(opened.id);
  if (!entry) return "";
  return `<div class="explicacion" data-explicacion="${escapeHtml(opened.id)}" style="left:${opened.x}px;top:${opened.y}px">${V.explicacion(inventory, entry)}</div>`;
}

/** The whole window. `measure`: the width of a text in the window's font; `windowSize`: the page's size, to keep a menu inside it. */
export function projectExplorerWindow(inventory, state, measure, windowSize) {
  return `<div class="pe-window" style="--menu-bar:${MENU_BAR_HEIGHT}px">
  ${menuBarHtml(inventory, state, PREFIX, "pe-menubar")}
  <div class="pe-client">
    ${toolbar(inventory, state)}
    ${tabs(inventory, state)}
    ${tree(state)}
  </div>
  ${openMenu(inventory, state, measure, windowSize)}
  ${explanation(inventory, state.abierta)}
</div>`;
}
