// The DAQ plugin's analog output as built by hand in the editor (stages 12 and 13, docs/design/daq-plugin-findings.md):
// Create Virtual Channel (AO Voltage) and the three DAQ Write instances, run against Solder's nilvaiu. The codes and
// counts are those measured in LabVIEW with NI's driver (labview-captures/reports/2026-11-15-daqmx-ao.md, §n).

import assert from "node:assert/strict";
import { test } from "node:test";

import { DAQ_TASK } from "../../core/model/daq-name.mjs";
import { buildVI } from "../helpers.mjs";
import { NO_ERROR, PLUGIN, callPlugin, installAddonForTheseTests, run, showError } from "./daq-plugin-harness.mjs";

installAddonForTheseTests();

const CREATE_AO_VOLTAGE = "DAQ Create Virtual Channel (AO Voltage).ovi";
const WRITE_ONE_SAMPLE = "DAQ Write (Analog DBL 1Chan 1Samp).ovi";
const WRITE_1D = "DAQ Write (Analog 1D DBL 1Chan NSamp).ovi";
const WRITE_2D = "DAQ Write (Analog 2D DBL NChan NSamp).ovi";
const PHYSICAL_CHANNEL_DOES_NOT_EXIST = -200170;
const DATA_OUTSIDE_RANGE = -200561;
const CHANNEL_COUNT_MISMATCH = -200524;
const SAMPLES = 100;
const RATE = 1000;

/** Create Virtual Channel (AO Voltage) on `physicalChannels`, with no task in, as node "create". */
function createAoVoltage(b, physicalChannels) {
  b.node("channels", "str-const", { value: physicalChannels });
  b.node("empty", "daq-name-constant", { type: DAQ_TASK, value: "" });
  b.node("no error", "error-cluster-constant");
  callPlugin(b, "create", CREATE_AO_VOLTAGE, "empty.result", "no error.result");
  b.wire("channels.result", "create.daq-name-control_2");
  showError(b, "create error", "create.cluster-indicator_1");
}

/** A write node "write" of `file` after `task`, with its samples written and its error out shown. */
function write(b, file, task, errorIn) {
  callPlugin(b, "write", file, task, errorIn);
  b.node("written", "indicator", { type: "u32" });
  b.wire("write.indicator_1", "written.value");
  showError(b, "write error", "write.cluster-indicator_1");
}

/** Clear Task after `task`, its error shown as "clear error". */
function clear(b, task, errorIn) {
  callPlugin(b, "clear", "DAQ Clear Task.ovi", task, errorIn);
  showError(b, "clear error", "clear.cluster-indicator_1");
}

const singleSample = (value) =>
  buildVI(PLUGIN, (b) => {
    createAoVoltage(b, "Dev1/ao0");
    b.node("value", "const", { value, type: "dbl" });
    write(b, WRITE_ONE_SAMPLE, "create.daq-name-indicator_1", "create.cluster-indicator_1");
    b.wire("value.result", "write.control_2");
    clear(b, "write.daq-name-indicator_1", "write.cluster-indicator_1");
  });

/** Create on `physicalChannels`, Timing finite at RATE for SAMPLES, `file` writing `data`, Start, Wait Until Done, Clear. */
const finiteGeneration = (physicalChannels, file, data, dataType) =>
  buildVI(PLUGIN, (b) => {
    createAoVoltage(b, physicalChannels);
    b.node("rate", "const", { value: RATE, type: "dbl" });
    b.node("samples", "const", { value: SAMPLES, type: "i32" });
    callPlugin(b, "timing", "DAQ Timing (Sample Clock).ovi", "create.daq-name-indicator_1", "create.cluster-indicator_1");
    b.wire("rate.result", "timing.control_1");
    b.wire("samples.result", "timing.control_4");
    showError(b, "timing error", "timing.cluster-indicator_1");
    b.node("data", "arr-const", { type: dataType, value: data });
    write(b, file, "timing.daq-name-indicator_1", "timing.cluster-indicator_1");
    b.wire("data.result", "write.arr-control_1");
    let [task, error] = ["write.daq-name-indicator_1", "write.cluster-indicator_1"];
    for (const [name, ovi] of [["start", "DAQ Start Task.ovi"], ["wait", "DAQ Wait Until Done.ovi"]]) {
      callPlugin(b, name, ovi, task, error);
      showError(b, `${name} error`, `${name}.cluster-indicator_1`);
      [task, error] = [`${name}.daq-name-indicator_1`, `${name}.cluster-indicator_1`];
    }
    clear(b, task, error);
  });

const ramp = (top) => Array.from({ length: SAMPLES }, (_, index) => (top * index) / SAMPLES);

test("Create Virtual Channel (AO Voltage) takes the device's two outputs and refuses a third, as NI's", async () => {
  const shown = await run(buildVI(PLUGIN, (b) => createAoVoltage(b, "Dev1/ao2")));
  assert.deepEqual([shown["create error"].status, shown["create error"].code], [true, PHYSICAL_CHANNEL_DOES_NOT_EXIST], "§2");
  assert.deepEqual((await run(buildVI(PLUGIN, (b) => createAoVoltage(b, "Dev1/ao0:1"))))["create error"], NO_ERROR);
});

test("Write one sample: 3 V goes out, 15 V is -200561 and still counts one sample written", async () => {
  const fine = await run(singleSample(3.0));
  assert.deepEqual([fine["write error"], fine.written, fine["clear error"]], [NO_ERROR, 1, NO_ERROR], "§4");
  const outside = await run(singleSample(15.0));
  assert.deepEqual([outside["write error"].code, outside.written], [DATA_OUTSIDE_RANGE, 1], "§4");
  assert.match(outside["write error"].source, /Dev1\/ao0/);
});

test("a finite generation of two channels written as 2D runs through Wait Until Done, and one row is -200524", async () => {
  const fine = await run(finiteGeneration("Dev1/ao0:1", WRITE_2D, [ramp(1), ramp(2)], { array: "number", dims: 2 }));
  for (const step of ["timing", "write", "start", "wait", "clear"]) assert.deepEqual(fine[`${step} error`], NO_ERROR, step);
  assert.equal(fine.written, SAMPLES, "§5");
  const oneRow = await run(finiteGeneration("Dev1/ao0:1", WRITE_2D, [ramp(1)], { array: "number", dims: 2 }));
  assert.deepEqual([oneRow["write error"].code, oneRow.written], [CHANNEL_COUNT_MISMATCH, 0], "§7");
});

test("Write 1D on one channel builds its array into one row, as NI's does, and writes every sample", async () => {
  const shown = await run(finiteGeneration("Dev1/ao0", WRITE_1D, ramp(1), { array: "number" }));
  for (const step of ["timing", "write", "start", "wait", "clear"]) assert.deepEqual(shown[`${step} error`], NO_ERROR, step);
  assert.equal(shown.written, SAMPLES);
});
