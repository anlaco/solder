// Control references in the editor (DT-072 §2, stage d), measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-03-control-references.md): Create ▸ Reference, the constant's look and menu, the
// explicit Property Node it makes, Disconnect From Control, and saving. No browser needed.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import { caja, contexto, glifosPorBloque, terminales } from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as PN from "../../editor/src/block-diagram/property-nodes.mjs";
import * as CR from "../../editor/src/block-diagram/control-references.mjs";
import * as TC from "../../editor/src/block-diagram/terminal-creation.mjs";
import * as FP from "../../editor/src/front-panel/front-panel.mjs";
import { pasteAt } from "../../editor/src/block-diagram/diagram-clipboard.mjs";
import { copyFragment } from "../../core/model/clipboard.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { aTexto, leer } from "../../core/model/qvi-format.mjs";
import { aspecto } from "../../core/model/types.mjs";
import { CAT, INV } from "../helpers.mjs";

/**
 * Widths in the editor's font, as far as these tests need them: "Digital" makes the constant 54 px wide as LabVIEW's;
 * the strict class names make the explicit node 118 and 96 px (measured); other texts, roughly.
 */
const EDITOR_FONT_WIDTHS = { Value: 30, Visible: 30, Digital: 34, Boolean: 42, "DigNum (strict)": 77, "Bool (strict)": 55 };
const measure = (text) => EDITOR_FONT_WIDTHS[text] ?? [...text].length * 6.1;
const CTX = contexto(CAT, glifosPorBloque(INV), ".", measure);
const FONDO = { tipo: "fondo" };

const nodeOf = (d, id) => d.g.nodos.find((n) => n.id === id);
const ofType = (d, tipo) => d.g.nodos.filter((n) => n.tipo === tipo);

function panelDiagram() {
  let g = Gr.nuevo();
  const place = (block, label, x, y) => {
    const placed = Gr.crearEnPanel(g, CAT, block, x, y, label);
    g = placed.g;
    return placed.id;
  };
  const ids = { numeric: place("control", "Numeric", 100, 100), boolean: place("bool-control", "Boolean", 100, 200) };
  return { d: { ...ED.inicial(), g }, ...ids };
}

/** The rows of an open menu (or one of its submenus): label and greyed. */
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
const openMenu = (d, nodeId, port = null) => ED.abrirMenu(d, D.menuDe(nodeOf(d, nodeId), port, d.g, false, CAT), nodeId, 0, 0, port);
const hover = (d, ...ids) => ids.reduce((menu, id) => ED.sobreMenu(menu, id, true), d);
const placeAt = (d, point) => ED.pulsar(ED.moverA(d, CTX, point), CTX, FONDO, point);

/** Create ▸ Reference on the terminal of `nodeId`, placed at `point`. */
function referenceOf(d, nodeId, point = { x: 300, y: 100 }) {
  const root = D.menuDe(nodeOf(d, nodeId), null, d.g, false, CAT);
  return placeAt(ED.orden(openMenu(d, nodeId), `${root}.create.reference`, CTX), point);
}

test("Create ▸ Reference hangs a control reference constant from the cursor, linked by node name", () => {
  const { d, numeric, boolean } = panelDiagram();
  const root = "context.numeric-control";
  const create = menuRows(hover(openMenu(d, numeric), `${root}.create`), `${root}.create`);
  assert.equal(create.find((r) => r.label === "Reference").greyed, false);
  const picked = ED.orden(openMenu(d, numeric), `${root}.create.reference`, CTX);
  assert.equal(picked.accion.tipo, "colocar");
  assert.match(D.contenido(ED.moverA(picked, CTX, { x: 300, y: 100 }), CTX, Gr.tipos(d.g, CAT)), /class="fantasma".*Digital/s);
  const placed = placeAt(picked, { x: 300, y: 100 });
  const [reference] = ofType(placed, "control-reference");
  assert.deepEqual(reference.config, { type: { refnum: "Numeric" }, link: nodeOf(d, numeric).name });
  // Dropped centred on the click (Q1), to the pixel.
  const box = caja(reference, CTX);
  assert.deepEqual([box.x + box.ancho / 2, box.y + box.alto / 2], [300, 99.5]);
  // From a Boolean's panel object it is put beside the terminal (unverified).
  const panel = ED.orden(ED.abrirMenu(d, "context.boolean-control", boolean, 0, 0), "context.boolean-control.create.reference", CTX);
  assert.deepEqual(ofType(panel, "control-reference")[0].config, { type: { refnum: "Boolean" }, link: nodeOf(d, boolean).name });
});

