// Add-ons (DT-081): libraries installed beside Solder, laid out as LabVIEW's `LVAddons`:
//
//   <addons folder>/<name>/<api>/sdaddoninfo.json     the manifest
//                              /ovi.lib/ menus/ help/ examples/ resource/
//   <addons folder>/<name>-<os>-<arch>/<api>/...      the native part for one platform, same AddonName
//
// This module is pure: it reads the disk only through the two functions it is given, so the main process, the
// command line and the tests share it. A broken add-on is reported and skipped, never allowed to stop Solder.

/** The manifest's file name, as LabVIEW's `lvaddoninfo.json`. */
export const ADDON_MANIFEST_FILE = "sdaddoninfo.json";

/** The folder of an add-on's OVIs, whose symbolic `<ovilib>/…` paths resolve there too (DT-081 §4). */
export const ADDON_OVI_LIB_FOLDER = "ovi.lib";

const withSlashes = (path) => path.replaceAll("\\", "/");
const withoutTrailingSlash = (path) => path.replace(/\/+$/, "");
const joinPath = (...parts) => parts.map((part) => withoutTrailingSlash(withSlashes(part))).join("/");

/** `1.2.3-beta` → [1, 2, 3]; a missing part counts as 0 and the pre-release label is ignored. */
export function versionNumbers(version) {
  const [major = 0, minor = 0, patch = 0] = String(version).split("-")[0].split(".").map((part) => Number.parseInt(part, 10) || 0);
  return [major, minor, patch];
}

/** Is `version` at least `minimum`? Compared number by number, so 0.10.0 is above 0.9.0. */
export function isVersionAtLeast(version, minimum) {
  const have = versionNumbers(version);
  const need = versionNumbers(minimum);
  for (let position = 0; position < 3; position++) {
    if (have[position] !== need[position]) return have[position] > need[position];
  }
  return true;
}

/**
 * Checks the text of a manifest found in the folder named `apiFolderName`. Returns `{ manifest }` or `{ problem }`
 * with a sentence for the log. `ApiVersion` must be "v" plus the folder's name, so several API versions sit side by
 * side (DT-081 §1).
 */
export function parseAddonManifest(text, apiFolderName) {
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch {
    return { problem: `${ADDON_MANIFEST_FILE} is not valid JSON` };
  }
  if (typeof manifest?.AddonName !== "string" || manifest.AddonName.trim() === "") {
    return { problem: `${ADDON_MANIFEST_FILE} has no AddonName` };
  }
  if (manifest.ApiVersion !== `v${apiFolderName}`) {
    return { problem: `ApiVersion is "${manifest.ApiVersion}" but its folder is "${apiFolderName}" (expected "v${apiFolderName}")` };
  }
  if (typeof manifest.MinimumSupportedSolderVersion !== "string") {
    return { problem: `${ADDON_MANIFEST_FILE} has no MinimumSupportedSolderVersion` };
  }
  if (manifest.SupportedPlatform !== undefined && typeof manifest.SupportedPlatform !== "string") {
    return { problem: "SupportedPlatform must be text such as linux-x64" };
  }
  return { manifest };
}

/**
 * Finds the add-ons under `addonsFolders` (the system's first, then the user's: DT-081 §3).
 *
 * `fileSystem` is `{ listDirectories(path) → names, readText(path) → text or null }`; `platform` is `os-arch`
 * (`linux-x64`) and `solderVersion` the running version. A part for another platform, or one that asks for a newer
 * Solder, is left out and says why. The same part found in both folders keeps the user's copy, which the user put
 * there on purpose (DT-081 §3; LabVIEW has a single folder, so it has no such case).
 *
 * Returns `{ addons, problems }`; each add-on is `{ name, apiVersion, folders: [paths of its parts] }`.
 */
export function findAddons({ addonsFolders, fileSystem, platform, solderVersion }) {
  const found = new Map();
  const problems = [];

  for (const addonsFolder of addonsFolders) {
    for (const partName of fileSystem.listDirectories(addonsFolder)) {
      for (const apiFolderName of fileSystem.listDirectories(joinPath(addonsFolder, partName))) {
        const apiFolder = joinPath(addonsFolder, partName, apiFolderName);
        const manifestText = fileSystem.readText(joinPath(apiFolder, ADDON_MANIFEST_FILE));
        if (manifestText === null) continue; // some other folder, not an add-on

        const { manifest, problem } = parseAddonManifest(manifestText, apiFolderName);
        if (problem) {
          problems.push({ folder: apiFolder, problem });
          continue;
        }
        if (manifest.SupportedPlatform && manifest.SupportedPlatform !== platform) continue;
        if (!isVersionAtLeast(solderVersion, manifest.MinimumSupportedSolderVersion)) {
          problems.push({ folder: apiFolder, problem: `needs Solder ${manifest.MinimumSupportedSolderVersion} or newer` });
          continue;
        }

        const key = `${manifest.AddonName}/${manifest.ApiVersion}`;
        const addon = found.get(key) ?? { name: manifest.AddonName, apiVersion: manifest.ApiVersion, partFolders: new Map() };
        if (addon.partFolders.has(partName)) {
          problems.push({ folder: addon.partFolders.get(partName), problem: `${key} is also installed in ${apiFolder}; the later copy is used` });
        }
        addon.partFolders.set(partName, apiFolder);
        found.set(key, addon);
      }
    }
  }

  const addons = [...found.values()].map(({ name, apiVersion, partFolders }) => ({ name, apiVersion, folders: [...partFolders.values()] }));
  return { addons, problems };
}

/** The folders where `<ovilib>/…` paths are looked for, in order: Solder's own, then each add-on's `ovi.lib/`. */
export function oviLibRoots(oviLibRoot, addons) {
  return [oviLibRoot, ...addons.flatMap((addon) => addon.folders.map((folder) => joinPath(folder, ADDON_OVI_LIB_FOLDER)))];
}
