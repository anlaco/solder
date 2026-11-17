// A cluster made by the user (DT-095): a container of whole elements whose type and value are derived from them, in
// cluster order, the order of the elements. Measured in LabVIEW 2026 Q3 (reports/2026-11-16-cluster-panel.md and
// -cluster-diagram.md): after reversing Numeric, Boolean, String the cluster's value is ["", false, 0], and an
// Unbundle's outputs give String, Boolean, Numeric; with Numeric 3, Boolean TRUE and String "hi" they give "hi", TRUE, 3.

import assert from "node:assert/strict";
import { test } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { aTexto, leer, VERSION } from "../../core/model/qvi-format.mjs";
import { clusterTypeOf, setClusterElements } from "../../core/model/user-cluster.mjs";
import { CAT, buildOVI, leer as leerJson } from "../helpers.mjs";

/** The elements of the measured cluster in its reversed order: String 0, Boolean 1, Numeric 2. */
const REVERSED_ELEMENTS = [
  { tipo: "str-control", label: { text: "String" }, x: 3, y: 64 },
  { tipo: "bool-control", label: { text: "Boolean" }, x: 25, y: 48 },
  { tipo: "control", label: { text: "Numeric" }, config: { type: "number", value: 7 }, x: 4, y: 19 },
];
const REVERSED_TYPE = { cluster: [{ name: "String", type: "string" }, { name: "Boolean", type: "boolean" }, { name: "Numeric", type: "number" }] };

/** A user's cluster control wired to an Unbundle whose three outputs go to a string, a Boolean and a numeric indicator. */
function clusterToUnbundle() {
  const ovi = buildOVI(CAT, (b) => b.node("cluster", "cluster-control"));
  ovi.g = setClusterElements(ovi.g, CAT, ovi.id.cluster, REVERSED_ELEMENTS);
  const add = (name, block, config) => {
    const created = Gr.crearNodo(ovi.g, CAT, block, 0, 0);
    ovi.g = config ? Gr.fijarConfig(created.g, created.id, config) : created.g;
    ovi.id[name] = created.id;
  };
  const wire = (from, fromPort, to, toPort) => {
    const result = Gr.conectar(ovi.g, CAT, { nodo: ovi.id[from], puerto: fromPort, dir: "out" }, { nodo: ovi.id[to], puerto: toPort, dir: "in" });
    assert.ok(!result.motivo, result.motivo);
    ovi.g = result.g;
  };
  // The Unbundle takes the type of the cluster wired in (the editor sets it when the wire arrives).
  add("unbundle", "unbundle", { type: REVERSED_TYPE });
  add("text", "str-indicator");
  add("flag", "bool-indicator");
  add("number", "indicator");
  wire("cluster", "result", "unbundle", "value");
  wire("unbundle", "campo-0", "text", "value");
  wire("unbundle", "campo-1", "flag", "value");
  wire("unbundle", "campo-2", "number", "value");
  return ovi;
}

test("a user's cluster takes its type and value from its elements, in their order", () => {
  assert.deepEqual(clusterTypeOf(CAT, REVERSED_ELEMENTS), REVERSED_TYPE);
  const ovi = clusterToUnbundle();
  const cluster = ovi.g.nodos.find((node) => node.id === ovi.id.cluster);
  assert.deepEqual(cluster.config.type, REVERSED_TYPE);
  assert.deepEqual(cluster.config.value, [undefined, undefined, 7], "the elements' values in cluster order; only one has a value of its own");
});

