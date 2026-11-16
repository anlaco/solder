// A DAQ task wire through the Call Library Function Node (DT-087, amendment of 2026-11-13 §7), against Solder's own
// nilvaiu (native/nilvaiu), as the DAQ plugin's OVIs will call it: Create Task writes a record through an Adapt to Type
// cell, the task wire carries it, a pointer-sized integer passes the task object and the record is destroyed. What the
// library answers was measured in LabVIEW with NI's (labview-captures/reports/2026-11-13-daq-create-task.md).

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { before, test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import { defaultCallLibraryConfig } from "../../core/model/call-library.mjs";
import { DAQ_TASK, daqName } from "../../core/model/daq-name.mjs";
import { conversion, inMemory, nombre } from "../../core/model/types.mjs";
import { SOLDER_VERSION } from "./daq-plugin-harness.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import { addonLibraryLocator, loadInstalledAddons } from "../../editor/electron/installed-addons.mjs";
import { loadSolderIo, withLibraryLocator } from "../../native/solder-io-node/solder-io.mjs";
import { CAT, buildVI } from "../helpers.mjs";

const INVALID_TASK = -200088;
const TASK_HAS_NO_CHANNELS = -200478;
const START = 0;
const LIBRARY_FILE = { linux: "libnilvaiu.so", darwin: "libnilvaiu.dylib", win32: "nilvaiu.dll" }[process.platform];
const library = path.resolve("target/debug", LIBRARY_FILE);

before(() => {
  const built = spawnSync("cargo", ["build", "-q", "-p", "nilvaiu"], { stdio: "inherit" });
  assert.equal(built.status, 0, "nilvaiu builds");
});

const configured = (config) => ({ ...defaultCallLibraryConfig(), thread: "any", library, "return-type": { type: "numeric", "data-type": "i32" }, ...config });
/** The node as NI's DAQ OVIs name their library (measured, labview-captures/reports/2026-11-08-daq-clfn-api.md). */
const namingNi = (config) => ({ ...config, library: "nilvaiu.*" });
const numeric = (name, dataType) => ({ name, type: "numeric", "data-type": dataType, pass: "value" });
const stringHandle = (name) => ({ name, type: "string", "string-format": "string-handle" });
const taskCell = (name) => ({ name, type: "adapt-to-type", "data-format": "handles-by-value" });

/** `DAQCreateTask140(lvAppReference, taskRefObjectPtr, newTaskName, taskToCopy, autoCleanup, channels, extendedErrorInfo)`. */
const CREATE_TASK = configured({
  function: "DAQCreateTask140",
  parameters: [numeric("lvAppReference", "uptr"), taskCell("taskRefObjectPtr"), stringHandle("newTaskName"), stringHandle("taskToCopy"), numeric("autoCleanup", "u8"), stringHandle("channels"), stringHandle("extendedErrorInfo")],
});
const CONTROL = configured({ function: "DAQControl", parameters: [numeric("taskID", "uptr"), numeric("mode", "u32"), stringHandle("extendedErrorInfo")] });
const DESTROY_TASK = configured({ function: "DAQDestroyTask110", parameters: [taskCell("taskRefObjPtr"), stringHandle("errorInfo")] });

async function run(vi, io = loadSolderIo()) {
  const compiled = compilar(vi.g, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const byId = Object.fromEntries(Object.entries(vi.id).map(([name, nodeId]) => [nodeId, name]));
  const written = await ejecutar(compiled, {}, { io });
  return Object.fromEntries(Object.entries(written).map(([nodeId, value]) => [byId[nodeId], value]));
}

/**
 * Create Task "p1" from an empty task constant, then Start (no channels) and Destroy through the wire it gives.
 * `name(config)` gives each node its library.
 */
const createStartDestroy = (name = (config) => config) =>
  buildVI(CAT, (b) => {
    b.node("empty", "daq-name-constant", { type: DAQ_TASK, value: "" });
    b.node("name", "str-const", { value: "p1" });
    b.node("nothing", "str-const", { value: "" });
    b.node("create", "call-library", name(CREATE_TASK));
    b.node("control", "call-library", name(CONTROL));
    b.node("destroy", "call-library", name(DESTROY_TASK));
    b.node("created", "indicator", { type: "i32" });
    b.node("started", "indicator", { type: "i32" });
    b.node("destroyed", "indicator", { type: "i32" });
    b.node("startText", "str-indicator", {});
    b.node("taskName", "str-indicator", {});
    b.wire("empty.result", "create.arg-1-in");
    b.wire("name.result", "create.arg-2-in");
    for (const index of [3, 5, 6]) b.wire("nothing.result", `create.arg-${index}-in`);
    b.wire("nothing.result", "control.arg-2-in");
    b.wire("nothing.result", "destroy.arg-1-in");
    b.wire("create.arg-1-out", "control.arg-0-in");
    b.wire("create.arg-1-out", "destroy.arg-0-in");
    b.wire("create.arg-1-out", "taskName.value");
    b.wire("control.error-out", "destroy.error-in");
    b.wire("create.return", "created.value");
    b.wire("control.return", "started.value");
    b.wire("control.arg-2-out", "startText.value");
    b.wire("destroy.return", "destroyed.value");
  });

test("a task wire is laid out as its name, its number and its record, and is named as LabVIEW names it", () => {
  assert.deepEqual(inMemory(DAQ_TASK).cluster.map((field) => [field.name, field.type]), [["name", "string"], ["number", "u32"], ["record", "u64"]]);
  assert.equal(inMemory(daqName("physical-channel")), "string");
  assert.equal(nombre(DAQ_TASK), "DAQ Task Name");
});

test("every DAQ name coerces to a string and a string to every DAQ name, but two kinds never meet", () => {
  assert.equal(conversion(DAQ_TASK, "string"), "coercion");
  assert.equal(conversion("string", daqName("physical-channel")), "coercion");
  assert.equal(conversion(DAQ_TASK, daqName("physical-channel")), null);
  assert.equal(conversion(DAQ_TASK, DAQ_TASK), "igual");
});

test("a task created through a cell travels on its wire to a pointer-sized integer and to Destroy", async () => {
  const shown = await run(createStartDestroy());
  assert.equal(shown.created, 0);
  // The library found its task object through the wire: a task with no channels cannot start (measured).
  assert.equal(shown.started, TASK_HAS_NO_CHANNELS);
  assert.equal(shown.startText, "<append>\n<B>Task Name: </B>p1");
  assert.equal(shown.taskName, "p1");
  assert.equal(shown.destroyed, 0);
});

test("an empty task constant gives a pointer-sized integer 0, which the library refuses", async () => {
  const vi = buildVI(CAT, (b) => {
    b.node("empty", "daq-name-constant", { type: DAQ_TASK, value: "" });
    b.node("nothing", "str-const", { value: "" });
    b.node("mode", "const", { value: START, type: "u32" });
    b.node("control", "call-library", CONTROL);
    b.node("started", "indicator", { type: "i32" });
    b.wire("empty.result", "control.arg-0-in");
    b.wire("mode.result", "control.arg-1-in");
    b.wire("nothing.result", "control.arg-2-in");
    b.wire("control.return", "started.value");
  });
  assert.equal((await run(vi)).started, INVALID_TASK);
});

test("a node naming NI's nilvaiu.* loads the DAQ add-on's copy by its full path", async () => {
  // The repository's DAQ add-on, installed by copying it as a user would (DT-081 §6), with the library just built.
  const addonsFolder = mkdtempSync(path.join(tmpdir(), "solder-addons-"));
  try {
    const platformPart = `daq-${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`;
    for (const part of ["daq", platformPart]) cpSync(path.resolve("addons", part), path.join(addonsFolder, part), { recursive: true });
    cpSync(library, path.join(addonsFolder, platformPart, "1", "resource", LIBRARY_FILE));
    const { libraryFolders } = loadInstalledAddons({ oviLibRoot: path.resolve("ovi.lib"), nodePlatform: process.platform, architecture: process.arch, homeDirectory: tmpdir(), environment: {}, solderVersion: SOLDER_VERSION, folders: [addonsFolder] });
    const shown = await run(createStartDestroy(namingNi), withLibraryLocator(loadSolderIo(), addonLibraryLocator(libraryFolders)));
    assert.equal(shown.created, 0);
    assert.equal(shown.started, TASK_HAS_NO_CHANNELS);
    assert.equal(shown.destroyed, 0);
  } finally {
    // Windows keeps a loaded library's file locked until the process ends, so there the folder stays behind.
    try {
      rmSync(addonsFolder, { recursive: true, force: true });
    } catch (error) {
      if (error.code !== "EPERM" && error.code !== "EBUSY") throw error;
    }
  }
});

test("a task wire into a String Handle parameter passes the task's name, as LabVIEW's coercion dot does", async () => {
  // Measured: NI's Create Task wires `task to copy` into taskToCopy, a String Handle, with a coercion dot
  // (labview-captures/reports/2026-11-14-daqmx-name-origin.md); the library then reads a name, not a task object.
  const vi = buildVI(CAT, (b) => {
    b.node("empty", "daq-name-constant", { type: DAQ_TASK, value: "" });
    b.node("name", "str-const", { value: "p1" });
    b.node("copyName", "str-const", { value: "p2" });
    b.node("nothing", "str-const", { value: "" });
    b.node("create", "call-library", CREATE_TASK);
    b.node("copy", "call-library", CREATE_TASK);
    b.node("copied", "indicator", { type: "i32" });
    b.node("copyText", "str-indicator", {});
    b.wire("empty.result", "create.arg-1-in");
    b.wire("name.result", "create.arg-2-in");
    for (const index of [3, 5, 6]) b.wire("nothing.result", `create.arg-${index}-in`);
    b.wire("empty.result", "copy.arg-1-in");
    b.wire("copyName.result", "copy.arg-2-in");
    b.wire("create.arg-1-out", "copy.arg-3-in");
    for (const index of [5, 6]) b.wire("nothing.result", `copy.arg-${index}-in`);
    b.wire("copy.return", "copied.value");
    b.wire("copy.arg-6-out", "copyText.value");
  });
  const compiled = compilar(vi.g, CAT);
  assert.equal(compiled.callLibraries.find((entry) => entry.parameters[3].type === "string" && entry.parameters[3].task), undefined, "taskToCopy is a string");
  const shown = await run(vi);
  // Solder's library does not copy tasks yet (DT-087 §4: -1, "not built in Solder yet"): it saw a name.
  assert.equal(shown.copied, -1);
  assert.match(shown.copyText, /copying a task/);
});
