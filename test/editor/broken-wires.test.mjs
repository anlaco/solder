// Broken wires with a loose end in the editor (DT-046), measured in LabVIEW 2026 Q3
// (labview-captures/broken-wires/REPORT.md): Delete leaves the wires broken, Cut takes them,
// they are drawn with dashes, one red cross and two arrowheads, Ctrl+B removes them, a loose
// end can be wired again, and the wire's menu and the Error list say what is wrong.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as DC from "../../editor/src/block-diagram/diagram-clipboard.mjs";
import * as DV from "../../editor/src/debugging/debug-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as EL from "../../editor/src/debugging/error-list.mjs";
import * as EM from "../../editor/src/window/edit-menu.mjs";
import * as Gr from "../../core/model/graph.mjs";
import * as H from "../../editor/src/block-diagram/undo-history.mjs";
import * as P from "../../editor/src/front-panel/front-panel.mjs";
import * as BW from "../../editor/src/block-diagram/broken-wire.mjs";
import { esHueco } from "../../editor/src/common/labview-inventory.mjs";
import { idsPintados } from "../../editor/src/window/window-view.mjs";
import { CAT, INV } from "../helpers.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",");
const BACKGROUND = { tipo: "fondo" };
const BLUE_I32 = "#0000ff";
const ORANGE_DBL = "#ff7f00";
const PINK_STRING = "#ff00ff";

/** The terminal of a node as the window resolves it, and its point. */
function terminal(d, id, port) {
  const node = d.g.nodos.find((candidate) => candidate.id === id);
  const found = D.terminales(node, CTX).find((candidate) => candidate.puerto === port);
  return [{ tipo: "terminal", nodo: id, puerto: port, dir: found.dir }, { x: found.x, y: found.y }];
}

function place(d, block, point) {
  d = ED.moverA(ED.coger(d, block), CTX, point);
  return ED.pulsar(d, CTX, BACKGROUND, point);
}

function wire(d, [fromTarget, fromPoint], [toTarget, toPoint]) {
  d = ED.pulsar(d, CTX, fromTarget, fromPoint);
  d = ED.moverA(d, CTX, toPoint);
  return ED.soltar(d, CTX, toTarget, toPoint);
}

function placeStructure(d, kind, corner, opposite) {
  d = ED.moverA(ED.coger(d, kind), CTX, corner);
  d = ED.pulsar(d, CTX, BACKGROUND, corner);
  d = ED.soltar(d, CTX, BACKGROUND, corner);
  d = ED.moverA(d, CTX, opposite);
  return ED.pulsar(d, CTX, BACKGROUND, opposite);
}

/** Two I32 constants wired to an Add whose result goes to an indicator on the diagram (like 12-wired.png). */
function addWithThreeWires() {
  let d = ED.inicial();
  d = place(d, "num-const", { x: 40, y: 40 });
  d = place(d, "num-const", { x: 40, y: 120 });
  d = place(d, "add", { x: 200, y: 80 });
  const indicatorPlaced = Gr.crearEnPanel(d.g, CAT, "indicator", 360, 80, "sum");
  d = { ...d, g: indicatorPlaced.g };
  const [const1, const2, add] = d.g.nodos.map((node) => node.id);
  const indicator = indicatorPlaced.id;
  d = wire(d, terminal(d, const1, "result"), terminal(d, add, "a"));
  d = wire(d, terminal(d, const2, "result"), terminal(d, add, "b"));
  d = wire(d, terminal(d, add, "result"), terminal(d, indicator, "value"));
  assert.equal(d.g.cables.length, 3);
  return { d: { ...d, seleccion: [] }, const1, const2, add, indicator };
}

const resolve = (d) => Gr.tipos(d.g, CAT);
const wireTo = (d, node, port) => d.g.cables.find((wire) => wire.a.nodo === node && wire.a.puerto === port);

