// The DAQ plugin's OVIs mark their inputs Required, Recommended or Optional as NI's DAQmx VIs do (finding S14-#13).
// The weights were measured in LabVIEW 2026 Q3 over VI Server, `_ExportInterface2` (labview-captures/reports/
// 2026-11-15-daqmx-weights.md); a cell not listed here is Recommended, LabVIEW's default and NI's for every other input.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const DAQ_FOLDER = new URL("../../addons/daq/1/ovi.lib/DAQ/", import.meta.url);

const TASK_IN = 0;
const PHYSICAL_CHANNELS = 5;
const DATA = 7;
const TIMEOUT = 9;

/** The cells that are not Recommended, by OVI. */
const MEASURED_WEIGHTS = {
  "DAQ Create Task.sdg": {},
  "DAQ Start Task.sdg": { [TASK_IN]: "required" },
  "DAQ Stop Task.sdg": { [TASK_IN]: "required" },
  "DAQ Clear Task.sdg": { [TASK_IN]: "required" },
  "DAQ Wait Until Done.sdg": { [TASK_IN]: "required" },
  "DAQ Create Virtual Channel (AI Voltage).sdg": { [PHYSICAL_CHANNELS]: "required" },
  "DAQ Create Virtual Channel (AO Voltage).sdg": { [PHYSICAL_CHANNELS]: "required" },
  "DAQ Create Virtual Channel (Digital Input).sdg": { [PHYSICAL_CHANNELS]: "required" },
  "DAQ Create Virtual Channel (Digital Output).sdg": { [PHYSICAL_CHANNELS]: "required" },
  "DAQ Timing (Sample Clock).sdg": { [TASK_IN]: "required", 5: "required" },
  "DAQ Start Trigger (None).sdg": { [TASK_IN]: "required" },
  "DAQ Start Trigger (Digital Edge).sdg": { [TASK_IN]: "required", 5: "required" },
  ...Object.fromEntries(
    ["Analog DBL 1Chan 1Samp", "Analog 1D DBL 1Chan NSamp", "Analog 1D DBL NChan 1Samp", "Analog 2D DBL NChan NSamp", "Digital Bool 1Line 1Point", "Digital U32 1Chan 1Samp"].map(
      (instance) => [`DAQ Read (${instance}).sdg`, { [TASK_IN]: "required", [TIMEOUT]: "optional" }],
    ),
  ),
  ...Object.fromEntries(
    ["Analog DBL 1Chan 1Samp", "Analog 1D DBL 1Chan NSamp", "Analog 2D DBL NChan NSamp", "Digital Bool 1Line 1Point"].map((instance) => [
      `DAQ Write (${instance}).sdg`,
      { [TASK_IN]: "required", [DATA]: "required", [TIMEOUT]: "optional" },
    ]),
  ),
};

/** NI's Fill In Error Info has another connector than Solder's, so its weights go by label: error in, status code and extended error info Required, depth Optional. */
const FILL_IN_ERROR_INFO = { "error in": "required", "status code": "required", "extended error info": "required", depth: "optional" };

const readOVI = (file) => JSON.parse(readFileSync(new URL(file, DAQ_FOLDER), "utf8"));
const weightOf = (input) => input.connection ?? "recommended";

for (const [file, weights] of Object.entries(MEASURED_WEIGHTS)) {
  test(`${file} weighs its inputs as NI's VI does`, () => {
    const { connector } = readOVI(file);
    const actual = Object.fromEntries(connector.inputs.map((input) => [input.cell, weightOf(input)]));
    const expected = Object.fromEntries(connector.inputs.map((input) => [input.cell, weights[input.cell] ?? "recommended"]));
    assert.deepEqual(actual, expected);
    assert.ok(connector.outputs.every((output) => weightOf(output) === "recommended"), "outputs are Recommended (measured)");
  });
}

/** The labels of the panel's objects by name, as the panel's layout stores them (the trailing line break dropped). */
const labelsByName = (ovi) => new Map(Object.entries(ovi.layout.panel).map(([name, place]) => [name, place.label?.text.trim()]));

test("DAQ Fill In Error Info weighs its inputs as NI's VI does, by label", () => {
  const ovi = readOVI("DAQ Fill In Error Info.sdg");
  const labels = labelsByName(ovi);
  const actual = Object.fromEntries(ovi.connector.inputs.map((input) => [labels.get(input.name), weightOf(input)]));
  assert.deepEqual(actual, FILL_IN_ERROR_INFO);
});

/** NI's sample mode and active edge are I32 Text Rings (measured: Ring class, I32, `Strings[]`; S16-#9). */
test("DAQ Timing (Sample Clock) takes sample mode and active edge as NI's I32 Text Rings", () => {
  const ovi = readOVI("DAQ Timing (Sample Clock).sdg");
  const labels = labelsByName(ovi);
  const ring = (label) => {
    const control = ovi["front-panel"].find((object) => labels.get(object.name) === label);
    return { type: control.type, style: control.style, items: control["ring-items"], default: control.default };
  };
  assert.deepEqual(ring("sample mode"), {
    type: "i32",
    style: "text-ring",
    items: [
      { text: "Finite Samples", value: 10178 },
      { text: "Continuous Samples", value: 10123 },
      { text: "Hardware Timed Single Point", value: 12522 },
    ],
    default: 10178,
  });
  assert.deepEqual(ring("active edge"), {
    type: "i32",
    style: "text-ring",
    items: [
      { text: "Rising", value: 10280 },
      { text: "Falling", value: 10171 },
    ],
    default: 10280,
  });
});
