// Create ▸ from the right-click menus, and copy, cut, paste and duplicate on the diagram and on the panel
// (labview-captures/create-paste/REPORT.md). The pure functions of the editor, without a browser.

import assert from "node:assert/strict";
import { test } from "node:test";

import { caja, contexto, glifosPorBloque, terminales } from "../../editor/src/block-diagram/diagram-view.mjs";
import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as DC from "../../editor/src/block-diagram/diagram-clipboard.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as Gr from "../../core/model/graph.mjs";
import * as H from "../../editor/src/block-diagram/undo-history.mjs";
import * as P from "../../editor/src/front-panel/front-panel.mjs";
import * as PC from "../../editor/src/front-panel/panel-clipboard.mjs";
import { PANEL_GRID } from "../../editor/src/block-diagram/terminal-creation.mjs";
import { REPEATED_PASTE_STEP } from "../../editor/src/common/paste-memory.mjs";
import { CAT, INV } from "../helpers.mjs";

const CTX = contexto(CAT, glifosPorBloque(INV), ",");
const FONDO = { tipo: "fondo" };
const CREATE_ROWS = ["constant", "control", "indicator", "scalar", "channel-writer", "all-controls-and-indicators", "all-constants"];

/** A diagram with one node of `block` at (300, 100), and the state of the editor on it. */
function withNode(block, x = 300, y = 100) {
  const r = Gr.crearNodo(Gr.nuevo(), CAT, block, x, y);
  return { d: { ...ED.inicial(), g: r.g }, id: r.id };
}

/** Right-click on a terminal of a node (or on its body, without `port`) and choose a row of Create ▸. */
function chooseCreate(d, root, id, row, port = null) {
  return ED.orden(ED.abrirMenu(d, root, id, 0, 0, port, { x: 50, y: 60 }), `${root}.create.${row}`, CTX);
}

const box = (g, id) => caja(g.nodos.find((n) => n.id === id), CTX);

test("the Create submenu of the nodes has LabVIEW's rows in its order", () => {
  for (const root of ["context.function", "context.comparison-function", "context.comparison-with-zero", "context.select", "context.max-and-min", "context.in-range-and-coerce", "context.compound-arithmetic", "context.compound-arithmetic-input", "context.subvi"]) {
    const rows = INV.hijos(`${root}.create`);
    assert.deepEqual(rows.map((e) => e.id.split(".").pop()), CREATE_ROWS, root);
    assert.deepEqual(rows.map((e) => !!e.separado), [false, false, false, false, false, true, false], `${root}: the line is before All Controls and Indicators`);
    assert.deepEqual(rows.slice(0, 3).map((e) => e.estado), ["built", "built", "built"], root);
    assert.ok(INV.hijos(`${root}.create.scalar`).map((e) => e.etiqueta).join() === "Constant,Control", `${root}: Scalar ▸ Constant, Control`);
  }
});

test("Create Constant from the node menu wires a constant and leaves its value typed in", () => {
  const { d, id } = withNode("add");
  const made = chooseCreate(d, "context.function", id, "constant", "a");
  assert.equal(made.menu, null);
  const constant = made.g.nodos.find((n) => n.tipo === "num-const");
  assert.deepEqual(made.edicion, { nodo: constant.id, texto: "0", todo: true, nuevo: true }, "the value is selected for typing, not the object");
  assert.deepEqual(made.seleccion, []);
  const typed = ED.confirmar(ED.teclear(ED.teclear(made, "4"), "2"), CTX);
  assert.equal(typed.g.nodos.find((n) => n.id === constant.id).config.value, 42);
  assert.deepEqual(made.g.cables.map((c) => [c.de.nodo, c.a.nodo, c.a.puerto]), [[constant.id, id, "a"]]);
});

test("Create Control and Indicator from the node menu make the panel objects and leave the label typed in", () => {
  const { d, id } = withNode("add");
  const control = chooseCreate(d, "context.function", id, "control", "b");
  const created = control.g.nodos.find((n) => n.tipo === "control");
  assert.deepEqual([control.edicion.etiqueta, control.edicion.nodo, control.edicion.texto, control.edicion.nuevo], [true, created.id, "y", true], "the label is the terminal's name");
  assert.equal(created.panel.x, PANEL_GRID.originX);
  const indicator = chooseCreate(control, "context.function", id, "indicator", "result");
  const out = indicator.g.nodos.find((n) => n.tipo === "indicator");
  assert.equal(out.label.text, "x+y");
  assert.equal(indicator.g.cables.length, 2);
  assert.equal(indicator.g.cables.find((c) => c.a.nodo === out.id).de.nodo, id);
});

