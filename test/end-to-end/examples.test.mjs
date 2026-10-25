// The three examples of examples/ give, value by value, what the same VIs gave in
// LabVIEW 2026 Q3 (examples/README.md, the reference read on 2026-10-10). They are
// the yardstick of the maintainable version (plan, "Road to a maintainable version",
// step 3): nothing else is implemented until these are green.
//
// Each example runs headless, as the command line runs it, with its panel defaults;
// a test changes a control only where the README's case does (Command `FOO`), or to
// skip the waiting when that cannot change a value (Period (ms) of Temperature Monitor).

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import { startValue } from "../../core/model/control-values.mjs";
import { loadHierarchy } from "../../core/model/hierarchy.mjs";
import { leer } from "../../core/model/qvi-format.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import { createNodePool } from "../../core/runtime/node-pool.mjs";
import { CAT, RAIZ } from "../helpers.mjs";

/** A run that has not ended by then never will: the example is aborted and the test fails instead of hanging. */
const RUN_LIMIT_MS = 30_000;

/** LabVIEW shows four decimals; the reference values were read at that precision. */
const DISPLAYED_PRECISION = 1e-4;

const labelOf = (node) => node.label?.text ?? node.name;

// Every example runs on one thread, in the exact order, and on a pool of threads (DT-063 §11).
const pool = createNodePool(4);
after(() => pool.close());
const MODES = [
  { name: "on one thread", options: () => ({}) },
  { name: "on a pool of threads", options: () => ({ poolPorts: pool.connect() }) },
];

/** Loads an example and its subVIs from examples/, as the command line does. */
function loadExample(relativePath) {
  const rootKey = path.join(RAIZ, "examples", relativePath);
  const hierarchy = loadHierarchy(rootKey, CAT, {
    resolvePath: (caller, relative) => path.resolve(path.dirname(caller), relative),
    loadVI: (key, viCatalog) => leer(readFileSync(key, "utf8"), viCatalog),
  });
  assert.deepEqual(hierarchy.errors, [], `${relativePath} loads with its subVIs`);
  return hierarchy.vis.get(hierarchy.root);
}

/**
 * Runs an example. `controls` sets controls by label; `stopWhen(series)` is asked
 * after each value an indicator receives and, when true, presses the control
 * labelled `Stop`. Returns the last value of each indicator and every value each
 * one received (`series`, the points of a chart), both by label, and the dialogs
 * of Simple Error Handler.
 */
async function runExample(relativePath, { controls = {}, stopWhen = () => false, mode = MODES[0] } = {}) {
  const { g, cat } = loadExample(relativePath);
  const compiled = compilar(g, cat, { name: path.basename(relativePath) });
  assert.equal(compiled.errores, undefined, `${relativePath} compiles: ${JSON.stringify(compiled.errores)}`);
  const nodeById = new Map(g.nodos.map((node) => [node.id, node]));
  const controlByLabel = new Map(compiled.controles.map((control) => [labelOf(nodeById.get(control.nodo)), control.nodo]));
  const values = Object.fromEntries(compiled.controles.map((control) => [control.nodo, startValue(nodeById.get(control.nodo))]));
  for (const [label, value] of Object.entries(controls)) {
    assert.ok(controlByLabel.has(label), `${relativePath} has a control labelled «${label}»`);
    values[controlByLabel.get(label)] = value;
  }
  const series = {};
  const dialogs = [];
  const written = await ejecutar(compiled, values, {
    alEscribir: (nodeId, value) => {
      (series[labelOf(nodeById.get(nodeId))] ??= []).push(value);
      if (controlByLabel.has("Stop") && stopWhen(series)) values[controlByLabel.get("Stop")] = true;
    },
    alDialogoError: async (error) => dialogs.push(error),
    senal: AbortSignal.timeout(RUN_LIMIT_MS),
    ...mode.options(),
  });
  // An enum indicator holds the index of its item; the reference names the item, as LabVIEW's panel shows it.
  const typeOf = new Map(compiled.indicadores.map((indicator) => [indicator.nodo, indicator.tipo]));
  const shown = (nodeId, value) => (typeOf.get(nodeId)?.enum ? typeOf.get(nodeId).enum[value] : value);
  const last = Object.fromEntries(Object.entries(written).map(([nodeId, value]) => [labelOf(nodeById.get(nodeId)), shown(nodeId, value)]));
  return { last, series, dialogs };
}

