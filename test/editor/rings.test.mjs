// The Text Ring, the Menu Ring and the Ring Constant in the editor (DT-091): placed on the panel, drawn, their menus, Edit
// Items, the list of operate mode. Measured in LabVIEW 2026 Q3: labview-captures/reports/2026-11-15-rings.md. Pure
// functions, no browser.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as CV from "../../core/model/control-values.mjs";
import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as Gr from "../../core/model/graph.mjs";
import * as MD from "../../editor/src/window/modal-dialog.mjs";
import * as P from "../../editor/src/front-panel/front-panel.mjs";
import * as RI from "../../editor/src/block-diagram/ring-items-dialog.mjs";
import * as SI from "../../editor/src/block-diagram/select-item-dialog.mjs";
import { VERSION, aTexto, leer } from "../../core/model/qvi-format.mjs";
import { ringText } from "../../core/model/ring.mjs";
import { CAT, INV } from "../helpers.mjs";

const measure = (text) => [...text].length * 6.1;
const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",", measure);
const FONDO = { tipo: "fondo" };
const TEXT_RING = INV.entrada("palette.controls.modern.ring-and-enum.text-ring");
const MENU_RING = INV.entrada("palette.controls.modern.ring-and-enum.menu-ring");

// The items the DAQ plugin needs (values read in the DAQmx stage reports).
const TERMINAL_CONFIGURATION = [
  { text: "Differential", value: 10106 },
  { text: "RSE", value: 10083 },
  { text: "NRSE", value: 10078 },
  { text: "Default", value: -1 },
];
const SEQUENTIAL = ["Differential", "RSE", "NRSE", "Default"].map((text, value) => ({ text, value }));

const nodeOf = (d, id) => d.g.nodos.find((n) => n.id === id);

/** Puts a ring from the palette entry on the panel as `block` (control or indicator), its label as it comes. */
function placeRing(p, entry, block, point) {
  const placed = P.confirmar(P.pulsar(P.moverA(P.coger(p, block, { ...entry.config }), CTX, point), CTX, FONDO, point));
  return { p: placed, id: placed.g.nodos.at(-1).id };
}

/** A panel with one ring of `entry`, as `block`, holding `items` and `value`, and the diagram state over the same graph. */
function ringPanel(entry, { block = "control", items = SEQUENTIAL, value = 0, type = "u16", point = { x: 100, y: 100 } } = {}) {
  const { p, id } = placeRing(P.inicial(), entry, block, point);
  let g = Gr.fijarConfig(p.g, id, { items, type });
  g = CV.setCurrentValue(g, id, value);
  return { p: { ...p, g }, d: { ...ED.inicial(), g }, id };
}

/** A Ring Constant on the diagram with `items`, `value` and `type`. */
function ringConstant({ items = SEQUENTIAL, value = 0, type = "u16" } = {}) {
  const made = Gr.crearNodo(Gr.nuevo(), CAT, "ring-const", 100, 100);
  const g = Gr.fijarConfig(made.g, made.id, { items, value, type });
  return { d: { ...ED.inicial(), g }, id: made.id };
}

/** The rows of a right-click menu: label, greyed, ticked, and a separator before. */
function menuRows(d, parent = d.menu.raiz) {
  const drawing = D.menuContextual(INV, { ...d.menu, x: 0, y: 0 }, ED.marcados(d, CTX), measure, ED.variantes(d, CTX));
  const menu = drawing.split('<div class="menu-contextual"').find((part) => part.includes(`data-menu="${parent}"`));
  return [...menu.matchAll(/(<div class="separador-menu"[^>]*><\/div>)?<div class="item-menu([^"]*)" data-id="([^"]+)"(?: data-row="([^"]+)")?[^>]*><span class="texto-menu"[^>]*>([^<]*)</g)].map((m) => ({
    id: m[4] ?? m[3],
    label: m[5].replaceAll("&amp;", "&"),
    greyed: /hueco|desactivado/.test(m[2]),
    separated: !!m[1],
    checked: /marcado/.test(m[2]),
  }));
}
const shown = (rows) => rows.flatMap((row) => (row.separated ? ["---", row.label] : [row.label]));
const hover = (d, ...ids) => ids.reduce((menu, id) => ED.sobreMenu(menu, id, true), d);
const openMenu = (d, id) => ED.abrirMenu(d, D.menuDe(nodeOf(d, id), null, d.g, false, CAT), id, 0, 0);
const panelMenu = (d, p, id) => ED.abrirMenuDelPanel(d, P.menuDe(nodeOf(p, id)), id, 0, 0);

