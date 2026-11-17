// Bundle and Unbundle on the Block Diagram (DT-095 stage d, DT-098). Sizes, marks, rows and menus are those measured in
// LabVIEW 2026 Q3: labview-captures/reports/2026-11-16-cluster-diagram.md Q3-Q4 and 2026-11-17-bundle-unbundle.md (local
// evidence never committed). What was not measured says "unverified".

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { followWiredClusters } from "../../core/model/wired-clusters.mjs";
import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import { withElementChanged } from "../../editor/src/block-diagram/cluster-constant.mjs";
import * as BN from "../../editor/src/block-diagram/bundle-nodes.mjs";
import * as EL from "../../editor/src/debugging/error-list.mjs";
import { CAT, INV } from "../helpers.mjs";
import { menuRows, shown } from "./menu-rows.mjs";
import { oldSchoolToken } from "./old-school-theme.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",");
const FONDO = { tipo: "fondo" };
const PALETTE = "palette.functions.programming.cluster-class-and-variant";
const CLUSTER_CONSTANT = INV.entrada(`${PALETTE}.cluster-constant`);

/** The editor's settling after every change of the graph (settleEdit in editor-window.mjs). */
const settle = (d) => ({ ...d, g: followWiredClusters(d.g, CAT) });

/** Take a block from the palette, carry it to `point` and click, as the editor does; then settle. */
function place(d, block, point, config) {
  const carried = ED.moverA(ED.coger(d, block, config), CTX, point);
  return settle(ED.pulsar(carried, CTX, FONDO, point));
}
const nodesOf = (d, block) => d.g.nodos.filter((node) => node.tipo === block);
const nodeOf = (d, id) => d.g.nodos.find((node) => node.id === id);
const sizeOf = (node) => { const box = D.caja(node, CTX); return [box.ancho, box.alto]; };
const html = (d) => D.contenido(d, CTX, Gr.tipos(d.g, CAT));

function wire(d, from, fromPort, to, toPort) {
  const result = Gr.conectar(d.g, CAT, { nodo: from, puerto: fromPort, dir: "out" }, { nodo: to, puerto: toPort, dir: "in" });
  assert.ok(!result.motivo, result.motivo);
  return settle({ ...d, g: result.g });
}

/** A constant of `block` with `config`, made as the graph does and put on the diagram. */
function withConstant(d, block, config) {
  const made = Gr.crearNodo(d.g, CAT, block, 0, 0);
  return { d: { ...d, g: config ? Gr.fijarConfig(made.g, made.id, config) : made.g }, id: made.id };
}

/** The measured source: a Cluster Constant of I32 3, TRUE and "hi", made in the editor by dropping its elements. */
function measuredCluster() {
  let d = place(ED.inicial(), CLUSTER_CONSTANT.bloque, { x: 250, y: 250 }, CLUSTER_CONSTANT.config);
  d = ED.confirmar(place(d, "num-const", { x: 250, y: 225 }), CTX);
  d = ED.confirmar([..."3"].reduce(ED.teclear, ED.editar(d, CTX, `${nodesOf(d, "cluster-constant")[0].id}.elements.0`)), CTX);
  d = settle(ED.confirmar(place(d, "bool-const", { x: 250, y: 255 }), CTX));
  // TRUE, as in the measured VI: the element's value is set the way a click on it does.
  const trueElement = `${nodesOf(d, "cluster-constant")[0].id}.elements.1`;
  d = settle({ ...d, g: withElementChanged(d.g, CTX, trueElement, (element) => ({ ...element, config: { ...element.config, value: true } })) });
  d = settle(ED.confirmar(place(d, "str-const", { x: 250, y: 282 }), CTX));
  return { d, source: nodesOf(d, "cluster-constant")[0].id };
}

const bundleOf = (d) => nodesOf(d, "bundle")[0];
const unbundleOf = (d) => nodesOf(d, "unbundle")[0];

test("the Unbundle and Bundle cells of the Cluster, Class & Variant palette drop live nodes", () => {
  for (const [id, block] of [["unbundle", "unbundle"], ["bundle", "bundle"]]) {
    const entry = INV.entrada(`${PALETTE}.${id}`);
    assert.equal(entry.estado, "built");
    assert.equal(entry.bloque, block);
    const d = place(ED.inicial(), block, { x: 400, y: 300 });
    assert.equal(nodesOf(d, block).length, 1);
    const box = D.caja(nodesOf(d, block)[0], CTX);
    assert.ok(Math.abs(box.x + box.ancho / 2 - 400) <= 0.5 && Math.abs(box.y + box.alto / 2 - 300) <= 0.5, "dropped by its centre (unverified)");
  }
});

