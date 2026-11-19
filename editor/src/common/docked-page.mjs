// A page's side of Solder's docked view (DT-101 §7): docked, the page hides its own menus and toolbar (the `docked` class
// on its body) and sends them to the docked window, which shows them once for the active window and sends back what is
// chosen. The page runs it as if its own row or button had been clicked.

/** Finds a page's element by its inventory id, hidden or not. */
const elementWithId = (id) => [...document.querySelectorAll("[data-id]")].find((element) => element.dataset.id === id) ?? null;

/** A click, or a right click, on the page's own (hidden) toolbar button: the page's handlers do the rest. */
function pressToolbarElement(id, from) {
  const element = elementWithId(id);
  if (!element) return;
  const type = from === "toolbar-context" ? "contextmenu" : "click";
  element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: type === "contextmenu" ? 2 : 0 }));
}

/**
 * `hooks`: `{ layoutApi, buildModel(), runMenuRow(id), repaint() }`: the preload's `layout`, the page's menus and toolbar
 * as `{ menus, toolbar }`, running a menu row by its id, and painting the page again. Returns `afterPaint()`, which a page
 * calls after every paint so the docked window always shows what the page shows.
 */
export function connectDockedPage({ layoutApi, buildModel, runMenuRow, repaint }) {
  let docked = false;
  let sent = null;
  const apply = (layout) => {
    docked = layout === "docked";
    document.body.classList.toggle("docked", docked);
    sent = null;
    repaint();
  };
  layoutApi?.get().then(apply);
  layoutApi?.onChanged(apply);
  layoutApi?.onRun(({ id, from }) => (from === "menu" ? runMenuRow(id) : pressToolbarElement(id, from)));
  return {
    isDocked: () => docked,
    afterPaint() {
      if (!docked || !layoutApi) return;
      const model = buildModel();
      const text = JSON.stringify(model);
      if (text === sent) return;
      sent = text;
      layoutApi.sendModel(model);
    },
  };
}

/** The HTML of the page's elements matching `selector`, for the docked window's toolbar row to draw as the page does. */
export const outerHtmlOf = (selector) => [...document.querySelectorAll(selector)].map((element) => element.outerHTML).join("");
