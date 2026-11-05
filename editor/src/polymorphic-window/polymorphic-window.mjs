// The Polymorphic OVI window's page (DT-074 §5): it loads the `.sdp` the main process gives it (or a new, empty one), paints
// with polymorphic-window-view.mjs and turns clicks and keys into polymorphic-window-state.mjs. The disk and the
// system dialogs belong to the main process (electron/main.mjs); the page only passes text, as the VI windows do.

import { atajo, cargarInventario, esHueco, pulsa, ultimo } from "../common/labview-inventory.mjs";
import { installPageFont } from "../common/page-font.mjs";
import * as Paths from "../common/vi-paths.mjs";
import * as E from "../window/window-state.mjs";
import * as State from "./polymorphic-window-state.mjs";
import { NAME_DIALOG, PREFIX, polymorphicWindow } from "./polymorphic-window-view.mjs";

const measure = installPageFont();
const windowSize = () => ({ width: innerWidth, height: innerHeight });
const solder = window.solder;
const inventory = await fetch("/inventario.json").then((response) => response.json()).then(cargarInventario);

const info = (await solder?.iniciar()) ?? { id: "0", text: null, key: Paths.untitledKey(0), name: "Untitled 1", untitledNumber: 1 };
/** The path this polymorphic OVI is saved at, or the key of an untitled one: its instances are stored relative to it. */
let key = info.key;
const oviLibRoot = info.oviLibRoot ?? "";

let state = State.emptyState();
if (info.text !== null) {
  try {
    state = State.fromText(info.text);
  } catch (error) {
    solder?.error(error.message);
    solder?.cerrar();
  }
}

function paint() {
  document.body.innerHTML = polymorphicWindow(inventory, state, measure, windowSize());
}

/** The window has changed: the main process compares its text with the saved one for the asterisk and the Close question. */
function change(newState) {
  const edited = State.toText(newState) !== State.toText(state);
  state = newState;
  if (edited) solder?.cambio(State.toText(state));
  paint();
}

/** A change that is only of the window's own state (a menu, an explanation, the selection) is painted, not reported. */
const show = (newState) => {
  state = newState;
  paint();
};

const anchorBelow = (element) => {
  const box = element.getBoundingClientRect();
  return { x: box.left, y: box.bottom };
};

// ——— The commands of the buttons ———

async function addInstance() {
  const chosen = await solder?.elegirInstancia();
  if (chosen) change(State.addInstance(state, Paths.storedPathFor(key, chosen, oviLibRoot)));
}

/** Edit Icon...: LabVIEW opens its Icon Editor; Solder has none yet, so the icon is an SVG file (a Solder deviation, spec rule 123). */
async function editIcon() {
  const text = await solder?.elegirIcono();
  if (text === null || text === undefined) return;
  if (!State.isIconDocument(text)) return solder?.avisar("The file is not an SVG icon.", "Choose an SVG document of up to 64 KB.");
  change(State.setIcon(state, text));
}

/** Save and Save As: the main process writes the `.sdp` and gives back its text, with the instances' paths rebased to the new file. */
async function save(saveAs) {
  const saved = await solder?.guardar(State.toText(state), saveAs);
  if (!saved) return;
  key = saved.ruta;
  state = { ...State.fromText(saved.texto), selected: state.selected };
  paint();
}

const BUTTONS = {
  "edit-icon": () => editIcon(),
  "move-up": () => change(State.moveSelected(state, -1)),
  "move-down": () => change(State.moveSelected(state, 1)),
  add: () => addInstance(),
  remove: () => change(State.removeSelected(state)),
  "edit-name": () => show(State.openNameDialog(state)),
  "draw-polymorphic-icon": () => change(State.setDrawIcon(state, State.DRAW_ICON.POLYMORPHIC)),
  "draw-instance-icon": () => change(State.setDrawIcon(state, State.DRAW_ICON.INSTANCE)),
  "show-selector-by-default": () => change(State.toggleShowSelectorByDefault(state)),
  "allow-adapt": () => change(State.toggleAdaptToDataType(state)),
};

