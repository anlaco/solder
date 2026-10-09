// The debugger of a Run on the worker's side (debug-controller.mjs), driven by the real
// compiled VI: values reported, the pace of Highlight Execution, breakpoints that stop
// BEFORE a node, Pause and the three steps.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { SPEEDS, createDebugController, paceFor } from "../../editor/src/debugging/debug-controller.mjs";
import { buildDebugPlan } from "../../editor/src/debugging/debug-plan.mjs";
import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import { CAT, INV } from "../helpers.mjs";

const CONTEXT = D.contexto(CAT, D.glifosPorBloque(INV));

/** 2 + 3 -> negate -> indicator: a chain of four nodes in one clump, plus 7 -> indicator on its own. */
function chainVI() {
  let g = Gr.nuevo();
  const id = {};
  const put = (name, block, config, x = 0, y = 0) => {
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

/** Runs `chainVI` with a controller; `events` collects what the page would receive. */
function start({ configure = {}, sleepLog = null } = {}) {
  const { g, id } = chainVI();
  const compiled = compilar(g, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const plan = buildDebugPlan(g, compiled.debugNodes, CONTEXT, INV);
  const events = [];
  const controller = createDebugController({
    debugNodes: compiled.debugNodes,
    plan,
    send: (message) => events.push(message.debug),
    sleep: async (ms) => sleepLog?.push(ms),
  });
  controller.configure({ active: true, ...configure });
  const run = ejecutar(compiled, {}, { depurador: controller.hooks });
  return { controller, events, run, id, plan, compiled };
}

const tick = () => new Promise((done) => setTimeout(done, 30));
const pausedNode = (events) => events.filter((event) => event.paused).at(-1)?.paused;

test("the plan counts the wires between reporting nodes and their lengths", () => {
  const { plan, id } = start();
  assert.deepEqual(plan.successors[id.two], [id.add]);
  assert.equal(plan.inputCounts[id.add], 2);
  assert.ok(plan.wireLengths[id.two] > 0);
  assert.equal(plan.names[id.add], "Add");
});

test("a node reports the values of its outputs and then itself, as the page will draw them", async () => {
  const { controller, events, run, id } = start();
  await run;
  controller.flush();
  const values = events.flatMap((event) => event.values ?? []);
  assert.ok(values.some((entry) => entry.node === id.add && entry.port === "result" && entry.value === 5));
  assert.ok(events.every((event) => !event.ran), "without Highlight Execution only values are sent, in batches");
});

test("the pace of Highlight Execution is the wire length over the speed, with a floor", () => {
  assert.equal(paceFor("medium", 1000), 1000);
  assert.equal(paceFor("slow", 1000), 2000);
  assert.equal(paceFor("medium", 0), 50);
  assert.deepEqual(SPEEDS, ["slow", "medium", "fast", "very-fast"]);
  assert.ok(paceFor("fast", 500) < paceFor("medium", 500));
});

test("with Highlight Execution each node waits for its pace, and the first one for the initial dimming", async () => {
  const sleeps = [];
  const { run } = start({ configure: { highlight: { on: true, speed: "medium" } }, sleepLog: sleeps });
  await run;
  assert.equal(sleeps[0], 600, "the diagram stays dimmed before the data flows");
  assert.ok(sleeps.length > 4);
  assert.ok(sleeps.slice(1).every((ms) => ms >= 50));
});

test("a breakpoint on a node stops the VI before the node runs, when its inputs have arrived", async () => {
  const { controller, events, run, id } = start({ configure: { nodeBreakpoints: {} } });
  controller.configure({ nodeBreakpoints: { [id.add]: true } });
  await tick();
  assert.deepEqual(pausedNode(events), { node: id.add, kind: "before", wire: undefined, container: null, name: "Add" });
  const reportedBefore = events.flatMap((event) => event.values ?? []).map((entry) => entry.node);
  assert.ok(!reportedBefore.includes(id.add), "the Add has not run");
  controller.resume("continue");
  await run;
  controller.flush();
  assert.ok(events.flatMap((event) => event.values ?? []).some((entry) => entry.node === id.add));
});

test("a breakpoint on a constant stops right after it, which is the nearest to before", async () => {
  const { controller, events, run, id } = start();
  controller.configure({ nodeBreakpoints: { [id.three]: true } });
  await tick();
  assert.equal(pausedNode(events).kind, "at");
  controller.resume("continue");
  await run;
});

test("Step Over runs the node and stops before the next one; Continue goes to the end", async () => {
  const { controller, events, run, id } = start({ configure: { highlight: { on: true, speed: "very-fast" } } });
  controller.configure({ nodeBreakpoints: { [id.add]: true } });
  await tick();
  assert.equal(pausedNode(events).node, id.add);
  controller.resume("over");
  await tick();
  assert.equal(pausedNode(events).node, id.negate, "the Add ran, the Negate is next");
  assert.ok(events.some((event) => event.ran === id.add));
  controller.resume("over");
  await tick();
  assert.equal(pausedNode(events).node, id.sum);
  controller.resume("continue");
  await run;
});

test("Pause stops before the next node that is about to run", async () => {
  const { controller, events, run, id } = start({ configure: { nodeBreakpoints: { } } });
  controller.configure({ highlight: { on: true, speed: "very-fast" } });
  controller.requestPause();
  await tick();
  assert.ok(pausedNode(events), "paused");
  controller.resume("continue");
  await run;
  assert.ok(events.some((event) => event.ran === id.sum));
});

test("a disabled breakpoint does not stop, and Abort frees a held VI", async () => {
  const { controller, events, run, id } = start();
  controller.configure({ nodeBreakpoints: { [id.add]: false } });
  await run;
  assert.equal(pausedNode(events), undefined);
  const second = start();
  second.controller.configure({ nodeBreakpoints: { [second.id.add]: true } });
  await tick();
  assert.ok(second.controller.isPaused());
  second.controller.release();
  await second.run;
});
