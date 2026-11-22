// The right-click menus of a Cluster Constant on the Block Diagram, and what its rows do (DT-095 stage c2). Rows, orders and
// measures are those taken in LabVIEW 2026 Q3: labview-captures/reports/2026-11-16-cluster-diagram.md (Q2) and
// 2026-11-17-cluster-constant-elements.md (Q2, Q5-Q7), local evidence never committed. What was not measured says
// "unverified".

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { aTexto, leer } from "../../core/model/qvi-format.mjs";
import { aspecto } from "../../core/model/types.mjs";
import { setClusterElements } from "../../core/model/user-cluster.mjs";
import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as CC from "../../editor/src/block-diagram/cluster-constant.mjs";
import { ELEMENT_MENU, FRAME_MENU, clusterBox } from "../../editor/src/block-diagram/cluster-constant-geometry.mjs";
import * as CR from "../../editor/src/front-panel/cluster-reorder.mjs";
import * as H from "../../editor/src/block-diagram/undo-history.mjs";
import { graphAtRest } from "../../editor/src/common/labels.mjs";
import { CAT, INV } from "../helpers.mjs";
import { hover, menuRows, shown } from "./menu-rows.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",");
const FONDO = { tipo: "fondo" };
const entry = () => INV.entrada("palette.functions.programming.cluster-class-and-variant.cluster-constant");

function place(d, block, point, config) {
  const carried = ED.moverA(ED.coger(d, block, config), CTX, point);
  return ED.pulsar(carried, CTX, FONDO, point);
}

function type(d, text) {
  const typed = [...text].reduce((state, key) => ED.teclear(state, key), d);
  return ED.confirmar(typed, CTX);
}

const clusterOf = (d) => d.g.nodos.find((node) => node.tipo === "cluster-constant");
const elementsOf = (d) => clusterOf(d).config.elements;
const elementId = (d, index) => `${clusterOf(d).id}.elements.${index}`;
const html = (d) => D.contenido(d, CTX, Gr.tipos(d.g, CAT));
const panelClusters = (d) => d.g.nodos.filter((node) => node.tipo === "cluster-control" || node.tipo === "cluster-indicator");

/** An empty Cluster Constant whose frame is (200, 200, 100, 100). */
const emptyCluster = () => place(ED.inicial(), entry().bloque, { x: 250, y: 250 }, entry().config);

/** The cluster of the measured VI: Numeric 1, String "a", Boolean, in that cluster order. */
function threeElements() {
  let d = type(place(emptyCluster(), "num-const", { x: 250, y: 225 }), "1");
  d = type(place(d, "str-const", { x: 250, y: 255 }), "a");
  return ED.confirmar(place(d, "bool-const", { x: 250, y: 282 }), CTX);
}

/** A wire from the cluster to a Cluster Indicator of the panel with the same three elements as indicators. */
function wiredToIndicator(d) {
  const sink = Gr.crearEnPanel(d.g, CAT, "cluster-indicator", 600, 50, "Out", { elements: [] });
  const elements = [{ tipo: "indicator", label: { text: "" }, config: { type: "i32", value: 0 }, x: 0, y: 0 }, { tipo: "str-indicator", label: { text: "" }, x: 0, y: 30 }, { tipo: "bool-indicator", label: { text: "" }, x: 0, y: 60 }];
  const withElements = setClusterElements(sink.g, CAT, sink.id, elements);
  const wired = Gr.conectar(withElements, CAT, { nodo: clusterOf(d).id, puerto: "result", dir: "out" }, { nodo: sink.id, puerto: "value", dir: "in" });
  assert.ok(!wired.motivo, wired.motivo);
  return { ...d, g: wired.g };
}

/** The open menu of the frame, or of element `index`. */
const frameMenu = (d) => ED.abrirMenu(d, D.menuDe(clusterOf(d), null, d.g, false, CAT), clusterOf(d).id, 0, 0);
const elementMenu = (d, index) => ED.abrirMenu(d, D.menuDe(CC.elementNodeAt(d.g, elementId(d, index)), null, d.g, false, CAT), elementId(d, index), 0, 0);
const run = (d, row) => ED.orden(d, `${d.menu.raiz}.${row}`, CTX, INV);
const isBroken = (d, wire) => !!Gr.tipos(d.g, CAT).cables.get(wire.id)?.roto;

