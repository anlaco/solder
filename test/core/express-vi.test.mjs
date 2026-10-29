// Express VIs (DT-069): the two states of a node and its context help, and Time Delay in a Run on the virtual host
// (DT-061 §6), whose clock jumps to the next deadline, so the times are exact. Values measured in LabVIEW:
// labview-captures/reports/2026-10-29-express-vi-common.md and 2026-10-29-time-delay.md.

import assert from "node:assert/strict";
import { test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import { createVirtualHost } from "../../core/runtime/scheduler.mjs";
import { configure, configuredAsLines, expansionRowPorts, isConfigured, isExpress } from "../../core/model/express.mjs";
import { ERROR } from "../../core/model/types.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { CAT, buildVI } from "../helpers.mjs";

const NO_ERROR = { status: false, code: 0, source: "" };
const TIME_DELAY = CAT.bloque("time-delay");

/** A Time Delay node as the palette makes it: unconfigured, with the default configuration of 1 s. */
function droppedTimeDelay() {
  const { g, id } = Gr.crearNodo({ nodos: [], cables: [], siguiente: 1 }, CAT, "time-delay", 0, 0);
  return g.nodos.find((node) => node.id === id);
}

test("an Express VI is unconfigured until an OK, and then its dialog's terminals are expansion rows", () => {
  const dropped = droppedTimeDelay();
  assert.equal(isExpress(TIME_DELAY), true);
  assert.equal(isExpress(CAT.bloque("wait-ms")), false);
  assert.equal(isConfigured(dropped), false);
  assert.equal(dropped.config.delay, 1, "measured: the dialog opens with 1.000");
  assert.deepEqual(expansionRowPorts(TIME_DELAY, dropped, CAT.puertos(dropped)), []);
  assert.deepEqual(configuredAsLines(TIME_DELAY, dropped), [], "no configuration block while unconfigured (measured)");

  const unchanged = configure(dropped);
  assert.equal(isConfigured(unchanged), true, "an OK with nothing changed configures it (measured)");
  const configured = configure(dropped, { delay: 2.5 });
  assert.deepEqual(expansionRowPorts(TIME_DELAY, configured, CAT.puertos(configured)), ["delay-time"]);
  assert.deepEqual(configuredAsLines(TIME_DELAY, configured), ["Delay Time: 2.5 s"]);
  assert.deepEqual(configuredAsLines(TIME_DELAY, configure(dropped, { delay: 2.123456 })), ["Delay Time: 2.123456 s"], "the value is kept whole (measured)");
  for (const [delay, line] of [[0, "Delay Time: 0 s"], [1e9, "Delay Time: 1E+9 s"], [1e20, "Delay Time: 1E+20 s"], [1e308, "Delay Time: 1E+308 s"]]) {
    assert.deepEqual(configuredAsLines(TIME_DELAY, configure(dropped, { delay })), [line]);
  }
});

/** Time Delay configured with `delay`, its Delay Time wired from a constant when `wired` is given, then an indicator of the clock. */
const delayThenClock = ({ delay, wired, errorIn }) =>
  buildVI(CAT, (b) => {
    b.node("delay", "time-delay");
    b.node("errorOut", "cluster-indicator", { type: ERROR, style: "error-out" });
    b.wire("delay.error-out", "errorOut.value");
    if (wired !== undefined) {
      b.node("seconds", "const", { value: wired });
      b.wire("seconds.result", "delay.delay-time");
    }
    if (errorIn) {
      b.node("incoming", "error-cluster-constant", { value: errorIn });
      b.wire("incoming.result", "delay.error-in");
    }
  });

/** Runs `vi` on the virtual host; gives what it wrote by name and when the Run ended, in ms. */
async function runTimed(vi, delay) {
  const g = { ...vi.g, nodos: vi.g.nodos.map((node) => (node.id === vi.id.delay ? configure(node, { delay }) : node)) };
  const host = createVirtualHost();
  const written = await ejecutar(compilar(g, CAT), {}, { host });
  const byId = Object.fromEntries(Object.entries(vi.id).map(([name, nodeId]) => [nodeId, name]));
  return { shown: Object.fromEntries(Object.entries(written).map(([nodeId, value]) => [byId[nodeId], value])), ended: host.now() };
}

test("Time Delay waits its configured seconds, and a wired value wins over them", async () => {
  const configuredOnly = await runTimed(delayThenClock({}), 2.5);
  assert.equal(configuredOnly.ended, 2500);
  assert.deepEqual(configuredOnly.shown.errorOut, NO_ERROR);
  const wired = await runTimed(delayThenClock({ wired: 0.5 }), 2.5);
  assert.equal(wired.ended, 500, "measured: 0.5 wired with 2.5 configured waits 0.5 s");
});

test("Time Delay waits also with an error or a warning in, which passes unchanged", async () => {
  for (const errorIn of [{ status: true, code: 5000, source: "x" }, { status: false, code: 5000, source: "w" }]) {
    const { shown, ended } = await runTimed(delayThenClock({ wired: 1, errorIn }), 2.5);
    assert.equal(ended, 1000, JSON.stringify(errorIn));
    assert.deepEqual(shown.errorOut, errorIn);
  }
});

test("Time Delay of 0, a negative number, NaN or less than a millisecond does not wait, and gives no error", async () => {
  for (const seconds of [0, -1, Number.NaN, 0.0005]) {
    const { shown, ended } = await runTimed(delayThenClock({ wired: seconds }), 2.5);
    assert.equal(ended, 0, String(seconds));
    assert.deepEqual(shown.errorOut, NO_ERROR, String(seconds));
  }
  assert.equal((await runTimed(delayThenClock({ wired: 0.001 }), 2.5)).ended, 1, "measured: 1e-3 waits about 1 ms");
});
