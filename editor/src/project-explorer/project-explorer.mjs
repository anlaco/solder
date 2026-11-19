// The Project Explorer window's page (DT-099 §6): it takes the project the main process gives it (or a blank one), paints
// it with project-explorer-view.mjs and turns clicks and keys into project-explorer-state.mjs. What touches windows and
// files (creating, opening, saving and closing a project, the Window menu's list, the dialogs that choose what to add) is
// asked of the main process; the tree's own edits are project-explorer-edit.mjs's, run through project-explorer-commands.mjs.

import { ProjectFileError, blankProject, readProject } from "../../../core/model/project.mjs";
import { atajo, cargarInventario, esHueco, pulsa, ultimo } from "../common/labview-inventory.mjs";
import { installPageFont } from "../common/page-font.mjs";
import * as E from "../window/window-state.mjs";
import * as Edit from "./project-explorer-edit.mjs";
import { createTreeCommands } from "./project-explorer-commands.mjs";
import * as State from "./project-explorer-state.mjs";
import { PREFIX, greyedRows, projectExplorerWindow } from "./project-explorer-view.mjs";
import { WINDOW_MENU, listedIndexOf } from "./window-menu.mjs";
import { nextLayout } from "./layout-switch.mjs";
import { connectDockedPage, outerHtmlOf } from "../common/docked-page.mjs";
import { menuBarModel } from "../common/native-menu-model.mjs";

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
/** Its part of the docked view (common/docked-page.mjs), connected once everything is declared. */
let docking = null;
try {
  state = initialState();
} catch (error) {
  if (!(error instanceof ProjectFileError)) throw error;
  solder?.project.error(error.message);
}

const paint = () => {
  document.body.innerHTML = projectExplorerWindow(inventory, state, measure, windowSize());
  // A name being edited in place opens with its text selected (measured: s2 Q2).
  const textBox = document.querySelector(".pe-edit");
  textBox?.focus();
  textBox?.select();
  docking?.afterPaint();
};

/** Every change here is only of the window's own state, painted at once. */
const show = (newState) => {
  state = newState;
  paint();
};

/** Typing in the name being edited changes the state without painting, which would take the focus from the text box. */
const update = (newState) => {
  state = newState;
};

/** Where a shortcut's explanation opens, as for the shortcuts of the menus. */
const explainHole = (id) => show({ ...state, menuBarra: null, abierta: { id, x: 40, y: 40 } });

const treeCommands = createTreeCommands({ getState: () => state, show, update, explainHole, solder });

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
  // The explorer's File ▸ New OVI makes the OVI in this project (measured: reports/2026-11-19-project-new-vi.md Q6).
  newOvi: () => treeCommands.newOvi(),
  newDialog: () => solder?.nuevo(),
  open: () => solder?.abrir(),
  createProject: () => solder?.project.create(),
  openProject: () => solder?.project.open(),
  saveProject: () => solder?.project.save(),
  close: () => solder?.project.close(),
  exit: () => solder?.salir(),
  ...Object.fromEntries(["addFile", "addSnapshotFolder", "addAutoPopulatingFolder", "newVirtualFolder", "newOviInto", "rename", "removeFromProject"].map((name) => [name, () => treeCommands[name]()])),
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

/** The question of Remove From Project is modal: its buttons answer it, its checkbox (a hole) explains itself, and the rest of the window is shut. */
function clickDialog(target) {
  const answer = target.closest("[data-answer]")?.dataset.answer;
  if (answer === "ok") return treeCommands.confirmRemove();
  if (answer === "cancel") return treeCommands.cancelDialog();
  const hole = target.closest("[data-id]");
  if (hole) explain(hole.dataset.id, hole);
}

