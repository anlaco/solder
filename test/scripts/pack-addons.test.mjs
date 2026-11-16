// The add-ons are packed for download one zip per platform, the common part beside that platform's part (DT-081,
// amendment of 2026-11-14); a platform part whose library is not built is left out, so a release never ships an add-on
// that cannot load. Unzipped into the user's add-ons folder, Solder reads it as installed.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import { archiveFileName, packAddons } from "../../scripts/pack-addons.mjs";
import { loadInstalledAddons } from "../../editor/electron/installed-addons.mjs";

const scratch = mkdtempSync(path.join(tmpdir(), "solder-pack-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

const ON_LINUX = process.platform === "linux";
/** The packing shells out to `zip`, which releases have where they are made (Linux) and a Windows machine may lack. */
const HAS_ZIP = spawnSync("zip", ["-v"]).status === 0;

/** Writes `files` (`{ relative path: text }`) under `folder`. */
function writeTree(folder, files) {
  for (const [relative, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(folder, relative)), { recursive: true });
    writeFileSync(path.join(folder, relative), text);
  }
}

const manifest = (extra = {}) => JSON.stringify({ AddonName: "DAQ", ApiVersion: "v1", MinimumSupportedSolderVersion: "0.12.0-beta", ...extra });

test("an archive per built platform part, named after the add-on, the version and the platform; an unbuilt part is skipped", { skip: !HAS_ZIP && "no zip on this machine" }, () => {
  const addons = path.join(scratch, "addons");
  writeTree(addons, {
    "daq/1/sdaddoninfo.json": manifest(),
    "daq/1/ovi.lib/DAQ/DAQ Start Task.sdg": "{}",
    "daq-linux-x64/1/sdaddoninfo.json": manifest({ SupportedPlatform: "linux-x64" }),
    "daq-linux-x64/1/resource/libnilvaiu.so": "binary",
    "daq-windows-x64/1/sdaddoninfo.json": manifest({ SupportedPlatform: "windows-x64" }),
  });
  const { written, skipped } = packAddons({ addonsFolder: addons, outputFolder: path.join(scratch, "dist"), version: "0.12.0-beta" });
  assert.deepEqual(written.map((file) => path.basename(file)), [archiveFileName("daq", "0.12.0-beta", "linux-x64")]);
  assert.equal(path.basename(written[0]), "Solder-DAQ-0.12.0-beta-linux-x64.zip");
  assert.equal(skipped.length, 1);
  assert.match(skipped[0], /^daq-windows-x64: no built library/);
});

test("unzipped into an add-ons folder, the archive is an installed add-on with its library folder", { skip: !ON_LINUX }, () => {
  const [archive] = packAddons({ addonsFolder: path.join(scratch, "addons"), outputFolder: path.join(scratch, "dist"), version: "0.12.0-beta" }).written;
  const installed = path.join(scratch, "installed");
  mkdirSync(installed);
  assert.equal(spawnSync("unzip", ["-q", archive, "-d", installed]).status, 0);
  const { addons, libraryFolders } = loadInstalledAddons({ oviLibRoot: path.join(scratch, "ovi.lib"), nodePlatform: "linux", architecture: "x64", homeDirectory: scratch, environment: {}, solderVersion: "0.12.0-beta", folders: [installed] });
  assert.deepEqual(addons.map((addon) => addon.name), ["DAQ"]);
  assert.ok(libraryFolders.some((folder) => folder.endsWith(path.join("daq-linux-x64", "1", "resource"))));
});
