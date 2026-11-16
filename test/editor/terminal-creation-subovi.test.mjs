// Create ▸ Constant and Control on the input of a subOVI call: the object is of the front-panel control's own class with
// its default value, and a ring input gives a Ring Constant with the control's items (finding B1, measured in LabVIEW
// 2026 Q3: labview-captures/reports/2026-11-16-create-constant.md). The OVIs are the DAQ add-on's own, read from
// addons/daq/1/ovi.lib/DAQ/ as the editor reads a subOVI.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { caja, contexto, glifosPorBloque, terminales } from "../../editor/src/block-diagram/diagram-view.mjs";
import { createForTerminal } from "../../editor/src/block-diagram/terminal-creation.mjs";
import { loadHierarchy } from "../../core/model/hierarchy.mjs";
import * as Gr from "../../core/model/graph.mjs";
import * as Poly from "../../core/model/polymorphic.mjs";
import { leer } from "../../core/model/qvi-format.mjs";
import { CAT, INV } from "../helpers.mjs";

const FOLDER = path.resolve("addons/daq/1/ovi.lib/DAQ");
const CALLER = "/caller/main.sdg";
const fileOf = (key) => path.join(FOLDER, path.posix.basename(key));
const resolvePath = (callerKey, stored) => path.posix.resolve(path.posix.dirname(callerKey), stored);

/** A caller with one call of `ovi` (a .sdg or a .sdp of the add-on), its hierarchy and the editor's context. */
function callerOf(ovi, config = {}) {
  const load = (rootGraph) =>
    loadHierarchy(CALLER, CAT, {
      resolvePath,
      loadVI: (key) => (key === CALLER ? rootGraph : leer(JSON.parse(readFileSync(fileOf(key), "utf8")), CAT)),
      loadPolymorphic: (key) => Poly.readPolymorphic(readFileSync(fileOf(key), "utf8")),
    });
  const placed = Gr.crearNodo(Gr.nuevo(), load(Gr.nuevo()).vis.get(CALLER).cat, "subvi", 400, 200);
  const g = Gr.fijarConfig(placed.g, placed.id, { vi: `../daq/${ovi}`, ...config });
  const { cat } = load(g).vis.get(CALLER);
  return { g, node: placed.id, ctx: contexto(cat, glifosPorBloque(INV), ",") };
}

const nodeIn = (g, id) => g.nodos.find((candidate) => candidate.id === id);
/** Create ▸ `kind` on the input `port` of the call. */
const create = (caller, port, kind) => createForTerminal(caller.g, caller.ctx, { nodo: caller.node, puerto: port, kind });

test("a constant on a numeric input holds the control's default, not 0, and sits right-aligned 8 px left of the node", () => {
  const timing = callerOf("DAQ Timing (Sample Clock).sdg");
  const rate = timing.ctx.cat.puertos(nodeIn(timing.g, timing.node)).in.find((port) => port.name === "control_1");
  assert.ok(rate, "Timing has a DBL rate input");
  const made = create(timing, rate.name, "constant");
  const constant = nodeIn(made.g, made.id);
  assert.equal(constant.tipo, "num-const");
  assert.equal(constant.config.value, rate.defaultValue);
  assert.notEqual(constant.config.value, 0);
  const [box, nodeBox] = [caja(constant, timing.ctx), caja(nodeIn(made.g, timing.node), timing.ctx)];
  assert.ok(Math.abs(nodeBox.x - (box.x + box.ancho) - 8) <= 0.5, "right edge 8 px before the node: the 8 px wire (the text's width is fractional)");
  const terminal = terminales(nodeIn(made.g, timing.node), timing.ctx).find((t) => t.puerto === rate.name);
  assert.ok(Math.abs(box.y + box.alto / 2 - terminal.y) <= 0.5, "centred on its terminal");
});

test("a constant on a ring input is a Ring Constant with the control's items, default and Allow Undefined Values", () => {
  const caller = callerOf("DAQ Start Trigger (Digital Edge).sdg");
  const ringPort = caller.ctx.cat.puertos(nodeIn(caller.g, caller.node)).in.find((port) => port.defaultValue === 10280);
  assert.ok(ringPort, "the edge input");
  const made = create(caller, ringPort.name, "constant");
  const constant = nodeIn(made.g, made.id);
  assert.equal(constant.tipo, "ring-const");
  assert.deepEqual(constant.config.items, [{ text: "Rising", value: 10280 }, { text: "Falling", value: 10171 }]);
  assert.equal(constant.config.value, 10280);
  assert.equal(constant.config.type, "i32");
  assert.equal(constant.config["allow-undefined"], false);
  assert.ok(made.wired);
});

test("a Ring Constant with long items keeps the node's left edge 8 px clear: it grows to the left", () => {
  const caller = callerOf("DAQ Timing (Sample Clock).sdg");
  const ports = caller.ctx.cat.puertos(nodeIn(caller.g, caller.node)).in;
  // The sample mode ring (cell 1) is on the node's top edge, so the wire does not come from the left: the active edge is.
  const [wideRing, edge] = [ports.find((port) => port.defaultValue === 10178), ports.find((port) => port.defaultValue === 10280)];
  const mode = create(caller, wideRing.name, "constant");
  assert.equal(nodeIn(mode.g, mode.id).config.items.length, 3);
  assert.equal(nodeIn(mode.g, mode.id).config.value, 10178);
  const made = create(caller, edge.name, "constant");
  const [box, nodeBox] = [caja(nodeIn(made.g, made.id), caller.ctx), caja(nodeIn(made.g, caller.node), caller.ctx)];
  assert.ok(box.x + box.ancho <= nodeBox.x - 8 + 0.5, "never overlaps the node");
});

test("a control on a ring input is a ring control with the items, the default and the style of the callee's", () => {
  const caller = callerOf("DAQ Start Trigger (Digital Edge).sdg");
  const ringPort = caller.ctx.cat.puertos(nodeIn(caller.g, caller.node)).in.find((port) => port.defaultValue === 10280);
  const made = create(caller, ringPort.name, "control");
  const control = nodeIn(made.g, made.id);
  assert.equal(control.tipo, "control");
  assert.equal(control.config.style, "text-ring");
  assert.deepEqual(control.config.items, [{ text: "Rising", value: 10280 }, { text: "Falling", value: 10171 }]);
  assert.equal(control.config.value, 10280);
});

test("through a polymorphic OVI the constant is made from the selected instance's controls", () => {
  const poly = (instance) => callerOf("DAQ Trigger.sdp", { instance, selected: instance, selector: true });
  const edgeOf = (caller) => caller.ctx.cat.puertos(nodeIn(caller.g, caller.node)).in.find((port) => port.defaultValue === 10280);
  const digitalEdge = poly(1);
  const made = create(digitalEdge, edgeOf(digitalEdge).name, "constant");
  assert.equal(nodeIn(made.g, made.id).tipo, "ring-const");
  assert.equal(nodeIn(made.g, made.id).config.items.length, 2);
});