test("Create is one step of undo and typing after it is another", () => {
  const { d, id } = withNode("add");
  let history = H.nuevo(d.g);
  const made = chooseCreate(d, "context.function", id, "constant", "a");
  // The window records the diagram when what Create made is typed into (`edicion.nuevo`).
  history = H.registrar(history, made.g);
  const typed = ED.confirmar(ED.teclear(made, "7"), CTX);
  history = H.registrar(history, typed.g);
  const undoTyping = H.deshacer(history);
  assert.equal(undoTyping.g.nodos.find((n) => n.tipo === "num-const").config.value, 0, "undo first takes back the typing");
  const undoCreate = H.deshacer(undoTyping.h);
  assert.deepEqual(undoCreate.g.nodos.map((n) => n.id), [id], "the next undo removes the constant and its wire");
  assert.equal(undoCreate.g.cables.length, 0);
});

test("on the body of a node Constant, Control and Indicator are greyed and the All items are not", () => {
  const { d, id } = withNode("add");
  const onBody = ED.variantes(ED.abrirMenu(d, "context.function", id, 0, 0, null), CTX);
  assert.deepEqual([...onBody.desactivados].sort(), ["context.function.create.constant", "context.function.create.control", "context.function.create.indicator"]);
  assert.deepEqual(chooseCreate(d, "context.function", id, "constant", null).g, d.g, "greyed: nothing is created");
  const onTerminal = ED.variantes(ED.abrirMenu(d, "context.function", id, 0, 0, "a"), CTX);
  assert.equal(onTerminal.desactivados.size, 0, "on a terminal nothing is greyed");
  assert.ok(onTerminal.ocultos.has("context.function.create.scalar"), "Scalar is only for arrays");
});

test("Scalar appears on an array terminal and is greyed with its reason", () => {
  const { d, id } = withNode("array-size");
  let g = d.g;
  const constant = Gr.crearNodo(g, CAT, "arr-const", 100, 100);
  g = Gr.fijarConfig(constant.g, constant.id, { type: { array: "number", dims: 1 }, value: [] });
  g = Gr.conectar(g, CAT, { nodo: constant.id, puerto: "result", dir: "out" }, { nodo: id, puerto: "array", dir: "in" }).g;
  const variants = ED.variantes(ED.abrirMenu({ ...d, g }, "context.array-size", id, 0, 0, "array"), CTX);
  assert.ok(!variants.ocultos.has("context.array-size.create.scalar"));
  const scalar = INV.entrada("context.function.create.scalar");
  assert.equal(scalar.estado, "todo");
  assert.ok(INV.explicacion(scalar).solder.length > 10);
});

test("All Controls and Indicators and All Constants act on the terminals that have no wire", () => {
  const { d, id } = withNode("quotient-remainder", 400, 200);
  const all = ED.orden(ED.abrirMenu(d, "context.function", id, 0, 0, null, { x: 0, y: 0 }), "context.function.create.all-controls-and-indicators", CTX);
  assert.equal(all.g.nodos.length, 5);
  assert.equal(all.g.cables.length, 4);
  assert.equal(all.edicion, null, "no label is typed into when several objects are made");
  const constants = ED.orden(ED.abrirMenu(withNode("add").d, "context.function", "n1", 0, 0, null, { x: 0, y: 0 }), "context.function.create.all-constants", CTX);
  assert.equal(constants.g.nodos.filter((n) => n.tipo === "num-const").length, 2);
});

test("a type with no block yet says why in the diagram's notice", () => {
  const { d, id } = withNode("unbundle");
  const made = chooseCreate(d, "context.function", id, "constant", "campo-0");
  assert.match(made.aviso.texto, /no constant|not known/i);
  assert.deepEqual([made.aviso.x, made.aviso.y], [50, 60], "where the menu was opened");
});

// ——— The wire menu ———