test("the control reference constant looks as measured and its wire is teal", () => {
  const { d, numeric, boolean } = panelDiagram();
  const placed = referenceOf(d, numeric);
  const [reference] = ofType(placed, "control-reference");
  // 54 x 19 with "Digital", 62 with "Boolean"; a 2 px frame in the type colour, the class's name in it.
  assert.deepEqual([caja(reference, CTX).ancho, caja(reference, CTX).alto], [54, 19]);
  const body = CR.referenceBody(placed.g, CAT, reference, caja(reference, CTX));
  assert.match(body, /stroke="#ff7f00" stroke-width="2"/);
  assert.match(body, /fill="#ff7f00">Digital<\/text>/);
  assert.match(PN.labelAbove(placed.g, reference.config.link), />Numeric</);
  const booleanReference = ofType(referenceOf(d, boolean), "control-reference")[0];
  assert.equal(caja(booleanReference, CTX).ancho, 62);
  // Its one terminal is the reference, at the middle of the right edge; its type is the class's strict refnum, which
  // carries the control's data type, drawn teal.
  assert.deepEqual(terminales(reference, CTX).map((t) => [t.puerto, t.dir, t.x - reference.x, t.y - reference.y]), [["reference", "out", 54, 9.5]]);
  const type = Gr.tipos(placed.g, CAT).salidas.get(`${reference.id}.reference`);
  assert.deepEqual(type, { refnum: "Numeric", of: "number" });
  assert.equal(aspecto(type).color, "#007f7f");
  // Its menu (Q3).
  const menu = openMenu(placed, reference.id);
  assert.deepEqual(shown(menuRows(menu)), ["Find", "Visible Items", "Help", "Examples", "Description and Tip...", "---", "Add Breakpoint", "---", "Application Control Palette", "---", "Create", "---", "Link to", "---", "Remove and Rewire", "---", "Properties"]);
  const create = menuRows(hover(menu, "context.control-reference.create"), "context.control-reference.create");
  assert.deepEqual(shown(create), ["Constant", "Control", "Indicator", "---", "Property for Digital (strict) Class", "Method for Digital (strict) Class", "Channel Writer...", "---", "All Controls and Indicators", "All Constants"]);
  // Control and Indicator are not done: in LabVIEW they close the program.
  assert.deepEqual(create.filter((r) => !r.greyed).map((r) => r.label), ["Property for Digital (strict) Class"]);
  // It is saved and opened with its class and link.
  const reopened = leer(aTexto(placed.g, CAT), CAT);
  assert.deepEqual(reopened.nodos.find((n) => n.tipo === "control-reference").config, reference.config);
});

