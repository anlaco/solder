// The enum's Edit Items…, its menus and its panel objects (DT-049, #32). Measured in
// LabVIEW 2026 Q3: labview-captures/reports/2026-10-14-enum-edit-items.md and -2. Pure
// functions, no browser.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as EI from "../../editor/src/block-diagram/edit-items-dialog.mjs";
import * as G from "../../editor/src/common/glyphs.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { compilar } from "../../core/compiler/compiler.mjs";
import { createOnTerminal } from "../../core/model/create-on-terminal.mjs";
import * as P from "../../editor/src/front-panel/front-panel.mjs";
import { CAT, INV } from "../helpers.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",");
const FONDO = { tipo: "fondo" };
const ENUM = { enum: ["Init", "Heat", "Done"] };

/** An enum constant placed on the diagram, its item-name edit confirmed. */
function constante(items = ENUM.enum, value = 0) {
  let d = ED.inicial();
  d = ED.pulsar(ED.moverA(ED.coger(d, "enum-const"), CTX, { x: 100, y: 100 }), CTX, FONDO, { x: 100, y: 100 });
  d = ED.confirmar(d, CTX);
  const [id] = d.seleccion;
  return { ...d, g: Gr.fijarConfig(d.g, id, { type: { enum: items }, value }) };
}

test("the enum constant has its own menu with Edit Items, measured", () => {
  const d = constante();
  const [id] = d.seleccion;
  const n = d.g.nodos.find((k) => k.id === id);
  // Before #32 the right-click opened the Functions palette: there was no menu root.
  assert.equal(D.menuDe(n, null, d.g), "context.enum-constant");
  const menu = ED.abrirMenu(d, "context.enum-constant", id, 0, 0);
  const html = D.menuContextual(INV, menu.menu, new Set(), undefined, ED.variantes(menu, CTX));
  const order = ["Visible Items", "Change to Control", "Make Type Def.", "Description and Tip...", "Numeric Palette", "Create", "Replace", "Data Operations", "Advanced", "Representation", "Display Format...", "Add Item After", "Remove Item", "Edit Items...", "Select Item...", "Properties"];
  const positions = order.map((text) => html.indexOf(text));
  assert.ok(positions.every((p, k) => p >= 0 && (k === 0 || p > positions[k - 1])), `row order: ${positions}`);
  assert.ok(!INV.resolver("context.enum-constant.edit-items").labview, "Edit Items is done, not a hole");
  // The row opens the dialog on the node.
  const conDialogo = ED.orden(menu, "context.enum-constant.edit-items", CTX);
  assert.equal(conDialogo.dialogo.nodo, id);
  assert.deepEqual(conDialogo.dialogo.filas.map((f) => f.texto), ENUM.enum);
  assert.equal(conDialogo.dialogo.titulo, "Enum Constant Properties");
});

