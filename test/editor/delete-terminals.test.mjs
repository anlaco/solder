// Deleting terminals, nodes, wires and tunnels, measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-15-delete-replace.md §A and §B; findings S13-#3, S13-#4,
// S11-#2, S11-#7, S10-#3 of docs/design/daq-plugin-findings.md).

import assert from "node:assert/strict";
import { test } from "node:test";

import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as Gr from "../../core/model/graph.mjs";
import * as H from "../../editor/src/block-diagram/undo-history.mjs";
import * as P from "../../editor/src/front-panel/front-panel.mjs";
import { CAT, INV } from "../helpers.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",");

const wireOf = (g, port) => g.cables.find((wire) => wire.de.puerto === port || wire.a.puerto === port);
const isBroken = (wire) => Gr.esSuelto(wire.de) !== Gr.esSuelto(wire.a);
const portOf = (node, port) => ({ nodo: node, puerto: port, dir: port === "result" || port === "y" ? "out" : "in" });

/** control -> Increment -> indicator on a plain diagram, the scratch of the measurement's section A. */
function controlIncrementIndicator() {
  let g = Gr.nuevo();
  const control = Gr.crearEnPanel(g, CAT, "control", 20, 100, "x");
  const increment = Gr.crearNodo(control.g, CAT, "increment", 200, 100);
  const indicator = Gr.crearEnPanel(increment.g, CAT, "indicator", 400, 100, "y");
  g = Gr.conectar(indicator.g, CAT, portOf(control.id, "result"), portOf(increment.id, "x")).g;
  g = Gr.conectar(g, CAT, portOf(increment.id, "result"), portOf(indicator.id, "value")).g;
  return { g, control: control.id, increment: increment.id, indicator: indicator.id };
}

/** The measurement's section B: a control outside, an input tunnel, Increment inside a While Loop, an output tunnel, an indicator. */
function loopWithTunnels() {
  let g = Gr.nuevo();
  const control = Gr.crearEnPanel(g, CAT, "control", 20, 100, "x");
  const loop = Gr.crearEstructura(control.g, CAT, "while-loop", 120, 40, 300, 200);
  const increment = Gr.crearNodo(ED.fijarBordes(loop.g, CAT), CAT, "increment", 230, 120);
  g = ED.alojar(increment.g, CTX, [increment.id]);
  const indicator = Gr.crearEnPanel(g, CAT, "indicator", 500, 100, "y");
  const inbound = Gr.conectarCruzando(indicator.g, CAT, portOf(control.id, "result"), portOf(increment.id, "x"));
  const outbound = Gr.conectarCruzando(inbound.g, CAT, portOf(increment.id, "result"), portOf(indicator.id, "value"));
  const [outsideIn, insideIn] = inbound.ids;
  const [insideOut, outsideOut] = outbound.ids;
  const tunnelIn = outbound.g.cables.find((wire) => wire.id === outsideIn).a.nodo;
  const tunnelOut = outbound.g.cables.find((wire) => wire.id === outsideOut).de.nodo;
  return { g: outbound.g, control: control.id, increment: increment.id, indicator: indicator.id, tunnelIn, tunnelOut, outsideIn, insideIn, insideOut, outsideOut };
}

const selectAndDelete = (g, ids) => ED.borrarSeleccion({ ...ED.inicial(), g, seleccion: ids }, CTX);
const hasNode = (g, id) => g.nodos.some((node) => node.id === id);

test("a click on the body of a control's or indicator's diagram terminal selects it, and Delete removes it with its panel object (S13-#3)", () => {
  const scene = controlIncrementIndicator();
  for (const id of [scene.control, scene.indicator]) {
    const node = scene.g.nodos.find((candidate) => candidate.id === id);
    const box = D.caja(node, CTX);
    const bodyCentre = { x: box.x + box.ancho / 2, y: box.y + box.alto / 2 };
    // The window resolves the hit from the zones drawn: the middle of the icon must not be a wiring zone.
    const zones = D.terminales(node, CTX).map((terminal) => terminal.zona);
    const inZone = zones.some((zone) => bodyCentre.x >= zone.x && bodyCentre.x < zone.x + zone.ancho && bodyCentre.y >= zone.y && bodyCentre.y < zone.y + zone.alto);
    assert.equal(inZone, false, `the middle of ${node.tipo} is body, not a wiring hot zone`);

    const target = { tipo: "nodo", id };
    let clicked = ED.pulsar({ ...ED.inicial(), g: scene.g }, CTX, target, bodyCentre);
    clicked = ED.soltar(clicked, CTX, target, bodyCentre);
    assert.deepEqual(clicked.seleccion, [id]);
    const deleted = ED.borrarSeleccion(clicked, CTX);
    assert.equal(hasNode(deleted.g, id), false, "terminal and panel object are the same node: both go");
    assert.equal(deleted.g.cables.filter(isBroken).length, 1, "its wire stays, with one loose end");
  }
});

