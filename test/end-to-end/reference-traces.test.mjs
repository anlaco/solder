// The reference traces of the scheduler (DT-061 §8): VIs with parallel waits, run on a virtual clock,
// and the exact order in which their clumps must resume and write. The same VI and the same instants
// must give the same trace in every host; with one thread (DT-063 §4) the order is exact.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as Gr from "../../core/model/graph.mjs";
import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import { createVirtualHost } from "../../core/runtime/scheduler.mjs";
import { CAT } from "../helpers.mjs";

/** A For Loop that runs `count` times a wait of `ms` (or a wait until the next multiple) and shows the timer it gives. */
function addWaitingLoop(graph, ids, name, { count, ms, waitBlock = "wait-ms" }) {
  let g = graph;
  const loop = Gr.crearEstructura(g, CAT, "for-loop", 0, 0, 200, 150);
  g = loop.g;
  const countTerminal = g.nodos.find((node) => node.dentro === loop.id && node.tipo === "loop-count").id;
  const place = (block, config, inside) => {
    const created = Gr.crearNodo(g, CAT, block, 0, 0);
    g = config ? Gr.fijarConfig(created.g, created.id, config) : created.g;
    if (inside) g = Gr.meter(g, CAT, [created.id], loop.id);
    return created.id;
  };
  const connect = (from, fromPort, to, toPort) => {
    const result = Gr.conectar(g, CAT, { nodo: from, puerto: fromPort, dir: "out" }, { nodo: to, puerto: toPort, dir: "in" });
    assert.ok(!result.motivo, result.motivo);
    g = result.g;
  };
  const countConstant = place("const", { value: count }, false);
  const msConstant = place("const", { value: ms }, true);
  const wait = place(waitBlock, null, true);
  const shown = place("indicator", null, true);
  connect(countConstant, "result", countTerminal, "count");
  connect(msConstant, "result", wait, waitBlock === "wait-ms" ? "ms" : "multiple");
  connect(wait, "result", shown, "value");
  ids[shown] = name;
  return g;
}

/** Runs the loops on a virtual clock and returns every write as "name=timer". */
async function traceOf(loops) {
  let graph = Gr.nuevo();
  const names = {};
  for (const [name, loop] of Object.entries(loops)) graph = addWaitingLoop(graph, names, name, loop);
  const compiled = compilar(graph, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const writes = [];
  await ejecutar(compiled, {}, { host: createVirtualHost(), alEscribir: (node, value) => writes.push(`${names[node]}=${value}`) });
  return writes;
}

test("two loops of 1000 ms and 500 ms: at a tie the wait made first resumes first", async () => {
  assert.deepEqual(await traceOf({ slow: { count: 3, ms: 1000 }, fast: { count: 6, ms: 500 } }), [
    "fast=500", "slow=1000", "fast=1000", "fast=1500", "slow=2000", "fast=2000", "fast=2500", "slow=3000", "fast=3000",
  ]);
});

// Issue #1: two loops whose waits always end together; on Windows one of them was never woken.
test("two loops whose waits end together alternate, in the order their waits were made (issue #1)", async () => {
  assert.deepEqual(await traceOf({ a: { count: 3, ms: 10 }, b: { count: 3, ms: 10 } }), ["a=10", "b=10", "a=20", "b=20", "a=30", "b=30"]);
});

// At 300 both end: the plain wait was made at 150, the multiple's at 200, so the plain one goes first.
test("Wait Until Next ms Multiple resumes on the multiples of the virtual clock", async () => {
  assert.deepEqual(
    await traceOf({ multiple: { count: 3, ms: 100, waitBlock: "wait-until-next-ms-multiple" }, plain: { count: 2, ms: 150 } }),
    ["multiple=100", "plain=150", "multiple=200", "plain=300", "multiple=300"],
  );
});
