// The Property Node in the editor (DT-072 §7, stage c), measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-10-30-panel-property-node.md and 2026-10-26-visa-property-node.md): Create ▸
// Property Node ▸ from the catalog, the node's look and terminals, its menus, the edits of its rows, the Instr node
// and paste. No browser needed.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import { caja, contexto, glifosPorBloque, terminales } from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as H from "../../editor/src/block-diagram/undo-history.mjs";
import * as PN from "../../editor/src/block-diagram/property-nodes.mjs";
import * as P from "../../editor/src/front-panel/front-panel.mjs";
import { pasteAt } from "../../editor/src/block-diagram/diagram-clipboard.mjs";
import { copyFragment } from "../../core/model/clipboard.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { aspecto } from "../../core/model/types.mjs";
import { CAT, INV } from "../helpers.mjs";

/**
 * The width of a row's text in the editor's font, as far as these tests need it: "Value" leaves the node at its
 * least width (38 px) and "Caption.Text" makes it 72 px (measured); other texts, roughly.
 */
const EDITOR_FONT_WIDTHS = { Value: 30, "Caption.Text": 64, "Bytes at Port": 64 };
const measure = (text) => EDITOR_FONT_WIDTHS[text] ?? [...text].length * 6.1;
const CTX = contexto(CAT, glifosPorBloque(INV), ".", measure);
const FONDO = { tipo: "fondo" };

const nodeOf = (d, id) => d.g.nodos.find((n) => n.id === id);
const propertyNodes = (d) => d.g.nodos.filter((n) => n.tipo === "property-node");

/** A diagram with a numeric control "Numeric", a Boolean "Boolean", a numeric indicator "Numeric 2" and a string "String". */
function panelDiagram() {
  let g = Gr.nuevo();
  const place = (block, label, x, y) => {
    const placed = Gr.crearEnPanel(g, CAT, block, x, y, label);
    g = placed.g;
    return placed.id;
  };
  const ids = { numeric: place("control", "Numeric", 100, 100), boolean: place("bool-control", "Boolean", 100, 200), numeric2: place("indicator", "Numeric 2", 400, 100), string: place("str-indicator", "String", 400, 200) };
  return { d: { ...ED.inicial(), g }, ...ids };
}

/** The rows of a right-click menu (or of one of its submenus): label, greyed, ticked, and a separator before it. */
function menuRows(d, parent = d.menu.raiz) {
  const drawing = D.menuContextual(INV, { ...d.menu, x: 0, y: 0 }, ED.marcados(d, CTX), measure, ED.variantes(d, CTX));
  const menu = drawing.split('<div class="menu-contextual"').find((part) => part.includes(`data-menu="${parent}"`));
  return [...menu.matchAll(/(<div class="separador-menu"[^>]*><\/div>)?<div class="item-menu([^"]*)" data-id="([^"]+)"(?: data-row="([^"]+)")?[^>]*><span class="texto-menu"[^>]*>([^<]*)</g)].map((m) => ({
    id: m[4] ?? m[3],
    explainedBy: m[3],
    label: m[5].replaceAll("&amp;", "&"),
    greyed: /hueco|desactivado/.test(m[2]),
    separated: !!m[1],
    checked: /marcado/.test(m[2]),
  }));
}
const shown = (rows) => rows.flatMap((r) => (r.separated ? ["---", r.label] : [r.label]));
const openMenu = (d, nodeId, port = null) => ED.abrirMenu(d, D.menuDe(nodeOf(d, nodeId), port, d.g, false, CAT), nodeId, 0, 0, port);
/** Opens the submenus of `ids`, one in the other, as hovering them does. */
const hover = (d, ...ids) => ids.reduce((menu, id) => ED.sobreMenu(menu, id, true), d);

/** Create ▸ Property Node ▸ `item` on the terminal of `nodeId`, and a click at `point` to place it. */
function createFromTerminal(d, nodeId, item, point = { x: 300, y: 300 }) {
  const root = D.menuDe(nodeOf(d, nodeId), null, d.g, false, CAT);
  let placing = ED.orden(openMenu(d, nodeId), `${root}.create.property-node.${item}`, CTX);
  placing = ED.moverA(placing, CTX, point);
  return ED.pulsar(placing, CTX, FONDO, point);
}