test("the wire menu is the one of a wire and its Create makes unwired objects", () => {
  const { d, id } = withNode("add");
  const wired = chooseCreate(d, "context.function", id, "constant", "a");
  const confirmed = ED.confirmar(wired, CTX);
  const wire = confirmed.g.cables[0];
  assert.equal(ED.wireAtTerminal(confirmed.g, id, "a", "in").id, wire.id, "a terminal with a wire gives the wire's menu");
  assert.equal(ED.wireAtTerminal(confirmed.g, id, "b", "in"), undefined);
  const rows = INV.hijos(ED.WIRE_MENU_ROOT).map((e) => e.etiqueta).filter((label) => label !== "Disable Breakpoint");
  assert.deepEqual(rows, ["Clean Up Wire", "Create Wire Branch", "Delete Wire Branch", "Visible Items", "Insert", "Numeric Palette", "Create", "Add Probe", "Custom Probe", "Add Breakpoint", "Description and Tip..."]);
  assert.deepEqual(INV.hijos(`${ED.WIRE_MENU_ROOT}.create`).map((e) => [e.etiqueta, e.estado]), [["Constant", "built"], ["Control", "built"], ["Indicator", "built"], ["Create SubVI from Selected Wires", "todo"], ["Channel Writer...", "todo"]]);
  const menu = ED.abrirMenu(confirmed, ED.WIRE_MENU_ROOT, wire.id, 0, 0, null, { x: 200, y: 300 });
  const control = ED.orden(menu, `${ED.WIRE_MENU_ROOT}.create.control`, CTX);
  assert.equal(control.g.cables.length, 1, "no new wire");
  assert.equal(control.edicion.etiqueta, true);
  const made = control.g.nodos.find((n) => n.tipo === "control");
  assert.deepEqual([made.config.type], ["number"]);
  const indicator = ED.orden(menu, `${ED.WIRE_MENU_ROOT}.create.indicator`, CTX);
  assert.equal(indicator.g.cables.length, 1);
  assert.ok(indicator.g.nodos.some((n) => n.tipo === "indicator"));
});

// ——— Copy, cut and paste on the diagram ———

/** const 2 → add.a, const 3 → add.b, add → indicator Sum; the diagram selected as the rectangle would. */
function adder() {
  let g = Gr.nuevo();
  const put = (tipo, x, y, config) => {
    const r = Gr.crearNodo(g, CAT, tipo, x, y);
    g = config ? Gr.fijarConfig(r.g, r.id, config) : r.g;
    return r.id;
  };
  const two = put("const", 100, 100, { value: 2 });
  const three = put("const", 100, 140, { value: 3 });
  const add = put("add", 200, 110);
  const panel = Gr.crearEnPanel(g, CAT, "indicator", 300, 40, "Sum");
  g = panel.g;
  for (const [a, pa, b, pb] of [[two, "result", add, "a"], [three, "result", add, "b"], [add, "result", panel.id, "value"]]) {
    g = Gr.conectar(g, CAT, { nodo: a, puerto: pa, dir: "out" }, { nodo: b, puerto: pb, dir: "in" }).g;
  }
  return { d: { ...ED.inicial(), g }, two, three, add, sum: panel.id };
}

test("Paste centres the copy on the pointer, keeps the wires inside the copy and selects it", () => {
  const { d, two, three, add } = adder();
  const selected = { ...d, seleccion: [two, add] };
  const fragment = DC.copySelection(selected);
  const pasted = DC.pasteAt(d, CTX, fragment, { x: 500, y: 400 }, null);
  assert.equal(pasted.d.seleccion.length, 2);
  const boxes = pasted.d.seleccion.map((id) => box(pasted.d.g, id));
  const [left, right] = [Math.min(...boxes.map((b) => b.x)), Math.max(...boxes.map((b) => b.x + b.ancho))];
  const [top, bottom] = [Math.min(...boxes.map((b) => b.y)), Math.max(...boxes.map((b) => b.y + b.alto))];
  assert.ok(Math.abs((left + right) / 2 - 500) <= 1 && Math.abs((top + bottom) / 2 - 400) <= 1, "centred on the pointer");
  assert.equal(pasted.d.g.cables.length, d.g.cables.length + 1, "only the wire between the two copied nodes");
  assert.ok(![three].some((id) => pasted.d.seleccion.includes(id)));
});

test("Paste again without moving the pointer shifts each copy 8 px down and to the right", () => {
  const { d, add } = adder();
  const fragment = DC.copySelection({ ...d, seleccion: [add] });
  const first = DC.pasteAt(d, CTX, fragment, { x: 500, y: 400 }, null);
  const second = DC.pasteAt(first.d, CTX, fragment, { x: 500, y: 400 }, first.memory);
  const [a, b] = [first.d.seleccion[0], second.d.seleccion[0]].map((id) => box(second.d.g, id));
  assert.deepEqual([b.x - a.x, b.y - a.y], [REPEATED_PASTE_STEP, REPEATED_PASTE_STEP]);
  const moved = DC.pasteAt(second.d, CTX, fragment, { x: 700, y: 400 }, second.memory);
  assert.equal(moved.memory.count, 0, "moving the pointer starts again");
  assert.equal(box(moved.d.g, moved.d.seleccion[0]).x + box(moved.d.g, moved.d.seleccion[0]).ancho / 2, 700);
});

