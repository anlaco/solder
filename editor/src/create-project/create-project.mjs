// The Create Project dialog's page: its own window, opened by File ▸ Create Project... over the window that asked. Finish
// gives the choice to the main process, which opens the window of what was chosen; a project first asks the Open Items
// question when OVIs are open (create-project-state.mjs).

import { cargarInventario } from "../common/labview-inventory.mjs";
import { installPageFont } from "../common/page-font.mjs";
import * as E from "../window/window-state.mjs";
import * as State from "./create-project-state.mjs";
import { createProjectDialog } from "./create-project-view.mjs";

installPageFont();
const solder = window.solder;
const inventory = await fetch("/inventario.json").then((response) => response.json()).then(cargarInventario);
const { oviOpen } = (await solder?.createProject.start()) ?? { oviOpen: false };
let state = State.initialState();

/** Repainting replaces the page, so the list keeps where it was scrolled. */
function paint() {
  const scrolled = document.querySelector(".cp-list")?.scrollTop ?? 0;
  document.body.innerHTML = createProjectDialog(inventory, state);
  const list = document.querySelector(".cp-list");
  if (list) list.scrollTop = scrolled;
}

function show(newState) {
  state = newState;
  paint();
}

const anchorBelow = (element) => {
  const box = element.getBoundingClientRect();
  return { x: box.left, y: box.bottom + 2 };
};

const partName = (element) => element.dataset.id.slice(element.dataset.id.lastIndexOf(".") + 1);

/** What a Finish or a Don't Add decided: create something, give up, or stay in the dialog. */
function follow(outcome) {
  if (outcome.cancelled) return solder?.createProject.cancel();
  if (outcome.create) return solder?.createProject.finish(outcome.create);
  show(outcome.state);
}

function clickOpenItems(target) {
  const part = target.closest("[data-id]");
  if (!part) return paint();
  if (partName(part) === "do-not-show-again") return show(E.clic(state, inventory, part.dataset.id, anchorBelow(part)));
  follow(State.pressOpenItemsButton(state, partName(part), anchorBelow(part)));
}

function clickDialog(target) {
  const part = target.closest("[data-id]");
  if (!part) return paint();
  const anchor = anchorBelow(part);
  if (part.dataset.row) return show(State.select(state, part.dataset.row, anchor));
  if (part.dataset.tree) return show(State.selectTree(state, part.dataset.tree, anchor));
  if (partName(part) === "finish") return follow(State.finish(state, { oviOpen }));
  if (partName(part) === "cancel") return solder?.createProject.cancel();
  show(E.clic(state, inventory, part.dataset.id, anchor));
}

document.addEventListener("click", (event) => {
  if (event.target.closest(".explicacion")) return;
  state = { ...state, abierta: null };
  if (state.openItems) return clickOpenItems(event.target);
  clickDialog(event.target);
});

document.addEventListener("dblclick", (event) => {
  if (event.target.closest("[data-row]") && State.selectedCreation(state) && !state.openItems) follow(State.finish(state, { oviOpen }));
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !state.openItems) return follow(State.finish(state, { oviOpen }));
  if (event.key === "Escape") return state.abierta ? show(E.escape(state)) : solder?.createProject.cancel();
});

paint();
