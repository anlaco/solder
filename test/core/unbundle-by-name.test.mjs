// Unbundle By Name (DT-050): the node stores the names of its rows and takes
// their types from the cluster wired in, looked up by name. What LabVIEW does
// is in labview-captures/reports/2026-10-15-unbundle-by-name.md.

import assert from "node:assert/strict";
import { test } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { aTexto, leer } from "../../core/model/qvi-format.mjs";
import { CAT, leer as leerJson } from "../helpers.mjs";

const ERROR_VALUE = { status: true, code: 42, source: "abc" };

/** A diagram with an Error Cluster Constant and a fresh Unbundle By Name, unwired. */
function errorAndUnbundle() {
  let g = Gr.nuevo();
  const constant = Gr.crearNodo(g, CAT, "error-cluster-constant", 0, 0);
  g = Gr.fijarConfig(constant.g, constant.id, { value: ERROR_VALUE });
  const unbundle = Gr.crearNodo(g, CAT, "unbundle-by-name", 100, 0);
  return { g: unbundle.g, constant: constant.id, unbundle: unbundle.id };
}

const wireCluster = (g, from, to) => Gr.conectar(g, CAT, { nodo: from, puerto: "result", dir: "out" }, { nodo: to, puerto: "cluster", dir: "in" }).g;
const items = (g, id) => g.nodos.find((n) => n.id === id).config?.items;
const outputs = (g, id) => CAT.puertos(g.nodos.find((n) => n.id === id)).out;
const outputTypes = (g, id) => outputs(g, id).map((p) => Gr.tipos(g, CAT).salidas.get(`${id}.${p.name}`));

test("a fresh Unbundle By Name has one row with no name and no output (stage 1, d1.png)", () => {
  const { g, unbundle } = errorAndUnbundle();
  assert.deepEqual(CAT.puertos(g.nodos.find((n) => n.id === unbundle)).in.map((p) => p.label), ["cluster of named"]);
  assert.deepEqual(outputs(g, unbundle), []);
});

test("wiring an error cluster names the row status, a Boolean (Q1)", () => {
  const { g: fresh, constant, unbundle } = errorAndUnbundle();
  const g = wireCluster(fresh, constant, unbundle);
  assert.deepEqual(items(g, unbundle), ["status"]);
  assert.deepEqual(outputs(g, unbundle).map((p) => p.label), ["status"]);
  assert.deepEqual(outputTypes(g, unbundle), ["boolean"]);
});

test("growing names each new row after the one above, and past the last element repeats it (Q2)", () => {
  const { g: fresh, constant, unbundle } = errorAndUnbundle();
  const g = Gr.resizeUnbundleRows(wireCluster(fresh, constant, unbundle), CAT, unbundle, 5);
  assert.deepEqual(items(g, unbundle), ["status", "code", "source", "source", "source"]);
  assert.deepEqual(outputTypes(g, unbundle), ["boolean", "i32", "string", "string", "string"]);
});

test("rows grown before wiring are named when the cluster arrives", () => {
  const { g: fresh, constant, unbundle } = errorAndUnbundle();
  const g = wireCluster(Gr.resizeUnbundleRows(fresh, CAT, unbundle, 2), constant, unbundle);
  assert.deepEqual(items(g, unbundle), ["status", "code"]);
});