test("Create ▸ Property Node ▸ lists the class's menu from the catalog, the holes greyed", () => {
  const { d, numeric, numeric2, boolean } = panelDiagram();
  const root = "context.numeric-control";
  const menu = hover(openMenu(d, numeric), `${root}.create`, `${root}.create.property-node`);
  assert.deepEqual(shown(menuRows(menu, `${root}.create`)), ["Constant", "Control", "Indicator", "---", "Local Variable", "Reference", "Property Node", "Invoke Node", "Channel Writer...", "Cluster from Selection"]);
  const rows = menuRows(menu, `${root}.create.property-node`);
  // Three groups: GObject's, Control's and Numeric's (m4, m3d).
  const labels = rows.map((r) => r.label);
  assert.deepEqual(labels.slice(0, 7), ["Class ID", "Class Name", "Is On Block Diagram?", "Owner", "Owning VI", "Bounds", "Dependencies"]);
  assert.ok(rows.find((r) => r.label === "Bounds").separated, "GObject's second group starts with Bounds");
  assert.ok(rows.find((r) => r.label === "Auto-Update From Typedef").separated, "Control's group follows");
  assert.ok(rows.find((r) => r.label === "Adapt To Source").separated, "the class's own group comes last");
  const greyed = Object.fromEntries(rows.map((r) => [r.label, r.greyed]));
  for (const done of ["Value", "Value (Signaling)", "Visible", "Disabled", "Key Focus", "Has Caption"]) assert.equal(greyed[done], false, `${done} can be picked`);
  for (const hole of ["Class ID", "Blinking", "Tip Strip", "Format String"]) assert.equal(greyed[hole], true, `${hole} is greyed`);
  // A hole explains itself with the catalog's reason (DT-035).
  const hole = rows.find((r) => r.label === "Blinking");
  assert.equal(hole.explainedBy, PN.PROPERTY_HOLE);
  assert.match(INV.explicacion(INV.resolver(hole.explainedBy)).solder, /DT-072 §8/);
  // Label ▸ is the Reference row and the Text class's menu (m6, m7); only Text is done there, and Bounds ▸ and
  // Position ▸ open on rows that are all greyed (a label's position is not done).
  const label = menuRows(hover(menu, `${root}.create.property-node.label`), `${root}.create.property-node.label`);
  assert.deepEqual(label.slice(0, 3).map((r) => r.label), ["Reference", "Class ID", "Class Name"]);
  assert.deepEqual(label.filter((r) => !r.greyed).map((r) => r.label), ["Bounds", "Position", "Text"]);
  const labelPosition = `${root}.create.property-node.label.position`;
  assert.ok(menuRows(hover(menu, `${root}.create.property-node.label`, labelPosition), labelPosition).every((r) => r.greyed));
  // Position ▸ and Bounds ▸ open with All Elements (m8, m9).
  assert.deepEqual(shown(menuRows(hover(menu, `${root}.create.property-node.position`), `${root}.create.property-node.position`)), ["All Elements", "---", "Left", "Top"]);
  // The indicator's terminal offers the same, and a Boolean's terminal lists the Boolean class's own group.
  assert.ok(menuRows(hover(openMenu(d, numeric2), "context.numeric-indicator.create", "context.numeric-indicator.create.property-node"), "context.numeric-indicator.create.property-node").some((r) => r.label === "Value (Signaling)" && !r.greyed));
  const booleanRoot = "context.boolean-control-terminal";
  const booleanRows = menuRows(hover(openMenu(d, boolean), `${booleanRoot}.create`, `${booleanRoot}.create.property-node`), `${booleanRoot}.create.property-node`);
  assert.ok(booleanRows.some((r) => r.label === "Mechanical Action"));
});

