// Debugging through the real run worker (DT-047): the page's messages in, the worker's messages out,
// with a compiled VI in the middle, as editor-window.mjs does it.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as DS from "../../editor/src/debugging/debug-state.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { buildDebugPlan } from "../../editor/src/debugging/debug-plan.mjs";
import { compilar } from "../../core/compiler/compiler.mjs";
import { CAT, INV } from "../helpers.mjs";

const answers = [];
globalThis.onmessage = null;
globalThis.postMessage = (message) => answers.push(message);
await import("../../editor/src/window/run-worker.mjs");

/** 2 + 3 -> Negate -> indicator. */
function chain() {
  let g = Gr.nuevo();
  const id = {};
  const put = (name, block, config, x, y) => {
    const created = Gr.crearNodo(g, CAT, block, x, y);
    g = config ? Gr.fijarConfig(created.g, created.id, config) : created.g;
    id[name] = created.id;
  };
  put("two", "const", { value: 2 }, 0, 0);
  put("three", "const", { value: 3 }, 0, 60);
  put("add", "add", null, 100, 30);
  put("negate", "negate", null, 200, 30);
  put("sum", "indicator", null, 300, 30);
  for (const [from, fromPort, to, toPort] of [["two", "result", "add", "a"], ["three", "result", "add", "b"], ["add", "result", "negate", "x"], ["negate", "result", "sum", "value"]]) {
    g = Gr.conectar(g, CAT, { nodo: id[from], puerto: fromPort, dir: "out" }, { nodo: id[to], puerto: toPort, dir: "in" }).g;
  }
  return { g, id };
}

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

/** Posts a `run` as the window does and returns the promise of the whole handler. */
function startRun(g, id, debugState) {
  const compiled = compilar(g, CAT);
  const plan = buildDebugPlan(g, compiled.debugNodes, D.contexto(CAT, D.glifosPorBloque(INV)), INV);
  answers.length = 0;
  const handler = globalThis.onmessage({ data: { orden: "run", clave: "debugging", compilado: { bytes: compiled.bytes, controles: compiled.controles, indicadores: compiled.indicadores, clumps: compiled.clumps, planes: compiled.planes, automaticos: compiled.automaticos, disposicionError: compiled.disposicionError, debugFlag: compiled.debugFlag, debugNodes: compiled.debugNodes }, depuracion: { plan, config: DS.controllerConfig(debugState, g), stepFirst: false }, valores: {}, separador: "." } });
  return { handler, compiled };
}

const debugEvents = () => answers.filter((message) => message.debug).map((message) => message.debug);

test("a breakpoint stops the VI in the worker, the page sees the stop and Continue finishes the Run", async () => {
  const { g, id } = chain();
  const state = DS.addBreakpoint(DS.initial(), { node: id.negate });
  const { handler } = startRun(g, id, state);
  await wait(100);
  assert.equal(answers.at(-1)?.fin, undefined, "the VI is held");
  const stop = debugEvents().find((event) => event.paused)?.paused;
  assert.equal(stop.node, id.negate);
  assert.equal(stop.kind, "before");
  assert.ok(!answers.some((message) => message.escritos), "the indicator has not been written");
  await globalThis.onmessage({ data: { orden: "debug-resume", modo: "continue" } });
  await handler;
  assert.deepEqual(Object.assign({}, ...answers.map((message) => message.escritos ?? {}))[id.sum], -5);
  assert.ok(answers.at(-1).fin);
  assert.ok(debugEvents().some((event) => event.resumed));
});

test("Pause and Abort work on a running VI and Abort frees a stopped one", async () => {
  const { g, id } = chain();
  const state = DS.addBreakpoint(DS.initial(), { node: id.add });
  const { handler } = startRun(g, id, state);
  await wait(100);
  assert.ok(debugEvents().some((event) => event.paused));
  await globalThis.onmessage({ data: { orden: "abort" } });
  await handler;
  assert.ok(answers.at(-1).fin && answers.at(-1).abortado, JSON.stringify(answers.at(-1)));
});

test("with Highlight Execution on, the worker sends each node as it runs with its pace and its values", async () => {
  const { g, id } = chain();
  const state = DS.setHighlightSpeed(DS.initial(), "very-fast");
  const { handler } = startRun(g, id, state);
  await handler;
  const ran = debugEvents().filter((event) => event.ran);
  assert.ok(ran.length >= 5, "one report per node");
  assert.ok(ran.every((event) => event.pace >= 5));
  const add = ran.find((event) => event.ran === id.add);
  assert.deepEqual(add.values.map((entry) => [entry.port, entry.value]), [["result", 5]]);
  assert.ok(answers.at(-1).fin);
});

test("a probe receives the value of its wire in batches and a Run without debugging reports nothing", async () => {
  const { g, id } = chain();
  const wire = g.cables.find((candidate) => candidate.de.nodo === id.add);
  const { handler } = startRun(g, id, DS.addProbe(DS.initial(), wire.id));
  await handler;
  const values = debugEvents().flatMap((event) => event.values ?? []);
  assert.ok(values.some((entry) => entry.node === id.add && entry.value === 5));
  const quiet = startRun(g, id, DS.initial());
  await quiet.handler;
  assert.deepEqual(debugEvents(), []);
});
