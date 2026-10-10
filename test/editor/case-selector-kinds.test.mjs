// The Case Structure with a string or an enum selector, in the editor (spec/05 Rule 40f).
// Measured in LabVIEW 2026 Q3: labview-captures/reports/2026-10-10-string-case.md
// and labview-captures/reports/2026-10-10-enum-case.md. Pure functions, no browser.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import { contexto, etiquetaMarco, glifosPorBloque, selectorKind, terminales } from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { CAT, INV } from "../helpers.mjs";

const CTX = contexto(CAT, glifosPorBloque(INV), ",");
const FONDO = { tipo: "fondo" };
const ENUM = { enum: ["Init", "Heat", "Done"] };

const caseNode = (d) => d.g.nodos.find((n) => n.tipo === "case-structure");
const selectorOf = (d) => d.g.nodos.find((n) => n.tipo === "case-selector");
const frames = (d) => caseNode(d).config.marcos;
const kindOf = (d) => selectorKind(d.g, caseNode(d), Gr.tipos(d.g, CAT));
const labels = (d) => frames(d).map((m) => etiquetaMarco(m, kindOf(d)));

function place(d, block, point) {
  d = ED.moverA(ED.coger(d, block), CTX, point);
  return ED.pulsar(d, CTX, FONDO, point);
}

function wire(d, [fromTerminal, fromPoint], [toTerminal, toPoint]) {
  d = ED.pulsar(d, CTX, fromTerminal, fromPoint);
  d = ED.moverA(d, CTX, toPoint);
  return ED.soltar(d, CTX, toTerminal, toPoint);
}

function terminalOf(d, id, port) {
  const node = d.g.nodos.find((n) => n.id === id);
  const t = terminales(node, CTX).find((k) => k.puerto === port);
  return [{ tipo: "terminal", nodo: id, puerto: port, dir: t.dir }, { x: t.x, y: t.y }];
}

/** A Case (False/True) with a constant wired to its selector; `configure` sets the constant. */
function caseWith(block, configure) {
  let d = ED.inicial();
  d = ED.moverA(ED.coger(d, "case-structure"), CTX, { x: 800, y: 400 });
  d = ED.pulsar(d, CTX, FONDO, { x: 800, y: 400 });
  d = ED.moverA(d, CTX, { x: 1100, y: 650 });
  d = ED.soltar(d, CTX, FONDO, { x: 1100, y: 650 });
  d = place(d, block, { x: 700, y: 520 });
  if (d.edicion) d = ED.confirmar(d, CTX);
  const [constant] = d.seleccion;
  d = { ...d, g: Gr.fijarConfig(d.g, constant, configure) };
  return wire(d, terminalOf(d, constant, "result"), terminalOf(d, selectorOf(d).id, "selector"));
}

const stringCase = () => caseWith("str-const", { value: "abc" });
const enumCase = () => caseWith("enum-const", { type: ENUM, value: 0 });
const menuOf = (d) => ED.abrirMenu(d, "context.case-structure", caseNode(d).id, 0, 0);
const run = (d, row) => ED.orden(menuOf(d), `context.case-structure.${row}`, CTX);
const hiddenRows = (d) => ED.variantes(menuOf(d), CTX).ocultos;
const setFrame = (d, text) => {
  d = ED.editarMarco(d, caseNode(d).id, CTX);
  for (const character of text) d = ED.teclear(d, character);
  return ED.confirmar(d, CTX);
};

test("wiring a string to a Boolean case makes the frames string values", () => {
  const d = stringCase();
  assert.equal(kindOf(d), "string");
  assert.deepEqual(frames(d), [{ valores: ["False"], default: true }, { valores: ["True"] }]);
  assert.deepEqual(labels(d), ['"False", Default', '"True"']);
});

test("wiring an enum to a Boolean case makes the frames items 0 (Default) and 1", () => {
  const d = enumCase();
  assert.deepEqual(frames(d), [{ valores: [0], default: true }, { valores: [1] }]);
  assert.deepEqual(labels(d), ['"Init", Default', '"Heat"']);
});

test("the labels of a string frame are quoted, with ranges and the empty string", () => {
  assert.equal(etiquetaMarco({ valores: ["abc"] }, "string"), '"abc"');
  assert.equal(etiquetaMarco({ valores: [""], default: true }, "string"), '"", Default');
  assert.equal(etiquetaMarco({ valores: [{ min: "a", max: "c" }] }, "string"), '"a".."c"');
  assert.equal(etiquetaMarco({ valores: [] }, "string"), "", "a frame without value has a blank label");
});

test("the labels of an enum frame are the item names; adjacent items are a list", () => {
  assert.equal(etiquetaMarco({ valores: [1] }, ENUM), '"Heat"');
  assert.equal(etiquetaMarco({ valores: [{ min: 0, max: 2 }] }, ENUM), '"Init".."Done"');
  assert.equal(etiquetaMarco({ valores: [{ min: 0, max: 1 }] }, ENUM), '"Init", "Heat"');
  assert.equal(etiquetaMarco({ valores: [{ min: 1, max: 2 }], default: true }, ENUM), '"Heat", "Done", Default');
});

