// The DAQ plugin's OVIs as they were built by hand in the editor (DT-087, amendment of 2026-11-13 "what the plugin's
// OVIs hold inside"; docs/design/daq-plugin-findings.md), read from the add-on's `ovi.lib/DAQ/` and run as subOVIs
// against Solder's own nilvaiu, loaded from the add-on as a node naming `nilvaiu.*` loads it (DT-087 §8). The codes
// are those measured in LabVIEW with NI's library (labview-captures/reports/2026-11-13-daq-create-task.md).

import assert from "node:assert/strict";
import { test } from "node:test";

import { defaultCallLibraryConfig } from "../../core/model/call-library.mjs";
import { DAQ_TASK } from "../../core/model/daq-name.mjs";
import { ERROR } from "../../core/model/types.mjs";
import { buildVI } from "../helpers.mjs";
import { NO_ERROR, PLUGIN, callPlugin, installAddonForTheseTests, run, showError } from "./daq-plugin-harness.mjs";

const INVALID_TASK = -200088;
const TASK_HAS_NO_CHANNELS = -200478;

installAddonForTheseTests();

/** `DAQCreateTask140` called directly, as the test of the task wire configures it, so that Start Task is tried on its own. */
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

const DEVICE_NOT_VALID = -200220;
const PHYSICAL_CHANNEL_DOES_NOT_EXIST = -200170;
const CREATE_AI_VOLTAGE = "DAQ Create Virtual Channel (AI Voltage).sdg";

/** The plugin's Create Virtual Channel (AI Voltage) on `physicalChannels`, with no task in: it creates one (measured). */
function createAiVoltage(b, name, physicalChannels) {
  b.node(`${name} channels`, "str-const", { value: physicalChannels });
  b.node(`${name} empty`, "daq-name-constant", { type: DAQ_TASK, value: "" });
  b.node(`${name} no error`, "error-cluster-constant");
  callPlugin(b, name, CREATE_AI_VOLTAGE, `${name} empty.result`, `${name} no error.result`);
  b.wire(`${name} channels.result`, `${name}.daq-name-control_2`);
}

test("Create Virtual Channel, Start, Stop and Clear Task run a task on the simulated device without an error", async () => {
  const vi = buildVI(PLUGIN, (b) => {
    createAiVoltage(b, "create", "Dev1/ai0");
    let task = "create.daq-name-indicator_1";
    let error = "create.cluster-indicator_1";
    showError(b, "create error", error);
    b.node("task name", "daq-name-indicator", { type: DAQ_TASK });
    b.wire(task, "task name.value");
    for (const [name, file] of [["start", "DAQ Start Task.sdg"], ["stop", "DAQ Stop Task.sdg"], ["clear", "DAQ Clear Task.sdg"]]) {
      callPlugin(b, name, file, task, error);
      error = `${name}.cluster-indicator_1`;
      showError(b, `${name} error`, error);
      if (name !== "clear") task = `${name}.daq-name-indicator_1`;
    }
  });
  const shown = await run(vi);
  // LabVIEW names a task it creates for a channel `_unnamedTask<n>` (measured, reports/2026-11-06-daqmx-create-channel.md).
  assert.match(shown["task name"], /^_unnamedTask<\d+>$/);
  for (const name of ["create", "start", "stop", "clear"]) assert.deepEqual(shown[`${name} error`], NO_ERROR, name);
});

test("Create Virtual Channel gives LabVIEW's codes for a device or a channel that does not exist", async () => {
  const vi = buildVI(PLUGIN, (b) => {
    for (const [name, channels] of [["no device", "Dev9/ai0"], ["no channel", "Dev1/ai99"]]) {
      createAiVoltage(b, name, channels);
      showError(b, `${name} error`, `${name}.cluster-indicator_1`);
      // Each failed Create still made its task, which Clear releases.
      callPlugin(b, `${name} clear`, "DAQ Clear Task.sdg", `${name}.daq-name-indicator_1`, `${name}.cluster-indicator_1`);
    }
  });
  const shown = await run(vi);
  assert.deepEqual([shown["no device error"].status, shown["no device error"].code], [true, DEVICE_NOT_VALID]);
  assert.match(shown["no device error"].source, /^<append>[\s\S]*Dev9/);
  assert.deepEqual([shown["no channel error"].status, shown["no channel error"].code], [true, PHYSICAL_CHANNEL_DOES_NOT_EXIST]);
  assert.match(shown["no channel error"].source, /Dev1\/ai99/);
});

