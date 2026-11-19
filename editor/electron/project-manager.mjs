// The Project Explorer windows and what the main process does for them (DT-099 §6): creating a project, opening one from its
// file, saving it, asking about unsaved changes when it closes, the Create Project dialog and the window list of the Window
// menu. The rules are pure and tested without Electron (project-registry.mjs, project-dialogs.mjs, project-window-list.mjs);
// this file has the windows and the dialogs. Measured in LabVIEW 2026 Q3 (labview-captures/reports/2026-11-17-project-explorer-s1.md,
// -s2.md and 2026-11-18-project-explorer-s3.md).

import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BrowserWindow, dialog, ipcMain, screen } from "electron";
import { dialogOwner, hostWindowOf } from "./page-window.mjs";
import { ProjectFileError, blankProject, readProject } from "../../core/model/project.mjs";
import { CLOSE_ANSWERS, CLOSE_BUTTONS, CLOSE_BUTTON_ANSWERS } from "./close-flow.mjs";
import { EXIT_BUTTONS, EXIT_BUTTON_ANSWERS, EXIT_ANSWERS, confirmExit, exitDialogText } from "./exit-flow.mjs";
import { closeProjectDialogText, hasOVIsOutsideProjects, openProjectDialog, projectSavePathFor, saveProjectDialog } from "./project-dialogs.mjs";
import { registerItemRequests } from "./project-item-requests.mjs";
import { rebaseProjectBody } from "./project-paths.mjs";
import { createProjectRegistry, isModified, projectBody, projectFileText, projectName, recordChange, recordSave } from "./project-registry.mjs";
import { CREATE_PROJECT_DIALOG_SIZE, PROJECT_WINDOW_SIZE, cascadedPosition, projectWindowTitle } from "./project-window.mjs";
import { windowListRows } from "./project-window-list.mjs";
import { restoredBounds } from "./saved-windows.mjs";

const CREATIONS = { BLANK_PROJECT: "blank-project", BLANK_OVI: "blank-ovi" };

/**
 * `host` is what the main process lends: `backgroundColor`, `appIcon` and `preload` for the windows; `quitting()` and
 * `captureMode()`; `anyDocumentOpen()`; `openNewOVI()`; `openOVIEntries()`, the open OVIs; `oviWindowList()` and
 * `activateOVIWindow(key)` for the Window menu; `hideGettingStarted()`; `createPage(options)`, the explorer's page,
 * floating or docked (layout-manager.mjs, DT-101); `afterLastProjectClosed()`.
 */