const assertClose = (actual, expected, what) =>
  assert.ok(Math.abs(actual - expected) < DISPLAYED_PRECISION, `${what}: ${actual}, LabVIEW ${expected}`);

const temperatureAt = (iteration) => 20 + 5 * Math.sin(iteration / 10);

for (const mode of MODES) {
  test(`Temperature Monitor gives LabVIEW's average, alarm and chart after its 100 samples ${mode.name}`, async () => {
    // Period (ms) only paces the loop: with 0 it does not wait and every value is the same.
    const { last, series } = await runExample("temperature-monitor/Temperature Monitor.sdg", { mode, controls: { "Period (ms)": 0 } });
    assert.equal(series.Temperature.length, 100, "100 iterations, i = 0…99");
    series.Temperature.forEach((value, iteration) => assertClose(value, temperatureAt(iteration), `point ${iteration}`));
    assert.equal(last.Average, 20.932369884762963);
    assert.equal(last.Alarm, false);
    assertClose(series.Temperature.at(-1), 17.7123, "last temperature");
  });
}

for (const mode of MODES) {
  test(`Instrument Protocol identifies the instrument and plots 5 for every MEAS:VOLT? until Stop ${mode.name}`, async () => {
    const pointsBeforeStop = 3;
    const { last, series, dialogs } = await runExample("instrument-protocol/Instrument Protocol.sdg", { mode,
      stopWhen: (received) => (received.Voltage?.length ?? 0) >= pointsBeforeStop,
    });
    assert.equal(last.Identification, "SOLDER,SIM-1,0,0.2");
    assert.ok(series.Voltage.length >= pointsBeforeStop);
    assert.ok(series.Voltage.every((value) => value === 5), `every point is 5: ${series.Voltage}`);
    assert.equal(last["error out"].status, false);
    assert.deepEqual(dialogs, [], "no error dialog after Stop");
  });
}

for (const mode of MODES) {
  test(`Instrument Protocol with FOO stops after one iteration with LabVIEW's error 85 ${mode.name}`, async () => {
    const { last, series, dialogs } = await runExample("instrument-protocol/Instrument Protocol.sdg", { mode, controls: { Command: "FOO" } });
    assert.deepEqual(series.Voltage, [0], "one point, Scan From String's default");
    // LabVIEW names the VIs by their .vi files and Solder by its own (spec/04 Rule 21k).
    const source = "Scan From String (arg 1) in Parse Reply.sdg->Instrument Protocol.sdg";
    assert.deepEqual(
      { status: last["error out"].status, code: last["error out"].code, source: last["error out"].source },
      { status: true, code: 85, source },
    );
    assert.equal(dialogs.length, 1, "Simple Error Handler shows one dialog");
    assert.equal(dialogs[0].code, 85);
  });
}

for (const mode of MODES) {
  test(`Oven Controller heats, holds and cools in LabVIEW's 66 iterations and ends Done with the fan on ${mode.name}`, async () => {
    const { last, series } = await runExample("oven-controller/Oven Controller.sdg", { mode });
    const heating = Array.from({ length: 27 }, (_, step) => 21.5 + 1.5 * step);
    const holding = Array(20).fill(60.5);
    const cooling = Array.from({ length: 18 }, (_, step) => 58.5 - 2 * step);
    assert.deepEqual(series.Temperature, [20, ...heating, ...holding, ...cooling]);
    assert.equal(last.State, "Done");
    assert.equal(last.Heater, false);
    assert.equal(last.Fan, true);
  });
}

test("the command line runs the subVIs of Instrument Protocol and prints their strings and error cluster", () => {
  const run = (relativePath) =>
    execFileSync(process.execPath, [path.join(RAIZ, "cli/solder.mjs"), "run", path.join(RAIZ, "examples", relativePath), "--threads", "2"], { encoding: "utf8" });
  assert.equal(run("instrument-protocol/Simulated Instrument.sdg"), "Reply = ERR unknown command\n");
  assert.match(run("instrument-protocol/Parse Reply.sdg"), /error out = \{ status: TRUE, code: 85, source: Scan From String \(arg 1\) in Parse Reply\.sdg \}/);
});
