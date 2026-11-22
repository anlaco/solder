// The Project Explorer windows and what the main process does for them (DT-099 §6): creating a project, opening one from its
// file, saving it, asking about unsaved changes when it closes, the Create Project dialog and the window list of the Window
// menu. The rules are pure and tested without Electron (project-registry.mjs, project-dialogs.mjs, project-window-list.mjs);
// this file has the windows and the dialogs. Measured in LabVIEW 2026 Q3 (labview-captures/reports/2026-11-17-project-explorer-s1.md,
// -s2.md and 2026-11-18-project-explorer-s3.md).

import { readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BrowserWindow, dialog, ipcMain, screen } from "electron";
import { dialogOwner, hostWindowOf } from "./page-window.mjs";
import { MY_COMPUTER, ProjectFileError, blankProject, readProject } from "../../core/model/project.mjs";
import { unsavedOviIds, withNewOviSaved } from "../../core/model/project-new-ovis.mjs";
import { CLOSE_ALL_BUTTONS, CLOSE_ANSWERS, CLOSE_BUTTONS, CLOSE_BUTTON_ANSWERS, confirmCloseAll } from "./close-flow.mjs";
import { EXIT_BUTTONS, EXIT_BUTTON_ANSWERS, EXIT_ANSWERS, confirmExit, exitDialogText } from "./exit-flow.mjs";
import { NEW_FILES_BUTTONS, closeProjectDialogText, hasOVIsOutsideProjects, newUnsavedFilesText, openProjectDialog, projectSavePathFor, renameOviDialog, saveProjectDialog } from "./project-dialogs.mjs";
import { savePathFor } from "../src/common/ovi-paths.mjs";
import { registerDiskRequests } from "./project-disk-requests.mjs";
import { registerItemRequests } from "./project-item-requests.mjs";
import { projectItemPath, rebaseProjectBody, storedProjectPath } from "./project-paths.mjs";
import { createProjectRegistry, isModified, projectBody, projectFileText, projectName, recordChange, recordSave } from "./project-registry.mjs";
import { CREATE_PROJECT_DIALOG_SIZE, PROJECT_WINDOW_SIZE, cascadedPosition, projectWindowTitle } from "./project-window.mjs";
import { windowListRows } from "./project-window-list.mjs";
import { restoredBounds } from "./saved-windows.mjs";

const CREATIONS = { BLANK_PROJECT: "blank-project", BLANK_OVI: "blank-ovi" };

/**
 * `host` is what the main process lends: `backgroundColor`, `appIcon` and `preload` for the windows; `quitting()` and
 * `captureMode()`; `anyDocumentOpen()`; `openNewOVI()`; `openOVIEntries()`, the open OVIs; `oviWindowList()` and
 * `activateOVIWindow(key)` for the Window menu; `hideGettingStarted()`; `createPage(options)`, the explorer's page,
 * floating or docked (layout-manager.mjs, DT-101); `afterLastProjectClosed()`; and for the OVIs made in a project,
 * `openNewOVIIn(project)` (gives the new entry), `openPathIn(filePath, project, owner)` and `focusOVI(entryId)` for the
 * OVIs of the tree, `saveNewOVI(entryId, owner)` (gives the path it was saved at, or null),
 * `instanceChanged(projectId, instance)` and `projectClosed(projectId)`; `projectOVIs(projectId)`, the OVIs open in the
 * project as Close Project asks about them (`{ name, isDirty(), save(), close() }`, created last first);
 * `renameOVIFile(oldPath, newPath)`, Rename... of an OVI item on the disk and in memory; `windowActivated(contentsId)`, an
 * OVI window that opened its Window menu; `oviLib`, what
 * `<ovilib>/…` paths resolve with.
 */
