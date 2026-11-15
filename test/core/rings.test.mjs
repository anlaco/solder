// Rings (DT-091): a plain numeric of its representation whose items are pairs of a text and a value. Measured in
// LabVIEW 2026 Q3: labview-captures/reports/2026-11-15-rings.md.

import assert from "node:assert/strict";
import { test } from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import * as Gr from "../../core/model/graph.mjs";
import * as Ring from "../../core/model/ring.mjs";
import { VERSION, aTexto, leer } from "../../core/model/qvi-format.mjs";
import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import { CAT, leer as leerJson } from "../helpers.mjs";

// The items the DAQ plugin's `input terminal configuration` needs (NI's values, read in the DAQmx stage reports).
const TERMINAL_CONFIGURATION = [
  { text: "Differential", value: 10106 },
  { text: "RSE", value: 10083 },
  { text: "NRSE", value: 10078 },
  { text: "Default", value: -1 },
];

const validateFile = () => new Ajv2020({ allErrors: true, strict: false }).compile(leerJson("docs/schema/qvi.schema.json"));

/** A ring constant (with `config`) wired into a numeric indicator of `indicatorType`. */
function ringIntoIndicator(config, indicatorType) {
  const ring = Gr.crearNodo(Gr.nuevo(), CAT, "ring-const", 0, 0);
  let g = Gr.fijarConfig(ring.g, ring.id, config);
  const indicator = Gr.crearNodo(g, CAT, "indicator", 100, 0);
  g = Gr.fijarConfig(indicator.g, indicator.id, { type: indicatorType });
  g = Gr.conectar(g, CAT, { nodo: ring.id, puerto: "result", dir: "out" }, { nodo: indicator.id, puerto: "value", dir: "in" }).g;
  return { g, ring: ring.id, indicator: indicator.id };
}

test("a ring shows the text of the item with its value, and <value> when no item has it", () => {
  assert.equal(Ring.ringText(TERMINAL_CONFIGURATION, 10083), "RSE");
  assert.equal(Ring.ringText(TERMINAL_CONFIGURATION, -1), "Default");
  assert.equal(Ring.ringText(TERMINAL_CONFIGURATION, 9), "<9>", "measured: <9>, the value kept as it is");
});

test("a new ring is a U16 with one empty item of value 0, and Sequential values numbers by position", () => {
  assert.equal(Ring.RING_REPRESENTATION, "u16");
  assert.deepEqual(Ring.newRingItems(), [{ text: "", value: 0 }]);
  const sequential = Ring.sequentialItems(["a", "b", "c"]);
  assert.deepEqual(sequential.map((item) => item.value), [0, 1, 2]);
  assert.ok(Ring.isSequential(sequential));
  assert.ok(!Ring.isSequential(TERMINAL_CONFIGURATION));
  assert.ok(!Ring.RING_REPRESENTATIONS.includes("cdb") && Ring.RING_REPRESENTATIONS.includes("dbl"), "floats yes, complex no (measured)");
});

test("two items with the same value are refused, two with the same text are not", () => {
  assert.ok(Ring.hasDuplicateValues([{ text: "a", value: 1 }, { text: "b", value: 1 }]));
  assert.ok(!Ring.hasDuplicateValues([{ text: "a", value: 1 }, { text: "a", value: 2 }]));
});

test("a typed value is clamped to the representation, a representation change wraps the values", () => {
  assert.equal(Ring.typedRingValue(-1, "u16"), 0, "measured on U16");
  assert.equal(Ring.typedRingValue(70000, "u16"), 65535, "measured on U16");
  assert.equal(Ring.typedRingValue(-1, "i32"), -1);
  assert.deepEqual(Ring.itemsInRepresentation(TERMINAL_CONFIGURATION, "i8").map((item) => item.value), [122, 99, 94, -1], "measured: I32 to I8");
  assert.equal(Ring.itemsInRepresentation([{ text: "Default", value: -1 }], "u8")[0].value, 255, "measured: I32 to U8");
  assert.deepEqual(Ring.itemsInRepresentation([{ text: "half", value: 2.5 }], "dbl")[0].value, 2.5, "a float keeps its fraction");
});

test("a ring constant is a plain numeric of its representation: U16 into I32 has a coercion dot, I32 into I32 none", () => {
  const u16 = ringIntoIndicator({ items: TERMINAL_CONFIGURATION, value: 10106 }, "i32");
  assert.equal(Gr.tipos(u16.g, CAT).cables.values().next().value.coercion, true, "measured: a dot on the I32 indicator");
  const i32 = ringIntoIndicator({ type: "i32", items: TERMINAL_CONFIGURATION, value: -1 }, "i32");
  assert.equal(Gr.tipos(i32.g, CAT).cables.values().next().value.coercion, false, "measured: no dot once the constant is I32");
});

test("a ring constant runs with its value, also a value no item has", async () => {
  for (const [value, expected] of [[-1, -1], [10083, 10083], [9, 9]]) {
    const { g, indicator } = ringIntoIndicator({ type: "i32", items: TERMINAL_CONFIGURATION, value }, "i32");
    const compiled = compilar(g, CAT);
    assert.equal(compiled.errores, undefined, JSON.stringify(compiled.errores));
    assert.equal((await ejecutar(compiled, {}))[indicator], expected, "nothing coerces a value with no item (measured)");
  }
});

test("a ring constant and a Text Ring control round-trip through the .sdg with their pairs", () => {
  let { g } = ringIntoIndicator({ type: "i32", items: TERMINAL_CONFIGURATION, value: 10106, "allow-undefined": true }, "i32");
  const control = Gr.crearEnPanel(g, CAT, "control", 0, 0, "input terminal configuration", { type: "i32", style: Ring.RING_STYLES.TEXT, items: TERMINAL_CONFIGURATION });
  g = control.g;
  const text = aTexto(g, CAT);
  const validate = validateFile();
  assert.ok(validate(JSON.parse(text)), JSON.stringify(validate.errors));
  const reopened = leer(text, CAT);
  assert.equal(aTexto(reopened, CAT), text, "saving what was opened gives the same text");
  const panelRing = reopened.nodos.find((node) => node.config?.style === Ring.RING_STYLES.TEXT);
  assert.deepEqual(panelRing.config.items, TERMINAL_CONFIGURATION);
});

test("a version 4 ring constant's texts become pairs numbered by position, also inside a structure", () => {
  const caseStructure = Gr.crearEstructura(Gr.nuevo(), CAT, "case-structure", 0, 0, 200, 150);
  const ring = Gr.crearNodo(caseStructure.g, CAT, "ring-const", 20, 20);
  const g = Gr.meter(ring.g, CAT, [ring.id], caseStructure.id);
  const file = JSON.parse(aTexto(g, CAT));
  file.solder = 4;
  const fileText = JSON.stringify(file).replace(/"items":\[\{"text":"","value":0\}\]/, '"items":["off","on"]');
  assert.match(fileText, /"items":\["off","on"\]/, "the old shape is in the file");
  const reopened = leer(fileText, CAT);
  assert.deepEqual(reopened.nodos.find((node) => node.tipo === "ring-const").config.items, [{ text: "off", value: 0 }, { text: "on", value: 1 }]);
  assert.equal(JSON.parse(aTexto(reopened, CAT)).solder, VERSION);
});

test("a ring constant made before the pairs still reads its texts as sequential items", () => {
  assert.deepEqual(Ring.ringItems({ items: ["x", "y"] }), [{ text: "x", value: 0 }, { text: "y", value: 1 }]);
  assert.deepEqual(Ring.ringItems({}), Ring.newRingItems());
});
