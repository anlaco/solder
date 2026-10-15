// Unbundle By Name as a node of the Block Diagram, measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-10-15-cluster-palette.md, stage 1: the unwired look, and
// 2026-10-15-unbundle-by-name.md, stage 2: the wired behaviour): its size, rows, terminals, the
// stretching, the list of names and the two right-click menus. No browser needed.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import { caja, contexto, glifosPorBloque, terminales } from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as H from "../../editor/src/block-diagram/undo-history.mjs";
import * as UN from "../../editor/src/block-diagram/unbundle-by-name.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { COLORES } from "../../core/model/types.mjs";
import { esHueco } from "../../editor/src/common/labview-inventory.mjs";
import { CAT, INV } from "../helpers.mjs";

/**
 * The width of a text in the font of LabVIEW, as far as these tests need it: the narrow letters of
 * "status" make it shorter than "source" by the 3 px the node is (55 against 58 px wide).
 */
// The widths the editor's own font gives these names, measured in the running editor under Xvfb on
// 2026-10-15 (labview-captures/cluster/editor-12 and editor-14: 57 and 60 px wide with 7 px of room);
// other texts, roughly.
const EDITOR_FONT_WIDTHS = { status: 33, source: 36 };
const measure = (text) => EDITOR_FONT_WIDTHS[text] ?? [...text].length * 6.1;
const CTX = contexto(CAT, glifosPorBloque(INV), ",", measure);
const FONDO = { tipo: "fondo" };
const ROW_STEP = 16;
const MENU_ID = "palette.functions.programming.cluster-class-and-variant.unbundle-by-name";

const nodeOf = (d, id) => d.g.nodos.find((n) => n.id === id);
const boxOf = (d, id) => caja(nodeOf(d, id), CTX);
const sizeOf = (d, id) => [boxOf(d, id).ancho, boxOf(d, id).alto];
const items = (d, id) => nodeOf(d, id).config.items;

/** A diagram with a fresh Unbundle By Name (picked from the palette and clicked on the canvas) and an Error Cluster Constant. */
function freshDiagram() {
  let d = ED.coger(ED.inicial(), "unbundle-by-name");
  d = ED.moverA(d, CTX, { x: 400, y: 300 });
  d = ED.pulsar(d, CTX, FONDO, { x: 400, y: 300 });
  const unbundle = d.g.nodos[0].id;
  const constant = Gr.crearNodo(d.g, CAT, "error-cluster-constant", 0, 200);
  return { d: { ...d, g: constant.g }, unbundle, constant: constant.id };
}

const wireCluster = (d, constant, unbundle) => ({ ...d, g: Gr.conectar(d.g, CAT, { nodo: constant, puerto: "result", dir: "out" }, { nodo: unbundle, puerto: "cluster", dir: "in" }).g });

/** The node wired to an error cluster, with `rows` rows. */
function wired(rows = 1) {
  const { d, unbundle, constant } = freshDiagram();
  const wiredDiagram = wireCluster(d, constant, unbundle);
  return { d: { ...wiredDiagram, g: Gr.resizeUnbundleRows(wiredDiagram.g, CAT, unbundle, rows) }, unbundle, constant };
}

/** Stretches the node by its bottom handle by `delta` px. */
function stretch(d, id, delta) {
  d = { ...d, seleccion: [id] };
  d = ED.pulsar(d, CTX, { tipo: "asa", nodo: id, lado: "abajo" }, { x: 100, y: 100 });
  d = ED.moverA(d, CTX, { x: 100, y: 100 + delta });
  return ED.soltar(d, CTX, FONDO, { x: 100, y: 100 + delta });
}

const html = (d) => D.contenido(d, CTX, Gr.tipos(d.g, CAT));

