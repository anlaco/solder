// Waveform Chart, Waveform Graph and XY Graph as indicators: what each accepts
// (labview-captures/graphs/REPORT.md) and the value they receive when the VI runs.

import assert from "node:assert/strict";
import { test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { graphAccepts } from "../../core/model/types.mjs";
import { CAT } from "../helpers.mjs";

const A = (e, dims) => (dims ? { array: e, dims } : { array: e });
const C = (...types) => ({ cluster: types.map((type, i) => ({ name: `f${i}`, type })) });

test("each graph accepts the types its context help lists", () => {
  assert.ok(["number", A("number"), A("i32", 2), C("number", "number")].every((t) => graphAccepts("waveform-chart", t)));
  assert.equal(graphAccepts("waveform-chart", C(A("number"), A("number"))), false, "a cluster of arrays breaks the chart's wire");
  assert.ok([A("number"), A("number", 2), C("number", "number", A("number"))].every((t) => graphAccepts("waveform-graph", t)));
  assert.equal(graphAccepts("waveform-graph", "number"), false);
  assert.ok([C(A("number"), A("number")), A(C(A("number"), A("number"))), A(C("number", "number"))].every((t) => graphAccepts("xy-graph", t)));
  assert.equal(graphAccepts("xy-graph", A("number")), false);
});

function build(steps) {
  const vi = { g: Gr.nuevo(), id: {} };
  steps({
    node(name, block, config) {
      const r = Gr.crearNodo(vi.g, CAT, block, 0, 0);
      vi.g = config ? Gr.fijarConfig(r.g, r.id, config) : r.g;
      vi.id[name] = r.id;
    },
    wire(from, to) {
      const split = (end) => [end.slice(0, end.lastIndexOf(".")), end.slice(end.lastIndexOf(".") + 1)];
      const [[n1, p1], [n2, p2]] = [split(from), split(to)];
      vi.g = Gr.conectar(vi.g, CAT, { nodo: vi.id[n1], puerto: p1, dir: "out" }, { nodo: vi.id[n2], puerto: p2, dir: "in" }).g;
    },
  });
  return vi;
}

test("a graph receives its data when the VI runs: a timed array and an XY plot", async () => {
  const timed = C("number", "number", A("number"));
  const xy = C(A("number"), A("number"));
  const vi = build((b) => {
    b.node("x0", "const", { value: 10 });
    b.node("dx", "const", { value: 2 });
    b.node("ys", "arr-const", { type: A("number"), value: [1, 2, 3] });
    b.node("bundle", "bundle", { type: timed });
    b.node("graph", "waveform-graph");
    b.node("xs", "arr-const", { type: A("number"), value: [0, 1] });
    b.node("xyBundle", "bundle", { type: xy });
    b.node("xyGraph", "xy-graph");
    b.node("v", "const", { value: 0.5 });
    b.node("chart", "waveform-chart");
    for (const [from, to] of [["x0.result", "bundle.campo-0"], ["dx.result", "bundle.campo-1"], ["ys.result", "bundle.campo-2"], ["bundle.result", "graph.value"],
      ["xs.result", "xyBundle.campo-0"], ["ys.result", "xyBundle.campo-1"], ["xyBundle.result", "xyGraph.value"], ["v.result", "chart.value"]]) b.wire(from, to);
  });
  assert.equal([...Gr.tipos(vi.g, CAT).cables.values()].filter((c) => c.roto).length, 0);
  const compiled = compilar(vi.g, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const written = await ejecutar(compiled, {});
  assert.deepEqual(written[vi.id.graph], { f0: 10, f1: 2, f2: [1, 2, 3] });
  assert.deepEqual(written[vi.id.xyGraph], { f0: [0, 1], f1: [1, 2, 3] });
  assert.equal(written[vi.id.chart], 0.5);
});

test("a cluster of arrays wired to a chart is a broken wire", () => {
  const vi = build((b) => {
    b.node("xs", "arr-const", { type: A("number"), value: [1] });
    b.node("pair", "bundle", { type: C(A("number"), A("number")) });
    b.node("chart", "waveform-chart");
    b.wire("xs.result", "pair.campo-0");
    b.wire("xs.result", "pair.campo-1");
    b.wire("pair.result", "chart.value");
  });
  const broken = [...Gr.tipos(vi.g, CAT).cables.values()].filter((c) => c.roto);
  assert.equal(broken.length, 1);
  assert.match(broken[0].roto, /waveform chart does not accept/);
});
