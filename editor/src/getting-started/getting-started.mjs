// The Getting Started window's page: it loads what the main process remembers, paints with
// getting-started-view.mjs and turns clicks and keys into getting-started-state.mjs and window-state.mjs
// (the menu bar and the explanation of a greyed item, rule 53), as the VI windows do.

import { atajo, cargarInventario, esHueco, pulsa, ultimo } from "../common/labview-inventory.mjs";
import * as E from "../window/window-state.mjs";
import * as State from "./getting-started-state.mjs";
import { gettingStartedWindow } from "./getting-started-view.mjs";

const PREFIX = "window.getting-started";
const RECENT_FILE_ROW = /\.recent-files\.file-(\d+)$/;
const FULL_SIZE_FONT = "12px";
const SUBSTITUTE_FONT = "11.3px";

/** Whether a font is installed: `document.fonts.check` does not work for system fonts. */
function isInstalled(font) {
  const context = document.createElement("canvas").getContext("2d");
  const widthIn = (family) => {
    context.font = `72px ${family}`;
    return context.measureText("Solder abcdefghij 0123456789").width;
  };
  return widthIn(`"${font}", monospace`) !== widthIn("monospace");
}
// Segoe UI at 12 px, LabVIEW's font; otherwise Noto Sans at 11.3 px, which matches its widths (spec/06-visual.md §10).
const hasSegoe = isInstalled("Segoe UI");
document.documentElement.style.setProperty("--fuente", hasSegoe ? FULL_SIZE_FONT : SUBSTITUTE_FONT);
document.body.style.setProperty("--escala", hasSegoe ? "1" : String(11.3 / 12));
document.title = "Solder";

const measureCanvas = document.createElement("canvas").getContext("2d");
const measure = (text) => {
  measureCanvas.font = `${getComputedStyle(document.documentElement).getPropertyValue("--fuente")} "Segoe UI", "Noto Sans", sans-serif`;
  return measureCanvas.measureText(text).width;
};
const windowSize = () => ({ width: innerWidth, height: innerHeight });

const inventory = await fetch("/inventario.json").then((response) => response.json()).then(cargarInventario);
const solder = window.solder;
let state = State.pageState((await solder?.inicio.iniciar()) ?? {});

function paint() {
  document.body.innerHTML = gettingStartedWindow(inventory, state, measure, windowSize);
}

function change(newState) {
  state = newState;
  paint();
}

const anchorBelow = (element) => {
  const box = element.getBoundingClientRect();
  return { x: box.left, y: box.bottom };
};

/** What the built rows of the menu bar do: each one asks the main process, which owns the windows. */
const COMMANDS = {
  newVI: () => solder?.nuevoVI(),
  open: () => solder?.abrir(),
  exit: () => solder?.salir(),
};
const runBuiltItem = (id) => COMMANDS[State.MENU_COMMANDS[ultimo(id)]]?.();

function clickMenuRow(row) {
  const id = row.dataset.id;
  if (row.classList.contains("desactivado")) return;
  if (RECENT_FILE_ROW.test(id)) {
    const filePath = state.recentFiles[Number(RECENT_FILE_ROW.exec(id)[1])];
    change({ ...state, menuBarra: null });
    return solder?.inicio.abrirReciente(filePath);
  }
  if (id === `${PREFIX}.menu.file.recent-files`) return change({ ...state, menuBarra: { ...state.menuBarra, abierto: id } });
  const entry = inventory.resolver(id);
  if (!esHueco(entry)) {
    change({ ...state, menuBarra: null });
    return runBuiltItem(id);
  }
  const box = row.getBoundingClientRect();
  change(E.clic({ ...state, menuBarra: null }, inventory, id, { x: box.left, y: box.bottom + 2 }));
}

/** Runs what was clicked outside the menus; returns whether it painted. */
function clickElement(target, filterWasOpen) {
  const action = target.closest("[data-action]")?.dataset.action;
  if (action === "previous") return change(State.stepCarousel(state, -1)), true;
  if (action === "next") return change(State.stepCarousel(state, 1)), true;
  if (action === "collapse") return change(State.toggleCollapsed(state)), true;
  if (action === "open-existing") return solder?.abrir(), false;
  if (target.closest("[data-combo]")) return filterWasOpen ? false : (change(State.toggleFilterList(state)), true);
  const filter = target.closest("[data-filter]");
  if (filter) return change(State.chooseFilter(state, filter.dataset.filter)), true;
  const recent = target.closest("[data-path]");
  if (recent) return solder?.inicio.abrirReciente(recent.dataset.path), false;
  const greyed = target.closest("[data-id]");
  if (!greyed) return false;
  const box = greyed.getBoundingClientRect();
  return change(E.clic(state, inventory, greyed.dataset.id, { x: box.left, y: box.bottom + 2 })), true;
}

document.addEventListener("click", (event) => {
  if (event.target.closest(".explicacion")) return;
  const menuRow = state.menuBarra && event.target.closest(".item-menu");
  if (menuRow) return clickMenuRow(menuRow);
  const title = event.target.closest(".menu");
  if (title) return change(E.abrirMenuBarra({ ...state, abierta: null }, inventory, title.dataset.id, anchorBelow(title)));
  // Any other click closes what was open (menu, explanation, filter list) before doing what it was for.
  const filterWasOpen = state.filterOpen;
  const somethingWasOpen = filterWasOpen || state.abierta || state.menuBarra;
  state = { ...state, abierta: null, menuBarra: null, filterOpen: false };
  const painted = clickElement(event.target, filterWasOpen);
  if (!painted && somethingWasOpen) paint();
});

// Moving over another title of the bar while a menu is open opens that one; over Recent Files, its submenu.
document.addEventListener("mouseover", (event) => {
  if (!state.menuBarra) return;
  const title = event.target.closest(".menu");
  if (title && title.dataset.id !== state.menuBarra.id && inventory.tieneContenido(title.dataset.id)) {
    return change(E.abrirMenuBarra({ ...state, menuBarra: null }, inventory, title.dataset.id, anchorBelow(title)));
  }
  const row = event.target.closest(".item-menu");
  if (!row) return;
  const opensSubmenu = row.dataset.id === `${PREFIX}.menu.file.recent-files` && !row.classList.contains("desactivado");
  const abierto = opensSubmenu ? row.dataset.id : RECENT_FILE_ROW.test(row.dataset.id) ? state.menuBarra.abierto : null;
  if (abierto !== state.menuBarra.abierto) change({ ...state, menuBarra: { ...state.menuBarra, abierto } });
});

/** Ctrl+N, Ctrl+O and Ctrl+Q run the built rows; the shortcut of a greyed one shows its explanation (rule 53). */
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") return change(E.escape({ ...state, filterOpen: false }));
  const pressed = { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey, alt: event.altKey, tecla: event.key };
  if (!pressed.ctrl) return;
  const entry = inventory.entradas.find((candidate) => candidate.id.startsWith(`${PREFIX}.menu.`) && candidate.atajo && pulsa(atajo(candidate.atajo), pressed));
  if (!entry) return;
  event.preventDefault();
  if (esHueco(entry)) return change({ ...state, menuBarra: null, abierta: { id: entry.id, x: 40, y: 40 } });
  runBuiltItem(entry.id);
});

solder?.inicio.alCambiar((saved) => change({ ...state, recentFiles: saved.recentFiles, carouselPage: saved.carouselPage }));
paint();
