// A Property Node fed by a control reference (DT-072 §2, stage d): it finds its control through the refnum and runs as
// the implicit node does. Measured in LabVIEW 2026 Q3: labview-captures/reports/2026-11-03-control-reference-run.md
// (the rows, the wait for the drawing, reference out) and 2026-11-03-control-reference-errors.md (the errors).

import assert from "node:assert/strict";
import { after, test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import { createNodePool } from "../../core/runtime/node-pool.mjs";
import { INVALID_REFNUM_ERROR, LATCH_VALUE_READ_ERROR } from "../../core/runtime/property-node.mjs";
import { ERROR } from "../../core/model/types.mjs";
import { CAT, buildVI, callerCatalog } from "../helpers.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { blockForTerminal } from "../../core/model/create-on-terminal.mjs";

const THREADS = 2;
const pool = createNodePool(THREADS);
after(() => pool.close());

const NO_ERROR = { status: false, code: 0, source: "" };

/**
 * A VI whose first node is the panel object `target` (node name `<block>_1`), a control reference to it and an
 * explicit Property Node of `className` with `rows`, wired to the reference; `steps` adds the rest.
 */
const referenceVI = ({ target, targetConfig, className, rows }, steps) =>
  buildVI(CAT, (b) => {
    b.node("target", target, targetConfig);
    b.node("reference", "control-reference", { type: { refnum: className }, link: `${target}_1` });
    b.node("node", "property-node", { class: className, link: null, rows });
    b.node("errorOut", "cluster-indicator", { type: ERROR, style: "error-out" });
    b.wire("reference.reference", "node.reference");
    b.wire("node.error-out", "errorOut.value");
    steps(b);
  });

async function run(vi, values = {}, options = {}) {
  const compiled = compilar(vi.g, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const byId = Object.fromEntries(Object.entries(vi.id).map(([name, nodeId]) => [nodeId, name]));
  const valuesById = Object.fromEntries(Object.entries(values).map(([name, value]) => [vi.id[name], value]));
  const written = await ejecutar(compiled, valuesById, options);
  return Object.fromEntries(Object.entries(written).map(([nodeId, value]) => [byId[nodeId], value]));
}

/** Value 7 written through the reference, then read in the next row (measured as cr-q1.vi: 7, no error). */
const writeThenRead = (target) =>
  referenceVI({ target, targetConfig: { type: "i32" }, className: "Numeric", rows: [{ property: "Value", write: true }, { property: "Value" }] }, (b) => {
    b.node("seven", "const", { value: 7, type: "i32" });
    b.node("readBack", "indicator", { type: "i32" });
    b.wire("seven.result", "node.row-0");
    b.wire("node.row-1", "readBack.value");
  });

for (const [where, options] of [["on one thread", () => ({})], ["on a pool", () => ({ poolPorts: pool.connect() })]]) {
  test(`Value written through a reference to an indicator reaches the panel, and the next row reads it, ${where}`, async () => {
    const shown = await run(writeThenRead("indicator"), {}, options());
    assert.equal(shown.target, 7);
    assert.equal(shown.readBack, 7);
    assert.deepEqual(shown.errorOut, NO_ERROR);
  });
}

test("Value written through a reference to a control is what the caller is told", async () => {
  const told = [];
  const vi = writeThenRead("control");
  const shown = await run(vi, { target: 0 }, { alEscribirControl: (nodo, value) => told.push([nodo, value]) });
  assert.equal(shown.readBack, 7);
  assert.deepEqual(told, [[vi.id.target, 7]]);
});

test("a Value write through a reference waits until the caller has drawn it", async () => {
  const events = [];
  let drawn = null;
  const running = run(writeThenRead("indicator"), {}, {
    alEscribir: (nodo, value) => events.push(`shown ${value}`),
    alDibujar: () => new Promise((resolve) => (drawn = () => (events.push("drawn"), resolve()))),
  });
  while (!drawn) await new Promise((resolve) => setImmediate(resolve));
  events.push("before drawing");
  drawn();
  const shown = await running;
  assert.deepEqual(events.slice(0, 3), ["shown 7", "before drawing", "drawn"]);
  assert.equal(shown.readBack, 7);
});

test("Visible written FALSE through a reference reads back FALSE (cr-q2.vi)", async () => {
  const vi = referenceVI({ target: "control", className: "Numeric", rows: [{ property: "Visible", write: true }, { property: "Visible" }] }, (b) => {
    b.node("hide", "bool-const", { value: false });
    b.node("visible", "bool-indicator");
    b.wire("hide.result", "node.row-0");
    b.wire("node.row-1", "visible.value");
  });
  const shown = await run(vi);
  assert.equal(shown.visible, false);
  assert.deepEqual(shown.errorOut, NO_ERROR);
});

/**
 * Node 1 writes Value 9 with `errorIn`; node 2 reads Value through node 1's reference out with no error in; node 3
 * reads it with node 1's error out (measured as cr-q4.vi).
 */
const chainedVI = (errorIn) =>
  referenceVI({ target: "control", className: "Numeric", rows: [{ property: "Value", write: true }] }, (b) => {
    b.node("incoming", "error-cluster-constant", { value: errorIn });
    b.node("nine", "const", { value: 9 });
    b.node("second", "property-node", { class: "Numeric", link: null, rows: [{ property: "Value" }] });
    b.node("third", "property-node", { class: "Numeric", link: null, rows: [{ property: "Value" }] });
    b.node("secondValue", "indicator");
    b.node("thirdValue", "indicator");
    b.node("thirdError", "cluster-indicator", { type: ERROR, style: "error-out" });
    b.node("notARefnum", "not-a-number-path-refnum");
    b.node("referenceOutInvalid", "bool-indicator");
    b.wire("incoming.result", "node.error-in");
    b.wire("nine.result", "node.row-0");
    b.wire("node.reference-out", "second.reference");
    b.wire("node.reference-out", "third.reference");
    b.wire("node.error-out", "third.error-in");
    b.wire("second.row-0", "secondValue.value");
    b.wire("third.row-0", "thirdValue.value");
    b.wire("third.error-out", "thirdError.value");
    b.wire("node.reference-out", "notARefnum.number");
    b.wire("notARefnum.result", "referenceOutInvalid.value");
  });

test("reference out carries the reference on to the next node, whose Value takes the control's type", async () => {
  const shown = await run(chainedVI(NO_ERROR), { target: 3 });
  assert.equal(shown.secondValue, 9);
  assert.equal(shown.thirdValue, 9);
  assert.equal(shown.referenceOutInvalid, false);
});

test("with an error in, the write is skipped but reference out is still valid: a node not chained to the error reads the control", async () => {
  const errorIn = { status: true, code: 5000, source: "src" };
  const told = [];
  const shown = await run(chainedVI(errorIn), { target: 3 }, { alEscribirControl: (...args) => told.push(args) });
  assert.deepEqual(told, [], "the control was not written");
  assert.deepEqual(shown.errorOut, errorIn);
  assert.equal(shown.secondValue, 3);
  assert.equal(shown.thirdValue, 0);
  assert.deepEqual(shown.thirdError, errorIn);
  assert.equal(shown.referenceOutInvalid, false);
});

test("a failing row through a reference stops the node and names the row and the property, as the implicit node (cr-e4.vi)", async () => {
  const vi = referenceVI({ target: "bool-control", targetConfig: { mechanical: "latch-when-pressed" }, className: "Boolean", rows: [{ property: "Visible" }, { property: "Value" }, { property: "Visible" }] }, (b) => {
    b.node("first", "bool-indicator");
    b.node("value", "bool-indicator");
    b.node("third", "bool-indicator");
    b.wire("node.row-0", "first.value");
    b.wire("node.row-1", "value.value");
    b.wire("node.row-2", "third.value");
  });
  const shown = await run(vi);
  assert.equal(shown.first, true);
  assert.equal(shown.value, false);
  assert.equal(shown.third, false);
  assert.equal(shown.errorOut.code, LATCH_VALUE_READ_ERROR);
  assert.match(shown.errorOut.source, /^Property Node \(arg 2\)/);
  assert.match(shown.errorOut.source, /<APPEND>\nProperty Name: <b>Value<\/b>$/);
});

test("Not A Number/Path/Refnum? says FALSE on a control reference (cr-q5.vi)", async () => {
  const vi = buildVI(CAT, (b) => {
    b.node("target", "control");
    b.node("reference", "control-reference", { type: { refnum: "Numeric" }, link: "control_1" });
    b.node("notARefnum", "not-a-number-path-refnum");
    b.node("invalid", "bool-indicator");
    b.wire("reference.reference", "notARefnum.number");
    b.wire("notARefnum.result", "invalid.value");
  });
  assert.equal((await run(vi)).invalid, false);
});

test("an explicit node with its reference unwired keeps the OVI from running (cr-e1.vi: the VI is broken)", () => {
  const vi = buildVI(CAT, (b) => {
    b.node("node", "property-node", { class: "Numeric", link: null, rows: [{ property: "Visible" }] });
    b.node("visible", "bool-indicator");
    b.wire("node.row-0", "visible.value");
  });
  assert.match(JSON.stringify(compilar(vi.g, CAT).errores), /missing a wire on its input \\"reference\\"/);
});

// ——— A control refnum on the panel (reports/2026-11-03-control-reference-subvi.md) ———

/** A strict refnum to a numeric control of `dataType`. */
const numericRefnum = (dataType) => ({ refnum: "Numeric", of: dataType });

/** An OVI whose control refnum "ref" feeds a node writing Value 9; with `asSubOVI` the refnum is on its connector. */
const writeNineThroughRefnum = ({ dataType = "number", warningIn = null, asSubOVI = false } = {}) =>
  buildVI(CAT, (b) => {
    b.node("ref", "refnum-control", { type: numericRefnum(dataType) });
    b.node("node", "property-node", { class: "Numeric", link: null, rows: [{ property: "Value", write: true }] });
    b.node("nine", "const", { value: 9, type: dataType });
    b.node("errorOut", "cluster-indicator", { type: ERROR, style: "error-out" });
    b.wire("ref.result", "node.reference");
    b.wire("nine.result", "node.row-0");
    b.wire("node.error-out", "errorOut.value");
    if (warningIn) {
      b.node("incoming", "error-cluster-constant", { value: warningIn });
      b.wire("incoming.result", "node.error-in");
    }
    if (asSubOVI) b.connector(["ref"], ["errorOut"]);
  });

test("a control refnum holds Not A Refnum until it is given one: the node fed by it gives 1055 naming no row (cr-sub.vi)", async () => {
  const shown = await run(writeNineThroughRefnum());
  assert.deepEqual(shown.errorOut, { status: true, code: INVALID_REFNUM_ERROR, source: "Property Node" });
});

test("a refnum that names no control replaces a warning in with 1055 (cr-e6.vi)", async () => {
  const shown = await run(writeNineThroughRefnum({ warningIn: { status: false, code: 1234, source: "warn" } }));
  assert.equal(shown.errorOut.code, INVALID_REFNUM_ERROR);
  assert.ok(shown.errorOut.status);
});

test("a reference passed to a subOVI's control refnum lets the subOVI write the caller's control (cr-call.vi: Numeric = 9)", async () => {
  const cat = callerCatalog({ "cr-sub.qvi": writeNineThroughRefnum({ asSubOVI: true }) });
  const caller = buildVI(cat, (b) => {
    b.node("numeric", "control");
    b.node("reference", "control-reference", { type: { refnum: "Numeric" }, link: "control_1" });
    b.node("call", "subvi", { vi: "cr-sub.qvi" });
    b.node("errorOut", "cluster-indicator", { type: ERROR, style: "error-out" });
    b.wire("reference.reference", "call.refnum-control_1");
    b.wire("call.cluster-indicator_1", "errorOut.value");
  });
  const compiled = compilar(caller.g, cat);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const told = [];
  const written = await ejecutar(compiled, { [caller.id.numeric]: 0 }, { alEscribirControl: (nodo, value) => told.push([nodo, value]) });
  assert.deepEqual(told, [[caller.id.numeric, 9]]);
  assert.deepEqual(written[caller.id.errorOut], NO_ERROR);
});

test("the refnum of an I32 numeric does not wire to a DBL numeric's: the wire breaks, a class conflict (cr-call.vi)", () => {
  const cat = callerCatalog({ "cr-sub.qvi": writeNineThroughRefnum({ asSubOVI: true }) });
  const caller = buildVI(cat, (b) => {
    b.node("numeric", "control", { type: "i32" });
    b.node("reference", "control-reference", { type: { refnum: "Numeric" }, link: "control_1" });
    b.node("call", "subvi", { vi: "cr-sub.qvi" });
    b.wire("reference.reference", "call.refnum-control_1");
  });
  const [wire] = Gr.tipos(caller.g, cat).cables.values();
  assert.ok(wire.roto, "the wire is broken");
});

test("Create ▸ Indicator on a reference makes a refnum indicator of its strict type, which holds the reference (cr-ind.vi)", async () => {
  assert.deepEqual(blockForTerminal(numericRefnum("i32"), "indicator"), { tipo: "refnum-indicator", config: { type: numericRefnum("i32") } });
  assert.deepEqual(blockForTerminal(numericRefnum("i32"), "control"), { tipo: "refnum-control", config: { type: numericRefnum("i32") } });
  const vi = referenceVI({ target: "control", className: "Numeric", rows: [] }, (b) => {
    b.node("held", "refnum-indicator", { type: numericRefnum("number") });
    b.wire("node.reference-out", "held.value");
  });
  const shown = await run(vi);
  assert.ok(shown.held > 0, "a refnum, not Not A Refnum");
});