const CREATE_TASK_OVI = "DAQ Create Task.sdg";
/** Solder's code for what its library does not do yet (DT-087 §4). */
const NOT_BUILT_IN_SOLDER = -1;

/** The plugin's Create Task as node `name`, with `taskName` as new task name and no error in. */
function createTask(b, name, taskName) {
  b.node(`${name} name`, "str-const", { value: taskName });
  b.node(`${name} no error`, "error-cluster-constant");
  b.node(name, "subvi", { vi: CREATE_TASK_OVI });
  b.wire(`${name} name.result`, `${name}.str-control_1`);
  b.wire(`${name} no error.result`, `${name}.cluster-control_1`);
}

test("Create Task, Create Virtual Channel, Start, Stop and Clear Task: LabVIEW's whole analog-input setup", async () => {
  const vi = buildVI(PLUGIN, (b) => {
    createTask(b, "create task", "p1");
    b.node("channels", "str-const", { value: "Dev1/ai0" });
    callPlugin(b, "create channel", CREATE_AI_VOLTAGE, "create task.daq-name-indicator_1", "create task.cluster-indicator_1");
    b.wire("channels.result", "create channel.daq-name-control_2");
    let task = "create channel.daq-name-indicator_1";
    let error = "create channel.cluster-indicator_1";
    showError(b, "create task error", "create task.cluster-indicator_1");
    showError(b, "create channel error", error);
    b.node("task name", "daq-name-indicator", { type: DAQ_TASK });
    b.wire(task, "task name.value");
    for (const [name, file] of [["start", "DAQ Start Task.sdg"], ["stop", "DAQ Stop Task.sdg"], ["clear", "DAQ Clear Task.sdg"]]) {
      callPlugin(b, name, file, task, error);
      error = `${name}.cluster-indicator_1`;
      showError(b, `${name} error`, error);
      if (name !== "clear") task = `${name}.daq-name-indicator_1`;
    }
  });
  const shown = await run(vi);
  assert.equal(shown["task name"], "p1", "the channel went into the task Create Task made");
  for (const name of ["create task", "create channel", "start", "stop", "clear"]) assert.deepEqual(shown[`${name} error`], NO_ERROR, name);
});

test("Create Task passes an error in through and gives an empty task, and refuses to copy a task, which Solder does not do yet", async () => {
  const vi = buildVI(PLUGIN, (b) => {
    b.node("incoming", "error-cluster-constant", { value: { status: true, code: 5, source: "orig" } });
    b.node("passing", "subvi", { vi: CREATE_TASK_OVI });
    b.wire("incoming.result", "passing.cluster-control_1");
    showError(b, "passing error", "passing.cluster-indicator_1");
    b.node("passing task", "daq-name-indicator", { type: DAQ_TASK });
    b.wire("passing.daq-name-indicator_1", "passing task.value");
    createTask(b, "copying", "p2");
    b.node("to copy", "daq-name-constant", { type: DAQ_TASK, value: "p1" });
    b.wire("to copy.result", "copying.daq-name-control_1");
    showError(b, "copying error", "copying.cluster-indicator_1");
  });
  const shown = await run(vi);
  assert.deepEqual(shown["passing error"], { status: true, code: 5, source: "orig" });
  assert.equal(shown["passing task"], "");
  assert.deepEqual([shown["copying error"].status, shown["copying error"].code], [true, NOT_BUILT_IN_SOLDER]);
  assert.match(shown["copying error"].source, /^<append>[\s\S]*copying a task/);
});

const TIMING_OVI = "DAQ Timing (Sample Clock).sdg";
const INVALID_PROPERTY_VALUE = -200077;
/** Few samples, so that Wait Until Done waits a tenth of a second at the default 1 kHz. */
const SHORT_ACQUISITION = 100;

/**
 * The plugin's chain from Create Virtual Channel on Dev1/ai0, through Timing with `rate` (and SHORT_ACQUISITION
 * samples), Start, Wait Until Done, Stop and Clear; each step's error out shown as `<step> error`.
 */