test("an unwired Bundle is 32 x 17 and each node grows 8 px for a row of the cluster wired to it", () => {
  let d = place(ED.inicial(), "bundle", { x: 400, y: 100 });
  d = place(d, "unbundle", { x: 400, y: 300 });
  assert.deepEqual(sizeOf(bundleOf(d)), [32, 17], "Q3");
  assert.deepEqual(sizeOf(unbundleOf(d)), [32, 17], "Q4: an unwired Unbundle is as tall");
  assert.deepEqual(D.terminales(unbundleOf(d), CTX).map((t) => t.puerto), ["value"], "it has no output until it is wired");
  const heights = [1, 2, 3, 4, 5].map((rows) => sizeOf({ tipo: "bundle", x: 0, y: 0, config: { rows } })[1]);
  assert.deepEqual(heights, [9, 17, 25, 33, 41], "Q1");
  const { d: withCluster, source } = measuredCluster();
  let wired = place(withCluster, "bundle", { x: 600, y: 100 });
  wired = place(wired, "unbundle", { x: 600, y: 300 });
  wired = wire(wire(wired, source, "result", bundleOf(wired).id, "cluster"), source, "result", unbundleOf(wired).id, "value");
  assert.deepEqual([sizeOf(bundleOf(wired)), sizeOf(unbundleOf(wired))], [[32, 25], [32, 25]], "Q3, Q4: three elements");
  const box = D.caja(bundleOf(wired), CTX);
  const at = (node) => D.terminales(node, CTX).map((t) => [t.puerto, t.dir, t.x - D.caja(node, CTX).x, t.y - D.caja(node, CTX).y]);
  assert.deepEqual(at(bundleOf(wired)), [["cluster", "in", 20, 0], ["campo-0", "in", 0, 4.5], ["campo-1", "in", 0, 12.5], ["campo-2", "in", 0, 20.5], ["result", "out", 32, 12.5]], `cluster on the top edge over its cell (box ${box.ancho})`);
  assert.deepEqual(at(unbundleOf(wired)), [["value", "in", 0, 12.5], ["campo-0", "out", 32, 4.5], ["campo-1", "out", 32, 12.5], ["campo-2", "out", 32, 20.5]]);
});

test("the type marks are drawn on the input side of Bundle and the output side of Unbundle in the colours of their types", () => {
  assert.deepEqual(
    ["--bundle-mark-integer", "--bundle-mark-float", "--bundle-mark-boolean", "--bundle-mark-string", "--bundle-separator"].map(oldSchoolToken),
    ["#0000ff", "#ff7f00", "#007f00", "#ff00ff", "#000000"],
    "Q5",
  );
  const { d, source } = measuredCluster();
  let wired = place(place(d, "bundle", { x: 600, y: 100 }), "unbundle", { x: 600, y: 300 });
  wired = wire(wire(wired, source, "result", bundleOf(wired).id, "cluster"), source, "result", unbundleOf(wired).id, "value");
  const marks = (node) => [...BN.body(node, D.caja(node, CTX), Gr.tipos(wired.g, CAT)).matchAll(/<text class="marca-tipo" x="([\d.]+)"[^>]*fill="var\(([\w-]+)\)">(\w+)</g)].map((m) => [m[3], m[2], Number(m[1])]);
  const [bundleMarks, unbundleMarks] = [marks(bundleOf(wired)), marks(unbundleOf(wired))];
  assert.deepEqual(bundleMarks.map(([text, token]) => [text, token]), [["I32", "--bundle-mark-integer"], ["TF", "--bundle-mark-boolean"], ["abc", "--bundle-mark-string"]]);
  assert.ok(bundleMarks.every(([, , x]) => x < 15), "left of the black column at x 15");
  assert.ok(unbundleMarks.every(([, , x]) => x > 16), "right of the black column at x 16");
  const nested = { cluster: [{ name: "", type: "number" }, { name: "", type: { cluster: [{ name: "", type: "i32" }] } }] };
  const body = BN.body({ id: "n", tipo: "unbundle", config: { type: nested } }, { ancho: 32, alto: 17 }, null);
  assert.match(body, /<text[^>]*>DBL</, "DBL");
  assert.match(body, /<g fill="none" stroke="#993300"/, "a nested cluster of numbers only: brown, three cells");
  assert.match(html(wired), /class="glifo-formato"><svg class="formato" viewBox="0 0 32 25"/);
});