test("the Text Ring and the Menu Ring of Controls Ring & Enum are placed on the panel as numerics with one empty item", () => {
  for (const [entry, label, style] of [[TEXT_RING, "Ring", "text-ring"], [MENU_RING, "Menu Ring", "menu-ring"]]) {
    assert.equal(entry.estado, "built");
    assert.deepEqual(entry.config, { type: "u16", style, items: [{ text: "", value: 0 }] });
    const { p, id } = placeRing(P.inicial(), entry, "control", { x: 100, y: 100 });
    const node = nodeOf(p, id);
    assert.equal(node.label.text, label, "the title of its Properties dialog (measured)");
    assert.deepEqual(node.config, { type: "u16", value: 0, style, items: [{ text: "", value: 0 }] });
    // The terminal is a normal numeric one of its representation: a blue U16 (measured).
    assert.equal(Gr.tipos(p.g, CAT).salidas.get(`${id}.result`), "u16");
    assert.equal(P.menuDe(node), "context.ring-control");
    assert.equal(P.menuDe({ ...node, tipo: "indicator" }), "context.ring-indicator");
  }
  // A second one of the same kind gets a numbered label, as every control does.
  const second = placeRing(placeRing(P.inicial(), TEXT_RING, "control", { x: 100, y: 100 }).p, TEXT_RING, "control", { x: 300, y: 100 });
  assert.equal(nodeOf(second.p, second.id).label.text, "Ring 2");
  // A ring survives saving: its items and Allow Undefined Values are in the file (DT-091 §3).
  const { p, id } = ringPanel(MENU_RING, { items: TERMINAL_CONFIGURATION, value: 10083 });
  const g = Gr.fijarConfig(p.g, id, { "allow-undefined": true });
  const text = aTexto(g, CAT);
  assert.equal(JSON.parse(text).solder, VERSION);
  const reopened = leer(text, CAT);
  const back = reopened.nodos.find((n) => n.name === nodeOf(p, id).name);
  assert.deepEqual(back.config.items, TERMINAL_CONFIGURATION);
  assert.equal(back.config.style, "menu-ring");
  assert.equal(back.config["allow-undefined"], true);
  assert.equal(aTexto(reopened, CAT), text, "saving what was opened gives the same text");
});