const timedAcquisition = (rate) =>
  buildVI(PLUGIN, (b) => {
    createAiVoltage(b, "create", "Dev1/ai0");
    b.node("rate", "const", { value: rate, type: "dbl" });
    b.node("samples", "const", { value: SHORT_ACQUISITION, type: "i32" });
    let task = "create.daq-name-indicator_1";
    let error = "create.cluster-indicator_1";
    for (const [name, file] of [["timing", TIMING_OVI], ["start", "DAQ Start Task.sdg"], ["wait", "DAQ Wait Until Done.sdg"], ["stop", "DAQ Stop Task.sdg"], ["clear", "DAQ Clear Task.sdg"]]) {
      callPlugin(b, name, file, task, error);
      error = `${name}.cluster-indicator_1`;
      showError(b, `${name} error`, error);
      if (name !== "clear") task = `${name}.daq-name-indicator_1`;
    }
    // Timing's rate is its control_1 and samples per channel its control_4, as the saved connector names them.
    b.wire("rate.result", "timing.control_1");
    b.wire("samples.result", "timing.control_4");
  });

test("Timing, Start, Wait Until Done, Stop and Clear: a finite acquisition at 1 kHz ends without an error", async () => {
  const shown = await run(timedAcquisition(1000));
  for (const name of ["timing", "start", "wait", "stop", "clear"]) assert.deepEqual(shown[`${name} error`], NO_ERROR, name);
});

test("a rate the device cannot reach is -200077 at Timing, as measured, and the error passes down the chain", async () => {
  // Measured: 1 MHz on the simulated USB-6001, whose maximum is 20 kHz (reports/2026-11-06-daqmx-timing-trigger.md).
  const shown = await run(timedAcquisition(1e6));
  assert.deepEqual([shown["timing error"].status, shown["timing error"].code], [true, INVALID_PROPERTY_VALUE]);
  assert.match(shown["timing error"].source, /^<append>/);
  for (const name of ["start", "wait", "stop", "clear"]) assert.equal(shown[`${name} error`].code, INVALID_PROPERTY_VALUE, name);
});

test("Stop Task stops the task even with an error in, which it passes on, as NI's does", async () => {
  // Measured: NI's Stop Task's node has no error in, so it always stops; without the stop a second Start is -200479
  // (labview-captures/reports/2026-11-14-clfn-error-in.md).
  const vi = buildVI(PLUGIN, (b) => {
    createAiVoltage(b, "create", "Dev1/ai0");
    b.node("incoming", "error-cluster-constant", { value: { status: true, code: 5, source: "orig" } });
    callPlugin(b, "start", "DAQ Start Task.sdg", "create.daq-name-indicator_1", "create.cluster-indicator_1");
    callPlugin(b, "stop", "DAQ Stop Task.sdg", "start.daq-name-indicator_1", "incoming.result");
    callPlugin(b, "start again", "DAQ Start Task.sdg", "stop.daq-name-indicator_1", "start.cluster-indicator_1");
    callPlugin(b, "clear", "DAQ Clear Task.sdg", "start again.daq-name-indicator_1", "start again.cluster-indicator_1");
    showError(b, "stop error", "stop.cluster-indicator_1");
    showError(b, "start again error", "start again.cluster-indicator_1");
    showError(b, "clear error", "clear.cluster-indicator_1");
  });
  const shown = await run(vi);
  assert.deepEqual(shown["stop error"], { status: true, code: 5, source: "orig" });
  assert.deepEqual(shown["start again error"], NO_ERROR, "the task was stopped, so it starts again");
  assert.deepEqual(shown["clear error"], NO_ERROR);
});

// ——— The reads (measured, labview-captures/reports/2026-11-06-daqmx-read-write.md "Behaviour on Dev1") ———

const READ_1CHAN_1SAMP = "DAQ Read (Analog DBL 1Chan 1Samp).sdg";
const READ_1CHAN_NSAMP = "DAQ Read (Analog 1D DBL 1Chan NSamp).sdg";
const READ_NCHAN_1SAMP = "DAQ Read (Analog 1D DBL NChan 1Samp).sdg";
const READ_NCHAN_NSAMP = "DAQ Read (Analog 2D DBL NChan NSamp).sdg";
const READ_BEYOND_FINAL_SAMPLE = -200278;
/** The simulated input's range, ±5 V as Create Virtual Channel's default (its sine is about 4.84 V, measured). */
const AI_RANGE = 5;

