// The VI Server Reference constant in the editor (DT-090), measured in LabVIEW 2026 Q3 on 2026-11-14:
// labview-captures/reports/2026-11-14-application-control-palette.md (the palette: 5 x 5, row 3 column 4) and
// 2026-11-14-vi-server-reference.md (its look, its menu and its type). The captures are local evidence and are not
// committed. No browser needed.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import * as Gr from "../../core/model/graph.mjs";
import { THIS_APPLICATION_TYPE, THIS_OVI_TYPE, VI_SERVER_REFERENCE } from "../../core/model/vi-server-reference.mjs";
import { aspecto } from "../../core/model/types.mjs";
import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import { caja, contexto, glifosPorBloque, terminales } from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as H from "../../editor/src/block-diagram/undo-history.mjs";
import * as G from "../../editor/src/common/glyphs.mjs";
import { esHueco, ultimo } from "../../editor/src/common/labview-inventory.mjs";
import { celdasSubpaleta } from "../../editor/src/window/window-view.mjs";
import { CAT, INV, RAIZ } from "../helpers.mjs";

/** "This OVI" and "This Application" in the editor's font, as far as these tests need them: 52 and 102 px wide with LabVIEW's 14 + 6 px of margins. */
const TEXT_WIDTHS = { "This OVI": 32, "This Application": 82 };
const measure = (text) => TEXT_WIDTHS[text] ?? [...text].length * 6.1;
const CTX = contexto(CAT, glifosPorBloque(INV), ".", measure);
const FONDO = { tipo: "fondo" };
const PALETTE = "palette.functions.programming.application-control";

const nodeOf = (d, id) => d.g.nodos.find((n) => n.id === id);

/** The constant placed from the palette entry at `point`. */
function placedFromPalette(point = { x: 300, y: 100 }) {
  const entry = INV.entrada(`${PALETTE}.ovi-server-reference`);
  const picked = ED.coger(ED.inicial(), entry.bloque);
  const d = ED.pulsar(ED.moverA(picked, CTX, point), CTX, FONDO, point);
  return { d, node: d.g.nodos.find((n) => n.tipo === VI_SERVER_REFERENCE) };
}

const openMenu = (d, nodeId) => ED.abrirMenu(d, D.menuDe(nodeOf(d, nodeId), null, d.g, false, CAT), nodeId, 0, 0, null);
const hover = (d, ...ids) => ids.reduce((menu, id) => ED.sobreMenu(menu, id, true), d);

/** The rows of an open menu (or one of its submenus): label, greyed and whether a separator precedes. */
function menuRows(d, parent = d.menu.raiz) {
  const drawing = D.menuContextual(INV, { ...d.menu, x: 0, y: 0 }, ED.marcados(d, CTX), measure, ED.variantes(d, CTX));
  const menu = drawing.split('<div class="menu-contextual"').find((part) => part.includes(`data-menu="${parent}"`));
  return [...menu.matchAll(/(<div class="separador-menu"[^>]*><\/div>)?<div class="item-menu([^"]*)" data-id="([^"]+)"(?: data-row="[^"]+")?[^>]*><span class="texto-menu"[^>]*>([^<]*)</g)].map((m) => ({
    id: m[3],
    label: m[4],
    greyed: /hueco|desactivado/.test(m[2]),
    separated: !!m[1],
  }));
}
const shown = (rows) => rows.flatMap((r) => (r.separated ? ["---", r.label] : [r.label]));
const enabled = (rows) => rows.filter((r) => !r.greyed).map((r) => r.label);
/** The rows a menu ticks, by the last part of their ids: the marks are drawn into the row's HTML. */
const ticked = (d) => [...ED.marcados(d, CTX)].map((id) => id.slice(d.menu.raiz.length + 1));

// ——— The palette ———

