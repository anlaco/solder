// Free labels (DT-085): nodes of the graph that the .sdg keeps in `layout.free-labels` and the compiler ignores.

import assert from "node:assert/strict";
import { test } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import * as Gr from "../../core/model/graph.mjs";
import { compilar } from "../../core/compiler/compiler.mjs";
import { FREE_LABEL, isDiagramFreeLabel, isPanelFreeLabel } from "../../core/model/free-label.mjs";
import { VERSION, aTexto, leer } from "../../core/model/qvi-format.mjs";
import { CAT, buildAdder, leer as leerJson } from "../helpers.mjs";

const validate = new Ajv2020({ allErrors: true, strict: false }).compile(leerJson("docs/schema/qvi.schema.json"));

/** A graph with a diagram label, one inside a While Loop (resized) and one on the panel. */
function withFreeLabels() {
  let g = Gr.nuevo();
  const loop = Gr.crearEstructura(g, CAT, "while-loop", 100, 100, 200, 150);
  g = loop.g;
  const addFreeLabel = (place) => {
    const created = Gr.crearNodo(g, CAT, FREE_LABEL, 0, 0);
    g = { ...created.g, nodos: created.g.nodos.map((n) => (n.id === created.id ? place(n) : n)) };
  };
  addFreeLabel((n) => ({ ...n, x: 20, y: 30, label: { text: "Read the sensor\nevery second" } }));
  addFreeLabel((n) => ({ ...n, x: 120, y: 140, dentro: loop.id, label: { text: "inside" }, tam: { ancho: 60, alto: 47 } }));
  addFreeLabel((n) => ({ ...n, x: undefined, y: undefined, panel: { x: 300, y: 40 }, label: { text: "Settings" } }));
  return g;
}

test("free labels are written in the layout, valid against the schema, and read back the same", () => {
  const text = aTexto(withFreeLabels(), CAT);
  const file = JSON.parse(text);
  assert.ok(validate(file), JSON.stringify(validate.errors));
  assert.equal(file.solder, VERSION);
  assert.deepEqual(file["block-diagram"].nodes, [], "a free label is not a node of the program");
  assert.deepEqual(file.layout["free-labels"], {
    diagram: [
      { x: 20, y: 30, text: "Read the sensor\nevery second" },
      { x: 120, y: 140, text: "inside", inside: "while-loop_1", width: 60, height: 47 },
    ],
    panel: [{ x: 300, y: 40, text: "Settings" }],
  });
  const read = leer(text, CAT);
  assert.equal(aTexto(read, CAT), text);
  const loop = read.nodos.find((n) => n.tipo === "while-loop");
  const [first, inside, panel] = read.nodos.filter((n) => n.tipo === FREE_LABEL);
  assert.ok(isDiagramFreeLabel(first) && isDiagramFreeLabel(inside) && isPanelFreeLabel(panel));
  assert.equal(inside.dentro, loop.id);
  assert.deepEqual(panel.panel, { x: 300, y: 40 });
});

test("a free label inside a structure that is not in the file is refused", () => {
  const file = JSON.parse(aTexto(withFreeLabels(), CAT));
  file.layout["free-labels"].diagram[1].inside = "while-loop_9";
  assert.throws(() => leer(file, CAT), /while-loop_9/);
});

test("a version 3 file opens and is saved as version 4", () => {
  const file = JSON.parse(aTexto(buildAdder().g, CAT));
  file.solder = 3;
  assert.equal(JSON.parse(aTexto(leer(file, CAT), CAT)).solder, 4);
});

test("free labels do not change what an OVI compiles to", () => {
  const { g } = buildAdder();
  const labelled = Gr.crearNodo(g, CAT, FREE_LABEL, 10, 10).g;
  const withText = { ...labelled, nodos: labelled.nodos.map((n) => (n.tipo === FREE_LABEL ? { ...n, label: { text: "adds" } } : n)) };
  const plain = compilar(g, CAT);
  const commented = compilar(withText, CAT);
  assert.equal(commented.errores, undefined);
  assert.deepEqual(commented.bytes, plain.bytes);
});
