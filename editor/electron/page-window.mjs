// A page that can live in a window of its own or in the docked window (DT-101 §1): a WebContentsView moved between a
// BaseWindow of its own (LabVIEW's floating view) and the dock (Solder's docked view), never reloaded. To the rest of
// the main process it looks like the BrowserWindow it replaces: the same methods and events, so main.mjs and
// project-manager.mjs keep talking to "its window".

import { EventEmitter } from "node:events";
import { BaseWindow, WebContentsView, app } from "electron";
import { createFirstPaintGate } from "./first-paint.mjs";

/** Every page alive, so the layout can be switched for all of them at once. */
const pages = new Set();
export const allPages = () => [...pages];

/**
 * Whether the application is quitting. Then a window's close button must not be turned into a page's own close:
 * app.quit() closes every window in a loop that does not return, so a close prevented and left to a later tick is
 * retried forever (the editor hung on quitting, docked, on 2026-11-19: the main process at 100 % inside app.quit()).
 */
let quitting = false;
export const isAppQuitting = () => quitting;
app.on("before-quit", () => (quitting = true));

/** The page whose web contents sent something, for a dialog's owner and the like. */
export const pageOfContents = (contents) => allPages().find((page) => !page.isDestroyed() && page.webContents.id === contents.id) ?? null;

/**
 * What a dialog is owned by: the window a page is in now (its own, or the docked one), or the window itself when it is
 * not a page. A PageWindow is not an Electron window, and a dialog given one comes out broken.
 */
export const dialogOwner = (window) => (window instanceof PageWindow ? window.hostWindow() : window);

/** The window a page is in now: its own, or the docked window. Dialogs are owned by it. */
export const hostWindowOf = (contents) => pageOfContents(contents)?.hostWindow() ?? null;

export class PageWindow extends EventEmitter {
  /**
   * `frame`: the BaseWindow options of its own window (bounds, title, icon, background, minimum size); `url`, the page;
   * `webPreferences`; `kind` ("front-panel", "block-diagram", "project") and `group` (the id of its OVI or project).
   */
  constructor({ frame, url, webPreferences, kind, group }) {
    super();
    Object.assign(this, { kind, group, dock: null, destroyed: false, title: frame.title ?? "", wanted: false });
    this.view = new WebContentsView({ webPreferences });
    if (frame.backgroundColor) this.view.setBackgroundColor(frame.backgroundColor);
    this.frame = new BaseWindow({ ...frame, show: false });
    this.frame.contentView.addChildView(this.view);
    this.fitToFrame();
    // Not "resize": on Linux it comes before the content area has its new size (see dock-window.mjs).
    this.frame.contentView.on("bounds-changed", () => this.fitToFrame());
    this.frame.on("close", (event) => this.frameClosing(event));
    // "ready-to-show" once the page has painted itself (first-paint.mjs), as a BrowserWindow's comes once it has drawn.
    this.firstPaint = createFirstPaintGate({ onReady: () => this.emit("ready-to-show") });
    this.view.webContents.once("did-finish-load", () => this.firstPaint.loaded());
    this.view.webContents.on("focus", () => this.emit("focus"));
    this.view.webContents.loadURL(url);
    pages.add(this);
  }

  /** The page says it has painted itself for the first time (`page:painted`). */
  markPainted() {
    this.firstPaint.painted();
  }

  get webContents() {
    return this.view.webContents;
  }

  isDestroyed() {
    return this.destroyed;
  }

  /** The window it is in now. */
  hostWindow() {
    return this.dock ? this.dock.window() : this.frame;
  }

  /** Fills its own window; docked, where it goes is the dock's (its own hidden window can still change size). */
  fitToFrame() {
    if (this.dock) return;
    const { width, height } = this.frame.contentView.getBounds();
    this.view.setBounds({ x: 0, y: 0, width, height });
  }

  /** Its own window's close button: the same `close` event a BrowserWindow gives, which a listener may prevent. */
  frameClosing(event) {
    if (this.destroyed) return;
    if (quitting) return this.destroy();
    event.preventDefault();
    this.close();
  }

  setTitle(title) {
    this.title = title;
    this.frame.setTitle(title);
    this.dock?.refresh();
  }

  getTitle() {
    return this.title;
  }

  show() {
    this.wanted = true;
    if (this.dock) this.dock.showPage(this);
    else this.frame.show();
  }

  /**
   * Shown behind the page shown next, as an OVI's Block Diagram behind its Front Panel: in its own window it is shown
   * now and the next show() comes in front; docked it is only marked shown, for the dock already holds it in its tab
   * behind the Front Panel. Showing it there too would put it on screen first, 11–15 ms before the panel replaced it
   * (reports/2026-11-21-visual-faults-fixed-editor.md).
   */
  showBehind() {
    this.wanted = true;
    if (!this.dock) this.frame.show();
  }

  hide() {
    this.wanted = false;
    if (this.dock) this.dock.hidePage(this);
    else this.frame.hide();
  }

  focus() {
    if (this.dock) this.dock.focusPage(this);
    else this.frame.focus();
    this.view.webContents.focus();
  }

  isVisible() {
    return this.dock ? this.dock.isOnScreen(this) : this.frame.isVisible();
  }

  isMinimized() {
    return this.hostWindow().isMinimized();
  }

  restore() {
    this.hostWindow().restore();
  }

  minimize() {
    this.hostWindow().minimize();
  }

  // Bounds are its own window's, docked or not: they are what a Save keeps (DT-078) and where it floats again.
  isMaximized() {
    return this.frame.isMaximized();
  }

  unmaximize() {
    this.frame.unmaximize();
  }

  setBounds(bounds) {
    this.frame.setBounds(bounds);
  }

  getBounds() {
    return this.frame.getBounds();
  }

  getNormalBounds() {
    return this.frame.getNormalBounds();
  }

  /** Closing: listeners of `close` may prevent it (an OVI with unsaved changes asks first); otherwise it is destroyed. */
  close() {
    if (this.destroyed) return;
    let prevented = false;
    this.emit("close", { preventDefault: () => (prevented = true) });
    if (!prevented) this.destroy();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    pages.delete(this);
    const dock = this.dock;
    this.dock = null;
    this.emit("closed");
    // Electron 40 crashes (SIGSEGV) when a window is destroyed in the same task that a message box owned by it returned,
    // as "Save changes?" does before an OVI closes: reproduced on 2026-11-19 with a throwaway script (destroying at once
    // crashed three times out of three, in every order; after a setTimeout, never). So the views and windows go a tick later.
    setTimeout(() => {
      dock?.detach(this);
      if (!this.view.webContents.isDestroyed()) this.view.webContents.close();
      if (!this.frame.isDestroyed()) this.frame.destroy();
    }, 0);
  }

  /** Moves into the docked window, keeping whether it was shown so it comes back as it was. */
  dockInto(dock) {
    if (this.dock === dock || this.destroyed) return;
    this.frame.contentView.removeChildView(this.view);
    this.frame.hide();
    this.dock = dock;
    dock.attach(this);
  }

  /** Moves back into its own window, shown if it was. */
  float() {
    if (!this.dock || this.destroyed) return;
    this.dock.detach(this);
    this.dock = null;
    this.frame.contentView.addChildView(this.view);
    // The dock hid it if it was not on screen there; in its own window it is always drawn.
    this.view.setVisible(true);
    this.fitToFrame();
    if (this.wanted) this.frame.show();
  }
}