/** The names of the 5 x 5 grid, row by row (reports/2026-11-14-application-control-palette.md); Solder says OVI for VI (DT-071). */
const GRID = [
  ["Open Application Reference", "Open OVI Reference", "Static OVI Reference", "Close Reference", "Get Command Line Arguments.vi"],
  ["Property Node", "Invoke Node", "Call By Reference", "Start Asynchronous Call", "Wait On Asynchronous Call"],
  ["To More Specific Class", "To More Generic Class", "Class Specifier Constant", "OVI Server Reference", "Call Chain"],
  ["Get Drag Drop Data", "Stop", "Quit LabVIEW", "Set Control Values by Index", "Get Control Values by Index"],
  ["Palette Editing", "CPU Information", "Memory Control", "OVI Scripting", "Application Builder"],
];

test("the Application Control palette has LabVIEW's 5 x 5 grid and places the OVI Server Reference", () => {
  const sites = celdasSubpaleta(INV, PALETTE);
  assert.equal(sites.columnas, 5);
  const cells = sites.sitios.filter((site) => ultimo(site.e.id) !== "thumbtack");
  assert.deepEqual(cells.map((site) => [site.fila, site.columna, site.e.etiqueta]), GRID.flatMap((row, r) => row.map((label, c) => [r, c, label])));
  // The OVI Server Reference is row 3, column 4, and the only one done: it places the block, the rest are greyed holes that say why.
  const done = cells.filter((site) => !esHueco(site.e));
  assert.deepEqual(done.map((site) => [site.fila + 1, site.columna + 1, site.e.bloque]), [[3, 4, VI_SERVER_REFERENCE]]);
  assert.ok(CAT.bloque(VI_SERVER_REFERENCE));
  for (const { e } of cells.filter((site) => esHueco(site.e))) {
    const { labview, solder } = INV.explicacion(e);
    assert.ok(labview && /^Missing: /.test(solder), e.id);
  }
  // Every cell has its icon, and the five last ones are folders.
  for (const { e } of cells) assert.ok(G.FUNCIONES[ultimo(e.id)] || G.SUBPALETAS[ultimo(e.id)], `${e.id} has an icon`);
  assert.equal(INV.entrada(PALETTE).estado, "built");
});

// ——— The node ———

test("placed from the palette it is This OVI with its label, 19 px tall, teal, and its wire is teal", () => {
  const { d, node } = placedFromPalette();
  assert.deepEqual(node.config.type, THIS_OVI_TYPE);
  const box = caja(node, CTX);
  // 52 x 19 with "This VI" (measured); dropped centred on the click, as the control reference's.
  assert.deepEqual([box.ancho, box.alto], [52, 19]);
  assert.deepEqual([box.x + box.ancho / 2, box.y + box.alto / 2], [300, 99.5]);
  // A 2 px frame and the text in #007f7f, the cream inside, and the label above it with the same text.
  const html = D.contenido(d, CTX, Gr.tipos(d.g, CAT));
  assert.match(html, /stroke="#007f7f" stroke-width="2"/);
  assert.match(html, /fill="#007f7f">This OVI<\/text>/);
  assert.match(html, /<div class="etiqueta-enlace">This OVI<\/div>/);
  // Its one terminal is the reference, at the middle of the right edge; the wire is the refnums' teal.
  assert.deepEqual(terminales(node, CTX).map((t) => [t.puerto, t.dir, t.x - node.x, t.y - node.y]), [["reference", "out", 52, 9.5]]);
  assert.equal(aspecto(Gr.tipos(d.g, CAT).salidas.get(`${node.id}.reference`)).color, "#007f7f");
});

