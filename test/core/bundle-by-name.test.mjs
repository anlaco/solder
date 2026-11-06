// Bundle By Name (DT-083), the mirror of Unbundle By Name: the node stores the names of its rows and
// takes their types from the cluster wired to input cluster. What LabVIEW does is in
// labview-captures/reports/2026-11-06-bundle-by-name.md.

import assert from "node:assert/strict";
import { test } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { aTexto, leer } from "../../core/model/qvi-format.mjs";
import { ERROR } from "../../core/model/types.mjs";
import { CAT, buildVI, leer as leerJson } from "../helpers.mjs";

/** An error control wired to input cluster of a Bundle By Name of `rows` rows, its output to an indicator. */
function bundleOfError(rows = 1) {
  const vi = buildVI(CAT, (b) => {
    b.node("errorIn", "cluster-control", { type: ERROR, style: "error-in" });
    b.node("bundle", "bundle-by-name");
    b.node("errorOut", "cluster-indicator", { type: ERROR, style: "error-out" });
    b.wire("errorIn.result", "bundle.cluster");
    b.wire("bundle.output-cluster", "errorOut.value");
  });
  vi.g = Gr.resizeUnbundleRows(vi.g, CAT, vi.id.bundle, rows);
  return vi;
}

const items = (vi) => vi.g.nodos.find((n) => n.id === vi.id.bundle).config?.items;
const inputs = (vi) => CAT.puertos(vi.g.nodos.find((n) => n.id === vi.id.bundle)).in;

function wireConstant(vi, block, value, port) {
  const constant = Gr.crearNodo(vi.g, CAT, block, 0, 0);
  const r = Gr.conectar(Gr.fijarConfig(constant.g, constant.id, { value }), CAT, { nodo: constant.id, puerto: "result", dir: "out" }, { nodo: vi.id.bundle, puerto: port, dir: "in" });
  assert.ok(!r.motivo, r.motivo);
  vi.g = r.g;
}

const reasons = (vi) => (compilar(vi.g, CAT).errores ?? []).map((e) => e.motivo);

test("a fresh Bundle By Name has input cluster and one row with no name and no terminal", () => {
  const vi = buildVI(CAT, (b) => b.node("bundle", "bundle-by-name"));
  assert.deepEqual(inputs(vi).map((p) => p.label), ["input cluster"]);
  assert.deepEqual(CAT.puertos(vi.g.nodos[0]).out.map((p) => p.label), ["output cluster"]);
});

test("wiring an error cluster names the row status; growing names code, source, then source again (Q2)", () => {
  assert.deepEqual(items(bundleOfError(1)), ["status"]);
  const grown = bundleOfError(4);
  assert.deepEqual(items(grown), ["status", "code", "source", "source"]);
  assert.deepEqual(inputs(grown).map((p) => p.label), ["input cluster", "status", "code", "source", "source"]);
});

test("the rows write their elements and the elements without a row pass through (Q4: T, 42, abc)", async () => {
  const vi = bundleOfError(2);
  wireConstant(vi, "bool-const", true, "element-0");
  wireConstant(vi, "const", 42, "element-1");
  const compiled = compilar(vi.g, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const written = await ejecutar(compiled, { [vi.id.errorIn]: { status: false, code: 0, source: "abc" } });
  assert.deepEqual(written[vi.id.errorOut], { status: true, code: 42, source: "abc" });
});

test("an unwired row or an unwired input cluster breaks the VI (Q4)", () => {
  assert.ok(reasons(bundleOfError(1)).length > 0);
  const vi = buildVI(CAT, (b) => {
    b.node("bundle", "bundle-by-name");
    b.node("errorOut", "cluster-indicator", { type: ERROR, style: "error-out" });
    b.wire("bundle.output-cluster", "errorOut.value");
  });
  assert.ok(reasons(vi).length > 0);
});

test("a number does not wire to input cluster (Q5)", () => {
  const vi = buildVI(CAT, (b) => {
    b.node("number", "const", { value: 1 });
    b.node("bundle", "bundle-by-name");
  });
  const { g } = Gr.conectar(vi.g, CAT, { nodo: vi.id.number, puerto: "result", dir: "out" }, { nodo: vi.id.bundle, puerto: "cluster", dir: "in" });
  const [wire] = g.cables;
  assert.ok(Gr.tipos(g, CAT).cables.get(wire.id).roto);
});

test("Remove Element takes the row's wire and renumbers the rows below", () => {
  const vi = bundleOfError(3);
  wireConstant(vi, "bool-const", true, "element-0");
  wireConstant(vi, "str-const", "x", "element-2");
  vi.g = Gr.removeUnbundleRow(vi.g, CAT, vi.id.bundle, 0);
  assert.deepEqual(items(vi), ["code", "source"]);
  const rowWires = vi.g.cables.filter((c) => c.a.nodo === vi.id.bundle).map((c) => c.a.puerto).sort();
  assert.deepEqual(rowWires, ["cluster", "element-1"]);
});

test("a .sdg with a Bundle By Name validates and round-trips", () => {
  const vi = bundleOfError(2);
  const text = aTexto(vi.g, CAT);
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(leerJson("docs/schema/qvi.schema.json"));
  assert.ok(validate(JSON.parse(text)), JSON.stringify(validate.errors));
  assert.equal(aTexto(leer(text, CAT), CAT), text);
});
