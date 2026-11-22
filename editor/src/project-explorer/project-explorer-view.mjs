// The Project Explorer window drawn as HTML (DT-099 §6; labview-captures/reports/2026-11-17-project-explorer-s1.md and
// -s2.md). The title is the main process's. From the top: the menu bar, the toolbar, the Items and Files tabs and the tree.
// The sizes of the bars and of a row were read off the captures, not measured; the order of everything is measured.

import * as D from "../block-diagram/diagram-view.mjs";
import { esHueco, ultimo } from "../common/labview-inventory.mjs";
import { MENU_BAR_HEIGHT, menuBarHtml } from "../common/window-menu-bar.mjs";
import * as V from "../window/window-view.mjs";
import { TOOLBAR_ICONS, TREE_ICONS } from "./project-explorer-icons.mjs";
import { canRemove } from "./project-explorer-edit.mjs";
import { EDITABLE_KINDS, PREFIX, ROW_KINDS, TABS, disabledButtons, visibleRows } from "./project-explorer-state.mjs";
import { WINDOW_MENU, windowMenuVariant } from "./window-menu.mjs";
import { visibleFileRows } from "./files-view.mjs";
import { layoutSwitchHtml } from "./layout-switch.mjs";

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

const AUTO_POPULATING_MENU = "context.project-explorer.auto-populating-folder";
const AUTO_POPULATING_SUBFOLDER_MENU = "context.project-explorer.auto-populating-subfolder";

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

/**
 * The rows of the open menu that are greyed by what is selected: Edit ▸ Remove From Project on a row that cannot be removed
 * (as the toolbar's button is), and Add ▸ of an auto-populating folder and of a folder in it, which mirror the disk
 * (measured: s4 Menus, s5 Q1).
 */
export function greyedRows(state, menuId) {
  const removeRow = `${PREFIX}.menu.edit.remove-from-project`;
  if (menuId === `${PREFIX}.menu.edit`) return canRemove(state) ? new Set() : new Set([removeRow]);
  if (menuId === AUTO_POPULATING_MENU) return new Set([`${AUTO_POPULATING_MENU}.add`]);
  if (menuId === AUTO_POPULATING_SUBFOLDER_MENU) return new Set([`${AUTO_POPULATING_SUBFOLDER_MENU}.add`]);
  return new Set();
}

