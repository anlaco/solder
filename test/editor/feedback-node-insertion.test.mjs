// The Feedback Node's automatic insertion and its swaps with a shift register (DT-109 §6), against what LabVIEW 2026 Q3 does
// (labview-captures/reports/2026-11-26-feedback-node-insert.md Q1-Q5; the captures are local evidence and are never committed).
// The Increment of the editor is 22 x 22 with its terminals on the row y + 11 (LabVIEW's glyph is 21 x 21, row y + 10), so the
// measured numbers that count from the Increment's top are one more here; the ones that count from the terminals' row are the same.

import assert from "node:assert/strict";
import { test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import * as Gr from "../../core/model/graph.mjs";
import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as H from "../../editor/src/block-diagram/undo-history.mjs";
import { closesCycle, insertionPlacement } from "../../editor/src/block-diagram/feedback-node-insertion.mjs";
import { CAT, INV } from "../helpers.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",");
const nodeOf = (g, id) => g.nodos.find((candidate) => candidate.id === id);
const feedbackNodes = (g) => g.nodos.filter((node) => node.tipo === "feedback-node");
const wireBetween = (g, from, to) => g.cables.find((wire) => `${wire.de.nodo}.${wire.de.puerto}` === from && `${wire.a.nodo}.${wire.a.puerto}` === to);
const FEEDBACK_ROOT = "context.feedback-node";
const SHIFT_REGISTER_ROW = "context.shift-register.replace-with-feedback-node";

/** The terminal as the window resolves it under the pointer, and its point. */
function terminalAt(d, id, port) {
  const terminal = D.terminales(nodeOf(d.g, id), CTX, undefined, d.g).find((candidate) => candidate.puerto === port);
  return [{ tipo: "terminal", nodo: id, puerto: port, dir: terminal.dir }, { x: terminal.x, y: terminal.y }];
}

/** Drags a wire from one terminal to another, as the mouse does. */
function drag(d, [from, fromPoint], [to, toPoint]) {
  const pressed = ED.pulsar(d, CTX, from, fromPoint);
  return ED.soltar(ED.moverA(pressed, CTX, toPoint), CTX, to, toPoint);
}
const dragWire = (d, [fromId, fromPort], [toId, toPort]) => drag(d, terminalAt(d, fromId, fromPort), terminalAt(d, toId, toPort));

/** A graph under construction: nodes at places, inside a structure when given. */
function builder(g = Gr.nuevo()) {
  const scene = { g, id: {} };
  scene.loop = (name, block, x, y, width, height, inside) => {
    const created = Gr.crearEstructura(scene.g, CAT, block, x, y, width, height);
    scene.g = inside ? Gr.meter(created.g, CAT, [created.id], inside) : created.g;
    scene.id[name] = created.id;
    return created.id;
  };
  scene.node = (name, block, x, y, config, inside) => {
    const created = Gr.crearNodo(scene.g, CAT, block, x, y);
    scene.g = Gr.meter(config ? Gr.fijarConfig(created.g, created.id, config) : created.g, CAT, [created.id], inside);
    scene.id[name] = created.id;
    return created.id;
  };
  scene.wire = (from, to) => {
    const [[fromName, fromPort], [toName, toPort]] = [from.split("."), to.split(".")];
    const joined = Gr.conectar(scene.g, CAT, { nodo: scene.id[fromName], puerto: fromPort, dir: "out" }, { nodo: scene.id[toName], puerto: toPort, dir: "in" });
    assert.equal(joined.motivo, undefined, `${from} -> ${to}`);
    scene.g = joined.g;
  };
  return scene;
}

/** An Increment at (176, 146) in a While Loop at (100, 100), 300 x 150: Q1's first scene. */
function incrementInLoop(blockInside = "increment") {
  const scene = builder();
  scene.loop("loop", "while-loop", 100, 100, 300, 150);
  scene.node("inc", blockInside, 176, 146, null, scene.id.loop);
  return scene;
}

// ——— The cycle ———

test("a wire closes a cycle when its sink reaches its source, through the wires there are or not at all", () => {
  const scene = builder();
  for (const name of ["a", "b", "c"]) scene.node(name, "increment", 0, 0);
  scene.wire("a.result", "b.x");
  scene.wire("b.result", "c.x");
  const end = (name, port) => ({ nodo: scene.id[name], puerto: port });
  assert.equal(closesCycle(scene.g, end("c", "result"), end("a", "x")), true, "c.result -> a.x: a reaches c");
  assert.equal(closesCycle(scene.g, end("b", "result"), end("a", "x")), true, "a reaches b");
  assert.equal(closesCycle(scene.g, end("a", "result"), end("a", "x")), true, "the same node");
  assert.equal(closesCycle(scene.g, end("a", "result"), end("c", "x")), false, "forwards: c does not reach a");
  const withNode = builder(scene.g);
  withNode.id = scene.id;
  withNode.node("fb", "feedback-node", 0, 0);
  withNode.wire("a.result", "fb.input");
  assert.equal(closesCycle(withNode.g, { nodo: withNode.id.fb, puerto: "output" }, { nodo: withNode.id.fb, puerto: "input" }), false, "a Feedback Node's output back to its own input closes nothing");
  assert.equal(closesCycle(withNode.g, { nodo: withNode.id.fb, puerto: "output" }, end("a", "x")), false, "nor does one from the node to the start of the chain that feeds it");
});

// ——— Placement (Q1, Q2) ———

test("one node: the Feedback Node goes centred over the Increment, arrow left, with its arrow row 15 px above the terminals", () => {
  const scene = incrementInLoop();
  const d = dragWire({ ...ED.inicial(), g: scene.g }, [scene.id.inc, "result"], [scene.id.inc, "x"]);
  assert.equal(d.aviso, null, "the wire is accepted");
  const [node] = feedbackNodes(d.g);
  assert.ok(node, "a Feedback Node instead of the wire");
  // LabVIEW: Increment (176, 146) 21 x 21, terminals on y + 10, node (171, 135). The editor's has terminals on y + 11: top = row - 21 = 136.
  assert.deepEqual([node.x, node.y], [171, 136]);
  assert.equal(node.config.direction, "left");
  assert.equal(node.config.delay, 1);
  assert.equal(node.config.initializerLoopsOut, 0);
  assert.equal(node.dentro, scene.id.loop, "in the loop, where the sink is");
  const row = D.extremos(d.g, CTX).get(`${scene.id.inc}.x`).y;
  assert.equal(node.y + 21, row, "top = terminal row - 21");
  assert.equal(node.x + 16, (D.extremos(d.g, CTX).get(`${scene.id.inc}.result`).x + D.extremos(d.g, CTX).get(`${scene.id.inc}.x`).x) / 2, "centred between the Increment's tips");
  // The new wires, and nothing else: no wire was there to cut, and no wire joins the Increment to itself.
  assert.deepEqual(d.g.cables.map((wire) => `${wire.de.nodo}.${wire.de.puerto}>${wire.a.nodo}.${wire.a.puerto}`).sort(), [`${node.id}.output>${scene.id.inc}.x`, `${scene.id.inc}.result>${node.id}.input`].sort());
  assert.deepEqual(Gr.tipos(d.g, CAT).ciclo, [], "no cycle is left");
  assert.equal(d.g.cables.some((wire) => Gr.tipos(d.g, CAT).cables.get(wire.id)?.roto), false, "no wire is broken");
});

test("the node goes in a loop with no change, and in no loop at all it is not in a structure", () => {
  const bare = builder();
  bare.node("inc", "increment", 176, 146);
  const d = dragWire({ ...ED.inicial(), g: bare.g }, [bare.id.inc, "result"], [bare.id.inc, "x"]);
  const [node] = feedbackNodes(d.g);
  assert.deepEqual([node.x, node.y, node.dentro, node.config.direction], [171, 136, undefined, "left"]);
});

test("through two nodes the closing wire goes from the second to the first, no wire is cut, and the node is centred between the tips", () => {
  const scene = builder();
  scene.loop("loop", "for-loop", 100, 100, 400, 150);
  scene.node("a", "increment", 150, 146, null, scene.id.loop);
  scene.node("b", "increment", 300, 146, null, scene.id.loop);
  scene.wire("a.result", "b.x");
  const before = scene.g.cables[0];
  const d = dragWire({ ...ED.inicial(), g: scene.g }, [scene.id.b, "result"], [scene.id.a, "x"]);
  const [node] = feedbackNodes(d.g);
  const ends = D.extremos(d.g, CTX);
  const [tip, input] = [ends.get(`${scene.id.b}.result`), ends.get(`${scene.id.a}.x`)];
  assert.equal(node.x, Math.ceil((tip.x + input.x) / 2 - 16), "x = centre - 16, rounded up");
  assert.equal(node.y, input.y - 21);
  assert.equal(node.config.direction, "left");
  assert.deepEqual(d.g.cables.find((wire) => wire.id === before.id), before, "A -> B is the wire it was");
  assert.ok(wireBetween(d.g, `${scene.id.b}.result`, `${node.id}.input`) && wireBetween(d.g, `${node.id}.output`, `${scene.id.a}.x`));
  assert.equal(d.g.cables.length, 3);
});

test("starting the wire at the input and ending it at the output gives the same node, place and wires", () => {
  const scene = incrementInLoop();
  const fromOutput = dragWire({ ...ED.inicial(), g: scene.g }, [scene.id.inc, "result"], [scene.id.inc, "x"]);
  const fromInput = dragWire({ ...ED.inicial(), g: scene.g }, [scene.id.inc, "x"], [scene.id.inc, "result"]);
  const shape = (g) => [feedbackNodes(g).map((node) => [node.x, node.y, node.dentro, node.config]), g.cables.map((wire) => [wire.de.puerto, wire.a.puerto, wire.codos]).sort()];
  assert.deepEqual(shape(fromInput.g), shape(fromOutput.g));
  assert.equal(feedbackNodes(fromInput.g).length, 1);
});

test("a closing wire that goes forwards gives an arrow right node with its arrow row on the sink's input row", () => {
  // B is left of A and below it, A feeds B; the closing wire B -> A goes right and up.
  const scene = builder();
  scene.loop("loop", "while-loop", 20, 20, 500, 300);
  scene.node("a", "increment", 300, 100, null, scene.id.loop);
  scene.node("b", "increment", 100, 200, null, scene.id.loop);
  scene.wire("a.result", "b.x");
  const d = dragWire({ ...ED.inicial(), g: scene.g }, [scene.id.b, "result"], [scene.id.a, "x"]);
  const [node] = feedbackNodes(d.g);
  const ends = D.extremos(d.g, CTX);
  const [tip, input] = [ends.get(`${scene.id.b}.result`), ends.get(`${scene.id.a}.x`)];
  assert.equal(node.config.direction, "right");
  assert.equal(node.y + 6, input.y, "the arrow row (y + 6) on the sink's input row (LabVIEW: A.y + 4 for a glyph whose terminals are on y + 10)");
  assert.equal(node.x, Math.ceil(tip.x + 0.3 * (input.x - tip.x) - 16), "centre 0.3 of the way (unverified: three samples, 0.24 to 0.31)");
  assert.ok(wireBetween(d.g, `${scene.id.b}.result`, `${node.id}.input`) && wireBetween(d.g, `${node.id}.output`, `${scene.id.a}.x`));
});

test("under the top of its loop the node goes below the terminals instead", () => {
  const placement = (innerTop) => insertionPlacement({ x: 198, y: 157 }, { x: 176, y: 157 }, innerTop);
  assert.deepEqual(placement(100), { x: 171, y: 136, direction: "left" }, "room above: row - 21");
  assert.equal(placement(136).y, 136, "just fitting stays above");
  assert.equal(placement(137).y, 167, "one pixel short: top = row + 10 (Q1 S7: the Increment's y + 20)");
  // Through the editor: an Increment 6 px from the top of its loop (the border is 6 px thick).
  const scene = builder();
  scene.loop("loop", "while-loop", 100, 100, 300, 150);
  scene.node("inc", "increment", 176, 100 + 6 + 9, null, scene.id.loop);
  const d = dragWire({ ...ED.inicial(), g: scene.g }, [scene.id.inc, "result"], [scene.id.inc, "x"]);
  const row = D.extremos(d.g, CTX).get(`${scene.id.inc}.x`).y;
  assert.equal(feedbackNodes(d.g)[0].y, row + 10, "returned below, with the wire routed below");
  // Not clamped to the border: a node whose top is 7 px under the loop's top edge stays above (Q1 S2).
  const near = builder();
  near.loop("loop", "while-loop", 100, 100, 300, 150);
  near.node("inc", "increment", 176, 100 + 7 + 21 - 11, null, near.id.loop);
  assert.equal(feedbackNodes(dragWire({ ...ED.inicial(), g: near.g }, [near.id.inc, "result"], [near.id.inc, "x"]).g)[0].y, 107);
});

test("a wire that closes no cycle, or one that joins two scopes, is the wire it always was", () => {
  const scene = builder();
  scene.loop("loop", "while-loop", 100, 100, 300, 150);
  scene.node("a", "increment", 150, 146, null, scene.id.loop);
  scene.node("b", "increment", 300, 146, null, scene.id.loop);
  const forwards = dragWire({ ...ED.inicial(), g: scene.g }, [scene.id.a, "result"], [scene.id.b, "x"]);
  assert.equal(feedbackNodes(forwards.g).length, 0);
  assert.equal(forwards.g.cables.length, 1);
  // Into a node that is not in the loop: it goes through a tunnel, as before.
  const outside = builder(forwards.g);
  outside.id = scene.id;
  outside.node("far", "increment", 500, 146);
  const crossing = dragWire({ ...ED.inicial(), g: outside.g }, [scene.id.b, "result"], [outside.id.far, "x"]);
  assert.equal(feedbackNodes(crossing.g).length, 0);
});

test("a wire into a Feedback Node's own input is not a cycle, so a node that feeds itself through one stays one node", () => {
  const scene = incrementInLoop();
  scene.node("fb", "feedback-node", 200, 120, null, scene.id.loop);
  scene.wire("fb.output", "inc.x");
  const d = dragWire({ ...ED.inicial(), g: scene.g }, [scene.id.inc, "result"], [scene.id.fb, "input"]);
  assert.equal(feedbackNodes(d.g).length, 1, "no second node");
  assert.ok(wireBetween(d.g, `${scene.id.inc}.result`, `${scene.id.fb}.input`));
});

test("the insertion is one step of undo", () => {
  const scene = incrementInLoop();
  const before = scene.g;
  const d = dragWire({ ...ED.inicial(), g: before }, [scene.id.inc, "result"], [scene.id.inc, "x"]);
  const history = H.registrar(H.nuevo(before), d.g, "Create Wire");
  assert.equal(feedbackNodes(H.deshacer(history).g).length, 0);
  assert.deepEqual(H.deshacer(history).g, before, "one undo gives the graph back as it was");
  assert.equal(feedbackNodes(H.rehacer(H.deshacer(history).h).g).length, 1);
  assert.equal(H.deshacer(H.deshacer(history).h), null, "and there was one step only");
});

// ——— The compiled result ———

/** A For Loop of `count` iterations with an Increment, its outputs collected by an indexing tunnel into an array indicator. */
function countingScene(count = 5) {
  const scene = builder();
  scene.loop("loop", "for-loop", 100, 100, 300, 150);
  scene.node("count", "const", 20, 60, { value: count, type: "i32" });
  const loopCount = scene.g.nodos.find((node) => node.tipo === "loop-count" && node.dentro === scene.id.loop);
  scene.id.loopCount = loopCount.id;
  scene.node("inc", "increment", 176, 146, null, scene.id.loop);
  const tunnel = Gr.crearTunel(scene.g, CAT, scene.id.loop, "out", 150);
  scene.g = Gr.fijarConfig(tunnel.g, tunnel.id, { indexado: true });
  scene.id.tunnel = tunnel.id;
  scene.node("shown", "arr-indicator", 450, 150, { type: { array: "i32" } });
  scene.wire("tunnel.y", "shown.value");
  scene.g = Gr.conectar(scene.g, CAT, { nodo: scene.id.count, puerto: "result", dir: "out" }, { nodo: scene.id.loopCount, puerto: "count", dir: "in" }).g;
  return scene;
}

/** The array the indicator `shown` of `g` is given, on a Run (a fresh memory unless `estado` is given). */
async function shownOn(g, shown, estado = {}) {
  const compiled = compilar(g, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  return (await ejecutar(compiled, {}, { estado }))[shown];
}

test("an Increment closed on itself by the wire tool counts 0, 1, 2, 3, 4 in a loop of 5", async () => {
  const scene = countingScene();
  let d = dragWire({ ...ED.inicial(), g: scene.g }, [scene.id.inc, "result"], [scene.id.inc, "x"]);
  const [node] = feedbackNodes(d.g);
  // The loop's output is the node's output, as in the measured diagram.
  d = { ...d, g: Gr.conectar(d.g, CAT, { nodo: node.id, puerto: "output", dir: "out" }, { nodo: scene.id.tunnel, puerto: "x", dir: "in" }).g };
  assert.deepEqual(await shownOn(d.g, scene.id.shown), [0, 1, 2, 3, 4]);
});

// ——— Replace with Feedback Node ———

/** q8's diagram: the constant 7 (or none) into a shift register, an Increment between its two sides, and the register's outputs collected. */
function shiftRegisterScene({ init = 7, count = 5 } = {}) { // init: null for none
  const scene = countingScene(count);
  const { loop, inc, tunnel } = scene.id;
  scene.g = Gr.borrar(scene.g, [inc]);
  scene.node("inc", "increment", 200, 135, null, loop);
  const pair = Gr.crearRegistro(scene.g, CAT, loop, 140);
  scene.g = ED.fijarBordes(pair.g, CAT);
  Object.assign(scene.id, { left: pair.izquierdo, right: pair.derecho });
  scene.wire("left.value", "inc.x");
  scene.wire("inc.result", "right.value");
  scene.wire("left.value", "tunnel.x");
  if (init !== null) {
    scene.node("init", "const", 20, 140, { value: init, type: "i32" });
    scene.wire("init.result", "left.init");
  }
  return scene;
}

const openMenuOf = (d, id) => ED.abrirMenu(d, D.menuDe(nodeOf(d.g, id), null, d.g, false, CAT), id, 5, 6, null);
const replaced = (g, id, row) => ED.orden(openMenuOf({ ...ED.inicial(), g }, id), row, CTX);

/** The rows of the open menu: id, label and greyed. */
function rowsOf(d) {
  const html = D.menuContextual(INV, { ...d.menu, x: 0, y: 0 }, ED.marcados(d, CTX), (text) => text.length * 6, ED.variantes(d, CTX));
  return [...html.matchAll(/class="item-menu([^"]*)" data-id="([^"]+)"[^>]*><span class="texto-menu"[^>]*>([^<]*)</g)].map((match) => ({ id: match[2], label: match[3], greyed: /hueco|desactivado/.test(match[1]) }));
}

test("Replace with Feedback Node on a shift register puts the node where LabVIEW does and rewires the pair's wires", async () => {
  const scene = shiftRegisterScene();
  const { left, right, loop } = scene.id;
  for (const side of [left, right]) {
    const row = rowsOf(openMenuOf({ ...ED.inicial(), g: scene.g }, side)).find((candidate) => candidate.id === SHIFT_REGISTER_ROW);
    assert.equal(row.label, "Replace with Feedback Node");
    assert.equal(row.greyed, false, "enabled on either shift register of a single-element pair");
    const done = replaced(scene.g, side, SHIFT_REGISTER_ROW);
    const [node] = feedbackNodes(done.g);
    assert.deepEqual([node.x, node.y], [Math.round((nodeOf(scene.g, left).x + nodeOf(scene.g, right).x) / 2 - 10), nodeOf(scene.g, left).y], "x = (left.x + right.x)/2 - 10, y = the registers' y; the same from either side");
    assert.deepEqual([node.config.direction, node.config.delay], ["left", 1]);
    assert.equal(node.dentro, loop);
    assert.equal(done.menu, null);
  }
  const { g } = replaced(scene.g, left, SHIFT_REGISTER_ROW);
  const [node] = feedbackNodes(g);
  assert.equal(g.nodos.some((candidate) => candidate.id === left || candidate.id === right), false, "the pair is gone");
  assert.ok(wireBetween(g, `${scene.id.inc}.result`, `${node.id}.input`), "the wire into the right register goes to the node's input");
  assert.ok(wireBetween(g, `${node.id}.output`, `${scene.id.inc}.x`) && wireBetween(g, `${node.id}.output`, `${scene.id.tunnel}.x`), "the left register's inner wires start at its output");
  assert.ok(wireBetween(g, `${scene.id.init}.result`, `${node.id}.initializer`), "the outer wire goes to the initializer");
  assert.equal(node.config.initializerLoopsOut, 1, "moved one loop out: its terminal is on the loop's border");
  assert.equal(g.cables.some((wire) => !Gr.conectado(wire)), false, "nothing broken");
  assert.equal(g.cables.some((wire) => wire.a.nodo === scene.id.tunnel && wire.de.nodo !== node.id), false);
  assert.deepEqual(await shownOn(g, scene.id.shown), [7, 8, 9, 10, 11], "the initializer 7: q8's [7..11], as before and as LabVIEW");
  assert.deepEqual(await shownOn(scene.g, scene.id.shown), [7, 8, 9, 10, 11]);
  // The initializer's wire survives the editor's repair: it crosses the loop's border with no tunnel of its own.
  assert.equal(ED.alojar(g, CTX, []).nodos.some((candidate) => candidate.tipo === "tunnel-in"), false);
  assert.deepEqual(D.extremos(g, CTX).get(`${node.id}.initializer`).x, nodeOf(g, loop).x, "drawn on the loop's left border");
});

test("with no wire on the register's outer side the initializer stays on the node, and a wire out of the right register is left broken", async () => {
  const scene = shiftRegisterScene({ init: null });
  const finalIndicator = scene.node("final", "indicator", 450, 80, { type: "i32" });
  const final = Gr.conectarCruzando(scene.g, CAT, { nodo: scene.id.right, puerto: "result", dir: "out" }, { nodo: finalIndicator, puerto: "value", dir: "in" });
  assert.equal(final.motivo, undefined);
  const start = ED.alojar(final.g, CTX, []);
  const { g } = replaced(start, scene.id.right, SHIFT_REGISTER_ROW);
  const [node] = feedbackNodes(g);
  assert.equal(node.config.initializerLoopsOut, 0, "unwired: it stays on the node");
  assert.equal(g.cables.some((wire) => wire.a.puerto === "initializer"), false);
  const broken = g.cables.filter((wire) => !Gr.conectado(wire));
  assert.equal(broken.length, 1, "final -> indicator is left one-ended");
  assert.ok(Gr.esSuelto(broken[0].de), "its source end is loose");
  assert.ok(Gr.tipos(g, CAT).cables.get(broken[0].id).roto, "and the type resolution calls it broken");
  const quiet = shiftRegisterScene({ init: null });
  assert.deepEqual(await shownOn(replaced(quiet.g, quiet.id.left, SHIFT_REGISTER_ROW).g, quiet.id.shown), [0, 1, 2, 3, 4], "no initializer: the type's default");
});

test("the replace is one step of undo", () => {
  const scene = shiftRegisterScene();
  const done = replaced(scene.g, scene.id.left, SHIFT_REGISTER_ROW);
  const history = H.registrar(H.nuevo(scene.g), done.g, "Replace with Feedback Node");
  assert.deepEqual(H.deshacer(history).g, scene.g);
  assert.equal(H.deshacer(H.deshacer(history).h), null, "one step");
});

// ——— Replace with Shift Register ———

const ROW = `${FEEDBACK_ROOT}.replace-with-shift-register`;

test("Replace with Shift Register on a Feedback Node puts the pair on the n-th loop and a round trip gives back the same places", async () => {
  const scene = shiftRegisterScene();
  const toNode = replaced(scene.g, scene.id.left, SHIFT_REGISTER_ROW).g;
  const [node] = feedbackNodes(toNode);
  const menu = openMenuOf({ ...ED.inicial(), g: toNode }, node.id);
  assert.equal(rowsOf(menu).find((row) => row.id === ROW).greyed, false, "enabled in a loop");
  const back = ED.orden(menu, ROW, CTX);
  assert.equal(feedbackNodes(back.g).length, 0);
  const [left, right] = ["shift-register-left", "shift-register-right"].map((type) => back.g.nodos.find((candidate) => candidate.tipo === type));
  const [oldLeft, oldRight] = [nodeOf(scene.g, scene.id.left), nodeOf(scene.g, scene.id.right)];
  assert.deepEqual([left.x, left.y, right.x, right.y, left.dentro, right.dentro], [oldLeft.x, oldLeft.y, oldRight.x, oldRight.y, oldLeft.dentro, oldRight.dentro], "Q5 a: the same places");
  const wires = (g, ids) => g.cables.map((wire) => `${ids[wire.de.nodo] ?? wire.de.nodo}.${wire.de.puerto}>${ids[wire.a.nodo] ?? wire.a.nodo}.${wire.a.puerto}`).sort();
  assert.deepEqual(wires(back.g, { [left.id]: "L", [right.id]: "R" }), wires(scene.g, { [scene.id.left]: "L", [scene.id.right]: "R" }), "the same wires");
  assert.deepEqual(await shownOn(back.g, scene.id.shown), [7, 8, 9, 10, 11]);
  assert.equal(back.menu, null);
  // One step of undo.
  assert.deepEqual(H.deshacer(H.registrar(H.nuevo(toNode), back.g, "Replace with Shift Register")).g, toNode);
});

test("Replace with Shift Register is greyed outside any loop, and puts a node with its initializer inside the loop on a broken wire", () => {
  const bare = builder();
  bare.node("fb", "feedback-node", 100, 100);
  const outside = openMenuOf({ ...ED.inicial(), g: bare.g }, bare.id.fb);
  assert.equal(rowsOf(outside).find((row) => row.id === ROW).greyed, true, "greyed outside a loop (Q5 c)");
  assert.equal(ED.orden(outside, ROW, CTX).g, bare.g, "and it does nothing");
  // Auto-inserted node, initializer wired from a constant INSIDE the loop (Q5 b): the wire is left dangling and the register's init unwired.
  const scene = incrementInLoop();
  const inserted = dragWire({ ...ED.inicial(), g: scene.g }, [scene.id.inc, "result"], [scene.id.inc, "x"]);
  const [node] = feedbackNodes(inserted.g);
  const inside = builder(inserted.g);
  inside.id = scene.id;
  inside.node("seven", "const", 120, 110, { value: 7, type: "i32" }, scene.id.loop);
  inside.id.fbNode = node.id;
  inside.wire("seven.result", "fbNode.initializer");
  const loop = nodeOf(inside.g, scene.id.loop);
  const done = replaced(inside.g, node.id, ROW);
  const [left, right] = ["shift-register-left", "shift-register-right"].map((type) => done.g.nodos.find((candidate) => candidate.tipo === type));
  assert.deepEqual([left.x, left.y, right.x, right.y], [loop.x, node.y, loop.x + loop.tam.ancho - 16, node.y], "the pair at the node's y, on the loop's two borders");
  assert.equal(feedbackNodes(done.g).length, 0);
  assert.ok(wireBetween(done.g, `${scene.id.inc}.result`, `${right.id}.value`) && wireBetween(done.g, `${left.id}.value`, `${scene.id.inc}.x`), "the Increment's wires go through the registers");
  const dangling = done.g.cables.filter((wire) => !Gr.conectado(wire));
  assert.equal(dangling.length, 1, "the constant's wire is left dangling");
  assert.deepEqual([dangling[0].de.nodo, Gr.esSuelto(dangling[0].a)], [inside.id.seven, true]);
  assert.equal(done.g.cables.some((wire) => wire.a.nodo === left.id && wire.a.puerto === "init"), false, "the register's initializer is unwired");
});

/** Two nested For Loops with a Feedback Node and an Increment in the inner one; the constant 10 wired from outside to the initializer. */
function nestedScene(loopsOut) {
  const scene = builder();
  scene.loop("outer", "for-loop", 100, 100, 400, 250);
  scene.loop("inner", "for-loop", 140, 140, 300, 160, scene.id.outer);
  scene.node("fb", "feedback-node", 250, 200, { initializerLoopsOut: loopsOut }, scene.id.inner);
  scene.node("inc", "increment", 330, 200, null, scene.id.inner);
  scene.node("ten", "const", 20, 200, { value: 10, type: "i32" });
  scene.wire("fb.output", "inc.x");
  scene.wire("inc.result", "fb.input");
  scene.g = ED.alojar(scene.g, CTX, []);
  const wired = Gr.conectar(scene.g, CAT, { nodo: scene.id.ten, puerto: "result", dir: "out" }, { nodo: scene.id.fb, puerto: "initializer", dir: "in" });
  scene.g = wired.motivo ? scene.g : wired.g;
  return scene;
}

test("moved out of two loops, the initializer's wire crosses no tunnel, and the pair goes on the outer loop with tunnels on the inner one", () => {
  const scene = builder();
  scene.loop("outer", "for-loop", 100, 100, 400, 250);
  scene.loop("inner", "for-loop", 140, 140, 300, 160, scene.id.outer);
  scene.node("fb", "feedback-node", 250, 200, { initializerLoopsOut: 2 }, scene.id.inner);
  scene.node("inc", "increment", 330, 200, null, scene.id.inner);
  scene.node("ten", "const", 20, 200, { value: 10, type: "i32" });
  scene.wire("fb.output", "inc.x");
  scene.wire("inc.result", "fb.input");
  // Drawn by the mouse from outside the two loops to the initializer moved out of both: one wire, with no tunnel on the way.
  const wired = dragWire({ ...ED.inicial(), g: scene.g }, [scene.id.ten, "result"], [scene.id.fb, "initializer"]);
  assert.equal(wired.g.nodos.some((node) => node.tipo === "tunnel-in"), false, "no tunnel");
  assert.ok(wireBetween(wired.g, `${scene.id.ten}.result`, `${scene.id.fb}.initializer`));
  assert.ok(wireBetween(ED.alojar(wired.g, CTX, []), `${scene.id.ten}.result`, `${scene.id.fb}.initializer`), "and the repair of the editor keeps it");
  const done = replaced(wired.g, scene.id.fb, ROW);
  const [left, right] = ["shift-register-left", "shift-register-right"].map((type) => done.g.nodos.find((candidate) => candidate.tipo === type));
  assert.deepEqual([left.dentro, right.dentro], [scene.id.outer, scene.id.outer], "the outer loop gets the pair (moved out twice)");
  const outer = nodeOf(done.g, scene.id.outer);
  assert.deepEqual([left.x, right.x, left.y], [outer.x, outer.x + outer.tam.ancho - 16, nodeOf(wired.g, scene.id.fb).y], "at the node's y");
  assert.ok(wireBetween(done.g, `${scene.id.ten}.result`, `${left.id}.init`), "the initializer goes to the register's outer side");
  const tunnels = done.g.nodos.filter((node) => node.tipo === "tunnel-in" || node.tipo === "tunnel-out");
  assert.deepEqual(tunnels.map((tunnel) => [tunnel.tipo, tunnel.dentro]).sort(), [["tunnel-in", scene.id.inner], ["tunnel-out", scene.id.inner]], "the inner loop gets a tunnel on each side");
  assert.equal(done.g.cables.some((wire) => !Gr.conectado(wire)), false);
  assert.deepEqual(Gr.tipos(done.g, CAT).ciclo, []);
});

test("moved out one loop of two, the initializer's terminal is on the inner loop and the pair goes there", () => {
  const scene = nestedScene(1);
  assert.equal(nodeOf(scene.g, scene.id.fb).config.initializerLoopsOut, 1);
  const done = replaced(scene.g, scene.id.fb, ROW);
  const [left] = ["shift-register-left"].map((type) => done.g.nodos.find((candidate) => candidate.tipo === type));
  assert.equal(left.dentro, scene.id.inner, "the first enclosing loop: n = 1");
});
