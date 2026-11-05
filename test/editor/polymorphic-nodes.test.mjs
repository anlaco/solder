// Polymorphic OVI nodes in the editor (DT-074): the node of a `.sdp` is drawn with its own icon, shows its selector
// ring under it on request, has a menu with Select Type ▸, follows what is wired while Automatic is on, and opens
// the instance it calls. Measured in LabVIEW 2026 Q3 on VISA Configure Serial Port
// (labview-captures/reports/2026-11-05-polymorphic-vi.md, 2026-11-05-vilib-and-type-polymorphic.md). The core is in
// test/core/polymorphic.test.mjs; this test builds the same Integer / Double polymorphic OVI.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as G from "../../editor/src/common/glyphs.mjs";
import * as Gr from "../../core/model/graph.mjs";
import * as PN from "../../editor/src/block-diagram/polymorphic-nodes.mjs";
import * as Poly from "../../core/model/polymorphic.mjs";
import * as Q from "../../core/model/qvi-format.mjs";
import * as SN from "../../editor/src/block-diagram/subvi-nodes.mjs";
import { buildHierarchy } from "../../editor/src/window/hierarchy-client.mjs";
import { CAT, INV, RAIZ, buildVI } from "../helpers.mjs";

const CALLER = "/app/main.sdg";
const SDP = "/lib/Step.sdp";
const STORED_SDP = "../lib/Step.sdp";
const measure = (text) => text.length * 7;

const sdpText = (overrides = {}) =>
  Poly.writePolymorphic({
    ...Poly.emptyPolymorphic(),
    instances: [
      { path: "Step (I64).sdg", menuName: "Integer", selectorName: "Integer" },
      { path: "Step (DBL).sdg", menuName: "Double", selectorName: "Double" },
    ],
    ...overrides,
  });

/** An instance: `x` (of `type`) into `step`, out to `result`; x in cell 9 (left edge), result in cell 2 (right edge), LabVIEW's indices of 4-2-2-4. */
const instance = (type, step) =>
  buildVI(CAT, (b) => {
    b.node("x", "control", { type });
    b.node("step", step);
    b.node("result", "indicator", { type });
    b.wire("x.result", "step.x");
    b.wire("step.result", "result.value");
    b.connector([{ name: "x", cell: 9 }], [{ name: "result", cell: 2 }]);
  });
const instanceTexts = () => ({
  "/lib/Step (I64).sdg": Q.aTexto(instance("i64", "increment").g, CAT),
  "/lib/Step (DBL).sdg": Q.aTexto(instance("number", "decrement").g, CAT),
});
/** An instance with an output only: picking it by hand leaves the input terminal without a place. */
const outputOnly = () =>
  buildVI(CAT, (b) => {
    b.node("result", "indicator", { type: "i64" });
    b.connector([], [{ name: "result", cell: 2 }]);
  });

/** A caller at /app/main.sdg whose graph `build(b)` makes, its hierarchy as the page builds it, Automatic already run. */
function callerOf(build, { sdp = sdpText(), texts = instanceTexts() } = {}) {
  const load = (rootGraph) => buildHierarchy({ rootKey: CALLER, rootGraph, texts: { [SDP]: sdp, ...texts }, baseCatalog: CAT, readVI: Q.leer });
  const vi = buildVI(load(Gr.nuevo()).catalog, build);
  const { catalog } = load(vi.g);
  const g = Gr.adaptPolymorphicNodes(vi.g, catalog);
  return { ...vi, g, cat: catalog, ctx: D.contexto(catalog, D.glifosPorBloque(INV), ".", measure) };
}

const CALL = () => Poly.polymorphicNodeConfig(STORED_SDP, Poly.readPolymorphic(sdpText()));
const callNode = (vi) => vi.g.nodos.find((node) => node.id === vi.id.call);
const unwired = (config = {}) => callerOf((b) => b.node("call", "subvi", { ...CALL(), ...config }));
const wiredWith = (type, config = {}) =>
  callerOf((b) => {
    b.node("in", "control", { type });
    b.node("call", "subvi", { ...CALL(), ...config });
    b.node("shown", "indicator");
    b.wire("in.result", "call.cell-9");
    b.wire("call.cell-2", "shown.value");
  });