document.addEventListener("click", (event) => {
  if (event.target.closest(".explicacion")) return;
  if (state.dialog) return clickDialog(event.target);
  // A click anywhere but in the text box ends the edit of a name, keeping what was typed.
  if (state.edit && !event.target.closest(".pe-edit")) treeCommands.commitEdit();
  const menuRow = state.menuBarra && event.target.closest(".item-menu");
  if (menuRow) return clickMenuRow(menuRow);
  // Solder's docked view on or off (DT-101): every window moves, and every Project Explorer's switch follows.
  if (event.target.closest("[data-layout-switch]")) return solder?.layout.set(nextLayout(state.layout));
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

document.addEventListener("input", (event) => {
  if (event.target.classList.contains("pe-edit")) treeCommands.typeEdit(event.target.value);
});

// Dragging a row: it is dropped only where it can go (My Computer or a virtual folder), which is what allows the drop.
let draggedKey = null;
document.addEventListener("dragstart", (event) => {
  draggedKey = event.target.closest?.("[data-key]")?.dataset.key ?? null;
  event.dataTransfer?.setData("text/plain", draggedKey ?? "");
});
document.addEventListener("dragover", (event) => {
  const key = event.target.closest?.("[data-key]")?.dataset.key;
  if (draggedKey && key && Edit.canDrop(state, draggedKey, key)) event.preventDefault();
});
document.addEventListener("drop", (event) => {
  event.preventDefault();
  const key = event.target.closest?.("[data-key]")?.dataset.key;
  if (draggedKey && key) treeCommands.drop(draggedKey, key);
  draggedKey = null;
});
document.addEventListener("dragend", () => {
  draggedKey = null;
});

/** The keys of the open question (Enter is OK, the default button; Escape cancels) and of a name being edited (Enter commits, Escape cancels). */
function modalKey(event) {
  if (event.key !== "Enter" && event.key !== "Escape") return;
  event.preventDefault();
  if (state.dialog) return event.key === "Enter" ? treeCommands.confirmRemove() : treeCommands.cancelDialog();
  return event.key === "Enter" ? treeCommands.commitEdit() : treeCommands.cancelEdit();
}

/**
 * Ctrl+N, Ctrl+O, Ctrl+W and Ctrl+Q run the built rows; the shortcut of one that is not built shows its explanation (rule 53).
 * F2 renames. The Delete key does not remove: LabVIEW's Edit ▸ Remove From Project has no shortcut (inventory), so none is kept.
 */
document.addEventListener("keydown", (event) => {
  if (state.dialog || state.edit) return modalKey(event);
  if (event.key === "Escape") return show(E.escape(state));
  if (event.key === "F2") {
    event.preventDefault();
    return treeCommands.rename();
  }
  const pressed = { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey, alt: event.altKey, tecla: event.key };
  if (!pressed.ctrl) return;
  const entry = inventory.entradas.find((candidate) => candidate.id.startsWith(`${PREFIX}.menu.`) && candidate.atajo && pulsa(atajo(candidate.atajo), pressed));
  if (!entry) return;
  event.preventDefault();
  if (esHueco(entry)) return show({ ...state, menuBarra: null, abierta: { id: entry.id, x: 40, y: 40 } });
  runMenuCommand(entry.id);
});

solder?.project.onRenamed((name) => show(State.rename(state, name)));
// The main process rebased the stored paths when an untitled project was first saved: the window holds the project it now keeps.
solder?.project.onRebased((text) => show({ ...state, project: readProject(text) }));
solder?.project.onNewOviSaved?.((saved) => treeCommands.newOviSaved(saved));
solder?.project.onNewOviClosed?.((entryId) => treeCommands.newOviClosed(entryId));
/** The explorer's menus and toolbar for the docked window's own (DT-101 §7). */
const dockedChromeModel = () => ({
  menus: menuBarModel(inventory, PREFIX, { variantOf: (id) => ({ desactivados: greyedRows(state, id) }) }),
  toolbar: { kind: "project", windowClasses: "pe-window", html: outerHtmlOf(".pe-toolbar") },
});

/** A row chosen in the docked window's native menu: done as a click on it here; a hole is explained near the top left. */
function runDockedMenuRow(id) {
  if (!esHueco(inventory.resolver(id))) return runMenuCommand(id);
  explainHole(id);
}

docking = connectDockedPage({ layoutApi: solder?.layout, buildModel: dockedChromeModel, runMenuRow: runDockedMenuRow, repaint: () => state && paint() });
solder?.layout.onChanged((layout) => show({ ...state, layout }));
if (state) paint();
solder?.layout.get().then((layout) => show({ ...state, layout }));