test("a click on a control's wiring arrow still starts a wire, so a body click is the only thing that selects", () => {
  const scene = controlIncrementIndicator();
  const control = scene.g.nodos.find((node) => node.id === scene.control);
  const [terminal] = D.terminales(control, CTX);
  const arrow = { x: terminal.zona.x + terminal.zona.ancho / 2, y: terminal.zona.y + terminal.zona.alto / 2 };
  const target = { tipo: "terminal", nodo: control.id, puerto: "result", dir: "out" };
  const pressed = ED.pulsar({ ...ED.inicial(), g: scene.g }, CTX, target, arrow);
  assert.equal(pressed.accion?.tipo, "cablear");
  assert.deepEqual(pressed.seleccion, []);
});

test("a click on a numeric's text on the panel types in it and does not select it: as LabVIEW (S11-#2)", () => {
  // numeric-hover-selected.md §3: a single click in the value box of a control that is not selected puts the
  // caret after the text and the control stays unselected; its 4 px band selects it, and Delete then removes it.
  const scene = controlIncrementIndicator();
  const panel = P.inicial(scene.g);
  const node = scene.g.nodos.find((candidate) => candidate.id === scene.control);
  const box = P.caja(node);
  const inside = { x: box.x + box.ancho / 2, y: box.y + box.alto / 2 };
  const typing = P.pulsar(panel, CTX, { tipo: "casilla", id: node.id }, inside);
  assert.ok(typing.edicion, "the click starts typing");
  assert.deepEqual(typing.seleccion, []);
  const band = { x: box.x + 1, y: box.y + 1 };
  const selected = P.pulsar(panel, CTX, { tipo: "casilla", id: node.id }, band);
  assert.deepEqual(selected.seleccion, [node.id]);
  assert.equal(hasNode(P.borrarSeleccion(selected, ED.terminalPlacer(CTX)).g, node.id), false);
});

test("deleting a node leaves both its wires broken with one loose end; Ctrl+B removes them and Undo restores them (section A)", () => {
  const scene = controlIncrementIndicator();
  const deleted = selectAndDelete(scene.g, [scene.increment]);
  assert.equal(hasNode(deleted.g, scene.increment), false);
  assert.equal(deleted.g.cables.length, 2);
  assert.ok(deleted.g.cables.every(isBroken), "one loose end each");
  assert.ok(deleted.g.cables.every((wire) => [wire.de, wire.a].some((end) => end.nodo === scene.control || end.nodo === scene.indicator)), "still attached to the terminals that remain");

  const swept = ED.removeBrokenWires({ ...deleted, seleccion: [] }, CTX);
  assert.equal(swept.g.cables.length, 0, "Ctrl+B removes both");

  // Undo: the broken state first, then the intact one.
  const history = H.registrar(H.registrar(H.nuevo(scene.g), deleted.g), swept.g);
  const undone = H.deshacer(history);
  assert.deepEqual(undone.g.cables, deleted.g.cables, "Undo brings the broken wires back");
  assert.deepEqual(H.deshacer(undone.h).g.cables, scene.g.cables, "and the next Undo the intact ones");
});

test("deleting the control of a loop's input tunnel leaves its wire broken, the tunnel and the inner wire (section B)", () => {
  const scene = loopWithTunnels();
  const deleted = selectAndDelete(scene.g, [scene.control]);
  assert.ok(hasNode(deleted.g, scene.tunnelIn), "the tunnel stays");
  assert.ok(isBroken(deleted.g.cables.find((wire) => wire.id === scene.outsideIn)), "its outside wire is broken");
  const inner = deleted.g.cables.find((wire) => wire.id === scene.insideIn);
  assert.ok(inner && !isBroken(inner), "the inner wire stays intact");
});

