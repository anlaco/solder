// What the tests of the DAQ plugin's OVIs share (DT-087): the OVIs read from the add-on's `ovi.lib/DAQ/` as the editor
// reads a subOVI, the add-on installed by copying it with the nilvaiu just built, and a run that names what each
// indicator got. Not a test file itself.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { leer } from "../../core/model/qvi-format.mjs";
import { ERROR } from "../../core/model/types.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import { addonLibraryLocator, loadInstalledAddons } from "../../editor/electron/installed-addons.mjs";
import { loadSolderIo, withLibraryLocator } from "../../native/solder-io-node/solder-io.mjs";
import { CAT } from "../helpers.mjs";

/** The version this tree is: the real add-on is loaded as the Solder of this tree would load it, whatever its MinimumSupportedSolderVersion. */
export const SOLDER_VERSION = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;

export const PLUGIN_FOLDER = path.resolve("addons/daq/1/ovi.lib/DAQ");
const LIBRARY_FILE = { linux: "libnilvaiu.so", darwin: "libnilvaiu.dylib", win32: "nilvaiu.dll" }[process.platform];
const PLATFORM_PART = `daq-${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`;

export const NO_ERROR = { status: false, code: 0, source: "" };

/** The plugin's OVIs by file name, read as the editor reads a subOVI; each finds its own subOVIs the same way. */
export const PLUGIN = Gr.conSubOVIs(CAT, (file) => {
  try {
    return { key: file, g: leer(JSON.parse(readFileSync(path.join(PLUGIN_FOLDER, file), "utf8")), PLUGIN), cat: PLUGIN };
  } catch {
    return null;
  }
});

let addonsFolder;
let io;

/** Installs the repository's DAQ add-on with the library just built, before the file's tests, and removes it after. */
export function installAddonForTheseTests() {
  before(() => {
    const built = spawnSync("cargo", ["build", "-q", "-p", "nilvaiu"], { stdio: "inherit" });
    assert.equal(built.status, 0, "nilvaiu builds");
    addonsFolder = mkdtempSync(path.join(tmpdir(), "solder-addons-"));
    for (const part of ["daq", PLATFORM_PART]) cpSync(path.resolve("addons", part), path.join(addonsFolder, part), { recursive: true });
    cpSync(path.resolve("target/debug", LIBRARY_FILE), path.join(addonsFolder, PLATFORM_PART, "1", "resource", LIBRARY_FILE));
    const { libraryFolders } = loadInstalledAddons({ oviLibRoot: path.resolve("ovi.lib"), nodePlatform: process.platform, architecture: process.arch, homeDirectory: tmpdir(), environment: {}, solderVersion: SOLDER_VERSION, folders: [addonsFolder] });
    io = withLibraryLocator(loadSolderIo(), addonLibraryLocator(libraryFolders));
  });
  after(() => {
    // Windows keeps a loaded library's file locked until the process ends, so there the folder stays behind.
    try {
      rmSync(addonsFolder, { recursive: true, force: true });
    } catch (error) {
      if (error.code !== "EPERM" && error.code !== "EBUSY") throw error;
    }
  });
}

/** Compiles and runs an OVI built with `buildOVI`; what each indicator got, by the name it was built with. */
export async function run(vi) {
  const compiled = compilar(vi.g, PLUGIN);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const byId = Object.fromEntries(Object.entries(vi.id).map(([name, nodeId]) => [nodeId, name]));
  const written = await ejecutar(compiled, {}, { io });
  return Object.fromEntries(Object.entries(written).map(([nodeId, value]) => [byId[nodeId], value]));
}

/** The plugin's OVI `file` as node `name`, its task in and error in wired from `task` and `errorIn` (outputs of other nodes). */
export function callPlugin(b, name, file, task, errorIn) {
  b.node(name, "subvi", { vi: file });
  b.wire(task, `${name}.daq-name-control_1`);
  b.wire(errorIn, `${name}.cluster-control_1`);
}

/** An error out indicator `name` showing `output`. */
export function showError(b, name, output) {
  b.node(name, "cluster-indicator", { type: ERROR, style: "error-out" });
  b.wire(output, `${name}.value`);
}