test("its Create ▸ Property for a class makes an explicit node, unwired, with the strict class in its header", () => {
  const { d, numeric, boolean } = panelDiagram();
  const placed = referenceOf(d, numeric);
  const [reference] = ofType(placed, "control-reference");
  const list = "context.control-reference.create.property-for-class";
  const menu = hover(openMenu(placed, reference.id), "context.control-reference.create", list);
  assert.ok(menuRows(menu, list).some((r) => r.label === "Value" && !r.greyed));
  const made = placeAt(ED.orden(menu, `${list}.value`, CTX), { x: 500, y: 100 });
  const [node] = ofType(made, "property-node");
  assert.deepEqual(node.config, { class: "Numeric", link: null, rows: [{ property: "Value", write: false }], "ignore-errors": false });
  assert.equal(made.g.cables.length, 0, "LabVIEW does not wire it (Q4)");
  // 118 x 35: the 18 px header with "DigNum (strict)" in the frame's colour; reference in and out.
  assert.deepEqual([caja(node, CTX).ancho, caja(node, CTX).alto], [118, 35]);
  assert.match(PN.propertyNodeBody(made.g, CAT, node, caja(node, CTX)), /<text class="clase-nodo" x="29" y="9" fill="var\(--format-node-border\)">DigNum \(strict\)<\/text>/);
  assert.deepEqual(terminales(node, CTX).filter((t) => t.puerto.startsWith("reference")).map((t) => t.dir), ["in", "out"]);
  // Wired, its Value takes the control's type.
  const wired = { ...made, g: Gr.conectar(made.g, CAT, { nodo: reference.id, puerto: "reference", dir: "out" }, { nodo: node.id, puerto: "reference", dir: "in" }).g };
  assert.equal(Gr.tipos(wired.g, CAT).cables.values().next().value.roto, null);
  assert.equal(Gr.tipos(wired.g, CAT).salidas.get(`${node.id}.row-0`), "number");
  // Its menu has no Find nor Disconnect From Control; Link to goes once a reference is wired (Q4).
  const labels = (state) => shown(menuRows(openMenu(state, node.id)));
  assert.ok(!labels(made).includes("Find") && !labels(made).includes("Disconnect From Control"));
  assert.ok(labels(made).includes("Link to"));
  assert.ok(!labels(wired).includes("Link to"));
  // A Boolean's reference names its class "Bool (strict)".
  const booleanMade = (() => {
    const withReference = referenceOf(d, boolean);
    const booleanReference = ofType(withReference, "control-reference")[0];
    const booleanMenu = hover(openMenu(withReference, booleanReference.id), "context.control-reference.create", list);
    return placeAt(ED.orden(booleanMenu, `${list}.visible`, CTX), { x: 500, y: 300 });
  })();
  const booleanNode = ofType(booleanMade, "property-node")[0];
  assert.equal(caja(booleanNode, CTX).ancho, 96);
  assert.match(PN.propertyNodeBody(booleanMade.g, CAT, booleanNode, caja(booleanNode, CTX)), />Bool \(strict\)</);
});

test("Disconnect From Control turns the implicit node into an explicit one in place", () => {
  const { d, boolean } = panelDiagram();
  const root = "context.boolean-control-terminal";
  const placed = placeAt(ED.orden(openMenu(d, boolean), `${root}.create.property-node.visible`, CTX), { x: 400, y: 300 });
  const [node] = ofType(placed, "property-node");
  const before = caja(node, CTX);
  const header = menuRows(openMenu(placed, node.id));
  assert.equal(header.find((r) => r.label === "Disconnect From Control").greyed, false);
  const disconnected = ED.orden(openMenu(placed, node.id), `${PN.IMPLICIT_MENU}.disconnect-from-control`, CTX);
  const after = nodeOf(disconnected, node.id);
  assert.deepEqual(after.config, { ...node.config, link: null });
  assert.equal(disconnected.g.nodos.length, placed.g.nodos.length, "no reference is made (Q5)");
  // 96 x 35 with "Bool (strict)", the centre and the bottom edge kept (Q5: 38 x 26 at 679..716, 317..342 → 650..745, 308..342).
  const box = caja(after, CTX);
  assert.deepEqual([box.ancho, box.alto], [96, 35]);
  assert.equal(box.x + box.ancho / 2, before.x + before.ancho / 2);
  assert.equal(box.y + box.alto, before.y + before.alto);
  assert.equal(PN.linkedLabel(disconnected.g, after), "", "the label above is gone");
  // Link to stays, with nothing ticked; Disconnect From Control is gone.
  const menu = hover(openMenu(disconnected, after.id), `${PN.IMPLICIT_MENU}.link-to`);
  assert.ok(menuRows(menu).some((r) => r.label === "Link to"));
  assert.ok(!menuRows(menu).some((r) => r.label === "Disconnect From Control"));
  assert.ok(!ED.marcados(menu, CTX).has(`${PN.IMPLICIT_MENU}.link-to.pane`));
  // A reference pasted with its control follows the copy of the control.
  const withReference = referenceOf(d, boolean);
  const reference = ofType(withReference, "control-reference")[0];
  const pasted = pasteAt(withReference, { ...CTX, panelSize: { width: 800, height: 600 } }, copyFragment(withReference.g, [boolean, reference.id]), { x: 500, y: 500 }, null).d;
  const copies = pasted.g.nodos.filter((n) => !withReference.g.nodos.some((old) => old.id === n.id));
  assert.equal(copies.find((n) => n.tipo === "control-reference").config.link, copies.find((n) => n.tipo === "bool-control").name);
});