test("the rings draw as measured: sizes, arrows and the text they show", () => {
  // Boxes (measured): Text Ring 50 x 25 with the arrows left of it, outside; Menu Ring 115 x 21, no arrows.
  const box = (entry, block) => P.cajaObjeto(block, 0, 0, entry.config);
  assert.deepEqual([box(TEXT_RING, "control").ancho, box(TEXT_RING, "control").alto, box(TEXT_RING, "control").casilla], [62, 25, 12]);
  assert.deepEqual([box(TEXT_RING, "indicator").ancho, box(TEXT_RING, "indicator").alto, box(TEXT_RING, "indicator").casilla], [50, 25, 0]);
  for (const block of ["control", "indicator"]) assert.deepEqual([box(MENU_RING, block).ancho, box(MENU_RING, block).alto], [115, 21], "the indicator is identical to the control");

  const textControl = ringPanel(TEXT_RING, { items: TERMINAL_CONFIGURATION, value: 10083 });
  let html = P.contenido(textControl.p, CTX);
  assert.match(html, /class="objeto-panel sd-control sd-ring sd-text-ring"/);
  assert.match(html, /sd-incrementer/, "the Text Ring control has arrows");
  assert.doesNotMatch(html, /sd-dropdown/, "and no triangle");
  assert.match(html, /<span class="sd-value">RSE</, "the text of the item with the value");

  const textIndicator = ringPanel(TEXT_RING, { block: "indicator", items: TERMINAL_CONFIGURATION, value: 10083 });
  assert.doesNotMatch(P.contenido(textIndicator.p, CTX), /sd-incrementer/, "the indicator has no arrows");

  const menuControl = ringPanel(MENU_RING, { items: TERMINAL_CONFIGURATION, value: -1 });
  html = P.contenido(menuControl.p, CTX);
  assert.match(html, /sd-menu-ring/);
  assert.match(html, /sd-dropdown/, "the Menu Ring ends in the triangle");
  assert.doesNotMatch(html, /sd-incrementer/, "and has no arrows");
  assert.match(html, /<span class="sd-value">Default</);
  assert.match(P.contenido(ringPanel(MENU_RING, { block: "indicator" }).p, CTX), /sd-indicator sd-ring sd-menu-ring"/);

  // A value no item has shows as <value> (measured), and while running what the run gave is what shows.
  const undefinedValue = ringPanel(TEXT_RING, { items: SEQUENTIAL, value: 9 });
  assert.match(P.contenido(undefinedValue.p, CTX), /<span class="sd-value">&lt;9&gt;</);
  const running = { ...textControl.p, valores: { [textControl.id]: 10078 } };
  assert.match(P.contenido(running, CTX), /<span class="sd-value">NRSE</);
  // Typing does not apply: nothing in a ring is a value box.
  assert.equal(P.hoverCursor(textControl.p, { tipo: "casilla", id: textControl.id }, { x: 120, y: 110 }), null);
});

test("the ring menus show LabVIEW's rows in its order for the control, the indicator and the constant", () => {
  const control = ringPanel(TEXT_RING);
  const controlMenu = panelMenu(control.d, control.p, control.id);
  assert.equal(controlMenu.menu.raiz, "context.ring-control");
  assert.deepEqual(shown(menuRows(controlMenu)), ["Visible Items", "Find Terminal", "Change to Indicator", "Change to Array", "---", "Make Type Def.", "---", "Description and Tip...", "---", "Create", "Replace", "Data Operations", "Advanced", "Fit Control to Pane", "Scale Object with Pane", "---", "Representation", "Data Entry...", "Display Format...", "---", "Allow Undefined Values", "---", "Select Item...", "Edit Items...", "Disable Item", "Hide Last Item When Running", "---", "Properties"]);
  // The Menu Ring's menu is the same (measured: identical).
  const menu = ringPanel(MENU_RING);
  assert.equal(panelMenu(menu.d, menu.p, menu.id).menu.raiz, "context.ring-control");

  const indicator = ringPanel(TEXT_RING, { block: "indicator" });
  assert.deepEqual(shown(menuRows(panelMenu(indicator.d, indicator.p, indicator.id))), ["Visible Items", "Find Terminal", "Change to Control", "Change to Array", "---", "Make Type Def.", "---", "Description and Tip...", "---", "Create", "Replace", "Data Operations", "Advanced", "Fit Control to Pane", "Scale Object with Pane", "---", "Adapt To Source", "Representation", "Display Format...", "---", "Allow Undefined Values", "---", "Select Item...", "Edit Items...", "Disable Item", "Hide Last Item When Running", "---", "Properties"]);

  const constant = ringConstant();
  const constantMenu = openMenu(constant.d, constant.id);
  assert.equal(constantMenu.menu.raiz, "context.ring-constant");
  assert.deepEqual(shown(menuRows(constantMenu)), ["Visible Items", "Change to Control", "Change to Indicator", "Change to Array", "---", "Make Type Def.", "---", "Description and Tip...", "---", "Numeric Palette", "Create", "Replace", "Data Operations", "Advanced", "---", "Representation", "Display Format...", "---", "Allow Undefined Values", "---", "Edit Items...", "Select Item...", "Disable Item", "---", "Properties"]);

  // What is not done is greyed and says what is missing (DT-035); what is done is not.
  const built = ["change-to-indicator", "create", "replace", "data-operations", "representation", "allow-undefined", "select-item", "edit-items"];
  for (const row of menuRows(controlMenu)) {
    const name = row.id.slice(row.id.lastIndexOf(".") + 1);
    assert.equal(row.greyed, !built.includes(name), `${name}: greyed unless built`);
  }
  for (const name of ["data-entry", "disable-item", "hide-last-item-when-running"]) assert.match(INV.explicacion(INV.resolver(`context.ring-control.${name}`)).solder, /^Missing: /);
});

test("Representation of a ring changes its type and wraps the values of its items", () => {
  const ring = ringPanel(TEXT_RING, { items: [...TERMINAL_CONFIGURATION], value: 10083, type: "i32" });
  const root = "context.ring-control";
  const toI8 = ED.orden(panelMenu(ring.d, ring.p, ring.id), `${root}.representation.i8`, CTX);
  const afterI8 = nodeOf(toI8, ring.id);
  assert.equal(afterI8.config.type, "i8");
  assert.deepEqual(afterI8.config.items.map((item) => item.value), [122, 99, 94, -1], "measured: modulo 256, not a clamp");
  assert.equal(CV.currentValue(afterI8), 99, "the value follows its item");
  assert.equal(ringText(afterI8.config.items, CV.currentValue(afterI8)), "RSE");
  // The submenu ticks the ring's representation, and I8 to U8 wraps -1 to 255 (measured).
  const ticked = ED.marcados(panelMenu(toI8, toI8, ring.id), CTX);
  assert.ok(ticked.has(`${root}.representation.i8`));
  const toU8 = ED.orden(panelMenu(toI8, toI8, ring.id), `${root}.representation.u8`, CTX);
  assert.deepEqual(nodeOf(toU8, ring.id).config.items.map((item) => item.value), [122, 99, 94, 255]);
  // Floats are allowed; the complex types, fixed point and EXT are not offered as working rows.
  const toDbl = ED.orden(panelMenu(toU8, toU8, ring.id), `${root}.representation.dbl`, CTX);
  assert.equal(nodeOf(toDbl, ring.id).config.type, "number");
  const holes = INV.hijos(`${root}.representation`).filter((entry) => entry.estado !== "built").map((entry) => entry.etiqueta);
  assert.deepEqual(holes, ["EXT", "FXP", "CXT", "CDB", "CSG"]);

  // The constant has the same row, and the terminal of a panel ring (a numeric's menu) the same effect.
  const constant = ringConstant({ items: TERMINAL_CONFIGURATION, value: -1, type: "i32" });
  const constantMenu = openMenu(constant.d, constant.id);
  const retyped = ED.orden(constantMenu, "context.ring-constant.representation.u8", CTX);
  assert.deepEqual(nodeOf(retyped, constant.id).config.items.map((item) => item.value), [10106 % 256, 10083 % 256, 10078 % 256, 255]);
  assert.equal(nodeOf(retyped, constant.id).config.value, 255);
  assert.ok(ED.marcados(openMenu(retyped, constant.id), CTX).has("context.ring-constant.representation.u8"));
  const fromTerminal = ED.orden(ED.abrirMenu(ring.d, "context.numeric-control", ring.id, 0, 0), "context.numeric-control.representation.i16", CTX);
  assert.deepEqual(nodeOf(fromTerminal, ring.id).config.items.map((item) => item.value), [10106, 10083, 10078, -1]);
});

test("Allow Undefined Values toggles on the menu with a check mark", () => {
  const ring = ringPanel(MENU_RING);
  const root = "context.ring-control";
  const row = (d) => menuRows(panelMenu(d, d.g && ring.p, ring.id)).find((candidate) => candidate.label === "Allow Undefined Values");
  assert.ok(!row(ring.d).checked, "off by default (measured)");
  const on = ED.orden(panelMenu(ring.d, ring.p, ring.id), `${root}.allow-undefined`, CTX);
  assert.equal(nodeOf(on, ring.id).config["allow-undefined"], true);
  assert.ok(menuRows(panelMenu(on, on, ring.id)).find((candidate) => candidate.label === "Allow Undefined Values").checked);
  const off = ED.orden(panelMenu(on, on, ring.id), `${root}.allow-undefined`, CTX);
  assert.equal(nodeOf(off, ring.id).config["allow-undefined"], false);
  // On the constant too (measured: its menu row is enabled while the dialog's box is greyed).
  const constant = ringConstant();
  const constantOn = ED.orden(openMenu(constant.d, constant.id), "context.ring-constant.allow-undefined", CTX);
  assert.equal(nodeOf(constantOn, constant.id).config["allow-undefined"], true);
});

test("Change to Indicator and Change to Control keep the style and the items of a panel ring", () => {
  const ring = ringPanel(TEXT_RING, { items: TERMINAL_CONFIGURATION, value: 10083 });
  const asIndicator = ED.orden(panelMenu(ring.d, ring.p, ring.id), "context.ring-control.change-to-indicator", CTX);
  const indicator = nodeOf(asIndicator, ring.id);
  assert.equal(indicator.tipo, "indicator");
  assert.equal(indicator.config.style, "text-ring");
  assert.deepEqual(indicator.config.items, TERMINAL_CONFIGURATION);
  assert.equal(indicator.label.text, "Ring");
  assert.equal(CV.currentValue(indicator), 10083);
  assert.equal(P.menuDe(indicator), "context.ring-indicator");
  assert.equal(P.cajaObjeto("indicator", 0, 0, indicator.config).ancho, 50, "the arrows go");
  const backToControl = ED.orden(panelMenu(asIndicator, asIndicator, ring.id), "context.ring-indicator.change-to-indicator", CTX);
  assert.equal(nodeOf(backToControl, ring.id).tipo, "control");
  assert.equal(nodeOf(backToControl, ring.id).config.style, "text-ring");
  // The wires of its terminal follow the flip, as an array's do.
  let g = Gr.crearEnPanel(ring.p.g, CAT, "indicator", 400, 100, "Numeric").g;
  const sink = g.nodos.at(-1).id;
  g = Gr.conectar(g, CAT, { nodo: ring.id, puerto: "result", dir: "out" }, { nodo: sink, puerto: "value", dir: "in" }).g;
  const flipped = ED.orden(panelMenu({ ...ring.d, g }, { g }, ring.id), "context.ring-control.change-to-indicator", CTX);
  assert.equal(flipped.g.cables[0].de.puerto, "value");
});

test("Edit Items of a ring has Sequential values and a Values column", () => {
  const sequential = ringPanel(TEXT_RING, { items: SEQUENTIAL, value: 1 });
  let dialog = RI.open(nodeOf(sequential.p, sequential.id));
  assert.equal(dialog.titulo, "Ring Properties: Ring (Ring)", "measured title");
  assert.ok(dialog.sequential, "ticked when the values are 0, 1, 2 by position");
  assert.equal(dialog.elegida, 1, "the item that shows is selected");
  assert.ok(dialog.canAllowUndefined && !dialog.allowUndefined);
  assert.equal(RI.open(nodeOf(ringConstant().d, ringConstant().id)).titulo, "Ring Constant Properties");

  // A ring with free values opens unticked (measured, on the constant).
  const free = ringPanel(MENU_RING, { items: TERMINAL_CONFIGURATION, value: 10083 });
  dialog = RI.open(nodeOf(free.p, free.id));
  assert.ok(!dialog.sequential);
  assert.equal(RI.open(nodeOf(ringConstant({ items: TERMINAL_CONFIGURATION }).d, "n1")).canAllowUndefined, false, "greyed on the constant");

  // Ticked, the values cannot be edited: the first click selects and the second changes nothing.
  const ticked = RI.open(nodeOf(sequential.p, sequential.id));
  assert.equal(RI.act(RI.act(ticked, "dialog.enum-edit-items.value-2"), "dialog.enum-edit-items.value-2").edicion, null);

  // Unticking makes the values editable: click the row, then the Values cell again (measured).
  let editing = RI.act(ticked, "dialog.enum-edit-items.sequential-values");
  assert.ok(!editing.sequential);
  editing = RI.act(editing, "dialog.enum-edit-items.value-2");
  assert.equal(editing.edicion, null, "the first click only selects");
  editing = RI.act(editing, "dialog.enum-edit-items.value-2");
  assert.deepEqual(editing.edicion, { fila: 2, columna: "value", texto: "2", todo: true });
  for (const key of ["7", "5"]) editing = RI.type(editing, key);
  editing = RI.type(editing, "Enter");
  assert.deepEqual(editing.filas.map((row) => row.valor), [0, 1, 75, 3], "the typed value, the others untouched");
  assert.equal(editing.filas[2].texto, "NRSE", "the item travels with its value");

  // The typed value goes through the representation: -1 on U16 gives 0 and 70000 gives 65535 (measured); I32 keeps -1.
  const typedInto = (dialog0, text) => RI.type(["", ...text].reduce((state, key) => (key === "" ? RI.act(RI.act(state, "dialog.enum-edit-items.value-0"), "dialog.enum-edit-items.value-0") : RI.type(state, key)), dialog0), "Enter").filas[0].valor;
  const unticked = RI.act(ticked, "dialog.enum-edit-items.sequential-values");
  assert.equal(typedInto(unticked, "-1"), 0);
  assert.equal(typedInto(unticked, "70000"), 65535);
  assert.equal(typedInto({ ...unticked, type: "i32" }, "-1"), -1);
  assert.equal(typedInto({ ...unticked, type: "number" }, "2.5"), 2.5, "floats take fractions (measured)");
  assert.equal(typedInto(unticked, "abc"), 0, "letters are not values: the value stays");

  // Two items with one value: a warning, OK greyed, Cancel works (measured). Our own wording.
  const duplicated = RI.type(RI.act(RI.act(RI.act(editing, "dialog.enum-edit-items.value-0"), "dialog.enum-edit-items.value-0"), "dialog.enum-edit-items.value-0"), "1");
  const clash = RI.type(duplicated, "Enter");
  assert.ok(RI.duplicateValues(clash));
  const clashHtml = RI.view(INV, clash);
  assert.ok(clashHtml.includes(RI.DUPLICATE_WARNING));
  assert.match(clashHtml, /pv-boton defecto desactivado" data-id=""[^>]*>OK</, "OK is greyed and has nothing to click");
  assert.equal(RI.click(clash, "dialog.enum-edit-items.ok"), null);
  assert.equal(RI.key({ ...clash, listFocused: false }, { key: "Enter" }), null, "Enter is OK only when OK works");
  assert.deepEqual(RI.click(clash, "dialog.enum-edit-items.cancel"), { cancel: true });
  assert.ok(!RI.view(INV, editing).includes(RI.DUPLICATE_WARNING), "no warning while the values differ");
  assert.deepEqual(RI.click(editing, "dialog.enum-edit-items.ok"), { accept: true });

  // Re-ticking renumbers at once from 0 and the custom values are lost (measured).
  const reticked = RI.act(editing, "dialog.enum-edit-items.sequential-values");
  assert.ok(reticked.sequential);
  assert.deepEqual(reticked.filas.map((row) => row.valor), [0, 1, 2, 3]);

  // Insert puts a new item above the selection with the value 0 and leaves the other values alone; ticked it renumbers (measured).
  const freeDialog = RI.act(RI.open(nodeOf(free.p, free.id)), "dialog.enum-edit-items.row-1");
  const inserted = RI.act(freeDialog, "dialog.enum-edit-items.insert");
  assert.deepEqual(inserted.filas.map((row) => row.valor), [10106, 0, 10083, 10078, -1]);
  assert.equal(inserted.filas[1].texto, "");
  assert.deepEqual(inserted.edicion, { fila: 1, columna: "text", texto: "", todo: true });
  const insertedTicked = RI.act(RI.act(ticked, "dialog.enum-edit-items.row-1"), "dialog.enum-edit-items.insert");
  assert.deepEqual(insertedTicked.filas.map((row) => row.valor), [0, 1, 2, 3, 4]);
  // Move Up and Move Down carry the value with the item, unticked; ticked the values stay by position. Greyed at the ends.
  const moved = RI.act(freeDialog, "dialog.enum-edit-items.move-up");
  assert.deepEqual(moved.filas.map((row) => [row.texto, row.valor]), [["RSE", 10083], ["Differential", 10106], ["NRSE", 10078], ["Default", -1]]);
  const movedTicked = RI.act(RI.act(ticked, "dialog.enum-edit-items.row-0"), "dialog.enum-edit-items.move-down");
  assert.deepEqual(movedTicked.filas.map((row) => [row.texto, row.valor]), [["RSE", 0], ["Differential", 1], ["NRSE", 2], ["Default", 3]]);
  assert.ok(!RI.enabled(RI.act(freeDialog, "dialog.enum-edit-items.row-0"), "move-up"));
  assert.ok(!RI.enabled(RI.act(freeDialog, "dialog.enum-edit-items.row-3"), "move-down"));
  assert.ok(!RI.enabled(freeDialog, "disable-item"), "Disable Item is not built");

  // The window: the enum's plus the checkbox, a Values column that is not greyed once editable, Allow undefined at run time.
  const html = RI.view(INV, RI.open(nodeOf(free.p, free.id)));
  for (const part of ["Sequential values", "Items", "Values", "Insert", "Delete", "Move Up", "Move Down", "Disable Item", "Allow undefined values at run time", "OK", "Cancel", "Help"]) assert.ok(html.includes(part), part);
  assert.match(html, /celda valor editable/);
  assert.doesNotMatch(RI.view(INV, ticked), /celda valor editable/);
  assert.match(RI.view(INV, RI.open(nodeOf(ringConstant().d, "n1"))), /ficha-casilla desactivada[^>]*><span class="ficha-casilla-parte" data-id="dialog.enum-edit-items.allow-undefined"/);

  // OK writes the items as pairs and Allow undefined values on a control; the constant keeps its own.
  const withUndefined = RI.act(RI.act(editing, "dialog.enum-edit-items.allow-undefined"), "dialog.enum-edit-items.row-0");
  const written = nodeOf({ g: RI.apply(free.p.g, { ...withUndefined, nodo: free.id }) }, free.id);
  assert.deepEqual(written.config.items, [{ text: "Differential", value: 0 }, { text: "RSE", value: 1 }, { text: "NRSE", value: 75 }, { text: "Default", value: 3 }]);
  assert.equal(written.config["allow-undefined"], true);
  const constant = ringConstant({ items: TERMINAL_CONFIGURATION, value: 10083 });
  const constantDialog = RI.act(RI.open(nodeOf(constant.d, constant.id)), "dialog.enum-edit-items.allow-undefined");
  assert.ok(!constantDialog.allowUndefined, "the constant's box does nothing");
  assert.ok(!("allow-undefined" in nodeOf({ g: RI.apply(constant.d.g, constantDialog) }, constant.id).config));

  // The menu row opens this dialog, and the window routes it to this module (not the enum's).
  const opened = ED.orden(panelMenu(free.d, free.p, free.id), "context.ring-control.edit-items", CTX);
  assert.equal(opened.itemsDialog.ring, true);
  assert.equal(MD.openDialog(null, opened).mod, RI);
  const fromConstant = ED.orden(openMenu(constant.d, constant.id), "context.ring-constant.edit-items", CTX);
  assert.equal(MD.openDialog(fromConstant, null).mod, RI);
  assert.deepEqual(MD.clickIntent(MD.openDialog(null, opened), "dialog.enum-edit-items.cancel"), { cancel: true });
});

test("Select Item of a ring picks the value of its item", () => {
  const ring = ringPanel(MENU_RING, { items: TERMINAL_CONFIGURATION, value: -1 });
  const opened = ED.orden(panelMenu(ring.d, ring.p, ring.id), "context.ring-control.select-item", CTX);
  assert.deepEqual(opened.selectItemDialog.items, ["Differential", "RSE", "NRSE", "Default"], "the texts of the items");
  const picked = SI.apply(ring.p.g, SI.click(opened.selectItemDialog, "dialog.select-item.item-1", 2).dialog);
  assert.equal(CV.currentValue(nodeOf({ g: picked }, ring.id)), 10083, "the value of the item, not its position");
  const constant = ringConstant({ items: TERMINAL_CONFIGURATION, value: -1 });
  const fromConstant = ED.orden(openMenu(constant.d, constant.id), "context.ring-constant.select-item", CTX);
  const constantPicked = SI.apply(constant.d.g, SI.click(fromConstant.selectItemDialog, "dialog.select-item.item-2", 2).dialog);
  assert.equal(nodeOf({ g: constantPicked }, constant.id).config.value, 10078);
});

test("the ring's Data Operations and Create rows work as the numeric's", () => {
  const ring = ringPanel(TEXT_RING, { items: TERMINAL_CONFIGURATION, value: 10083 });
  const root = "context.ring-control";
  const menu = panelMenu(ring.d, ring.p, ring.id);
  const asDefault = ED.orden(menu, `${root}.data-operations.make-current-value-default`, CTX);
  assert.equal(nodeOf(asDefault, ring.id).config.value, 10083, "its current value becomes its default");
  assert.deepEqual(shown(menuRows(hover(menu, `${root}.create`), `${root}.create`)), ["Local Variable", "Reference", "Property Node", "Invoke Node", "Cluster from Selection"]);
  const made = ED.orden(hover(menu, `${root}.create`, `${root}.create.property-node`), `${root}.create.property-node.value`, CTX);
  const [property] = made.g.nodos.filter((n) => n.tipo === "property-node");
  // The class is the numeric's: a Ring's own properties were not catalogued (unverified).
  assert.equal(property.config.link, nodeOf(ring.d, ring.id).name);
  assert.equal(INV.resolver(`${root}.create.local-variable`).estado, "todo");
});

test("operate mode opens the list of the ring's items and a pick sets its value", () => {
  const ring = ringPanel(TEXT_RING, { items: TERMINAL_CONFIGURATION, value: 10083 });
  const press = { tipo: "casilla", id: ring.id };
  assert.ok(P.opensRingList(ring.p, press));
  assert.ok(P.opensRingList(ring.p, { tipo: "objeto", id: ring.id }));
  assert.ok(!P.opensRingList(ring.p, { tipo: "paso", id: ring.id, paso: 1 }), "the arrows step instead");
  assert.ok(!P.opensRingList(ringPanel(TEXT_RING, { block: "indicator" }).p, press), "an indicator is not operated");

  const open = P.openRingList(ring.p, ring.id);
  const box = P.caja(nodeOf(ring.p, ring.id));
  assert.deepEqual([open.lista.x, open.lista.y], [box.x + box.casilla, box.y], "anchored at the control's top left");
  const html = P.contenido(open, CTX);
  for (const text of ["Differential", "RSE", "NRSE", "Default"]) assert.ok(html.includes(`>${text}<`), text);
  assert.match(html, /item-ring marcado" data-nodo="[^"]+" data-ring-item="1"/, "the check mark on the current item");
  assert.equal(html.match(/marcado/g).length, 1);

  // A row picks the item: the ring takes its value, the list closes, and what the last run left is dropped.
  const picked = P.pressRingList({ ...open, valores: { [ring.id]: 5 } }, { tipo: "fila-ring", id: ring.id, k: 3 });
  assert.equal(CV.currentValue(nodeOf(picked, ring.id)), -1);
  assert.equal(picked.lista, null);
  assert.deepEqual(picked.valores, {});
  assert.match(P.contenido(picked, CTX), /<span class="sd-value">Default</);
  // A press elsewhere closes it and changes nothing; so does Escape.
  assert.equal(CV.currentValue(nodeOf(P.pressRingList(open, { tipo: "fondo" }), ring.id)), 10083);
  assert.equal(P.escape(open).lista, null);
  assert.equal(P.pulsar(open, CTX, FONDO, { x: 0, y: 0 }).lista, null);

  // The Menu Ring's list is as wide as the control (about 115 px).
  const menu = ringPanel(MENU_RING, { items: [{ text: "a", value: 0 }], value: 0 });
  assert.match(P.contenido(P.openRingList(menu.p, menu.id), CTX), /class="menu-contextual lista-marcos" style="[^"]*width:115px/);

  // With Allow Undefined Values on, the list gains the row `<Other>...`, drawn greyed (not built, DT-091 §5), which picks nothing.
  const allowing = ringPanel(MENU_RING, { items: SEQUENTIAL, value: 2 });
  const withOther = P.openRingList({ ...allowing.p, g: Gr.fijarConfig(allowing.p.g, allowing.id, { "allow-undefined": true }) }, allowing.id);
  assert.match(P.contenido(withOther, CTX), /item-ring hueco"[^>]*><span class="texto-menu"[^>]*>&lt;Other&gt;\.\.\./);
  assert.equal(CV.currentValue(nodeOf(P.pressRingList(withOther, { tipo: "fila-ring", id: allowing.id, k: undefined }), allowing.id)), 2);

  // The arrows go through the items in list order: the up arrow to the item above (measured: from a value with no item it
  // went to the last one, then up; the down arrow went down). At the ends it stops (unverified).
  const arrows = ringPanel(TEXT_RING, { items: SEQUENTIAL, value: 7 });
  const step = (p, paso) => P.pulsar(p, CTX, { tipo: "paso", id: arrows.id, paso }, { x: 0, y: 0 });
  let p = step(arrows.p, 1);
  assert.equal(CV.currentValue(nodeOf(p, arrows.id)), 3);
  p = step(p, 1);
  assert.equal(CV.currentValue(nodeOf(p, arrows.id)), 2);
  p = step(p, -1);
  assert.equal(CV.currentValue(nodeOf(p, arrows.id)), 3);
  assert.equal(CV.currentValue(nodeOf(step(p, -1), arrows.id)), 3, "it stops at the last item");
});

test("a ring constant shows the text of its item and its list picks the item's value", () => {
  const constant = ringConstant({ items: TERMINAL_CONFIGURATION, value: 10083 });
  const node = nodeOf(constant.d, constant.id);
  assert.equal(D.menuDe(node, null, constant.d.g, false, CAT), "context.ring-constant");
  assert.equal(D.CONSTANTES["ring-const"].texto(node, CTX), "RSE", "the text of the item with its value");
  assert.equal(D.CONSTANTES["ring-const"].texto({ ...node, config: { ...node.config, value: 9 } }, CTX), "<9>", "<value> when no item has it");
  assert.equal(D.CONSTANTES["ring-const"].texto({ ...node, config: { ...node.config, items: [{ text: "", value: 0 }], value: 0 } }, CTX), "", "a new ring's empty item");

  // A click on it, not selected, opens the list with the check on the item that has its value; a row picks that item's value.
  const listed = ED.pulsar({ ...constant.d, seleccion: [] }, CTX, { tipo: "nodo", id: constant.id }, { x: 105, y: 105 });
  assert.ok(listed.lista);
  const html = D.contenido(listed, CTX, Gr.tipos(listed.g, CAT));
  for (const text of ["Differential", "RSE", "NRSE", "Default"]) assert.ok(html.includes(`>${text}<`), text);
  assert.match(html, /item-valor marcado[^>]*data-valor="1"/);
  const picked = ED.pulsar(listed, CTX, { tipo: "fila-valor", nodo: constant.id, k: 3 }, { x: 0, y: 0 });
  assert.equal(nodeOf(picked, constant.id).config.value, -1, "the value of the item, not its position");
  assert.equal(D.CONSTANTES["ring-const"].texto(nodeOf(picked, constant.id), CTX), "Default");
  assert.equal(picked.lista, null);
  // A ring constant whose value is in no item shows <0> (measured) and marks no row.
  const none = ringConstant({ items: [{ text: "a", value: 5 }], value: 0 });
  const noneListed = ED.pulsar({ ...none.d, seleccion: [] }, CTX, { tipo: "nodo", id: none.id }, { x: 105, y: 105 });
  assert.ok(!/marcado/.test(D.contenido(noneListed, CTX, Gr.tipos(noneListed.g, CAT))));
});

// S11-#3, 2026-11-15: faults found by hand in the ring's Edit Items.
const ID = "dialog.enum-edit-items";
const freeRing = (items = TERMINAL_CONFIGURATION, value = 10083) => {
  const placed = ringPanel(MENU_RING, { items, value, type: "i32" });
  return RI.open(nodeOf(placed.p, placed.id));
};
const withManyItems = (count) => {
  const items = Array.from({ length: count }, (_, k) => ({ text: `Item ${k}`, value: k * 11 }));
  return { dialog: freeRing(items, 0), items };
};

test("Enter in a ring's Edit Items leaves a blank edit row, which is not an item and does not clash with another", () => {
  let dialog = freeRing([{ text: "a", value: 0 }]);
  dialog = RI.act(RI.act(dialog, `${ID}.row-0`), `${ID}.row-0`);
  assert.equal(dialog.edicion.columna, "text", "a click on the selected row's text edits it");
  // Enter after the text opens an edit row below; Enter again on that untouched row adds no second one.
  dialog = RI.type(dialog, "Enter");
  assert.equal(dialog.filas.length, 2);
  dialog = RI.type(dialog, "Enter");
  dialog = RI.type(dialog, "Enter");
  assert.equal(dialog.filas.length, 2, "Enter on a blank row adds none");
  assert.ok(!RI.duplicateValues(dialog), "two blank rows of value 0 are not a duplicate");
  assert.deepEqual(RI.click(dialog, `${ID}.ok`), { accept: true });
  const placed = ringPanel(MENU_RING, { items: [{ text: "a", value: 0 }], value: 0 });
  const saved = nodeOf({ g: RI.apply(placed.p.g, { ...dialog, nodo: placed.id }) }, placed.id);
  assert.deepEqual(saved.config.items, [{ text: "a", value: 0 }], "the blank row is not saved");
  // Enter on a focused row (not editing) does the same; once the row has a text it is an item.
  const focused = RI.key(RI.act(freeRing(SEQUENTIAL), `${ID}.row-3`), { key: "Enter" }).dialog;
  assert.equal(RI.key(focused, { key: "Enter" }).dialog.filas.length, 5);
  const named = RI.type(RI.type(focused, "x"), "Enter");
  assert.deepEqual(named.filas.map((row) => !!row.blank), [false, false, false, false, false, true]);
  // A blank row shows no value.
  assert.doesNotMatch(RI.view(INV, focused), /value-4"[^>]*>0</);
});

test("the Values column of a ring shows a whole I32 and takes the click over all of its cell", () => {
  const dialog = freeRing([{ text: "min", value: -2147483648 }, { text: "x", value: 10083 }]);
  const html = RI.view(INV, dialog);
  const cellStyle = /data-id="dialog.enum-edit-items.value-0" style="left:(\d+)px;width:(\d+)px;height:(\d+)px/.exec(html);
  assert.ok(cellStyle, "the cell has its own box");
  const [, left, width, height] = cellStyle.map(Number);
  assert.ok(width >= 80, "an 11-character value (about 70 px) fits");
  assert.ok(left + width <= 327, "inside the list (327 px wide)");
  assert.equal(height, 29, "the whole row's height");
  assert.match(html, />-2147483648</);
});

test("the list of Edit Items scrolls with the wheel and keeps the edited row in view, for rings and enums", () => {
  const { dialog } = withManyItems(12);
  assert.equal(dialog.scroll, 0);
  const wheeled = RI.wheel(dialog, 60);
  assert.equal(wheeled.scroll, 60);
  assert.match(RI.view(INV, wheeled), /row-2" style="top:-2px/);
  assert.equal(RI.wheel(dialog, -50).scroll, 0, "not above the first row");
  assert.equal(RI.wheel(dialog, 100000).scroll, 12 * 29 - 148, "not past the last row");
  assert.match(RI.view(INV, wheeled), /ficha-lista-barra/, "a scroll bar once the rows overflow");
  assert.doesNotMatch(RI.view(INV, freeRing()), /ficha-lista-barra/);
  // The window routes the wheel to the open dialog.
  const open = { mod: RI, dialog };
  assert.equal(MD.wheelIntent(open, 29).dialog.scroll, 29);
  // Selecting the last row (Enter past the visible ones) scrolls to it.
  const last = RI.click(dialog, `${ID}.row-11`).dialog;
  assert.equal(last.scroll, 12 * 29 - 148);
});

test("typing on a selected row of a ring edits its text; the first click only selects", () => {
  let dialog = freeRing(SEQUENTIAL, 0);
  dialog = RI.click(dialog, `${ID}.row-2`).dialog;
  assert.equal(dialog.elegida, 2);
  assert.equal(dialog.edicion, null, "the first click only selects");
  dialog = RI.key(dialog, { key: "Z" }).dialog;
  assert.deepEqual(dialog.edicion, { fila: 2, columna: "text", texto: "Z", todo: false });
  dialog = RI.key(dialog, { key: "Enter" }).dialog;
  assert.equal(dialog.filas[2].texto, "Z");
});

test("only the box and the label of the checkboxes take clicks", () => {
  const html = RI.view(INV, freeRing());
  // The outer element has no id and lets clicks through; the inner one, as wide as box and label, has it.
  assert.match(html, /<div class="ficha-casilla[^"]*" style="[^"]*"><span class="ficha-casilla-parte" data-id="dialog.enum-edit-items.allow-undefined">/);
  assert.doesNotMatch(html, /<div class="ficha-casilla[^>]*data-id/);
});

test("the Text Ring's down arrow from a value with no item goes to the first item (unverified in LabVIEW)", () => {
  const ring = ringPanel(TEXT_RING, { items: SEQUENTIAL, value: 7 });
  const down = P.pulsar(ring.p, CTX, { tipo: "paso", id: ring.id, paso: -1 }, { x: 0, y: 0 });
  assert.equal(CV.currentValue(nodeOf(down, ring.id)), 0);
});
