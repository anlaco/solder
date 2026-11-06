// examples/error-no-error/ErrorNoError.sdg gives, run after run, what LabVIEW 2026 Q3's ErrorNoError.vi gave
// (labview-captures/reports/2026-11-06-case-error-selector.md, "Runtime"): two Property Nodes clear the LEDs,
// Bundle By Name writes the Boolean into the error's status, and a Case with an error selector lights one LED.
// With an error in, the Property Nodes write nothing and the LEDs keep the previous run's values.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

import { compilar } from "../../core/compiler/compiler.mjs";
import { aTexto, leer } from "../../core/model/qvi-format.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import { createNodePool } from "../../core/runtime/node-pool.mjs";
import { CAT, RAIZ, leer as leerJson } from "../helpers.mjs";

const FILE = path.join(RAIZ, "examples", "error-no-error", "ErrorNoError.sdg");

const pool = createNodePool(2);
after(() => pool.close());

const error = (status, code, source) => ({ status, code, source });

/** The four runs measured in LabVIEW, in order: the inputs and what the panel showed after each. */
const LABVIEW_RUNS = [
  { boolean: false, errorIn: error(false, 5, "warn"), noError: true, error: false, errorOut: error(false, 5, "warn") },
  { boolean: true, errorIn: error(false, 0, ""), noError: false, error: true, errorOut: error(true, 0, "") },
  { boolean: false, errorIn: error(true, 7, "boom"), noError: true, error: true, errorOut: error(false, 7, "boom") },
  { boolean: true, errorIn: error(true, 7, "boom"), noError: true, error: true, errorOut: error(true, 7, "boom") },
];

function load() {
  const g = leer(readFileSync(FILE, "utf8"), CAT);
  const panelObject = (label) => g.nodos.find((n) => n.label?.text === label && CAT.bloque(n.tipo).panel).id;
  return { g, panelObject };
}

for (const [mode, options] of [["on one thread", () => ({})], ["on a pool of threads", () => ({ poolPorts: pool.connect() })]]) {
  test(`ErrorNoError gives LabVIEW's four runs in a row, ${mode}`, async () => {
    const { g, panelObject } = load();
    const compiled = compilar(g, CAT);
    assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
    const [noError, errorLed, errorOut] = ["No Error", "Error", "error out"].map(panelObject);
    let panel = { [noError]: false, [errorLed]: false };
    for (const [k, run] of LABVIEW_RUNS.entries()) {
      const inputs = { ...panel, [panelObject("Boolean")]: run.boolean, [panelObject("error in (no error)")]: run.errorIn };
      panel = { ...panel, ...(await ejecutar(compiled, inputs, options())) };
      assert.deepEqual([panel[noError], panel[errorLed], panel[errorOut]], [run.noError, run.error, run.errorOut], `run ${k + 1}`);
    }
  });
}

test("ErrorNoError.sdg validates and saves back to the same text", () => {
  const text = readFileSync(FILE, "utf8");
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(leerJson("docs/schema/qvi.schema.json"));
  assert.ok(validate(JSON.parse(text)), JSON.stringify(validate.errors));
  assert.equal(aTexto(leer(text, CAT), CAT), text);
});