test("each row gives its element when the VI runs (Q7: TRUE, 42, abc)", async () => {
  const { g: fresh, constant, unbundle } = errorAndUnbundle();
  let g = Gr.resizeUnbundleRows(wireCluster(fresh, constant, unbundle), CAT, unbundle, 3);
  // Select Item reorders what comes out: source on the first row, status on the last.
  g = Gr.selectUnbundleItem(Gr.selectUnbundleItem(g, unbundle, 0, "source"), unbundle, 2, "status");
  const indicators = {};
  for (const [row, block] of [[0, "str-indicator"], [1, "indicator"], [2, "bool-indicator"]]) {
    const r = Gr.crearNodo(g, CAT, block, 300, row * 40);
    g = Gr.conectar(r.g, CAT, { nodo: unbundle, puerto: `element-${row}`, dir: "out" }, { nodo: r.id, puerto: "value", dir: "in" }).g;
    indicators[r.id] = row;
  }
  const compiled = compilar(g, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const written = await ejecutar(compiled, {});
  assert.deepEqual(Object.entries(written).map(([id, value]) => [indicators[id], value]).sort(), [[0, "abc"], [1, 42], [2, true]]);
});

test("unwired, the node keeps its names and the VI cannot run (Q6)", () => {
  const { g: fresh, constant, unbundle } = errorAndUnbundle();
  const wired = Gr.resizeUnbundleRows(wireCluster(fresh, constant, unbundle), CAT, unbundle, 3);
  const g = { ...wired, cables: wired.cables.filter((c) => c.a.nodo !== unbundle) };
  assert.deepEqual(items(g, unbundle), ["status", "code", "source"]);
  assert.deepEqual(outputTypes(g, unbundle), [undefined, undefined, undefined]);
  assert.ok(compilar(g, CAT).errores, "an Unbundle By Name with nothing wired breaks Run");
});

test("a number is not a cluster: its wire into Unbundle By Name is broken", () => {
  const { g: fresh, unbundle } = errorAndUnbundle();
  const number = Gr.crearNodo(fresh, CAT, "const", 0, 100);
  const g = Gr.conectar(number.g, CAT, { nodo: number.id, puerto: "result", dir: "out" }, { nodo: unbundle, puerto: "cluster", dir: "in" }).g;
  const wire = g.cables.find((c) => c.a.nodo === unbundle);
  assert.ok(Gr.tipos(g, CAT).cables.get(wire.id).roto);
  assert.deepEqual(items(g, unbundle), [null], "a row is only named by a cluster");
});

test("Remove Element takes the row and its wire, and the rows below move up with theirs (Q4)", () => {
  const { g: fresh, constant, unbundle } = errorAndUnbundle();
  let g = Gr.resizeUnbundleRows(wireCluster(fresh, constant, unbundle), CAT, unbundle, 3);
  const sinks = [0, 1, 2].map((row) => {
    const r = Gr.crearNodo(g, CAT, ["bool-indicator", "indicator", "str-indicator"][row], 300, row * 40);
    g = Gr.conectar(r.g, CAT, { nodo: unbundle, puerto: `element-${row}`, dir: "out" }, { nodo: r.id, puerto: "value", dir: "in" }).g;
    return r.id;
  });
  g = Gr.removeUnbundleRow(g, CAT, unbundle, 1);
  assert.deepEqual(items(g, unbundle), ["status", "source"]);
  const from = (sink) => g.cables.find((c) => c.a.nodo === sink)?.de.puerto;
  assert.deepEqual(sinks.map(from), ["element-0", undefined, "element-1"]);
  const oneRow = Gr.resizeUnbundleRows(g, CAT, unbundle, 1);
  assert.equal(Gr.removeUnbundleRow(oneRow, CAT, unbundle, 0), oneRow, "the last row stays");
});

test("a .qvi with an Unbundle By Name round-trips, its names in config.items", () => {
  const { g: fresh, constant, unbundle } = errorAndUnbundle();
  const g = Gr.resizeUnbundleRows(wireCluster(fresh, constant, unbundle), CAT, unbundle, 2);
  const text = aTexto(g, CAT);
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(leerJson("docs/schema/qvi.schema.json"));
  assert.ok(validate(JSON.parse(text)), JSON.stringify(validate.errors));
  assert.match(text, /"items": \[\s*"status",\s*"code"\s*\]/);
  assert.equal(aTexto(leer(text, CAT), CAT), text, "saving what was opened gives the same text");
});
