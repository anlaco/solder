// '\' Codes Display on a string constant, control and indicator (DT-110), as LabVIEW 2026 Q3 shows it
// (labview-captures/reports/2026-11-27-string-codes-display.md §3–§5; local evidence, never committed).

import assert from "node:assert/strict";
import { test } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

import * as Gr from "../../core/model/graph.mjs";
import * as CV from "../../core/model/control-values.mjs";
import { aTexto, leer } from "../../core/model/qvi-format.mjs";
import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as P from "../../editor/src/front-panel/front-panel.mjs";
import { CAT, INV, leer as leerJson } from "../helpers.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",", undefined, "windows");
const CODES = { display: "codes" };

/** A diagram with one string constant holding `value`, in '\' Codes Display when `config` says so. */
function stringConstant(value, config = {}) {
  const placed = Gr.crearNodo(Gr.nuevo(), CAT, "str-const", 0, 0);
  return { ...ED.inicial(), g: Gr.fijarConfig(placed.g, placed.id, { value, ...config }), id: placed.id };
}
const typeInto = (state, keys) => keys.reduce((typed, key) => ED.teclear(typed, key), state);

test("a string constant in '\\' Codes shows its line feed as \\n, and its space as \\s", () => {
  const d = stringConstant("*IDN? x\n", CODES);
  assert.equal(D.CONSTANTES["str-const"].texto(d.g.nodos[0], CTX), "*IDN?\\sx\\n");
  assert.equal(D.CONSTANTES["str-const"].texto(stringConstant("*IDN?\n").g.nodos[0], CTX), "*IDN?\n", "Normal Display shows the text as it is");
});

test("typing *IDN?\\n into a string constant in '\\' Codes gives a real line feed (issue #23)", () => {
  const d = stringConstant("", CODES);
  const typed = typeInto(ED.editar(d, CTX, d.id), ["Backspace", ..."*IDN?\\n"]);
  const done = ED.confirmar(typed, CTX);
  assert.equal(done.g.nodos[0].config.value, "*IDN?\n");
  // In Normal Display the same keys are the text itself, a backslash and an n, as LabVIEW keeps them (§4).
  const plain = stringConstant("");
  assert.equal(ED.confirmar(typeInto(ED.editar(plain, CTX, plain.id), ["Backspace", ..."*IDN?\\n"]), CTX).g.nodos[0].config.value, "*IDN?\\n");
});

test("editing a constant in '\\' Codes starts from its codes and an untouched edit keeps the value", () => {
  const value = "A\udcff\r\n";
  const d = stringConstant(value, CODES);
  const editing = ED.editar(d, CTX, d.id);
  assert.equal(editing.edicion.texto, "A\\FF\\r\\n");
  assert.equal(ED.confirmar(editing, CTX).g.nodos[0].config.value, value);
});

/** A panel with one string control or indicator in `config`'s display style. */
function panelString(block, config = {}) {
  const placed = Gr.crearEnPanel(Gr.nuevo(), CAT, block, 60, 60, "String");
  return { p: { ...P.inicial(), g: Gr.fijarConfig(placed.g, placed.id, config) }, id: placed.id };
}

test("a string control in '\\' Codes reads what is typed into it as codes", () => {
  const { p, id } = panelString("str-control", CODES);
  let typed = P.editarValor(p, CTX, id, true);
  for (const key of "\\41\\s\\0D") typed = P.teclear(typed, key);
  // Return inserts a real line feed, which shows as \n (§3).
  typed = P.teclear(typed, "Enter");
  const done = P.confirmar(typed);
  assert.equal(CV.currentValue(done.g.nodos.find((n) => n.id === id)), "A \r\n");
  assert.equal(P.editarValor(done, CTX, id, true).edicion.texto, "A\\s\\r\\n");
});

test("a string indicator in '\\' Codes shows the value a Run wrote with codes (§5)", () => {
  const { p, id } = panelString("str-indicator", CODES);
  const html = P.contenido({ ...p, valores: { [id]: "A\n e\f\u0000d\\" } }, CTX);
  assert.ok(html.includes("A\\n\\se\\f\\00d\\\\"), "the indicator's box shows the codes");
  assert.ok(!P.contenido({ ...p, g: Gr.fijarConfig(p.g, id, { display: undefined }), valores: { [id]: "A\n" } }, CTX).includes("A\\n"), "Normal Display does not");
});

test("the display style is saved with the OVI, on the panel object and on the constant, and the file validates", () => {
  const panel = Gr.crearEnPanel(Gr.nuevo(), CAT, "str-control", 60, 60, "s");
  let g = Gr.fijarConfig(panel.g, panel.id, CODES);
  const constant = Gr.crearNodo(g, CAT, "str-const", 0, 100);
  g = Gr.fijarConfig(constant.g, constant.id, { value: "a\udcff", ...CODES });
  const text = aTexto(g, CAT);
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(leerJson("docs/schema/qvi.schema.json"));
  assert.ok(validate(JSON.parse(text)), JSON.stringify(validate.errors));
  assert.match(text, /"display": "codes"/);
  const read = leer(text, CAT);
  assert.equal(read.nodos.find((n) => n.tipo === "str-control").config.display, "codes");
  const readConstant = read.nodos.find((n) => n.tipo === "str-const");
  assert.deepEqual([readConstant.config.display, readConstant.config.value], ["codes", "a\udcff"]);
  assert.equal(aTexto(read, CAT), text);
});

// ——— The menus (labview-captures/reports/2026-11-27-string-menus.md) ———

const labels = (root) => INV.hijos(root).map((entry) => entry.etiqueta);
const separated = (root) => INV.hijos(root).filter((entry) => entry.separado).map((entry) => entry.etiqueta);
const DISPLAY_ROWS = ["Normal Display", "'\\' Codes Display", "Password Display", "Hex Display"];