test("Edit Items edits the items of the enum and its Cases", () => {
  const d = constante();
  const [id] = d.seleccion;
  // A Case fed by the enum, as the state machine does.
  const caso = Gr.crearEstructura(d.g, CAT, "case-structure", 300, 100, 200, 150);
  let g = Gr.fijarMarcos(caso.g, CAT, caso.id, [{ valores: ["Init"], default: true }, { valores: ["Heat"] }]);
  const selector = g.nodos.find((k) => k.dentro === caso.id && k.tipo === "case-selector");
  g = Gr.conectar(g, CAT, { nodo: id, puerto: "result", dir: "out" }, { nodo: selector.id, puerto: "selector", dir: "in" }).g;

  // The dialog: typing renames the selected row; Enter commits and inserts an empty row
  // below (measured); OK writes the items and renames the frames of the Cases it feeds.
  let dialogo = EI.act(EI.open(g.nodos.find((k) => k.id === id)), "dialog.enum-edit-items.row-0");
  dialogo = EI.type(EI.type(EI.type(dialogo, "S"), "t"), "a");
  dialogo = EI.type(dialogo, "r");
  dialogo = EI.type(dialogo, "t");
  assert.equal(dialogo.edicion.texto, "Start");
  let conItems = EI.apply(g, dialogo);
  assert.deepEqual(conItems.nodos.find((k) => k.id === id).config.type.enum[0], "Start");
  assert.deepEqual(conItems.nodos.find((k) => k.id === caso.id).config.marcos[0].valores, ["Start"], "the rename reaches the frames");

  // Insert and Enter: what LabVIEW does, and Delete needs a row it can leave.
  dialogo = EI.act(EI.open(conItems.nodos.find((k) => k.id === id)), "dialog.enum-edit-items.insert");
  assert.equal(dialogo.filas.length, 4);
  for (const character of "Mid") dialogo = EI.type(dialogo, character);
  dialogo = EI.type(dialogo, "Enter");
  assert.equal(dialogo.filas.length, 5, "Enter commits and inserts below");
  for (const character of "Soak") dialogo = EI.type(dialogo, character);
  assert.deepEqual(EI.apply(conItems, dialogo).nodos.find((k) => k.id === id).config.type.enum, ["Start", "Mid", "Soak", "Heat", "Done"], "Enter keeps the name just typed");
  // Move Up carries the row being written, with what it already has.
  let moviendo = EI.act(EI.open(conItems.nodos.find((k) => k.id === id)), "dialog.enum-edit-items.row-1");
  for (const character of "Warm") moviendo = EI.type(moviendo, character);
  moviendo = EI.act(moviendo, "dialog.enum-edit-items.move-up");
  assert.deepEqual(moviendo.filas.map((f) => f.texto), ["Warm", "Start", "Done"], "the typed name moves with its row");
  const soloUno = EI.act(EI.type(EI.open({ ...conItems.nodos.find((k) => k.id === id), config: { type: { enum: ["Init"] }, value: 0 } }), "Escape"), "dialog.enum-edit-items.delete");
  assert.equal(soloUno.filas.length, 1, "Delete disabled with a single row");

  // Deleting "Heat" leaves its frame with the stale name, in red, and breaks the Case with
  // LabVIEW's reason (measured); the wire stays whole.
  dialogo = EI.open(conItems.nodos.find((k) => k.id === id));
  dialogo = EI.act(EI.act(dialogo, "dialog.enum-edit-items.row-1"), "dialog.enum-edit-items.delete");
  const sinHeat = EI.apply(conItems, dialogo);
  const marcos = sinHeat.nodos.find((k) => k.id === caso.id).config.marcos;
  assert.deepEqual(marcos[1].valores, ["Heat"], "the stale name stays");
  const errores = compilar(sinHeat, CAT).errores;
  assert.ok(errores.some((e) => e.motivo === "Case Structure: Selector values have wrong type"), JSON.stringify(errores));

  // The window: five tabs, the greyed checkbox of the enum, OK/Cancel/Help.
  const html = EI.view(INV, EI.open(conItems.nodos.find((k) => k.id === id)));
  for (const part of ["Appearance", "Data Type", "Display Format", "Edit Items", "Documentation", "Items", "Values", "Insert", "Delete", "Move Up", "Move Down", "Disable Item", "Allow undefined values at run time", "OK", "Cancel", "Help"]) assert.ok(html.includes(part), part);
  const posiciones = ["Appearance", "Data Type", "Display Format", "Edit Items", "Documentation"].map((t) => html.indexOf(t));
  assert.ok(posiciones.every((p, k) => k === 0 || p > posiciones[k - 1]));
});

test("an enum control and indicator on the panel show the item name and their menu has Edit Items", () => {
  const config = { type: { enum: ["Init", "Heat", "Done"] } };
  let p = P.confirmar(P.pulsar(P.moverA(P.coger(P.inicial(), "control", config), CTX, { x: 100, y: 100 }), CTX, FONDO, { x: 100, y: 100 }));
  p = P.confirmar(P.pulsar(P.moverA(P.coger(p, "indicator", { type: { enum: ["Init", "Heat", "Done"] } }), CTX, { x: 300, y: 100 }), CTX, FONDO, { x: 300, y: 100 }));
  const [control, indicador] = p.g.nodos;
  assert.equal(control.label.text, "Enum");
  assert.equal(P.menuDe(control), "context.enum-control");
  assert.equal(P.menuDe(indicador), "context.enum-indicator");
  // 61 px in total with the arrows, next to the Numeric Control's 65 (measured).
  assert.equal(P.cajaObjeto("control", 0, 0, config).ancho, 61);
  const html = P.contenido(p, CTX);
  assert.match(html, />Init</, "the current item's name is what shows");
  assert.match(html, /class="casilla indicador"/, "the indicator's box is grey");
  // The arrows move to the next item and stop at the last one (whether LabVIEW wraps is unverified).
  p = P.pulsar(p, CTX, { tipo: "paso", id: control.id, paso: 1 }, { x: 0, y: 0 });
  p = P.pulsar(p, CTX, { tipo: "paso", id: control.id, paso: 1 }, { x: 0, y: 0 });
  p = P.pulsar(p, CTX, { tipo: "paso", id: control.id, paso: 1 }, { x: 0, y: 0 });
  assert.equal(p.g.nodos.find((k) => k.id === control.id).config.value, 2);
  assert.match(P.contenido(p, CTX), />Done</);
});

