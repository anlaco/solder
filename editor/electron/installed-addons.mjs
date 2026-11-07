// The add-ons installed on this machine (DT-081): where Solder looks for them, reading them from the disk, and the
// locator that `<ovilib>/…` paths are resolved with. The rules live in core/model/addons.mjs and core/model/ovi-lib.mjs;
// this file is only the part that touches the file system, kept apart from main.mjs so that it can be tested.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { findAddons, oviLibRoots } from "../../core/model/addons.mjs";
import { buildOviLibLocator } from "../../core/model/ovi-lib.mjs";

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

/**
 * What `<ovilib>` paths are resolved with: Solder's own ovi.lib folder, as it has always been, when no add-on is
 * installed, so that nothing changes for whoever has none; otherwise a locator over ovi.lib and every add-on's
 * `ovi.lib/`. `folders` is where to look (the two of `addonsFolders` unless a test says otherwise). Also returns the add-ons found and the problems with the ones that were skipped, for the log.
 */
export function loadInstalledAddons({ oviLibRoot, nodePlatform, architecture, homeDirectory, environment, solderVersion, folders = addonsFolders({ nodePlatform, homeDirectory, environment }), normalizePath = (folder) => folder }) {
  const { addons, problems } = findAddons({
    addonsFolders: folders,
    fileSystem: { listDirectories, readText: readTextOrNull },
    platform: platformName(nodePlatform, architecture),
    solderVersion,
  });
  if (addons.length === 0) return { oviLib: oviLibRoot, addons, problems };
  const roots = oviLibRoots(oviLibRoot, addons).map(normalizePath);
  return { oviLib: buildOviLibLocator(roots, listRelativeFiles), addons, problems };
}
