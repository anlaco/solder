// The main process: serves the editor and opens the two windows of each VI, the
// Front Panel and the Block Diagram, as LabVIEW does. Several VIs can be open at
// once (DT-045), each with its own windows, its own file and its own unsaved
// changes.
//
// The page is served over a protocol of its own, `solder://`, and not from
// file://: so ES modules and the inventory's `fetch` work as in a browser.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, screen } from "electron";
import { OLD_VI_EXTENSION, VI_EXTENSION, isVIFile, pathKey, readHierarchyTexts, rebaseText, saveAsProposal, savePathFor, untitledKey } from "../src/common/vi-paths.mjs";
import { EXIT_ANSWERS, EXIT_BUTTONS, EXIT_BUTTON_ANSWERS, confirmExit, exitDialogText } from "./exit-flow.mjs";
import { newVIBounds, otherWindowKind, tiledBounds } from "./window-layout.mjs";
import { WINDOW_KINDS, createRegistry, isDirty, recordChange, recordSave, viName, windowTitle } from "./vi-registry.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EDITOR = path.resolve(HERE, "..");
/** Solder's own icon (build/icon.svg, rasterized to build/icon.png); Windows takes it from the executable. */
const APP_ICON = path.resolve(EDITOR, "../build/icon.png");
/** LabVIEW's inventory (DT-035): the only source of what is done. */
const INVENTORY = path.resolve(EDITOR, "../docs/schema/inventario-labview.json");
/** The block catalog: the only source of terminals (spec/03, rule 3). */
const CATALOG = path.resolve(EDITOR, "../docs/schema/blocks.json");
const OUTSIDE = { "/inventario.json": INVENTORY, "/blocks.json": CATALOG };
/** The core (DT-039): the page and the command line import it, so it lives outside the editor. */
const CORE = path.resolve(EDITOR, "../core");

