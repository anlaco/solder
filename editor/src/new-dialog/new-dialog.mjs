// The New dialog's page: its own window, opened by File ▸ New... over the window that asked. OK gives the choice to the
// main process, which opens the window of what was chosen.

import { cargarInventario } from "../common/labview-inventory.mjs";
import { installPageFont } from "../common/page-font.mjs";
import * as E from "../window/window-state.mjs";
import * as State from "./new-dialog-state.mjs";
import { newDialog } from "./new-dialog-view.mjs";

installPageFont();
const solder = window.solder;
const inventory = await fetch("/inventario.json").then((response) => response.json()).then(cargarInventario);
let state = State.initialState();

function paint() {
  document.body.innerHTML = newDialog(inventory, state);
}

function accept() {
  const creation = State.acceptedCreation(state);
  if (creation) solder?.dialogoNuevo.aceptar(creation);
}

document.addEventListener("click", (event) => {
  if (event.target.closest(".explicacion")) return;
  state = { ...state, abierta: null };
  const target = event.target.closest("[data-id]");
  if (!target) return paint();
  const anchor = { x: target.getBoundingClientRect().left, y: target.getBoundingClientRect().bottom + 2 };
  const part = target.dataset.id.slice(target.dataset.id.lastIndexOf(".") + 1);
  if (target.dataset.item) {
    state = State.select(state, inventory, target.dataset.item, anchor);
    return paint();
  }
  if (part === "ok" && !target.classList.contains("desactivado")) return accept();
  if (part === "cancel") return solder?.dialogoNuevo.cancelar();
  // A folder, Help and what is not done are explained (rule 53).
  state = E.clic(state, inventory, target.dataset.id, anchor);
  paint();
});

document.addEventListener("dblclick", (event) => {
  if (event.target.closest("[data-item]") && State.acceptedCreation(state)) accept();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter") return accept();
  if (event.key === "Escape") return state.abierta ? ((state = E.escape(state)), paint()) : solder?.dialogoNuevo.cancelar();
});

paint();
