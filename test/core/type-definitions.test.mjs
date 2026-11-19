// Type definitions (DT-096): an object that follows an `.octl` carries a link to it and a copy of its definition; the
// type on a wire stays structural. Measured in LabVIEW 2026 Q3 (reports/2026-11-17-typedef-wiring.md and
// -typedef-update.md): a type definition wired to an equal plain cluster runs, and an OVI whose `.ctl` is missing opens
// broken, the Error list saying per object "Type Definition '<label>': Type definition not found or contains errors".

import assert from "node:assert/strict";
import { test } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { loadHierarchy } from "../../core/model/hierarchy.mjs";
import { aTexto, ErrorQvi, leer, VERSION } from "../../core/model/qvi-format.mjs";
import { linkFor, missingTypeDefinitionReason, readTypeDefinition, typeDefinitionText, writeTypeDefinition } from "../../core/model/type-definition.mjs";
import { setClusterElements } from "../../core/model/user-cluster.mjs";
import { CAT, leer as leerJson } from "../helpers.mjs";

const OVI_KEY = "/work/point.ovi";
const DEFINITION_KEY = "/work/PointTD.octl";

/** PointTD as measured: a cluster of a DBL "a" (default 3) and a Boolean "b". */
const POINT_ELEMENTS = [
  { tipo: "control", label: { text: "a" }, config: { type: "number", value: 3 }, x: 4, y: 19 },
  { tipo: "bool-control", label: { text: "b" }, x: 25, y: 48 },
];
const POINT_DEFINITION = { tipo: "cluster-control", label: { text: "PointTD" }, config: { elements: POINT_ELEMENTS }, x: 10, y: 10 };

const validator = (schema) => new Ajv2020({ allErrors: true, strict: false }).compile(leerJson(schema));

/** A panel cluster with PointTD's elements, linked to `link` when given; returns the graph and its id. */
function placeCluster(g, block, label, x, link) {
  const placed = Gr.crearEnPanel(g, CAT, block, x, 20, label);
  let next = setClusterElements(placed.g, CAT, placed.id, POINT_ELEMENTS);
  if (link) next = Gr.fijarConfig(next, placed.id, { typedef: link });
  return { g: next, id: placed.id };
}

/** "Pt", a PointTD control, wired to "plain", an equal cluster indicator that follows nothing (stage 1's Q1). */
function typeDefinitionToPlainCluster() {
  const control = placeCluster(Gr.nuevo(), "cluster-control", "Pt", 20, { path: "PointTD.octl", strict: false });
  const indicator = placeCluster(control.g, "cluster-indicator", "plain", 300);
  const wired = Gr.conectar(indicator.g, CAT, { nodo: control.id, puerto: "result", dir: "out" }, { nodo: indicator.id, puerto: "value", dir: "in" });
  assert.ok(!wired.motivo, wired.motivo);
  return { g: wired.g, control: control.id, indicator: indicator.id };
}

/** The hierarchy of `g` at OVI_KEY, with the `.octl` texts of `definitions` by key. */
function hierarchyOf(g, definitions) {
  return loadHierarchy(OVI_KEY, CAT, {
    resolvePath: (callerKey, stored) => `${callerKey.slice(0, callerKey.lastIndexOf("/") + 1)}${stored}`,
    loadOVI: (key) => (key === OVI_KEY ? g : null),
    loadTypeDefinition: (key) => (key in definitions ? readTypeDefinition(definitions[key], CAT) : null),
  });
}