test("stretching an unwired Bundle by its bottom handle changes its rows; a wired one and an Unbundle do not stretch", () => {
  let d = place(place(ED.inicial(), "bundle", { x: 400, y: 100 }), "unbundle", { x: 400, y: 300 });
  const bundle = bundleOf(d).id;
  const stretch = (state, id, rows) => {
    const press = ED.pulsar(state, CTX, { tipo: "asa", nodo: id, lado: "abajo" }, { x: 400, y: 200 });
    return settle(ED.soltar(ED.moverA(press, CTX, { x: 400, y: 200 + rows * BN.ROW_PITCH }), CTX, FONDO, { x: 400, y: 200 + rows * BN.ROW_PITCH }));
  };
  d = stretch(d, bundle, 2);
  assert.deepEqual(sizeOf(nodeOf(d, bundle)), [32, 33], "four rows");
  assert.equal(stretch(d, bundle, -10).g.nodos.find((node) => node.id === bundle).config.rows, 1, "never fewer than one");
  assert.match(html(d), /data-nodo="[^"]+" data-asa="abajo"/, "the handle exists");
  const handles = (id) => [...html(d).matchAll(/data-nodo="([^"]+)" data-asa="abajo"/g)].filter((m) => m[1] === id).length;
  assert.equal(handles(unbundleOf(d).id), 0, "Unbundle has no handle");
  // Wired at the top, a stretch changes nothing (Q1).
  const { d: withCluster, source } = measuredCluster();
  const wired = wire(place(withCluster, "bundle", { x: 600, y: 100 }), source, "result", bundleOf(place(withCluster, "bundle", { x: 600, y: 100 })).id, "cluster");
  const same = wired.g.nodos.find((node) => node.tipo === "bundle");
  assert.equal(BN.stretchedRows(wired.g, same.id, 3), wired.g);
  assert.equal(BN.stretchedRows(d.g, unbundleOf(d).id, 3), d.g, "an Unbundle is never stretched");
});

test("wiring a cluster to the top of a Bundle or to an Unbundle reshapes it at once and each wire stays on its row's index", () => {
  const { d: start, source } = measuredCluster();
  let d = place(place(start, "bundle", { x: 600, y: 100 }), "unbundle", { x: 600, y: 300 });
  const [bundle, unbundle] = [bundleOf(d).id, unbundleOf(d).id];
  const made = withConstant(d, "str-const", { value: "yo" });
  d = wire(made.d, made.id, "result", bundle, "campo-1");
  d = wire(wire(d, source, "result", bundle, "cluster"), source, "result", unbundle, "value");
  assert.deepEqual(nodeOf(d, bundle).config.type, nodeOf(d, source).config.type, "DT-098: the copy");
  assert.deepEqual(Gr.tipos(d.g, CAT).salidas.get(`${unbundle}.campo-2`), "string");
  assert.ok(d.g.cables.some((cable) => cable.a.nodo === bundle && cable.a.puerto === "campo-1"), "the wire of row 1 stayed");
  // Deleting the source gives the nodes back their unwired look; undo restores what was settled.
  const without = settle(ED.borrarSeleccion({ ...d, seleccion: [source] }, CTX));
  assert.deepEqual(sizeOf(nodeOf(without, unbundle)), [32, 17]);
  assert.equal(nodeOf(without, unbundle).config?.type, undefined);
});

