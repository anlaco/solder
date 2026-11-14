// The DAQ plugin's OVIs as they were built by hand in the editor (DT-087, amendment of 2026-11-13 "what the plugin's
// OVIs hold inside"; docs/design/daq-plugin-findings.md), read from the add-on's `ovi.lib/DAQ/` and run as subOVIs
// against Solder's own nilvaiu, loaded from the add-on as a node naming `nilvaiu.*` loads it (DT-087 §8). The codes
// are those measured in LabVIEW with NI's library (labview-captures/reports/2026-11-13-daq-create-task.md).

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import { defaultCallLibraryConfig } from "../../core/model/call-library.mjs";
import { DAQ_TASK } from "../../core/model/daq-name.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { leer } from "../../core/model/qvi-format.mjs";
import { ERROR } from "../../core/model/types.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import { addonLibraryLocator, loadInstalledAddons } from "../../editor/electron/installed-addons.mjs";
import { loadSolderIo, withLibraryLocator } from "../../native/solder-io-node/solder-io.mjs";
import { CAT, buildVI } from "../helpers.mjs";

const INVALID_TASK = -200088;
const TASK_HAS_NO_CHANNELS = -200478;
const PLUGIN_FOLDER = path.resolve("addons/daq/1/ovi.lib/DAQ");
const LIBRARY_FILE = { linux: "libnilvaiu.so", darwin: "libnilvaiu.dylib", win32: "nilvaiu.dll" }[process.platform];
const PLATFORM_PART = `daq-${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`;

/** The plugin's OVIs by file name, read as the editor reads a subOVI; each finds its own subOVIs (Fill In Error Info) the same way. */
const PLUGIN = Gr.conSubVIs(CAT, (file) => {
  try {
    return { key: file, g: leer(JSON.parse(readFileSync(path.join(PLUGIN_FOLDER, file), "utf8")), PLUGIN), cat: PLUGIN };
  } catch {
    return null;
  }
});

let addonsFolder;
let io;