test("a string selector label is read with quotes, bare words and ranges", () => {
  assert.deepEqual(ED.leerMarco('"abc"', "string"), { valores: ["abc"] });
  assert.deepEqual(ED.leerMarco("abc", "string"), { valores: ["abc"] }, "a bare word is that string");
  assert.deepEqual(ED.leerMarco('""', "string"), { valores: [""] });
  assert.deepEqual(ED.leerMarco('"a, b", c, Default', "string"), { valores: ["a, b", "c"], default: true }, "a comma inside quotes is part of the string");
  assert.deepEqual(ED.leerMarco('"a".."c"', "string"), { valores: [{ min: "a", max: "c" }] });
  assert.deepEqual(ED.leerMarco('"a"..', "string"), { valores: [{ min: "a" }] });
  assert.equal(ED.leerMarco('"a', "string"), null);
  let d = setFrame(stringCase(), "zzz");
  assert.deepEqual(labels(d), ['"False", Default', '"zzz"']);
  d = setFrame(d, '"a".."c"');
  assert.equal(labels(d)[1], '"a".."c"');
});

test("an enum selector label is read by item name or by item number", () => {
  assert.deepEqual(ED.leerMarco('"Heat"', ENUM), { valores: [1] });
  assert.deepEqual(ED.leerMarco("Heat", ENUM), { valores: [1] });
  assert.deepEqual(ED.leerMarco("1", ENUM), { valores: [1] }, "an item number");
  assert.deepEqual(ED.leerMarco('"Init".."Done"', ENUM), { valores: [{ min: 0, max: 2 }] });
  assert.deepEqual(ED.leerMarco('"Init".."Heat"', ENUM), { valores: [0, 1] }, "adjacent items become a list");
  assert.equal(ED.leerMarco("Cool", ENUM), null, "a name that is not an item is not understood");
  assert.equal(ED.leerMarco("7", ENUM), null);
  const d = setFrame(enumCase(), "2");
  assert.equal(labels(d)[1], '"Done"', "the number is shown afterwards as the name");
});

test("a new frame in a string case has no value, and an enum one takes the first free item", () => {
  let d = run(stringCase(), "add-case-after");
  assert.deepEqual(labels(d), ['"False", Default', '"True"', ""]);
  assert.deepEqual(frames(d)[2].valores, []);
  d = run(stringCase(), "add-case-before");
  assert.equal(frames(d).filter((m) => !m.valores.length).length, 1);
  const e = run(enumCase(), "add-case-after");
  assert.deepEqual(frames(e).map((m) => m.valores), [[0], [1], [2]], "Done is the first item without a frame");
});

test("a string case has Case Insensitive Match; an enum case does not", () => {
  let d = stringCase();
  assert.ok(!hiddenRows(d).has("context.case-structure.case-insensitive-match"));
  assert.ok(!ED.marcados(menuOf(d)).has("context.case-structure.case-insensitive-match"));
  assert.ok(hiddenRows(d).has("context.case-structure.radix"), "no Radix on a string case");
  d = run(d, "case-insensitive-match");
  assert.equal(caseNode(d).config.caseInsensitive, true);
  assert.ok(ED.marcados(menuOf(d)).has("context.case-structure.case-insensitive-match"));
  assert.match(D.contenido(d, CTX, Gr.tipos(d.g, CAT)), /marca-case-insensitive/, "the A=a marker is drawn");
  d = run(d, "case-insensitive-match");
  assert.ok(!caseNode(d).config.caseInsensitive);
  assert.ok(!D.contenido(d, CTX, Gr.tipos(d.g, CAT)).includes("marca-case-insensitive"));
  assert.ok(hiddenRows(enumCase()).has("context.case-structure.case-insensitive-match"));
});

test("un case de cadena tiene case insensitive match", () => {
  const html = D.menuContextual(INV, menuOf(stringCase()).menu, new Set(), undefined, ED.variantes(menuOf(stringCase()), CTX));
  const order = ["Delete This Case", "Show Case", "Make This The Default Case", "Case Insensitive Match", "Remove and Rewire"];
  const positions = order.map((text) => html.indexOf(text));
  assert.ok(positions.every((p, k) => p >= 0 && (k === 0 || p > positions[k - 1])), `row order: ${positions}`);
  assert.ok(!html.includes("Add Case for Every Value"));
});

test("un case de enum ofrece añadir un marco por cada valor", () => {
  let d = enumCase();
  const row = "context.case-structure.add-case-for-every-value";
  assert.ok(!hiddenRows(d).has(row), "item Done has no frame: the row is shown");
  assert.ok(!hiddenRows(d).has("context.case-structure.remove-empty-cases"));
  d = run(d, "add-case-for-every-value");
  assert.deepEqual(labels(d), ['"Init", Default', '"Heat"', '"Done"']);
  assert.ok(hiddenRows(d).has(row), "every item has a frame: the row is gone");
  assert.ok(hiddenRows(d).has("context.case-structure.remove-empty-cases"));
  // Items covered by a range or a list count as having a frame; the new frames come in item order.
  d = { ...d, g: Gr.fijarMarcos(d.g, CAT, caseNode(d).id, [{ de: 1, valores: [1] }]) };
  d = run(d, "add-case-for-every-value");
  assert.deepEqual(labels(d), ['"Heat"', '"Init"', '"Done"']);
  // A string case never offers it.
  assert.ok(hiddenRows(stringCase()).has(row));
  // Remove Empty Cases is not implemented: greyed with its reason.
  assert.equal(INV.resolver("context.case-structure.remove-empty-cases").estado, "todo");
});
