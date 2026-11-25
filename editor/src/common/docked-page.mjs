// A page's side of Solder's docked view (DT-101 §7): docked, the page hides its own menus and toolbar (the `docked` class
// on its body) and sends them to the docked window, which shows them once for the active window and sends back what is
// chosen. The page runs it as if its own row or button had been clicked.

/** Finds a page's element by its inventory id, hidden or not. */
const elementWithId = (id) => [...document.querySelectorAll("[data-id]")].find((element) => element.dataset.id === id) ?? null;

/** The events a real press of the mouse gives, in order: a handler may answer any of them (the connector pane answers the press). */
const PRESS_EVENTS = { click: ["mousedown", "mouseup", "click"], contextmenu: ["mousedown", "mouseup", "contextmenu"] };

/**
 * A click, or a right click, on the page's own (hidden) toolbar button, as a real press gives it: the page's handlers do
 * the rest. The button is hidden and has no box, so where the click fell in the toolbar row's copy travels with each
 * event as `dockedAt` (fractions of the button's size), and its place across the row as `clientX`, at the page's top.
 */
function pressToolbarElement(id, from, at) {
  const element = elementWithId(id);
  if (!element) return;
  const kind = from === "toolbar-context" ? "contextmenu" : "click";
  const button = kind === "contextmenu" ? 2 : 0;
  for (const type of PRESS_EVENTS[kind]) {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, button, clientX: at?.clientX ?? 0, clientY: 0 });
    if (at) Object.defineProperty(event, "dockedAt", { value: at });
    element.dispatchEvent(event);
  }
}

/**
 * `hooks`: `{ layoutApi, buildModel(), runMenuRow(id), repaint() }`: the preload's `layout`, the page's menus and toolbar
 * as `{ menus, toolbar }`, running a menu row by its id, and painting the page again. Returns `afterPaint()`, which a page
 * calls after every paint so the docked window always shows what the page shows.
 */
export function connectDockedPage({ layoutApi, buildModel, runMenuRow, repaint }) {
  let docked = false;
  let sent = null;
  // Whether this page is docked, not whether the docked view is on: a window that stays floating keeps its own menus and
  // toolbar (the control editor, opened on 2026-11-25 with none in the docked view).
  const apply = (pageDocked) => {
    docked = pageDocked;
    document.body.classList.toggle("docked", docked);
    sent = null;
    repaint();
  };
  const askWhetherDocked = () => layoutApi?.isPageDocked().then(apply);
  askWhetherDocked();
  layoutApi?.onChanged(askWhetherDocked);
  layoutApi?.onRun(({ id, from, at }) => (from === "menu" ? runMenuRow(id) : pressToolbarElement(id, from, at)));
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