test("Delete leaves the wires of a node broken, with the loose end where each terminal was, in one undo step", () => {
  const { d, const1, add, indicator } = addWithThreeWires();
  const places = ["a", "b"].map((port) => terminal(d, add, port)[1]);
  const outPlace = terminal(d, add, "result")[1];
  const selected = { ...d, seleccion: [add] };
  const deleted = ED.borrarSeleccion(selected, CTX);
  assert.deepEqual(deleted.g.nodos.map((node) => node.id).includes(add), false, "the node goes");
  assert.equal(deleted.g.cables.length, 3, "all three wires stay (13-delete-add.png)");
  const toIndicator = wireTo(deleted, indicator, "value");
  assert.deepEqual(toIndicator.de, { suelto: [outPlace.x, outPlace.y] }, "the loose end is where the Add output was");
  assert.deepEqual(deleted.g.cables.find((wire) => wire.de.nodo === const1).a, { suelto: [places[0].x, places[0].y] });
  const resolved = resolve(deleted);
  assert.ok(deleted.g.cables.every((wire) => resolved.cables.get(wire.id).roto), "each is broken");
  assert.equal(Gr.ejecutable(deleted.g, CAT, resolved), false);
  assert.deepEqual(deleted.seleccion, []);

  // One delete is one step of undo (14-undo.png).
  const history = H.registrar(H.nuevo(selected.g), deleted.g);
  assert.equal(history.antes.length, 1);
  assert.equal(H.deshacer(history).g.cables.every(Gr.conectado), true, "Ctrl+Z restores the node and its wires");
});

test("deleting a constant keeps its wire on the terminal that remains, loose at the constant", () => {
  const { d, const1, add } = addWithThreeWires();
  const edge = terminal(d, const1, "result")[1];
  const deleted = ED.borrarSeleccion({ ...d, seleccion: [const1] }, CTX);
  const kept = wireTo(deleted, add, "a");
  assert.deepEqual(kept.de, { suelto: [edge.x, edge.y] }, "15-delete-constant.png");
  assert.ok(Gr.conectado(wireTo(deleted, add, "b")), "the other wires are intact");
  assert.equal(resolve(deleted).cables.get(kept.id).roto, Gr.LOOSE_WIRE_REASONS.noSource);
});

test("deleting a loop takes its contents and tunnels, and the wires that crossed it stay broken", () => {
  let d = ED.inicial();
  d = place(d, "num-const", { x: 40, y: 200 });
  const sinkPlaced = Gr.crearEnPanel(d.g, CAT, "indicator", 600, 200, "sum");
  d = { ...d, g: sinkPlaced.g };
  const [source] = d.g.nodos.map((node) => node.id);
  const sink = sinkPlaced.id;
  d = placeStructure(d, "for-loop", { x: 200, y: 100 }, { x: 440, y: 320 });
  const loop = d.g.nodos.find((node) => node.tipo === "for-loop").id;
  d = place(d, "increment", { x: 280, y: 190 });
  const inner = d.seleccion[0];
  d = wire(d, terminal(d, source, "result"), terminal(d, inner, "x"));
  d = wire(d, terminal(d, inner, "result"), terminal(d, sink, "value"));
  assert.ok(d.g.nodos.some((node) => node.tipo === "tunnel-in") && d.g.nodos.some((node) => node.tipo === "tunnel-out"), "two tunnels were made");

  const deleted = ED.borrarSeleccion({ ...d, seleccion: [loop] }, CTX);
  assert.deepEqual(deleted.g.nodos.map((node) => node.id).sort(), [source, sink].sort(), "the loop, its tunnels and the increment go");
  assert.equal(deleted.g.cables.length, 2, "the wires to the rest stay (19-delete-loop.png)");
  const resolved = resolve(deleted);
  assert.ok(deleted.g.cables.every((wire) => resolved.cables.get(wire.id).roto && !Gr.conectado(wire)));
});

test("Cut takes the wires of the node and leaves nothing broken, while Delete does not", () => {
  const { d, add } = addWithThreeWires();
  const cut = DC.cutSelection({ ...d, seleccion: [add] });
  assert.equal(cut.d.g.cables.length, 0, "Ctrl+X takes the wires (measured)");
  assert.ok(cut.fragment.nodes.some((node) => node.id === add));
  assert.equal(ED.borrarSeleccion({ ...d, seleccion: [add] }, CTX).g.cables.length, 3, "Delete keeps them");
});

test("deleting a control on the front panel leaves its diagram wire broken at the terminal", () => {
  let g = Gr.nuevo();
  const control = Gr.crearEnPanel(g, CAT, "control", 20, 20, "x");
  const indicator = Gr.crearEnPanel(control.g, CAT, "indicator", 300, 20, "y");
  g = Gr.conectar(indicator.g, CAT, { nodo: control.id, puerto: "result", dir: "out" }, { nodo: indicator.id, puerto: "value", dir: "in" }).g;
  const diagram = { ...ED.inicial(), g };
  const [, terminalPoint] = terminal(diagram, control.id, "result");
  const afterDelete = P.borrarSeleccion({ ...P.inicial(g), seleccion: [control.id] }, ED.terminalPlacer(CTX));
  assert.equal(afterDelete.g.cables.length, 1, "the wire stays (panel-delete-control-diagram-leaves-broken-wire.png)");
  assert.deepEqual(afterDelete.g.cables[0].de, { suelto: [terminalPoint.x, terminalPoint.y] });
  assert.ok(afterDelete.g.cables[0].a.nodo, "still attached to the terminal that remains");
  assert.equal(H.registrar(H.nuevo(g), afterDelete.g).antes.length, 1, "one step");
});