const MENU_ACTIONS = {
  newOvi: () => solder?.nuevoVI(),
  newDialog: () => solder?.nuevo(),
  open: () => solder?.abrir(),
  close: () => solder?.cerrarVentana(),
  save: () => save(false),
  saveAs: () => save(true),
  exit: () => solder?.salir(),
};
const runMenuCommand = (id) => MENU_ACTIONS[State.MENU_COMMANDS[ultimo(id)]]?.();

// ——— Events ———

function clickMenuRow(row) {
  const id = row.dataset.id;
  if (row.classList.contains("desactivado")) return;
  if (!esHueco(inventory.resolver(id))) {
    show({ ...state, menuBarra: null });
    return runMenuCommand(id);
  }
  const box = row.getBoundingClientRect();
  show(E.clic({ ...state, menuBarra: null }, inventory, id, { x: box.left, y: box.bottom + 2 }));
}

function clickNameDialog(target) {
  const part = target.closest("[data-id]")?.dataset.id;
  if (part === `${NAME_DIALOG}.ok`) return change(State.acceptNameDialog(state));
  if (part === `${NAME_DIALOG}.cancel`) return show(State.cancelNameDialog(state));
  if (part === `${NAME_DIALOG}.help`) {
    const box = target.closest("[data-id]").getBoundingClientRect();
    return show(E.clic(state, inventory, part, { x: box.left, y: box.bottom + 2 }));
  }
  const field = target.closest("[data-field]")?.dataset.field;
  if (field) show({ ...state, nameDialog: { ...state.nameDialog, focus: field } });
}

document.addEventListener("click", (event) => {
  if (event.target.closest(".explicacion")) return;
  if (state.nameDialog) return clickNameDialog(event.target);
  const menuRow = state.menuBarra && event.target.closest(".item-menu");
  if (menuRow) return clickMenuRow(menuRow);
  const title = event.target.closest(".menu");
  if (title) return show(E.abrirMenuBarra({ ...state, abierta: null }, inventory, title.dataset.id, anchorBelow(title)));
  const wasOpen = state.abierta || state.menuBarra;
  state = { ...state, abierta: null, menuBarra: null };
  const row = event.target.closest("[data-row]");
  if (row) return show(State.select(state, Number(row.dataset.row)));
  const control = event.target.closest("[data-id]");
  if (!control || control.classList.contains("desactivado")) return wasOpen ? paint() : undefined;
  const handler = BUTTONS[ultimo(control.dataset.id)];
  // What is not done greys and explains itself (rule 53); what is done runs.
  if (esHueco(inventory.resolver(control.dataset.id) ?? { estado: "todo" }) || !handler) {
    const box = control.getBoundingClientRect();
    return show(E.clic(state, inventory, control.dataset.id, { x: box.left, y: box.bottom + 2 }));
  }
  handler();
});

document.addEventListener("mouseover", (event) => {
  if (!state.menuBarra) return;
  const title = event.target.closest(".menu");
  if (title && title.dataset.id !== state.menuBarra.id && inventory.tieneContenido(title.dataset.id)) {
    show(E.abrirMenuBarra({ ...state, menuBarra: null }, inventory, title.dataset.id, anchorBelow(title)));
  }
});

document.addEventListener("keydown", (event) => {
  if (state.nameDialog) {
    if (event.key === "Enter") return change(State.acceptNameDialog(state));
    if (event.key === "Escape") return show(State.cancelNameDialog(state));
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const field = state.nameDialog.focus;
    return show(State.typeInNameDialog(state, field, State.typedText(state.nameDialog[field], event.key)));
  }
  if (event.key === "Escape") return show(E.escape(state));
  const pressed = { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey, alt: event.altKey, tecla: event.key };
  if (!pressed.ctrl) return;
  const entry = inventory.entradas.find((candidate) => candidate.id.startsWith(`${PREFIX}.menu.`) && candidate.atajo && pulsa(atajo(candidate.atajo), pressed));
  if (!entry) return;
  event.preventDefault();
  if (esHueco(entry)) return show({ ...state, menuBarra: null, abierta: { id: entry.id, x: 40, y: 40 } });
  runMenuCommand(entry.id);
});

// The first text reported is the saved version: an asterisk appears only after an edit.
solder?.cambio(State.toText(state));
paint();