test("Create Indicator on a node's reference out makes a refnum indicator: its page on the panel and its teal terminal (Q2)", () => {
  const { d, numeric } = panelDiagram();
  let g = referenceOf(d, numeric).g;
  const reference = g.nodos.find(CR.isControlReference);
  const explicit = Gr.crearNodo(g, CAT, "property-node", 400, 100);
  g = Gr.fijarConfig(explicit.g, explicit.id, { class: "Numeric", link: null, rows: [{ property: "Value" }] });
  g = Gr.conectar(g, CAT, { nodo: reference.id, puerto: "reference", dir: "out" }, { nodo: explicit.id, puerto: "reference", dir: "in" }).g;
  const made = TC.createForTerminal(g, CTX, { nodo: explicit.id, puerto: "reference-out", kind: "indicator", panelSize: { width: 640, height: 480 } });
  const indicator = made.g.nodos.find((n) => n.id === made.id);
  assert.equal(indicator.tipo, "refnum-indicator");
  assert.deepEqual(indicator.config.type, { refnum: "Numeric", of: "number" });
  assert.equal(indicator.label.text, "reference out");
  assert.ok(made.wired);
  // On the panel, a 36 × 48 page that shows no value.
  assert.deepEqual([FP.caja(indicator).ancho, FP.caja(indicator).alto], [36, 48]);
  assert.match(FP.contenido({ ...FP.inicial(made.g) }, CTX), /sd-refnum[^-].*sd-refnum-page/s);
  // On the diagram, a 35 × 38 terminal whose wire comes in at the middle of its left edge.
  const box = caja(indicator, CTX);
  assert.deepEqual([box.ancho, box.alto], [35, 38]);
  const [terminal] = terminales(indicator, CTX);
  assert.deepEqual([terminal.dir, terminal.x - box.x, terminal.y - box.y], ["in", 0, 19]);
});

test("Create ▸ Control and Indicator on the reference constant make a control refnum, as LabVIEW means to", () => {
  // LabVIEW 2026 Q3 closes with an internal error here (Q2, 3 times out of 3); Solder makes what the rows name.
  const { d, numeric } = panelDiagram();
  const placed = referenceOf(d, numeric);
  const reference = ofType(placed, "control-reference")[0];
  const root = D.menuDe(reference, "reference", placed.g, false, CAT);
  const create = menuRows(hover(openMenu(placed, reference.id, "reference"), `${root}.create`), `${root}.create`);
  assert.deepEqual(create.filter((r) => ["Control", "Indicator"].includes(r.label)).map((r) => r.greyed), [false, false]);
  const withIndicator = ED.orden(openMenu(placed, reference.id, "reference"), `${root}.create.indicator`, CTX);
  const [indicator] = ofType(withIndicator, "refnum-indicator");
  assert.deepEqual(indicator.config.type, { refnum: "Numeric", of: "number" });
  assert.ok(withIndicator.g.cables.some((wire) => wire.de.nodo === reference.id && wire.a.nodo === indicator.id));
  const withControl = ED.orden(openMenu(placed, reference.id, "reference"), `${root}.create.control`, CTX);
  assert.equal(ofType(withControl, "refnum-control").length, 1);
});