const htmlOf = (vi, extra = {}) => D.contenido({ ...ED.inicial(), g: vi.g, ...extra }, vi.ctx, Gr.tipos(vi.g, vi.cat));
const menuOf = (vi, extra = {}) => ED.abrirMenu({ ...ED.inicial(), g: vi.g, ...extra }, PN.MENU_ROOT, vi.id.call, 10, 10);
/** The rows a menu draws for `parent` (its root, or an open submenu): `[id, label, classes]` in order. */
function drawnRows(vi, menu, parent = menu.menu.raiz) {
  const html = D.menuContextual(INV, menu.menu, ED.marcados(menu, vi.ctx), measure, ED.variantes(menu, vi.ctx));
  const block = html.split('<div class="menu-contextual').find((part) => part.includes(`data-menu="${parent}"`));
  return [...block.matchAll(/<div class="(item-menu[^"]*)" data-id="([^"]+)"[^>]*><span class="texto-menu"[^>]*>([^<]*)<\/span>/g)].map(([, classes, id, label]) => [id, label, classes]);
}
const inSelectTypeMenu = (vi) => {
  const menu = menuOf(vi);
  return { ...menu, menu: { ...menu.menu, abierto: PN.SELECT_TYPE_ROW } };
};
const ticked = (rows) => rows.filter(([, , classes]) => classes.includes("marcado")).map(([, label]) => label);

// ——— Placing and drawing ———

test("Select a VI accepts a .sdp and a placed one is Automatic, on its first instance, with the selector as the file says", () => {
  const main = readFileSync(path.join(RAIZ, "editor/electron/main.mjs"), "utf8");
  assert.match(main, /OVI_AND_POLYMORPHIC_FILTERS = \[\{ name: "[^"]+", extensions: \[VI_EXTENSION, OLD_VI_EXTENSION, POLYMORPHIC_EXTENSION\]/, "the dialog lists .sdp");
  assert.match(main, /title: "Select an OVI"[^)]*filters: OVI_AND_POLYMORPHIC_FILTERS/);

  const placed = SN.placedConfig(STORED_SDP, sdpText());
  assert.deepEqual(placed, { vi: STORED_SDP, instance: null, selected: 0, selector: false }, "measured: Automatic, the first instance, the selector hidden");
  assert.equal(SN.placedConfig(STORED_SDP, sdpText({ showSelectorByDefault: true })).selector, true, "Show Selector by Default");
  assert.deepEqual(SN.placedConfig("lib/add2.sdg", "not read"), { vi: "lib/add2.sdg" }, "a plain subOVI is as before");
  assert.throws(() => SN.placedConfig(STORED_SDP, "{"), Poly.PolymorphicFileError);

  const vi = unwired();
  assert.deepEqual(callNode(vi).config, placed);
  const box = D.caja(callNode(vi), vi.ctx);
  assert.deepEqual([box.ancho, box.alto], [32, 32], "measured: a 32 x 32 icon");
  assert.doesNotMatch(htmlOf(vi), /selector-polimorfico/, "measured: the selector is hidden when dropped");
  assert.match(htmlOf(vi), /class="glifo-subvi"/);
});

test("the icon of a polymorphic OVI is drawn as an image from a data URI, so nothing inside it runs", () => {
  const icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><script>alert(1)</script><rect width="32" height="32" fill="#123456"/></svg>';
  const own = unwired();
  const withIcon = callerOf((b) => b.node("call", "subvi", CALL()), { sdp: sdpText({ icon }) });
  const html = htmlOf(withIcon);
  const image = html.match(/<div class="glifo-subvi"><img src="(data:image\/svg\+xml;charset=utf-8,[^"]+)" width="32" height="32"/);
  assert.ok(image, "an <img> with a data:image/svg+xml URI");
  assert.equal(decodeURIComponent(image[1].split(",")[1]), icon, "the file's own icon, untouched");
  assert.doesNotMatch(html, /<script/, "the document is not put in the page");

  // No icon in the file: a generic polymorphic icon of our own; "instance": the generic subOVI icon.
  assert.ok(htmlOf(own).includes(G.polymorphicOviIcon()));
  const drawsInstance = callerOf((b) => b.node("call", "subvi", CALL()), { sdp: sdpText({ drawIcon: Poly.DRAW_ICON.INSTANCE, icon }) });
  assert.ok(htmlOf(drawsInstance).includes(G.iconoVI()));
  assert.ok(!htmlOf(drawsInstance).includes("<img"), "the polymorphic icon is not drawn when the instance's is asked for");
});

