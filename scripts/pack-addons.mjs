// Packs each add-on of `addons/` for download, one zip per platform: the common part and that platform's part, with its
// built library, at the top of the archive. Installing is unzipping it into the user's add-ons folder (DT-081 §3, §6,
// amendment of 2026-11-14). `npm run dist` runs it after the native build, so the release carries the zips beside the
// installers.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isRunDirectly } from "./entry-point.mjs";
import { ADDON_RESOURCE_FOLDER } from "../core/model/addons.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url));
const ADDONS_FOLDER = path.join(REPOSITORY_ROOT, "addons");
const OUTPUT_FOLDER = path.join(REPOSITORY_ROOT, "dist");
/** A platform part is named `<name>-<os>-<arch>` (DT-081 §2). */
const PLATFORM_PART = /^(?<name>[a-z0-9]+)-(?<platform>[a-z]+-[a-z0-9]+)$/;

/**
 * The archives to make from the folders in `addonsFolder`: one per platform part whose common part exists and whose
 * `resource/` holds a built library, `{ name, platform, parts }`. A platform part without its library is skipped with a
 * reason, so a release never ships an add-on that cannot load.
 */
export function addonArchives(addonsFolder) {
  const folders = readdirSync(addonsFolder, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const archives = [];
  const skipped = [];
  for (const folder of folders) {
    const match = PLATFORM_PART.exec(folder);
    if (!match || !folders.includes(match.groups.name)) continue;
    const resource = path.join(addonsFolder, folder, "1", ADDON_RESOURCE_FOLDER);
    if (!existsSync(resource) || readdirSync(resource).length === 0) {
      skipped.push(`${folder}: no built library in ${path.relative(addonsFolder, resource)}`);
      continue;
    }
    archives.push({ name: match.groups.name, platform: match.groups.platform, parts: [match.groups.name, folder] });
  }
  return { archives, skipped };
}

/** The archive's file name: `Solder-<NAME>-<version>-<platform>.zip`, beside the installers' `Solder-<version>-…`. */
export const archiveFileName = (name, version, platform) => `Solder-${name.toUpperCase()}-${version}-${platform}.zip`;

function zip(archivePath, parts, addonsFolder) {
  rmSync(archivePath, { force: true });
  const zipped = spawnSync("zip", ["-r", "-q", "-X", archivePath, ...parts], { cwd: addonsFolder, stdio: "inherit" });
  if (zipped.status !== 0) throw new Error(`zip failed for ${archivePath}`);
}

/** Packs every add-on that can be packed into `outputFolder`; returns the archives' paths and the reasons for skips. */
export function packAddons({ addonsFolder = ADDONS_FOLDER, outputFolder = OUTPUT_FOLDER, version } = {}) {
  const { archives, skipped } = addonArchives(addonsFolder);
  mkdirSync(outputFolder, { recursive: true });
  const written = archives.map(({ name, platform, parts }) => {
    const archivePath = path.join(outputFolder, archiveFileName(name, version, platform));
    zip(archivePath, parts, addonsFolder);
    return archivePath;
  });
  return { written, skipped };
}

if (isRunDirectly(import.meta.url)) {
  const { version } = JSON.parse(readFileSync(path.join(REPOSITORY_ROOT, "package.json"), "utf8"));
  const { written, skipped } = packAddons({ version });
  for (const reason of skipped) console.warn(`Skipped ${reason}`);
  for (const archive of written) console.log(`Packed ${path.relative(REPOSITORY_ROOT, archive)}`);
  if (process.argv.includes("--for-release") && skipped.length) throw new Error("A release needs every add-on's platform parts built.");
}
