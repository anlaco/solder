// What a Project Explorer asks of the main process to edit its tree (DT-099 stage b): the dialogs that choose files and
// folders to add, with the paths turned into what the project stores, and the message about files that were refused.
// The tree itself is edited by the window's page (project-explorer-edit.mjs); only what needs a native dialog or the disk
// is here. Measured in LabVIEW 2026 Q3 (labview-captures/reports/2026-11-18-project-explorer-s4.md and -s2.md Q3).

import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileNameOf } from "../../core/model/project.mjs";
import { pathKey, resolveRelative } from "../src/common/ovi-paths.mjs";
import { addFileDialog, addFolderDialog, unableToAddDialogText } from "./project-dialogs.mjs";
import { snapshotOfFolder, storedProjectPath } from "./project-paths.mjs";

/**
 * Registers the requests. `entryOf(event)` is the project of the window that asked and `ownerOf(event)` its window;
 * `lastFolder()` and `rememberFolder(folder)` keep the folder the dialogs start in.
 */
export function registerItemRequests({ ipcMain, dialog, entryOf, ownerOf, lastFolder, rememberFolder }) {
  /** The path the user chose with `options`, or null; the folder it was in is remembered. */
  async function choose(event, options) {
    const result = await dialog.showOpenDialog(ownerOf(event), options(lastFolder()));
    if (result.canceled || !result.filePaths.length) return null;
    rememberFolder(path.dirname(result.filePaths[0]));
    return result.filePaths;
  }

  ipcMain.handle("project:choose-files", async (event) => {
    const chosen = await choose(event, addFileDialog);
    return chosen && chosen.map((file) => storedProjectPath(entryOf(event).path, file));
  });

  ipcMain.handle("project:choose-snapshot-folder", async (event) => {
    const chosen = await choose(event, addFolderDialog);
    if (!chosen) return null;
    const entries = await readdir(chosen[0], { withFileTypes: true });
    return snapshotOfFolder(entryOf(event).path, chosen[0], entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
  });

  ipcMain.handle("project:choose-auto-populating-folder", async (event) => {
    const chosen = await choose(event, addFolderDialog);
    return chosen && storedProjectPath(entryOf(event).path, chosen[0]);
  });

  ipcMain.on("project:unable-to-add", (event, refusedStoredPaths) => {
    const projectPath = entryOf(event).path;
    const items = refusedStoredPaths.map((stored) => ({ name: fileNameOf(stored), path: resolveRelative(projectPath && pathKey(projectPath), stored) }));
    dialog.showMessageBox(ownerOf(event), { type: "error", buttons: ["OK"], ...unableToAddDialogText(items) });
  });
}