// ——— The selector ring ———

test("Visible Items Polymorphic OVI Selector shows the ring 1 px under the icon centred on it and as wide as its text", () => {
  const hidden = unwired();
  const opened = menuOf(hidden);
  assert.deepEqual(drawnRows(hidden, { ...opened, menu: { ...opened.menu, abierto: `${PN.MENU_ROOT}.visible-items` } }, `${PN.MENU_ROOT}.visible-items`).map(([, label]) => label), ["Label", "Polymorphic OVI Selector", "Terminals"], "measured: Visible Items ▸ Label, Polymorphic VI Selector, Terminals");
  assert.ok(!ED.marcados(opened, hidden.ctx).has(PN.SELECTOR_ROW), "none ticked by default");

  // The row toggles config.selector, and the ring appears.
  const shown = ED.orden(opened, PN.SELECTOR_ROW, hidden.ctx);
  assert.equal(shown.g.nodos.find((node) => node.id === hidden.id.call).config.selector, true);
  const vi = { ...hidden, g: shown.g };
  const ringHtml = htmlOf(vi).match(/<div class="anillo-instancia selector-polimorfico" data-nodo="[^"]+" style="left:(-?[\d.]+)px;top:(\d+)px;width:(\d+)px;height:(\d+)px"><span class="texto-anillo">([^<]*)<\/span><span class="flecha-anillo">/);
  assert.ok(ringHtml, "the ring with its text and its dropdown triangle");
  const [left, top, width, height] = ringHtml.slice(1, 5).map(Number);
  assert.equal(ringHtml[5], "Integer", "the text is the instance's selector name");
  assert.equal(top, 33, "1 px under the 32 px icon");
  assert.equal(height, 19, "measured: 19 px tall");
  assert.equal(width, "Integer".length * 7 + PN.SELECTOR_TEXT_PADDING, "as wide as its text");
  assert.ok(Math.abs(left - (32 - (left + width))) <= 1, "centred on the icon, which it may be wider than");
  assert.ok(ED.marcados(ED.abrirMenu({ ...ED.inicial(), g: shown.g }, PN.MENU_ROOT, hidden.id.call, 0, 0), vi.ctx).has(PN.SELECTOR_ROW), "ticked once shown");
  assert.deepEqual([D.caja(callNode(vi), vi.ctx).x, D.caja(callNode(vi), vi.ctx).y], [0, 0], "the icon does not move");

  // Toggling again hides it; the ring follows the instance Automatic picks.
  assert.equal(ED.orden(ED.abrirMenu({ ...ED.inicial(), g: shown.g }, PN.MENU_ROOT, hidden.id.call, 0, 0), PN.SELECTOR_ROW, hidden.ctx).g.nodos.find((node) => node.id === hidden.id.call).config.selector, false);
  const withDouble = wiredWith("number", { selector: true });
  assert.match(htmlOf(withDouble), /<span class="texto-anillo">Double<\/span>/);
});

