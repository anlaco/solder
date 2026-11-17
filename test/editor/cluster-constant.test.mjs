// A Cluster Constant on the Block Diagram (DT-095, stage c). Sizes, colours and rules are those measured in LabVIEW 2026 Q3:
// labview-captures/reports/2026-11-17-cluster-constant-geometry.md and -elements.md (local evidence, never committed). What
// was not measured says "unverified".

import assert from "node:assert/strict";
import { test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { aTexto, leer } from "../../core/model/qvi-format.mjs";
import { setClusterElements } from "../../core/model/user-cluster.mjs";
import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as CC from "../../editor/src/block-diagram/cluster-constant.mjs";
import { MEASURES, clusterBox, interiorBox } from "../../editor/src/block-diagram/cluster-constant-geometry.mjs";
import * as H from "../../editor/src/block-diagram/undo-history.mjs";
import { graphAtRest } from "../../editor/src/common/labels.mjs";
import { CAT, INV } from "../helpers.mjs";
import { oldSchoolToken } from "./old-school-theme.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",");
const FONDO = { tipo: "fondo" };
const entry = () => INV.entrada("palette.functions.programming.cluster-class-and-variant.cluster-constant");

/** Take a block from the palette, carry it to `point` and click, as the editor does. */
function place(d, block, point, config) {
  const carried = ED.moverA(ED.coger(d, block, config), CTX, point);
  return ED.pulsar(carried, CTX, FONDO, point);
}
const placeCluster = (d, point) => place(d, entry().bloque, point, entry().config);

/** Type `text` into what is being typed into and confirm it. */
function type(d, text) {
  const typed = [...text].reduce((state, key) => ED.teclear(state, key), d);
  return ED.confirmar(typed, CTX);
}

/** A diagram with an empty cluster whose frame is (200, 200, 100, 100): its interior starts at (203, 203). */
function diagramWithCluster() {
  const d = placeCluster(ED.inicial(), { x: 250, y: 250 });
  return { d, cluster: d.g.nodos[0] };
}
const clusterOf = (d) => d.g.nodos.find((node) => node.tipo === "cluster-constant");
const elementsOf = (d) => clusterOf(d).config.elements;
const freeConstants = (d) => d.g.nodos.filter((node) => node.tipo !== "cluster-constant");
const html = (d, selected = []) => D.contenido({ ...d, seleccion: selected }, CTX, Gr.tipos(d.g, CAT));
const elementId = (d, index) => `${clusterOf(d).id}.elements.${index}`;

/** Press on an element, drag the pointer to `to` and let go. */
function dragElement(d, index, from, to) {
  const pressed = ED.pulsar(d, CTX, { tipo: "nodo", id: elementId(d, index) }, from);
  return ED.soltar(ED.moverA(pressed, CTX, to), CTX, FONDO, to);
}

test("the Cluster Constant of the Cluster, Class & Variant palette drops a 100 x 100 frame with no elements", () => {
  assert.equal(entry().estado, "built");
  assert.deepEqual([entry().bloque, entry().config], ["cluster-constant", { elements: [] }]);
  const { d, cluster } = diagramWithCluster();
  assert.deepEqual(cluster.config.elements, []);
  assert.deepEqual(cluster.config.type, { cluster: [] }, "its type follows its elements, none yet");
  const box = D.caja(cluster, CTX);
  assert.deepEqual([box.ancho, box.alto], [100, 100], "report geometry Q3: the empty constant is 100 x 100");
  assert.equal(cluster.label, undefined, "no label is shown");
  assert.deepEqual([box.x, box.y], [200, 200], "dropped by its centre (unverified)");
  assert.deepEqual(interiorBox(box), { x: 203, y: 203, ancho: 94, alto: 94 }, "the interior starts after the two frame lines and the white between");
  assert.match(html(d), /class="cc-interior" style="left:3px;top:3px;width:94px;height:94px"/);
});

test("the frame is two 1 px lines round a white interior, brown for numbers only or none and magenta otherwise", () => {
  assert.deepEqual([oldSchoolToken("--cluster-constant-frame"), oldSchoolToken("--cluster-constant-frame-mixed"), oldSchoolToken("--cluster-constant-interior")], ["#993300", "#ff00ff", "#ffffff"]);
  const frameOf = (d, selected) => html(d, selected).match(/class="cc-frame( cc-mixed)?"[^>]*><div class="cc-line">/);
  let { d } = diagramWithCluster();
  assert.equal(frameOf(d)[1], undefined, "empty: brown");
  d = place(d, "num-const", { x: 250, y: 250 });
  d = ED.confirmar(d, CTX);
  assert.equal(frameOf(d)[1], undefined, "numbers only: brown");
  assert.equal(frameOf(d, [clusterOf(d).id])[1], undefined, "selection does not change the colour (Q5)");
  const withBoolean = place(d, "bool-const", { x: 280, y: 280 });
  assert.equal(frameOf(withBoolean)[1], " cc-mixed", "Numeric and Boolean: magenta");
  const stringOnly = ED.confirmar(place(diagramWithCluster().d, "str-const", { x: 250, y: 250 }), CTX);
  assert.equal(frameOf(stringOnly)[1], " cc-mixed", "String only: magenta");
  const booleanOnly = place(diagramWithCluster().d, "bool-const", { x: 250, y: 250 });
  assert.equal(frameOf(booleanOnly)[1], " cc-mixed", "Boolean only: magenta");
});

test("a constant whose centre lands inside the interior becomes an element, centred on the drop point and never pushed in", () => {
  let { d } = diagramWithCluster();
  d = place(d, "num-const", { x: 250, y: 250 });
  assert.equal(freeConstants(d).length, 0, "it is no free constant any more");
  assert.deepEqual(elementsOf(d).map((element) => element.tipo), ["num-const"]);
  const box = CC.elementBox(d.g, CTX, elementId(d, 0));
  assert.deepEqual([box.x + Math.floor(box.ancho / 2), box.y + Math.floor(box.alto / 2)], [250, 250], "report Q3: the box is centred on the drop point");
  assert.deepEqual(d.seleccion, [elementId(d, 0)]);
  assert.equal(d.edicion.nodo, elementId(d, 0), "it is in text edit, as a free constant is after its drop");
  assert.deepEqual(D.contenido({ ...ED.confirmar(d, CTX) }, CTX, Gr.tipos(d.g, CAT)).includes("cc-frame"), true);
  // Next to the frame it is clipped, not pushed in: its box starts left of the interior.
  let near = place(diagramWithCluster().d, "num-const", { x: 204, y: 204 });
  near = ED.confirmar(near, CTX);
  const nearBox = CC.elementBox(near.g, CTX, elementId(near, 0));
  assert.ok(nearBox.x < 203 && nearBox.y < 203, "it overhangs the interior, which clips it");
  assert.ok(elementsOf(near)[0].x < 0, "the place is relative to the interior and negative");
});

test("a drop on the frame lines or outside stays a free constant", () => {
  const drops = [[201, 250, "on the left line"], [250, 202, "on the top line, the second line"], [299, 250, "on the right line"], [150, 150, "outside"]];
  for (const [x, y, where] of drops) {
    const { d } = diagramWithCluster();
    const dropped = place(d, "num-const", { x, y });
    assert.deepEqual(elementsOf(dropped), [], where);
    assert.equal(freeConstants(dropped).length, 1, where);
  }
  const insideEdge = place(diagramWithCluster().d, "num-const", { x: 203, y: 203 });
  assert.equal(elementsOf(insideEdge).length, 1, "the first pixel of the interior is inside");
});

test("elements are appended in drop order, also when dropped over another element, and the type and value follow", () => {
  let { d } = diagramWithCluster();
  d = ED.confirmar(place(d, "num-const", { x: 250, y: 230 }), CTX);
  d = type(place(d, "str-const", { x: 250, y: 270 }), "a");
  d = ED.confirmar(place(d, "bool-const", { x: 250, y: 232 }), CTX);
  assert.deepEqual(elementsOf(d).map((element) => element.tipo), ["num-const", "str-const", "bool-const"], "the third one fell over the first (report elements Q8)");
  assert.deepEqual(clusterOf(d).config.type, { cluster: [{ name: "", type: "i32" }, { name: "", type: "string" }, { name: "", type: "boolean" }] });
  assert.deepEqual(clusterOf(d).config.value, [0, "a", false]);
});

test("a constant dragged into the interior becomes an element with its value, and its wire keeps a loose end", () => {
  let { d } = diagramWithCluster();
  const created = Gr.crearNodo(d.g, CAT, "num-const", 500, 100);
  let g = Gr.fijarValor(created.g, created.id, 7);
  const sink = Gr.crearEnPanel(g, CAT, "indicator", 20, 20, "Out");
  g = Gr.conectar(sink.g, CAT, { nodo: created.id, puerto: "result", dir: "out" }, { nodo: sink.id, puerto: "value", dir: "in" }).g;
  d = { ...d, g };
  const box = D.caja(g.nodos.find((n) => n.id === created.id), CTX);
  const press = { x: box.x + 3, y: box.y + 3 };
  const target = { x: 250, y: 250 };
  const dragging = ED.moverA(ED.pulsar(d, CTX, { tipo: "nodo", id: created.id }, press), CTX, target);
  const terminal = D.terminales(dragging.g.nodos.find((n) => n.id === created.id), CTX)[0];
  d = ED.soltar(dragging, CTX, FONDO, target);
  assert.equal(g.nodos.some((n) => n.id === created.id) && d.g.nodos.some((n) => n.id === created.id), false, "the free constant is gone");
  assert.deepEqual([elementsOf(d)[0].tipo, elementsOf(d)[0].config.value], ["num-const", 7], "it keeps its value");
  assert.equal(d.g.cables.length, 1, "its wire is not deleted");
  assert.ok(Gr.esSuelto(d.g.cables[0].de), "it has a loose end where the terminal was");
  assert.deepEqual(d.g.cables[0].de.suelto, [terminal.x, terminal.y], "where the terminal was when it was let go");
  assert.deepEqual(d.g.cables[0].a, { nodo: sink.id, puerto: "value" }, "the other end stays");
});

test("a constant dragged so that its centre stays outside the interior is only moved", () => {
  let { d } = diagramWithCluster();
  d = ED.confirmar(place(d, "num-const", { x: 100, y: 100 }), CTX);
  const [constant] = freeConstants(d);
  const box = D.caja(constant, CTX);
  const pressed = ED.pulsar(d, CTX, { tipo: "nodo", id: constant.id }, { x: box.x + 2, y: box.y + 2 });
  const moved = ED.soltar(ED.moverA(pressed, CTX, { x: 190, y: 250 }), CTX, FONDO, { x: 190, y: 250 });
  assert.deepEqual(elementsOf(moved), []);
  assert.equal(freeConstants(moved).length, 1);
});

test("a press on an element selects the element alone, and a double click types its value", () => {
  let { d } = diagramWithCluster();
  d = ED.confirmar(place(d, "num-const", { x: 250, y: 250 }), CTX);
  const pressed = ED.pulsar({ ...d, seleccion: [clusterOf(d).id] }, CTX, { tipo: "nodo", id: elementId(d, 0) }, { x: 250, y: 250 });
  assert.deepEqual(pressed.seleccion, [elementId(d, 0)], "alone (report elements Q4)");
  assert.match(html(pressed, pressed.seleccion), /class="nodo seleccionado editable" data-nodo="n1\.elements\.0"/, "drawn selected as a free constant is");
  const released = ED.soltar(pressed, CTX, FONDO, { x: 250, y: 250 });
  const typing = ED.editar(released, CTX, elementId(d, 0));
  assert.deepEqual([typing.edicion.nodo, typing.edicion.todo], [elementId(d, 0), true], "with its text selected");
  const typed = type(typing, "7");
  assert.equal(elementsOf(typed)[0].config.value, 7, "report elements Q1: type 7, click outside: 7");
  assert.equal(typed.edicion, null);
  // A number with decimals turns the integer constant into a DBL one, as for a free constant.
  const decimal = type(ED.editar(typed, CTX, elementId(d, 0)), "2.5");
  assert.deepEqual([elementsOf(decimal)[0].config.value, elementsOf(decimal)[0].config.type], [2.5, "number"]);
  assert.deepEqual(clusterOf(decimal).config.type, { cluster: [{ name: "", type: "number" }] });
  // What is not a number leaves it as it was.
  assert.equal(elementsOf(type(ED.editar(typed, CTX, elementId(d, 0)), "x")).at(0).config.value, 7);
});

test("a string element is typed into and a Boolean element toggles with its click", () => {
  let { d } = diagramWithCluster();
  d = type(place(d, "str-const", { x: 250, y: 230 }), "hi");
  d = ED.confirmar(place(d, "bool-const", { x: 250, y: 270 }), CTX);
  assert.equal(elementsOf(d)[0].config.value, "hi");
  const retyped = type(ED.editar(d, CTX, elementId(d, 0)), "yo");
  assert.equal(elementsOf(retyped)[0].config.value, "yo");
  const box = CC.elementBox(d.g, CTX, elementId(d, 1));
  const point = { x: box.x + 2, y: box.y + 2 };
  const clicked = ED.soltar(ED.pulsar(d, CTX, { tipo: "nodo", id: elementId(d, 1) }, point), CTX, FONDO, point);
  assert.equal(elementsOf(clicked)[1].config.value, true, "a click toggles it, as a free Boolean constant");
  assert.ok(!ED.editar(clicked, CTX, elementId(d, 1)).edicion, "it is not typed into");
  assert.deepEqual(clusterOf(clicked).config.value, ["hi", true], "the cluster's value follows");
});

test("Delete takes the selected element out of the cluster", () => {
  let { d } = diagramWithCluster();
  d = ED.confirmar(place(d, "num-const", { x: 230, y: 230 }), CTX);
  d = type(place(d, "str-const", { x: 270, y: 270 }), "a");
  const selected = ED.pulsar(d, CTX, { tipo: "nodo", id: elementId(d, 0) }, { x: 230, y: 230 });
  const deleted = ED.borrarSeleccion(ED.soltar(selected, CTX, FONDO, { x: 230, y: 230 }), CTX);
  assert.deepEqual(elementsOf(deleted).map((element) => element.tipo), ["str-const"]);
  assert.deepEqual(clusterOf(deleted).config.type, { cluster: [{ name: "", type: "string" }] }, "the type shrinks");
  assert.deepEqual(deleted.seleccion, []);
  assert.equal(deleted.g.nodos.length, 1, "no free constant is left behind");
});

test("Delete of two elements of one cluster takes out those two and keeps the third", () => {
  let { d } = diagramWithCluster();
  d = ED.confirmar(place(d, "num-const", { x: 220, y: 220 }), CTX);
  d = type(place(d, "str-const", { x: 250, y: 250 }), "a");
  d = place(d, "bool-const", { x: 280, y: 280 });
  const deleted = ED.borrarSeleccion({ ...d, seleccion: [elementId(d, 0), elementId(d, 1)], edicion: null, accion: null }, CTX);
  assert.deepEqual(elementsOf(deleted).map((element) => element.tipo), ["bool-const"]);
});

test("an element dragged out becomes a free constant with its value, and one dragged inside moves", () => {
  let { d } = diagramWithCluster();
  d = ED.confirmar(place(d, "num-const", { x: 230, y: 230 }), CTX);
  d = type(place(d, "str-const", { x: 270, y: 270 }), "a");
  d = type(ED.editar(d, CTX, elementId(d, 0)), "5");
  const frameBefore = clusterBox(clusterOf(d));
  const stringBefore = elementsOf(d)[1];
  const out = dragElement(d, 0, { x: 230, y: 230 }, { x: 400, y: 400 });
  assert.deepEqual(elementsOf(out).map((element) => element.tipo), ["str-const"]);
  const [free] = freeConstants(out);
  assert.deepEqual([free.tipo, free.config.value], ["num-const", 5], "the value is kept (report elements Q3)");
  assert.deepEqual(clusterOf(out).config.type, { cluster: [{ name: "", type: "string" }] }, "the cluster's type shrinks");
  assert.deepEqual(clusterBox(clusterOf(out)), frameBefore, "the frame does not move");
  assert.deepEqual(elementsOf(out)[0], stringBefore, "nor do the other elements");
  const inside = dragElement(d, 0, { x: 230, y: 230 }, { x: 240, y: 235 });
  assert.equal(freeConstants(inside).length, 0);
  assert.deepEqual([elementsOf(inside)[0].x - elementsOf(d)[0].x, elementsOf(inside)[0].y - elementsOf(d)[0].y], [10, 5], "moved within");
  // Let go over another cluster's interior, it becomes that one's element.
  let two = placeCluster(d, { x: 600, y: 250 });
  two = dragElement(two, 0, { x: 230, y: 230 }, { x: 600, y: 250 });
  const [first, second] = two.g.nodos.filter((node) => node.tipo === "cluster-constant");
  assert.deepEqual([first.config.elements.length, second.config.elements.length], [1, 1]);
});

test("moving the cluster moves its elements with it", () => {
  let { d } = diagramWithCluster();
  d = ED.confirmar(place(d, "num-const", { x: 250, y: 250 }), CTX);
  const before = CC.elementBox(d.g, CTX, elementId(d, 0));
  const pressed = ED.pulsar(d, CTX, { tipo: "nodo", id: clusterOf(d).id }, { x: 201, y: 250 });
  const moved = ED.soltar(ED.moverA(pressed, CTX, { x: 241, y: 270 }), CTX, FONDO, { x: 241, y: 270 });
  const after = CC.elementBox(moved.g, CTX, elementId(moved, 0));
  assert.deepEqual([after.x - before.x, after.y - before.y], [40, 20]);
  assert.deepEqual(elementsOf(moved), elementsOf(d), "their place relative to the interior is unchanged");
});

test("the output terminal is at the right edge, in the middle row", () => {
  const { d, cluster } = diagramWithCluster();
  const [terminal] = D.terminales(cluster, CTX);
  assert.deepEqual([terminal.puerto, terminal.dir, terminal.x, terminal.y], ["result", "out", 300, 250], "report Q1: 50 below the top for 100 tall");
  const tall = { ...cluster, tam: { ancho: 100, alto: 203 } };
  assert.equal(D.terminales(tall, CTX)[0].y, 200 + 101, "floor(203 / 2) = 101");
  // Drawn only while the pointer hovers the frame: not for being selected, not over the interior.
  const glyph = /class="cc-terminal-glyph"/;
  assert.doesNotMatch(html(d), glyph);
  assert.doesNotMatch(html(d, [cluster.id]), glyph, "selected is not enough");
  assert.match(html({ ...d, sobre: { nodo: cluster.id } }), glyph, "hovering the frame shows it");
  const withString = type(place(d, "str-const", { x: 250, y: 250 }), "a");
  assert.match(html({ ...withString, sobre: { nodo: cluster.id } }), /class="cc-terminal-glyph cc-mixed"/, "the ring takes the magenta frame's colour");
  assert.equal(ED.sobrevolar(d, FONDO).sobre, null, "over the interior the pointer is over the diagram");
  // A wire from there is the cluster's: 3 px, the type's colour, from the right edge.
  let g = Gr.crearEnPanel(d.g, CAT, "cluster-indicator", 600, 50, "Out", { elements: [] }).g;
  const sink = g.nodos.at(-1);
  g = Gr.conectar(g, CAT, { nodo: cluster.id, puerto: "result", dir: "out" }, { nodo: sink.id, puerto: "value", dir: "in" }).g;
  assert.equal(g.cables.length, 1);
  assert.match(html({ ...d, g }).match(/<g class="cable[^>]*>(.*?)<\/g>/)[1], /stroke="#993300" stroke-width="3"/);
});

/** Press handle `side` of the selected cluster at `from` and drag to `to`. */
function resize(d, side, from, to) {
  const selected = { ...d, seleccion: [clusterOf(d).id] };
  const pressed = ED.pulsar(selected, CTX, { tipo: "asa", nodo: clusterOf(d).id, lado: side }, from);
  return ED.soltar(ED.moverA(pressed, CTX, to), CTX, FONDO, to);
}

test("the eight handles show only while selected, 6 x 6 inside the frame's bounds", () => {
  const { d, cluster } = diagramWithCluster();
  assert.doesNotMatch(html(d), /data-asa=/);
  const handles = [...html(d, [cluster.id]).matchAll(/data-asa="(\w+)" style="left:([\d.]+)px;top:([\d.]+)px"/g)].map((match) => [match[1], Number(match[2]), Number(match[3])]);
  assert.deepEqual(handles, [["nw", 0, 0], ["n", 47, 0], ["ne", 94, 0], ["e", 94, 47], ["se", 94, 94], ["s", 47, 94], ["sw", 0, 94], ["w", 0, 47]]);
  assert.equal(MEASURES.handle, 6);
});

test("resizing never moves the elements, stops at 11 x 11 and keeps an element left outside", () => {
  let { d } = diagramWithCluster();
  d = ED.confirmar(place(d, "num-const", { x: 280, y: 280 }), CTX);
  const absolute = () => CC.elementBox(resizedBy.g, CTX, elementId(resizedBy, 0));
  let resizedBy = d;
  const start = absolute();
  resizedBy = resize(d, "se", { x: 300, y: 300 }, { x: 330, y: 320 });
  assert.deepEqual(clusterBox(clusterOf(resizedBy)), { x: 200, y: 200, ancho: 130, alto: 120 });
  assert.deepEqual(absolute(), start, "the element stays where it is on the diagram");
  resizedBy = resize(d, "nw", { x: 200, y: 200 }, { x: 220, y: 230 });
  assert.deepEqual(clusterBox(clusterOf(resizedBy)), { x: 220, y: 230, ancho: 80, alto: 70 }, "a left or top handle moves the corner");
  assert.deepEqual(absolute(), start, "also shrinking from the top-left: only its place relative to the interior changes");
  assert.deepEqual([elementsOf(resizedBy)[0].x - elementsOf(d)[0].x, elementsOf(resizedBy)[0].y - elementsOf(d)[0].y], [-20, -30]);
  const smallest = resize(d, "se", { x: 300, y: 300 }, { x: -500, y: -500 });
  assert.deepEqual([clusterBox(clusterOf(smallest)).ancho, clusterBox(clusterOf(smallest)).alto], [11, 11], "report geometry Q2: the smallest is 11 x 11");
  assert.equal(elementsOf(smallest).length, 1, "an element left outside stays an element");
  const fromTopLeft = resize(d, "nw", { x: 200, y: 200 }, { x: 900, y: 900 });
  assert.deepEqual(clusterBox(clusterOf(fromTopLeft)), { x: 289, y: 289, ancho: 11, alto: 11 }, "the opposite corner stays");
  // A Cluster Constant never grows by itself, however many elements are dropped.
  const crowded = place(place(d, "str-const", { x: 210, y: 210 }), "bool-const", { x: 290, y: 290 });
  assert.deepEqual(clusterBox(clusterOf(crowded)), clusterBox(clusterOf(d)));
});

test("the size is saved in the file with the elements, and opens the same", () => {
  let { d } = diagramWithCluster();
  d = type(place(d, "str-const", { x: 250, y: 250 }), "a");
  const resized = resize(d, "se", { x: 300, y: 300 }, { x: 330, y: 320 });
  const text = aTexto(resized.g, CAT);
  const file = JSON.parse(text);
  assert.deepEqual(Object.values(file.layout.diagram)[0], { x: 200, y: 200, w: 130, h: 120 });
  const reread = leer(text, CAT).nodos.find((node) => node.tipo === "cluster-constant");
  assert.deepEqual(clusterBox(reread), { x: 200, y: 200, ancho: 130, alto: 120 });
  assert.deepEqual(reread.config.elements.map((element) => [element.tipo, element.config.value]), [["str-const", "a"]]);
  assert.equal(aTexto(leer(text, CAT), CAT), text);
});

test("each edit is one step of undo", () => {
  let history = H.nuevo(Gr.nuevo());
  const rest = (d) => {
    assert.ok(graphAtRest(d), "the diagram is at rest");
    history = H.registrar(history, d.g);
  };
  let d = placeCluster(ED.inicial(), { x: 250, y: 250 });
  rest(d);
  d = place(d, "num-const", { x: 250, y: 250 });
  rest(d);
  assert.equal(history.antes.length, 2, "the palette drop of an element and its first typing are one step");
  const pressed = ED.pulsar(ED.confirmar(d, CTX), CTX, { tipo: "nodo", id: elementId(d, 0) }, { x: 250, y: 250 });
  const dragging = ED.moverA(ED.moverA(pressed, CTX, { x: 255, y: 250 }), CTX, { x: 260, y: 252 });
  assert.ok(!graphAtRest(dragging), "while it is dragged nothing is registered");
  d = ED.soltar(dragging, CTX, FONDO, { x: 260, y: 252 });
  rest(d);
  assert.equal(history.antes.length, 3, "the drag is one step");
  const undone = H.deshacer(history);
  assert.deepEqual(elementsOf({ g: undone.g }).length, 1);
  assert.equal(elementsOf({ g: undone.g })[0].x, elementsOf({ g: history.antes.at(-1) })[0].x);
});

test("a constant of Numeric 1 and String a, wired to a cluster indicator, gives [1, a] in cluster order", async () => {
  let { d } = diagramWithCluster();
  d = type(place(d, "num-const", { x: 250, y: 230 }), "1");
  d = type(place(d, "str-const", { x: 250, y: 270 }), "a");
  assert.deepEqual(clusterOf(d).config.value, [1, "a"]);
  const indicator = Gr.crearEnPanel(d.g, CAT, "cluster-indicator", 600, 50, "Out", { elements: [] });
  const elements = [{ tipo: "indicator", label: { text: "" }, config: { type: "i32", value: 0 }, x: 0, y: 0 }, { tipo: "str-indicator", label: { text: "" }, x: 0, y: 30 }];
  let g = setClusterElements(indicator.g, CAT, indicator.id, elements);
  const wired = Gr.conectar(g, CAT, { nodo: clusterOf(d).id, puerto: "result", dir: "out" }, { nodo: indicator.id, puerto: "value", dir: "in" });
  assert.ok(!wired.motivo, wired.motivo);
  g = wired.g;
  const compiled = compilar(g, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const written = await ejecutar(compiled, {});
  assert.deepEqual(written[indicator.id], [1, "a"]);
});