test("one paste is one step of undo", () => {
  const { d, add } = adder();
  const fragment = DC.copySelection({ ...d, seleccion: [add] });
  let history = H.nuevo(d.g);
  const pasted = DC.pasteAt(d, CTX, fragment, { x: 500, y: 400 }, null);
  history = H.registrar(history, pasted.d.g);
  assert.deepEqual(H.deshacer(history).g, d.g);
});

test("pasting a control terminal makes its panel object in the first free row of the left column, numbered", () => {
  let g = Gr.nuevo();
  const control = Gr.crearEnPanel(g, CAT, "control", PANEL_GRID.originX, PANEL_GRID.originY, "x");
  const d = { ...ED.inicial(), g: control.g, seleccion: [control.id] };
  const fragment = DC.copySelection(d);
  const first = DC.pasteAt(d, CTX, fragment, { x: 300, y: 200 }, null);
  const copy = first.d.g.nodos.find((n) => n.id === first.d.seleccion[0]);
  assert.equal(copy.label.text, "x 2");
  assert.deepEqual([copy.panel.x, copy.panel.y], [PANEL_GRID.originX, PANEL_GRID.originY + PANEL_GRID.rowStep], "the next free row");
  const second = DC.pasteAt(first.d, CTX, fragment, { x: 300, y: 200 }, first.memory);
  assert.equal(second.d.g.nodos.find((n) => n.id === second.d.seleccion[0]).panel.y, PANEL_GRID.originY + 2 * PANEL_GRID.rowStep);
  assert.equal(second.d.g.nodos.find((n) => n.id === second.d.seleccion[0]).label.text, "x 3");
});

test("Cut removes the nodes with their wires and one undo brings them back", () => {
  const { d, add, two } = adder();
  const cut = DC.cutSelection({ ...d, seleccion: [add] });
  assert.ok(!cut.d.g.nodos.some((n) => n.id === add));
  assert.ok(cut.d.g.cables.every((c) => c.de.nodo !== add && c.a.nodo !== add), "no broken wire is left");
  assert.equal(cut.fragment.nodes.length, 1);
  const history = H.registrar(H.nuevo(d.g), cut.d.g);
  assert.deepEqual(H.deshacer(history).g, d.g);
  assert.equal(DC.cutSelection({ ...d, seleccion: [] }), null, "nothing selected: nothing to cut");
  assert.ok(DC.hasSelection({ ...d, seleccion: [two] }) && !DC.hasSelection(d));
});

test("a structure is copied with what is inside and pasted into the structure it falls in", () => {
  let g = Gr.nuevo();
  const loop = Gr.crearEstructura(g, CAT, "while-loop", 100, 100, 200, 150);
  const inner = Gr.crearNodo(loop.g, CAT, "add", 150, 150);
  g = Gr.meter(inner.g, CAT, [inner.id], loop.id);
  const d = { ...ED.inicial(), g, seleccion: [loop.id] };
  const fragment = DC.copySelection(d);
  assert.ok(fragment.nodes.length > 2, "the loop, its terminals and the node");
  const pasted = DC.pasteAt(d, CTX, fragment, { x: 600, y: 400 }, null);
  const outer = pasted.d.g.nodos.find((n) => n.id === pasted.d.seleccion[0]);
  assert.equal(outer.tipo, "while-loop");
  const copyOfAdd = pasted.d.g.nodos.find((n) => n.tipo === "add" && n.id !== inner.id);
  assert.equal(copyOfAdd.dentro, outer.id, "the copy of the node is inside the copy of the loop");
  assert.equal(pasted.d.g.nodos.filter((n) => n.tipo === "while-loop").length, 2);
});

test("the copied fragment travels as text to another VI", () => {
  const { d, two, add } = adder();
  const fragment = JSON.parse(JSON.stringify(DC.copySelection({ ...d, seleccion: [two, add] })));
  const other = { ...ED.inicial() };
  const pasted = DC.pasteAt(other, CTX, fragment, { x: 200, y: 200 }, null);
  assert.equal(pasted.d.g.nodos.length, 2);
  assert.equal(pasted.d.g.cables.length, 1);
});