test("a type definition wired to an equal cluster that follows nothing is one type, and the values arrive", async () => {
  const ovi = typeDefinitionToPlainCluster();
  assert.ok(Gr.ejecutable(ovi.g, CAT, Gr.tipos(ovi.g, CAT)), "the wire is whole: types stay structural (DT-096 §1)");
  const compiled = compilar(ovi.g, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const written = await ejecutar(compiled, { [ovi.control]: [7, true] });
  assert.deepEqual(written[ovi.indicator], [7, true]);
});

test("an object's link is saved with it, valid against the schema, and opens the same", () => {
  const ovi = typeDefinitionToPlainCluster();
  const text = aTexto(ovi.g, CAT);
  const file = JSON.parse(text);
  assert.equal(file.solder, VERSION);
  assert.ok(VERSION >= 7, "DT-096 raised the format to version 7");
  const linked = file["front-panel"].filter((item) => item.typedef);
  assert.deepEqual(linked.map((item) => item.typedef), [{ path: "PointTD.octl", strict: false }], "only the object that follows the file has the link");
  assert.equal(linked[0].elements.length, 2, "the copy of the definition is stored with the link (DT-096 §2)");
  const validate = validator("docs/schema/qvi.schema.json");
  assert.ok(validate(file), JSON.stringify(validate.errors));
  assert.equal(aTexto(leer(text, CAT), CAT), text);
});

test("a constant's link is saved in its configuration and opens the same", () => {
  const placed = Gr.crearNodo(Gr.nuevo(), CAT, "cluster-constant", 40, 40);
  const g = Gr.fijarConfig(setClusterElements(placed.g, CAT, placed.id, POINT_ELEMENTS), placed.id, { typedef: { path: "PointTD.octl", strict: true } });
  const text = aTexto(g, CAT);
  const file = JSON.parse(text);
  assert.deepEqual(file["block-diagram"].nodes[0].config.typedef, { path: "PointTD.octl", strict: true });
  const validate = validator("docs/schema/qvi.schema.json");
  assert.ok(validate(file), JSON.stringify(validate.errors));
  assert.equal(aTexto(leer(text, CAT), CAT), text);
});

test("an .octl holds one object and its kind, valid against its schema, and reads back the same", () => {
  const file = writeTypeDefinition("type-def", POINT_DEFINITION);
  const validate = validator("docs/schema/octl.schema.json");
  assert.ok(validate(file), JSON.stringify(validate.errors));
  assert.deepEqual(file.object.elements.map((element) => element.label), ["a", "b"], "its elements in file form, as a cluster stores them");
  const read = readTypeDefinition(typeDefinitionText("type-def", POINT_DEFINITION), CAT);
  assert.equal(read.kind, "type-def");
  assert.equal(typeDefinitionText(read.kind, read.object), typeDefinitionText("type-def", POINT_DEFINITION));
  assert.throws(() => writeTypeDefinition("typedef", POINT_DEFINITION), ErrorQvi, "only the control editor's three kinds");
  assert.throws(() => readTypeDefinition({ ...file, solder: VERSION + 1 }, CAT), ErrorQvi, "a newer file is refused");
});

test("an object made from a Type Def. or a Strict Type Def. follows it; one made from a plain control follows nothing", () => {
  assert.deepEqual(linkFor("PointTD.octl", "type-def"), { path: "PointTD.octl", strict: false });
  assert.deepEqual(linkFor("StrictTD.octl", "strict-type-def"), { path: "StrictTD.octl", strict: true });
  assert.equal(linkFor("Custom.octl", "control"), null);
});

test("an OVI whose type definition is found loads with it and nothing breaks", () => {
  const hierarchy = hierarchyOf(typeDefinitionToPlainCluster().g, { [DEFINITION_KEY]: typeDefinitionText("type-def", POINT_DEFINITION) });
  assert.deepEqual(hierarchy.errors, []);
  assert.equal(hierarchy.typeDefinitions.get(DEFINITION_KEY).kind, "type-def");
});

test("an OVI whose type definition is missing opens broken, one error per object, in LabVIEW's words", () => {
  const ovi = typeDefinitionToPlainCluster();
  const indicatorLinked = Gr.fijarConfig(ovi.g, ovi.indicator, { typedef: { path: "PointTD.octl", strict: false } });
  const hierarchy = hierarchyOf(indicatorLinked, {});
  assert.deepEqual(
    hierarchy.errors.map((error) => error.motivo),
    ["Type Definition 'Pt': Type definition not found or contains errors.", "Type Definition 'plain': Type definition not found or contains errors."],
  );
  assert.equal(hierarchy.typeDefinitions.get(DEFINITION_KEY), null);
  assert.ok(hierarchy.ovis.get(OVI_KEY).g, "the OVI itself still opens, with its copy (DT-096 §3)");
  assert.equal(missingTypeDefinitionReason(""), "Type Definition ' ': Type definition not found or contains errors.", "a blank label, as measured");
});