test("the string objects have their measured menus", () => {
  assert.deepEqual(labels("context.string-control"), ["Visible Items", "Change to Indicator", "Change to Array", "Make Type Def.", "Description and Tip...", "Find", "Create",
    "Replace", "Data Operations", "Advanced", "Fit Control to Pane", "Scale Object with Pane", "Representation", ...DISPLAY_ROWS, "Limit to Single Line", "Update Value while Typing", "Enable Wrapping", "Properties"]);
  assert.deepEqual(separated("context.string-control"), ["Change to Indicator", "Make Type Def.", "Create", "Representation", "Normal Display", "Limit to Single Line", "Properties"]);
  assert.deepEqual(labels("context.string-indicator").slice(0, 6), ["Visible Items", "Find Terminal", "Change to Control", "Change to Array", "Make Type Def.", "Description and Tip..."]);
  assert.deepEqual(labels("context.string-constant"), ["Visible Items", "Change to Control", "Change to Indicator", "Change to Array", "Make Type Def.", "Description and Tip...", "String Palette",
    "Create", "Replace", "Data Operations", "Advanced", "Representation", "Size To Text", "Edit...", "Left Justify Text", "Right Justify Text", ...DISPLAY_ROWS, "Limit to Single Line", "Enable Wrapping", "Properties"]);
  assert.deepEqual(labels("context.string-constant.representation"), ["UTF-8 Encoding", "System Encoding"]);
  // A terminal has no display rows (§6).
  for (const root of ["context.string-control-terminal", "context.string-indicator-terminal"]) {
    assert.ok(labels(root).includes("View As Icon") && !labels(root).includes("Normal Display"), root);
  }
  // Which object opens which menu.
  const panel = Gr.crearEnPanel(Gr.nuevo(), CAT, "str-indicator", 60, 60, "t");
  assert.equal(P.menuDe(panel.g.nodos.find((n) => n.id === panel.id)), "context.string-indicator");
  assert.equal(P.menuDe(Gr.crearEnPanel(Gr.nuevo(), CAT, "str-control", 60, 60, "s").g.nodos.at(-1)), "context.string-control");
  // Only Normal Display and '\' Codes Display are built; Password and Hex are greyed with their reason.
  assert.equal(INV.entrada("context.string-control.codes-display").estado, "built");
  assert.equal(INV.entrada("context.string-constant.hex-display").estado, "todo");
});

test("the display rows of a string switch it between Normal and codes", () => {
  const d = stringConstant("a b\n");
  const open = (state) => ED.abrirMenu(state, "context.string-constant", d.id, 0, 0);
  const marks = (state) => ED.marcados(open(state), CTX);
  assert.ok(marks(d).has("context.string-constant.normal-display") && !marks(d).has("context.string-constant.codes-display"), "Normal is ticked by default");
  assert.ok(marks(d).has("context.string-constant.enable-wrapping") && marks(d).has("context.string-constant.size-to-text"));
  const codes = ED.orden(open(d), "context.string-constant.codes-display", CTX);
  assert.equal(codes.menu, null);
  assert.equal(codes.g.nodos[0].config.display, "codes");
  assert.equal(codes.g.nodos[0].config.value, "a b\n", "the value never changes");
  assert.equal(D.CONSTANTES["str-const"].texto(codes.g.nodos[0], CTX), "a\\sb\\n");
  assert.ok(marks(codes).has("context.string-constant.codes-display") && !marks(codes).has("context.string-constant.normal-display"), "one tick, a radio group");
  const back = ED.orden(open(codes), "context.string-constant.normal-display", CTX);
  assert.equal(D.CONSTANTES["str-const"].texto(back.g.nodos[0], CTX), "a b\n");
  // The panel's string control and indicator switch the same way, from their own menus.
  for (const block of ["str-control", "str-indicator"]) {
    const { p, id } = panelString(block);
    const root = P.menuDe(p.g.nodos.find((n) => n.id === id));
    const switched = ED.orden(ED.abrirMenuDelPanel({ ...ED.inicial(), g: p.g }, root, id, 0, 0), `${root}.codes-display`, CTX);
    assert.equal(switched.g.nodos.find((n) => n.id === id).config.display, "codes", block);
  }
});

test("a string terminal toggles View As Icon", () => {
  for (const block of ["str-control", "str-indicator"]) {
    const { p, id } = panelString(block);
    const terminalRoot = block === "str-control" ? "context.string-control-terminal" : "context.string-indicator-terminal";
    assert.ok(!p.g.nodos.find((n) => n.id === id).vista?.compacto, "an icon by default");
    const toggled = ED.orden(ED.abrirMenu({ ...ED.inicial(), g: p.g }, terminalRoot, id, 0, 0), `${terminalRoot}.view-as-icon`, CTX);
    assert.equal(!!toggled.g.nodos.find((n) => n.id === id).vista?.compacto, true, block);
  }
});

test("Data Operations of a string control makes its current value its default", () => {
  for (const root of ["context.string-control", "context.string-control-terminal"]) {
    const { p, id } = panelString("str-control");
    const open = (graph) => ED.abrirMenu({ ...ED.inicial(), g: graph }, root, id, 0, 0);
    const made = ED.orden(open(CV.setCurrentValue(p.g, id, "*IDN?\n")), `${root}.data-operations.make-current-value-default`, CTX);
    assert.equal(made.g.nodos.find((n) => n.id === id).config.value, "*IDN?\n", root);
    const back = ED.orden(open(CV.setCurrentValue(made.g, id, "other")), `${root}.data-operations.reinitialize-to-default-value`, CTX);
    assert.equal(CV.currentValue(back.g.nodos.find((n) => n.id === id)), "*IDN?\n", root);
  }
});