before(() => {
  const built = spawnSync("cargo", ["build", "-q", "-p", "nilvaiu"], { stdio: "inherit" });
  assert.equal(built.status, 0, "nilvaiu builds");
  // The repository's DAQ add-on installed by copying it, with the library just built (as daq-task-run.test.mjs does).
  addonsFolder = mkdtempSync(path.join(tmpdir(), "solder-addons-"));
  for (const part of ["daq", PLATFORM_PART]) cpSync(path.resolve("addons", part), path.join(addonsFolder, part), { recursive: true });
  cpSync(path.resolve("target/debug", LIBRARY_FILE), path.join(addonsFolder, PLATFORM_PART, "1", "resource", LIBRARY_FILE));
  const { libraryFolders } = loadInstalledAddons({ oviLibRoot: path.resolve("ovi.lib"), nodePlatform: process.platform, architecture: process.arch, homeDirectory: tmpdir(), environment: {}, solderVersion: "0.11.0-beta", folders: [addonsFolder] });
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

async function run(vi) {
  const compiled = compilar(vi.g, PLUGIN);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const byId = Object.fromEntries(Object.entries(vi.id).map(([name, nodeId]) => [nodeId, name]));
  const written = await ejecutar(compiled, {}, { io });
  return Object.fromEntries(Object.entries(written).map(([nodeId, value]) => [byId[nodeId], value]));
}

/** `DAQCreateTask140`, as the test of the task wire configures it: the plugin's Create Task is not built yet. */
const CREATE_TASK = {
  ...defaultCallLibraryConfig(),
  thread: "any",
  library: "nilvaiu.*",
  function: "DAQCreateTask140",
  "return-type": { type: "numeric", "data-type": "i32" },
  parameters: [
    { name: "lvAppReference", type: "numeric", "data-type": "uptr", pass: "value" },
    { name: "taskRefObjectPtr", type: "adapt-to-type", "data-format": "handles-by-value" },
    ...["newTaskName", "taskToCopy"].map((name) => ({ name, type: "string", "string-format": "string-handle" })),
    { name: "autoCleanup", type: "numeric", "data-type": "u8", pass: "value" },
    ...["channels", "extendedErrorInfo"].map((name) => ({ name, type: "string", "string-format": "string-handle" })),
  ],
};

/** The plugin's OVI `file` as node `name`, its task in and error in wired from `task` and `errorIn` (outputs of other nodes). */
function callPlugin(b, name, file, task, errorIn) {
  b.node(name, "subvi", { vi: file });
  b.wire(task, `${name}.daq-name-control_1`);
  b.wire(errorIn, `${name}.cluster-control_1`);
}

test("the plugin's Start, Stop and Clear Task, on an empty task, answer as LabVIEW's", async () => {
  const vi = buildVI(PLUGIN, (b) => {
    b.node("empty", "daq-name-constant", { type: DAQ_TASK, value: "" });
    b.node("noError", "error-cluster-constant");
    for (const [name, file] of [["start", "DAQ Start Task.sdg"], ["stop", "DAQ Stop Task.sdg"], ["clear", "DAQ Clear Task.sdg"]]) {
      callPlugin(b, name, file, "empty.result", "noError.result");
      b.node(`${name} error`, "cluster-indicator", { type: ERROR, style: "error-out" });
      b.wire(`${name}.cluster-indicator_1`, `${name} error.value`);
    }
  });
  const shown = await run(vi);
  for (const name of ["start", "stop"]) {
    assert.deepEqual([shown[`${name} error`].status, shown[`${name} error`].code], [true, INVALID_TASK], `${name}: an empty task is task object 0`);
    assert.match(shown[`${name} error`].source, /^<append>/);
  }
  // Unverified in LabVIEW: what NI's DAQDestroyTask110 answers for an empty task. Solder's has nothing to destroy.
  assert.deepEqual(shown["clear error"], { status: false, code: 0, source: "" });
});

test("a task created through the library goes through the plugin's Start Task and is released by its Clear Task", async () => {
  const vi = buildVI(PLUGIN, (b) => {
    b.node("empty", "daq-name-constant", { type: DAQ_TASK, value: "" });
    b.node("name", "str-const", { value: "p1" });
    b.node("nothing", "str-const", { value: "" });
    b.node("noError", "error-cluster-constant");
    b.node("create", "call-library", CREATE_TASK);
    b.wire("empty.result", "create.arg-1-in");
    b.wire("name.result", "create.arg-2-in");
    for (const index of [3, 5, 6]) b.wire("nothing.result", `create.arg-${index}-in`);
    callPlugin(b, "start", "DAQ Start Task.sdg", "create.arg-1-out", "noError.result");
    b.node("start error", "cluster-indicator", { type: ERROR, style: "error-out" });
    b.wire("start.cluster-indicator_1", "start error.value");
    b.node("task out", "daq-name-indicator", { type: DAQ_TASK });
    b.wire("start.daq-name-indicator_1", "task out.value");
    // Clear runs even after an error, as LabVIEW's has no Case on error in: the task is released.
    callPlugin(b, "clear", "DAQ Clear Task.sdg", "start.daq-name-indicator_1", "start.cluster-indicator_1");
    b.node("clear error", "cluster-indicator", { type: ERROR, style: "error-out" });
    b.wire("clear.cluster-indicator_1", "clear error.value");
  });
  const shown = await run(vi);
  assert.equal(shown["task out"], "p1", "Start Task passes the task through its Case");
  assert.deepEqual([shown["start error"].status, shown["start error"].code], [true, TASK_HAS_NO_CHANNELS], "the task reached the library");
  assert.match(shown["start error"].source, /Task Name: <\/B>p1/);
  assert.equal(shown["clear error"].code, TASK_HAS_NO_CHANNELS, "Clear keeps the error it was given");
});

test("an error in passes through Start Task without calling the library", async () => {
  const vi = buildVI(PLUGIN, (b) => {
    b.node("empty", "daq-name-constant", { type: DAQ_TASK, value: "" });
    b.node("incoming", "error-cluster-constant", { value: { status: true, code: 5, source: "orig" } });
    callPlugin(b, "start", "DAQ Start Task.sdg", "empty.result", "incoming.result");
    b.node("start error", "cluster-indicator", { type: ERROR, style: "error-out" });
    b.wire("start.cluster-indicator_1", "start error.value");
  });
  assert.deepEqual((await run(vi))["start error"], { status: true, code: 5, source: "orig" });
});