test("picking a property hangs an implicit node from the cursor, linked by node name", () => {
  const { d, numeric } = panelDiagram();
  const root = "context.numeric-control";
  const picked = ED.orden(openMenu(d, numeric), `${root}.create.property-node.value`, CTX);
  assert.equal(picked.menu, null);
  assert.equal(picked.accion.tipo, "colocar");
  // It follows the cursor, drawn as a ghost, until the click.
  const moving = ED.moverA(picked, CTX, { x: 300, y: 300 });
  assert.match(D.contenido(moving, CTX, Gr.tipos(moving.g, CAT)), /class="fantasma".*Value/s);
  const placed = ED.pulsar(moving, CTX, FONDO, { x: 300, y: 300 });
  const [node] = propertyNodes(placed);
  assert.deepEqual(node.config, { class: "Numeric", link: nodeOf(d, numeric).name, rows: [{ property: "Value", write: false }], "ignore-errors": false });
  // Placed with its centre at the click (unverified, as Unbundle By Name's).
  const box = caja(node, CTX);
  assert.deepEqual([box.x + box.ancho / 2, box.y + box.alto / 2], [300, 300]);
  // The link is the control's node name, never its label: renaming the label keeps it.
  const relabelled = Gr.fijarEtiqueta(placed.g, numeric, "Speed");
  assert.equal(Gr.linkedControlType(relabelled, CAT, propertyNodes({ g: relabelled })[0]), "number");
});

