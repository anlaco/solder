// The docked window's one menu bar and one toolbar (DT-101 §7): the native menu bar holds the menus of the active window
// and the toolbar row (dock-toolbar.html) a copy of its toolbar, both from the model the page sends
// (`{ menus, toolbar }`, common/native-menu-model.mjs and common/docked-page.mjs). What is chosen goes back to that page.

import { Menu, WebContentsView } from "electron";
import { rowLabel } from "../src/common/native-menu-model.mjs";

/** A LabVIEW shortcut Electron can show beside its row; anything else is left out rather than risk a bad accelerator. */
const SHOWN_SHORTCUT = /^((Ctrl|Shift|Alt)\+)+([A-Z0-9]|F\d{1,2}|Space|Tab|Enter|Delete|Backspace|Up|Down|Left|Right|Home|End|PageUp|PageDown|Escape|[.,;/=\-[\]])$/i;

/** `&` marks a mnemonic in a native menu's label: LabVIEW's texts mean the character itself. */
const nativeText = (text) => text.replace(/&/g, "&&");

function rowItems(rows, choose) {
  const items = [];
  for (const row of rows) {
    if (row.separatorBefore && items.length) items.push({ type: "separator" });
    const shortcut = row.shortcut && SHOWN_SHORTCUT.test(row.shortcut) ? { accelerator: row.shortcut, registerAccelerator: false } : {};
    if (row.rows?.length) items.push({ label: nativeText(rowLabel(row)), enabled: row.enabled, submenu: rowItems(row.rows, choose) });
    else items.push({ label: nativeText(rowLabel(row)), enabled: row.enabled, type: row.checked ? "checkbox" : "normal", checked: row.checked, ...shortcut, click: () => choose(row.id) });
  }
  return items;
}

/** The native menu bar of a page's menus; a title with no rows yet still opens, with one row that explains it. */
export function nativeMenuBar(menus, choose) {
  const template = menus.map((title) => ({
    label: nativeText(title.label),
    submenu: title.rows.length ? rowItems(title.rows, choose) : [{ label: "(not yet)", click: () => choose(title.id) }],
  }));
  return Menu.buildFromTemplate(template);
}

/**
 * The toolbar row of a docked window: `options` are `{ webPreferences, backgroundColor, url }`. `show(frame, model,
 * choose)` puts the active page's menus on the window and its toolbar in the row.
 */
export function createDockChrome(options) {
  let view = null;
  let toolbar = null;
  let shownText = null;

  const sendToolbar = () => {
    if (view && !view.webContents.isDestroyed()) view.webContents.send("dock:toolbar", toolbar);
  };

  return {
    attachTo(frame) {
      view = new WebContentsView({ webPreferences: options.webPreferences });
      view.setBackgroundColor(options.backgroundColor);
      view.webContents.loadURL(options.url);
      frame.contentView.addChildView(view);
    },
    place: (bounds) => view?.setBounds(bounds),
    /** Shows the active page's menus and toolbar, unless they are what is already shown. */
    show(frame, model, choose) {
      const text = JSON.stringify(model ?? null);
      if (text === shownText) return;
      shownText = text;
      frame.setMenu(nativeMenuBar(model?.menus ?? [], choose));
      frame.setAutoHideMenuBar(false);
      toolbar = model?.toolbar ?? null;
      sendToolbar();
    },
    /** The row asks for what to show once it listens, so nothing sent while it loads is lost. */
    resend: () => sendToolbar(),
    isToolbar: (contents) => !!view && view.webContents.id === contents.id,
    close() {
      if (view && !view.webContents.isDestroyed()) view.webContents.close();
      view = null;
      shownText = null;
    },
  };
}