test("Unbundle By Name is placed from the palette with its terminals", () => {
  const entry = INV.entrada(MENU_ID);
  assert.equal(entry.estado, "built");
  assert.equal(entry.bloque, "unbundle-by-name");
  assert.equal(INV.entradas.filter((e) => e.id.startsWith(`${MENU_ID.slice(0, MENU_ID.lastIndexOf("."))}.`) && !esHueco(e)).length, 1, "the other entries of the folder stay holes");
  const { d, unbundle } = freshDiagram();
  // Fresh and unwired: 30 by 17, centred on the click (stage 1, d1.png), only the input terminal.
  assert.deepEqual(sizeOf(d, unbundle), [30, 17]);
  const box = boxOf(d, unbundle);
  assert.ok(Math.abs(box.x + box.ancho / 2 - 400) <= 0.5 && Math.abs(box.y + box.alto / 2 - 300) <= 0.5, "centred on the click, to the pixel");
  const spots = terminales(nodeOf(d, unbundle), CTX);
  assert.deepEqual(spots.map((t) => [t.puerto, t.dir, t.etiqueta]), [["cluster", "in", "cluster of named"]]);
  assert.deepEqual([spots[0].x - box.x, spots[0].y - box.y], [0, 8.5], "on the left edge");
});

test("a fresh node draws a yellow arrow cell and a plain white part with no names", () => {
  const { d } = freshDiagram();
  const drawing = html(d);
  assert.match(drawing, /fill="#FFFFCC"/);
  assert.match(drawing, /stroke="#4C4C3D"/);
  assert.doesNotMatch(drawing, /nombre-fila/, "no names");
  assert.doesNotMatch(drawing, /fila-nombre/, "no row to click");
});

test("wired to the error cluster the node is 55 px wide, and 58 once source is a row (the height is 16 per row plus 1)", () => {
  const { d, unbundle } = wired(1);
  assert.deepEqual(items(d, unbundle), ["status"]);
  assert.deepEqual(sizeOf(d, unbundle), [55, 17]);
  const two = { ...d, g: Gr.resizeUnbundleRows(d.g, CAT, unbundle, 2) };
  assert.deepEqual(items(two, unbundle), ["status", "code"]);
  assert.deepEqual(sizeOf(two, unbundle), [55, 33]);
  const three = { ...d, g: Gr.resizeUnbundleRows(d.g, CAT, unbundle, 3) };
  assert.deepEqual(sizeOf(three, unbundle), [58, 49]);
  const five = { ...d, g: Gr.resizeUnbundleRows(d.g, CAT, unbundle, 5) };
  assert.deepEqual(sizeOf(five, unbundle), [58, 81]);
});

test("each name is written in the colour of the type of its element, and black when it has no type", () => {
  const { d, unbundle } = wired(3);
  const namesWithColors = (state) => [...html(state).matchAll(/class="nombre-fila"[^>]*fill="(#[0-9a-fA-F]+)">([^<]+)</g)].map((m) => [m[2], m[1].toLowerCase()]);
  assert.deepEqual(namesWithColors(d), [["status", COLORES.booleano], ["code", COLORES.entero], ["source", COLORES.cadena]]);
  // Unwired but still named: the names stay and have no type (unverified in LabVIEW: drawn in black).
  const unwired = { ...d, g: Gr.borrar(d.g, d.g.cables.map((c) => c.id)) };
  assert.deepEqual(namesWithColors(unwired).map(([, color]) => color), ["#000000", "#000000", "#000000"]);
});

