// What a Project Explorer reads from the disk (DT-099 stage c): its Dependencies, which the `.sdproj` never stores
// (measured: labview-captures/reports/2026-11-17-project-explorer-s1.md Q4), and what its auto-populating folders hold,
// watched while the project is open (measured: 2026-11-21-project-explorer-s5.md, LabVIEW follows a change in about
// 0.5 s). The page asks for it when it opens, after each edit of its tree, on Dependencies ▸ Refresh, and whenever the
// main process says files changed (an OVI was saved, or a watched folder changed). The rules are pure
// (project-dependencies.mjs, core/model/auto-populating.mjs); here are the files.

import { watch } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { autoPopulatingPlaces, filesOfListing, inDiskOrder, isShownOnDisk } from "../../core/model/auto-populating.mjs";
import { isInOviLib } from "../../core/model/ovi-lib.mjs";
import { itemsWithPaths, readProject } from "../../core/model/project.mjs";
import { pathKey } from "../src/common/ovi-paths.mjs";
import { projectDependencies } from "./project-dependencies.mjs";
import { projectItemPath, storedProjectPath } from "./project-paths.mjs";

/** How long the watcher waits for a burst of changes to end before the page reads the disk again, in milliseconds. */
// LabVIEW's tree followed in about 0.5 s (s5 Q2); a copy of many files sends many events, read once.
const SETTLE_MS = 200;

/** A file's text, or null when it cannot be read. */
const readTextOrNull = (filePath) => readFile(filePath, "utf8").catch(() => null);

/** The listing of the folder at `absolutePath`, every path stored as the project at `projectPath` stores its items; null if it is not there. */
async function listFolder(absolutePath, projectPath) {
  let found;
  try {
    found = await readdir(absolutePath, { withFileTypes: true });
  } catch {
    return null;
  }
  const entries = [];
  for (const dirent of found) {
    if (!isShownOnDisk(dirent.name)) continue; // a hidden folder (.git) is not even read
    const inner = path.join(absolutePath, dirent.name);
    const stored = storedProjectPath(projectPath, inner);
    if (dirent.isDirectory()) entries.push({ name: dirent.name, path: stored, folder: true, entries: (await listFolder(inner, projectPath)) ?? [] });
    else if (dirent.isFile()) entries.push({ name: dirent.name, path: stored });
  }
  return inDiskOrder(entries);
}

/** What each auto-populating folder of `project` holds: stored path → `{ exists, entries }`. */
async function readFolders(project, projectPath) {
  const folders = {};
  for (const { item } of autoPopulatingPlaces(project)) {
    const entries = await listFolder(projectItemPath(projectPath, item.path), projectPath);
    folders[item.path] = { exists: entries !== null, entries: entries ?? [] };
  }
  return folders;
}

/**
 * What the page of the project `entry` shows from the disk: `{ dependencies, folders }`. The files of an auto-populating
 * folder are items, so what they call is in Dependencies (measured: s5 Q6). `oviLib` is what `<ovilib>/…` resolves with.
 */
export async function readProjectDisk(entry, oviLib) {
  const project = readProject(entry.current);
  const folders = await readFolders(project, entry.path);
  const storedPaths = [...itemsWithPaths(project), ...Object.values(folders).flatMap((folder) => filesOfListing(folder.entries))].map((item) => item.path);
  const itemKeys = storedPaths.map((stored) => projectItemPath(entry.path, stored));
  const dependencies = await projectDependencies(itemKeys, readTextOrNull, oviLib, (key) => isInOviLib(key, oviLib));
  return { dependencies, folders };
}

/** Watches the auto-populating folders of each open project; `notify(entry)` tells its page to read the disk again. */
function createFolderWatcher(notify) {
  /** Project id → (absolute folder → its watcher). */
  const watched = new Map();
  const pending = new Map();
  const changed = (entry) => {
    clearTimeout(pending.get(entry.id));
    pending.set(entry.id, setTimeout(() => notify(entry), SETTLE_MS));
  };
  function openWatcher(entry, folder) {
    try {
      return watch(folder, { recursive: true }, () => changed(entry)).on("error", () => changed(entry));
    } catch {
      return null; // a folder that is not there is read as gone; nothing to watch
    }
  }
  /** Watches exactly the folders of `folders` (stored path → listing) for `entry`. */
  function follow(entry, folders) {
    const wanted = new Set(Object.entries(folders).filter(([, folder]) => folder.exists).map(([stored]) => pathKey(projectItemPath(entry.path, stored))));
    const current = watched.get(entry.id) ?? new Map();
    for (const [folder, watcher] of current) {
      if (wanted.has(folder)) continue;
      watcher?.close();
      current.delete(folder);
    }
    for (const folder of wanted) if (!current.has(folder)) current.set(folder, openWatcher(entry, folder));
    watched.set(entry.id, current);
  }
  function forget(projectId) {
    for (const watcher of watched.get(projectId)?.values() ?? []) watcher?.close();
    watched.delete(projectId);
    clearTimeout(pending.get(projectId));
    pending.delete(projectId);
  }
  return { follow, forget };
}

/**
 * Registers `project:read-disk`; `entryOf(event)` is the project of the window that asked, `notify(entry)` tells its page
 * that the disk changed. Returns `forget(projectId)`, for a project that closed.
 */
export function registerDiskRequests({ ipcMain, entryOf, oviLib, notify }) {
  const watcher = createFolderWatcher(notify);
  ipcMain.handle("project:read-disk", async (event) => {
    const entry = entryOf(event);
    // A page whose project has just closed may still ask (its last edits reach it while its windows go): nothing to read.
    if (!entry) return null;
    const disk = await readProjectDisk(entry, oviLib);
    watcher.follow(entry, disk.folders);
    return disk;
  });
  return { forget: watcher.forget };
}
