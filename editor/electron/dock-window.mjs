// Solder's docked window (DT-101 §2): one BaseWindow holding the active project's explorer on the left, a bar of tabs
// (dock.html) and the active OVI's Front Panel or Block Diagram, or both side by side. The pages are PageWindows
// (page-window.mjs) moved in; where each goes and which tab is active come from dock-layout.mjs.

import { BaseWindow, WebContentsView } from "electron";
import { BLOCK_DIAGRAM, FRONT_PANEL, activateTab, closeTab, dockBounds, emptyDock, isOnScreen, toggleShown, toggleSplit } from "./dock-layout.mjs";

const OVI_KINDS = new Set([FRONT_PANEL, BLOCK_DIAGRAM]);
const DOCK_TITLE = "Solder";

/**
 * `options`: `{ bounds(), backgroundColor, icon, webPreferences, tabBarUrl, tabLabel(id), onCloseTab(id), onCloseWindow() }`.
 * `tabLabel` gives an OVI's tab text; `onCloseTab` closes that OVI as closing its Front Panel would; `onCloseWindow` is
 * the docked window's close button.
 */
export function createDock(options) {
  let state = emptyDock();
  let frame = null;
  let tabBar = null;
  const ovis = new Map();
  let explorers = [];

  function ensureWindow() {
    if (frame && !frame.isDestroyed()) return frame;
    frame = new BaseWindow({ ...options.bounds(), title: DOCK_TITLE, backgroundColor: options.backgroundColor, icon: options.icon, show: false });
    tabBar = new WebContentsView({ webPreferences: options.webPreferences });
    tabBar.setBackgroundColor(options.backgroundColor);
    tabBar.webContents.loadURL(options.tabBarUrl);
    tabBar.webContents.on("did-finish-load", () => sendState());
    frame.contentView.addChildView(tabBar);
    frame.on("resize", () => layout());
    frame.on("close", (event) => {
      event.preventDefault();
      options.onCloseWindow();
    });
    return frame;
  }

  const activeExplorer = () => explorers.at(-1) ?? null;

  function tabsForBar() {
    return state.tabs.map((id) => ({ id, label: options.tabLabel(id), active: id === state.active }));
  }

  function sendState() {
    if (!tabBar || tabBar.webContents.isDestroyed()) return;
    const shown = state.active === null ? null : state.shown[state.active];
    tabBar.webContents.send("dock:state", { tabs: tabsForBar(), shown, split: state.split });
  }

  function placePage(page, bounds, visible) {
    page.view.setVisible(visible);
    if (visible) page.view.setBounds(bounds);
  }

  function layout() {
    if (!frame || frame.isDestroyed()) return;
    const [width, height] = frame.getContentSize();
    const explorer = activeExplorer();
    const bounds = dockBounds({ width, height }, { hasExplorer: !!explorer, split: state.split });
    for (const page of explorers) placePage(page, bounds.explorer, page === explorer);
    for (const [id, kinds] of ovis) {
      for (const [kind, page] of Object.entries(kinds)) placePage(page, bounds[kind], isOnScreen(state, id, kind));
    }
    tabBar.setBounds(bounds.tabBar);
    sendState();
  }

  const isOVIPage = (page) => OVI_KINDS.has(page.kind);

  function attach(page) {
    ensureWindow().contentView.addChildView(page.view);
    if (isOVIPage(page)) {
      ovis.set(page.group, { ...ovis.get(page.group), [page.kind]: page });
      if (page.wanted || !state.tabs.includes(page.group)) state = activateTab(state, page.group, page.wanted ? page.kind : undefined);
    } else if (!explorers.includes(page)) {
      explorers = [...explorers, page];
    }
    layout();
    if (page.wanted) frame.show();
  }

  function detach(page) {
    if (frame && !frame.isDestroyed()) frame.contentView.removeChildView(page.view);
    if (isOVIPage(page)) {
      const { [page.kind]: _gone, ...rest } = ovis.get(page.group) ?? {};
      if (Object.keys(rest).length) ovis.set(page.group, rest);
      else {
        ovis.delete(page.group);
        state = closeTab(state, page.group);
      }
    } else {
      explorers = explorers.filter((explorer) => explorer !== page);
    }
    if (!ovis.size && !explorers.length) closeEmpty();
    else layout();
  }

  /** With no page left, the docked window goes: a hidden one would keep the application from quitting. */
  function closeEmpty() {
    if (tabBar && !tabBar.webContents.isDestroyed()) tabBar.webContents.close();
    if (frame && !frame.isDestroyed()) frame.destroy();
    frame = null;
    tabBar = null;
    state = emptyDock();
  }

  function showPage(page) {
    if (isOVIPage(page)) state = activateTab(state, page.group, page.kind);
    else explorers = [...explorers.filter((explorer) => explorer !== page), page];
    layout();
    ensureWindow().show();
  }

  /** LabVIEW's closing a Block Diagram only hides it: docked, the OVI shows its Front Panel instead. */
  function hidePage(page) {
    if (isOVIPage(page) && state.shown[page.group] === page.kind && page.kind === BLOCK_DIAGRAM) state = toggleShown(state);
    layout();
  }

  function focusPage(page) {
    showPage(page);
    frame.focus();
  }

  return {
    window: () => ensureWindow(),
    attach,
    detach,
    showPage,
    hidePage,
    focusPage,
    refresh: () => sendState(),
    isOnScreen: (page) => (isOVIPage(page) ? isOnScreen(state, page.group, page.kind) : page === activeExplorer()),
    /** A tab of the bar was clicked. */
    activate(id) {
      state = activateTab(state, id);
      layout();
      ovis.get(id)?.[state.shown[id]]?.webContents.focus();
    },
    /** The FP / BD switch of the bar, or Ctrl+E. */
    toggleShown() {
      state = toggleShown(state);
      layout();
    },
    /** Ctrl+T: split in half, or join. */
    toggleSplit() {
      state = toggleSplit(state);
      layout();
    },
    closeTab: (id) => options.onCloseTab(id),
    isTabBar: (contents) => !!tabBar && tabBar.webContents.id === contents.id,
    /** Every page has left it (switched back to floating). */
    hide: () => closeEmpty(),
  };
}