function openMenu(inventory, state, measure, windowSize) {
  if (!state.menuBarra) return "";
  const { id, x, y, abierto, desplazados } = state.menuBarra;
  const ticked = new Set(inventory.entradas.filter((entry) => entry.id.startsWith(`${id}.`) && entry.id.endsWith(`.${ARRANGE_BY_TICKED}`)).map((entry) => entry.id));
  const listed = id === WINDOW_MENU ? windowMenuVariant(inventory, state.windowRows ?? []) : {};
  return D.menuContextual(inventory, { raiz: id, x, y, abierto, desplazados }, ticked, measure, { conFlecha: rowsWithArrow(inventory, id), desactivados: greyedRows(state, id), ...listed }, { ...windowSize, top: MENU_BAR_HEIGHT });
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

/** The name of a row: its label, or the text box while it is being edited in place (a virtual folder's name, selected when it opens). */
function rowName(state, row) {
  if (state.edit?.key !== row.key) return `<span class="pe-label">${escapeHtml(row.label)}</span>`;
  return `<input class="pe-edit" data-edit="${row.key}" value="${escapeHtml(state.edit.text)}" spellcheck="false" />`;
}

function treeRow(state, row) {
  const expander = row.expandable
    ? `<span class="pe-expander" data-expander="${row.key}" style="width:${EXPANDER_SIZE}px;height:${EXPANDER_SIZE}px">${row.expanded ? "−" : "+"}</span>`
    : `<span class="pe-expander-space" style="width:${EXPANDER_SIZE}px"></span>`;
  const selected = state.selected === row.key ? " seleccionada" : "";
  const fixedId = FIXED_ROW_IDS[row.kind];
  const draggable = EDITABLE_KINDS.includes(row.kind) ? ' draggable="true"' : "";
  const missing = row.missing ? " pe-missing" : "";
  return `<div class="pe-row${selected}${missing}" data-key="${escapeHtml(row.key)}" data-kind="${row.kind}"${draggable}${fixedId ? ` data-row-id="${fixedId}"` : ""} style="padding-left:${row.depth * INDENT + 4}px">${expander}<span class="pe-icon">${TREE_ICONS[row.icon]}</span>${rowName(state, row)}</div>`;
}

/** A row of the Files tab: a file or folder on disk, with its own keys so that a click never reaches an Items row. */
function fileRow(state, row) {
  const expander = row.expandable
    ? `<span class="pe-expander" data-file-expander="${escapeHtml(row.key)}" style="width:${EXPANDER_SIZE}px;height:${EXPANDER_SIZE}px">${row.expanded ? "−" : "+"}</span>`
    : `<span class="pe-expander-space" style="width:${EXPANDER_SIZE}px"></span>`;
  const selected = state.files.selected === row.key ? " seleccionada" : "";
  return `<div class="pe-row${selected}" data-file-key="${escapeHtml(row.key)}" data-kind="${row.kind}" style="padding-left:${row.depth * INDENT + 4}px">${expander}<span class="pe-icon">${TREE_ICONS[row.kind]}</span><span class="pe-label">${escapeHtml(row.label)}</span></div>`;
}

function tree(state) {
  if (state.tab === TABS.FILES && state.files) return `<div class="pe-tree" data-id="${PREFIX}.files">${visibleFileRows(state).map((row) => fileRow(state, row)).join("")}</div>`;
  return `<div class="pe-tree" data-id="${PREFIX}.items">${visibleRows(state).map((row) => treeRow(state, row)).join("")}</div>`;
}

function explanation(inventory, opened) {
  const entry = opened && inventory.resolver(opened.id);
  if (!entry) return "";
  return `<div class="explicacion" data-explicacion="${escapeHtml(opened.id)}" style="left:${opened.x}px;top:${opened.y}px">${V.explicacion(inventory, entry)}</div>`;
}

/** The id of the hole drawn in the question of Remove From Project (its checkbox). */
export const REMOVE_ITEMS_CHECKBOX = `${PREFIX}.dialog.remove-items.do-not-show-again`;

/** The question that is open over the window, if any: its text, the checkbox that is a hole, OK (the default) and Cancel (s2 Q6). */
function dialog(state) {
  if (!state.dialog) return "";
  const { id, title, text, checkbox } = state.dialog;
  return `<div class="pe-backdrop"><div class="pe-dialog" data-dialog="${id}"><div class="pe-dialog-title">${escapeHtml(title)}</div><div class="pe-dialog-text">${escapeHtml(text)}</div>
<div class="pe-check hueco" data-id="${REMOVE_ITEMS_CHECKBOX}"><span class="pe-checkbox"></span>${escapeHtml(checkbox)}</div>
<div class="pe-dialog-buttons"><button class="pe-dialog-button default" data-answer="ok">OK</button><button class="pe-dialog-button" data-answer="cancel">Cancel</button></div></div></div>`;
}

/** The whole window. `measure`: the width of a text in the window's font; `windowSize`: the page's size, to keep a menu inside it. */
export function projectExplorerWindow(inventory, state, measure, windowSize) {
  return `<div class="pe-window" style="--menu-bar:${MENU_BAR_HEIGHT}px">
  ${menuBarHtml(inventory, state, PREFIX, "pe-menubar")}
  <div class="pe-client">
    ${toolbar(inventory, state)}
    ${tabs(inventory, state)}
    ${tree(state)}
    ${layoutSwitchHtml(state.layout)}
  </div>
  ${openMenu(inventory, state, measure, windowSize)}
  ${dialog(state)}
  ${explanation(inventory, state.abierta)}
</div>`;
}