// ——— The frame's menu ———

test("the Cluster Constant's frame has its measured menu with the rows that are not built greyed", () => {
  const d = threeElements();
  assert.equal(D.menuDe(clusterOf(d), null, d.g, false, CAT), FRAME_MENU);
  const menu = frameMenu(d);
  const rows = menuRows(menu);
  // 15 rows and 5 separators: the 20 of the measured menu (report Q2 of 2026-11-16-cluster-diagram.md).
  assert.deepEqual(shown(rows), ["Visible Items", "Change to Control", "Change to Indicator", "Change to Array", "---", "Make Type Def.", "---", "Description and Tip...", "---", "Cluster, Class, & Variant Palette", "Create", "Replace", "Data Operations", "Advanced",
    "---", "Reorder Controls In Cluster...", "View Cluster As Icon", "AutoSizing", "---", "Properties"]);
  assert.equal(shown(rows).length, 20);
  assert.deepEqual(rows.filter((row) => !row.greyed).map((row) => row.label), ["Visible Items", "Change to Control", "Change to Indicator", "Make Type Def.", "Create", "Reorder Controls In Cluster..."], "only what is built is live (Make Type Def., DT-104 stage a2b): the rest says why it is not");
  const labels = (id) => INV.hijos(`${FRAME_MENU}.${id}`).map((item) => item.etiqueta);
  assert.deepEqual(labels("visible-items"), ["Label"]);
  assert.deepEqual(labels("create"), ["Constant", "Control", "Indicator", "Channel Writer...", "Cluster from Selection"]);
  assert.deepEqual(labels("data-operations"), ["Cut Data", "Copy Data", "Paste Data"]);
  assert.deepEqual(labels("advanced"), ["Customize..."]);
  assert.deepEqual(labels("autosizing"), ["None", "Size to Fit", "Arrange Horizontally", "Arrange Vertically"]);
  const create = menuRows(hover(menu, `${FRAME_MENU}.create`), `${FRAME_MENU}.create`);
  assert.deepEqual(create.filter((row) => !row.greyed).map((row) => row.label), ["Constant", "Control", "Indicator"], "Channel Writer... and Cluster from Selection are greyed");
  // AutoSizing is a later stage; None is ticked, since the frame never grows (rule 140).
  assert.equal(INV.entrada(`${FRAME_MENU}.autosizing.size-to-fit`).necesita, "autosizing-de-cluster");
  const marks = ED.marcados(menu, CTX);
  assert.deepEqual([...marks], [`${FRAME_MENU}.autosizing.none`], "Label is unticked until it is shown, View Cluster As Icon is unticked");
});

