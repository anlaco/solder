// The DAQ plugin's digital lines as built by hand in the editor (stages 14 and 15, docs/design/daq-plugin-findings.md):
// Create Virtual Channel (Digital Input) and (Digital Output), run against Solder's nilvaiu. The codes and values are
// those measured in LabVIEW with NI's driver (labview-captures/reports/2026-11-15-daqmx-dio.md, §n).

import assert from "node:assert/strict";
import { test } from "node:test";

import { DAQ_TASK } from "../../core/model/daq-name.mjs";
import { buildVI } from "../helpers.mjs";
import { NO_ERROR, PLUGIN, callPlugin, installAddonForTheseTests, run, showError } from "./daq-plugin-harness.mjs";

installAddonForTheseTests();

const CREATE_DIGITAL_INPUT = "DAQ Create Virtual Channel (Digital Input).ovi";
const CREATE_DIGITAL_OUTPUT = "DAQ Create Virtual Channel (Digital Output).ovi";
const ONE_CHANNEL_FOR_EACH_LINE = 0;
const ONE_CHANNEL_FOR_ALL_LINES = 1;
const PHYSICAL_CHANNEL_DOES_NOT_EXIST = -200170;
const PORT_NEEDS_ONE_CHANNEL = -200376;
const CHANNEL_TYPE_MIXED = -200559;
const READ_BOOL = "DAQ Read (Digital Bool 1Line 1Point).ovi";
const READ_U32 = "DAQ Read (Digital U32 1Chan 1Samp).ovi";
const WRITE_BOOL = "DAQ Write (Digital Bool 1Line 1Point).ovi";
const LINE_COUNT_MISMATCH = -200463;
const NO_OUTPUT_CHANNELS = -200459;
const READS = 5;

/** A Create Virtual Channel of `file` on `lines` with `grouping`, as node `name`, after `task` (none: an empty task). */
function createDigital(b, name, file, lines, grouping, task, errorIn) {
  b.node(`${name} lines`, "str-const", { value: lines });
  b.node(`${name} grouping`, "const", { value: grouping, type: "i32" });
  if (!task) {
    b.node(`${name} empty`, "daq-name-constant", { type: DAQ_TASK, value: "" });
    b.node(`${name} no error`, "error-cluster-constant");
    [task, errorIn] = [`${name} empty.result`, `${name} no error.result`];
  }
  callPlugin(b, name, file, task, errorIn);
  b.wire(`${name} lines.result`, `${name}.daq-name-control_2`);
  b.wire(`${name} grouping.result`, `${name}.control_1`);
  showError(b, `${name} error`, `${name}.cluster-indicator_1`);
}

/** Clears the task of node `after`. */
function clear(b, after) {
  callPlugin(b, "clear", "DAQ Clear Task.ovi", `${after}.daq-name-indicator_1`, `${after}.cluster-indicator_1`);
}

const createAndClear = (file, lines, grouping) =>
  buildVI(PLUGIN, (b) => {
    createDigital(b, "create", file, lines, grouping);
    clear(b, "create");
  });

test("Create Virtual Channel (Digital Input) takes a line, refuses a missing one and a port line by line", async () => {
  const cases = [
    ["Dev1/port0/line0", ONE_CHANNEL_FOR_EACH_LINE, NO_ERROR.code],
    ["Dev1/port0", ONE_CHANNEL_FOR_ALL_LINES, NO_ERROR.code],
    ["Dev1/port0", ONE_CHANNEL_FOR_EACH_LINE, PORT_NEEDS_ONE_CHANNEL],
    ["Dev1/port0/line8", ONE_CHANNEL_FOR_EACH_LINE, PHYSICAL_CHANNEL_DOES_NOT_EXIST],
    ["Dev1/port2/line0", ONE_CHANNEL_FOR_EACH_LINE, NO_ERROR.code],
  ];
  for (const [lines, grouping, code] of cases) {
    const shown = await run(createAndClear(CREATE_DIGITAL_INPUT, lines, grouping));
    assert.equal(shown["create error"].code, code, `§1, §2: ${lines} grouping ${grouping}`);
  }
});

