// The editor's run worker with a VI whose Stop button is read inside its While Loop (DT-063 §10): the
// window sends the click as a "control" message, the worker writes it into the panel's memory at the
// next turn, the loop reads it, stops, and the Latch goes back to FALSE with a "soltar" message.

import assert from "node:assert/strict";
import { test } from "node:test";

import { compilar, runnableVI } from "../../core/compiler/compiler.mjs";
import { CAT, buildVI } from "../helpers.mjs";

const sent = [];
globalThis.onmessage = null;
globalThis.postMessage = (message) => sent.push(message);
await import("../../editor/src/window/run-worker.mjs");

/** A While Loop that waits 5 ms a turn, shows its "i" and stops when Stop is pressed. */
const loopWithStop = () =>
  buildVI(CAT, (b) => {
    b.loop("w", "while-loop");
    b.node("stop", "bool-control", { style: "stop-button", mechanical: "latch-when-released" }, "w");
    b.node("ms", "const", { value: 5 }, "w");
    b.node("wait", "wait-ms", null, "w");
    b.node("turns", "indicator", null, "w");
    b.wire("ms.result", "wait.ms");
    b.wire("stop.result", "w:stop.stop");
    b.wire("w:i.i", "turns.value");
  });

test("a Stop button pressed in the window stops a running loop and is released", { timeout: 10_000 }, async () => {
  const vi = loopWithStop();
  const compiled = compilar(vi.g, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  sent.length = 0;
  const run = globalThis.onmessage({ data: { orden: "run", clave: "stop", compilado: runnableVI(compiled), valores: { [vi.id.stop]: false }, separador: "." } });
  // Let it go round for a while, then press Stop as the window does.
  await new Promise((resolve) => setTimeout(resolve, 60));
  const shownBefore = sent.flatMap((message) => (message.escritos && vi.id.turns in message.escritos ? [message.escritos[vi.id.turns]] : []));
  assert.ok(shownBefore.length > 0 && shownBefore.at(-1) > 0, "the loop was running and the panel showed it");
  globalThis.onmessage({ data: { orden: "control", nodo: vi.id.stop, valor: true } });
  await run;
  assert.deepEqual(sent.at(-1), { fin: true }, "the Run ended by itself, not by Abort");
  assert.ok(sent.some((message) => message.soltar === vi.id.stop), "and the Latch went back to FALSE");
});