test("Link to ▸ This Application changes its type and its text, and grows it about its centre", () => {
  const { d, node } = placedFromPalette();
  const before = caja(node, CTX);
  const linked = ED.orden(openMenu(d, node.id), "context.vi-server-reference.link-to.this-application", CTX);
  const application = nodeOf(linked, node.id);
  assert.deepEqual(application.config.type, THIS_APPLICATION_TYPE);
  const grown = caja(application, CTX);
  assert.deepEqual([grown.ancho, grown.alto], [102, 19]);
  assert.equal(grown.x + grown.ancho / 2, before.x + before.ancho / 2);
  const html = D.contenido(linked, CTX, Gr.tipos(linked.g, CAT));
  assert.match(html, /fill="#007f7f">This Application<\/text>/);
  assert.match(html, /<div class="etiqueta-enlace">This Application<\/div>/);
  // The check follows the class, and This OVI goes back.
  assert.deepEqual(ticked(openMenu(linked, node.id)).filter((row) => row.startsWith("link-to.")), ["link-to.this-application"]);
  const back = ED.orden(openMenu(linked, node.id), "context.vi-server-reference.link-to.this-ovi", CTX);
  assert.deepEqual(nodeOf(back, node.id).config.type, THIS_OVI_TYPE);
  assert.equal(caja(nodeOf(back, node.id), CTX).ancho, 52);
  // One edit is one step of undo.
  const history = H.registrar(H.nuevo(d.g), linked.g);
  assert.deepEqual(nodeOf({ g: H.deshacer(history).g }, node.id).config.type, THIS_OVI_TYPE);
});

// ——— The menu ———

test("its menu has LabVIEW's rows in order, with the ones not done greyed", () => {
  const { d, node } = placedFromPalette();
  const menu = openMenu(d, node.id);
  const root = "context.vi-server-reference";
  assert.deepEqual(shown(menuRows(menu)), ["Visible Items", "Help", "Examples", "Description and Tip...", "---", "Add Breakpoint", "---", "Application Control Palette", "---", "Create", "---", "Link to", "---", "Remove and Rewire", "---", "Properties"]);
  // Visible Items ▸ Label is ticked, as LabVIEW's is by default; showing and hiding it is not done.
  assert.deepEqual(shown(menuRows(hover(menu, `${root}.visible-items`), `${root}.visible-items`)), ["Label"]);
  assert.ok(ticked(menu).includes("visible-items.label"));
  // Create ▸: Control and Indicator are greyed because LabVIEW crashed on them (not measured); nothing in it is done yet.
  const create = menuRows(hover(menu, `${root}.create`), `${root}.create`);
  assert.deepEqual(shown(create), ["Constant", "Control", "Indicator", "---", "Property for OVI Class", "Method for OVI Class", "Channel Writer...", "---", "All Controls and Indicators", "All Constants"]);
  assert.deepEqual(enabled(create), []);
  const linkTo = menuRows(hover(menu, `${root}.link-to`), `${root}.link-to`);
  assert.deepEqual(shown(linkTo), ["This Application", "This OVI", "---", "Pane"]);
  assert.deepEqual(enabled(linkTo), ["This Application", "This OVI"]);
  assert.ok(ticked(menu).includes("link-to.this-ovi"));
  // What the menu has done is Visible Items, Add Breakpoint (the debugger's), Create and Link to; the rest is greyed.
  assert.deepEqual(enabled(menuRows(menu)), ["Visible Items", "Add Breakpoint", "Create", "Link to"]);
});

test("on This Application Create names the properties and methods of the Application class", () => {
  const { d, node } = placedFromPalette();
  const linked = ED.orden(openMenu(d, node.id), "context.vi-server-reference.link-to.this-application", CTX);
  const create = menuRows(hover(openMenu(linked, node.id), "context.vi-server-reference.create"), "context.vi-server-reference.create");
  // Unverified: LabVIEW's menu was measured on This VI, whose rows say "VI Class".
  assert.deepEqual(create.filter((r) => /for .* Class/.test(r.label)).map((r) => r.label), ["Property for Application Class", "Method for Application Class"]);
});

test("every inventory entry of the palette and of the menu that is done points at a test of this file", () => {
  const source = readFileSync(path.join(RAIZ, "test/editor/vi-server-reference.test.mjs"), "utf8");
  const done = INV.entradas.filter((e) => (e.id.startsWith(PALETTE) || e.id.startsWith("context.vi-server-reference")) && e.estado === "built" && e.prueba.startsWith("test/editor/vi-server-reference"));
  assert.ok(done.length >= 8);
  for (const entry of done) assert.ok(source.includes(`test("${entry.prueba.split("::")[1].replaceAll("_", " ")}"`), entry.id);
});
