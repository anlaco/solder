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
import { CLOSE_ALL_BUTTONS, CLOSE_ANSWERS, CLOSE_BUTTONS, CLOSE_BUTTON_ANSWERS, closeAllDialogText, closeAllOrder, closeDialogText, confirmCloseAll } from "./close-flow.mjs";
import { EXIT_ANSWERS, EXIT_BUTTONS, EXIT_BUTTON_ANSWERS, confirmExit, exitDialogText } from "./exit-flow.mjs";
import { newVIBounds, otherWindowKind, tiledBounds } from "./window-layout.mjs";
import { CHOSEN_THEME_ROUTE, THEMES, chosenThemeName } from "./theme.mjs";
import { emptyStartState, nextCarouselPage, parseStartState, rememberFile } from "../src/getting-started/start-state.mjs";
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

const THEME = THEMES[chosenThemeName(process.env.SOLDER_THEME, app.isPackaged)];
const THEMES_DIRECTORY = path.join(EDITOR, "src", "themes");

protocol.registerSchemesAsPrivileged([
  { scheme: "solder", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function serve() {
  protocol.handle("solder", async (request) => {
    const route = decodeURIComponent(new URL(request.url).pathname);
    if (route === CHOSEN_THEME_ROUTE) return chosenThemeStylesheet();
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

/** The sheet of the chosen theme, served after old-school.css; Old School has none and gets an empty one. */
async function chosenThemeStylesheet() {
  const css = THEME.stylesheet ? await readFile(path.join(THEMES_DIRECTORY, THEME.stylesheet)) : "";
  return new Response(css, { headers: { "content-type": MEDIA_TYPES[".css"] } });
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
    backgroundColor: THEME.windowBackground.color,
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
/** The Error list's Show Warnings, for the whole session; it starts off, as LabVIEW's Options default (measured). */
let showWarnings = false;

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
    gettingStarted?.hide();
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
    if (openVIs.size) return;
    // LabVIEW does not quit when its last VI closes: the Getting Started window comes back (DT-052).
    if (quitting || process.env.SOLDER_CAPTURAS) app.quit();
    else showGettingStarted();
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
  rememberRecentFile(filePath);
  openWindows(entry);
}

async function openFirstFile(filePath) {
  const { entry } = registry.open({ path: filePath, initialText: await readFile(filePath, "utf8") });
  rememberRecentFile(filePath);
  return openWindows(entry);
}

function openNewVI() {
  const { entry } = registry.open();
  return openWindows(entry);
}

/** The VI has unsaved changes: LabVIEW's Close dialog (Save, Don't Save, Cancel). Returns whether to go on. */
async function canDiscard(open, owner) {
  if (!isDirty(open.entry)) return true;
  const { title, message, detail } = closeDialogText(viName(open.entry));
  const { response } = await dialog.showMessageBox(owner, { type: "question", title, message, detail, buttons: CLOSE_BUTTONS, defaultId: 0, cancelId: CLOSE_BUTTONS.length - 1 });
  const answer = CLOSE_BUTTON_ANSWERS[response] ?? CLOSE_ANSWERS.cancel;
  if (answer === CLOSE_ANSWERS.cancel) return false;
  if (answer === CLOSE_ANSWERS.dontSave) return true;
  return (await writeVI(open, owner, open.entry.current, false)) !== null;
}

/** Closes a VI and its windows, after asking about unsaved changes unless `force`. Returns whether it closed. */
async function closeVI(open, { force = false } = {}) {
  if (!force && !(await canDiscard(open, open.windows["front-panel"]))) return false;
  open.closing = true;
  for (const window of Object.values(open.windows)) if (!window.isDestroyed()) window.close();
  return true;
}

/**
 * File ▸ Close All: one question for the VI created last, which can answer for
 * the rest, and then every VI leaves, those without changes too.
 */
async function closeAllVIs(owner) {
  const ask = async (open, remaining) => {
    const { title, message, detail, checkboxLabel } = closeAllDialogText(viName(open.entry), remaining);
    // The box can only be checked when there are others to apply the answer to; while checked LabVIEW says "Save - All".
    const buttons = checkboxLabel ? CLOSE_ALL_BUTTONS : CLOSE_BUTTONS;
    const { response, checkboxChecked } = await dialog.showMessageBox(owner, {
      type: "question", title, message, detail, buttons, defaultId: 0, cancelId: buttons.length - 1,
      ...(checkboxLabel && { checkboxLabel, checkboxChecked: true }),
    });
    return { answer: CLOSE_BUTTON_ANSWERS[response] ?? CLOSE_ANSWERS.cancel, applyToRemaining: !!checkboxLabel && checkboxChecked };
  };
  const save = async (open) => (await writeVI(open, open.windows["front-panel"], open.entry.current, false)) !== null;
  const order = closeAllOrder(openVIs.values(), (open) => Number(open.entry.id));
  if (!(await confirmCloseAll(order, { isDirty: (open) => isDirty(open.entry), ask, save }))) return;
  for (const open of order) await closeVI(open, { force: true });
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
  rememberRecentFile(target);
  setTitles(open);
  // The callers of this VI that are open must see its new connector.
  for (const other of BrowserWindow.getAllWindows()) other.webContents.send("vi:saved", { id: entry.id, key: pathKey(target) });
  return rebased;
}

// ——— The Getting Started window (DT-052) ———
//
// LabVIEW starts with it, hides it behind the first VI and shows it again when
// the last VI closes; closing it with no VI open quits. It remembers the recent
// files and moves its carousel on one page each time it is shown
// (labview-captures/reports/2026-10-15-getting-started.md).

/** Its client area, measured on a 1920 × 1080 screen: 837 × 506 under the menu bar, which the page draws itself (20 px). */
const GETTING_STARTED_MENU_BAR_HEIGHT = 20;
const GETTING_STARTED_SIZE = { width: 837, height: 506 + GETTING_STARTED_MENU_BAR_HEIGHT };
let gettingStarted = null;
let startState = emptyStartState();
const startStateFile = () => path.join(app.getPath("userData"), "getting-started.json");

async function loadStartState() {
  startState = parseStartState(await readTextOrNull(startStateFile()));
}

function changeStartState(newState) {
  startState = newState;
  writeFile(startStateFile(), JSON.stringify(startState)).catch(() => {});
  if (gettingStarted && !gettingStarted.isDestroyed()) gettingStarted.webContents.send("start:state", startState);
}

const rememberRecentFile = (filePath) => changeStartState(rememberFile(startState, filePath));

function createGettingStarted() {
  const window = new BrowserWindow({
    ...GETTING_STARTED_SIZE,
    useContentSize: true,
    center: true,
    title: "Solder",
    backgroundColor: THEME.gettingStartedBackground.color,
    icon: APP_ICON,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(HERE, "preload.cjs") },
  });
  window.on("page-title-updated", (event) => event.preventDefault());
  // With no VI open, closing it quits; with VIs open it only hides (unverified in LabVIEW).
  window.on("close", (event) => {
    if (quitting || !openVIs.size) return;
    event.preventDefault();
    window.hide();
  });
  window.on("closed", () => {
    gettingStarted = null;
    if (!openVIs.size) app.quit();
  });
  window.loadURL("solder://editor/getting-started.html");
  return window;
}

/** Shows the Getting Started window, on the next carousel page. */
function showGettingStarted() {
  gettingStarted ??= createGettingStarted();
  changeStartState(nextCarouselPage(startState));
  const window = gettingStarted;
  if (window.webContents.isLoading()) window.once("ready-to-show", () => showWindow(window));
  else showWindow(window);
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
  ipcMain.handle("error-list:show-warnings", () => showWarnings);
  ipcMain.on("error-list:set-show-warnings", (_event, on) => {
    showWarnings = !!on;
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send("error-list:show-warnings-changed", showWarnings);
  });
  ipcMain.on("vi:error", (event, message) => {
    dialog.showMessageBox(ownerOf(event), { type: "error", message: "The VI cannot be opened.", detail: message });
  });
  ipcMain.on("vi:avisar", (event, message, detail) => {
    dialog.showMessageBox(ownerOf(event), { type: "warning", message, detail });
  });
  // The Getting Started window: what it remembers, a recent file clicked, and View ▸ Getting Started Window....
  ipcMain.handle("start:init", () => ({ ...startState, version: app.getVersion() }));
  ipcMain.handle("start:open-recent", (event, filePath) => openPath(filePath, ownerOf(event)));
  ipcMain.on("start:show", () => showGettingStarted());
  // File ▸ New VI (Ctrl+N): a blank VI, numbered after every Untitled before it.
  ipcMain.on("vi:new", () => openNewVI());
  // File ▸ Close (Ctrl+W): on the Front Panel the whole VI leaves memory; on the Block Diagram only that window hides.
  ipcMain.on("vi:close-window", (event) => {
    const open = openOf(event);
    if (open.windows["block-diagram"].webContents.id === event.sender.id) return open.windows["block-diagram"].hide();
    closeVI(open);
  });
  // File ▸ Close All.
  ipcMain.on("vi:close-all", (event) => closeAllVIs(ownerOf(event)));
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
  await loadStartState();
  app.on("before-quit", () => (quitting = true));
  // LabVIEW starts on its Getting Started window; started with a VI file it opens only that VI (REPORT.md §3).
  // The captures for the comparisons start on a new VI.
  const fileToOpen = process.env.SOLDER_ABRIR ?? viFileInArguments(process.argv);
  if (fileToOpen) {
    const first = await openFirstFile(path.resolve(fileToOpen));
    if (process.env.SOLDER_CAPTURAS) capture(first.windows, process.env.SOLDER_CAPTURAS);
  } else if (process.env.SOLDER_CAPTURAS) capture(openNewVI().windows, process.env.SOLDER_CAPTURAS);
  else showGettingStarted();
});

app.on("window-all-closed", () => app.quit());
