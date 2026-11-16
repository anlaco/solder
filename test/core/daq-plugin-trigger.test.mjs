// The DAQ plugin's start triggers as built by hand in the editor (stage 16, docs/design/daq-plugin-findings.md): Start
// Trigger (None) and (Digital Edge), run against Solder's nilvaiu in a finite acquisition. The codes are those measured
// in LabVIEW with NI's driver (labview-captures/reports/2026-11-15-daqmx-trigger.md, §n).

import assert from "node:assert/strict";
import { test } from "node:test";

import { DAQ_TASK } from "../../core/model/daq-name.mjs";
import { buildOVI } from "../helpers.mjs";
import { NO_ERROR, PLUGIN, callPlugin, installAddonForTheseTests, run, showError } from "./daq-plugin-harness.mjs";

installAddonForTheseTests();

const NONE = "DAQ Start Trigger (None).ovi";
const DIGITAL_EDGE = "DAQ Start Trigger (Digital Edge).ovi";
const FALLING = 10171;
const TERMINAL_NOT_FOUND = -89120;
const TRIGGER_NEEDS_SAMPLE_CLOCK = -200262;

/** `name` of the plugin's `file` after node `after`, its error shown as "<name> error". */
function step(b, name, file, after) {
  callPlugin(b, name, file, `${after}.daq-name-indicator_1`, `${after}.cluster-indicator_1`);
  showError(b, `${name} error`, `${name}.cluster-indicator_1`);
}

/**
 * AI Voltage on Dev1/ai0, Timing at 1 kHz for 100 samples unless `untimed`, each trigger of `triggers` in turn (a file
 * and, for Digital Edge, its source and edge), Start, Wait Until Done and Clear.
 */
const acquisition = (triggers, { untimed = false } = {}) =>
  buildOVI(PLUGIN, (b) => {
    b.node("channel", "str-const", { value: "Dev1/ai0" });
    b.node("empty", "daq-name-constant", { type: DAQ_TASK, value: "" });
    b.node("no error", "error-cluster-constant");
    callPlugin(b, "create", "DAQ Create Virtual Channel (AI Voltage).ovi", "empty.result", "no error.result");
    b.wire("channel.result", "create.daq-name-control_2");
    let after = "create";
    if (!untimed) {
      b.node("rate", "const", { value: 1000, type: "dbl" });
      b.node("samples", "const", { value: 100, type: "i32" });
      step(b, "timing", "DAQ Timing (Sample Clock).ovi", after);
      b.wire("rate.result", "timing.control_1");
      b.wire("samples.result", "timing.control_4");
      after = "timing";
    }
    triggers.forEach(({ file, source, edge }, index) => {
      const name = `trigger ${index}`;
      step(b, name, file, after);
      if (source !== undefined) {
        b.node(`${name} source`, "str-const", { value: source });
        b.wire(`${name} source.result`, `${name}.daq-name-control_2`);
      }
      if (edge !== undefined) {
        b.node(`${name} edge`, "const", { value: edge, type: "i32" });
        b.wire(`${name} edge.result`, `${name}.control_1`);
      }
      after = name;
    });
    for (const [name, file] of [["start", "DAQ Start Task.ovi"], ["wait", "DAQ Wait Until Done.ovi"], ["clear", "DAQ Clear Task.ovi"]]) {
      step(b, name, file, after);
      after = name;
    }
  });

test("a digital edge on a PFI line the device has starts and ends as with no trigger, on either edge", async () => {
  for (const trigger of [{ file: NONE }, { file: DIGITAL_EDGE, source: "/Dev1/PFI0" }, { file: DIGITAL_EDGE, source: "/Dev1/PFI1", edge: FALLING }]) {
    const shown = await run(acquisition([trigger]));
    for (const name of ["trigger 0", "start", "wait", "clear"]) assert.deepEqual(shown[`${name} error`], NO_ERROR, `§1, §4: ${trigger.file} ${name}`);
  }
});

test("the source is checked at Start, and a trigger needs a sample clock", async () => {
  const missing = await run(acquisition([{ file: DIGITAL_EDGE, source: "/Dev1/PFI2" }]));
  assert.deepEqual([missing["trigger 0 error"], missing["start error"].code], [NO_ERROR, TERMINAL_NOT_FOUND], "§2");
  assert.match(missing["start error"].source, /\/Dev1\/PFI2/);
  const untimed = await run(acquisition([{ file: DIGITAL_EDGE, source: "/Dev1/PFI0" }], { untimed: true }));
  assert.equal(untimed["start error"].code, TRIGGER_NEEDS_SAMPLE_CLOCK, "§3");
});

test("Start Trigger (None) removes a digital edge set before it", async () => {
  const shown = await run(acquisition([{ file: DIGITAL_EDGE, source: "" }, { file: NONE }]));
  assert.deepEqual([shown["start error"], shown["wait error"]], [NO_ERROR, NO_ERROR], "§5");
});