test("a broken wire is drawn with 1 px dashes 4/4, one red cross and two arrowheads in the colours of its ends", () => {
  const { d, const1, add } = addWithThreeWires();
  const resolved = (graph) => Gr.tipos(graph, CAT);

  // Loose sink: the source's blue pointing downstream, then the cross, then black (REPORT §5: "blue ▶, cross, black ▶").
  const looseSink = ED.borrarSeleccion({ ...d, seleccion: [add] }, CTX).g;
  const sinkOnly = { ...looseSink, cables: looseSink.cables.filter((wire) => wire.de.nodo === const1) };
  const html = D.contenido({ ...ED.inicial(), g: sinkOnly }, CTX, resolved(sinkOnly));
  assert.equal(html.match(/class="cable-cruz"/g).length, 1, "ONE cross per broken wire");
  assert.match(html, /class="cable-roto"[^>]*stroke="#000000" stroke-width="1" stroke-dasharray="4 4"/);
  assert.match(html, new RegExp(`class="cable-cruz"[^>]*fill="${BW.CROSS_FILL}" stroke="#000000"`));
  const heads = [...html.matchAll(/class="cable-flecha" points="([^"]+)" fill="(#[0-9a-f]{6})"/g)];
  assert.deepEqual(heads.map((head) => head[2]), [BLUE_I32, BW.LOOSE_END_COLOR]);
  assert.match(html, /data-tip="[^"]*loose end/, "the tooltip carries the reason");

  // Loose source: black pointing back to the loose end, the cross, then the sink's colour (19: "black ◀ ✖ orange ▶").
  const fromAdd = { ...looseSink, cables: looseSink.cables.filter((wire) => wire.a.nodo !== undefined && Gr.esSuelto(wire.de)) };
  const htmlSource = D.contenido({ ...ED.inicial(), g: fromAdd }, CTX, resolved(fromAdd));
  const headsSource = [...htmlSource.matchAll(/class="cable-flecha" points="([^"]+)" fill="(#[0-9a-f]{6})"/g)];
  assert.deepEqual(headsSource.map((head) => head[2]), [BW.LOOSE_END_COLOR, ORANGE_DBL], "the colour of the indicator that is still there");
  const [backwards, forwards] = headsSource.map((head) => head[1].split(" ").map((pair) => pair.split(",").map(Number)));
  assert.ok(backwards[0][0] < backwards[1][0], "the tip of the first head is on the left of its base: it points to the loose source");
  assert.ok(forwards[0][0] > forwards[1][0], "the second head points right");
});

test("the marks of a broken wire have the measured geometry", () => {
  const horizontal = [[0, 50], [100, 50]];
  const marks = BW.brokenWireMarks(horizontal, { sourceColor: "#0000ff", sinkColor: null });
  const head = (index) => [...marks.marks.matchAll(/class="cable-flecha" points="([^"]+)"/g)][index][1].split(" ").map((pair) => pair.split(",").map(Number));
  const [upstream, downstream] = [head(0), head(1)];
  const xs = (points) => points.map(([x]) => x);
  const ys = (points) => points.map(([, y]) => y);
  assert.equal(Math.max(...xs(upstream)) - Math.min(...xs(upstream)), BW.HEAD_LENGTH, "5 px long");
  assert.equal(Math.max(...ys(upstream)) - Math.min(...ys(upstream)), BW.HEAD_WIDTH, "9 px across");
  assert.equal(Math.min(...xs(downstream)) - Math.max(...xs(upstream)), BW.CROSS_SIZE + 2, "the cross between them, 2 px of dash on one side");
  assert.deepEqual(BW.pathMiddle(horizontal), { x: 50, y: 50, direction: { x: 1, y: 0 } }, "at half the length of the path");
  // A vertical wire points down, as in 55-state.png: "blue ▼, cross, black ▼".
  const vertical = BW.brokenWireMarks([[10, 0], [10, 100]], { sourceColor: "#0000ff", sinkColor: null });
  const tips = [...vertical.marks.matchAll(/class="cable-flecha" points="([^ ]+) /g)].map((match) => match[1].split(",").map(Number));
  assert.ok(tips.every(([x, y]) => x === 10 && y > 0), "tips on the wire line");
  assert.ok(tips[0][1] < tips[1][1], "both point down: the first head is above the second");
  // The dashes run under the cross: the polyline comes first and is one for the whole path.
  assert.ok(marks.dashes.includes('stroke-dasharray="4 4"') && !marks.marks.includes("<polyline"));
});

/** An Add whose input `a` receives a String constant: a wire between types that do not match. */
function stringIntoAdd() {
  let g = Gr.nuevo();
  const add = Gr.crearNodo(g, CAT, "add", 200, 60);
  const text = Gr.crearNodo(add.g, CAT, "str-const", 40, 140);
  const joined = Gr.conectar(text.g, CAT, { nodo: text.id, puerto: "result", dir: "out" }, { nodo: add.id, puerto: "a", dir: "in" });
  assert.equal(joined.motivo, undefined, "LabVIEW lets you make the wire, and breaks it");
  return { d: { ...ED.inicial(), g: joined.g }, add: add.id };
}

test("a wire between types that do not match is drawn the same way, with both colours", () => {
  const { d } = stringIntoAdd();
  const html = D.contenido(d, CTX, resolve(d));
  assert.equal(html.match(/class="cable-cruz"/g).length, 1);
  assert.match(html, /class="cable-roto"/);
  const colours = [...html.matchAll(/class="cable-flecha"[^>]*fill="(#[0-9a-f]{6})"/g)].map((match) => match[1]);
  assert.deepEqual(colours, [PINK_STRING, ORANGE_DBL], "String ▶, cross, DBL ▶ (40-wiring-two-sources.png)");
});

test("Remove Broken Wires takes every broken wire or only those selected in one undo step", () => {
  const { d, const1, add } = addWithThreeWires();
  const broken = ED.borrarSeleccion({ ...d, seleccion: [add] }, CTX);
  const [wireA, wireB, wireC] = broken.g.cables;

  // With nothing selected: all of them (48-ctrlb-nothing-selected.png).
  const all = ED.removeBrokenWires({ ...broken, seleccion: [] }, CTX);
  assert.equal(all.g.cables.length, 0);
  assert.equal(H.registrar(H.nuevo(broken.g), all.g).antes.length, 1, "one step of undo");

  // A selection of a node does not take its wires (46-ctrlb-node-selected.png).
  const nodeSelected = ED.removeBrokenWires({ ...broken, seleccion: [const1] }, CTX);
  assert.equal(nodeSelected.g, broken.g, "nothing removed, nothing changes");

  // With wires selected: only those, even by one of their segments (45-after-ctrlb-selection.png).
  const some = ED.removeBrokenWires({ ...broken, seleccion: [wireA.id, `${wireB.id}#1`] }, CTX);
  assert.deepEqual(some.g.cables.map((wire) => wire.id), [wireC.id]);
  assert.deepEqual(some.seleccion, [], "what was removed is no longer selected");

  // Healthy wires are never taken, selected or not.
  const healthy = addWithThreeWires().d;
  assert.equal(ED.removeBrokenWires({ ...healthy, seleccion: healthy.g.cables.map((wire) => wire.id) }, CTX).g.cables.length, 3);

  // The Edit menu says which one it is (44-edit-menu-selection.png) and it is done.
  const row = "window.block-diagram.menu.edit.remove-broken-wires-from-selection";
  assert.ok(!esHueco(INV.resolver(row)));
  const noSelection = EM.editMenuVariants("block-diagram", { canUndo: true, canRedo: false, canCopy: false, hasSelection: false, clipboardFilled: false });
  assert.equal(noSelection.rotulos.get(row), "Remove Broken Wires");
  const withSelection = EM.editMenuVariants("block-diagram", { canUndo: true, canRedo: false, canCopy: true, hasSelection: true, clipboardFilled: false });
  assert.equal(withSelection.rotulos.has(row), false, "with a selection the label stays 'Remove Broken Wires from Selection'");
  assert.equal(INV.entrada(row).atajo, "Ctrl+B");
});

test("a click on a loose end and then on a terminal turns the broken wire into a normal one", () => {
  const { d, const1, const2, add } = addWithThreeWires();
  // Delete const1: its wire stays on Add.a with a loose source. Wire its end to const2's output: that is an
  // output, so it is accepted (the loose end is the source side).
  const broken = ED.borrarSeleccion({ ...d, seleccion: [const1] }, CTX);
  const brokenWire = wireTo(broken, add, "a");
  const looseZones = [...D.contenido(broken, CTX, resolve(broken)).matchAll(/class="extremo-suelto" data-cable="([^"]+)" data-extremo="(\w+)"/g)];
  assert.deepEqual(looseZones.map((match) => [match[1], match[2]]), [[brokenWire.id, "de"]], "one target per loose end, none at the terminal");

  let editing = ED.pulsar(broken, CTX, { tipo: "suelto", cable: brokenWire.id, extremo: "de" }, { x: 60, y: 60 });
  assert.equal(editing.accion.tipo, "recablear");
  editing = ED.soltar(editing, CTX, { tipo: "suelto", cable: brokenWire.id, extremo: "de" }, { x: 60, y: 60 });
  assert.ok(editing.accion, "a click without dragging goes on with the wire following the pointer");
  assert.match(D.contenido(editing, CTX, resolve(editing)), /class="cable-tirando"/, "the dotted wire in progress");
  const [target, point] = terminal(editing, const2, "result");
  editing = ED.pulsar(editing, CTX, target, point);
  assert.equal(editing.accion, null);
  assert.equal(editing.aviso, null);
  assert.equal(editing.g.cables.length, 3, "the wire was not duplicated");
  const rewired = wireTo(editing, add, "a");
  assert.deepEqual([rewired.de.nodo, rewired.de.puerto], [const2, "result"]);
  assert.ok(editing.g.cables.every(Gr.conectado));
  assert.equal(resolve(editing).cables.get(rewired.id).roto, null, "a normal wire again");
});

test("a loose sink is wired by dragging to a compatible input, and the same rules apply as for a new wire", () => {
  const { d, add, indicator } = addWithThreeWires();
  const broken = ED.borrarSeleccion({ ...d, seleccion: [indicator] }, CTX);
  const brokenWire = broken.g.cables.find((wire) => wire.de.nodo === add);
  assert.ok(Gr.esSuelto(brokenWire.a));

  // An output cannot be wired to the loose sink side: the wire stays broken and the reason is given.
  let attempt = ED.pulsar(broken, CTX, { tipo: "suelto", cable: brokenWire.id, extremo: "a" }, { x: 300, y: 80 });
  attempt = ED.moverA(attempt, CTX, { x: 330, y: 100 });
  const [outputTarget, outputPoint] = terminal(attempt, add, "result");
  attempt = ED.soltar(attempt, CTX, outputTarget, outputPoint);
  assert.ok(attempt.aviso?.texto, "the rule that refuses a normal wire refuses this one");
  assert.deepEqual(attempt.g.cables.find((wire) => wire.id === brokenWire.id), brokenWire, "the broken wire is untouched");

  // A new indicator: dragging from the loose end to its input makes it a normal wire.
  const created = Gr.crearEnPanel(broken.g, CAT, "indicator", 420, 200, "other");
  const withNew = { ...broken, g: created.g };
  let dragging = ED.pulsar(withNew, CTX, { tipo: "suelto", cable: brokenWire.id, extremo: "a" }, { x: 300, y: 80 });
  dragging = ED.moverA(dragging, CTX, { x: 430, y: 210 });
  const [inputTarget, inputPoint] = terminal(dragging, created.id, "value");
  dragging = ED.soltar(dragging, CTX, inputTarget, inputPoint);
  assert.equal(dragging.aviso, null);
  const done = dragging.g.cables.find((wire) => wire.de.nodo === add);
  assert.deepEqual([done.a.nodo, done.a.puerto], [created.id, "value"]);
  assert.ok(dragging.g.cables.every(Gr.conectado));

  // Esc gives the wire up halfway.
  const half = ED.pulsar(withNew, CTX, { tipo: "suelto", cable: brokenWire.id, extremo: "a" }, { x: 300, y: 80 });
  assert.equal(ED.escape(half).accion, null);
});

test("a wire without a source cannot be branched from", () => {
  const { d, const1, add } = addWithThreeWires();
  const broken = ED.borrarSeleccion({ ...d, seleccion: [const1] }, CTX);
  const brokenWire = wireTo(broken, add, "a");
  const [inputTarget, inputPoint] = terminal(broken, add, "b");
  let d2 = ED.pulsar(broken, CTX, inputTarget, inputPoint);
  d2 = ED.moverA(d2, CTX, { x: 100, y: 100 });
  const result = ED.soltar(d2, CTX, { tipo: "tramo", cable: brokenWire.id, k: 1 }, { x: 100, y: 100 });
  assert.ok(result.aviso?.texto, "the reason is shown instead of crashing");
});

test("the menu of a broken wire opens with List Errors and the Error list shows its reason", () => {
  const { d, const1, add } = addWithThreeWires();
  const healthyWire = wireTo(d, add, "a");
  const rows = (state) => idsPintados(D.menuContextual(INV, state.menu, ED.marcados(state), (text) => text.length * 7, ED.variantes(state, CTX))).map((id) => id.slice("context.wire.".length));

  const healthyMenu = ED.abrirMenu(d, ED.WIRE_MENU_ROOT, healthyWire.id, 0, 0, null, { x: 0, y: 0 });
  assert.ok(!rows(healthyMenu).includes("list-errors"), "a healthy wire has no List Errors");
  assert.ok(rows(healthyMenu).includes("clean-up-wire"));

  // Loose end (51-rc-loose.png): List Errors first, no Clean Up Wire, no Visible Items or probes, Add Breakpoint greyed.
  const broken = ED.borrarSeleccion({ ...d, seleccion: [const1] }, CTX);
  const brokenWire = wireTo(broken, add, "a");
  const looseMenu = ED.abrirMenu(broken, ED.WIRE_MENU_ROOT, brokenWire.id, 0, 0, null, { x: 0, y: 0 });
  const looseRows = rows(looseMenu).filter((id) => !id.includes("."));
  assert.deepEqual(looseRows.slice(0, 3), ["list-errors", "create-wire-branch", "delete-wire-branch"], "List Errors first");
  for (const absent of ["clean-up-wire", "visible-items", "add-probe", "custom-probe"]) assert.ok(!looseRows.includes(absent), absent);
  assert.deepEqual(looseRows.slice(-2), ["add-breakpoint", "description-and-tip"]);
  assert.ok(ED.variantes(looseMenu, CTX).desactivados.has("context.wire.add-breakpoint"));

  // Types that do not match (58-rc-mismatch.png): List Errors and Clean Up Wire.
  const { d: mismatchState, add: mismatchAdd } = stringIntoAdd();
  const mismatchWire = wireTo(mismatchState, mismatchAdd, "a");
  assert.ok(resolve(mismatchState).cables.get(mismatchWire.id).roto);
  const mismatchRows = rows(ED.abrirMenu(mismatchState, ED.WIRE_MENU_ROOT, mismatchWire.id, 0, 0, null, { x: 0, y: 0 })).filter((id) => !id.includes("."));
  assert.deepEqual(mismatchRows.slice(0, 2), ["list-errors", "clean-up-wire"]);

  // List Errors is a done row and the Error list has the wire with its reason under Block Diagram Errors.
  assert.ok(!esHueco(INV.resolver("context.wire.list-errors")));
  const listed = EL.collect({ graph: broken.g, catalog: CAT, resolved: resolve(broken), compileErrors: [], inventory: INV });
  const row = listed.find((candidate) => candidate.id === `wire.${brokenWire.id}`);
  assert.equal(row.text, `Wire: ${Gr.LOOSE_WIRE_REASONS.noSource}`);
  assert.deepEqual(row.target, { wire: brokenWire.id }, "Show Error frames the wire");
  assert.ok(row.details.includes("Remove Broken Wires"));
  assert.notEqual(row.details, listed.find((candidate) => candidate.id.startsWith("wire.") && candidate.id !== row.id)?.details ?? "", "the reasons are told apart");
  const html = DV.errorListWindow(INV, { rows: listed, state: { ...EL.initial(), selected: row.id }, viName: "Untitled 1", position: { x: 0, y: 0 } });
  assert.ok(html.includes("Block Diagram Errors") && html.includes(Gr.LOOSE_WIRE_REASONS.noSource));
  const overlay = DV.overlay(DS_INITIAL, broken.g, CTX, resolve(broken), { now: 0, errorFocus: row.target });
  assert.match(overlay, new RegExp(`class="dep-detenido-cable"[^>]*data-error-focus="${brokenWire.id}"`), "the frame follows the wire to its loose end");
});

import * as DS from "../../editor/src/debugging/debug-state.mjs";
const DS_INITIAL = DS.initial();