test("Ctrl+drag copies the node where it is and carries the copy, without wires", () => {
  const { d, add } = adder();
  const at = box(d.g, add);
  let state = ED.pulsar({ ...d, seleccion: [] }, CTX, { tipo: "nodo", id: add }, { x: at.x + 5, y: at.y + 5 }, false, true);
  state = ED.moverA(state, CTX, { x: at.x + 105, y: at.y + 55 });
  state = ED.soltar(state, CTX, FONDO, { x: at.x + 105, y: at.y + 55 });
  assert.equal(state.g.nodos.length, d.g.nodos.length + 1);
  assert.deepEqual([state.g.nodos.find((n) => n.id === add).x, state.g.nodos.find((n) => n.id === add).y], [200, 110], "the original stays");
  const copy = state.g.nodos.find((n) => n.id === state.seleccion[0]);
  assert.notEqual(copy.id, add);
  assert.deepEqual([copy.x, copy.y], [300, 160]);
  assert.equal(state.g.cables.length, d.g.cables.length, "the copy has no wires");
});

test("Select All selects every node and wire, and Delete with them leaves nothing", () => {
  const { d } = adder();
  const all = ED.selectAll(d);
  assert.equal(all.seleccion.length, d.g.nodos.length + d.g.cables.length);
  const deleted = ED.borrarSeleccion(all);
  assert.deepEqual([deleted.g.nodos.length, deleted.g.cables.length], [0, 0]);
});

// ——— The Front Panel ———

function panelWithControl() {
  const r = Gr.crearEnPanel(Gr.nuevo(), CAT, "control", 100, 100, "x");
  return { p: { ...P.inicial(r.g), seleccion: [r.id] }, id: r.id };
}

test("Paste on the panel centres the control on the pointer, numbers its label and makes its terminal unwired", () => {
  const { p, id } = panelWithControl();
  const fragment = PC.copySelection(p);
  const pasted = PC.pasteAt(p, CTX, fragment, { x: 400, y: 300 }, null);
  const copy = pasted.p.g.nodos.find((n) => n.id === pasted.p.seleccion[0]);
  assert.equal(copy.label.text, "x 2");
  const b = P.caja(copy);
  assert.ok(Math.abs(b.x + b.ancho / 2 - 400) <= 1, "centred across");
  assert.equal(pasted.p.g.nodos.length, 2);
  assert.equal(pasted.p.g.cables.length, 0, "its diagram terminal is unwired");
  assert.ok(pasted.p.g.nodos.find((n) => n.id === id), "the original stays");
  const again = PC.pasteAt(pasted.p, CTX, fragment, { x: 400, y: 300 }, pasted.memory);
  const [first, second] = [P.caja(copy), P.caja(again.p.g.nodos.find((n) => n.id === again.p.seleccion[0]))];
  assert.deepEqual([second.x - first.x, second.y - first.y], [8, 8], "a second paste shifts 8 px");
});

test("Cut and Delete on the panel remove the control and its terminal, and Select All takes every object", () => {
  const { p, id } = panelWithControl();
  const cut = PC.cutSelection(p);
  assert.equal(cut.p.g.nodos.length, 0);
  assert.equal(cut.fragment.nodes[0].id, id);
  assert.equal(PC.cutSelection({ ...p, seleccion: [] }), null);
  assert.ok(PC.hasSelection(p) && !PC.hasSelection({ ...p, seleccion: [] }));
  assert.deepEqual(PC.selectAll({ ...p, seleccion: [] }).seleccion, [id]);
});

test("Ctrl+drag on the panel copies the control with a numbered label and carries the copy", () => {
  const { p, id } = panelWithControl();
  const at = P.caja(p.g.nodos[0]);
  let state = P.pulsar({ ...p, seleccion: [] }, CTX, { tipo: "objeto", id }, { x: at.x + 30, y: at.y + 5 }, false, true);
  state = P.moverA(state, CTX, { x: at.x + 30, y: at.y + 65 });
  state = P.soltar(state, CTX, FONDO, { x: at.x + 30, y: at.y + 65 });
  assert.equal(state.g.nodos.length, 2);
  const [original, copy] = [state.g.nodos.find((n) => n.id === id), state.g.nodos.find((n) => n.id === state.seleccion[0])];
  assert.deepEqual([original.panel.x, original.panel.y], [100, 100]);
  assert.deepEqual([copy.panel.x, copy.panel.y], [100, 160]);
  assert.equal(copy.label.text, "x 2");
});

test("pasting a diagram fragment on the panel takes only its controls and indicators", () => {
  const { d, add, sum } = adder();
  const fragment = DC.copySelection({ ...d, seleccion: [add, sum] });
  const pasted = PC.pasteAt(P.inicial(), CTX, fragment, { x: 300, y: 200 }, null);
  assert.deepEqual(pasted.p.g.nodos.map((n) => n.tipo), ["indicator"]);
});
