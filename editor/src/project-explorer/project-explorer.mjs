// The Project Explorer window's page (DT-099 §6): it takes the project the main process gives it (or a blank one), paints
// it with project-explorer-view.mjs and turns clicks and keys into project-explorer-state.mjs. What touches windows and
// files (creating, opening, saving and closing a project, the Window menu's list) is asked of the main process.

import { ProjectFileError, blankProject, readProject } from "../../../core/model/project.mjs";
import { atajo, cargarInventario, esHueco, pulsa, ultimo } from "../common/labview-inventory.mjs";
import { installPageFont } from "../common/page-font.mjs";
import * as E from "../window/window-state.mjs";
import * as State from "./project-explorer-state.mjs";
import { PREFIX, projectExplorerWindow } from "./project-explorer-view.mjs";
import { WINDOW_MENU, listedIndexOf } from "./window-menu.mjs";

const measure = installPageFont();
const windowSize = () => ({ width: innerWidth, height: innerHeight });
const solder = window.solder;
const inventory = await fetch("/inventario.json").then((response) => response.json()).then(cargarInventario);

const info = (await solder?.project.start()) ?? { text: null, name: "Untitled Project 1" };

/** The window for what the main process gave: a project's text, or null for a blank one. */
function initialState() {
  if (info.text === null) return State.fromProject(blankProject(), info.name);
  return State.fromProject(readProject(info.text), info.name, { opened: true });
}

let state;
try {
  state = initialState();
} catch (error) {
  if (!(error instanceof ProjectFileError)) throw error;
  solder?.project.error(error.message);
}

const paint = () => {
  document.body.innerHTML = projectExplorerWindow(inventory, state, measure, windowSize());
};

/** Every change here is only of the window's own state, painted at once. */
const show = (newState) => {
  state = newState;
  paint();
};

/** The window list the Window menu shows, as the main process gave it when the menu was opened. */
const openBarMenu = async (title) => {
  const windowRows = title.dataset.id === WINDOW_MENU ? ((await solder?.project.windowList()) ?? []) : [];
  show(E.abrirMenuBarra({ ...state, abierta: null, windowRows }, inventory, title.dataset.id, anchorBelow(title)));
};

const anchorBelow = (element) => {
  const box = element.getBoundingClientRect();
  return { x: box.left, y: box.bottom };
};

/** Where a hole's explanation opens: under the element that was clicked. */
const explain = (id, element) => {
  const box = element.getBoundingClientRect();
  return show(E.clic({ ...state, menuBarra: null }, inventory, id, { x: box.left, y: box.bottom + 2 }));
};

/** What the built rows of the menus and the toolbar do: each asks the main process, which owns the windows. */
const MENU_ACTIONS = {
  newOvi: () => solder?.nuevoOVI(),
  newDialog: () => solder?.nuevo(),
  open: () => solder?.abrir(),
  createProject: () => solder?.project.create(),
  openProject: () => solder?.project.open(),
  saveProject: () => solder?.project.save(),
  close: () => solder?.project.close(),
  exit: () => solder?.salir(),
};

function runMenuCommand(id) {
  const contextCommand = State.CONTEXT_COMMANDS[id];
  if (id.startsWith("context.") && !contextCommand) return show(State.runContextCommand(state, id));
  show({ ...state, menuBarra: null });
  MENU_ACTIONS[contextCommand ?? State.MENU_COMMANDS[ultimo(id)]]?.();
}

/** A row of the list of windows in the Window menu: its window comes to the front. */
function activateListedWindow(row) {
  const listed = state.windowRows[listedIndexOf(row.dataset.id)];
  show({ ...state, menuBarra: null });
  if (listed) solder?.project.activateWindow(listed.key);
}

function clickMenuRow(row) {
  const id = row.dataset.id;
  if (row.classList.contains("desactivado")) return;
  if (listedIndexOf(id) >= 0) return activateListedWindow(row);
  if (inventory.tieneContenido(id)) return show(State.openSubmenu(state, id));
  if (!esHueco(inventory.resolver(id))) return runMenuCommand(id);
  explain(id, row);
}

/** A click on the window's own controls: the tree's rows, the tabs and the toolbar. */
function clickControl(target) {
  const expander = target.closest("[data-expander]");
  if (expander) return show(State.toggleExpanded(state, expander.dataset.expander));
  const row = target.closest("[data-key]");
  if (row) return show(State.select(state, row.dataset.key));
  const control = target.closest("[data-id]");
  if (!control || control.classList.contains("desactivado")) return;
  const tab = control.dataset.tab;
  if (tab && !esHueco(inventory.resolver(control.dataset.id))) return show(State.setTab(state, tab));
  const toolbarCommand = control.dataset.id.startsWith(`${PREFIX}.toolbar.`) && !esHueco(inventory.resolver(control.dataset.id)) && State.TOOLBAR_COMMANDS[ultimo(control.dataset.id)];
  if (toolbarCommand) return MENU_ACTIONS[toolbarCommand]?.();
  if (esHueco(inventory.resolver(control.dataset.id) ?? { estado: "todo" })) explain(control.dataset.id, control);
}

document.addEventListener("click", (event) => {
  if (event.target.closest(".explicacion")) return;
  const menuRow = state.menuBarra && event.target.closest(".item-menu");
  if (menuRow) return clickMenuRow(menuRow);
  const title = event.target.closest(".menu");
  if (title) return openBarMenu(title);
  const wasOpen = state.abierta || state.menuBarra;
  state = { ...state, abierta: null, menuBarra: null };
  clickControl(event.target);
  if (wasOpen) paint();
});

// The right button on a row selects it and opens the menu of its kind.
document.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  const row = event.target.closest("[data-key]");
  if (row) show(State.openContextMenu({ ...state, abierta: null }, inventory, row.dataset.key, { x: event.clientX, y: event.clientY }));
});

// Over another title of the bar while a menu is open, that menu opens; over a row with a submenu, the submenu.
document.addEventListener("mouseover", (event) => {
  if (!state.menuBarra) return;
  const title = event.target.closest(".menu");
  if (title && title.dataset.id !== state.menuBarra.id && inventory.tieneContenido(title.dataset.id)) {
    return openBarMenu(title);
  }
  const row = event.target.closest(".item-menu");
  if (row && !row.classList.contains("desactivado")) {
    const next = State.hoverMenuRow(state, inventory, row.dataset.id);
    if (next !== state) show(next);
  }
});

/** Ctrl+N, Ctrl+O, Ctrl+W and Ctrl+Q run the built rows; the shortcut of one that is not built shows its explanation (rule 53). */
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") return show(E.escape(state));
  const pressed = { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey, alt: event.altKey, tecla: event.key };
  if (!pressed.ctrl) return;
  const entry = inventory.entradas.find((candidate) => candidate.id.startsWith(`${PREFIX}.menu.`) && candidate.atajo && pulsa(atajo(candidate.atajo), pressed));
  if (!entry) return;
  event.preventDefault();
  if (esHueco(entry)) return show({ ...state, menuBarra: null, abierta: { id: entry.id, x: 40, y: 40 } });
  runMenuCommand(entry.id);
});

solder?.project.onRenamed((name) => show(State.rename(state, name)));
if (state) paint();