test("editing the elements of a Cluster Constant reshapes the Bundle and Unbundle wired to it in the editor state", () => {
  const { d: start, source } = measuredCluster();
  let d = place(place(start, "unbundle", { x: 600, y: 300 }), "bundle", { x: 600, y: 100 });
  const [unbundle, bundle] = [unbundleOf(d).id, bundleOf(d).id];
  d = wire(wire(d, source, "result", unbundle, "value"), source, "result", bundle, "cluster");
  const sink = withConstant(d, "const", { value: 0 });
  d = wire({ ...sink.d }, sink.id, "result", bundle, "campo-0");
  const indicator = Gr.crearEnPanel(d.g, CAT, "str-indicator", 500, 20, "text");
  d = wire({ ...d, g: indicator.g }, unbundle, "campo-2", indicator.id, "value");
  assert.equal(sizeOf(nodeOf(d, unbundle))[1], 25);
  // Dropping another numeric constant into the cluster adds a last row to both.
  d = settle(ED.confirmar(place(d, "num-const", { x: 230, y: 215 }), CTX));
  assert.equal(nodeOf(d, source).config.elements.length, 4);
  assert.deepEqual([sizeOf(nodeOf(d, unbundle))[1], sizeOf(nodeOf(d, bundle))[1]], [33, 33], "a new last row on both");
  assert.deepEqual(D.terminales(nodeOf(d, unbundle), CTX).filter((t) => t.dir === "out").map((t) => t.puerto), ["campo-0", "campo-1", "campo-2", "campo-3"]);
  // Deleting the first element leaves each wire on its row's index (Q4): row 0's wire stays, now on the Boolean, and breaks.
  const first = `${source}.elements.0`;
  d = settle(ED.borrarSeleccion({ ...d, seleccion: [first] }, CTX));
  assert.equal(nodeOf(d, source).config.elements.length, 3);
  assert.deepEqual(sizeOf(nodeOf(d, unbundle)), [32, 25]);
  assert.ok(d.g.cables.some((cable) => cable.a.nodo === bundle && cable.a.puerto === "campo-0"), "row 0 kept its wire by index");
  assert.ok(Gr.tipos(d.g, CAT).cables.get(d.g.cables.find((cable) => cable.a.nodo === bundle && cable.a.puerto === "campo-0").id)?.roto, "now broken against the Boolean element");
});

