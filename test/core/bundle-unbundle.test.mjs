// Bundle and Unbundle following the cluster wired to them (DT-095 §3, DT-098), as measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-17-bundle-unbundle.md, local evidence never committed): a Bundle wired at the top
// passes the elements of its unwired rows through (3, TRUE, "hi" with row 2 wired to "yo" gives 3 True yo); an unwired
// Bundle builds a cluster of its rows in row order and breaks while one is unwired; an Unbundle reshapes at once when
// the source gains or loses an element, and its wires stay on their row's index.

import assert from "node:assert/strict";
import { test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { setClusterElements } from "../../core/model/user-cluster.mjs";
import { followWiredClusters } from "../../core/model/wired-clusters.mjs";
import { CAT } from "../helpers.mjs";

const NUMBER_3 = { tipo: "num-const", config: { type: "i32", value: 3 }, x: 5, y: 5 };
const TRUE = { tipo: "bool-const", config: { value: true }, x: 5, y: 30 };
const HI = { tipo: "str-const", config: { value: "hi" }, x: 5, y: 55 };
const MEASURED_TYPE = { cluster: [{ name: "", type: "i32" }, { name: "", type: "boolean" }, { name: "", type: "string" }] };

/** A diagram built node by node; `ids` names them. Every change is followed by the refresh the editor makes. */
function diagram() {
  const state = { g: Gr.nuevo(), ids: {} };
  const settle = () => (state.g = followWiredClusters(state.g, CAT));
  return {
    state,
    add(name, block, config) {
      const created = Gr.crearNodo(state.g, CAT, block, 0, 0);
      state.g = config ? Gr.fijarConfig(created.g, created.id, config) : created.g;
      state.ids[name] = created.id;
      settle();
    },
    elements(name, elements) {
      state.g = setClusterElements(state.g, CAT, state.ids[name], elements);
      settle();
    },
    wire(from, fromPort, to, toPort) {
      const result = Gr.conectar(state.g, CAT, { nodo: state.ids[from], puerto: fromPort, dir: "out" }, { nodo: state.ids[to], puerto: toPort, dir: "in" });
      assert.ok(!result.motivo, result.motivo);
      state.g = result.g;
      settle();
    },
  };
}

const nodeOf = (state, name) => state.g.nodos.find((node) => node.id === state.ids[name]);
const outputNames = (state, name) => CAT.puertos(nodeOf(state, name)).out.map((port) => port.name);
const outputType = (state, name, port) => Gr.tipos(state.g, CAT).salidas.get(`${state.ids[name]}.${port}`);

/** The measured source: a Cluster Constant of I32 3, TRUE and "hi". */
function withMeasuredConstant() {
  const d = diagram();
  d.add("source", "cluster-constant");
  d.elements("source", [NUMBER_3, TRUE, HI]);
  return d;
}

test("an Unbundle wired to a cluster takes one output per element, in cluster order", () => {
  const d = withMeasuredConstant();
  d.add("unbundle", "unbundle");
  assert.deepEqual(outputNames(d.state, "unbundle"), [], "unwired, it has no element of its own yet");
  d.wire("source", "result", "unbundle", "value");
  assert.deepEqual(nodeOf(d.state, "unbundle").config.type, MEASURED_TYPE);
  assert.deepEqual(outputNames(d.state, "unbundle"), ["campo-0", "campo-1", "campo-2"]);
  assert.equal(outputType(d.state, "unbundle", "campo-2"), "string");
});

test("a Bundle wired at the top replaces the wired rows and passes the others through, as LabVIEW's run gives 3 True yo", async () => {
  const d = withMeasuredConstant();
  d.add("bundle", "bundle");
  d.add("yo", "str-const", { value: "yo" });
  d.add("output", "cluster-indicator", { type: MEASURED_TYPE });
  d.wire("source", "result", "bundle", "cluster");
  d.wire("yo", "result", "bundle", "campo-2");
  d.wire("bundle", "result", "output", "value");
  const compiled = compilar(d.state.g, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const written = await ejecutar(compiled, {});
  assert.deepEqual(written[d.state.ids.output], [3, true, "yo"]);
});

test("an unwired Bundle builds a cluster of its rows in row order, with unnamed elements", async () => {
  const d = diagram();
  d.add("bundle", "bundle", { rows: 4 });
  d.add("dbl", "const", { value: 1.5 });
  d.add("text", "str-const", { value: "ab" });
  d.add("flag", "bool-const", { value: true });
  d.add("integer", "num-const", { type: "i32", value: 7 });
  ["dbl", "text", "flag", "integer"].forEach((name, row) => d.wire(name, "result", "bundle", `campo-${row}`));
  const type = outputType(d.state, "bundle", "result");
  assert.deepEqual(type, { cluster: [{ name: "", type: "number" }, { name: "", type: "string" }, { name: "", type: "boolean" }, { name: "", type: "i32" }] }, "Q2: double, string, boolean, long");
  d.add("output", "cluster-indicator", { type });
  d.wire("bundle", "result", "output", "value");
  const compiled = compilar(d.state.g, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  assert.deepEqual((await ejecutar(compiled, {}))[d.state.ids.output], [1.5, "ab", true, 7]);
});

test("an unwired Bundle with a row left unwired has no output type and does not compile", () => {
  const d = diagram();
  d.add("bundle", "bundle");
  d.add("dbl", "const", { value: 1.5 });
  d.wire("dbl", "result", "bundle", "campo-0");
  assert.equal(outputType(d.state, "bundle", "result"), undefined, "Q2: the output wire is undefined");
  assert.ok(compilar(d.state.g, CAT).errores, "Q2: Contains unwired or bad terminal");
});

test("an Unbundle reshapes when its source gains or loses an element, and its wires stay on their row", () => {
  const d = withMeasuredConstant();
  d.add("unbundle", "unbundle");
  d.add("number", "indicator", { type: "i32" });
  d.wire("source", "result", "unbundle", "value");
  d.wire("unbundle", "campo-0", "number", "value");
  d.elements("source", [NUMBER_3, TRUE, HI, { ...NUMBER_3, config: { type: "i32", value: 9 } }]);
  assert.deepEqual(outputNames(d.state, "unbundle"), ["campo-0", "campo-1", "campo-2", "campo-3"], "Q4: the new element is the last row");
  assert.ok(!compilar(d.state.g, CAT).errores, "row 0 is still the I32");
  d.elements("source", [TRUE, HI]);
  assert.deepEqual(outputNames(d.state, "unbundle"), ["campo-0", "campo-1"]);
  assert.ok(d.state.g.cables.some((wire) => wire.de.nodo === d.state.ids.unbundle && wire.de.puerto === "campo-0"), "Q4: the wire stays on row 0");
  assert.equal(outputType(d.state, "unbundle", "campo-0"), "boolean");
  assert.ok(compilar(d.state.g, CAT).errores, "Q4: row 0 is now the Boolean, broken against the numeric indicator");
});

test("a copy that no longer matches the wired cluster breaks the wire instead of reading the wrong layout", () => {
  const d = withMeasuredConstant();
  d.add("unbundle", "unbundle");
  d.add("text", "str-indicator");
  d.wire("source", "result", "unbundle", "value");
  d.wire("unbundle", "campo-2", "text", "value");
  // The source changes without the refresh the editor makes: an Unbundle opened from a file edited by hand, say.
  const stale = { ...d.state.g, nodos: d.state.g.nodos.map((node) => (node.id === d.state.ids.source ? { ...node } : node)) };
  const changed = setClusterElements(stale, CAT, d.state.ids.source, [HI, NUMBER_3, TRUE]);
  assert.ok(compilar(changed, CAT).errores, "the cluster terminal takes the copy's type, so the reordered cluster is a broken wire");
});