test("deleting the node inside a loop: tunnels stay, outside wires intact, the input tunnel's inner wire disappears, the output tunnel's stays broken (section B)", () => {
  const scene = loopWithTunnels();
  const deleted = selectAndDelete(scene.g, [scene.increment]);
  assert.ok(hasNode(deleted.g, scene.tunnelIn) && hasNode(deleted.g, scene.tunnelOut), "both tunnels stay");
  const byId = (id) => deleted.g.cables.find((wire) => wire.id === id);
  assert.ok(byId(scene.outsideIn) && !isBroken(byId(scene.outsideIn)), "outside wire of the input tunnel intact");
  assert.ok(byId(scene.outsideOut) && !isBroken(byId(scene.outsideOut)), "outside wire of the output tunnel intact");
  assert.equal(byId(scene.insideIn), undefined, "the input tunnel's inner wire disappears completely");
  assert.ok(byId(scene.insideOut) && isBroken(byId(scene.insideOut)), "the output tunnel's inner wire stays broken");
});

test("a tunnel is not removed when no wire touches it any more (section B)", () => {
  const scene = loopWithTunnels();
  let g = Gr.borrar(scene.g, [scene.outsideIn]);
  g = Gr.borrar(g, [scene.insideIn]);
  assert.ok(hasNode(g, scene.tunnelIn), "the unwired tunnel stays");
  // The same through the editor's Delete on the selected wires.
  const throughEditor = selectAndDelete(selectAndDelete(scene.g, [scene.outsideIn]).g, [scene.insideIn]);
  assert.ok(hasNode(throughEditor.g, scene.tunnelIn));
  assert.equal(wireOf(throughEditor.g, "x") === undefined, false, "the output side keeps its wires");
});

test("a broken wire left by a delete is selected by a click on its segment and removed by Delete or by Ctrl+B on the selection (S10-#3)", () => {
  const scene = controlIncrementIndicator();
  const broken = selectAndDelete(scene.g, [scene.control]);
  const wire = broken.g.cables.find(isBroken);
  const segmentTarget = { tipo: "tramo", cable: wire.id, k: 0 };
  const selected = ED.soltar(ED.pulsar(broken, CTX, segmentTarget, { x: 0, y: 0 }), CTX, segmentTarget, { x: 0, y: 0 });
  assert.deepEqual(selected.seleccion, [`${wire.id}#0`]);
  assert.equal(ED.borrarSeleccion(selected, CTX).g.cables.some((candidate) => candidate.id === wire.id), false, "Delete removes it");
  assert.equal(ED.removeBrokenWires(selected, CTX).g.cables.some((candidate) => candidate.id === wire.id), false, "so does Ctrl+B");
});

// The wiring zone of a control's or indicator's terminal, measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-15-terminal-hot-zones.md §1, §2).

const zoneOf = (g, id) => D.terminales(g.nodos.find((node) => node.id === id), CTX)[0].zona;

test("a panel terminal wires by a 16 x 12 patch at its data side, 10 px inside and 6 px outside the edge, in both views", () => {
  const scene = controlIncrementIndicator();
  for (const compact of [false, true]) {
    let g = scene.g;
    if (compact) g = { ...g, nodos: g.nodos.map((node) => (node.id === scene.control || node.id === scene.indicator ? { ...node, vista: { compacto: true } } : node)) };
    for (const [id, dir] of [[scene.control, "out"], [scene.indicator, "in"]]) {
      const node = g.nodos.find((candidate) => candidate.id === id);
      const box = D.caja(node, CTX);
      const zone = zoneOf(g, id);
      assert.equal(box.ancho, compact ? 32 : 38);
      assert.equal(zone.ancho, 16);
      assert.equal(zone.alto, 12);
      assert.equal(zone.x, dir === "out" ? box.x + box.ancho - 10 : box.x - 6, "a control's patch sticks out to the right, an indicator's to the left");
      const arrow = D.terminales(node, CTX)[0].y;
      assert.ok(Math.abs(zone.y + zone.alto / 2 - arrow) <= 0.5, "centred on the arrow");
    }
  }
});

test("a selected panel terminal has no wiring zone: the rest of the icon and a press on it only select or move", () => {
  const scene = controlIncrementIndicator();
  const html = (selection) => D.contenido({ ...ED.inicial(), g: scene.g, seleccion: selection }, CTX, Gr.tipos(scene.g, CAT));
  const zonesOf = (page, id) => page.split(`<div class="terminal" data-nodo="${id}"`).length - 1;
  assert.equal(zonesOf(html([]), scene.control), 1);
  assert.equal(zonesOf(html([scene.control]), scene.control), 0, "selected: no zone");
  assert.equal(zonesOf(html([scene.control]), scene.indicator), 1, "the others keep theirs");
});