test("the editor window settles every edit with followWiredClusters", () => {
  const source = readFileSync(new URL("../../editor/src/window/editor-window.mjs", import.meta.url), "utf8");
  const settleEdit = /function settleEdit\([\s\S]*?\n}\n/.exec(source)[0];
  assert.match(settleEdit, /followWiredClusters\(/, "cambiarDiagrama and cambiarPanel both call settleEdit, the one place every edit passes");
  assert.match(source, /function cambiarDiagrama[\s\S]*?settleEdit\(/);
  assert.match(source, /function cambiarPanel[\s\S]*?settleEdit\(/);
});

test("Add Input and Remove Input of an unwired Bundle add and remove a row and keep each wire on its row", () => {
  let d = place(ED.inicial(), "bundle", { x: 400, y: 100 });
  const bundle = bundleOf(d).id;
  const two = withConstant(d, "const", { value: 1.5 });
  const text = withConstant(two.d, "str-const", { value: "ab" });
  d = wire(wire(text.d, two.id, "result", bundle, "campo-0"), text.id, "result", bundle, "campo-1");
  const open = (state, port) => ED.abrirMenu(state, D.menuDe(nodeOf(state, bundle), port, state.g), bundle, 0, 0, port);
  const run = (state, row) => ED.orden(state, `${state.menu.raiz}.${row}`, CTX, INV);
  const portOfSource = (state, id) => state.g.cables.find((cable) => cable.de.nodo === id).a.puerto;
  d = settle(run(open(d, "campo-0"), "add-input"));
  assert.equal(sizeOf(bundleOf(d))[1], 25, "a third row");
  assert.deepEqual([portOfSource(d, two.id), portOfSource(d, text.id)], ["campo-0", "campo-2"], "the wire of row 1 moved down with its row");
  d = settle(run(open(d, "campo-0"), "remove-input"));
  assert.equal(sizeOf(bundleOf(d))[1], 17);
  assert.deepEqual(d.g.cables.map((cable) => cable.a.puerto), ["campo-1"], "row 0 went with its wire and the one below moved up");
  // On a Bundle wired at the top both do nothing (Add Input, measured; Remove Input unverified).
  const { d: withCluster, source } = measuredCluster();
  const wired = wire(place(withCluster, "bundle", { x: 600, y: 100 }), source, "result", bundleOf(place(withCluster, "bundle", { x: 600, y: 100 })).id, "cluster");
  const target = wired.g.nodos.find((node) => node.tipo === "bundle").id;
  const menu = ED.abrirMenu(wired, BN.isBundle(nodeOf(wired, target)) ? "context.bundle-row" : "", target, 0, 0, "campo-0");
  assert.equal(ED.orden(menu, "context.bundle-row.add-input", CTX, INV).g, wired.g);
  assert.equal(ED.orden(menu, "context.bundle-row.remove-input", CTX, INV).g, wired.g);
});

test("the menus of Bundle and Unbundle have LabVIEW's rows in their order and grey what is not built", () => {
  let d = place(place(ED.inicial(), "bundle", { x: 400, y: 100 }), "unbundle", { x: 400, y: 300 });
  const [bundle, unbundle] = [bundleOf(d).id, unbundleOf(d).id];
  const open = (id, port) => ED.abrirMenu(d, D.menuDe(nodeOf(d, id), port, d.g), id, 0, 0, port);
  const shownRows = (menu) => {
    const drawing = D.menuContextual(INV, { ...menu.menu, x: 0, y: 0 }, ED.marcados(menu, CTX), (text) => text.length * 6, ED.variantes(menu, CTX));
    return [...drawing.split('<div class="menu-contextual"').find((part) => part.includes(`data-menu="${menu.menu.raiz}"`)).matchAll(/(<div class="separador-menu"[^>]*><\/div>)?<div class="item-menu([^"]*)" data-id="([^"]+)"[^>]*><span class="texto-menu"[^>]*>([^<]*)</g)]
      .map((m) => ({ id: m[3], label: m[4].replaceAll("&amp;", "&"), greyed: /hueco|desactivado/.test(m[2]), separated: !!m[1] }));
  };
  assert.equal(D.menuDe(nodeOf(d, bundle), null, d.g), "context.bundle");
  assert.equal(D.menuDe(nodeOf(d, bundle), "result", d.g), "context.bundle");
  assert.equal(D.menuDe(nodeOf(d, bundle), "campo-0", d.g), "context.bundle-row");
  assert.equal(D.menuDe(nodeOf(d, unbundle), "campo-0", d.g), "context.unbundle");
  const common = ["Visible Items", "Help", "Examples", "Description and Tip...", "---", "Add Breakpoint", "---", "Cluster, Class, & Variant Palette"];
  const tail = ["Create", "---", "Replace", "---", "Remove and Rewire", "---", "Properties"];
  assert.deepEqual(shown(shownRows(open(bundle, null))), [...common, ...tail], "Q6: the Bundle node");
  assert.deepEqual(shown(shownRows(open(unbundle, null))), [...common, ...tail], "Q6: Unbundle's body");
  // An input row has Add Input and Remove Input before Create; Numeric Palette shows on a typed numeric row only.
  const row = shownRows(open(bundle, "campo-0"));
  assert.deepEqual(shown(row), [...common, "Add Input", "Remove Input", ...tail], "an untyped row: no Numeric Palette");
  const greyed = (rows) => rows.filter((entry) => entry.greyed).map((entry) => entry.label);
  assert.deepEqual(greyed(row), ["Help", "Examples", "Description and Tip...", "Cluster, Class, & Variant Palette", "Replace", "Remove and Rewire", "Properties"], "Add Input, Remove Input and Create work; Create's rows are checked in the next test");
  // A typed numeric row has Numeric Palette (Q6), unverified order.
  const made = withConstant(d, "num-const", { type: "i32", value: 1 });
  d = wire(made.d, made.id, "result", bundle, "campo-0");
  assert.ok(shown(shownRows(open(bundle, "campo-0"))).includes("Numeric Palette"));
  assert.ok(!shown(shownRows(open(bundle, "campo-1"))).includes("Numeric Palette"));
  // An Unbundle's output row of a numeric element has it too.
  const { d: withCluster, source } = measuredCluster();
  let wired = place(withCluster, "unbundle", { x: 600, y: 300 });
  wired = wire(wired, source, "result", unbundleOf(wired).id, "value");
  const unbundleMenu = (port) => shown(shownRows(ED.abrirMenu(wired, D.menuDe(unbundleOf(wired), port, wired.g), unbundleOf(wired).id, 0, 0, port)));
  assert.ok(unbundleMenu("campo-0").includes("Numeric Palette"), "row 0 is the I32");
  assert.ok(!unbundleMenu("campo-1").includes("Numeric Palette"), "row 1 is the Boolean");
});

test("Create Indicator and Create Control are greyed while Bundle's output type is undefined, where LabVIEW crashed", () => {
  const d = place(ED.inicial(), "bundle", { x: 400, y: 100 });
  const bundle = bundleOf(d).id;
  const menu = ED.abrirMenu(d, "context.bundle", bundle, 0, 0, "result");
  const rows = (state) => {
    const submenu = menuRows(ED.sobreMenu(state, "context.bundle.create", true), "context.bundle.create");
    return Object.fromEntries(submenu.map((row) => [row.id.slice(row.id.lastIndexOf(".") + 1), row.greyed]));
  };
  assert.deepEqual([rows(menu).constant, rows(menu).control, rows(menu).indicator], [true, true, true]);
  assert.equal(rows(menu)["all-constants"], false);
  const made = withConstant(d, "const", { value: 1.5 });
  const typed = wire(wire(made.d, made.id, "result", bundle, "campo-0"), made.id, "result", bundle, "campo-1");
  const typedMenu = ED.abrirMenu(typed, "context.bundle", bundle, 0, 0, "result");
  assert.deepEqual([rows(typedMenu).constant, rows(typedMenu).control, rows(typedMenu).indicator], [false, false, false], "typed: the three work");
});

test("Create Control and Create Indicator on a typed Bundle make a cluster panel object whose elements have the types and empty labels", () => {
  let d = place(ED.inicial(), "bundle", { x: 400, y: 100 });
  const bundle = bundleOf(d).id;
  const number = withConstant(d, "const", { value: 1.5 });
  const text = withConstant(number.d, "str-const", { value: "ab" });
  d = wire(wire(text.d, number.id, "result", bundle, "campo-0"), text.id, "result", bundle, "campo-1");
  const create = (kind) => ED.orden(ED.abrirMenu(d, "context.bundle", bundle, 0, 0, "result"), `context.bundle.create.${kind}`, CTX, INV);
  const indicator = create("indicator");
  const panel = indicator.g.nodos.find((node) => node.tipo === "cluster-indicator");
  assert.equal(panel.label.text, "output cluster", "named after the output terminal (Q3)");
  assert.deepEqual(panel.config.elements.map((element) => [element.tipo, element.label.text]), [["indicator", ""], ["str-indicator", ""]], "elements of the types, in order, with empty labels");
  assert.deepEqual([panel.panel.w, panel.panel.h], [108, 58], "Q3: 108 x 58");
  assert.ok(indicator.g.cables.some((cable) => cable.de.nodo === bundle && cable.a.nodo === panel.id), "wired to the output");
  const control = create("control").g.nodos.find((node) => node.tipo === "cluster-control");
  assert.deepEqual(control.config.elements.map((element) => element.tipo), ["control", "str-control"]);
  assert.deepEqual(Gr.tipos(indicator.g, CAT).entradas.get(`${panel.id}.value`), Gr.tipos(d.g, CAT).salidas.get(`${bundle}.result`));
});

test("a Cluster Constant on a Bundle's top, a string on row 2 and Create Indicator run to give 3 True yo", async () => {
  const { d: start, source } = measuredCluster();
  let d = place(start, "bundle", { x: 600, y: 100 });
  const bundle = bundleOf(d).id;
  const yo = withConstant(d, "str-const", { value: "yo" });
  d = wire(wire(yo.d, source, "result", bundle, "cluster"), yo.id, "result", bundle, "campo-2");
  d = ED.orden(ED.abrirMenu(d, "context.bundle", bundle, 0, 0, "result"), "context.bundle.create.indicator", CTX, INV);
  const indicator = d.g.nodos.find((node) => node.tipo === "cluster-indicator");
  const compiled = compilar(d.g, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  assert.deepEqual((await ejecutar(compiled, {}))[indicator.id], [3, true, "yo"]);
});

test("a Bundle with an unwired row is listed in the Error list as Contains unwired or bad terminal", () => {
  let d = place(ED.inicial(), "bundle", { x: 400, y: 100 });
  const number = withConstant(d, "const", { value: 1.5 });
  d = wire(number.d, number.id, "result", bundleOf(number.d).id, "campo-0");
  const rows = EL.collect({ graph: d.g, catalog: CAT, resolved: Gr.tipos(d.g, CAT), compileErrors: [], inventory: INV });
  assert.ok(rows.some((row) => row.text.endsWith(": Contains unwired or bad terminal") && row.target.node === bundleOf(d).id), JSON.stringify(rows.map((row) => row.text)));
});