test("the node's bounds with the ring are 190 x 54 for a ring 188 wide, and the icon does not move", () => {
  const longName = "x".repeat(10);
  const vi = callerOf((b) => b.node("call", "subvi", { ...CALL(), selector: true }), { sdp: sdpText({ instances: [{ path: "Step (I64).sdg", menuName: longName, selectorName: longName }, { path: "Step (DBL).sdg", menuName: "Double", selectorName: "Double" }] }) });
  // A font in which that text is 188 - padding wide gives VISA Configure Serial Port's measured ring.
  const visaLike = (text) => (text === longName ? 188 - PN.SELECTOR_TEXT_PADDING : measure(text));
  const ring = PN.selectorRing(longName, visaLike);
  assert.deepEqual([ring.ancho, ring.alto, ring.y], [188, 19, 33]);
  assert.equal(ring.x, Math.floor((32 - 188) / 2), "centred on the icon");
  const bounds = PN.nodeBounds(callNode(vi), vi.cat, visaLike);
  assert.deepEqual([bounds.ancho, bounds.alto], [190, 54], "measured bounds with the ring and its 2 px shadow");
  assert.equal(bounds.x, ring.x, "the bounds reach left of the icon, which stays where it is");
  assert.deepEqual(PN.nodeBounds(callNode(unwired()), unwired().cat, measure), { x: 0, y: 0, ancho: 32, alto: 32 }, "hidden: the icon alone");

  // A rubber band that touches only the ring selects the node.
  const withRing = { ...vi, g: vi.g };
  assert.deepEqual(D.dentroDe(withRing.g, withRing.ctx, { x0: -3, y0: 40, x1: 5, y1: 50 }), [vi.id.call], "the ring is part of the node");
  assert.deepEqual(D.dentroDe(unwired().g, unwired().ctx, { x0: -3, y0: 40, x1: 5, y1: 50 }), [], "the hidden ring is not");
});

