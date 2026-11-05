// The Property Node in a Run (DT-072): its rows run top to bottom against the panel or a VISA session, with
// LabVIEW's rules for errors, measured in LabVIEW 2026 Q3 (labview-captures/reports/2026-10-30-panel-property-node-behavior.md).

import assert from "node:assert/strict";
import { after, test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import { createNodePool } from "../../core/runtime/node-pool.mjs";
import { LATCH_VALUE_READ_ERROR } from "../../core/runtime/property-node.mjs";
import { ERROR } from "../../core/model/types.mjs";
import { loadSolderIo } from "../../native/solder-io-node/solder-io.mjs";
import { HAS_SERIAL_TEST_INSTRUMENT, startInstrument, startSerialInstrument } from "../instrument.mjs";
import { CAT, buildVI } from "../helpers.mjs";

const THREADS = 2;
const pool = createNodePool(THREADS);
after(() => pool.close());

const NO_ERROR = { status: false, code: 0, source: "" };

/**
 * A VI whose first node is the panel object `target` (so its node name is `<block>_1`, what the Property Node
 * links to) and whose Property Node `node` has `rows`; `steps` adds the rest with the builder.
 */
const propertyVI = ({ target, targetConfig, className, rows, ignoreErrors = false }, steps) =>
  buildVI(CAT, (b) => {
    b.node("target", target, targetConfig);
    b.node("node", "property-node", { class: className, link: `${target}_1`, rows, "ignore-errors": ignoreErrors });
    b.node("errorOut", "cluster-indicator", { type: ERROR, style: "error-out" });
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

/** Value written to an indicator that nothing else wires, then read back in the next row (measured: 3 and 3). */
const writeThenReadValue = () =>
  propertyVI({ target: "indicator", targetConfig: { type: "i32" }, className: "Numeric", rows: [{ property: "Value", write: true }, { property: "Value" }] }, (b) => {
    b.node("three", "const", { value: 3, type: "i32" });
    b.node("readBack", "indicator", { type: "i32" });
    b.wire("three.result", "node.row-0");
    b.wire("node.row-1", "readBack.value");
  });

for (const [where, options] of [["on one thread", () => ({})], ["on a pool", () => ({ poolPorts: pool.connect() })]]) {
  test(`Value written to an indicator reaches the panel, and the next row reads it, ${where}`, async () => {
    const shown = await run(writeThenReadValue(), {}, options());
    assert.equal(shown.target, 3);
    assert.equal(shown.readBack, 3);
    assert.deepEqual(shown.errorOut, NO_ERROR);
  });
}

test("Value of a control reads what the panel holds, and a write is what the caller is told", async () => {
  const vi = propertyVI({ target: "str-control", className: "String", rows: [{ property: "Value" }, { property: "Value", write: true }] }, (b) => {
    b.node("before", "str-indicator");
    b.node("text", "str-const", { value: "written" });
    b.wire("node.row-0", "before.value");
    b.wire("text.result", "node.row-1");
  });
  const toldControls = [];
  const shown = await run(vi, { target: "typed" }, { alEscribirControl: (nodo, value) => toldControls.push([nodo, value]) });
  assert.equal(shown.before, "typed");
  assert.deepEqual(toldControls, [[vi.id.target, "written"]]);
});

test("a Value write waits until the caller has drawn it", async () => {
  const events = [];
  let drawn = null;
  const running = run(writeThenReadValue(), {}, {
    alEscribir: (nodo, value) => events.push(`shown ${value}`),
    alDibujar: () => new Promise((resolve) => (drawn = () => (events.push("drawn"), resolve()))),
  });
  while (!drawn) await new Promise((resolve) => setImmediate(resolve));
  events.push("before drawing");
  drawn();
  const shown = await running;
  assert.deepEqual(events.slice(0, 3), ["shown 3", "before drawing", "drawn"]);
  assert.equal(shown.readBack, 3);
});

test("with an error in, nothing runs, the read rows give their defaults and the error passes", async () => {
  const errorIn = { status: true, code: 5000, source: "src" };
  const vi = propertyVI({ target: "control", className: "Numeric", rows: [{ property: "Value", write: true }, { property: "Value" }, { property: "Visible" }] }, (b) => {
    b.node("incoming", "error-cluster-constant", { value: errorIn });
    b.node("nine", "const", { value: 9 });
    b.node("value", "indicator");
    b.node("visible", "bool-indicator");
    b.wire("incoming.result", "node.error-in");
    b.wire("nine.result", "node.row-0");
    b.wire("node.row-1", "value.value");
    b.wire("node.row-2", "visible.value");
  });
  const told = [];
  const shown = await run(vi, { target: 3 }, { alEscribirControl: (...args) => told.push(args) });
  assert.equal(shown.value, 0);
  assert.equal(shown.visible, false);
  assert.deepEqual(shown.errorOut, errorIn);
  assert.deepEqual(told, [], "the control was not written");
});

test("a warning in runs the node and passes the warning", async () => {
  const warning = { status: false, code: 1234, source: "warn src" };
  const vi = propertyVI({ target: "control", className: "Numeric", rows: [{ property: "Value" }] }, (b) => {
    b.node("incoming", "error-cluster-constant", { value: warning });
    b.node("value", "indicator");
    b.wire("incoming.result", "node.error-in");
    b.wire("node.row-0", "value.value");
  });
  const shown = await run(vi, { target: 9 });
  assert.equal(shown.value, 9);
  assert.deepEqual(shown.errorOut, warning);
});

/** A latch Boolean with rows Visible, Value (fails: 1193), Visible, read (measured as ppn-q4c.vi). */
const latchRows = (ignoreErrors) =>
  propertyVI({ target: "bool-control", targetConfig: { mechanical: "latch-when-pressed" }, className: "Boolean", rows: [{ property: "Visible" }, { property: "Value" }, { property: "Visible" }], ignoreErrors }, (b) => {
    b.node("first", "bool-indicator");
    b.node("value", "bool-indicator");
    b.node("third", "bool-indicator");
    b.wire("node.row-0", "first.value");
    b.wire("node.row-1", "value.value");
    b.wire("node.row-2", "third.value");
  });

test("a failing row stops the node: the rows after it give defaults, and the error names the row and the property", async () => {
  const shown = await run(latchRows(false));
  assert.equal(shown.first, true);
  assert.equal(shown.value, false);
  assert.equal(shown.third, false);
  assert.equal(shown.errorOut.code, LATCH_VALUE_READ_ERROR);
  assert.ok(shown.errorOut.status);
  assert.match(shown.errorOut.source, /^Property Node \(arg 2\)/);
  assert.match(shown.errorOut.source, /<APPEND>\nProperty Name: <b>Value<\/b>$/);
});

test("with Ignore Errors inside Node every row runs, and the error is still given without the property", async () => {
  const shown = await run(latchRows(true));
  assert.equal(shown.first, true);
  assert.equal(shown.third, true);
  assert.equal(shown.errorOut.code, LATCH_VALUE_READ_ERROR);
  assert.match(shown.errorOut.source, /^Property Node \(arg 2\)/);
  assert.doesNotMatch(shown.errorOut.source, /<APPEND>/);
});

test("with no window, Visible keeps what is written, Key Focus reads FALSE and Label.Text is the label", async () => {
  const rows = [{ property: "Visible", write: true }, { property: "Visible" }, { property: "Key Focus", write: true }, { property: "Key Focus" }, { property: "Label:Text" }];
  const vi = propertyVI({ target: "control", className: "Numeric", rows }, (b) => {
    b.node("hide", "bool-const", { value: false });
    b.node("focus", "bool-const", { value: true });
    b.node("visible", "bool-indicator");
    b.node("keyFocus", "bool-indicator");
    b.node("label", "str-indicator");
    b.wire("hide.result", "node.row-0");
    b.wire("node.row-1", "visible.value");
    b.wire("focus.result", "node.row-2");
    b.wire("node.row-3", "keyFocus.value");
    b.wire("node.row-4", "label.value");
  });
  const shown = await run(vi);
  assert.equal(shown.visible, false);
  assert.equal(shown.keyFocus, false);
  assert.equal(shown.label, "");
});

test("a write row left unwired keeps the OVI from running", () => {
  const vi = propertyVI({ target: "control", className: "Numeric", rows: [{ property: "Value", write: true }] }, () => {});
  assert.ok(compilar(vi.g, CAT).errores);
});

// ——— Instr (DT-072 §5), against the test instrument, as measured in 2026-10-26-visa-property-node-behavior.md ———

const VI_ERROR_NSUP_ATTR = -1073807331;
const VI_ERROR_NSUP_ATTR_STATE = -1073807330;

/** An Instr Property Node on a resource name constant, with `rows`; `steps` wires the rest. */
const instrVI = (resource, rows, steps) =>
  buildVI(CAT, (b) => {
    b.node("name", "visa-resource-constant", { value: resource });
    b.node("node", "property-node", { class: "Instr", rows });
    b.node("errorOut", "cluster-indicator", { type: ERROR, style: "error-out" });
    b.node("nameOut", "visa-indicator");
    b.wire("name.result", "node.reference");
    b.wire("node.error-out", "errorOut.value");
    b.wire("node.reference-out", "nameOut.value");
    steps(b);
  });

const readRows = (...properties) => properties.map((property) => ({ property }));

for (const [where, options] of [["on one thread", () => ({})], ["on a pool", () => ({ poolPorts: pool.connect() })]]) {
  test(`an Instr node opens a name never opened and reads a new session's defaults, ${where}`, async () => {
    const instrument = await startInstrument();
    try {
      const vi = instrVI(instrument.resource, readRows("General Settings:Timeout Value", "Message Based Settings:Termination Character", "Message Based Settings:Termination Character Enable", "General Settings:Resource Class"), (b) => {
        b.node("timeout", "indicator", { type: "u32" });
        b.node("termChar", "indicator", { type: "u8" });
        b.node("enabled", "bool-indicator");
        b.node("resourceClass", "str-indicator");
        b.wire("node.row-0", "timeout.value");
        b.wire("node.row-1", "termChar.value");
        b.wire("node.row-2", "enabled.value");
        b.wire("node.row-3", "resourceClass.value");
      });
      const shown = await run(vi, {}, { io: loadSolderIo(), ...options() });
      assert.deepEqual([shown.timeout, shown.termChar, shown.enabled, shown.resourceClass], [2000, 10, false, "SOCKET"]);
      assert.deepEqual(shown.errorOut, NO_ERROR);
      assert.equal(shown.nameOut, instrument.resource);
    } finally {
      instrument.stop();
    }
  });
}

test("an Instr row's error names only the row, and the rows after it do not run", async () => {
  const instrument = await startInstrument();
  try {
    const rows = [{ property: "General Settings:Timeout Value", write: true }, { property: "Message Based Settings:Termination Character Enable", write: true }, { property: "Serial Settings:Baud Rate" }];
    const vi = instrVI(instrument.resource, [...rows, ...readRows("General Settings:Timeout Value", "Message Based Settings:Termination Character Enable")], (b) => {
      b.node("timeout", "const", { value: 777, type: "u32" });
      b.node("enable", "bool-const", { value: true });
      b.node("baud", "indicator", { type: "u32" });
      b.node("timeoutAfter", "indicator", { type: "u32" });
      b.node("enabledAfter", "bool-indicator");
      b.wire("timeout.result", "node.row-0");
      b.wire("enable.result", "node.row-1");
      b.wire("node.row-2", "baud.value");
      b.wire("node.row-3", "timeoutAfter.value");
      b.wire("node.row-4", "enabledAfter.value");
    });
    const shown = await run(vi, {}, { io: loadSolderIo() });
    assert.equal(shown.errorOut.code, VI_ERROR_NSUP_ATTR, "a serial attribute on a socket");
    assert.match(shown.errorOut.source, /^Property Node \(arg 3\)/);
    assert.doesNotMatch(shown.errorOut.source, /<APPEND>/);
    assert.deepEqual([shown.timeoutAfter, shown.enabledAfter], [0, false], "skipped");
  } finally {
    instrument.stop();
  }
});

// VISA Bytes at Serial Port is an Instr node with this one row (reports/2026-11-05-visa-bytes-at-port.md); a new
// session has nothing waiting (measured on COM1, reports/2026-10-30-visa-serial-com1.md).
(HAS_SERIAL_TEST_INSTRUMENT ? test : test.skip)("Bytes at Port reads how many bytes wait in a serial port: none on a new session", async () => {
  const instrument = await startSerialInstrument();
  try {
    const vi = instrVI(instrument.resource, readRows("Serial Settings:Number of Bytes at Serial Port"), (b) => {
      b.node("waiting", "indicator", { type: "u32" });
      b.wire("node.row-0", "waiting.value");
    });
    const shown = await run(vi, {}, { io: loadSolderIo() });
    assert.equal(shown.waiting, 0);
    assert.deepEqual(shown.errorOut, NO_ERROR);
  } finally {
    instrument.stop();
  }
});

test("a Timeout Value beyond 2147483647 is refused with VI_ERROR_NSUP_ATTR_STATE", async () => {
  const instrument = await startInstrument();
  try {
    const vi = instrVI(instrument.resource, [{ property: "General Settings:Timeout Value", write: true }], (b) => {
      b.node("timeout", "const", { value: 2147483648, type: "u32" });
      b.wire("timeout.result", "node.row-0");
    });
    const shown = await run(vi, {}, { io: loadSolderIo() });
    assert.equal(shown.errorOut.code, VI_ERROR_NSUP_ATTR_STATE);
    assert.match(shown.errorOut.source, /^Property Node \(arg 1\)/);
  } finally {
    instrument.stop();
  }
});

test("Position and Bounds go as clusters: the caller's panel answers them, and a written Position reaches it", async () => {
  const asked = [];
  const panel = {
    get: (link, property) => (asked.push(["get", property]), property === "Bounds" ? { Width: 50, Height: 18 } : { Left: 10, Top: 20 }),
    set: (link, property, value) => void asked.push(["set", property, value]),
  };
  const position = { cluster: [{ name: "Left", type: "i32" }, { name: "Top", type: "i32" }] };
  const vi = propertyVI({ target: "control", className: "Numeric", rows: [{ property: "Position" }, { property: "Bounds" }, { property: "Position", write: true }] }, (b) => {
    b.node("where", "cluster-indicator", { type: position });
    b.node("size", "cluster-indicator", { type: { cluster: [{ name: "Width", type: "u32" }, { name: "Height", type: "u32" }] } });
    b.node("moveTo", "cluster-control", { type: position });
    b.wire("node.row-0", "where.value");
    b.wire("node.row-1", "size.value");
    b.wire("moveTo.result", "node.row-2");
  });
  const shown = await run(vi, { moveTo: { Left: 300, Top: 40 } }, { panel });
  assert.deepEqual(shown.where, { Left: 10, Top: 20 });
  assert.deepEqual(shown.size, { Width: 50, Height: 18 });
  assert.deepEqual(asked.at(-1), ["set", "Position", { Left: 300, Top: 40 }]);
  assert.deepEqual(shown.errorOut, NO_ERROR);
});