/**
 * A chain on `channels`: Create Virtual Channel, then Timing (finite, SHORT_ACQUISITION samples at 1 kHz) unless
 * `onDemand`, then the steps `reads` names (OVI files, each read's data shown as `<name> data`), then Clear.
 */
function readingChain(b, channels, reads, { onDemand = false, samplesPerRead } = {}) {
  createAiVoltage(b, "create", channels);
  let task = "create.daq-name-indicator_1";
  let error = "create.cluster-indicator_1";
  const step = (name, file) => {
    callPlugin(b, name, file, task, error);
    task = `${name}.daq-name-indicator_1`;
    error = `${name}.cluster-indicator_1`;
    showError(b, `${name} error`, error);
  };
  if (!onDemand) {
    b.node("rate", "const", { value: 1000, type: "dbl" });
    b.node("samples", "const", { value: SHORT_ACQUISITION, type: "i32" });
    step("timing", TIMING_OVI);
    b.wire("rate.result", "timing.control_1");
    b.wire("samples.result", "timing.control_4");
  }
  for (const [name, file, dataType] of reads) {
    step(name, file);
    b.node(`${name} data`, dataType === "number" ? "indicator" : "arr-indicator", { type: dataType });
    // A read's data is its indicator_1 (one sample) or arr-control_1 (an array indicator), as its saved connector names them.
    b.wire(`${name}.${dataType === "number" ? "indicator_1" : "arr-control_1"}`, `${name} data.value`);
    if (samplesPerRead !== undefined && file !== READ_1CHAN_1SAMP && file !== READ_NCHAN_1SAMP) {
      b.node(`${name} count`, "const", { value: samplesPerRead, type: "i32" });
      b.wire(`${name} count.result`, `${name}.control_2`);
    }
  }
  callPlugin(b, "clear", "DAQ Clear Task.sdg", task, error);
  showError(b, "clear error", "clear.cluster-indicator_1");
}

const ONE_DBL = "number";
const DBL_1D = { array: "number" };
const DBL_2D = { array: "number", dims: 2 };

test("a single read with no Timing nor Start starts the task itself and gives one value in range, as LabVIEW's", async () => {
  const shown = await run(buildVI(PLUGIN, (b) => readingChain(b, "Dev1/ai0", [["read", READ_1CHAN_1SAMP, ONE_DBL]], { onDemand: true })));
  assert.deepEqual(shown["read error"], NO_ERROR);
  assert.ok(Math.abs(shown["read data"]) <= AI_RANGE, `${shown["read data"]} is within ±5 V`);
});

test("a finite acquisition read with -1 gives every sample, and a second read is -200278", async () => {
  const shown = await run(buildVI(PLUGIN, (b) =>
    readingChain(b, "Dev1/ai0", [["first", READ_1CHAN_NSAMP, DBL_1D], ["second", READ_1CHAN_NSAMP, DBL_1D]], { samplesPerRead: -1 })));
  assert.deepEqual(shown["first error"], NO_ERROR);
  assert.equal(shown["first data"].length, SHORT_ACQUISITION);
  assert.ok(shown["first data"].every((value) => Math.abs(value) <= AI_RANGE));
  assert.deepEqual([shown["second error"].status, shown["second error"].code], [true, READ_BEYOND_FINAL_SAMPLE]);
  assert.match(shown["second error"].source, /^<append>/);
});

test("two channels read one sample each, or every sample of each as a row", async () => {
  const single = await run(buildVI(PLUGIN, (b) => readingChain(b, "Dev1/ai0:1", [["read", READ_NCHAN_1SAMP, DBL_1D]], { onDemand: true })));
  assert.deepEqual(single["read error"], NO_ERROR);
  assert.equal(single["read data"].length, 2, "one value per channel");
  const all = await run(buildVI(PLUGIN, (b) => readingChain(b, "Dev1/ai0:1", [["read", READ_NCHAN_NSAMP, DBL_2D]], { samplesPerRead: -1 })));
  assert.deepEqual(all["read error"], NO_ERROR);
  assert.deepEqual(all["read data"].map((row) => row.length), [SHORT_ACQUISITION, SHORT_ACQUISITION], "a row per channel");
});