export function createProjectManager(host) {
  const registry = createProjectRegistry();
  /** Project id → its window; web contents id → the project whose page it is; ids of the projects being closed. */
  const windows = new Map();
  const entryOfContents = new Map();
  const closing = new Set();
  const asking = new Set();
  let lastFolder = os.homedir();
  let createDialog = null;

  const windowOf = (entry) => windows.get(entry.id);
  const titleOf = (entry) => projectWindowTitle({ name: projectName(entry), modified: isModified(entry) });
  const refreshTitle = (entry) => windowOf(entry)?.setTitle(titleOf(entry));
  const webPreferences = () => ({ contextIsolation: true, sandbox: true, preload: host.preload });

  function showWindow(window) {
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }

  const bringToFront = (entry) => showWindow(windowOf(entry));

  /** Where a project's window opens: where its file kept it if that is still on a screen, or else cascaded at the measured size. */
  function placementOf(entry) {
    const workAreas = screen.getAllDisplays().map((display) => display.workArea);
    const saved = restoredBounds(entry.place, workAreas, null);
    if (saved) return saved;
    return { ...cascadedPosition(screen.getPrimaryDisplay().workArea, windows.size), ...PROJECT_WINDOW_SIZE, useContentSize: true };
  }

  function openExplorer(entry) {
    // A page that floats in its own window or sits on the left of the docked one (DT-101).
    const window = host.createPage({ frame: { ...placementOf(entry), title: titleOf(entry) }, url: "solder://editor/project.html", kind: "project", group: entry.id });
    const contentsId = window.webContents.id;
    windows.set(entry.id, window);
    entryOfContents.set(contentsId, entry);
    window.once("ready-to-show", () => {
      window.show();
      host.hideGettingStarted();
    });
    window.on("focus", () => registry.activate(entry.id));
    window.on("close", (event) => {
      if (closing.has(entry.id) || host.quitting() || host.captureMode()) return;
      event.preventDefault();
      closeProject(entry);
    });
    window.on("closed", () => {
      windows.delete(entry.id);
      entryOfContents.delete(contentsId);
      closing.delete(entry.id);
      registry.close(entry.id);
      if (!host.anyDocumentOpen()) host.afterLastProjectClosed();
    });
    return window;
  }

  /** File ▸ Create Project... ▸ Blank Project: "Untitled Project N", never saved. */
  function createBlankProject() {
    const { entry } = registry.open({ text: projectBody(blankProject()) });
    return openExplorer(entry);
  }

  /** Opens a project from its file, or brings its window to the front when it is already open. */
  async function openPath(filePath, owner) {
    const resolved = path.resolve(filePath);
    const existing = registry.findByPath(resolved);
    if (existing) return bringToFront(existing);
    let project;
    try {
      project = readProject(await readFile(resolved, "utf8"));
    } catch (error) {
      const detail = error instanceof ProjectFileError ? error.message : `${resolved}: ${error.message}`;
      dialog.showMessageBox(owner, { type: "error", title: "Open Project", message: "The project cannot be opened.", detail });
      return;
    }
    lastFolder = path.dirname(resolved);
    const { entry } = registry.open({ path: resolved, text: projectBody(project), place: project.window ?? null });
    openExplorer(entry);
  }

  /** File ▸ Open Project...: "Select the Project to Open", in the last folder. */
  async function chooseAndOpen(owner) {
    const result = await dialog.showOpenDialog(owner, openProjectDialog(lastFolder));
    if (!result.canceled && result.filePaths.length) await openPath(result.filePaths[0], owner);
  }

  /** Save Project: asks where for a project that was never saved, then writes the project with the window's place. Returns whether it was saved. */
  async function saveProject(entry, owner) {
    let target = entry.path;
    if (!target) {
      const result = await dialog.showSaveDialog(owner, saveProjectDialog({ untitledNumber: entry.untitledNumber, folder: lastFolder }));
      if (result.canceled || !result.filePath) return false;
      target = projectSavePathFor(result.filePath);
    }
    const { x, y, width, height } = windowOf(entry).getNormalBounds();
    // Every stored path is relative to the folder of the file (DT-099 §3): a project that was never saved held absolute ones.
    const body = rebaseProjectBody(entry.current, entry.path, target);
    try {
      // The window's comment (DT-100 §6) stays on the window, whose place is the window's as it is now.
      const comment = entry.place?.comment === undefined ? {} : { comment: entry.place.comment };
      await writeFile(target, projectFileText(body, { ...comment, x, y, width, height }));
    } catch (error) {
      dialog.showMessageBox(owner, { type: "error", title: "Save Project", message: "The project could not be saved.", detail: error.message });
      return false;
    }
    lastFolder = path.dirname(target);
    const rebased = body !== entry.current;
    recordChange(entry, body);
    recordSave(entry, target);
    refreshTitle(entry);
    windowOf(entry).webContents.send("project:renamed", projectName(entry));
    if (rebased) windowOf(entry).webContents.send("project:rebased", body);
    return true;
  }

  /** The close question for a project with unsaved changes: Save, Don't Save or Cancel. Returns whether the project may go. */
  function confirmDiscard(entry, owner) {
    const ask = async () => {
      const { title, message, detail } = closeProjectDialogText(projectName(entry));
      const { response } = await dialog.showMessageBox(owner, { type: "question", title, message, detail, buttons: CLOSE_BUTTONS, defaultId: 0, cancelId: CLOSE_BUTTONS.length - 1 });
      return CLOSE_BUTTON_ANSWERS[response] ?? CLOSE_ANSWERS.cancel;
    };
    return confirmExit([entry], { isDirty: isModified, ask, save: (project) => saveProject(project, owner) });
  }

  /** File ▸ Close Project, Ctrl+W and the close box: silent without changes, with the question when there are. */
  async function closeProject(entry) {
    if (asking.has(entry.id)) return false;
    asking.add(entry.id);
    try {
      if (!(await confirmDiscard(entry, dialogOwner(windowOf(entry))))) return false;
    } finally {
      asking.delete(entry.id);
    }
    closing.add(entry.id);
    windowOf(entry).close();
    return true;
  }

  /** File ▸ Exit asks about every project with unsaved changes too ("Save changes? (Exit)"). Returns whether the application may quit. */
  function confirmQuit(owner) {
    const ask = async (entry) => {
      const { title, message, detail } = exitDialogText(projectName(entry));
      const { response } = await dialog.showMessageBox(owner, { type: "question", title, message, detail, buttons: EXIT_BUTTONS, defaultId: 0, cancelId: EXIT_BUTTONS.length - 1 });
      return EXIT_BUTTON_ANSWERS[response] ?? EXIT_ANSWERS.cancel;
    };
    return confirmExit(registry.list(), { isDirty: isModified, ask, save: (entry) => saveProject(entry, dialogOwner(windowOf(entry))) });
  }

  // ——— The Create Project dialog ———

  /** The dialog: a window of its own, modal over the one that asked, which gives its choice back through `create-project:finish`. */
  function showCreateDialog(owner) {
    if (createDialog && !createDialog.isDestroyed()) return createDialog.focus();
    createDialog = new BrowserWindow({
      ...CREATE_PROJECT_DIALOG_SIZE,
      useContentSize: true,
      parent: owner ?? undefined,
      modal: !!owner,
      resizable: false,
      minimizable: false,
      title: "Create Project",
      backgroundColor: host.backgroundColor,
      icon: host.appIcon,
      show: false,
      webPreferences: webPreferences(),
    });
    createDialog.setMenuBarVisibility(false);
    createDialog.on("page-title-updated", (event) => event.preventDefault());
    createDialog.once("ready-to-show", () => createDialog.show());
    createDialog.on("closed", () => {
      createDialog = null;
    });
    createDialog.loadURL("solder://editor/create-project.html");
  }

  const closeCreateDialog = () => createDialog && !createDialog.isDestroyed() && createDialog.close();

  /** Finish: Blank Project opens a new Project Explorer, Blank OVI a new OVI as File ▸ New OVI does. */
  function finishCreateDialog(creation) {
    closeCreateDialog();
    if (creation === CREATIONS.BLANK_PROJECT) createBlankProject();
    else if (creation === CREATIONS.BLANK_OVI) host.openNewOVI();
  }

  // ——— The Window menu's list ———

  function currentWindowList() {
    const explorers = registry.list().map((entry) => ({ key: `project:${entry.id}`, title: titleOf(entry), activation: entry.activation }));
    return windowListRows({ oviWindows: host.oviWindowList(), explorers });
  }

  function activateListed(key) {
    if (key.startsWith("project:")) {
      const entry = registry.get(key.slice("project:".length));
      if (entry) bringToFront(entry);
    } else {
      host.activateOVIWindow(key);
    }
  }

  function registerRequests() {
    const entryOf = (event) => entryOfContents.get(event.sender.id);
    const ownerOf = (event) => hostWindowOf(event.sender) ?? BrowserWindow.fromWebContents(event.sender) ?? undefined;
    // The page of a project: what it shows (a project that was never saved is blank, with no text), and the ways out that need the main process.
    ipcMain.handle("project:init", (event) => {
      const entry = entryOf(event);
      return { name: projectName(entry), text: entry.saved === null ? null : entry.current };
    });
    ipcMain.on("project:close", (event) => closeProject(entryOf(event)));
    ipcMain.on("project:error", (event, message) => {
      const entry = entryOf(event);
      dialog.showMessageBox(dialogOwner(windowOf(entry)), { type: "error", title: "Project Explorer", message: "The project could not be opened.", detail: message }).then(() => {
        closing.add(entry.id);
        windowOf(entry).close();
      });
    });
    ipcMain.handle("project:save", (event) => saveProject(entryOf(event), ownerOf(event)));
    // The page's project became this text (the title's star follows whether it differs from the saved one).
    ipcMain.on("project:changed", (event, text) => {
      const entry = entryOf(event);
      recordChange(entry, text);
      refreshTitle(entry);
    });
    registerItemRequests({ ipcMain, dialog, entryOf, ownerOf, lastFolder: () => lastFolder, rememberFolder: (folder) => (lastFolder = folder) });
    ipcMain.on("project:create", (event) => showCreateDialog(ownerOf(event)));
    ipcMain.on("project:open", (event) => chooseAndOpen(ownerOf(event)));
    ipcMain.handle("project:window-list", () => currentWindowList());
    ipcMain.on("project:activate-window", (_event, key) => activateListed(key));
    ipcMain.handle("create-project:init", () => ({ oviOpen: hasOVIsOutsideProjects(host.openOVIEntries()) }));
    ipcMain.on("create-project:finish", (_event, creation) => finishCreateDialog(creation));
    ipcMain.on("create-project:cancel", () => closeCreateDialog());
  }

  return { openPath, chooseAndOpen, showCreateDialog, confirmQuit, registerRequests, count: () => windows.size };
}