const MEDIA_TYPES = {
  ".html": "text/html",
  ".mjs": "text/javascript",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

protocol.registerSchemesAsPrivileged([
  { scheme: "solder", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function serve() {
  protocol.handle("solder", async (request) => {
    const route = decodeURIComponent(new URL(request.url).pathname);
    const root = route.startsWith("/core/") ? path.dirname(CORE) : EDITOR;
    const file = OUTSIDE[route] ?? path.normalize(path.join(root, route === "/" ? "index.html" : route));
    if (!Object.values(OUTSIDE).includes(file) && !file.startsWith(EDITOR + path.sep) && !file.startsWith(CORE + path.sep)) {
      return new Response("outside the editor", { status: 403 });
    }
    try {
      const type = MEDIA_TYPES[path.extname(file)] ?? "application/octet-stream";
      return new Response(await readFile(file), { headers: { "content-type": type } });
    } catch {
      return new Response("not found", { status: 404 });
    }
  });
}

// SOLDER_TAMANO=<width>x<height>: the size of the client area of the windows, to compare with the captures.
const CAPTURE_CLIENT_SIZE = process.env.SOLDER_TAMANO?.split("x").map(Number);

/** The windows of a new VI: Front Panel in front, Block Diagram behind it (REPORT.md §4), the VI opened as number `index`. */
function boundsForNewVI(index) {
  const bounds = newVIBounds(screen.getPrimaryDisplay().workArea, index);
  if (!CAPTURE_CLIENT_SIZE) return bounds;
  const [width, height] = CAPTURE_CLIENT_SIZE;
  return Object.fromEntries(Object.entries(bounds).map(([kind, place]) => [kind, { ...place, width, height }]));
}

function createWindow(entry, kind, bounds) {
  const window = new BrowserWindow({
    ...bounds,
    minWidth: 700,
    minHeight: 360,
    useContentSize: !!CAPTURE_CLIENT_SIZE,
    title: windowTitle(entry, kind),
    backgroundColor: "#f0f0f0",
    icon: APP_ICON,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(HERE, "preload.cjs") },
  });
  window.on("page-title-updated", (event) => event.preventDefault());
  window.loadURL(`solder://editor/index.html?ventana=${kind}&vi=${entry.id}`);
  return window;
}

/**
 * SOLDER_CAPTURAS=<directory>: saves the two windows of the first VI as PNG and
 * quits. With SOLDER_PALETA=x,y, first opens the diagram's palette with a right
 * click at that point; with SOLDER_CLICS=<id> <id>…, then clicks those
 * inventory elements, for example a folder, to open its subpalette. It is what
 * the pixel-by-pixel comparisons with LabVIEW use.
 */
async function capture(windows, directory) {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  await Promise.all(
    Object.values(windows).map(
      (window) => new Promise((resolve) => (window.webContents.isLoading() ? window.webContents.once("did-finish-load", resolve) : resolve())),
    ),
  );
  await wait(1000);
  if (process.env.SOLDER_PALETA) {
    const [x, y] = process.env.SOLDER_PALETA.split(",").map(Number);
    await windows["block-diagram"].webContents.executeJavaScript(
      `document.elementFromPoint(${x}, ${y}).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: ${x}, clientY: ${y} }))`,
    );
    await wait(400);
  }
  for (const id of (process.env.SOLDER_CLICS ?? "").split(/\s+/).filter(Boolean)) {
    await windows["block-diagram"].webContents.executeJavaScript(
      `document.querySelector('[data-id="${id}"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }))`,
    );
    await wait(300);
  }
  await mkdir(directory, { recursive: true });
  for (const [kind, window] of Object.entries(windows)) {
    const image = await window.webContents.capturePage();
    await writeFile(path.join(directory, `${kind}.png`), image.toPNG());
  }
  app.quit();
}

// ——— The VIs that are open ———
//
// The two windows of a VI are the same VI: here we remember where it is saved
// and how it was when it was saved. If what the windows report differs, there
// are unsaved changes: the title carries an asterisk, as in LabVIEW, and before
// losing them the editor asks (spec/05 rule 41). vi-registry.mjs has the rules;
// this file has the windows.

const registry = createRegistry();
/** Open VI id → `{ entry, windows: { kind: BrowserWindow }, closing }`. */
const openVIs = new Map();
/** Web contents id → the open VI whose window it is. */
const viOfContents = new Map();
// Both extensions open (DT-051); the dialogs list the new one first.
const FILTERS = [{ name: "Solder VI", extensions: [VI_EXTENSION, OLD_VI_EXTENSION].map((extension) => extension.slice(1)) }];
let quitting = false;
/** What was last copied in any VI, as the text its window sent. */
let sharedClipboard = null;

const keyOf = (entry) => (entry.path ? pathKey(entry.path) : untitledKey(entry.id));

function setTitles(open) {
  for (const [kind, window] of Object.entries(open.windows)) {
    if (!window.isDestroyed()) window.setTitle(windowTitle(open.entry, kind));
  }
}

/** Opens the windows of a VI the registry has just created. */
function openWindows(entry) {
  const bounds = boundsForNewVI(openVIs.size);
  const open = { entry, windows: {}, closing: false };
  openVIs.set(entry.id, open);
  // The Block Diagram is created first so that the Front Panel is shown over it.
  for (const kind of [...WINDOW_KINDS].reverse()) {
    const window = createWindow(entry, kind, bounds[kind]);
    open.windows[kind] = window;
    viOfContents.set(window.webContents.id, open);
  }
  const panel = open.windows["front-panel"];
  // Both are shown once loaded, the Front Panel last so that it is in front.
  const loaded = (window) => new Promise((resolve) => window.once("ready-to-show", resolve));
  Promise.all(Object.values(open.windows).map(loaded)).then(() => {
    open.windows["block-diagram"].show();
    panel.show();
  });
  // Closing the panel closes the VI, asking first if it has unsaved changes.
  panel.on("close", (event) => {
    if (open.closing || process.env.SOLDER_CAPTURAS) return;
    event.preventDefault();
    closeVI(open);
  });
  panel.on("closed", () => {
    registry.close(entry.id);
    openVIs.delete(entry.id);
    for (const window of Object.values(open.windows)) if (!window.isDestroyed()) window.destroy();
    if (!openVIs.size) app.quit();
  });
  // Closing the diagram only hides it, as in LabVIEW; showing it again is
  // Window ▸ Show Block Diagram, which has not been captured yet.
  open.windows["block-diagram"].on("close", (event) => {
    if (open.closing || quitting) return;
    event.preventDefault();
    open.windows["block-diagram"].hide();
  });
  return open;
}

function focusPanel(open) {
  const panel = open.windows["front-panel"];
  if (panel.isMinimized()) panel.restore();
  panel.show();
  panel.focus();
}

function showWindow(window) {
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

/** Window ▸ Tile Left and Right: the Front Panel and the Block Diagram of a VI side by side, both shown. */
function tileWindows(open) {
  const bounds = tiledBounds(screen.getPrimaryDisplay().workArea);
  for (const kind of WINDOW_KINDS) {
    if (open.windows[kind].isMaximized()) open.windows[kind].unmaximize();
    open.windows[kind].setBounds(bounds[kind]);
    open.windows[kind].show();
  }
}

/**
 * File ▸ Exit: LabVIEW asks about every VI with unsaved changes (Save, Don't
 * Save, Cancel; Cancel keeps everything open) and then quits, without opening
 * a blank VI (labview-captures/editor-checks/REPORT.md §3).
 */
async function exitApplication() {
  const owner = BrowserWindow.getFocusedWindow() ?? undefined;
  const ask = async (open) => {
    const { title, message, detail } = exitDialogText(viName(open.entry));
    const { response } = await dialog.showMessageBox(owner, { type: "question", title, message, detail, buttons: EXIT_BUTTONS, defaultId: 0, cancelId: EXIT_BUTTONS.length - 1 });
    return EXIT_BUTTON_ANSWERS[response] ?? EXIT_ANSWERS.cancel;
  };
  const save = async (open) => (await writeVI(open, open.windows["front-panel"], open.entry.current, false)) !== null;
  if (!(await confirmExit([...openVIs.values()], { isDirty: (open) => isDirty(open.entry), ask, save }))) return;
  quitting = true;
  for (const open of openVIs.values()) open.closing = true;
  app.quit();
}

/** Opens a VI from disk in its own windows, or brings its windows forward if it is already open. */
async function openPath(filePath, owner) {
  const existing = registry.findByPath(filePath);
  if (existing) return focusPanel(openVIs.get(existing.id));
  let text;
  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    dialog.showMessageBox(owner, { type: "error", message: "The VI cannot be opened.", detail: error.message });
    return;
  }
  const { entry } = registry.open({ path: filePath, initialText: text });
  openWindows(entry);
}

async function openFirstFile(filePath) {
  const { entry } = registry.open({ path: filePath, initialText: await readFile(filePath, "utf8") });
  return openWindows(entry);
}

function openNewVI() {
  const { entry } = registry.open();
  return openWindows(entry);
}

/** Asks what LabVIEW asks before losing changes: save, don't save or don't go on. Returns whether to go on. */
async function canDiscard(open, owner) {
  if (!isDirty(open.entry)) return true;
  const { response } = await dialog.showMessageBox(owner, {
    type: "question",
    message: `Save changes to «${viName(open.entry)}» before closing?`,
    buttons: ["Save", "Don't Save", "Cancel"],
    defaultId: 0,
    cancelId: 2,
  });
  if (response === 2) return false;
  if (response === 1) return true;
  return writeVI(open, owner, open.entry.current, false);
}

/** Closes a VI and its windows, after asking about unsaved changes unless `force`. Returns whether it closed. */
async function closeVI(open, { force = false } = {}) {
  if (!force && !(await canDiscard(open, open.windows["front-panel"]))) return false;
  open.closing = true;
  for (const window of Object.values(open.windows)) if (!window.isDestroyed()) window.close();
  return true;
}

/**
 * Writes the VI. Without a path, or with Save As, it asks where. The paths of
 * its subVIs are stored relative to the file, so they are rebased to where it
 * is written now (spec/05 rule 69). Returns the text written, or `null` if the
 * user cancelled.
 */
async function writeVI(open, owner, text, saveAs) {
  const { entry } = open;
  let target = entry.path;
  if (!target || saveAs) {
    const result = await dialog.showSaveDialog(owner, { title: "Save As", defaultPath: saveAsProposal(target, viName(entry)), filters: FILTERS });
    if (result.canceled || !result.filePath) return null;
    target = savePathFor(result.filePath);
  }
  const rebased = rebaseText(text, keyOf(entry), pathKey(target));
  await writeFile(target, rebased);
  recordSave(entry, target, rebased);
  setTitles(open);
  // The callers of this VI that are open must see its new connector.
  for (const other of BrowserWindow.getAllWindows()) other.webContents.send("vi:saved", { id: entry.id, key: pathKey(target) });
  return rebased;
}

/** What a page learns about its VI when it starts. */
const describe = (entry) => ({ id: entry.id, text: entry.initialText, key: keyOf(entry), name: viName(entry), untitledNumber: entry.untitledNumber });

async function readTextOrNull(key) {
  try {
    return await readFile(key, "utf8");
  } catch {
    return null;
  }
}

function handleRequests() {
  const openOf = (event) => viOfContents.get(event.sender.id);
  const ownerOf = (event) => BrowserWindow.fromWebContents(event.sender);

  ipcMain.handle("vi:init", (event) => describe(openOf(event).entry));
  ipcMain.on("vi:cambio", (event, text) => {
    const open = openOf(event);
    recordChange(open.entry, text);
    setTitles(open);
  });
  ipcMain.handle("vi:guardar", async (event, text, saveAs) => {
    const open = openOf(event);
    const written = await writeVI(open, ownerOf(event), text, saveAs);
    return written === null ? null : { ruta: keyOf(open.entry), nombre: viName(open.entry), texto: written };
  });
  // File ▸ Open: another VI, in its own windows.
  ipcMain.handle("vi:abrir", async (event) => {
    const owner = ownerOf(event);
    const result = await dialog.showOpenDialog(owner, { title: "Open", properties: ["openFile"], filters: FILTERS });
    if (!result.canceled && result.filePaths.length) await openPath(result.filePaths[0], owner);
  });
  // A subVI opened by double click or Open Front Panel; `key` is its absolute path.
  ipcMain.handle("vi:open-path", (event, key) => openPath(key, ownerOf(event)));
  // Select a VI...: the file dialog; returns the absolute path or nothing.
  ipcMain.handle("vi:choose-subvi", async (event) => {
    const result = await dialog.showOpenDialog(ownerOf(event), { title: "Select a VI", properties: ["openFile"], filters: FILTERS });
    return result.canceled || !result.filePaths.length ? null : pathKey(result.filePaths[0]);
  });
  // The text of every VI that a VI reaches, from the disk (not from the other open VIs: a caller sees a subVI when it is saved).
  ipcMain.handle("vi:subvi-texts", (event, text) => {
    const entry = openOf(event).entry;
    return readHierarchyTexts(keyOf(entry), text, readTextOrNull);
  });
  // The same for a VI that is about to be placed as a subVI: its own text and that of its subVIs.
  ipcMain.handle("vi:subvi-texts-of", async (_event, key) => {
    const text = await readTextOrNull(key);
    if (text === null) return { texts: {}, missing: [key] };
    const { texts, missing } = await readHierarchyTexts(key, text, readTextOrNull);
    return { texts: { [key]: text, ...texts }, missing };
  });
  // One clipboard for all the open VIs, kept as text: what a window copies reaches every window (spec/05 rule 73).
  ipcMain.handle("clipboard:read", () => sharedClipboard);
  ipcMain.on("clipboard:write", (_event, text) => {
    sharedClipboard = text;
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send("clipboard:changed", text);
  });
  ipcMain.on("vi:error", (event, message) => {
    dialog.showMessageBox(ownerOf(event), { type: "error", message: "The VI cannot be opened.", detail: message });
  });
  ipcMain.on("vi:avisar", (event, message, detail) => {
    dialog.showMessageBox(ownerOf(event), { type: "warning", message, detail });
  });
  // A VI that could not be read closes without asking: there is nothing to save.
  ipcMain.on("vi:close", (event) => closeVI(openOf(event), { force: true }));
  // File ▸ Exit: asks about each VI with unsaved changes, then quits (REPORT.md §3).
  ipcMain.on("vi:salir", exitApplication);
  // Ctrl+E: the other window of the VI, from either (REPORT.md §7).
  ipcMain.on("vi:toggle-window", (event) => {
    const open = openOf(event);
    const kind = WINDOW_KINDS.find((candidate) => open.windows[candidate].webContents.id === event.sender.id);
    showWindow(open.windows[otherWindowKind(kind)]);
  });
  // Ctrl+T: Window ▸ Tile Left and Right (REPORT.md §4).
  ipcMain.on("vi:tile", (event) => tileWindows(openOf(event)));
}

/** The VI file named on the command line: a double click on a file in the system's file manager starts Solder with it. */
const viFileInArguments = (argv) => argv.slice(1).find((argument) => isVIFile(argument) && !argument.startsWith("-"));

// One Solder at a time: opening a VI file while it runs opens it in the running one.
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", (_event, argv) => {
  const file = viFileInArguments(argv);
  if (file) openPath(path.resolve(file));
});

app.whenReady().then(async () => {
  // The menu bar is LabVIEW's, painted in the page.
  Menu.setApplicationMenu(null);
  serve();
  handleRequests();
  // SOLDER_ABRIR=<file.sdg>: starts with that VI open instead of a new one (for the comparisons of capturing-labview.md §5).
  const fileToOpen = process.env.SOLDER_ABRIR ?? viFileInArguments(process.argv);
  const first = fileToOpen ? await openFirstFile(path.resolve(fileToOpen)) : openNewVI();
  app.on("before-quit", () => (quitting = true));
  if (process.env.SOLDER_CAPTURAS) capture(first.windows, process.env.SOLDER_CAPTURAS);
});

app.on("window-all-closed", () => app.quit());