test("the implicit node's geometry is the measured one", () => {
  const { d, numeric } = panelDiagram();
  const placed = createFromTerminal(d, numeric, "value");
  const [node] = propertyNodes(placed);
  // 38 x 26 with "Value": an 8 px header, a 15 px row and their lines.
  assert.deepEqual([caja(node, CTX).ancho, caja(node, CTX).alto], [38, 26]);
  // The error terminals on the header, the read row's on the right edge 8 px under its line (y 17).
  const spots = Object.fromEntries(terminales(node, CTX).map((t) => [t.puerto, [t.dir, t.x - node.x, t.y - node.y]]));
  assert.deepEqual(spots, { "error-in": ["in", 0, 5], "row-0": ["out", 38, 17], "error-out": ["out", 38, 5] });
  // The body: the header in the nodes' cream (#ffffcc in Old School) framed in their #4c4c3d, the bar in the control's
  // orange 12 x 5 at x 13, "Value" in orange, the arrow at the right.
  const body = PN.propertyNodeBody(placed.g, CAT, node, caja(node, CTX));
  assert.match(body, /fill="var\(--node-fill\)"/);
  assert.match(body, /stroke="var\(--format-node-border\)"/);
  assert.match(body, /<rect x="13" y="1" width="12" height="8" fill="#ffffff"\/><rect x="13" y="2" width="12" height="5" fill="#ff7f00"\/>/, "the bar on its white backing");
  assert.match(body, /<text class="nombre-propiedad" x="19" y="17.5" fill="#ff7f00">Value<\/text>/);
  assert.match(body, /<path d="M33 /, "a read row's arrow is at the right edge");
  // The control's label is drawn above the node.
  assert.match(PN.linkedLabel(placed.g, node), />Numeric</);
  // Nine rows are 154 px tall; Caption.Text makes the node 72 px wide, grown around its centre.
  const centre = node.x + 19;
  const nine = ["Value", "Value (Signaling)", "Visible", "Disabled", "Label:Text", "Caption:Text", "Key Focus", "Position", "Bounds"];
  let g = placed.g;
  for (let row = 1; row < nine.length; row++) g = PN.addRow(g, node.id, row - 1);
  const before = g;
  nine.forEach((property, row) => (g = PN.selectProperty(g, CAT, node.id, row, property)));
  g = PN.keepCentre(before, g, CAT, measure, node.id);
  const tall = g.nodos.find((n) => n.id === node.id);
  assert.deepEqual([caja(tall, CTX).ancho, caja(tall, CTX).alto], [72, 154]);
  assert.equal(tall.x + 36, centre);
  // The rows' colours are their types' (n3_z): Disabled blue, Label.Text magenta, KeyFocus green, Position brown; a write row's arrow at the left.
  const colours = nine.map((_, row) => PN.rowColor(g, CAT, tall, row));
  assert.deepEqual(colours, ["#ff7f00", "#ff7f00", "#007f00", "#0000ff", "#ff00ff", "#ff00ff", "#007f00", "#993300", "#993300"]);
  assert.equal(tall.config.rows[1].write, true, "Value (Signaling) only writes");
  assert.match(PN.propertyNodeBody(g, CAT, tall, caja(tall, CTX)), /<path d="M2 /);
});

test("the node's header and row menus are the measured ones", () => {
  const { d, numeric } = panelDiagram();
  const placed = createFromTerminal(d, numeric, "value");
  const [node] = propertyNodes(placed);
  const root = PN.IMPLICIT_MENU;
  assert.equal(D.menuDe(node, null, placed.g, false, CAT), root);
  // The header (`hm`).
  const header = openMenu(placed, node.id);
  assert.deepEqual(shown(menuRows(header)), [
    "Change All To Write", "Find", "Visible Items", "Help For Property Node", "Examples", "Description and Tip...", "---", "Add Breakpoint", "---", "Application Control Palette", "Create", "Replace",
    "---", "Select Class", "Downcast to Class", "Name Format", "Disconnect From Control", "Link to", "Ignore Errors inside Node", "---", "Use UTF-8 Overrides When Available", "---", "Remove and Rewire", "---", "Properties",
  ]);
  // Its Create ▸ starts with the class's rows (`hm-cr`).
  assert.deepEqual(shown(menuRows(hover(header, `${root}.create`), `${root}.create`)), ["Property for Digital (strict) Class", "Method for Digital (strict) Class", "---", "All Controls and Indicators", "All Constants"]);
  // Name Format ▸ has Short Names ticked; Long and No Names are not measured.
  assert.deepEqual(menuRows(hover(header, `${root}.name-format`), `${root}.name-format`).map((r) => [r.label, r.greyed, r.checked]), [["No Names", true, false], ["Short Names", false, true], ["Long Names", true, false]]);
  // A row (`rm`).
  const row = openMenu(placed, node.id, "row-0");
  const rows = menuRows(row);
  assert.deepEqual(shown(rows), [
    "Change All To Write", "Find", "Visible Items", "Help For Property Node", "Help For Value", "Examples", "Description and Tip...", "---", "Add Breakpoint", "---", "Select Property", "---", "Change To Write",
    "Add Element", "Remove Element", "Application Control Palette", "Numeric Palette", "Create", "---", "Replace", "---", "Select Class", "Downcast to Class", "Name Format", "Disconnect From Control", "Link to",
    "Ignore Errors inside Node", "---", "Use UTF-8 Overrides When Available", "---", "Remove and Rewire", "---", "Properties",
  ]);
  const greyed = Object.fromEntries(rows.map((r) => [r.label, r.greyed]));
  for (const label of ["Examples", "Remove Element", "Downcast to Class", "Select Class"]) assert.ok(greyed[label], `${label} is greyed`);
  for (const label of ["Change All To Write", "Add Breakpoint", "Select Property", "Change To Write", "Add Element", "Create", "Name Format", "Disconnect From Control", "Link to", "Ignore Errors inside Node"]) assert.equal(greyed[label], false, `${label} works`);
  // Select Property ▸: Browse... greyed, the class's groups, the current property ticked (`sp`).
  const select = menuRows(hover(row, `${root}.select-property`), `${root}.select-property`);
  assert.deepEqual(select.slice(0, 2).map((r) => [r.label, r.greyed, r.separated]), [["Browse...", true, false], ["Class ID", true, true]]);
  assert.deepEqual(select.filter((r) => r.checked).map((r) => r.label), ["Value"]);
  // Value (Signaling) only writes: its Change To Read is greyed.
  const signaling = { ...placed, g: PN.selectProperty(placed.g, CAT, node.id, 0, "Value (Signaling)") };
  const signalingRows = menuRows(openMenu(signaling, node.id, "row-0"));
  assert.deepEqual(signalingRows.filter((r) => r.id === `${root}.change-to-write`).map((r) => [r.label, r.greyed]), [["Change To Read", true]]);
});

test("Select Property, Change To Write, Add and Remove Element edit the rows, each one undo step", () => {
  const { d, numeric } = panelDiagram();
  const placed = createFromTerminal(d, numeric, "value");
  const [node] = propertyNodes(placed);
  const root = PN.IMPLICIT_MENU;
  let history = H.nuevo(placed.g);
  const step = (state, port, id) => {
    const next = ED.orden(openMenu(state, node.id, port), id, CTX);
    history = H.registrar(history, next.g);
    return next;
  };
  let state = step(placed, "row-0", `${root}.add-element`);
  assert.deepEqual(nodeOf(state, node.id).config.rows, [{ property: "Value", write: false }, { property: "Value", write: false }]);
  state = step(state, "row-1", `${root}.select-property.caption.text`);
  assert.deepEqual(nodeOf(state, node.id).config.rows[1], { property: "Caption:Text", write: false });
  // The wider node keeps its centre.
  assert.equal(nodeOf(state, node.id).x + caja(nodeOf(state, node.id), CTX).ancho / 2, node.x + 19);
  state = step(state, "row-1", `${root}.change-to-write`);
  assert.equal(nodeOf(state, node.id).config.rows[1].write, true);
  assert.deepEqual(terminales(nodeOf(state, node.id), CTX).find((t) => t.puerto === "row-1").dir, "in");
  state = step(state, "row-0", `${root}.remove-element`);
  assert.deepEqual(nodeOf(state, node.id).config.rows, [{ property: "Caption:Text", write: true }]);
  // With one row Remove Element does nothing (it is greyed).
  assert.equal(ED.orden(openMenu(state, node.id, "row-0"), `${root}.remove-element`, CTX).g, state.g);
  // Four steps, undone one by one back to the placed node.
  let undone = 0;
  for (let r = H.deshacer(history); r; r = H.deshacer(history)) {
    history = r.h;
    undone++;
  }
  assert.equal(undone, 4);
  assert.equal(history.base, placed.g);
});

test("Create ▸ Indicator from a row makes a wired indicator", () => {
  const { d, numeric } = panelDiagram();
  const placed = createFromTerminal(d, numeric, "visible");
  const [node] = propertyNodes(placed);
  const made = ED.orden(openMenu(placed, node.id, "row-0"), `${PN.IMPLICIT_MENU}.create.indicator`, CTX);
  const wire = made.g.cables.find((c) => c.de.nodo === node.id && c.de.puerto === "row-0");
  assert.ok(wire, "the indicator is wired to the row");
  assert.equal(nodeOf(made, wire.a.nodo).tipo, "bool-indicator");
  // On a row with no terminal yet (no property chosen) Constant, Control and Indicator are greyed.
  const instr = ED.coger(ED.inicial(), "property-node", PN.instrConfig());
  const dropped = ED.pulsar(ED.moverA(instr, CTX, { x: 200, y: 200 }), CTX, FONDO, { x: 200, y: 200 });
  const instrNode = propertyNodes(dropped)[0];
  const create = menuRows(hover(openMenu(dropped, instrNode.id, "row-0"), `${PN.INSTR_MENU}.create`), `${PN.INSTR_MENU}.create`);
  assert.deepEqual(create.map((r) => [r.label, r.greyed]), [["Constant", true], ["Control", true], ["Indicator", true]]);
});

test("Link to ▸ Pane ▸ lists the panel's controls by label and relinks the node", () => {
  const { d, numeric, string } = panelDiagram();
  const placed = createFromTerminal(d, numeric, "value");
  const [node] = propertyNodes(placed);
  const root = PN.IMPLICIT_MENU;
  const menu = hover(openMenu(placed, node.id), `${root}.link-to`, `${root}.link-to.pane`);
  assert.deepEqual(menuRows(menu, `${root}.link-to`).map((r) => [r.label, r.checked]), [["Pane", true]]);
  const pane = menuRows(menu, `${root}.link-to.pane`);
  assert.deepEqual(shown(pane), ["Pane", "---", "Boolean", "Numeric", "Numeric 2", "String"]);
  assert.deepEqual(pane.filter((r) => r.checked).map((r) => r.label), ["Numeric"]);
  const stringName = nodeOf(d, string).name;
  const relinked = ED.orden(menu, `${root}.link-to.pane.${stringName}`, CTX);
  assert.deepEqual([nodeOf(relinked, node.id).config.link, nodeOf(relinked, node.id).config.class], [stringName, "String"]);
  // The bar takes the string's magenta.
  assert.match(PN.propertyNodeBody(relinked.g, CAT, nodeOf(relinked, node.id), caja(nodeOf(relinked, node.id), CTX)), /<rect x="13" y="2" width="12" height="5" fill="#ff00ff"\/>/);
});

test("Ignore Errors inside Node and Change All To Write toggle", () => {
  const { d, numeric } = panelDiagram();
  const placed = createFromTerminal(d, numeric, "value");
  const [node] = propertyNodes(placed);
  const root = PN.IMPLICIT_MENU;
  const ignoring = ED.orden(openMenu(placed, node.id), `${root}.ignore-errors-inside-node`, CTX);
  assert.equal(nodeOf(ignoring, node.id).config["ignore-errors"], true);
  assert.ok(menuRows(openMenu(ignoring, node.id)).find((r) => r.label === "Ignore Errors inside Node").checked);
  const writing = ED.orden(openMenu(ignoring, node.id), `${root}.change-all-to-write`, CTX);
  assert.equal(nodeOf(writing, node.id).config.rows[0].write, true);
  assert.equal(menuRows(openMenu(writing, node.id))[0].label, "Change All To Read");
  const reading = ED.orden(openMenu(writing, node.id), `${root}.change-all-to-write`, CTX);
  assert.equal(nodeOf(reading, node.id).config.rows[0].write, false);
});

test("the Instr node comes from VISA Advanced and from Create ▸ Property for Instr Class", () => {
  // The palette's entry places an Instr node with one row and no property: "Property", 66 x 35, an 18 px header.
  const entry = INV.entrada("palette.functions.instrument-io.visa.visa-advanced.visa-property-node");
  assert.equal(entry.estado, "built");
  const picked = ED.coger(ED.inicial(), entry.bloque, entry.config);
  const dropped = ED.pulsar(ED.moverA(picked, CTX, { x: 600, y: 300 }), CTX, FONDO, { x: 600, y: 300 });
  const [node] = propertyNodes(dropped);
  assert.deepEqual([caja(node, CTX).ancho, caja(node, CTX).alto], [66, 35]);
  assert.equal(PN.rowText(node, CAT, 0), "Property");
  const body = PN.propertyNodeBody(dropped.g, CAT, node, caja(node, CTX));
  assert.match(body, />Instr<\/text>/);
  const spots = Object.fromEntries(terminales(node, CTX).map((t) => [t.puerto, [t.dir, t.y - node.y]]));
  assert.deepEqual(spots, { reference: ["in", 4], "error-in": ["in", 13], "reference-out": ["out", 4], "error-out": ["out", 13] });
  // Its Select Property ▸ is the Instr tree: Browse..., then two groups of folders (visa report §3).
  const root = PN.INSTR_MENU;
  const select = menuRows(hover(openMenu(dropped, node.id, "row-0"), `${root}.select-property`), `${root}.select-property`);
  assert.deepEqual(shown(select), ["Browse...", "---", "General Settings", "Interface Information", "Version Information", "---", "General Settings", "Message Based Settings", "Register Based Settings", "GPIB Settings", "Serial Settings", "PXI/PCI Settings", "TCP/IP Settings", "USB Settings", "VXI/VME Settings", "FireWire Settings", "Interface Information"]);
  const chosen = ED.orden(openMenu(dropped, node.id, "row-0"), `${root}.select-property.message-based-settings.termination-character-enable`, CTX);
  const termChar = nodeOf(chosen, node.id);
  assert.deepEqual(termChar.config.rows, [{ property: "Message Based Settings:Termination Character Enable", write: false }]);
  assert.equal(PN.rowText(termChar, CAT, 0), "TermChar En");
  assert.equal(PN.rowColor(chosen.g, CAT, termChar, 0), "#007f00");
  // The row menu of an Instr node (`m1c`).
  assert.deepEqual(shown(menuRows(openMenu(chosen, node.id, "row-0"))), [
    "Change All To Write", "Visible Items", "Help For Property Node", "Help For Message Based Settings:Termination Character Enable", "Examples", "Description and Tip...", "---", "Add Breakpoint", "---", "VISA Palette", "Boolean Palette",
    "Select Property", "---", "Change To Write", "Add Element", "Remove Element", "Create", "---", "Replace", "---", "Select Class", "Downcast to Class", "Name Format", "Link to", "Ignore Errors inside Node", "---", "Remove and Rewire", "---", "Properties",
  ]);
  // Create ▸ Property for Instr Class ▸ on a VISA resource name's terminal: the same tree without Browse...
  let g = Gr.crearEnPanel(Gr.nuevo(), CAT, "visa-control", 100, 100, "VISA resource name");
  const visa = g.g.nodos[0].id;
  const d = { ...ED.inicial(), g: g.g };
  const terminalRoot = "context.visa-control-terminal";
  const create = hover(openMenu(d, visa), `${terminalRoot}.create`, `${terminalRoot}.create.property-for-instr-class`);
  assert.equal(menuRows(create, `${terminalRoot}.create.property-for-instr-class`)[0].label, "General Settings");
  const timeout = ED.orden(create, `${terminalRoot}.create.property-for-instr-class.general-settings.timeout-value`, CTX);
  const placed = ED.pulsar(ED.moverA(timeout, CTX, { x: 300, y: 100 }), CTX, FONDO, { x: 300, y: 100 });
  assert.deepEqual(propertyNodes(placed)[0].config, { class: "Instr", link: null, rows: [{ property: "General Settings:Timeout Value", write: false }], "ignore-errors": false });
  assert.equal(PN.rowText(propertyNodes(placed)[0], CAT, 0), "Timeout");
});

test("a panel object's Create ▸ Property Node puts the node beside its terminal", () => {
  const { d, boolean, numeric } = panelDiagram();
  const root = "context.boolean-control";
  const menu = ED.abrirMenu(d, root, boolean, 0, 0);
  assert.deepEqual(shown(menuRows(hover(menu, `${root}.create`), `${root}.create`)), ["Local Variable", "Reference", "Property Node", "Invoke Node", "Cluster from Selection"]);
  const made = ED.orden(hover(menu, `${root}.create`, `${root}.create.property-node`), `${root}.create.property-node.visible`, CTX);
  const [node] = propertyNodes(made);
  assert.deepEqual(node.config, { class: "Boolean", link: nodeOf(d, boolean).name, rows: [{ property: "Visible", write: false }], "ignore-errors": false });
  const terminal = caja(nodeOf(d, boolean), CTX);
  assert.deepEqual([node.x, node.y], [terminal.x + terminal.ancho + 20, terminal.y]);
  // A numeric control's panel menu (pc2) has the same Create ▸.
  const numericRoot = "context.numeric-panel-control";
  assert.equal(P.menuDe(nodeOf(d, numeric)), numericRoot);
  const numericMenu = ED.abrirMenu(d, numericRoot, numeric, 0, 0);
  assert.deepEqual(shown(menuRows(numericMenu)), ["Visible Items", "---", "Change to Indicator", "Change to Array", "---", "Make Type Def.", "Description and Tip...", "Find", "---", "Create", "Replace", "Data Operations", "Advanced", "Fit Control to Pane", "Scale Object with Pane", "---", "Representation", "Data Entry...", "Display Format...", "---", "Properties"]);
  const value = ED.orden(numericMenu, `${numericRoot}.create.property-node.value`, CTX);
  assert.equal(propertyNodes(value)[0].config.link, nodeOf(d, numeric).name);
});

test("a pasted node keeps its link right when nodes are renamed", () => {
  const { d, numeric } = panelDiagram();
  const placed = createFromTerminal(d, numeric, "value");
  const [node] = propertyNodes(placed);
  const ctx = { ...CTX, panelSize: { width: 800, height: 600 } };
  // Pasted with its control, the copy follows the copy of the control.
  const both = pasteAt(placed, ctx, copyFragment(placed.g, [numeric, node.id]), { x: 500, y: 500 }, null).d;
  const copies = both.g.nodos.filter((n) => !placed.g.nodos.some((old) => old.id === n.id));
  const control = copies.find((n) => n.tipo === "control");
  assert.equal(copies.find((n) => n.tipo === "property-node").config.link, control.name);
  assert.notEqual(control.name, nodeOf(d, numeric).name);
  // Pasted alone, it stays linked to the original control.
  const alone = pasteAt(placed, ctx, copyFragment(placed.g, [node.id]), { x: 500, y: 500 }, null).d;
  assert.ok(propertyNodes(alone).every((n) => n.config.link === nodeOf(d, numeric).name));
});

test("the error glyphs sit where LabVIEW draws them and a menu taller than the window scrolls", () => {
  const { d, numeric } = panelDiagram();
  const placed = createFromTerminal(d, numeric, "value");
  const [node] = propertyNodes(placed);
  // v3_z.png: the `?!` at x 4..8 and 30..34 of a 38 px node, from y 2.
  const body = PN.propertyNodeBody(placed.g, CAT, node, caja(node, CTX));
  assert.match(body, /<path d="M4 2h1/);
  assert.match(body, /M30 2h1/);
  // Create ▸ Property Node ▸ is taller than a small window: it shows the window's height and scrolls with the wheel.
  const root = "context.numeric-control";
  const list = `${root}.create.property-node`;
  let menu = hover(openMenu(d, numeric), `${root}.create`, list);
  const draw = (state) => D.menuContextual(INV, { ...state.menu, x: 0, y: 0 }, ED.marcados(state, CTX), measure, ED.variantes(state, CTX), { width: 2000, height: 600 });
  const max = Number(/data-menu="context\.numeric-control\.create\.property-node" data-scroll-max="(\d+)"/.exec(draw(menu))[1]);
  assert.ok(max > 0);
  assert.equal(D.menuScroll(1000, 600, 50).offset, 50);
  assert.equal(D.menuScroll(1000, 600, 900).offset, 400, "never past the end");
  assert.deepEqual(D.menuScroll(400, 600, 50), { offset: 0 }, "a menu that fits does not scroll");
  menu = ED.desplazarMenu(menu, list, 10_000, max);
  assert.match(draw(menu), new RegExp(`data-scroll="${max}"`));
  // Scrolled to the end, its last row is inside the window.
  const lastTop = Number([...draw(menu).split('data-menu="context.numeric-control.create.property-node"')[1].matchAll(/class="item-menu[^"]*" data-id="[^"]+"(?: data-row="[^"]+")? style="top:(-?[\d.]+)px/g)].at(-1)[1]);
  assert.ok(lastTop > 0 && lastTop < 600, `the last row at ${lastTop}`);
});

test("VISA Bytes at Serial Port places an Instr node reading Bytes at Port, from both Serial palettes", () => {
  // reports/2026-11-05-visa-bytes-at-port.md: a plain Instr Property Node, one read row, 72 x 35, the row blue (U32).
  for (const id of ["palette.functions.instrument-io.serial.visa-bytes-at-serial-port", "palette.functions.instrument-io.visa.visa-advanced.bus-interface-specific.serial.visa-bytes-at-serial-port"]) {
    const entry = INV.entrada(id);
    assert.equal(entry.estado, "built");
    const picked = ED.coger(ED.inicial(), entry.bloque, entry.config);
    const dropped = ED.pulsar(ED.moverA(picked, CTX, { x: 600, y: 300 }), CTX, FONDO, { x: 600, y: 300 });
    const [node] = propertyNodes(dropped);
    assert.deepEqual(node.config.rows, [{ property: "Serial Settings:Number of Bytes at Serial Port", write: false }]);
    const box = caja(node, CTX);
    assert.deepEqual([box.ancho, box.alto], [72, 35]);
    // Centred on the click, as the reference constant (control-references.test.mjs: an odd height lands half a pixel up).
    assert.deepEqual([box.x + box.ancho / 2, box.y + box.alto / 2], [600, 299.5]);
    assert.equal(PN.rowText(node, CAT, 0), "Bytes at Port");
    assert.equal(PN.rowColor(dropped.g, CAT, node, 0), aspecto("u32").color);
    const outputs = terminales(node, CTX).filter((t) => t.dir === "out").map((t) => t.puerto);
    assert.deepEqual(outputs, ["reference-out", "row-0", "error-out"]);
    // Read only: its row menu greys Change To Write and Change All To Write.
    const rows = menuRows(openMenu(dropped, node.id, "row-0"));
    assert.ok(rows.find((r) => r.label === "Change To Write").greyed);
    assert.ok(rows.find((r) => r.label === "Change All To Write").greyed);
  }
});