export function createProjectManager(host) {
  const registry = createProjectRegistry();
  /** Project id → its window; web contents id → the project whose page it is; ids of the projects being closed. */
  const windows = new Map();
  const entryOfContents = new Map();
  const closing = new Set();
  const asking = new Set();
  const saving = new Set();
  let lastFolder = os.homedir();
  let createDialog = null;
  /** What the pages read from the disk, and the watchers of their auto-populating folders (project-disk-requests.mjs). */
  let diskRequests = null;

  const windowOf = (entry) => windows.get(entry.id);
  /** Where an OVI open in a project is, as its titles say: "NewVI14.sdproj/My Computer". */
  const instanceOf = (entry) => `${projectName(entry)}/${MY_COMPUTER}`;
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
      host.projectClosed(entry.id);
      diskRequests?.forget(entry.id);
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

  /**
   * The project's new OVIs that were never saved are saved first, after LabVIEW's question (Yes, Cancel), each asking
   * where; their items become their files. Returns false when the question or a save was cancelled.
   */
  async function saveNewOVIsOf(entry, owner) {
    const ids = unsavedOviIds(readProject(entry.current));
    if (!ids.length) return true;
    const { title, message, detail } = newUnsavedFilesText(projectName(entry));
    const { response } = await dialog.showMessageBox(owner, { type: "question", title, message, detail, buttons: NEW_FILES_BUTTONS, defaultId: 0, cancelId: NEW_FILES_BUTTONS.length - 1 });
    if (response !== 0) return false;
    let project = readProject(entry.current);
    for (const entryId of ids) {
      const savedAt = await host.saveNewOVI(entryId, owner);
      if (!savedAt) return false;
      project = withNewOviSaved(project, entryId, storedProjectPath(entry.path, savedAt));
    }
    recordChange(entry, projectBody(project));
    return true;
  }

  /**
   * Save Project: asks where for a project that was never saved, then writes the project with the window's place. Returns
   * whether it was saved. A second Save Project while the first is still asking does nothing, so its questions do not pile
   * up (found under Xvfb: the menu row stays clickable from another window).
   */
  async function saveProject(entry, owner) {
    if (saving.has(entry.id)) return false;
    saving.add(entry.id);
    try {
      return await writeProjectOf(entry, owner);
    } finally {
      saving.delete(entry.id);
    }
  }

  async function writeProjectOf(entry, owner) {
    if (!(await saveNewOVIsOf(entry, owner))) return false;
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
    host.instanceChanged(entry.id, instanceOf(entry));
    windowOf(entry).webContents.send("project:renamed", projectName(entry));
    if (rebased) windowOf(entry).webContents.send("project:rebased", body);
    return true;
  }

  /**
   * What leaves memory when the project closes: its OVIs, created last first, and then the project itself (the order the
   * s3 "Extras" capture shows, an OVI asked about first; the order among several was not measured).
   */
  function closingItems(entry, owner) {
    const project = { name: projectName(entry), isDirty: () => isModified(entry), save: () => saveProject(entry, owner) };
    return [...host.projectOVIs(entry.id), project];
  }

  /**
   * The close question for each of `items` with unsaved changes ("Save changes? (Close Project)"), which can answer for the
   * rest while its box is checked (Save - All, Don't Save - All). Returns whether the project may go.
   */
  function confirmDiscard(items, owner) {
    const ask = async (item, remaining) => {
      const { title, message, detail, checkboxLabel } = closeProjectDialogText(item.name, remaining);
      const buttons = checkboxLabel ? CLOSE_ALL_BUTTONS : CLOSE_BUTTONS;
      const { response, checkboxChecked } = await dialog.showMessageBox(owner, {
        type: "question", title, message, detail, buttons, defaultId: 0, cancelId: buttons.length - 1,
        ...(checkboxLabel && { checkboxLabel, checkboxChecked: true }),
      });
      return { answer: CLOSE_BUTTON_ANSWERS[response] ?? CLOSE_ANSWERS.cancel, applyToRemaining: !!checkboxLabel && checkboxChecked };
    };
    return confirmCloseAll(items, { isDirty: (item) => item.isDirty(), ask, save: (item) => item.save() });
  }

  /**
   * File ▸ Close Project, Ctrl+W and the close box: silent without changes, with the question when there are. The
   * project's OVIs close with it (measured: s3 "Extras", reports/2026-11-19-project-new-vi.md Q5).
   */
  async function closeProject(entry) {
    if (asking.has(entry.id)) return false;
    asking.add(entry.id);
    const owner = dialogOwner(windowOf(entry));
    const items = closingItems(entry, owner);
    try {
      if (!(await confirmDiscard(items, owner))) return false;
    } finally {
      asking.delete(entry.id);
    }
    for (const item of items) await item.close?.();
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
    // New ▸ OVI: an untitled OVI opened in this project, whose item the page adds.
    ipcMain.handle("project:new-ovi", (event) => {
      const project = entryOf(event);
      const created = host.openNewOVIIn(placeInProject(project));
      return { entryId: created.id, name: created.name };
    });
    // A double click on an OVI of the tree, or its Open: the OVI opens in this project.
    ipcMain.on("project:open-item", (event, request) => openItem(entryOf(event), request, ownerOf(event)));
    ipcMain.handle("project:rename-ovi", (event, storedPath) => renameOVIItem(entryOf(event), storedPath, ownerOf(event)));
    // The page's project became this text (the title's star follows whether it differs from the saved one).
    ipcMain.on("project:changed", (event, text) => {
      const entry = entryOf(event);
      // Close Project's OVIs leaving memory edit the tree (a new OVI's item goes) while the project's window goes too.
      if (!entry) return;
      recordChange(entry, text);
      refreshTitle(entry);
    });
    registerItemRequests({ ipcMain, dialog, entryOf, ownerOf, lastFolder: () => lastFolder, rememberFolder: (folder) => (lastFolder = folder) });
    diskRequests = registerDiskRequests({ ipcMain, entryOf, oviLib: host.oviLib, notify: (entry) => sendDiskChanged(windowOf(entry)) });
    ipcMain.on("project:create", (event) => showCreateDialog(ownerOf(event)));
    ipcMain.on("project:open", (event) => chooseAndOpen(ownerOf(event)));
    // The window whose Window menu opens is the active one, listed first, even if its focus event never came (no window manager).
    ipcMain.handle("project:window-list", (event) => {
      const explorer = entryOf(event);
      if (explorer) registry.activate(explorer.id);
      else host.windowActivated(event.sender.id);
      return currentWindowList();
    });
    ipcMain.on("project:activate-window", (_event, key) => activateListed(key));
    ipcMain.handle("create-project:init", () => ({ oviOpen: hasOVIsOutsideProjects(host.openOVIEntries()) }));
    ipcMain.on("create-project:finish", (_event, creation) => finishCreateDialog(creation));
    ipcMain.on("create-project:cancel", () => closeCreateDialog());
  }

  /**
   * Rename... on an OVI item: "Save the OVI (…) As", and the file is renamed on disk at once (measured: s4 "Rename"). Gives
   * the path the item stores now, or null when cancelled or refused. A name taken by another file is refused, so that
   * nothing is overwritten (unverified: what LabVIEW does then).
   */
  async function renameOVIItem(entry, storedPath, owner) {
    const oldPath = projectItemPath(entry.path, storedPath);
    const result = await dialog.showSaveDialog(owner, renameOviDialog(oldPath));
    if (result.canceled || !result.filePath) return null;
    const newPath = savePathFor(result.filePath);
    if (newPath === oldPath) return null;
    if (await stat(newPath).then(() => true, () => false)) {
      dialog.showMessageBox(owner, { type: "error", title: "Rename", message: "The OVI cannot be renamed.", detail: `${newPath} already exists.` });
      return null;
    }
    try {
      await host.renameOVIFile(oldPath, newPath);
    } catch (error) {
      dialog.showMessageBox(owner, { type: "error", title: "Rename", message: "The OVI cannot be renamed.", detail: error.message });
      return null;
    }
    return storedProjectPath(entry.path, newPath);
  }

  /** Where an OVI opened from the project `entry` belongs: the project, the place its titles say and the folder its first Save proposes. */
  const placeInProject = (entry) => ({ id: entry.id, instance: instanceOf(entry), folder: entry.path ? path.dirname(entry.path) : null });

  /** Opens an OVI of the tree of `entry` in the project; a new OVI not saved yet only comes forward. */
  function openItem(entry, request, owner) {
    if (request.unsavedOvi !== undefined) return host.focusOVI(request.unsavedOvi);
    return host.openPathIn(projectItemPath(entry.path, request.storedPath), placeInProject(entry), owner);
  }

  /** A new OVI of the project `projectId` was saved at `absolutePath`, or left memory unsaved (null): its item follows. */
  function newOVISettled(projectId, entryId, absolutePath) {
    const entry = registry.get(projectId);
    const window = entry && windowOf(entry);
    if (!window || window.isDestroyed()) return;
    if (absolutePath) window.webContents.send("project:new-ovi-saved", { entryId, storedPath: storedProjectPath(entry.path, absolutePath) });
    else window.webContents.send("project:new-ovi-closed", entryId);
  }

  /** The page of `window` reads the disk again. */
  const sendDiskChanged = (window) => {
    if (window && !window.isDestroyed()) window.webContents.send("project:disk-changed");
  };

  /** A file was saved: every project reads its Dependencies again, since what an OVI calls may have changed. */
  const filesChanged = () => windows.forEach(sendDiskChanged);

  /**
   * A row of an OVI window's menus that acts on its project: Show Project brings the Project Explorer to the front,
   * restored when minimized (measured: reports/2026-11-22-vi-window-menu.md Q2); Save Project and Close Project as the
   * explorer's own.
   */
  function runForProject(projectId, command, owner) {
    const entry = registry.get(projectId);
    if (!entry) return;
    if (command === "show") return bringToFront(entry);
    if (command === "save") return saveProject(entry, owner);
    if (command === "close") return closeProject(entry);
  }

  return { openPath, chooseAndOpen, showCreateDialog, confirmQuit, registerRequests, newOVISettled, filesChanged, runForProject, count: () => windows.size };
}