test("Unbundle of a user's cluster gives its elements in cluster order, as LabVIEW's run does", async () => {
  const ovi = clusterToUnbundle();
  const compiled = compilar(ovi.g, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const written = await ejecutar(compiled, { [ovi.id.cluster]: ["hi", true, 3] });
  assert.equal(written[ovi.id.text], "hi");
  assert.equal(written[ovi.id.flag], true);
  assert.equal(written[ovi.id.number], 3);
});

test("a user's cluster is saved as its elements, valid against the schema, and opens the same", () => {
  const ovi = clusterToUnbundle();
  const text = aTexto(ovi.g, CAT);
  const file = JSON.parse(text);
  assert.equal(file.solder, VERSION);
  const item = file["front-panel"].find((entry) => entry.elements);
  assert.equal(item.type, undefined, "the type is derived, not written");
  assert.deepEqual(item.elements.map((element) => [element.kind, element.label]), [["str-control", "String"], ["bool-control", "Boolean"], ["control", "Numeric"]]);
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(leerJson("docs/schema/qvi.schema.json"));
  assert.ok(validate(file), JSON.stringify(validate.errors));
  const reread = leer(text, CAT);
  assert.equal(aTexto(reread, CAT), text);
  assert.deepEqual(reread.nodos.find((node) => node.tipo === "cluster-control").config.type, REVERSED_TYPE);
});

test("a Cluster Constant holds constants and gives its derived value", async () => {
  const ovi = buildOVI(CAT, (b) => b.node("constant", "cluster-constant"));
  const elements = [
    { tipo: "num-const", config: { type: "number", value: 2.5 }, x: 24, y: 16 },
    { tipo: "bool-const", config: { value: true }, x: 22, y: 53 },
  ];
  ovi.g = setClusterElements(ovi.g, CAT, ovi.id.constant, elements);
  const type = ovi.g.nodos.find((node) => node.id === ovi.id.constant).config.type;
  assert.deepEqual(type, { cluster: [{ name: "", type: "number" }, { name: "", type: "boolean" }] });
  const text = aTexto(ovi.g, CAT);
  assert.equal(aTexto(leer(text, CAT), CAT), text);
});

test("a file of version 5 with an error cluster opens unchanged and is saved in the current version", () => {
  const version5 = {
    solder: 5,
    "front-panel": [{ name: "cluster-control_1", role: "control", type: { cluster: [{ name: "status", type: "boolean" }, { name: "code", type: "i32" }, { name: "source", type: "string" }] }, style: "error-in" }],
    "block-diagram": { nodes: [{ name: "cluster-control_1", type: "cluster-control" }] },
  };
  const read = leer(version5, CAT);
  const node = read.nodos.find((candidate) => candidate.tipo === "cluster-control");
  assert.equal(node.config.elements, undefined, "an error cluster has no elements");
  assert.deepEqual(node.config.type, version5["front-panel"][0].type);
  assert.equal(JSON.parse(aTexto(read, CAT)).solder, VERSION);
});

test("a file of a version after the current one is refused", () => {
  assert.throws(() => leer({ solder: VERSION + 1, "block-diagram": { nodes: [] } }, CAT), new RegExp(`this Solder reads versions 1 to ${VERSION}`));
});

/** A cluster of two I32 elements valued 1 and 2, held in `block` and unbundled into the indicators "first" and "second". */
function twoNumbers(block, elements) {
  const ovi = buildOVI(CAT, (b) => {
    b.node("cluster", block);
    b.node("first", "indicator");
    b.node("second", "indicator");
  });
  ovi.g = setClusterElements(ovi.g, CAT, ovi.id.cluster, elements);
  const type = ovi.g.nodos.find((node) => node.id === ovi.id.cluster).config.type;
  const unbundle = Gr.crearNodo(ovi.g, CAT, "unbundle", 0, 0);
  ovi.g = Gr.fijarConfig(unbundle.g, unbundle.id, { type });
  const wire = (from, fromPort, to, toPort) => {
    const result = Gr.conectar(ovi.g, CAT, { nodo: from, puerto: fromPort, dir: "out" }, { nodo: to, puerto: toPort, dir: "in" });
    assert.ok(!result.motivo, result.motivo);
    ovi.g = result.g;
  };
  wire(ovi.id.cluster, "result", unbundle.id, "value");
  wire(unbundle.id, "campo-0", ovi.id.first, "value");
  wire(unbundle.id, "campo-1", ovi.id.second, "value");
  return ovi;
}

async function firstAndSecond(ovi, panel = {}) {
  const compiled = compilar(ovi.g, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const written = await ejecutar(compiled, panel);
  return [written[ovi.id.first], written[ovi.id.second]];
}

// The value was a record by element name, so elements of one name were one value: the constant gave 2 and 2.
test("the elements of a Cluster Constant, which have no labels, keep each its own value", async () => {
  const unlabelled = (value) => ({ tipo: "num-const", config: { type: "i32", value } });
  assert.deepEqual(await firstAndSecond(twoNumbers("cluster-constant", [unlabelled(1), unlabelled(2)])), [1, 2]);
});

test("two elements of a cluster control with the same label keep each its own value", async () => {
  const numeric = (value) => ({ tipo: "control", label: { text: "Numeric" }, config: { type: "i32", value } });
  const ovi = twoNumbers("cluster-control", [numeric(1), numeric(2)]);
  assert.deepEqual(ovi.g.nodos.find((node) => node.id === ovi.id.cluster).config.value, [1, 2], "the cluster's default value");
  assert.deepEqual(await firstAndSecond(ovi, { [ovi.id.cluster]: [7, 8] }), [7, 8], "the values the panel holds");
});

test("a cluster inside a user's cluster is saved with its own elements in file form and opens the same", () => {
  const inner = { tipo: "cluster-control", label: { text: "inner" }, config: { elements: [{ tipo: "control", label: { text: "x" }, config: { type: "number", value: 2 }, x: 4, y: 19 }] }, x: 3, y: 5 };
  const ovi = buildOVI(CAT, (b) => b.node("outer", "cluster-control"));
  ovi.g = setClusterElements(ovi.g, CAT, ovi.id.outer, [inner]);
  const text = aTexto(ovi.g, CAT);
  const innerInFile = JSON.parse(text)["front-panel"][0].elements[0];
  assert.deepEqual(innerInFile.elements, [{ kind: "control", label: "x", type: "number", default: 2, x: 4, y: 19 }], "the file's names, not the graph's");
  assert.equal(innerInFile.type, undefined, "the inner type is derived, not written");
  const reread = leer(text, CAT);
  assert.deepEqual(reread.nodos[0].config.type, { cluster: [{ name: "inner", type: { cluster: [{ name: "x", type: "number" }] } }] });
  assert.equal(aTexto(reread, CAT), text);
});