test("a right-click on the interior is not the frame's: only the frame and the elements answer", () => {
  const css = readFileSync(new URL("../../editor/src/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.nodo\.cluster-constant \{ pointer-events: none; \}/, "the interior is part of the diagram, whose menu is the Functions palette");
  assert.match(css, /\.cc-band, \.nodo\.cluster-constant \.terminal, \.nodo\.cluster-constant \.asa \{ position: absolute; pointer-events: auto; \}|\.nodo\.cluster-constant \.cc-band/);
  const d = threeElements();
  assert.equal(D.menuDe(CC.elementNodeAt(d.g, elementId(d, 0)), null, d.g, false, CAT), ELEMENT_MENU, "an element has its own menu");
  assert.equal(CC.elementNodeAt(d.g, "n99.elements.0"), undefined, "an id that is no element's gives none");
});

test("Reorder Controls In Cluster is greyed while the constant is empty and sets the cluster order by clicks on the diagram", () => {
  const empty = emptyCluster();
  const greyed = menuRows(frameMenu(empty)).find((row) => row.label === "Reorder Controls In Cluster...");
  assert.ok(greyed.greyed, "report Q2 of the panel: nothing to reorder");
  assert.equal(run(frameMenu(empty), "reorder-controls-in-cluster").reorder, undefined);
  let d = run(frameMenu(threeElements()), "reorder-controls-in-cluster");
  assert.equal(d.menu, null);
  assert.deepEqual([d.reorder.cluster, d.reorder.fieldText, d.reorder.typed], [clusterOf(d).id, "0", false], "the mode of the panel, entered on the diagram: the field reads 0, selected");
  const [NUMERIC, STRING, BOOLEAN] = [0, 1, 2];
  // The field at 0 and a click on the Boolean give Boolean 0, Numeric 1, String 2 (report of the panel §4); the field advances.
  d = CR.pressInReorder(d, CAT, { element: BOOLEAN });
  assert.deepEqual(CR.newNumbers(d.reorder), [1, 2, 0]);
  assert.equal(d.reorder.fieldText, "1");
  assert.deepEqual(elementsOf(d).map((element) => element.tipo), ["num-const", "str-const", "bool-const"], "the graph does not change until ✓");
  // ✗ restores the order and stays in the mode.
  const cancelled = CR.pressInReorder(d, CAT, { button: "cancel" });
  assert.deepEqual(CR.newNumbers(cancelled.reorder), [0, 1, 2]);
  assert.ok(cancelled.reorder, "✗ stays");
  assert.equal(CR.pressInReorder(d, CAT, null), d, "a click on empty background does nothing");
  d = CR.pressInReorder(d, CAT, { element: STRING });
  d = CR.pressInReorder(d, CAT, { element: NUMERIC });
  assert.deepEqual(CR.newNumbers(d.reorder), [2, 1, 0]);
  const committed = CR.pressInReorder(d, CAT, { button: "ok" });
  assert.equal(committed.reorder, null, "✓ leaves the mode");
  assert.deepEqual(elementsOf(committed).map((element) => element.tipo), ["bool-const", "str-const", "num-const"]);
  assert.deepEqual(clusterOf(committed).config.value, [false, "a", 1], "the value follows the new order");
});

test("✓ of Reorder Controls In Cluster on the diagram is one step of undo and ✗ or the field are none", () => {
  const started = run(frameMenu(threeElements()), "reorder-controls-in-cluster");
  let history = H.nuevo(Gr.nuevo());
  const rest = (d) => {
    assert.ok(graphAtRest(d));
    history = H.registrar(history, d.g);
  };
  rest(started);
  const steps = history.antes.length;
  const clicked = CR.pressInReorder(started, CAT, { element: 2 });
  assert.equal(clicked.g, started.g, "a click only changes the mode's state");
  assert.equal(CR.typeInField(clicked.reorder, "Escape"), clicked.reorder, "Escape does nothing");
  rest(CR.pressInReorder(clicked, CAT, { button: "ok" }));
  assert.equal(history.antes.length, steps + 1, "✓ is one step");
  const undone = H.deshacer(history);
  assert.deepEqual(clusterOf({ g: undone.g }).config.elements.map((element) => element.tipo), ["num-const", "str-const", "bool-const"], "one Undo brings the old order back");
});

test("reordering on the diagram darkens it, keeps the cluster white and frames each element with a bar in its type colour", () => {
  const d = run(frameMenu(threeElements()), "reorder-controls-in-cluster");
  const drawn = html(d);
  assert.match(drawn, /class="cc-reorder-dark"/);
  assert.equal(drawn.split('class="cc-frame').length - 1, 2, "the cluster is drawn again over the dark layer");
  assert.deepEqual([...drawn.matchAll(/data-reorder-element="(\d)"/g)].map((match) => match[1]), ["0", "1", "2"], "a frame for each element");
  const bars = [...drawn.matchAll(/class="sd-reorder-bar" style="background:([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(bars, [aspecto("i32").color, aspecto("string").color, aspecto("boolean").color], "numeric blue, string #ff00ff, Boolean green (unverified)");
  assert.equal(aspecto("string").color, "#ff00ff");
  const reordered = html(CR.pressInReorder(d, CAT, { element: 2 }));
  assert.match(reordered, /<span class="sd-reorder-new">0<\/span><span class="sd-reorder-current">2<\/span>/, "the badge of the Boolean: new 0, current 2");
  assert.ok(!html({ ...d, reorder: undefined }).includes("cc-reorder-dark"), "outside the mode nothing is darkened");
});

test("a constant reordered to String a, Numeric 1 and wired to an indicator it creates runs as a, 1", async () => {
  let d = type(place(emptyCluster(), "num-const", { x: 250, y: 225 }), "1");
  d = type(place(d, "str-const", { x: 250, y: 265 }), "a");
  assert.deepEqual(clusterOf(d).config.value, [1, "a"]);
  d = run(frameMenu(d), "reorder-controls-in-cluster");
  // The field is at 0: a click on the String gives it 0, so it goes first (the VI of the report ran `Cluster = a 1`).
  d = CR.pressInReorder(d, CAT, { element: 1 });
  d = CR.pressInReorder(d, CAT, { button: "ok" });
  assert.deepEqual(clusterOf(d).config.value, ["a", 1]);
  const withIndicator = run(frameMenu(d), "create.indicator");
  const indicator = panelClusters(withIndicator)[0];
  assert.deepEqual(indicator.config.elements.map((element) => element.tipo), ["str-indicator", "indicator"], "its elements follow the cluster order");
  const compiled = compilar(withIndicator.g, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const written = await ejecutar(compiled, {});
  assert.deepEqual(written[indicator.id], ["a", 1]);
});

// ——— Visible Items ▸ Label ———

test("Visible Items Label shows and hides the label of the constant", () => {
  const d = threeElements();
  assert.equal(clusterOf(d).label, undefined, "hidden by default");
  const shownLabel = run(hover(frameMenu(d), `${FRAME_MENU}.visible-items`), "visible-items.label");
  assert.equal(shownLabel.menu, null);
  assert.deepEqual(clusterOf(shownLabel).label, { text: "" }, "an empty label, in text edit as a new one (its text is unverified)");
  assert.equal(shownLabel.edicion.etiqueta, true);
  const typed = type(shownLabel, "Point");
  assert.equal(clusterOf(typed).label.text, "Point");
  assert.match(html(typed), /data-etiqueta="[^"]+"[^>]*>Point</);
  assert.ok(ED.marcados(frameMenu(typed), CTX).has(`${FRAME_MENU}.visible-items.label`), "ticked while shown");
  assert.equal(leer(aTexto(typed.g, CAT), CAT).nodos.find((node) => node.tipo === "cluster-constant").label.text, "Point", "it survives the file");
  const hidden = run(frameMenu(typed), "visible-items.label");
  assert.equal(clusterOf(hidden).label, undefined);
  assert.ok(!html(hidden).includes("Point"));
});

// ——— Change to Control and Change to Indicator ———

test("Change to Control replaces the constant by a cluster control whose elements are its constants", () => {
  const withWire = wiredToIndicator(threeElements());
  const before = clusterBox(clusterOf(withWire));
  const wire = withWire.g.cables[0];
  assert.ok(!isBroken(withWire, wire), "the wire to the indicator is sound before");
  const changed = run(frameMenu(withWire), "change-to-control");
  assert.equal(changed.menu, null);
  assert.equal(changed.g.nodos.filter((node) => node.tipo === "cluster-constant").length, 0, "the constant is gone");
  const control = changed.g.nodos.find((node) => node.tipo === "cluster-control");
  assert.equal(control.label.text, "Cluster");
  assert.deepEqual(control.config.elements.map((element) => element.tipo), ["control", "str-control", "bool-control"], "its elements are controls, in cluster order");
  assert.deepEqual(control.config.elements.map((element) => element.label.text), ["", "", ""], "with empty labels, so hidden");
  assert.deepEqual(control.config.value, [1, "a", false], "with their values");
  assert.equal(control.config.elements[0].config.type, "i32", "and the representation");
  assert.equal(control.config.elements[2].config.style, "push-button", "a Boolean takes its kind's style");
  assert.ok(control.panel, "it is on the panel too");
  assert.deepEqual(control.config.type, clusterOf(withWire).config.type, "the cluster type does not change");
  // Its terminal is where the constant was and the wire goes to it, still healthy.
  const box = D.caja(control, CTX);
  assert.equal(box.x + box.ancho, before.x + before.ancho, "the terminal's right edge is the constant's (unverified)");
  assert.deepEqual(changed.g.cables[0].de, { nodo: control.id, puerto: "result" });
  assert.equal(changed.g.cables[0].id, wire.id);
  assert.ok(!isBroken(changed, changed.g.cables[0]));
  // The label is in text edit, left of a control's terminal (report Q6).
  assert.deepEqual([changed.edicion.nodo, changed.edicion.etiqueta, changed.edicion.nuevo], [control.id, true, true]);
  assert.ok(D.cajaEtiqueta(control, CTX).x + D.cajaEtiqueta(control, CTX).ancho <= box.x, "to its left");
  // A second one is numbered as the panel numbers its clusters.
  const another = place(ED.confirmar(changed, CTX), entry().bloque, { x: 250, y: 400 }, entry().config);
  const second = run(frameMenu(another), "change-to-control");
  assert.deepEqual(panelClusters(second).filter((node) => node.tipo === "cluster-control").map((node) => node.label.text), ["Cluster", "Cluster 2"]);
});

test("Change to Indicator replaces the constant by a cluster indicator with its label on the right", () => {
  const withWire = wiredToIndicator(threeElements());
  const changed = run(frameMenu(withWire), "change-to-indicator");
  const indicator = changed.g.nodos.find((node) => node.tipo === "cluster-indicator" && node.label.text === "Cluster");
  assert.deepEqual(indicator.config.elements.map((element) => element.tipo), ["indicator", "str-indicator", "bool-indicator"]);
  assert.equal(indicator.config.elements[2].config.style, "round-led", "a Boolean takes an indicator's style");
  const box = D.caja(indicator, CTX);
  assert.ok(D.cajaEtiqueta(indicator, CTX).x >= box.x + box.ancho, "label right of the terminal (report Q6)");
  // The constant's wire faces the wrong way now: broken, as for any panel object flipped.
  assert.deepEqual(changed.g.cables[0].de, { nodo: indicator.id, puerto: "value" });
  assert.ok(isBroken(changed, changed.g.cables[0]));
  assert.deepEqual(changed.g.nodos.filter((node) => node.tipo === "cluster-constant"), []);
});

test("Change to Control from an element's menu turns the whole constant, and one Undo gives it back", () => {
  const d = threeElements();
  const changed = run(elementMenu(d, 1), "change-to-control");
  assert.equal(panelClusters(changed).length, 1);
  assert.equal(panelClusters(changed)[0].config.elements.length, 3, "the whole cluster, not the element");
  // LabVIEW cannot undo this (Undo is greyed); Solder's undo is the graph's own, so it can: a deliberate difference (spec rule 141).
  let history = H.registrar(H.nuevo(Gr.nuevo()), d.g);
  history = H.registrar(history, changed.g);
  assert.equal(clusterOf({ g: H.deshacer(history).g }).config.elements.length, 3);
});

// ——— Create ▸ ———

test("Create Constant makes a copy of the constant with its elements and values, to its left and unwired", () => {
  const withWire = wiredToIndicator(threeElements());
  const original = clusterOf(withWire);
  const made = run(frameMenu(withWire), "create.constant");
  const clusters = made.g.nodos.filter((node) => node.tipo === "cluster-constant");
  assert.equal(clusters.length, 2);
  const copy = clusters.find((node) => node.id !== original.id);
  assert.deepEqual(copy.config.elements, original.config.elements, "elements and values");
  assert.notEqual(copy.config.elements, original.config.elements, "a copy, not the same list");
  assert.deepEqual(copy.config.value, [1, "a", false]);
  assert.equal(copy.label, undefined, "no label");
  assert.deepEqual([copy.x, copy.y], [original.x - 180, original.y], "about 180 px to the left (unverified offset)");
  assert.equal(made.g.cables.length, 1, "not wired");
  assert.deepEqual(made.seleccion, [copy.id]);
  assert.equal(CC.elementBox(made.g, CTX, `${copy.id}.elements.0`).x - copy.x, CC.elementBox(made.g, CTX, `${original.id}.elements.0`).x - original.x, "its elements keep their places in it");
  const resized = CC.resized(withWire.g, CTX, original.id, "se", 30, 20);
  const bigger = run(frameMenu({ ...withWire, g: resized }), "create.constant");
  assert.deepEqual(clusterBox(bigger.g.nodos.find((node) => node.tipo === "cluster-constant" && node.id !== original.id)).ancho, 130, "the copy has the size of the constant");
});

test("Create Indicator makes a cluster indicator 25 px right of the frame, wired, with its label in edit", () => {
  const d = threeElements();
  const frame = clusterBox(clusterOf(d));
  const made = run(frameMenu(d), "create.indicator");
  const indicator = panelClusters(made)[0];
  assert.equal(indicator.tipo, "cluster-indicator");
  assert.equal(indicator.label.text, "Cluster");
  assert.deepEqual(indicator.config.elements.map((element) => [element.tipo, element.label.text]), [["indicator", ""], ["str-indicator", ""], ["bool-indicator", ""]], "its elements are indicators with empty hidden labels");
  assert.deepEqual(indicator.config.value, [1, "a", false]);
  assert.equal(indicator.x, frame.x + frame.ancho + 25, "25 px right of the frame (report Q7)");
  assert.equal(made.g.cables.length, 1, "wired to the constant");
  assert.deepEqual(made.g.cables[0].de, { nodo: clusterOf(d).id, puerto: "result" });
  assert.ok(!isBroken(made, made.g.cables[0]));
  assert.ok(indicator.panel, "it is on the panel");
  assert.deepEqual([made.edicion.nodo, made.edicion.etiqueta, made.edicion.nuevo], [indicator.id, true, true], "the label is in text edit");
  assert.equal(clusterOf(made).id, clusterOf(d).id, "the constant stays");
});

test("Create Control makes an unwired cluster control above the constant, as Create Control does on any constant's output", () => {
  const d = threeElements();
  const frame = clusterBox(clusterOf(d));
  const made = run(frameMenu(d), "create.control");
  const control = panelClusters(made)[0];
  assert.equal(control.tipo, "cluster-control");
  assert.deepEqual(control.config.elements.map((element) => element.tipo), ["control", "str-control", "bool-control"]);
  assert.equal(made.g.cables.length, 0, "a control does not fit an output: unwired");
  assert.deepEqual([control.x, control.y + D.caja(control, CTX).alto], [frame.x, frame.y], "above the upper left corner (LabVIEW crashed on this row: unverified)");
  assert.equal(made.edicion.nodo, control.id);
});

// ——— The element's menu ———

test("the element of a Cluster Constant has its own menu, and Representation retypes that element and the cluster", () => {
  let d = threeElements();
  const menu = elementMenu(d, 0);
  assert.equal(menu.menu.raiz, ELEMENT_MENU);
  const rows = menuRows(menu);
  // 14 rows and 5 separators: the 19 of the measured menu (report Q2 of 2026-11-17-cluster-constant-elements.md).
  assert.deepEqual(shown(rows), ["Visible Items", "Change to Control", "Change to Indicator", "Change to Array", "---", "Make Type Def.", "---", "Description and Tip...", "---", "Cluster, Class, & Variant Palette", "Create", "Replace", "Data Operations", "Advanced",
    "---", "Representation", "Display Format...", "---", "Properties"]);
  assert.equal(shown(rows).length, 19);
  assert.deepEqual(rows.filter((row) => !row.greyed).map((row) => row.label), ["Change to Control", "Change to Indicator", "Representation"]);
  assert.ok(ED.marcados(menu, CTX).has(`${ELEMENT_MENU}.representation.i32`), "ticked with its representation");
  const retyped = run(menu, "representation.i16");
  assert.equal(retyped.menu, null);
  assert.deepEqual([elementsOf(retyped)[0].tipo, elementsOf(retyped)[0].config.type], ["num-const", "i16"]);
  assert.deepEqual(clusterOf(retyped).config.type.cluster.map((field) => field.type), ["i16", "string", "boolean"], "the cluster's type follows");
  assert.deepEqual(clusterOf(retyped).config.value, [1, "a", false]);
  assert.deepEqual(elementsOf(retyped).slice(1), elementsOf(d).slice(1), "the other elements do not change");
  // The DBL constant is the general numeric one with the representation set, as for a free one.
  d = ED.confirmar(place(emptyCluster(), "const", { x: 250, y: 250 }), CTX);
  assert.ok(ED.marcados(elementMenu(d, 0), CTX).has(`${ELEMENT_MENU}.representation.dbl`));
  const asByte = run(elementMenu(d, 0), "representation.i8");
  assert.deepEqual([elementsOf(asByte)[0].tipo, elementsOf(asByte)[0].config.type], ["num-const", "i8"]);
});

test("a string or Boolean element has no Representation nor Display Format (unverified: only a numeric element's rows were read)", () => {
  const d = threeElements();
  for (const index of [1, 2]) {
    const rows = shown(menuRows(elementMenu(d, index)));
    assert.ok(!rows.includes("Representation") && !rows.includes("Display Format..."), `element ${index}`);
    assert.deepEqual(rows.slice(-3), ["Advanced", "---", "Properties"]);
  }
  assert.equal(run(elementMenu(d, 1), "representation.i8").g, d.g, "a string takes no representation");
});