test("Create Virtual Channel (Digital Output) runs, and a digital output joins no digital input's task", async () => {
  assert.deepEqual((await run(createAndClear(CREATE_DIGITAL_OUTPUT, "Dev2/port2/line7", ONE_CHANNEL_FOR_EACH_LINE)))["create error"], NO_ERROR, "§1");
  const mixed = buildVI(PLUGIN, (b) => {
    createDigital(b, "input", CREATE_DIGITAL_INPUT, "Dev1/port0/line0", ONE_CHANNEL_FOR_EACH_LINE);
    createDigital(b, "output", CREATE_DIGITAL_OUTPUT, "Dev1/port0/line1", ONE_CHANNEL_FOR_EACH_LINE, "input.daq-name-indicator_1", "input.cluster-indicator_1");
    clear(b, "output");
  });
  const shown = await run(mixed);
  assert.deepEqual([shown["input error"], shown["output error"].code], [NO_ERROR, CHANNEL_TYPE_MIXED], "§7");
});

/** Create on `lines`, then READS reads of `file` in a chain, each value shown as "value <n>". */
const readsInARow = (file, lines, grouping, indicatorType) =>
  buildVI(PLUGIN, (b) => {
    createDigital(b, "create", CREATE_DIGITAL_INPUT, lines, grouping);
    let after = "create";
    for (let index = 0; index < READS; index++) {
      const name = `read ${index}`;
      callPlugin(b, name, file, `${after}.daq-name-indicator_1`, `${after}.cluster-indicator_1`);
      b.node(`value ${index}`, "indicator", { type: indicatorType });
      b.wire(`${name}.${file === READ_BOOL ? "bool-indicator_1" : "indicator_1"}`, `value ${index}.value`);
      showError(b, `${name} error`, `${name}.cluster-indicator_1`);
      after = name;
    }
    clear(b, after);
  });

const valuesOf = (shown) => Array.from({ length: READS }, (_, index) => shown[`value ${index}`]);

test("Read (Digital Bool 1Line 1Point) gives the line of the task's counter, and refuses a channel of four lines", async () => {
  const shown = await run(readsInARow(READ_BOOL, "Dev1/port0/line0", ONE_CHANNEL_FOR_EACH_LINE, "boolean"));
  assert.deepEqual(valuesOf(shown), [false, true, false, true, false], "§3");
  assert.deepEqual(shown["read 4 error"], NO_ERROR);
  const wide = await run(readsInARow(READ_BOOL, "Dev1/port0/line0:3", ONE_CHANNEL_FOR_ALL_LINES, "boolean"));
  assert.equal(wide["read 0 error"].code, LINE_COUNT_MISMATCH, "§3");
});

test("Read (Digital U32 1Chan 1Samp) gives a whole port's counter", async () => {
  const shown = await run(readsInARow(READ_U32, "Dev1/port0", ONE_CHANNEL_FOR_ALL_LINES, "u32"));
  assert.deepEqual(valuesOf(shown), [0, 1, 2, 3, 4], "§4");
});

/** Create of `file` on Dev1/port0/line0 and one Write of true with its default auto start. */
const writeTrue = (file) =>
  buildVI(PLUGIN, (b) => {
    createDigital(b, "create", file, "Dev1/port0/line0", ONE_CHANNEL_FOR_EACH_LINE);
    b.node("true", "bool-const", { value: true });
    callPlugin(b, "write", WRITE_BOOL, "create.daq-name-indicator_1", "create.cluster-indicator_1");
    b.wire("true.result", "write.bool-control_2");
    b.node("written", "indicator", { type: "u32" });
    b.wire("write.indicator_1", "written.value");
    showError(b, "write error", "write.cluster-indicator_1");
    clear(b, "write");
  });

test("Write (Digital Bool 1Line 1Point) writes one sample with auto start, and a digital input has no outputs", async () => {
  const fine = await run(writeTrue(CREATE_DIGITAL_OUTPUT));
  assert.deepEqual([fine["write error"], fine.written], [NO_ERROR, 1], "§6");
  const input = await run(writeTrue(CREATE_DIGITAL_INPUT));
  assert.deepEqual([input["write error"].code, input.written], [NO_OUTPUT_CHANNELS, 0], "§6");
});