test("the enum constant's selector shows the item and a click opens its list", () => {
  const d = constante();
  const [id] = d.seleccion;
  const n = d.g.nodos.find((k) => k.id === id);
  // What shows is the current item's name, and the box widens with it (measured).
  assert.equal(D.CONSTANTES["enum-const"].texto(n, CTX), "Init");
  // A click on the constant when it is not selected opens the list of items; a row chooses it.
  const conLista = ED.pulsar({ ...d, seleccion: [] }, CTX, { tipo: "nodo", id }, { x: 105, y: 105 });
  assert.ok(conLista.lista, "the list opens");
  assert.match(D.contenido(conLista, CTX, Gr.tipos(conLista.g, CAT)), /item-valor marcado[^>]*data-valor="0"/);
  const elegido = ED.pulsar(conLista, CTX, { tipo: "fila-valor", nodo: id, k: 2 }, { x: 0, y: 0 });
  assert.equal(elegido.g.nodos.find((k) => k.id === id).config.value, 2);
  assert.equal(D.CONSTANTES["enum-const"].texto(elegido.g.nodos.find((k) => k.id === id), CTX), "Done");
});

test("a fresh enum constant is born editing its empty item's name, as in LabVIEW", () => {
  let d = ED.inicial();
  d = ED.pulsar(ED.moverA(ED.coger(d, "enum-const"), CTX, { x: 100, y: 100 }), CTX, FONDO, { x: 100, y: 100 });
  const [id] = d.seleccion;
  assert.deepEqual(d.g.nodos.find((k) => k.id === id).config.type, { enum: [""] });
  assert.ok(d.edicion?.item, "the item-name editor opens right after the drop (measured)");
  for (const character of "Heat") d = ED.teclear(d, character);
  d = ED.confirmar(d, CTX);
  assert.deepEqual(d.g.nodos.find((k) => k.id === id).config.type, { enum: ["Heat"] });
});

test("Create ▸ Indicator on an enum wire makes an enum indicator, what the Oven Controller does", () => {
  const d = constante();
  const [id] = d.seleccion;
  const hecho = createOnTerminal(d.g, CAT, { terminal: { nodo: id, puerto: "result", dir: "out" }, type: ENUM, kind: "indicator", x: 200, y: 200, panelX: 100, panelY: 100, label: "State" });
  const creado = hecho.g.nodos.find((k) => k.id === hecho.id);
  assert.equal(creado.tipo, "indicator");
  assert.deepEqual(creado.config.type, ENUM);
  assert.equal(creado.label.text, "State");
  assert.ok(hecho.wired, "wired to the enum");
  assert.match(P.contenido({ ...P.inicial(), g: hecho.g }, CTX), />Init</, "it shows the item's name");
});

test("the Enum of Controls Ring & Enum is placed on the panel and born with one empty item", () => {
  // The subpalette, broken down as measured: five entries, only the plain Enum done.
  const hijas = INV.hijos("palette.controls.modern.ring-and-enum");
  assert.deepEqual(hijas.map((h) => h.etiqueta), ["Text Ring", "Menu Ring", "Enum", "Pict Ring", "Text & Pict Ring"]);
  const entrada = INV.resolver("palette.controls.modern.ring-and-enum.enum");
  assert.equal(entrada.estado, "built");
  const p = P.confirmar(P.pulsar(P.moverA(P.coger(P.inicial(), entrada.bloque, entrada.config), CTX, { x: 100, y: 100 }), CTX, FONDO, { x: 100, y: 100 }));
  const [control] = p.g.nodos;
  assert.deepEqual(control.config.type, { enum: [""] }, "a fresh enum is born with one empty item (measured)");
  assert.equal(control.config.value, 0);
  // Its terminal on the diagram is an enum: what Create ▸ Indicator on an enum wire gets.
  assert.deepEqual(Gr.tipos(p.g, CAT).salidas.get(`${control.id}.result`), { enum: [""] });
});
