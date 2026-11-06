// A Case Structure with an error cluster on its selector (DT-083): No Error runs when the status is F, a
// warning included, and otherwise the frame whose codes hold the code. Measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-06-case-error-selector.md).

import assert from "node:assert/strict";
import { test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { ANY_ERROR, NO_ERROR, coversEveryError, errorValuesFromBoolean, isErrorFrameValue } from "../../core/model/error-case.mjs";
import { ERROR } from "../../core/model/types.mjs";
import { CAT, buildVI } from "../helpers.mjs";

/** A Case fed by the error control `errorIn`; frame k wires the constant k + 1 to the indicator `ran`. */
function errorCaseVI(frames) {
  const vi = buildVI(CAT, (b) => {
    b.node("errorIn", "cluster-control", { type: ERROR, style: "error-in" });
    b.node("ran", "indicator", { type: "i32" });
  });
  const created = Gr.crearEstructura(vi.g, CAT, "case-structure", 0, 0, 200, 150);
  vi.g = Gr.fijarMarcos(created.g, CAT, created.id, frames);
  const selector = vi.g.nodos.find((n) => n.dentro === created.id && n.tipo === "case-selector").id;
  const tunnel = Gr.crearTunel(vi.g, CAT, created.id, "out", 0);
  vi.g = tunnel.g;
  const connect = (from, fromPort, to, toPort) => {
    const r = Gr.conectar(vi.g, CAT, { nodo: from, puerto: fromPort, dir: "out" }, { nodo: to, puerto: toPort, dir: "in" });
    assert.ok(!r.motivo, r.motivo);
    vi.g = r.g;
  };
  frames.forEach((_, k) => {
    const constant = Gr.crearNodo(vi.g, CAT, "const", 0, 0);
    vi.g = Gr.meter(Gr.fijarConfig(constant.g, constant.id, { value: k + 1, type: "i32" }), CAT, [constant.id], created.id, k);
    connect(constant.id, "result", tunnel.id, `x-${k}`);
  });
  connect(vi.id.errorIn, "result", selector, "selector");
  connect(tunnel.id, "y", vi.id.ran, "value");
  return vi;
}

async function frameRun(vi, error) {
  const compiled = compilar(vi.g, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const written = await ejecutar(compiled, { [vi.id.errorIn]: error });
  return written[vi.id.ran];
}

const error = (status, code, source = "") => ({ status, code, source });

test("No Error runs with no error and with a warning; Error .. runs with any error", async () => {
  const vi = errorCaseVI([{ valores: [NO_ERROR] }, { valores: [ANY_ERROR] }]);
  assert.equal(await frameRun(vi, error(false, 0)), 1);
  assert.equal(await frameRun(vi, error(false, 5, "warn")), 1);
  assert.equal(await frameRun(vi, error(true, 0)), 2);
  assert.equal(await frameRun(vi, error(true, 7, "boom")), 2);
});

test("a frame of codes runs for an error with one of its codes; Default takes the rest", async () => {
  const vi = errorCaseVI([{ valores: [NO_ERROR] }, { valores: [7] }, { valores: [{ min: 40, max: 49 }] }, { valores: [], default: true }]);
  assert.equal(await frameRun(vi, error(false, 7)), 1);
  assert.equal(await frameRun(vi, error(true, 7)), 2);
  assert.equal(await frameRun(vi, error(true, 42)), 3);
  assert.equal(await frameRun(vi, error(true, 8)), 4);
});

test("an error Case with no frame for some values, or a value of the wrong type, breaks the VI", () => {
  const reasons = (frames) => (compilar(errorCaseVI(frames).g, CAT).errores ?? []).map((e) => e.motivo);
  assert.deepEqual(reasons([{ valores: [NO_ERROR] }, { valores: [7] }]), ["Case Structure: No case for some selector values"]);
  assert.ok(reasons([{ valores: [NO_ERROR] }, { valores: ["Foo"], default: true }]).includes("Case Structure: Selector values have wrong type"));
});

test("the values of an error frame: No Error, codes and ranges of codes", () => {
  for (const value of [NO_ERROR, 7, -1, ANY_ERROR, { min: 1 }, { min: 1, max: 5 }]) assert.ok(isErrorFrameValue(value), JSON.stringify(value));
  for (const value of [true, "Foo", 1.5, { min: "a" }, { other: 1 }]) assert.ok(!isErrorFrameValue(value), JSON.stringify(value));
  assert.ok(coversEveryError([{ valores: [NO_ERROR] }, { valores: [ANY_ERROR] }]));
  assert.ok(!coversEveryError([{ valores: [NO_ERROR] }, { valores: [{ min: 0 }] }]));
});

test("a Boolean Case wired to an error cluster: True becomes No Error and False becomes Error ..", () => {
  assert.deepEqual(errorValuesFromBoolean([true]), [NO_ERROR]);
  assert.deepEqual(errorValuesFromBoolean([false]), [ANY_ERROR]);
  assert.deepEqual(errorValuesFromBoolean([0, 2]), [0, 2]);
});
