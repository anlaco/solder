// The page of the docked window's bar (dock-bar-view.mjs): it draws what the main process sends and tells it the clicks.

import { dockBarHtml } from "./dock-bar-view.mjs";

const layout = window.solder.layout;
let state = { tabs: [], shown: null, split: false };

function draw() {
  document.body.innerHTML = dockBarHtml(state);
}

layout.onState((newState) => {
  state = newState;
  draw();
});

document.addEventListener("click", (event) => {
  const close = event.target.closest("[data-dock-close]");
  if (close) return layout.closeTab(close.dataset.dockClose);
  const tab = event.target.closest("[data-dock-tab]");
  if (tab) return layout.activateTab(tab.dataset.dockTab);
  const kind = event.target.closest("[data-dock-kind]");
  if (kind && !kind.disabled && kind.dataset.dockKind !== state.shown) return layout.toggleShown();
  if (event.target.closest("[data-dock-split]:not([disabled])")) layout.toggleSplit();
});

// A middle click closes a tab, as in the editors this view follows.
document.addEventListener("auxclick", (event) => {
  const tab = event.button === 1 && event.target.closest("[data-dock-tab]");
  if (tab) layout.closeTab(tab.dataset.dockTab);
});

draw();
layout.requestState();
