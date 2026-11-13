// Reading the add-ons installed on the machine (DT-081): where they are looked for and, over real temporary
// folders, that an OVI inside one resolves through the locator and that with none installed nothing changes.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { resolveOviLibPath } from "../../core/model/ovi-lib.mjs";
import { addonsFolders, loadInstalledAddons, platformName } from "../../editor/electron/installed-addons.mjs";

function writeFiles(root, files) {
  for (const [relativePath, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    writeFileSync(path.join(root, relativePath), text);
  }
}

const withTemporaryFolder = (body) => {
  const folder = mkdtempSync(path.join(os.tmpdir(), "solder-addons-"));
  try {
    return body(folder);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
};

const manifest = JSON.stringify({ AddonName: "daq", ApiVersion: "v1", MinimumSupportedSolderVersion: "0.1.0" });
const load = (folders, oviLibRoot) => loadInstalledAddons({ oviLibRoot, nodePlatform: "linux", architecture: "x64", homeDirectory: "/home/ana", environment: {}, solderVersion: "0.12.0-beta", folders });

test("the two folders are the system's and the user's, on Linux and on Windows", () => {
  assert.deepEqual(addonsFolders({ nodePlatform: "linux", homeDirectory: "/home/ana", environment: {} }), ["/usr/share/solder/addons", "/home/ana/.local/share/solder/addons"]);
  assert.deepEqual(addonsFolders({ nodePlatform: "linux", homeDirectory: "/home/ana", environment: { XDG_DATA_HOME: "/data" } }), ["/usr/share/solder/addons", "/data/solder/addons"]);
  assert.deepEqual(addonsFolders({ nodePlatform: "win32", homeDirectory: "C:\\Users\\ana", environment: { ProgramFiles: "C:\\Program Files", APPDATA: "C:\\Users\\ana\\AppData\\Roaming" } }),
    ["C:\\Program Files\\Solder\\Addons", "C:\\Users\\ana\\AppData\\Roaming\\Solder\\Addons"]);
  assert.equal(platformName("win32", "x64"), "windows-x64");
  assert.equal(platformName("linux", "arm64"), "linux-arm64");
});

test("with no add-on installed, <ovilib> keeps resolving against the plain ovi.lib folder", () => withTemporaryFolder((folder) => {
  const result = load([path.join(folder, "missing system"), path.join(folder, "missing user")], "/opt/solder/ovi.lib");
  assert.equal(result.oviLib, "/opt/solder/ovi.lib", "the same text as before, so nothing downstream changes");
  assert.deepEqual(result.addons, []);
}));

test("an OVI inside an installed add-on resolves to the add-on's folder, and ovi.lib's still to ovi.lib", () => withTemporaryFolder((folder) => {
  const user = path.join(folder, "user");
  writeFiles(user, { "daq/1/sdaddoninfo.json": manifest, "daq/1/ovi.lib/DAQ/Start Task.sdg": "{}", "daq/1/ovi.lib/DAQ/Read.sdg": "{}" });
  const result = load([path.join(folder, "none"), user], "/opt/solder/ovi.lib");
  assert.equal(result.addons.length, 1);
  // The locator writes every path with `/` (core/model/addons.mjs), which Windows reads too.
  assert.equal(resolveOviLibPath("<ovilib>/DAQ/Read.sdg", result.oviLib), `${user.replaceAll("\\", "/")}/daq/1/ovi.lib/DAQ/Read.sdg`);
  assert.equal(resolveOviLibPath("<ovilib>/Instr/Other.sdg", result.oviLib), "/opt/solder/ovi.lib/Instr/Other.sdg");
}));

test("a broken add-on is reported and the others still load", () => withTemporaryFolder((folder) => {
  writeFiles(folder, { "broken/1/sdaddoninfo.json": "{oops", "daq/1/sdaddoninfo.json": manifest, "daq/1/ovi.lib/DAQ/Read.sdg": "{}" });
  const result = load([folder], "/opt/solder/ovi.lib");
  assert.deepEqual(result.addons.map((addon) => addon.name), ["daq"]);
  assert.equal(result.problems.length, 1);
}));

test("the palette files of the add-ons are read, the user's replacing the system's of the same name", () => withTemporaryFolder((folder) => {
  const system = path.join(folder, "system");
  const user = path.join(folder, "user");
  writeFiles(system, { "daq/1/sdaddoninfo.json": manifest, "daq/1/menus/Categories/Measurement/daq.json": "system copy", "daq/1/menus/readme.txt": "not a palette" });
  writeFiles(user, { "daq/1/sdaddoninfo.json": manifest, "daq/1/menus/categories/measurement/DAQ.json": "user copy", "daq/1/menus/Categories/Measurement/_daq/advanced.json": "advanced" });
  const result = load([system, user], "/opt/solder/ovi.lib");
  assert.deepEqual(Object.values(result.menuFiles).sort(), ["advanced", "user copy"]);
  assert.deepEqual(Object.keys(result.menuFiles).map((key) => key.toLowerCase()).sort(), ["categories/measurement/_daq/advanced.json", "categories/measurement/daq.json"]);
}));

test("with no add-on there are no palette files", () => withTemporaryFolder((folder) => {
  assert.deepEqual(load([path.join(folder, "none")], "/opt/solder/ovi.lib").menuFiles, {});
}));
