// VISA Configure Serial Port (DT-070 §7, DT-073, DT-074): a polymorphic OVI of ovi.lib, drawn anew from what was
// measured (labview-captures/reports/2026-11-05-visa-configure-serial-port.md): two instances, (Instr) and
// (Serial Instr), whose diagram writes nine rows of an Instr Property Node, End Mode for Reads from a Case on
// Enable Termination Char; the connector is pattern 4833 with the measured indices, defaults and optional terminals.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import * as Gr from "../../core/model/graph.mjs";
import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import { loadHierarchy } from "../../core/model/hierarchy.mjs";
import { isOviLibPath, resolveOviLibPath } from "../../core/model/ovi-lib.mjs";
import { readPolymorphic } from "../../core/model/polymorphic.mjs";
import { aTexto, leer } from "../../core/model/qvi-format.mjs";
import { ERROR } from "../../core/model/types.mjs";
import { loadSolderIo } from "../../native/solder-io-node/solder-io.mjs";
import { HAS_SERIAL_TEST_INSTRUMENT, startSerialInstrument } from "../instrument.mjs";
import { CAT, RAIZ, buildVI } from "../helpers.mjs";

const OVI_LIB = path.join(RAIZ, "ovi.lib");
const STORED = "<ovilib>/Instr/VISA Configure Serial Port.sdp";
const CALLER = path.join(tmpdir(), "caller.sdg");

const resolvePath = (callerKey, stored) => (isOviLibPath(stored) ? resolveOviLibPath(stored, OVI_LIB) : path.resolve(path.dirname(callerKey), stored));

/** The hierarchy of a caller built by `build(b)`, with its polymorphic node adapted. */
function callerOf(build) {
  const load = (rootGraph) =>
    loadHierarchy(CALLER, CAT, {
      resolvePath,
      loadVI: (key, viCatalog) => (key === CALLER ? rootGraph : leer(readFileSync(key, "utf8"), viCatalog)),
      loadPolymorphic: (key) => readPolymorphic(readFileSync(key, "utf8")),
    });
  const probe = load(Gr.nuevo());
  assert.deepEqual(probe.errors, []);
  const vi = buildVI(probe.vis.get(CALLER).cat, build);
  const loaded = load(vi.g);
  assert.deepEqual(loaded.errors, []);
  const { cat } = loaded.vis.get(CALLER);
  return { ...vi, g: Gr.adaptPolymorphicNodes(vi.g, cat), cat };
}

// The measured terminals by connector index (pattern 4833): label, type, default, optional.
const MEASURED_INPUTS = [
  [0, "VISA resource name", undefined, false],
  [1, "timeout (10sec)", 10000, true],
  [2, "termination char (0xA = '\\n' = LF)", 10, true],
  [3, "Enable Termination Char (T)", true, true],
  [5, "baud rate (9600)", 9600, false],
  [7, "data bits (8)", 8, false],
  [9, "parity (0:none)", 0, false],
  [11, "error in (no error)", undefined, false],
  [12, "stop bits (10: 1 bit)", 10, true],
  [13, "flow control (0:none)", 0, false],
];

test("both instances have the measured connector: pattern 4833, its indices, labels, defaults and optional terminals", () => {
  const vi = callerOf((b) => b.node("call", "subvi", { vi: STORED, instance: null, selected: 0, selector: false }));
  const node = vi.g.nodos.find((one) => one.id === vi.id.call);
  const polymorphic = vi.cat.polymorphicOf(node);
  assert.deepEqual(polymorphic.instances.map((one) => path.basename(one.key)), ["VISA Configure Serial Port (Instr).sdg", "VISA Configure Serial Port (Serial Instr).sdg"]);
  for (const index of [0, 1]) {
    const ports = vi.cat.puertos({ ...node, config: { ...node.config, instance: index } });
    assert.deepEqual(ports.in.map((port) => [port.cell, port.label, port.defaultValue === "" ? undefined : port.defaultValue, port.connection === "optional"]).filter(([cell]) => cell !== 0 && cell !== 11), MEASURED_INPUTS.filter(([cell]) => cell !== 0 && cell !== 11));
    assert.deepEqual(ports.in.map((port) => port.cell), MEASURED_INPUTS.map(([cell]) => cell));
    assert.deepEqual(ports.out.map((port) => [port.cell, port.label]), [[4, "VISA resource name out"], [15, "error out"]]);
    assert.ok(ports.in.every((port) => port.pattern === 4833));
    assert.deepEqual(ports.in.find((port) => port.cell === 9).type, { enum: ["None", "Odd", "Even", "Mark", "Space"] }, "parity is the measured enum");
  }
});

test("Automatic picks (Instr): Solder's VISA resource name has no VISA class yet", () => {
  const vi = callerOf((b) => {
    b.node("name", "visa-resource-constant", { value: "ASRL1::INSTR" });
    b.node("call", "subvi", { vi: STORED, instance: null, selected: 1, selector: false });
    b.wire("name.result", "call.cell-0");
  });
  assert.equal(vi.g.nodos.find((one) => one.id === vi.id.call).config.selected, 0);
});