test("a click on the ring opens the list of Select Type, picking a row there is the same choice (what the ring opens: unverified)", () => {
  const vi = wiredWith("i32", { selector: true });
  const node = callNode(vi);
  const clicked = ED.pulsar({ ...ED.inicial(), g: vi.g }, vi.ctx, { tipo: "nodo", id: node.id, anillo: true }, { x: 30, y: 50 });
  assert.deepEqual(clicked.lista, { nodo: node.id, x: 30, y: 50 });
  const list = D.contenido(clicked, vi.ctx, Gr.tipos(vi.g, vi.cat));
  const rows = [...list.matchAll(/class="item-menu item-tipo( marcado)?" data-nodo="[^"]+" data-fila="([^"]+)"[^>]*><span class="texto-menu"[^>]*>([^<]*)</g)].map(([, mark, id, label]) => [id, label, !!mark]);
  assert.deepEqual(rows, [[PN.AUTOMATIC_ROW, "Automatic", true], [PN.instanceRow(0), "Integer", false], [PN.instanceRow(1), "Double", false]], "the same rows and ticks as Select Type");
  assert.equal((list.match(/separador-menu/g) ?? []).length, 1, "a separator after Automatic");

  const picked = ED.pulsar(clicked, vi.ctx, { tipo: "fila-tipo", nodo: node.id, fila: PN.instanceRow(1) }, { x: 0, y: 0 });
  assert.equal(picked.lista, null);
  assert.equal(picked.g.nodos.find((n) => n.id === node.id).config.instance, 1);
});

// ——— The menu ———

test("the menu of a polymorphic subOVI node has LabVIEW's rows in its order", () => {
  const vi = unwired();
  assert.equal(D.menuDe(callNode(vi), null, vi.g), PN.MENU_ROOT);
  assert.equal(D.menuDe({ tipo: "subvi", config: { vi: "lib/add2.sdg" } }, null, vi.g), "context.subvi", "a plain subOVI keeps its menu");
  const rows = INV.hijos(PN.MENU_ROOT).map((entry) => `${entry.separado ? "| " : ""}${entry.etiqueta}`);
  // Disable Breakpoint is declared after Add Breakpoint and drawn only on a node that has a breakpoint.
  assert.deepEqual(rows, [
    "Visible Items", "Help", "Examples", "Description and Tip...", "| Add Breakpoint", "Disable Breakpoint", "| Numeric Palette", "Create", "| Replace", "Replace with SubOVI Contents...",
    "| Select Type", "Relink To SubOVI", "SubOVI Node Setup...", "Call Setup...", "| Find All Instances", "Open Front Panel", "Open Polymorphic OVI", "Show OVI Hierarchy", "Explore...",
    "| View As Icon", "| Remove and Rewire", "| Properties",
  ], "measured order");
  assert.deepEqual(INV.hijos(`${PN.MENU_ROOT}.visible-items`).map((entry) => entry.etiqueta), ["Label", "Polymorphic OVI Selector", "Terminals"]);
  assert.deepEqual(INV.hijos(`${PN.MENU_ROOT}.create`).map((entry) => entry.etiqueta), INV.hijos("context.subvi.create").map((entry) => entry.etiqueta), "Create is the subOVI node's");
  // The plain subOVI menu has neither Select Type nor Open Polymorphic OVI (measured on a vi.lib subVI).
  assert.deepEqual(INV.hijos("context.subvi").map((entry) => entry.etiqueta).filter((label) => /Select Type|Polymorphic/.test(label)), []);

  // What is done and what is greyed with its reason (rule 1).
  assert.deepEqual(INV.hijos(PN.MENU_ROOT).filter((entry) => entry.estado === "built").map((entry) => entry.etiqueta), ["Visible Items", "Add Breakpoint", "Disable Breakpoint", "Create", "Select Type", "Open Front Panel", "Open Polymorphic OVI"]);
  // Open Polymorphic OVI opens the window that edits the .sdp (spec rule 122; tested in polymorphic-window.test.mjs).
  assert.equal(INV.entrada(`${PN.MENU_ROOT}.open-polymorphic-ovi`).estado, "built");
  const drawn = drawnRows(vi, menuOf(vi)).map(([id, label, classes]) => [label, classes.includes("hueco")]);
  assert.deepEqual(drawn.find(([label]) => label === "Open Polymorphic OVI"), ["Open Polymorphic OVI", false], "done");
  assert.deepEqual(drawn.find(([label]) => label === "Select Type"), ["Select Type", false]);
  assert.deepEqual(drawn.find(([label]) => label === "Relink To SubOVI"), ["Relink To SubOVI", true], "measured grey, and not done");
  assert.deepEqual(drawn.find(([label]) => label === "Call Setup..."), ["Call Setup...", true]);
  // View As Icon is ticked, as in the subOVI node's.
  assert.ok(ED.marcados(menuOf(vi), vi.ctx).has(`${PN.MENU_ROOT}.view-as-icon`));
});

test("Select Type lists Automatic then the instances and ticks only Automatic while it is on", () => {
  // Automatic picked Double (a DBL is wired), yet only Automatic is ticked.
  const automatic = wiredWith("number");
  assert.equal(callNode(automatic).config.selected, 1);
  const rows = drawnRows(automatic, inSelectTypeMenu(automatic), PN.SELECT_TYPE_ROW);
  assert.deepEqual(rows.map(([id, label]) => [id, label]), [[PN.AUTOMATIC_ROW, "Automatic"], [PN.instanceRow(0), "Integer"], [PN.instanceRow(1), "Double"]], "Automatic, a separator, then each instance's menu name in order");
  assert.deepEqual(ticked(rows), ["Automatic"], "measured: with Automatic on only Automatic is ticked, whatever it picked");
  const html = D.menuContextual(INV, inSelectTypeMenu(automatic).menu, new Set(), measure, ED.variantes(inSelectTypeMenu(automatic), automatic.ctx));
  assert.equal((html.match(/separador-menu/g) ?? []).length >= 1, true);
  assert.match(html, new RegExp(`data-id="${PN.SELECT_TYPE_ROW}"[^>]*><span class="texto-menu"[^>]*>Select Type</span>`));

  // By hand: that instance is ticked and Automatic is not.
  const byHand = wiredWith("i32", { instance: 1 });
  assert.deepEqual(ticked(drawnRows(byHand, inSelectTypeMenu(byHand), PN.SELECT_TYPE_ROW)), ["Double"]);
});

test("picking an instance in Select Type turns Automatic off, and a wire it does not take breaks", () => {
  const vi = wiredWith("i32");
  assert.equal(callNode(vi).config.instance, null);
  const opened = menuOf(vi);
  const picked = ED.orden(opened, PN.instanceRow(1), vi.ctx);
  assert.equal(picked.menu, null, "the menu closes");
  const node = picked.g.nodos.find((n) => n.id === vi.id.call);
  assert.equal(node.config.instance, 1, "Automatic is off and the instance is the one picked");
  assert.ok(Poly.isAutomatic(callNode(vi), Poly.readPolymorphic(sdpText())) && !Poly.isAutomatic(node, Poly.readPolymorphic(sdpText())));
  // Double takes a DBL; the I32 wire is coerced (not broken); a string would break it.
  const broken = callerOf((b) => {
    b.node("in", "str-control");
    b.node("call", "subvi", CALL());
    b.wire("in.result", "call.cell-9");
  });
  const brokenPicked = ED.orden(menuOf(broken), PN.instanceRow(0), broken.ctx);
  const wire = brokenPicked.g.cables[0];
  assert.match(Gr.tipos(brokenPicked.g, broken.cat).cables.get(wire.id).roto, /^You have connected two terminals of different types\. The instance "Integer" expects/);

  // Automatic again: instance null and Automatic runs at once, picking from what is wired.
  const hand = wiredWith("number", { instance: 0 });
  assert.equal(callNode(hand).config.instance, 0);
  const again = ED.orden(menuOf(hand), PN.AUTOMATIC_ROW, hand.ctx);
  const back = again.g.nodos.find((n) => n.id === hand.id.call);
  assert.deepEqual([back.config.instance, back.config.selected], [null, 1], "Automatic on, and it picked Double for the DBL");
  assert.ok(ED.marcados(ED.abrirMenu(again, PN.MENU_ROOT, hand.id.call, 0, 0), hand.ctx).has(PN.AUTOMATIC_ROW));
});

test("a wire to a terminal the chosen instance lacks is loosened where the terminal was drawn", () => {
  const FILES = { ...instanceTexts(), "/lib/Step (I64).sdg": Q.aTexto(instance("i64", "increment").g, CAT), "/lib/Step (DBL).sdg": Q.aTexto(outputOnly().g, CAT) };
  const vi = callerOf((b) => {
    b.node("in", "control", { type: "i32" });
    b.node("call", "subvi", CALL());
    b.wire("in.result", "call.cell-9");
  }, { texts: FILES });
  const hand = ED.orden(menuOf(vi), PN.instanceRow(1), vi.ctx);
  const [wire] = hand.g.cables;
  assert.ok(Gr.esSuelto(wire.a), "the wire keeps its source and loses its sink");
  assert.deepEqual(wire.a.suelto, [0, 20], "the loose end is where the terminal was, on the left edge of the icon at its cell's middle");
  assert.equal(Gr.tipos(hand.g, vi.cat).cables.get(wire.id).roto, Gr.LOOSE_WIRE_REASONS.looseEnd);
});

test("Automatic is greyed in Select Type, and the ring's list, when the polymorphic OVI does not adapt to the data type", () => {
  const fixed = callerOf((b) => b.node("call", "subvi", { ...CALL(), instance: 1 }), { sdp: sdpText({ adaptToDataType: false }) });
  const rows = drawnRows(fixed, inSelectTypeMenu(fixed), PN.SELECT_TYPE_ROW);
  assert.ok(rows.find(([id]) => id === PN.AUTOMATIC_ROW)[2].includes("desactivado"));
  assert.ok(!rows.find(([id]) => id === PN.instanceRow(0))[2].includes("desactivado"));
  assert.deepEqual(ticked(rows), ["Double"], "it keeps the instance it calls");
  // The ring's list does nothing on the greyed row.
  const opened = { ...ED.inicial(), g: fixed.g, lista: { nodo: fixed.id.call, x: 0, y: 0 } };
  assert.equal(ED.pulsar(opened, fixed.ctx, { tipo: "fila-tipo", nodo: fixed.id.call, fila: PN.AUTOMATIC_ROW }, { x: 0, y: 0 }).g, fixed.g);
});

// ——— Automatic follows the diagram ———

test("every edit is settled: Automatic follows what is wired, and nothing changes when nothing is polymorphic", () => {
  const vi = callerOf((b) => {
    b.node("in", "control", { type: "number" });
    b.node("call", "subvi", CALL());
  });
  assert.equal(callNode(vi).config.selected, 0, "unwired, the first instance");
  const wired = Gr.conectar(vi.g, vi.cat, { nodo: vi.id.in, puerto: "result", dir: "out" }, { nodo: vi.id.call, puerto: "cell-9", dir: "in" }).g;
  const settled = PN.settlePolymorphicNodes(vi.g, wired, vi.cat, ED.terminalPlacer(vi.ctx));
  assert.equal(settled.nodos.find((n) => n.id === vi.id.call).config.selected, 1, "a DBL is wired: Double");
  assert.equal(PN.settlePolymorphicNodes(wired, settled, vi.cat, ED.terminalPlacer(vi.ctx)), settled, "settled again: the same graph, so no extra undo step");
  // Unwiring goes back to the first instance.
  const unwiredAgain = PN.settlePolymorphicNodes(settled, { ...settled, cables: [] }, vi.cat, ED.terminalPlacer(vi.ctx));
  assert.equal(unwiredAgain.nodos.find((n) => n.id === vi.id.call).config.selected, 0);

  const plain = buildVI(CAT, (b) => b.node("c", "control"));
  assert.equal(PN.settlePolymorphicNodes(plain.g, plain.g, CAT, ED.terminalPlacer(vi.ctx)), plain.g, "a diagram with no polymorphic node is returned as it is");
  // The page does it in one place, for every edit, a received graph and a rebuilt hierarchy.
  const page = readFileSync(path.join(RAIZ, "editor/src/window/editor-window.mjs"), "utf8");
  assert.equal((page.match(/PolymorphicNodes\.settlePolymorphicNodes/g) ?? []).length, 1, "one call, in the function every edit passes through");
  assert.ok(page.includes("settleEdit(dia, nuevo)") && page.includes("settleEdit(pan, nuevo)"));
  assert.match(page, /aflojarCablesHuerfanos\(Gr\.adaptPolymorphicNodes\(g, cat\), cat, placeOfOldTerminal\)/, "a rebuilt hierarchy adapts too");
});

// ——— Opening ———

test("double-click and Open Front Panel open the instance the node calls, not the sdp", () => {
  const automatic = wiredWith("number");
  assert.equal(SN.fileToOpen(callNode(automatic), automatic.cat, CALLER), "/lib/Step (DBL).sdg", "the instance Automatic picked, as an absolute path");
  const byHand = wiredWith("number", { instance: 0 });
  assert.equal(SN.fileToOpen(callNode(byHand), byHand.cat, CALLER), "/lib/Step (I64).sdg", "the instance picked by hand");
  assert.equal(automatic.cat.calleeOf(callNode(automatic)).key, "/lib/Step (DBL).sdg");
  // A plain subOVI is resolved against its caller, as before; a node without an OVI opens nothing.
  const plain = { tipo: "subvi", config: { vi: "lib/add2.sdg" } };
  assert.equal(SN.fileToOpen(plain, automatic.cat, CALLER), "/app/lib/add2.sdg");
  assert.equal(SN.fileToOpen({ tipo: "subvi", config: {} }, automatic.cat, CALLER), null);
  // Both the double-click and the menu row go through the page's abrirSubVI.
  const page = readFileSync(path.join(RAIZ, "editor/src/window/editor-window.mjs"), "utf8");
  assert.match(page, /"open-front-panel": \(nodeId\) => abrirSubVI\(nodeId\)/);
  assert.match(page, /ev\.detail >= 2 && sobreDiagrama\.tipo === "nodo" && SN\.isSubVI\(.*\)\) return abrirSubVI\(sobreDiagrama\.id\)/);
});

