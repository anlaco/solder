// The docked window's one toolbar row (DT-101 §7): it draws the active window's toolbar as that page sent it
// (`{ kind, windowClasses, html }`) and sends each click back, so the page runs it as its own.

const layout = window.solder.layout;

/** The row's HTML: the page's toolbar inside the classes its own window has, so the same stylesheets draw it the same. */
function rowHtml(toolbar) {
  if (!toolbar) return "";
  return `<div class="dock-toolbar-row ${toolbar.windowClasses}">${toolbar.html}</div>`;
}

layout.onToolbar((toolbar) => {
  document.body.innerHTML = rowHtml(toolbar);
});

const commandOf = (event) => event.target.closest("[data-id]")?.dataset.id;

/**
 * Where the click fell: in its button, as fractions of the button's width and height, which a button whose cells mean
 * different things (the connector pane) needs, since the page's own button is hidden and has no box to measure; and
 * across the row, `clientX`, where the page opens a menu the click asks for, just under the row.
 */
function placeInButton(event) {
  const box = event.target.closest("[data-id]").getBoundingClientRect();
  return { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height, clientX: event.clientX };
}

document.addEventListener("click", (event) => {
  const id = commandOf(event);
  if (id) layout.toolbarClick(id, "toolbar", placeInButton(event));
});

document.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  const id = commandOf(event);
  if (id) layout.toolbarClick(id, "toolbar-context", placeInButton(event));
});

layout.requestToolbar();
