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

/**
 * A For Loop of N = 3 with every border that reports: 10 enters by a tunnel, add = i + 10,
 * a shift register from 0 accumulates acc = register + add, add leaves by a tunnel to "last"
 * and the register's right terminal to "sum". So add is 10, 11, 12; last 12; sum 33.
 */
function loopVI() {
  let g = Gr.nuevo();
  const id = {};
  const put = (name, block, config, inside) => {
    const created = Gr.crearNodo(g, CAT, block, 0, 0);
    g = config ? Gr.fijarConfig(created.g, created.id, config) : created.g;
    id[name] = created.id;
    if (inside) g = Gr.meter(g, CAT, [created.id], id.loop);
  };
  const loop = Gr.crearEstructura(g, CAT, "for-loop", 0, 0, 200, 150);
  g = loop.g;
  id.loop = loop.id;
  const terminal = (kind) => g.nodos.find((node) => node.dentro === id.loop && node.tipo === kind).id;
  id.i = terminal("loop-iteration");
  id.count = terminal("loop-count");
  const register = Gr.crearRegistro(g, CAT, id.loop, 0);
  g = register.g;
  [id.left, id.right] = [register.izquierdo, register.derecho];
  for (const [name, direction] of [["tunnelIn", "in"], ["tunnelOut", "out"]]) {
    const tunnel = Gr.crearTunel(g, CAT, id.loop, direction, 0);
    g = tunnel.g;
    id[name] = tunnel.id;
  }
  put("n", "const", { value: 3 });
  put("ten", "const", { value: 10 });
  put("zero", "const", { value: 0 });
  put("add", "add", null, true);
  put("acc", "add", null, true);
  put("last", "indicator");
  put("sum", "indicator");
  const wires = [
    ["n", "result", "count", "count"], ["ten", "result", "tunnelIn", "x"], ["zero", "result", "left", "init"],
    ["tunnelIn", "y", "add", "a"], ["i", "i", "add", "b"], ["left", "value", "acc", "a"], ["add", "result", "acc", "b"],
    ["acc", "result", "right", "value"], ["add", "result", "tunnelOut", "x"], ["tunnelOut", "y", "last", "value"], ["right", "result", "sum", "value"],
  ];
  for (const [from, fromPort, to, toPort] of wires) {
    const wired = Gr.conectar(g, CAT, { nodo: id[from], puerto: fromPort, dir: "out" }, { nodo: id[to], puerto: toPort, dir: "in" });
    assert.ok(!wired.motivo, `${from}.${fromPort} -> ${to}.${toPort}: ${wired.motivo}`);
    g = wired.g;
  }
  return { g, id };
}

/** Runs `vi` (`chainVI` by default) with a controller; `events` collects what the page would receive. */
function start({ configure = {}, sleepLog = null, vi = chainVI } = {}) {
  const { g, id } = vi();
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

// The borders of the structures (plan §3b step 4): tunnels, shift registers and "i" report
// their values each iteration, and the outputs once the loop ends; they are never a stop.

/** The values reported for `port` of `node`, in order, from Highlight Execution's events (one per `ran`). */
const reported = (events, node, port) => events.flatMap((event) => event.values ?? []).filter((entry) => entry.node === node && entry.port === port).map((entry) => entry.value);

test("the borders of a loop report their values each iteration, and the outputs when it ends", async () => {
  const { events, run, id, compiled } = start({ vi: loopVI, configure: { highlight: { on: true, speed: "very-fast" } } });
  await run;
  const borders = compiled.debugNodes.filter((entry) => entry.border).map((entry) => entry.nodo);
  assert.deepEqual(new Set(borders), new Set([id.tunnelIn, id.left, id.i, id.tunnelOut, id.right]));
  assert.deepEqual(reported(events, id.tunnelIn, "y"), [10, 10, 10]);
  assert.deepEqual(reported(events, id.i, "i"), [0, 1, 2]);
  assert.deepEqual(reported(events, id.left, "value"), [0, 10, 21]);
  assert.deepEqual(reported(events, id.tunnelOut, "y"), [12]);
  assert.deepEqual(reported(events, id.right, "result"), [33]);
});

test("the plan never waits for a border, and counts a tunnel that reports each iteration once", async () => {
  const { plan, id, run } = start({ vi: loopVI });
  await run;
  assert.equal(plan.inputCounts[id.add], 2, "the tunnel and i");
  assert.equal(plan.inputCounts[id.tunnelOut], undefined, "a border is not a node the debugger stops before");
  assert.ok(plan.successors[id.tunnelIn].includes(id.add));
});

test("single stepping through a loop stops before its nodes, never at a border", async () => {
  const { controller, events, run, id } = start({ vi: loopVI });
  controller.requestPause();
  const borders = new Set([id.tunnelIn, id.left, id.i, id.tunnelOut, id.right]);
  let finished = false;
  run.then(() => (finished = true));
  for (let step = 0; step < 40 && !finished; step++) {
    await tick();
    if (controller.isPaused()) controller.resume("over");
  }
  await run;
  const stops = events.filter((event) => event.paused).map((event) => event.paused.node);
  assert.equal(stops.filter((node) => node === id.add).length, 3, "before the Add of each iteration");
  assert.ok(stops.every((node) => !borders.has(node)), JSON.stringify(stops));
  assert.ok(![id.n, id.ten, id.zero].some((constant) => stops.includes(constant)), "nor at a constant");
});
