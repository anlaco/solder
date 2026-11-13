// The add-ons installed on this machine (DT-081): where Solder looks for them, reading them from the disk, and the
// locator that `<ovilib>/…` paths are resolved with. The rules live in core/model/addons.mjs and core/model/ovi-lib.mjs;
// this file is only the part that touches the file system, kept apart from main.mjs so that it can be tested.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { addonLibraryFolders, findAddonLibrary, findAddons, oviLibRoots } from "../../core/model/addons.mjs";
import { buildOviLibLocator } from "../../core/model/ovi-lib.mjs";
import { paletteFileKey } from "../../core/model/palette.mjs";

/** Solder's name for a platform, as an add-on's `SupportedPlatform` writes it: `linux-x64`, `windows-x64`. */
export const platformName = (nodePlatform, architecture) => `${nodePlatform === "win32" ? "windows" : nodePlatform}-${architecture}`;

/**
 * The two folders Solder reads, the system's first (DT-081 §3). The user's lets a user install without administrator
 * rights, which LabVIEW does not offer.
 */
export function addonsFolders({ nodePlatform, homeDirectory, environment }) {
  if (nodePlatform === "win32") {
    return [
      path.win32.join(environment.ProgramFiles ?? "C:\\Program Files", "Solder", "Addons"),
      path.win32.join(environment.APPDATA ?? path.win32.join(homeDirectory, "AppData", "Roaming"), "Solder", "Addons"),
    ];
  }
  const userData = environment.XDG_DATA_HOME || path.posix.join(homeDirectory, ".local", "share");
  return ["/usr/share/solder/addons", path.posix.join(userData, "solder", "addons")];
}

/** The folders under `folder`, or none if it does not exist. */
function listDirectories(folder) {
  try {
    return readdirSync(folder, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

function readTextOrNull(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** Every file under `root`, as paths relative to it written with `/`. */
export function listRelativeFiles(root, relativeFolder = "") {
  let entries;
  try {
    entries = readdirSync(path.join(root, relativeFolder), { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const relativePath = relativeFolder ? `${relativeFolder}/${entry.name}` : entry.name;
    return entry.isDirectory() ? listRelativeFiles(root, relativePath) : [relativePath];
  });
}

/** The folder of an add-on part where its palette files lie, overlaid on Solder's own at the same relative path. */
const ADDON_MENUS_FOLDER = "menus";

/**
 * The palette files (`.json`) that add-ons bring, as `{ relative path inside menus/: text }` (DT-086). Parts are read in
 * the order `addons` gives them, so a later one (the user's) replaces an earlier one with the same name, without regard
 * to case. A file that cannot be read is left out.
 */
export function readAddonMenuFiles(addons) {
  const byKey = new Map();
  for (const addon of addons) {
    for (const folder of addon.folders) {
      const menusFolder = path.join(folder, ADDON_MENUS_FOLDER);
      for (const relativePath of listRelativeFiles(menusFolder).filter((file) => file.toLowerCase().endsWith(".json"))) {
        const text = readTextOrNull(path.join(menusFolder, relativePath));
        if (text !== null) byKey.set(paletteFileKey(relativePath), { relativePath, text });
      }
    }
  }
  return Object.fromEntries([...byKey.values()].map(({ relativePath, text }) => [relativePath, text]));
}

/**
 * What `<ovilib>` paths are resolved with: Solder's own ovi.lib folder, as it has always been, when no add-on is
 * installed, so that nothing changes for whoever has none; otherwise a locator over ovi.lib and every add-on's
 * `ovi.lib/`. `folders` is where to look (the two of `addonsFolders` unless a test says otherwise). Also returns the add-ons found, the problems with the ones that were skipped (for the log), the palette files they bring
 * and the `resource/` folders where their libraries are looked for (`libraryFolders`).
 */
export function loadInstalledAddons({ oviLibRoot, nodePlatform, architecture, homeDirectory, environment, solderVersion, folders = addonsFolders({ nodePlatform, homeDirectory, environment }), normalizePath = (folder) => folder }) {
  const { addons, problems } = findAddons({
    addonsFolders: folders,
    fileSystem: { listDirectories, readText: readTextOrNull },
    platform: platformName(nodePlatform, architecture),
    solderVersion,
  });
  const libraryFolders = addonLibraryFolders(addons).map(normalizePath);
  if (addons.length === 0) return { oviLib: oviLibRoot, addons, problems, menuFiles: {}, libraryFolders };
  const roots = oviLibRoots(oviLibRoot, addons).map(normalizePath);
  return { oviLib: buildOviLibLocator(roots, listRelativeFiles), addons, problems, menuFiles: readAddonMenuFiles(addons), libraryFolders };
}

function isFile(file) {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

/**
 * What a Call Library Function Node's library name becomes: the full path of the add-on's file when one of
 * `libraryFolders` has it (DT-087, amendment of 2026-11-13 §8), otherwise the name as it was, for the system to search.
 */
export const addonLibraryLocator = (libraryFolders, nodePlatform = process.platform) => (name) => findAddonLibrary(name, libraryFolders, nodePlatform, isFile) ?? name;

/** How the main process hands the I/O process the add-ons' library folders, which it reads once at start-up. */
export const ADDON_LIBRARY_FOLDERS_VARIABLE = "SOLDER_ADDON_LIBRARY_FOLDERS";

/** The folders the main process handed over in `environment`, none if it handed none. */
export function handedLibraryFolders(environment) {
  try {
    const folders = JSON.parse(environment[ADDON_LIBRARY_FOLDERS_VARIABLE] ?? "[]");
    return Array.isArray(folders) ? folders.filter((folder) => typeof folder === "string") : [];
  } catch {
    return [];
  }
}