test("a saved caller reopens with its polymorphic node on the instance Automatic picked", () => {
  const vi = wiredWith("number");
  const text = Q.aTexto(vi.g, vi.cat);
  const reopened = buildHierarchy({ rootKey: CALLER, rootText: text, texts: { [SDP]: sdpText(), ...instanceTexts() }, baseCatalog: CAT, readVI: Q.leer });
  assert.deepEqual(reopened.errors, []);
  assert.equal(reopened.graph.nodos.find((n) => n.tipo === "subvi").config.selected, 1);
});

// ——— The palette ———

const SERIAL_PALETTE_ENTRIES = [
  "palette.functions.instrument-io.serial.visa-configure-serial-port",
  "palette.functions.instrument-io.visa.visa-advanced.bus-interface-specific.serial.visa-configure-serial-port",
];

test("a palette element of a subOVI places a polymorphic node from both Serial palettes on Automatic with the selector hidden, its file read first", async () => {
  const { readFile } = await import("node:fs/promises");
  const Paths = await import("../../editor/src/common/vi-paths.mjs");
  const oviLibRoot = path.join(RAIZ, "ovi.lib").replaceAll("\\", "/");
  const readText = (key) => readFile(key, "utf8").catch(() => null);

  for (const id of SERIAL_PALETTE_ENTRIES) {
    const entry = INV.resolver(id);
    assert.equal(entry.bloque, "subvi", id);
    assert.equal(entry.config.vi, "<ovilib>/Instr/VISA Configure Serial Port.sdp", "named by the symbolic path of ovi.lib");
    // Measured: dropped from the palette it is Automatic, on the first instance, with the selector hidden.
    const absolute = Paths.resolveRelative(CALLER, entry.config.vi, oviLibRoot);
    const sdpText = await readText(absolute);
    assert.ok(sdpText, `${absolute} is shipped`);
    assert.deepEqual(entry.config, Poly.polymorphicNodeConfig(entry.config.vi, Poly.readPolymorphic(sdpText)), `${id} is what Select a VI... would place`);
    assert.deepEqual([entry.config.instance, entry.config.selected, entry.config.selector], [null, 0, false]);

    // The page reads the callee's texts before the node is carried, so it is drawn with its icon and its terminals at once.
    const { texts } = await Paths.readHierarchyTexts(absolute, sdpText, readText, oviLibRoot);
    const allTexts = { ...texts, [absolute]: sdpText };
    const empty = buildHierarchy({ rootKey: CALLER, rootGraph: Gr.nuevo(), texts: allTexts, baseCatalog: CAT, readVI: Q.leer, oviLibRoot });
    const ctx = D.contexto(empty.catalog, D.glifosPorBloque(INV), ".", measure);
    let d = ED.moverA(ED.coger({ ...ED.inicial(), g: empty.graph }, entry.bloque, entry.config), ctx, { x: 204, y: 104 });
    d = ED.pulsar(d, ctx, { tipo: "fondo" }, { x: 204, y: 104 });
    const [node] = d.g.nodos;
    assert.deepEqual([node.tipo, node.config], ["subvi", entry.config]);
    const placed = buildHierarchy({ rootKey: CALLER, rootGraph: d.g, texts: allTexts, baseCatalog: CAT, readVI: Q.leer, oviLibRoot });
    assert.deepEqual(placed.errors, []);
    assert.ok(placed.catalog.polymorphicOf(node), "a polymorphic node");
    const ports = placed.catalog.puertos(node);
    assert.ok(ports.in.length + ports.out.length > 0, "it has its terminals");
    assert.ok(ports.in.every((port) => port.name.startsWith("cell-")), "named by connector cell");
    const html = D.contenido(d, D.contexto(placed.catalog, D.glifosPorBloque(INV), ".", measure), Gr.tipos(d.g, placed.catalog));
    assert.match(html, /class="glifo-subvi"/);
    assert.doesNotMatch(html, /selector-polimorfico/, "the selector is hidden");
    assert.doesNotMatch(html, /stroke-dasharray="3 2"/, "not the broken icon of a file that was not found");
  }

  // Both entries go through the one function that reads the file before the node is carried.
  const page = readFileSync(path.join(RAIZ, "editor/src/window/editor-window.mjs"), "utf8");
  assert.match(page, /if \(conDiagrama && e\.bloque === "subvi"\) \{\n\s+carrySubVIFromPalette\(e, punto\(ev\)\);/);
  assert.match(page, /textosDeVI\(Paths\.resolveRelative\(viKey, entry\.config\.vi, oviLibRoot\)\)/);
});
