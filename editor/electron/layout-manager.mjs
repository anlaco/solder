// Which view Solder shows (DT-101): LabVIEW's floating windows or Solder's docked window. It makes the pages of the
// OVIs and projects (page-window.mjs), keeps the preference, moves every page when the switch is turned, and answers
// the docked window's bar. main.mjs and project-manager.mjs ask it for pages instead of making BrowserWindows.

import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { ipcMain, screen, webContents } from "electron";
import { PageWindow, allPages, pageOfContents } from "./page-window.mjs";
import { createDock } from "./dock-window.mjs";
import { LAYOUTS, preferencesText, readPreferences } from "./dock-layout.mjs";

/** How much of the work area a new docked window takes (a first version, DT-101 §5). */
const DOCK_SHARE_OF_WORK_AREA = 0.9;

/** The docked window's bounds: most of the primary screen's work area, centred. */
function dockBounds() {
  const area = screen.getPrimaryDisplay().workArea;
  const width = Math.round(area.width * DOCK_SHARE_OF_WORK_AREA);
  const height = Math.round(area.height * DOCK_SHARE_OF_WORK_AREA);
  return { x: area.x + Math.round((area.width - width) / 2), y: area.y + Math.round((area.height - height) / 2), width, height };
}

/** Sends to every page of the application, docked, floating or any other window. */
export const broadcast = (channel, ...values) => {
  for (const contents of webContents.getAllWebContents()) if (!contents.isDestroyed()) contents.send(channel, ...values);
};

/**
 * `host`: `{ preferencesFile, backgroundColor, icon, webPreferences, tabLabel(id), closeOVI(id), exit() }`: where the
 * preference is kept, how the windows look, an OVI's tab text, closing an OVI as its Front Panel's close button does,
 * and File ▸ Exit for the docked window's close button.
 */
export function createLayoutManager(host) {
  let layout = LAYOUTS.FLOATING;
  const dock = createDock({
    bounds: dockBounds, // a function: `screen` can only be asked once the application is ready
    backgroundColor: host.backgroundColor,
    icon: host.icon,
    webPreferences: host.webPreferences,
    tabBarUrl: "solder://editor/dock.html",
    toolbarUrl: "solder://editor/dock-toolbar.html",
    tabLabel: host.tabLabel,
    onCloseTab: host.closeOVI,
    onCloseWindow: host.exit,
  });

  const isDocked = () => layout === LAYOUTS.DOCKED;

  function apply() {
    for (const page of allPages()) {
      if (isDocked()) page.dockInto(dock);
      else page.float();
    }
    if (!isDocked()) dock.hide();
  }

  async function setLayout(newLayout) {
    layout = readPreferences(JSON.stringify({ layout: newLayout })).layout;
    apply();
    broadcast("layout:changed", layout);
    await writeFile(host.preferencesFile, preferencesText({ layout })).catch(() => {});
  }

  /** A page for an OVI's window or a project's explorer, docked at once when the docked view is on. */
  function createPage({ frame, url, kind, group }) {
    const page = new PageWindow({ frame: { backgroundColor: host.backgroundColor, icon: host.icon, ...frame }, url, webPreferences: host.webPreferences, kind, group });
    if (isDocked()) page.dockInto(dock);
    return page;
  }

  function registerRequests() {
    ipcMain.handle("layout:get", () => layout);
    // A window that is not one of these pages stays floating in the docked view (DT-101 §3): it keeps its own menus.
    ipcMain.handle("layout:page-docked", (event) => isDocked() && !!pageOfContents(event.sender));
    ipcMain.on("page:painted", (event) => pageOfContents(event.sender)?.markPainted());
    ipcMain.on("layout:set", (_event, newLayout) => setLayout(newLayout));
    // The bar asks once it is listening, so its first state is never lost while it loads.
    ipcMain.on("dock:request-state", () => dock.refresh());
    ipcMain.on("dock:activate", (_event, id) => dock.activate(id));
    ipcMain.on("dock:close-tab", (_event, id) => dock.closeTab(id));
    ipcMain.on("dock:toggle-shown", () => dock.toggleShown());
    ipcMain.on("dock:toggle-split", () => dock.toggleSplit());
    // DT-101 §7: a docked page's menus and toolbar, and what is chosen in the docked window's own.
    ipcMain.on("dock:page-model", (event, model) => {
      const page = pageOfContents(event.sender);
      if (!page) return;
      page.chromeModel = model;
      dock.modelChanged();
    });
    ipcMain.on("dock:toolbar-click", (_event, id, from, at) => dock.runOnActive(id, from, at));
    ipcMain.on("dock:request-toolbar", () => dock.resendToolbar());
  }

  return {
    /** Reads the preference; called once at start-up, before any page is made. */
    async load() {
      layout = readPreferences(await readFile(host.preferencesFile, "utf8").catch(() => null)).layout;
    },
    isDocked,
    createPage,
    registerRequests,
    /** Ctrl+T docked: the middle is split in half or joined (LabVIEW's Tile Left and Right, floating). */
    toggleSplit: () => dock.toggleSplit(),
  };
}

export const preferencesFileIn = (userDataFolder) => path.join(userDataFolder, "preferences.json");