/**
 * A caller that configures the port, then reads the settings back with an Instr Property Node. The serial test
 * instrument is a pseudo-terminal, and Linux refuses 7 data bits and any parity on one (tcsetattr says EINVAL, tried
 * on 2026-11-05): those go as 8 and None, while the baud rate, the stop bits and the termination character change.
 */
const configureThenRead = (resource, instance) =>
  callerOf((b) => {
    b.node("name", "visa-resource-constant", { value: resource });
    b.node("baud", "const", { value: 19200, type: "u32" });
    b.node("dataBits", "const", { value: 8, type: "u16" });
    b.node("parity", "enum-const", { type: { enum: ["None", "Odd", "Even", "Mark", "Space"] }, value: 0 });
    b.node("stopBits", "const", { value: 20, type: "u16" });
    b.node("termChar", "const", { value: 13, type: "u8" });
    b.node("call", "subvi", { vi: STORED, instance, selected: 0, selector: false });
    b.node("read", "property-node", {
      class: "Instr",
      rows: ["Serial Settings:Baud Rate", "Serial Settings:Data Bits", "Serial Settings:Parity", "Serial Settings:Stop Bits", "Serial Settings:Flow Control", "Message Based Settings:Termination Character", "Message Based Settings:Termination Character Enable", "Serial Settings:End Mode for Reads", "General Settings:Timeout Value"].map((property) => ({ property })),
    });
    b.node("errorOut", "cluster-indicator", { type: ERROR, style: "error-out" });
    for (const [name, type] of [["baudOut", "u32"], ["dataBitsOut", "u16"], ["parityOut", "u16"], ["stopBitsOut", "u16"], ["flowOut", "u16"], ["termCharOut", "u8"], ["endModeOut", "u16"], ["timeoutOut", "u32"]]) b.node(name, "indicator", { type });
    b.node("termEnabledOut", "bool-indicator");
    b.wire("name.result", "call.cell-0");
    b.wire("baud.result", "call.cell-5");
    b.wire("dataBits.result", "call.cell-7");
    b.wire("parity.result", "call.cell-9");
    b.wire("stopBits.result", "call.cell-12");
    b.wire("termChar.result", "call.cell-2");
    b.wire("call.cell-4", "read.reference");
    b.wire("call.cell-15", "read.error-in");
    b.wire("read.error-out", "errorOut.value");
    ["baudOut", "dataBitsOut", "parityOut", "stopBitsOut", "flowOut", "termCharOut", "termEnabledOut", "endModeOut", "timeoutOut"].forEach((name, row) => b.wire(`read.row-${row}`, `${name}.value`));
  });

for (const [instance, name] of [[null, "on Automatic, (Instr)"], [1, "picked by hand, (Serial Instr)"]]) {
  (HAS_SERIAL_TEST_INSTRUMENT ? test : test.skip)(`VISA Configure Serial Port ${name} sets a serial port, and a Property Node reads it back`, async () => {
    const instrument = await startSerialInstrument();
    try {
      const vi = configureThenRead(instrument.resource, instance);
      const compiled = compilar(vi.g, vi.cat);
      assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
      const written = await ejecutar(compiled, {}, { io: loadSolderIo() });
      const shown = Object.fromEntries(Object.entries(vi.id).map(([key, nodeId]) => [key, written[nodeId]]));
      assert.deepEqual(shown.errorOut, { status: false, code: 0, source: "" });
      assert.deepEqual(
        { baud: shown.baudOut, dataBits: shown.dataBitsOut, parity: shown.parityOut, stopBits: shown.stopBitsOut, flow: shown.flowOut, termChar: shown.termCharOut, termEnabled: shown.termEnabledOut, endMode: shown.endModeOut, timeout: shown.timeoutOut },
        { baud: 19200, dataBits: 8, parity: 0, stopBits: 20, flow: 0, termChar: 13, termEnabled: true, endMode: 2, timeout: 10000 },
        "what was wired, and the defaults of what was not: Enable Termination Char TRUE gives End Mode for Reads TermChar (2)",
      );
    } finally {
      instrument.stop();
    }
  });
}

test("the command line resolves <ovilib> and checks a caller of VISA Configure Serial Port", () => {
  const folder = mkdtempSync(path.join(tmpdir(), "solder-ovilib-"));
  const vi = callerOf((b) => {
    b.node("name", "visa-resource-constant", { value: "ASRL1::INSTR" });
    b.node("call", "subvi", { vi: STORED, instance: null, selected: 0, selector: false });
    b.node("errorOut", "cluster-indicator", { type: ERROR, style: "error-out" });
    b.wire("name.result", "call.cell-0");
    b.wire("call.cell-15", "errorOut.value");
  });
  const file = path.join(folder, "caller.sdg");
  writeFileSync(file, aTexto(vi.g, vi.cat));
  assert.match(execFileSync(process.execPath, [path.join(RAIZ, "cli/solder.mjs"), "check", file], { encoding: "utf8" }), /se puede ejecutar|can run/);
});