test("a wired node has a 16 px arrow cell, a black divider and a black line between rows", () => {
  const { d } = wired(3);
  const drawing = html(d);
  assert.match(drawing, /<rect x="1" y="1" width="15" height="47" fill="#FFFFCC"\/>/, "1 px of outline and 15 px of yellow");
  const lines = [...drawing.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"\/>/g)].map((m) => m.slice(1).map(Number));
  assert.deepEqual(lines[0], [15.5, 1, 15.5, 48], "the divider between the arrow cell and the names");
  assert.deepEqual(lines.slice(1).map(([, y]) => y), [ROW_STEP + 0.5, 2 * ROW_STEP + 0.5], "one line between each pair of rows, 16 px apart");
  assert.match(drawing, /<g stroke="#000000"/);
});

test("the node has one output terminal per named row, centred on it, and the input on the left", () => {
  const { d, unbundle } = wired(3);
  const box = boxOf(d, unbundle);
  const spots = terminales(nodeOf(d, unbundle), CTX);
  assert.deepEqual(spots.map((t) => t.puerto), ["cluster", "element-0", "element-1", "element-2"]);
  assert.deepEqual(spots.map((t) => t.etiqueta), ["cluster of named", "status", "code", "source"], "a tip carries the name of its row");
  assert.deepEqual(spots.slice(1).map((t) => [t.x - box.x, t.y - box.y]), [[58, 8.5], [58, 24.5], [58, 40.5]], "at the right edge, 16 px apart");
  assert.deepEqual([spots[0].x - box.x, spots[0].y - box.y], [0, box.alto / 2], "the input on the left");
  assert.equal(html(d).match(/class="fila-nombre"/g).length, 3, "a strip to click per row");
});

test("the handle is 6 by 6 at the middle of the bottom edge with its top 3 px above it, and shows when the selected node is hovered", () => {
  const { d, unbundle } = wired(1);
  assert.deepEqual(UN.unbundleHandle({ ancho: 55, alto: 17 }), { x: 24.5, y: 14 });
  assert.match(html({ ...d, seleccion: [unbundle], sobre: { nodo: unbundle } }), /class="asa" data-nodo="[^"]+" data-asa="abajo" style="left:24\.5px;top:14px;width:6px;height:6px"/);
  assert.match(html({ ...d, seleccion: [] }), /class="asa oculta"[^>]*data-asa="abajo"/, "unseen until hovered");
});

test("dragging the handle changes the rows in steps of 16 px, and one Undo takes the whole stretch back", () => {
  const { d, unbundle } = wired(1);
  const grown = stretch(d, unbundle, 2 * ROW_STEP + 5);
  assert.deepEqual(items(grown, unbundle), ["status", "code", "source"], "two rows more, named after the one above");
  assert.deepEqual(sizeOf(grown, unbundle), [58, 49]);
  const half = stretch(d, unbundle, 6);
  assert.equal(items(half, unbundle).length, 1, "less than half a step changes nothing");
  const shrunk = stretch(grown, unbundle, -10 * ROW_STEP);
  assert.equal(items(shrunk, unbundle).length, 1, "never fewer than one row");
  // The gesture is one step of undo.
  const history = H.registrar(H.nuevo(d.g), grown.g);
  assert.equal(H.deshacer(history).g, d.g);
});

test("a click on a name row drops the list of the names of the cluster, with a check on the current one", () => {
  const { d, unbundle } = wired(2);
  const onRow = ED.pulsar(d, CTX, { tipo: "nodo", id: unbundle, fila: 1 }, { x: 410, y: 310 });
  assert.deepEqual(onRow.lista, { nodo: unbundle, x: 410, y: 310, fila: 1 });
  const popup = html(onRow);
  assert.deepEqual([...popup.matchAll(/class="item-menu item-elemento(?: marcado)?"/g)].length, 3);
  assert.match(popup, /item-elemento marcado" data-nodo="[^"]+" data-elemento="1"/, "the check is on code, the current name of row 1");
  assert.deepEqual([...popup.matchAll(/class="texto-menu"[^>]*>(\w+)</g)].map((m) => m[1]), ["status", "code", "source"], "in the order of the cluster");
  const height = Number(/lista-marcos" style="[^"]*height:([\d.]+)px/.exec(popup)[1]);
  assert.equal(Math.round(height), 61, "three names are 61 px tall");
  // 22 px before the longest name and 25 after it, as in LabVIEW's 83 x 61 (cluster/w13.png).
  const width = Number(/lista-marcos" style="[^"]*width:([\d.]+)px/.exec(popup)[1]);
  assert.equal(width, Number((D.MEDIDAS_MENU.texto + Math.max(...["status", "code", "source"].map(CTX.medir)) + 29).toFixed(2)));
  // Choosing a name changes only that row, and closes the list.
  const chosen = ED.pulsar(onRow, CTX, { tipo: "fila-elemento", nodo: unbundle, k: 2 }, { x: 410, y: 340 });
  assert.deepEqual(items(chosen, unbundle), ["status", "source"]);
  assert.equal(chosen.lista, null);
  // Clicking elsewhere closes it without changes.
  assert.equal(ED.pulsar(onRow, CTX, FONDO, { x: 0, y: 0 }).g, d.g);
});

test("unwired, a click on the node opens no list", () => {
  const { d, unbundle } = wired(1);
  const unwired = { ...d, g: Gr.borrar(d.g, d.g.cables.map((c) => c.id)) };
  const clicked = ED.pulsar(unwired, CTX, { tipo: "nodo", id: unbundle, fila: 0 }, { x: 410, y: 310 });
  assert.equal(clicked.lista, undefined);
});

/** The rows of a right-click menu, with the ones that are greyed marked, and where a separator comes before them. */
function menuRows(d, variants) {
  const drawing = D.menuContextual(INV, { ...d.menu, x: 0, y: 0 }, ED.marcados(d, CTX), measure, variants);
  return [...drawing.matchAll(/(<div class="separador-menu"[^>]*><\/div>)?<div class="item-menu([^"]*)" data-id="([^"]+)"[^>]*><span class="texto-menu"[^>]*>([^<]*)</g)].map((m) => ({ id: m[3], label: m[4].replaceAll("&amp;", "&"), greyed: /hueco|desactivado/.test(m[2]), separated: !!m[1], checked: /marcado/.test(m[2]) }));
}
const open = (d, unbundle, puerto) => ED.abrirMenu(d, D.menuDe(nodeOf(d, unbundle), puerto, d.g), unbundle, 0, 0, puerto);
const shown = (rows) => rows.map((r) => (r.separated ? ["---", r.label] : [r.label])).flat();

test("the menus of Unbundle By Name have LabVIEW's rows in their order", () => {
  const { d, unbundle } = wired(3);
  // A name row and its output terminal have the row menu; the arrow cell, the body menu.
  assert.equal(D.menuDe(nodeOf(d, unbundle), "element-1", d.g), "context.unbundle-by-name-row");
  assert.equal(D.menuDe(nodeOf(d, unbundle), null, d.g), "context.unbundle-by-name");
  assert.equal(D.menuDe(nodeOf(d, unbundle), "cluster", d.g), "context.unbundle-by-name", "the input terminal has the body menu");
  const rowMenu = open(d, unbundle, "element-1");
  assert.deepEqual(shown(menuRows(rowMenu, ED.variantes(rowMenu, CTX))), [
    "Visible Items", "Help", "Examples", "Description and Tip...", "---", "Add Breakpoint", "---", "Select Item", "Add Element", "Remove Element",
    "Cluster, Class, & Variant Palette", "Numeric Palette", "Create", "---", "Replace", "Hide Full Names", "---", "Remove and Rewire", "---", "Properties",
  ]);
  const bodyMenu = open(d, unbundle, null);
  assert.deepEqual(shown(menuRows(bodyMenu, ED.variantes(bodyMenu, CTX))), [
    "Visible Items", "Help", "Examples", "Description and Tip...", "---", "Add Breakpoint", "---", "Dialog & User Interface Palette", "Cluster, Class, & Variant Palette",
    "Create", "---", "Replace", "Hide Full Names", "---", "Remove and Rewire", "---", "Properties",
  ]);
});

test("the row menu names the palette of the type of its row", () => {
  const { d, unbundle } = wired(3);
  const label = (port) => {
    const menu = open(d, unbundle, port);
    return menuRows(menu, ED.variantes(menu, CTX)).find((r) => r.id.endsWith(".type-palette")).label;
  };
  assert.deepEqual(["element-0", "element-1", "element-2"].map(label), ["Boolean Palette", "Numeric Palette", "String Palette"]);
});

test("what is not built is greyed in the menus and says what it waits for; Select Item, Remove Element and Create work", () => {
  const { d, unbundle } = wired(2);
  const menu = open(d, unbundle, "element-0");
  const rows = Object.fromEntries(menuRows(menu, ED.variantes(menu, CTX)).map((r) => [r.id.slice(r.id.lastIndexOf(".") + 1), r.greyed]));
  for (const greyed of ["help", "examples", "description-and-tip", "add-element", "cluster-class-and-variant-palette", "type-palette", "replace", "hide-full-names", "remove-and-rewire", "properties"]) assert.ok(rows[greyed], `${greyed} is greyed`);
  for (const working of ["visible-items", "add-breakpoint", "select-item", "remove-element", "create"]) assert.equal(rows[working], false, `${working} works`);
  assert.match(INV.explicacion(INV.entrada("context.unbundle-by-name-row.add-element")).solder, /Add Element|unbundle|measured|medido/i);
});

test("Select Item lists the names of the cluster with a check on the current one and changes the row", () => {
  const { d, unbundle } = wired(2);
  let menu = open(d, unbundle, "element-1");
  const variants = ED.variantes(menu, CTX);
  assert.ok(ED.menuRowHasSubmenu(menu, CTX, INV, "context.unbundle-by-name-row.select-item"));
  menu = ED.sobreMenu(menu, "context.unbundle-by-name-row.select-item", true);
  const rows = menuRows(menu, variants).filter((r) => r.id.includes("select-item."));
  assert.deepEqual(rows.map((r) => [r.label, r.checked]), [["status", false], ["code", true], ["source", false]]);
  // The window first looks the clicked row up and only runs it if it is not a hole: a generated
  // name must resolve to a built entry, not to nothing (it threw in the editor on 2026-10-15).
  const entry = ED.menuRowEntry(menu, CTX, INV, "context.unbundle-by-name-row.select-item.2");
  assert.equal(entry?.etiqueta, "source");
  assert.ok(!esHueco(entry), "a name of Select Item is not a hole");
  const chosen = ED.orden(menu, "context.unbundle-by-name-row.select-item.2", CTX);
  assert.deepEqual(items(chosen, unbundle), ["status", "source"]);
  assert.equal(chosen.menu, null);
  // Without a cluster wired there is nothing to select from: the row is greyed and opens nothing.
  const unwired = { ...d, g: Gr.borrar(d.g, d.g.cables.map((c) => c.id)) };
  const unwiredMenu = open(unwired, unbundle, "element-1");
  assert.ok(ED.variantes(unwiredMenu, CTX).desactivados.has("context.unbundle-by-name-row.select-item"));
  assert.ok(!ED.menuRowHasSubmenu(unwiredMenu, CTX, INV, "context.unbundle-by-name-row.select-item"));
});

test("Remove Element takes the row away with its wire, and the last row cannot be removed", () => {
  const { d, unbundle } = wired(3);
  const withIndicator = ED.createOnTerminal(open(d, unbundle, "element-2"), CTX, unbundle, "element-2", "indicator");
  assert.equal(withIndicator.g.cables.length, 2, "the indicator is wired to the row");
  const menu = open({ ...withIndicator, menu: null }, unbundle, "element-2");
  const removed = ED.orden(menu, "context.unbundle-by-name-row.remove-element", CTX);
  assert.deepEqual(items(removed, unbundle), ["status", "code"]);
  assert.equal(removed.g.cables.length, 1, "its wire goes with it");
  const single = wired(1);
  const lastMenu = open(single.d, single.unbundle, "element-0");
  assert.ok(ED.variantes(lastMenu, CTX).desactivados.has("context.unbundle-by-name-row.remove-element"));
  assert.deepEqual(items(ED.orden(lastMenu, "context.unbundle-by-name-row.remove-element", CTX), single.unbundle), ["status"]);
});

test("Create on the output of a row makes an indicator of the type of its element", () => {
  const { d, unbundle } = wired(3);
  const menu = open(d, unbundle, "element-1");
  const created = ED.orden(menu, "context.unbundle-by-name-row.create.indicator", CTX);
  const indicator = created.g.nodos.find((n) => n.tipo === "indicator" || n.tipo === "control");
  assert.ok(indicator, "an indicator was made");
  assert.equal(Gr.tipos(created.g, CAT).entradas.get(`${indicator.id}.value`), "i32", "the type of code");
  // On the arrow cell, Create has no terminal to act on: the rows for one are greyed.
  const body = open(d, unbundle, null);
  assert.ok(ED.variantes(body, CTX).desactivados.has("context.unbundle-by-name.create.indicator"));
});

test("the body menu has the palette row only for the error cluster, and Add Breakpoint is the one every node has", () => {
  const { d, unbundle } = wired(1);
  const noCluster = { ...d, g: Gr.borrar(d.g, d.g.cables.map((c) => c.id)) };
  const bodyMenu = open(noCluster, unbundle, null);
  assert.ok(ED.variantes(bodyMenu, CTX).ocultos.has("context.unbundle-by-name.cluster-type-palette"));
  assert.ok(INV.hijos("context.unbundle-by-name").some((e) => e.id.endsWith(".add-breakpoint") && !esHueco(e)));
});
