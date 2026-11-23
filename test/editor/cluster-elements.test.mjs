// The elements of a user's cluster on the Front Panel, edited as the controls they are (DT-106). Every interaction is the one
// measured in LabVIEW 2026 Q3: labview-captures/reports/2026-11-23-cluster-elements.md, Q1 to Q7 (local evidence, never
// committed). What was not measured says "unverified".

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as P from "../../editor/src/front-panel/front-panel.mjs";
import * as PC from "../../editor/src/front-panel/panel-clipboard.mjs";
import * as H from "../../editor/src/block-diagram/undo-history.mjs";
import { aTexto } from "../../core/model/qvi-format.mjs";
import { foldClusters, unfoldClusters } from "../../editor/src/front-panel/cluster-unfolding.mjs";
import { clipPathOf } from "../../editor/src/front-panel/cluster-element-view.mjs";
import { duplicated } from "../../editor/src/front-panel/cluster-element-clipboard.mjs";
import { interiorBox, shellBox } from "../../editor/src/front-panel/cluster-panel.mjs";
import { createPanelGraphs } from "../../editor/src/window/panel-graphs.mjs";
import { CAT, INV } from "../helpers.mjs";
import { menuRows } from "./menu-rows.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",");
const FONDO = { tipo: "fondo" };
const placeOf = () => [0, 0];

function place(p, block, point, config) {
  const carried = P.moverA(P.coger(p, block, config), CTX, point);
  return P.confirmar(P.pulsar(carried, CTX, FONDO, point));
}

/** A panel with a cluster whose interior starts at (254, 254) holding a Numeric, a Boolean and a String, in that order, and a free Numeric far away. */
function panelWithElements() {
  const entry = INV.entrada("palette.controls.modern.data-containers.cluster");
  let p = place(P.inicial(), entry.bloque, { x: 300, y: 300 }, entry.config);
  p = place(p, "control", { x: 300, y: 270 });
  p = place(p, "bool-control", { x: 300, y: 310 });
  p = place(p, "str-control", { x: 300, y: 340 });
  p = place(p, "control", { x: 600, y: 120 });
  return p;
}
const folded = (g) => foldClusters(g, CAT);
const clusterId = (p) => p.g.nodos.find((node) => node.tipo === "cluster-control").id;
const element = (p, label) => p.g.nodos.find((node) => node.inside !== undefined && node.label.text === label);
const free = (p) => p.g.nodos.find((node) => node.inside === undefined && node.tipo === "control");
const labelsInside = (p) => folded(p.g).nodos.find((node) => node.id === clusterId(p)).config.elements.map((e) => e.label.text);
const object = (id) => ({ tipo: "objeto", id });
/** The point of a press on the outer band of an element's box: LabVIEW's bevel, which selects and moves. */
const bevelOf = (node) => ({ x: node.panel.x + 20, y: node.panel.y + 1 });

// ——— Q1, Q2: selecting and operating ———

test("a press on an element's bevel selects it alone, with its handles: a numeric's on the left and right only", () => {
  const p = panelWithElements();
  const numeric = element(p, "Numeric");
  const pressed = P.pulsar({ ...p, seleccion: [clusterId(p)] }, CTX, object(numeric.id), bevelOf(numeric));
  assert.deepEqual(pressed.seleccion, [numeric.id], "the element alone, not its cluster");
  const html = P.contenido({ ...pressed, accion: null }, CTX);
  const handles = [...html.matchAll(new RegExp(`data-nodo="${numeric.id}" data-asa-control="(\\w+)"`, "g"))].map((match) => match[1]);
  assert.deepEqual(handles, ["e", "w"], "as a free numeric");
  const boolean = element(p, "Boolean");
  const selectedBoolean = P.pulsar(p, CTX, object(boolean.id), bevelOf(boolean));
  assert.equal([...P.contenido({ ...selectedBoolean, accion: null }, CTX).matchAll(new RegExp(`data-nodo="${boolean.id}" data-asa-control`, "g"))].length, 8, "a Boolean's have eight");
});

