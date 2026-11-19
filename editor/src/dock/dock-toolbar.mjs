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

document.addEventListener("click", (event) => {
  const id = commandOf(event);
  if (id) layout.toolbarClick(id, "toolbar");
});

document.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  const id = commandOf(event);
  if (id) layout.toolbarClick(id, "toolbar-context");
});

layout.requestToolbar();
