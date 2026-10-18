// An array is born without an element type (DT-060, spec/03 Rule 2c), measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-10-18-array-typing-stage1.md and -stage2.md).

import assert from "node:assert/strict";
import { test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { VOID } from "../../core/model/types.mjs";
import * as EL from "../../editor/src/debugging/error-list.mjs";
import * as DV from "../../editor/src/debugging/debug-view.mjs";
import { CAT, INV } from "../helpers.mjs";

/** A VI with the given blocks (`[name, block, config]`) and wires (`"node.port"` pairs). */
function vi(blocks, wires = []) {
  let graph = Gr.nuevo();
  const ids = {};
  for (const [name, block, config] of blocks) {
    const created = Gr.crearNodo(graph, CAT, block, 0, 0);
    graph = config ? Gr.fijarConfig(created.g, created.id, config) : created.g;
    ids[name] = created.id;
  }
  for (const [from, to] of wires) {
    const [fromNode, fromPort] = from.split(".");
    const [toNode, toPort] = to.split(".");
    const wired = Gr.conectar(graph, CAT, { nodo: ids[fromNode], puerto: fromPort, dir: "out" }, { nodo: ids[toNode], puerto: toPort, dir: "in" });
    assert.ok(!wired.motivo, wired.motivo);
    graph = wired.g;
  }
  return { graph, ids, resolved: Gr.tipos(graph, CAT) };
}

const errorRows = ({ graph, resolved }) => EL.collect({ graph, catalog: CAT, resolved, compileErrors: compilar(graph, CAT).errores ?? [], inventory: INV });

test("a new Array, Array Constant and array indicator are empty: { array: void }", () => {
  for (const block of ["arr-const", "arr-control", "arr-indicator"]) {
    const { graph } = vi([["array", block]]);
    assert.deepEqual(graph.nodos[0].config.type, { array: VOID }, block);
  }
});

test("an empty array constant breaks the VI with 'Constant has undefined type'", () => {
  const built = vi([["constant", "arr-const"]]);
  assert.ok(!Gr.ejecutable(built.graph, CAT, built.resolved));
  assert.ok(compilar(built.graph, CAT).errores.length);
  const rows = errorRows(built);
  assert.deepEqual(rows.map((row) => row.text), ["Array Constant: Constant has undefined type"]);
  assert.equal(rows[0].group, undefined, "it is a block diagram error");
});

test("an empty panel array is a Front Panel error: 'Control contains no elements and is undefined'", () => {
  const built = vi([["array", "arr-control", { type: { array: VOID } }]]);
  built.graph = { ...built.graph, nodos: built.graph.nodos.map((node) => ({ ...node, label: { text: "Array" } })) };
  const rows = errorRows(built);
  assert.deepEqual(rows.map((row) => row.text), ["Array 'Array': Control contains no elements and is undefined"]);
  assert.equal(rows[0].group, EL.PANEL_GROUP_TITLE);
  const html = DV.errorListWindow(INV, { rows, state: EL.initial(), viName: "Untitled 1", position: { x: 0, y: 0 } });
  assert.ok(html.includes("Front Panel Errors") && !html.includes("Block Diagram Errors"));
});

test("an empty array wired to Array Size: the wire holds and Array Size has a bad terminal", () => {
  const built = vi([["constant", "arr-const"], ["size", "array-size"]], [["constant.result", "size.array"]]);
  const wire = [...built.resolved.cables.values()][0];
  assert.equal(wire.roto, null);
  assert.deepEqual(errorRows(built).map((row) => row.text).sort(), ["Array Constant: Constant has undefined type", "Array Size: Contains unwired or bad terminal"]);
});

test("an empty array never adapts to a wire: into a DBL array indicator the wire breaks", () => {
  const built = vi([["constant", "arr-const"], ["indicator", "arr-indicator", { type: { array: "number" } }]], [["constant.result", "indicator.value"]]);
  const wire = [...built.resolved.cables.values()][0];
  assert.match(wire.roto, /array of void/);
  assert.deepEqual(built.graph.nodos[0].config.type, { array: VOID }, "the constant keeps its type");
});

test("a typed I32 array constant into a DBL array indicator gets a coercion dot and runs", () => {
  const built = vi([["constant", "arr-const", { type: { array: "i32" }, value: [1, 2] }], ["indicator", "arr-indicator", { type: { array: "number" } }]], [["constant.result", "indicator.value"]]);
  const wire = [...built.resolved.cables.values()][0];
  assert.equal(wire.roto, null);
  assert.equal(wire.coercion, true);
  assert.ok(!compilar(built.graph, CAT).errores);
});