test("the handles of an element stay drawn outside the clip, which cuts the element at the cluster's frame", () => {
  const p = panelWithElements();
  const string = element(p, "String");
  const html = P.contenido({ ...p, seleccion: [string.id] }, CTX);
  assert.match(html, /sd-string[^"]*" data-nodo="[^"]*" data-label="String" style="[^"]*clip-path:inset\(-100px 8px 6px -100px\)"/, "the string sticks out of the interior on the right and below");
  assert.match(html, /<div class="sd-element-handles" style="left:254px;top:328px">/, "its handles are in a box of their own, which the clip does not touch");
  const interior = interiorBox(shellBox(p.g.nodos[0]));
  assert.equal(clipPathOf({ x: interior.x + 5, y: interior.y + 5, ancho: 20, alto: 20 }, interior), undefined, "an element inside is not clipped");
  assert.equal(clipPathOf({ x: interior.x - 10, y: interior.y + 5, ancho: 30, alto: 20 }, interior), "inset(-100px -100px -100px 10px)");
});

test("a press on a numeric element's arrows operates it and selects it; on its value, it types", () => {
  const p = panelWithElements();
  const numeric = element(p, "Numeric");
  const stepped = P.pulsar(p, CTX, { tipo: "paso", id: numeric.id, paso: 1 }, bevelOf(numeric));
  assert.deepEqual([stepped.g.nodos.find((node) => node.id === numeric.id).currentValue, stepped.seleccion], [1, [numeric.id]]);
  const field = { x: numeric.panel.x + 30, y: numeric.panel.y + 12 };
  const typing = P.pulsar(p, CTX, { tipo: "casilla", id: numeric.id }, field);
  assert.equal(typing.edicion.valor, true, "a single click types, with the caret");
  assert.equal(typing.edicion.todo, false);
  assert.equal(P.doubleClickTypes(p, { tipo: "casilla", id: numeric.id }, field), true, "a double click selects the whole value");
  assert.equal(P.hoverCursor(p, { tipo: "casilla", id: numeric.id }, field), "text");
  assert.equal(P.hoverCursor(p, { tipo: "paso", id: numeric.id }, field), "operate");
  assert.equal(P.hoverCursor(p, { tipo: "casilla", id: numeric.id }, bevelOf(numeric)), "move", "the band round the value is the positioning arrow");
});

test("a press on a Boolean element's button toggles it and selects it; on its bevel, it moves it", () => {
  const p = panelWithElements();
  const boolean = element(p, "Boolean");
  const centre = { x: boolean.panel.x + 25, y: boolean.panel.y + 11 };
  const operated = P.pulsar(p, CTX, object(boolean.id), centre);
  assert.deepEqual([operated.g.nodos.find((node) => node.id === boolean.id).currentValue, operated.seleccion, operated.accion], [true, [boolean.id], null], "nothing is dragged: a drag from the button operates");
  const pressed = P.pulsar(p, CTX, object(boolean.id), bevelOf(boolean));
  assert.equal(pressed.accion.tipo, "mover");
  assert.equal(pressed.g.nodos.find((node) => node.id === boolean.id).currentValue, undefined);
});

test("a click on an element's label selects the label only; on the cluster's empty interior, nothing, and what was selected is not", () => {
  const p = panelWithElements();
  const numeric = element(p, "Numeric");
  const onLabel = P.pulsar({ ...p, seleccion: [clusterId(p)] }, CTX, { tipo: "etiqueta", id: numeric.id }, { x: numeric.panel.x + 5, y: numeric.panel.y - 8 });
  assert.deepEqual(onLabel.seleccion, [P.idEtiqueta(numeric.id)]);
  const onInterior = P.pulsar({ ...p, seleccion: [numeric.id] }, CTX, { tipo: "interior", id: clusterId(p) }, { x: 330, y: 330 });
  assert.deepEqual(onInterior.seleccion, []);
  assert.equal(onInterior.accion.tipo, "rectangulo", "it works as the free panel does");
  const onFrame = P.pulsar(p, CTX, object(clusterId(p)), { x: 251, y: 300 });
  assert.deepEqual(onFrame.seleccion, [clusterId(p)], "the frame selects the cluster");
  assert.equal(P.hoverCursor(p, { tipo: "interior", id: clusterId(p) }, { x: 330, y: 330 }), null);
  const page = readFileSync(new URL("../../editor/src/window/editor-window.mjs", import.meta.url), "utf8");
  assert.match(page, /el\.closest\("\.sd-cluster-interior"\);\n {2}if \(interior\) return \{ tipo: "interior"/);
  assert.match(readFileSync(new URL("../../editor/src/styles.css", import.meta.url), "utf8"), /\.lienzo-front-panel \.sd-cluster-interior \{ cursor: var\(--cursor-cruz/, "the cross of the free panel over the interior");
});

// ——— Q3: Delete, Cut, Copy, Paste and the arrow keys ———

test("Delete removes an element and the others keep their order; the Edit menu's rows are enabled; Undo puts it back where it was", () => {
  const p = panelWithElements();
  const boolean = element(p, "Boolean");
  const selected = { ...p, seleccion: [boolean.id] };
  assert.equal(PC.hasSelection(selected), true);
  assert.equal(PC.selectionIsLocked(selected), false);
  const graphs = createPanelGraphs(() => CAT);
  let history = H.nuevo(graphs.fold(p.g));
  const deleted = P.borrarSeleccion(selected, placeOf);
  assert.deepEqual(labelsInside(deleted), ["Numeric", "String"]);
  history = H.registrar(history, graphs.fold(deleted.g));
  const undone = H.deshacer(history);
  assert.deepEqual(labelsInside({ g: graphs.unfold(undone.g) }.g && { ...p, g: graphs.unfold(undone.g) }), ["Numeric", "Boolean", "String"], "at its old place in the order");
  assert.deepEqual(labelsInside(deleted), ["Numeric", "String"], "while the edit stays done");
  assert.notEqual(aTexto(graphs.fold(deleted.g), CAT), aTexto(graphs.fold(p.g), CAT), "a structural edit changes what is saved, so the OVI is modified");
});

test("Delete on a cluster takes its elements with it", () => {
  const p = panelWithElements();
  const deleted = P.borrarSeleccion({ ...p, seleccion: [clusterId(p)] }, placeOf);
  assert.deepEqual(deleted.g.nodos.map((node) => node.tipo), ["control"], "only the free numeric is left");
});

test("Cut takes an element with its value and Paste over the interior adds it as the last one, numbered; over the free panel it is a free control that keeps its label", () => {
  const p = panelWithElements();
  const numeric = element(p, "Numeric");
  const valued = { ...p, g: { ...p.g, nodos: p.g.nodos.map((node) => (node.id === numeric.id ? { ...node, currentValue: 7 } : node)) }, seleccion: [numeric.id] };
  const copied = PC.copySelection(valued, CTX);
  assert.equal(copied.nodes.length, 1);
  assert.deepEqual([copied.nodes[0].label.text, copied.nodes[0].currentValue, copied.nodes[0].inside], ["Numeric", 7, undefined], "a free control, with its label and value");
  const cut = PC.cutSelection(valued, CTX);
  assert.deepEqual(labelsInside(cut.p), ["Boolean", "String"], "Cut removes the element");
  // Over the cluster's interior: the last element, its label numbered as the cluster already has Numeric.
  const into = PC.pasteAt({ ...p, seleccion: [] }, CTX, copied, { x: 300, y: 290 }, null).p;
  assert.deepEqual(labelsInside(into), ["Numeric", "Boolean", "String", "Numeric 2"]);
  assert.equal(folded(into.g).nodos.find((node) => node.id === clusterId(p)).currentValue.at(-1), 7, "with its value");
  const pastedElement = into.g.nodos.find((node) => node.label.text === "Numeric 2");
  assert.ok(pastedElement.x === undefined && pastedElement.name === undefined, "an element has no terminal on the diagram");
  assert.deepEqual(into.seleccion, [pastedElement.id]);
  // Over the free panel: a free control, numbered only against the top level's labels (the free Numeric is there).
  const alone = PC.pasteAt({ ...cut.p, seleccion: [] }, CTX, copied, { x: 500, y: 450 }, null).p;
  assert.deepEqual(alone.g.nodos.filter((node) => node.inside === undefined && node.tipo === "control").map((node) => node.label.text), ["Numeric", "Numeric 2"]);
});

test("a free Numeric pasted keeps its label when only a cluster's element has it", () => {
  const p = panelWithElements();
  const withoutFree = { ...p, g: { ...p.g, nodos: p.g.nodos.filter((node) => node.id !== free(p).id) } };
  const numeric = element(withoutFree, "Numeric");
  const copied = PC.copySelection({ ...withoutFree, seleccion: [numeric.id] }, CTX);
  const pasted = PC.pasteAt({ ...withoutFree, seleccion: [] }, CTX, copied, { x: 500, y: 450 }, null).p;
  const loose = pasted.g.nodos.find((node) => node.inside === undefined && node.tipo === "control");
  assert.equal(loose.label.text, "Numeric", "measured: the name is free at top level");
  assert.deepEqual([loose.x, loose.y !== undefined, typeof loose.name], [loose.x, true, "string"], "with a terminal on the diagram");
  assert.equal(labelsInside(pasted).length, 3, "and the cluster keeps its elements");
});

test("a cluster copied takes its elements with it and is pasted whole, unfolded, with new ids", () => {
  const p = panelWithElements();
  const copied = PC.copySelection({ ...p, seleccion: [clusterId(p)] }, CTX);
  assert.deepEqual(copied.nodes.map((node) => node.tipo), ["cluster-control"]);
  assert.equal(copied.nodes[0].config.elements.length, 3);
  const pasted = PC.pasteAt({ ...p, seleccion: [] }, CTX, copied, { x: 520, y: 360 }, null).p;
  const clones = pasted.g.nodos.filter((node) => node.tipo === "cluster-control");
  assert.equal(clones.length, 2);
  const [, clone] = clones;
  assert.deepEqual(pasted.g.nodos.filter((node) => node.inside === clone.id).map((node) => node.label.text), ["Numeric", "Boolean", "String"]);
  assert.deepEqual(pasted.g.nodos.filter((node) => node.inside === clusterId(p)).length, 3, "the original is untouched");
  const twice = duplicated(p.g, CAT, [clusterId(p)], 8);
  assert.equal(twice.g.nodos.filter((node) => node.tipo === "cluster-control").length, 2, "Ctrl+drag copies the same way");
  assert.equal(foldClusters(twice.g, CAT).nodos.find((node) => node.id === twice.ids[0]).config.elements.length, 3);
});

test("the arrow keys nudge an element 1 px; a cluster takes its elements along", () => {
  const p = panelWithElements();
  const numeric = element(p, "Numeric");
  const before = folded(p.g).nodos.find((node) => node.id === clusterId(p)).config.elements[0];
  const nudged = P.flecha({ ...p, seleccion: [numeric.id] }, CTX, "ArrowRight", false);
  assert.equal(nudged.g.nodos.find((node) => node.id === numeric.id).panel.x, numeric.panel.x + 1);
  assert.equal(folded(nudged.g).nodos.find((node) => node.id === clusterId(p)).config.elements[0].x, before.x + 1);
  const up = P.flecha(nudged, CTX, "ArrowUp", false);
  assert.equal(up.g.nodos.find((node) => node.id === numeric.id).panel.y, numeric.panel.y - 1);
  const shell = P.flecha({ ...p, seleccion: [clusterId(p)] }, CTX, "ArrowDown", false);
  assert.deepEqual(folded(shell.g).nodos.find((node) => node.id === clusterId(p)).config.elements.map((e) => [e.x, e.y]), folded(p.g).nodos.find((node) => node.id === clusterId(p)).config.elements.map((e) => [e.x, e.y]), "their place in the cluster is the same");
  assert.equal(shell.g.nodos.find((node) => node.id === numeric.id).panel.y, numeric.panel.y + 1, "they moved on the panel");
});

// ——— Q4: dragging ———

/** Press at `from` on the element's bevel, drag to `to` and let go there. */
function drag(p, node, to) {
  const start = bevelOf(node);
  const pressed = P.pulsar(p, CTX, object(node.id), start);
  return P.soltar(P.moverA(pressed, CTX, to), CTX, FONDO, to);
}

test("an element moved within its cluster keeps its place in the order and is clipped at the frame", () => {
  const p = panelWithElements();
  const numeric = element(p, "Numeric");
  const moved = drag(p, numeric, { x: bevelOf(numeric).x + 12, y: bevelOf(numeric).y + 30 });
  assert.deepEqual(labelsInside(moved), ["Numeric", "Boolean", "String"]);
  assert.equal(moved.g.nodos.find((node) => node.id === numeric.id).panel.x, numeric.panel.x + 12);
  assert.deepEqual(moved.seleccion, [numeric.id]);
  assert.equal(moved.g.nodos.filter((node) => node.inside !== undefined).length, 3);
});

test("an element let go with the mouse outside its cluster becomes a free control with its label, value and a terminal; the others keep their order", () => {
  const p = panelWithElements();
  const boolean = element(p, "Boolean");
  const valued = { ...p, g: { ...p.g, nodos: p.g.nodos.map((node) => (node.id === boolean.id ? { ...node, currentValue: true } : node)) } };
  const out = drag(valued, boolean, { x: 450, y: 420 });
  assert.deepEqual(labelsInside(out), ["Numeric", "String"]);
  const loose = out.g.nodos.find((node) => node.label.text === "Boolean");
  assert.equal(loose.inside, undefined);
  assert.equal(loose.currentValue, true, "it keeps its value");
  assert.ok(loose.name && loose.x !== undefined && loose.y !== undefined, "a terminal on the diagram, as any panel object has");
  assert.deepEqual(out.seleccion, [loose.id], "still selected, under its new id");
  assert.equal(new Set(out.g.nodos.map((node) => node.id)).size, out.g.nodos.length);
  assert.equal(folded(out.g).nodos.some((node) => node.id === loose.id), true, "and the diagram and the file see it");
});

test("a free control let go over a cluster's interior joins it as the last element, renamed when its label is taken, with no terminal", () => {
  const p = panelWithElements();
  const loose = free(p);
  const joined = drag(p, loose, { x: 320, y: 300 });
  assert.deepEqual(labelsInside(joined), ["Numeric", "Boolean", "String", "Numeric 2"]);
  const element2 = joined.g.nodos.find((node) => node.id === loose.id);
  assert.equal(element2.inside, clusterId(p));
  assert.ok(element2.name === undefined && element2.x === undefined, "its terminal goes");
  // With its wire: an element has none, so the wire goes with it.
  const wired = { ...p, g: { ...p.g, cables: [{ id: "c1", de: { nodo: loose.id, puerto: "result" }, a: { nodo: "other", puerto: "x" } }] } };
  assert.deepEqual(drag(wired, loose, { x: 320, y: 300 }).g.cables, []);
  // The mouse decides: released outside, it stays free.
  assert.equal(drag(p, loose, { x: 700, y: 500 }).g.nodos.find((node) => node.id === loose.id).inside, undefined);
});

test("moving a cluster takes its elements with it, and stretching it by its left handle takes them along as it always did", () => {
  const p = panelWithElements();
  const cluster = p.g.nodos.find((node) => node.id === clusterId(p));
  const numeric = element(p, "Numeric");
  const moved = P.soltar(P.moverA(P.pulsar(p, CTX, object(cluster.id), { x: 251, y: 300 }), CTX, { x: 281, y: 320 }), CTX, FONDO, { x: 281, y: 320 });
  assert.deepEqual(moved.g.nodos.find((node) => node.id === numeric.id).panel, { x: numeric.panel.x + 30, y: numeric.panel.y + 20 });
  assert.deepEqual(folded(moved.g).nodos.find((node) => node.id === cluster.id).config.elements.map((e) => [e.x, e.y]), folded(p.g).nodos.find((node) => node.id === cluster.id).config.elements.map((e) => [e.x, e.y]));
  const handle = { tipo: "asa-cluster", id: cluster.id, lado: "w" };
  const stretched = P.soltar(P.moverA(P.pulsar({ ...p, seleccion: [cluster.id] }, CTX, handle, { x: 250, y: 300 }), CTX, { x: 240, y: 300 }), CTX, FONDO, { x: 240, y: 300 });
  assert.equal(stretched.g.nodos.find((node) => node.id === cluster.id).panel.w, 110);
  assert.equal(stretched.g.nodos.find((node) => node.id === numeric.id).panel.x, numeric.panel.x - 10, "the elements follow the corner");
  assert.deepEqual(folded(stretched.g).nodos.find((node) => node.id === cluster.id).config.elements.map((e) => e.x), folded(p.g).nodos.find((node) => node.id === cluster.id).config.elements.map((e) => e.x));
});

test("a Ctrl+drag of an element is not copied (unverified): only free objects and clusters are", () => {
  const p = panelWithElements();
  const numeric = element(p, "Numeric");
  assert.equal(duplicated(p.g, CAT, [numeric.id], 8).g.nodos.length, p.g.nodos.length, "nothing is copied");
});

// ——— Q5: values ———

test("typing into an element's value and toggling a Boolean set the current value, not the default, and do not mark the OVI modified", () => {
  const p = panelWithElements();
  const numeric = element(p, "Numeric");
  const before = aTexto(foldClusters(p.g, CAT), CAT);
  let typed = P.editarValor(p, CTX, numeric.id, true);
  for (const key of ["7", "Enter"]) typed = P.teclear(typed, key);
  assert.equal(typed.g.nodos.find((node) => node.id === numeric.id).currentValue, 7);
  assert.equal(aTexto(foldClusters(typed.g, CAT), CAT), before, "the file does not save a current value (DT-053)");
  const boolean = element(typed, "Boolean");
  const toggled = P.pulsar(typed, CTX, object(boolean.id), { x: boolean.panel.x + 25, y: boolean.panel.y + 11 });
  assert.equal(aTexto(foldClusters(toggled.g, CAT), CAT), before);
  assert.deepEqual(folded(toggled.g).nodos.find((node) => node.id === clusterId(p)).currentValue, [7, true, ""], "the cluster's value is its elements', in order");
  assert.equal(folded(toggled.g).nodos.find((node) => node.id === clusterId(p)).config.value[0], 0, "the default stays");
});

// ——— Q6, Q7: the palette and the menus ———

test("what is chosen from the Controls palette lands in the cluster as its last element when the click is on the interior", () => {
  let p = panelWithElements();
  p = place(p, "indicator", { x: 300, y: 330 });
  assert.deepEqual(labelsInside(p), ["Numeric", "Boolean", "String", "Numeric 2"]);
  assert.equal(folded(p.g).nodos.find((node) => node.id === clusterId(p)).config.elements.at(-1).tipo, "control", "of the cluster's kind");
  const outside = place(p, "control", { x: 700, y: 500 });
  assert.equal(outside.g.nodos.at(-1).inside, undefined);
  const page = readFileSync(new URL("../../editor/src/window/editor-window.mjs", import.meta.url), "utf8");
  assert.match(page, /sobrePanel\?\.tipo !== "fondo" && sobrePanel\?\.tipo !== "interior"/, "a right click on the interior opens the palette like one on the background");
});

test("an element's menu is its control's own, with the rows that need a terminal greyed", () => {
  const p = panelWithElements();
  const numeric = element(p, "Numeric");
  const root = P.menuDe(numeric);
  assert.equal(root, "context.numeric-panel-control");
  const rows = menuRows(ED.abrirMenuDelPanel(p, root, numeric.id, 0, 0));
  assert.deepEqual(rows.filter((row) => row.greyed && ["Create", "Replace"].includes(row.label)).map((row) => row.label), ["Create", "Replace"]);
  const freeNumeric = free(p);
  const freeRows = menuRows(ED.abrirMenuDelPanel(p, root, freeNumeric.id, 0, 0));
  assert.deepEqual(freeRows.filter((row) => row.greyed && ["Create", "Replace"].includes(row.label)), [], "a free control keeps them");
  assert.equal(P.menuDe(element(p, "Boolean")), "context.boolean-control");
});

// ——— The window ———

test("the Front Panel's window edits the unfolded graph and shares the folded one", () => {
  const page = readFileSync(new URL("../../editor/src/window/editor-window.mjs", import.meta.url), "utf8");
  assert.match(page, /const grafo = \(\) => \(conDiagrama \? dia\.g : graphs\.fold\(pan\.g\)\);/);
  assert.match(page, /const shared = conDiagrama \? g : graphs\.fold\(g\);/, "what the history keeps and the other window gets");
  assert.match(page, /else pan = P\.recibir\(pan, graphs\.unfold\(g\)\);/, "what arrives");
  assert.match(page, /pan = P\.inicial\(graphs\.unfold\(g\)\);/, "what opens");
  assert.match(page, /g: graphs\.unfold\(r\.g\)/, "undo and redo");
  assert.match(page, /if \(conPanel\) pan = \{ \.\.\.pan, g: si \? graphs\.fold\(pan\.g\) : graphs\.unfold\(pan\.g\) \};/, "a Run works on the folded graph");
  assert.equal(unfoldClusters({ nodos: [], cables: [] }).nodos.length, 0);
});

test("a click on the empty interior of a cluster selects nothing and clears the selection; only the frame selects the cluster (measured Q2)", () => {
  const p = panelWithElements();
  const cluster = p.g.nodos.find((node) => node.id === clusterId(p));
  const shell = shellBox(cluster);
  const emptyPoint = { x: shell.x + shell.ancho - 10, y: shell.y + shell.alto - 10 };
  const pressed = P.pulsar({ ...p, seleccion: [free(p).id] }, CTX, { tipo: "interior", id: cluster.id }, emptyPoint);
  assert.deepEqual(P.soltar(pressed, CTX, { tipo: "interior", id: cluster.id }, emptyPoint).seleccion, [], "nothing is selected");
  const frame = P.pulsar(p, CTX, object(cluster.id), { x: cluster.panel.x + 1, y: cluster.panel.y + 1 });
  assert.deepEqual(frame.seleccion, [cluster.id], "the frame selects the cluster");
});
